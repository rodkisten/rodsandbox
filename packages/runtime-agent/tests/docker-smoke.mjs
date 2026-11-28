/** Real Docker/GHCR smoke. Creates and removes only an isolated random Compose project. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StateStore, scopeKey } from "../dist/store.js";
import { ComposeDriver } from "../dist/docker.js";
import { RuntimeManager } from "../dist/manager.js";
const repository = "ghcr.io/nginx/nginx-unprivileged";
function digest(tag) {
  const text = execFileSync(
    "docker",
    ["buildx", "imagetools", "inspect", repository + ":" + tag],
    { encoding: "utf8", timeout: 30000 },
  );
  const value = /^Digest:\s+(sha256:[a-f0-9]{64})/m.exec(text)?.[1];
  assert.ok(value, "GHCR digest unavailable");
  return value;
}
const a = digest("stable-alpine"),
  b = digest("mainline-alpine");
assert.notEqual(a, b);
function run(args) {
  try {
    const text = execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return text;
  } catch {
    throw Error("Docker smoke command failed (" + args[0] + ")");
  }
}
const root = await mkdtemp(join(tmpdir(), "rod-runtime-docker-")),
  store = new StateStore(root),
  driver = new ComposeDriver((target) => store.directory(target));
let target = {
  id: "nginx",
  workspaceId: "smoke-" + randomUUID().slice(0, 8),
  repository: "nginx/nginx-unprivileged",
  imageRepository: repository,
  port: 18771,
  containerPort: 8080,
  cpu: 0.25,
  memoryMb: 128,
  pids: 64,
  user: "10001:10001",
  healthCommand: ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/"],
  healthTimeoutSeconds: 15,
  volume: "none",
  platform: "linux/amd64",
};
const makeRelease = (value) => ({
  schemaVersion: 1,
  requestId: randomUUID(),
  workspaceId: target.workspaceId,
  targetId: target.id,
  repository: target.repository,
  sourceSha: "a".repeat(40),
  workflowSha: "b".repeat(40),
  workflowFile: ".github/workflows/runtime-build.yml",
  runId: 1,
  runAttempt: 1,
  imageRepository: repository,
  digest: value,
  platforms: ["linux/amd64"],
});
let manager;
try {
  await driver.pull(target, makeRelease(a));
  await driver.pull(target, makeRelease(b));
  // nginx emits its version to stderr on a successful exit; capture without printing image logs.
  const capture = (value) => {
    run(["image", "inspect", repository + "@" + value]);
    const result = execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--memory",
        "64m",
        "--entrypoint",
        "/bin/sh",
        repository + "@" + value,
        "-c",
        "nginx -v 2>&1",
      ],
      { encoding: "utf8", timeout: 30000 },
    );
    const version = /nginx\/[0-9.]+/.exec(result)?.[0];
    assert.ok(version);
    return version;
  };
  const versionA = capture(a),
    versionB = capture(b);
  assert.notEqual(versionA, versionB);
  target = {
    ...target,
    healthCommand: [
      "/bin/sh",
      "-c",
      `wget -Y off -q -O /dev/null http://127.0.0.1:8080/ && nginx -v 2>&1 | grep -Fq '${versionA}'`,
    ],
  };
  manager = new RuntimeManager(
    { schemaVersion: 1, targets: [target] },
    store,
    driver,
  );
  await manager.initialize();
  const first = await manager.submit(
    target,
    randomUUID(),
    "deploy",
    makeRelease(a),
  );
  await manager.idle();
  const firstResult = await store.operation(target, first.id);
  if (firstResult.phase !== "succeeded") {
    console.log("DIAGNOSTIC LOGS", await driver.logs(target));
    const container = run([
      "compose",
      "--project-name",
      "rod-" + scopeKey(target),
      "--file",
      join(store.directory(target), "compose.yaml"),
      "ps",
      "--all",
      "--quiet",
    ]).trim();
    console.log(
      "HEALTH",
      run(["inspect", "--format", "{{json .State.Health}}", container]),
    );
    console.log(
      "DIAGNOSTIC PS",
      run([
        "compose",
        "--project-name",
        "rod-" + scopeKey(target),
        "--file",
        join(store.directory(target), "compose.yaml"),
        "ps",
        "--all",
        "--format",
        "json",
      ]),
    );
  }
  assert.equal(firstResult.phase, "succeeded", firstResult.error);
  assert.equal((await manager.status(target)).container.healthy, true);
  console.log(
    "PASS real GHCR pull by digest, Compose --no-build, nonroot/read-only resource-limited service, actual HTTP health",
  );
  const candidate = await manager.submit(
    target,
    randomUUID(),
    "deploy",
    makeRelease(b),
  );
  await manager.idle();
  const candidateResult = await store.operation(target, candidate.id);
  assert.equal(candidateResult.phase, "failed");
  const state = await manager.status(target);
  assert.equal(state.current.digest, a);
  assert.equal(state.container.healthy, true);
  assert.equal(state.port.url, null);
  console.log(
    "PASS real candidate health rejection and previous-image rollback; private loopback port is not exposed as a user URL",
  );
  console.log("DIGESTS", a, b);
  console.log("SCOPE", target.workspaceId);
} finally {
  if (manager) await manager.drain();
  try {
    run([
      "compose",
      "--project-name",
      "rod-" + scopeKey(target),
      "--file",
      join(store.directory(target), "compose.yaml"),
      "down",
      "--remove-orphans",
    ]);
  } catch {}
  await rm(root, { recursive: true, force: true });
}
