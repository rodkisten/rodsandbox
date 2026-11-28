import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  buildRequestSchema,
  publicBuildSchema,
  publicTargetSchema,
  workspaceId,
  identifier,
  rollbackRequestSchema,
} from "@rodverse/runtime-contracts";
import { z, ZodError } from "zod";
export interface RuntimeEnvironment {
  RUNTIME_BROKER?: { fetch(request: Request): Promise<Response> };
  RUNTIME_BROKER_TOKEN?: string;
  RUNTIME_CONTROL_TOKEN?: string;
  RUNTIME_AGENT_URL?: string;
  RUNTIME_AGENT_TOKEN?: string;
  RUNTIME_AGENT_ACCESS_CLIENT_ID?: string;
  RUNTIME_AGENT_ACCESS_CLIENT_SECRET?: string;
  RUNTIME_ACCESS_TEAM_DOMAIN?: string;
  RUNTIME_ACCESS_AUD?: string;
  RUNTIME_PREVIEW?: string;
}
class RuntimeHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const issuers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
async function equal(a: string, b: string) {
  const values = await Promise.all(
    [a, b].map((v) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  );
  let difference = 0;
  const x = new Uint8Array(values[0]),
    y = new Uint8Array(values[1]);
  for (let i = 0; i < 32; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
async function identity(request: Request, env: RuntimeEnvironment) {
  if (
    env.RUNTIME_CONTROL_TOKEN &&
    env.RUNTIME_CONTROL_TOKEN.length >= 32 &&
    (await equal(
      request.headers.get("authorization") ?? "",
      "Bearer " + env.RUNTIME_CONTROL_TOKEN,
    ))
  ) {
    if (request.headers.has("origin"))
      throw new RuntimeHttpError(
        403,
        "Machine adapter cannot have a browser Origin",
      );
    const actor = request.headers.get("x-rod-subject");
    if (!actor || actor.length > 255 || /[\x00-\x1f\x7f]/.test(actor))
      throw new RuntimeHttpError(401, "Runtime subject unavailable");
    return actor;
  }
  const url = new URL(request.url);
  if (request.method !== "GET" && request.headers.get("origin") !== url.origin)
    throw new RuntimeHttpError(403, "Runtime origin denied");
  const team = env.RUNTIME_ACCESS_TEAM_DOMAIN?.replace(/^https:\/\//, "");
  if (
    !team ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) ||
    !env.RUNTIME_ACCESS_AUD
  )
    throw new RuntimeHttpError(
      401,
      "Open an authenticated Manage workspace to use the remote runtime",
    );
  const token =
    request.headers.get("cf-access-jwt-assertion") ??
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("CF_Authorization="))
      ?.slice(17);
  if (!token || token.length > 8192)
    throw new RuntimeHttpError(401, "Runtime identity required");
  const issuer = "https://" + team;
  let keys = issuers.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"), {
      timeoutDuration: 5000,
    });
    issuers.set(issuer, keys);
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: env.RUNTIME_ACCESS_AUD,
      algorithms: ["RS256"],
    });
    if (typeof payload.email !== "string") throw Error();
    return z.string().email().parse(payload.email).toLowerCase();
  } catch {
    throw new RuntimeHttpError(401, "Runtime identity could not be verified");
  }
}
async function read(request: Request) {
  const value = await request.text();
  if (new TextEncoder().encode(value).length > 16384)
    throw new RuntimeHttpError(413, "Runtime request too large");
  return JSON.parse(value);
}
const deploymentSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspaceId,
    targetId: identifier,
    buildId: z.string().uuid(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export async function runtimeRoute(
  request: Request,
  env: RuntimeEnvironment,
): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  try {
    if (
      env.RUNTIME_PREVIEW === "1" ||
      !env.RUNTIME_BROKER ||
      !env.RUNTIME_BROKER_TOKEN ||
      env.RUNTIME_BROKER_TOKEN.length < 32
    )
      throw new RuntimeHttpError(
        503,
        "Remote runtime is not configured for this deployment",
      );
    const actor = await identity(request, env),
      url = new URL(request.url),
      path = url.pathname.slice("/api/runtime".length);
    const broker = async (route: string, method = "GET", body?: unknown) => {
      const response = await env.RUNTIME_BROKER!.fetch(
        new Request("https://orb.internal/v1/runtime" + route, {
          method,
          headers: {
            Authorization: "Bearer " + env.RUNTIME_BROKER_TOKEN,
            "x-rod-subject": actor,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        }),
      );
      const value = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new RuntimeHttpError(
          response.status,
          typeof value.error === "string"
            ? value.error
            : "Runtime broker unavailable",
        );
      return value;
    };
    const targets = async (workspace: string) => {
      const data = (await broker(
        "/targets?workspaceId=" + encodeURIComponent(workspace),
      )) as unknown as { targets: unknown[] };
      return data.targets.map((v) => publicTargetSchema.parse(v));
    };
    const grant = async (workspace: string, target: string) => {
      if (!(await targets(workspace)).some((t) => t.id === target))
        throw new RuntimeHttpError(404, "Runtime target unavailable");
    };
    const agent = async (
      workspace: string,
      target: string,
      operation: string,
      method = "GET",
      body?: unknown,
    ) => {
      await grant(workspace, target);
      const origin = env.RUNTIME_AGENT_URL;
      if (
        origin !== "https://runtime-kvm.migos.club" ||
        !env.RUNTIME_AGENT_TOKEN ||
        env.RUNTIME_AGENT_TOKEN.length < 32 ||
        !env.RUNTIME_AGENT_ACCESS_CLIENT_ID ||
        !env.RUNTIME_AGENT_ACCESS_CLIENT_SECRET
      )
        throw new RuntimeHttpError(503, "Private VPS agent is not configured");
      const response = await fetch(
        origin +
          "/v1/workspaces/" +
          encodeURIComponent(workspace) +
          "/targets/" +
          encodeURIComponent(target) +
          operation,
        {
          method,
          headers: {
            Authorization: "Bearer " + env.RUNTIME_AGENT_TOKEN,
            "CF-Access-Client-Id": env.RUNTIME_AGENT_ACCESS_CLIENT_ID,
            "CF-Access-Client-Secret": env.RUNTIME_AGENT_ACCESS_CLIENT_SECRET,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        },
      );
      const value = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new RuntimeHttpError(
          response.status,
          value.error ?? "Private runtime unavailable",
        );
      return value;
    };
    if (request.method === "GET" && path === "/targets") {
      const workspace = workspaceId.parse(url.searchParams.get("workspaceId"));
      return Response.json(
        { schemaVersion: 1, targets: await targets(workspace) },
        { headers },
      );
    }
    if (request.method === "POST" && path === "/builds") {
      const body = buildRequestSchema.parse(await read(request));
      return Response.json(
        publicBuildSchema.parse(await broker("/builds", "POST", body)),
        { status: 202, headers },
      );
    }
    const build = /^\/builds\/([a-f0-9-]{36})$/.exec(path);
    if (request.method === "GET" && build) {
      const scope = workspaceId.parse(url.searchParams.get("workspaceId"));
      const result = publicBuildSchema.parse(
        await broker("/builds/" + build[1]),
      );
      if (result.workspaceId !== scope)
        throw new RuntimeHttpError(404, "Build unavailable");
      return Response.json(result, { headers });
    }
    if (request.method === "POST" && path === "/deployments") {
      const body = deploymentSchema.parse(await read(request)),
        build = publicBuildSchema.parse(
          await broker("/builds/" + body.buildId),
        );
      if (
        build.workspaceId !== body.workspaceId ||
        build.targetId !== body.targetId ||
        build.status !== "succeeded" ||
        !build.result
      )
        throw new RuntimeHttpError(
          409,
          "A verified successful build is required before deployment",
        );
      return Response.json(
        await agent(body.workspaceId, body.targetId, "/deploy", "POST", {
          schemaVersion: 1,
          idempotencyKey: body.idempotencyKey,
          release: build.result,
        }),
        { status: 202, headers },
      );
    }
    if (request.method === "POST" && path === "/rollbacks") {
      const body = z
        .object({
          schemaVersion: z.literal(1),
          workspaceId,
          targetId: identifier,
          idempotencyKey: z.string().uuid(),
        })
        .strict()
        .parse(await read(request));
      return Response.json(
        await agent(
          body.workspaceId,
          body.targetId,
          "/rollback",
          "POST",
          rollbackRequestSchema.parse({
            schemaVersion: 1,
            idempotencyKey: body.idempotencyKey,
          }),
        ),
        { status: 202, headers },
      );
    }
    const operation = /^\/operations\/([a-f0-9-]{36})$/.exec(path);
    if (
      request.method === "GET" &&
      (path === "/status" || path === "/logs" || operation)
    ) {
      const workspace = workspaceId.parse(url.searchParams.get("workspaceId")),
        target = identifier.parse(url.searchParams.get("targetId"));
      return Response.json(
        await agent(
          workspace,
          target,
          operation
            ? "/operations/" + operation[1]
            : path === "/status"
              ? ""
              : "/logs",
        ),
        { headers },
      );
    }
    throw new RuntimeHttpError(404, "Runtime route unavailable");
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof RuntimeHttpError
            ? error.message
            : error instanceof ZodError || error instanceof SyntaxError
              ? "Invalid runtime request"
              : "Remote runtime request failed",
      },
      {
        status:
          error instanceof RuntimeHttpError
            ? error.status
            : error instanceof ZodError || error instanceof SyntaxError
              ? 400
              : 502,
        headers,
      },
    );
  }
}
