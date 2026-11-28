import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, chmod, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { StateStore } from "../dist/store.js";
import { RuntimeManager } from "../dist/manager.js";
import {
  composeConfiguration,
  ComposeDriver,
  parseContainerStatus,
} from "../dist/docker.js";
import { agentHandler, redact } from "../dist/api.js";
const target = {
  id: "app",
  workspaceId: "workspace",
  repository: "rodkisten/rodsandbox",
  imageRepository: "ghcr.io/rodkisten/rodsandbox/app",
  port: 18080,
  containerPort: 3000,
  cpu: 0.25,
  memoryMb: 128,
  pids: 64,
  user: "10001:10001",
  healthCommand: ["node", "health.mjs"],
  healthTimeoutSeconds: 10,
  volume: "data",
  platform: "linux/amd64",
};
const makeRelease = (digit = "a") => ({
  schemaVersion: 1,
  requestId: randomUUID(),
  workspaceId: target.workspaceId,
  targetId: target.id,
  repository: target.repository,
  sourceSha: "e".repeat(40),
  workflowSha: "f".repeat(40),
  workflowFile: ".github/workflows/runtime-build.yml",
  runId: 42,
  runAttempt: 1,
  imageRepository: target.imageRepository,
  digest: "sha256:" + digit.repeat(64),
  platforms: ["linux/amd64"],
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "rod-runtime-"));
  const store = new StateStore(dir),
    calls = [];
  let failDigest = "",
    current = null;
  const driver = {
    async pull(t, r) {
      calls.push(["pull", r.digest]);
    },
    async apply(t, r) {
      calls.push(["apply", r.digest]);
      if (r.digest === failDigest) throw Error("health failed");
      current = r;
    },
    async stop() {
      calls.push(["stop"]);
      current = null;
    },
    async status() {
      return {
        running: !!current,
        healthy: !!current,
        image: current ? current.imageRepository + "@" + current.digest : null,
        state: current ? "running" : "missing",
      };
    },
    async logs() {
      return "Bearer server-token\npassword=do-not-show";
    },
  };
  const manager = new RuntimeManager(
    { schemaVersion: 1, targets: [target] },
    store,
    driver,
  );
  await manager.initialize();
  return {
    manager,
    store,
    calls,
    driver,
    fail: (r) => (failDigest = r.digest),
    close: async () => {
      await manager.drain();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test("Compose accepts only a digest, loopback ports and bounded nonprivileged resources", async () => {
  const release = makeRelease(),
    config = composeConfiguration(target, release),
    app = config.services.app;
  assert.equal(app.image, release.imageRepository + "@" + release.digest);
  assert.equal(app.read_only, true);
  assert.deepEqual(app.cap_drop, ["ALL"]);
  assert.equal(app.ports[0].host_ip, "127.0.0.1");
  assert.equal(app.build, undefined);
  assert.equal(app.privileged, undefined);
  assert.equal(app.mem_limit, "128m");
  assert.equal(app.volumes[0].type, "volume");
  assert.ok(!JSON.stringify(config).includes("docker.sock"));
  const dir = await mkdtemp(join(tmpdir(), "rod-compose-")),
    commands = [];
  try {
    const driver = new ComposeDriver(
      () => dir,
      async (args) => {
        commands.push(args);
        return args.includes("ps")
          ? JSON.stringify([
              { State: "running", Health: "healthy", Image: app.image },
            ])
          : "";
      },
    );
    await driver.pull(target, release);
    await driver.apply(target, release);
    assert.ok(
      commands.some(
        (v) =>
          v.includes("--no-build") &&
          v.includes("--pull") &&
          v.includes("never"),
      ),
    );
    assert.ok(!commands.some((v) => v.includes("build")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("accepted deploy is durable/idempotent, independent from browser connection and preserves the named volume", async () => {
  const f = await fixture();
  try {
    const release = makeRelease(),
      id = randomUUID();
    const first = await f.manager.submit(target, id, "deploy", release);
    await f.manager.idle();
    const again = await f.manager.submit(target, id, "deploy", release);
    assert.equal(first.id, again.id);
    assert.equal(again.phase, "succeeded");
    assert.equal(f.calls.filter((c) => c[0] === "apply").length, 1);
    await assert.rejects(
      () =>
        f.manager.submit(target, id, "deploy", {
          ...release,
          digest: "sha256:" + "b".repeat(64),
        }),
      (e) => e.status === 409,
    );
    const state = await f.store.state(target);
    assert.equal(state.current.digest, release.digest);
    assert.equal(state.activeOperation, null);
    assert.equal(
      (await f.manager.status(target)).persistentDataRollback,
      false,
    );
  } finally {
    await f.close();
  }
});
test("failed health restores previous image and records a failed operation without rolling back persistent data", async () => {
  const f = await fixture();
  try {
    const stable = makeRelease("a"),
      broken = makeRelease("b");
    await f.manager.submit(target, randomUUID(), "deploy", stable);
    await f.manager.idle();
    f.fail(broken);
    const op = await f.manager.submit(target, randomUUID(), "deploy", broken);
    await f.manager.idle();
    assert.equal((await f.store.operation(target, op.id)).phase, "failed");
    assert.equal((await f.store.state(target)).current.digest, stable.digest);
    assert.deepEqual(f.calls.slice(-2), [
      ["apply", broken.digest],
      ["apply", stable.digest],
    ]);
  } finally {
    await f.close();
  }
});
test("explicit rollback reselects the retained image and supports forward restore", async () => {
  const f = await fixture();
  try {
    const a = makeRelease("a"),
      b = makeRelease("b");
    await f.manager.submit(target, randomUUID(), "deploy", a);
    await f.manager.idle();
    await f.manager.submit(target, randomUUID(), "deploy", b);
    await f.manager.idle();
    await f.manager.submit(target, randomUUID(), "rollback");
    await f.manager.idle();
    assert.equal((await f.store.state(target)).current.digest, a.digest);
    await f.manager.submit(target, randomUUID(), "rollback");
    await f.manager.idle();
    assert.equal((await f.store.state(target)).current.digest, b.digest);
  } finally {
    await f.close();
  }
});
test("startup recovers a durable queued operation even before its state pointer was written", async () => {
  const f = await fixture();
  try {
    const release = makeRelease(),
      now = new Date().toISOString(),
      id = randomUUID();
    await f.store.saveOperation(target, {
      schemaVersion: 1,
      id,
      idempotencyKey: id,
      workspaceId: target.workspaceId,
      targetId: target.id,
      kind: "deploy",
      release,
      previous: null,
      phase: "queued",
      error: null,
      createdAt: now,
      updatedAt: now,
    });
    const restarted = new RuntimeManager(
      { schemaVersion: 1, targets: [target] },
      f.store,
      f.driver,
    );
    await restarted.initialize();
    await restarted.idle();
    assert.equal((await f.store.operation(target, id)).phase, "succeeded");
    assert.equal((await f.store.state(target)).current.digest, release.digest);
  } finally {
    await f.close();
  }
});
test("API rejects browser origins, missing credentials and cross-workspace releases; redacts logs", async () => {
  const f = await fixture();
  try {
    const secret = "runtime-ci-only-".repeat(4),
      handler = agentHandler(f.manager, secret),
      url = "http://127.0.0.1/v1/workspaces/workspace/targets/app";
    const auth = { authorization: "Bearer " + secret };
    assert.equal((await handler(new Request(url))).status, 401);
    assert.equal(
      (
        await handler(
          new Request(url, {
            headers: { ...auth, origin: "https://manage.migos.club" },
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await handler(
          new Request(url.replace("workspace/targets", "other/targets"), {
            headers: auth,
          }),
        )
      ).status,
      404,
    );
    const request = {
      schemaVersion: 1,
      idempotencyKey: randomUUID(),
      release: { ...makeRelease(), workspaceId: "other" },
    };
    assert.equal(
      (
        await handler(
          new Request(url + "/deploy", {
            method: "POST",
            headers: { ...auth, "content-type": "application/json" },
            body: JSON.stringify(request),
          }),
        )
      ).status,
      403,
    );
    const logs = await (
      await handler(new Request(url + "/logs", { headers: auth }))
    ).json();
    assert.ok(!logs.text.includes("do-not-show"));
    assert.ok(!logs.text.includes("server-token"));
    assert.equal(redact("token=" + secret, [secret]), "token=[REDACTED]");
  } finally {
    await f.close();
  }
});
test("Compose inventory supports JSON arrays and NDJSON and rejects multiple services", () => {
  const row = {
    State: "running",
    Health: "healthy",
    Image: "ghcr.io/example/app@sha256:" + "a".repeat(64),
  };
  assert.equal(parseContainerStatus(JSON.stringify(row)).healthy, true);
  assert.equal(parseContainerStatus(JSON.stringify([row])).healthy, true);
  assert.equal(parseContainerStatus("").state, "missing");
  assert.throws(() => parseContainerStatus(JSON.stringify([row, row])));
});

test("process lease stays inside the writable state volume with a read-only parent", async () => {
  const parent = await mkdtemp(join(tmpdir(), "rod-readonly-parent-"));
  const root = join(parent, "state");
  await mkdir(root, { mode: 0o700 });
  await chmod(parent, 0o500);
  try {
    const manager = new RuntimeManager(
      { schemaVersion: 1, targets: [] },
      new StateStore(root),
      {},
    );
    const release = await manager.lease();
    try {
      assert.ok((await stat(join(root, ".agent.lock"))).isDirectory());
    } finally {
      await release();
    }
  } finally {
    await chmod(parent, 0o700);
    await rm(parent, { recursive: true, force: true });
  }
});
