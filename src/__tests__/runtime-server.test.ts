// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { runtimeRoute, type RuntimeEnvironment } from "../runtime/server";
const id = "12345678-1234-4234-8234-123456789abc",
  token = "control-fixture-".repeat(4),
  agentToken = "agent-fixture-".repeat(4),
  actor = "owner@example.test";
const target = {
  id: "probe",
  workspaceId: "workspace",
  repository: "rodkisten/rodsandbox",
  imageRepository: "ghcr.io/rodkisten/rodsandbox/probe",
  platforms: ["linux/amd64"],
};
const result = {
  schemaVersion: 1,
  requestId: id,
  workspaceId: "workspace",
  targetId: "probe",
  repository: target.repository,
  sourceSha: "a".repeat(40),
  workflowSha: "b".repeat(40),
  workflowFile: ".github/workflows/runtime-build.yml",
  runId: 42,
  runAttempt: 1,
  imageRepository: target.imageRepository,
  digest: "sha256:" + "c".repeat(64),
  platforms: ["linux/amd64"],
};
const build = {
  schemaVersion: 1,
  id,
  workspaceId: "workspace",
  targetId: "probe",
  sourceSha: result.sourceSha,
  status: "succeeded",
  runId: 42,
  runUrl: "https://github.com/rodkisten/rodsandbox/actions/runs/42",
  runsUrl:
    "https://github.com/rodkisten/rodsandbox/actions/workflows/runtime-build.yml",
  error: null,
  result,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
function setup() {
  const broker = vi.fn(async (request: Request) => {
    expect(request.headers.get("x-rod-subject")).toBe(actor);
    expect(request.headers.get("cookie")).toBeNull();
    expect(request.headers.get("authorization")).toBe("Bearer " + token);
    return Response.json(
      new URL(request.url).pathname.endsWith("/targets")
        ? { targets: [target] }
        : build,
    );
  });
  const env: RuntimeEnvironment = {
    RUNTIME_BROKER: { fetch: broker },
    RUNTIME_BROKER_TOKEN: token,
    RUNTIME_CONTROL_TOKEN: token,
    RUNTIME_AGENT_URL: "https://runtime-kvm.migos.club",
    RUNTIME_AGENT_TOKEN: agentToken,
    RUNTIME_AGENT_ACCESS_CLIENT_ID: "client-id",
    RUNTIME_AGENT_ACCESS_CLIENT_SECRET: "client-fixture-secret",
  };
  return { env, broker };
}
const request = (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("https://sandbox.migos.club/api/runtime" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: "Bearer " + token,
      "x-rod-subject": actor,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());
describe("runtime server authorization boundary", () => {
  it("keeps preview adapters disconnected from production services", async () => {
    const { env, broker } = setup();
    const response = await runtimeRoute(
      request("/targets?workspaceId=workspace"),
      { ...env, RUNTIME_PREVIEW: "1" },
    );
    expect(response.status).toBe(503);
    expect(broker).not.toHaveBeenCalled();
  });
  it("does not trust local mock auth, forged subject or browser use of the machine credential", async () => {
    const { env, broker } = setup();
    const response = await runtimeRoute(
      new Request(
        "https://sandbox.migos.club/api/runtime/targets?workspaceId=workspace",
        {
          headers: {
            "x-rod-subject": actor,
            cookie: "sandbox.auth.session=mock",
          },
        },
      ),
      env,
    );
    expect(response.status).toBe(401);
    expect(broker).not.toHaveBeenCalled();
    expect(
      (
        await runtimeRoute(
          request("/targets?workspaceId=workspace", undefined, {
            origin: "https://sandbox.migos.club",
          }),
          env,
        )
      ).status,
    ).toBe(403);
  });
  it("deploys only a verified build result and retains credentials on the server", async () => {
    const { env } = setup();
    const remote = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer " + agentToken);
      expect(headers.get("cf-access-client-secret")).toBe(
        "client-fixture-secret",
      );
      expect(JSON.parse(init?.body as string).release.digest).toBe(
        result.digest,
      );
      return Response.json({ operation: { id } }, { status: 202 });
    });
    vi.stubGlobal("fetch", remote);
    const response = await runtimeRoute(
      request("/deployments", {
        schemaVersion: 1,
        workspaceId: "workspace",
        targetId: "probe",
        buildId: id,
        idempotencyKey: id,
      }),
      env,
    );
    expect(response.status).toBe(202);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await response.json())).not.toContain("fixture");
  });
  it("rejects browser-supplied digest/credentials and cross-workspace substitution before agent calls", async () => {
    const { env } = setup();
    const remote = vi.fn();
    vi.stubGlobal("fetch", remote);
    const body = {
      schemaVersion: 1,
      workspaceId: "other",
      targetId: "probe",
      buildId: id,
      idempotencyKey: id,
    };
    expect(
      (await runtimeRoute(request("/deployments", body), env)).status,
    ).toBe(409);
    expect(
      (
        await runtimeRoute(
          request("/deployments", {
            ...body,
            workspaceId: "workspace",
            release: result,
          }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(remote).not.toHaveBeenCalled();
  });
  it("never calls an arbitrary management origin", async () => {
    const { env } = setup();
    const remote = vi.fn();
    vi.stubGlobal("fetch", remote);
    const response = await runtimeRoute(
      request("/status?workspaceId=workspace&targetId=probe"),
      { ...env, RUNTIME_AGENT_URL: "https://attacker.invalid" },
    );
    expect(response.status).toBe(503);
    expect(remote).not.toHaveBeenCalled();
  });
});

it("validates standalone Access signatures, audience and issuer instead of local identity", async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "runtime-fixture",
    alg: "RS256",
    use: "sig",
  };
  const network = vi.fn(async (url: unknown) => {
    expect(String(url)).toBe(
      "https://runtime-fixture.cloudflareaccess.com/cdn-cgi/access/certs",
    );
    return Response.json({ keys: [jwk] });
  });
  vi.stubGlobal("fetch", network);
  const { env, broker } = setup();
  const configured = {
    ...env,
    RUNTIME_ACCESS_TEAM_DOMAIN: "runtime-fixture.cloudflareaccess.com",
    RUNTIME_ACCESS_AUD: "runtime-audience",
  };
  const sign = (aud: string) =>
    new SignJWT({ email: actor })
      .setProtectedHeader({ alg: "RS256", kid: "runtime-fixture" })
      .setIssuer("https://runtime-fixture.cloudflareaccess.com")
      .setAudience(aud)
      .setSubject("fixture-subject")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
  const send = async (aud: string) =>
    runtimeRoute(
      new Request(
        "https://sandbox.migos.club/api/runtime/targets?workspaceId=workspace",
        {
          headers: {
            "cf-access-jwt-assertion": await sign(aud),
            "x-rod-subject": "forged",
          },
        },
      ),
      configured,
    );
  expect((await send("wrong-audience")).status).toBe(401);
  expect(broker).not.toHaveBeenCalled();
  expect((await send("runtime-audience")).status).toBe(200);
  expect(broker).toHaveBeenCalledOnce();
});
