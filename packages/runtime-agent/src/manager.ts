import { mkdir } from "node:fs/promises";
import { lock } from "proper-lockfile";
import PQueue from "p-queue";
import {
  agentPolicySchema,
  assertReleaseForTarget,
  type RuntimeTarget,
  type BuildResult,
  type RuntimeOperation,
} from "@rodverse/runtime-contracts";
import { StateStore } from "./store.js";
import type { DockerDriver } from "./docker.js";
export class AgentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class RuntimeManager {
  readonly targets: RuntimeTarget[];
  readonly store: StateStore;
  private driver: DockerDriver;
  private queue = new PQueue({ concurrency: 1 });
  private accepting = true;
  constructor(policy: unknown, store: StateStore, driver: DockerDriver) {
    this.targets = agentPolicySchema.parse(policy).targets;
    this.store = store;
    this.driver = driver;
  }
  target(workspace: string, id: string) {
    const target = this.targets.find(
      (t) => t.workspaceId === workspace && t.id === id,
    );
    if (!target) throw new AgentError(404, "Runtime target unavailable");
    return target;
  }
  async initialize() {
    await mkdir(this.store.root, { recursive: true, mode: 0o700 });
    for (const target of this.targets) {
      await this.store.initialize(target);
      let state = await this.store.state(target);
      const pending = (await this.store.allOperations(target)).filter(
        (op) => !["succeeded", "failed"].includes(op.phase),
      );
      if (!state.activeOperation && pending.length === 1) {
        const op = pending[0]!;
        if (
          op.phase === "applying" &&
          JSON.stringify(state.current) === JSON.stringify(op.release) &&
          JSON.stringify(state.previous) === JSON.stringify(op.previous)
        ) {
          await this.store.saveOperation(target, {
            ...op,
            phase: "succeeded",
            updatedAt: new Date().toISOString(),
          });
          continue;
        }
        state = { ...state, activeOperation: op.id };
        await this.store.saveState(target, state);
      }
      if (pending.length > 1)
        throw Error("Ambiguous runtime journal; operator review required");
      if (state.activeOperation) {
        const operation = await this.store.operation(
          target,
          state.activeOperation,
        );
        if (!operation) throw Error("Runtime journal is incomplete");
        if (["succeeded", "failed"].includes(operation.phase)) {
          await this.store.saveState(target, {
            ...state,
            activeOperation: null,
          });
        } else this.schedule(target, operation);
      }
    }
  }

  async lease() {
    return lock(this.store.root, {
      realpath: false,
      stale: 120000,
      update: 10000,
      retries: { retries: 15, minTimeout: 1000, maxTimeout: 10000 },
    });
  }
  private schedule(target: RuntimeTarget, op: RuntimeOperation) {
    void this.queue
      .add(() => this.execute(target, op))
      .catch(() => {
        /* Error is persisted by execute; never print process output/secrets. */
      });
  }
  async submit(
    target: RuntimeTarget,
    id: string,
    kind: "deploy" | "rollback",
    release?: BuildResult,
  ) {
    if (!this.accepting) throw new AgentError(503, "Runtime is shutting down");
    const previous = await this.store.operation(target, id);
    if (previous) {
      if (
        previous.kind !== kind ||
        (release &&
          JSON.stringify(previous.release) !== JSON.stringify(release))
      )
        throw new AgentError(409, "Idempotency key already used");
      return previous;
    }
    const unlock = await lock(this.store.directory(target), {
      realpath: false,
      retries: 0,
      stale: 60000,
      update: 10000,
    }).catch(() => {
      throw new AgentError(423, "Runtime target is busy");
    });
    try {
      const concurrent = await this.store.operation(target, id);
      if (concurrent) {
        if (
          concurrent.kind !== kind ||
          (release &&
            JSON.stringify(concurrent.release) !== JSON.stringify(release))
        )
          throw new AgentError(409, "Idempotency key already used");
        return concurrent;
      }
      const state = await this.store.state(target);
      if (state.activeOperation)
        throw new AgentError(
          409,
          "Runtime target already has an active operation",
        );
      const next = kind === "rollback" ? state.previous : release;
      if (!next) throw new AgentError(409, "No approved release available");
      assertReleaseForTarget(next, target);
      const now = new Date().toISOString();
      const op: RuntimeOperation = {
        schemaVersion: 1,
        id,
        idempotencyKey: id,
        workspaceId: target.workspaceId,
        targetId: target.id,
        kind,
        release: next,
        previous: state.current,
        phase: "queued",
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.store.saveOperation(target, op);
      await this.store.saveState(target, { ...state, activeOperation: id });
      this.schedule(target, op);
      return op;
    } finally {
      await unlock();
    }
  }
  private async execute(target: RuntimeTarget, operation: RuntimeOperation) {
    // Run independently of the browser connection. Its abort must not interrupt an accepted deployment.
    const unlock = await lock(this.store.directory(target), {
      realpath: false,
      retries: { retries: 20, minTimeout: 50, maxTimeout: 1000 },
      stale: 60000,
      update: 10000,
    });
    let op = operation;
    const phase = async (
      value: RuntimeOperation["phase"],
      error: string | null = null,
    ) => {
      op = { ...op, phase: value, error, updatedAt: new Date().toISOString() };
      await this.store.saveOperation(target, op);
    };
    try {
      assertReleaseForTarget(op.release, target);
      if (op.phase === "rolling_back") {
        if (op.previous) {
          assertReleaseForTarget(op.previous, target);
          await this.driver.apply(target, op.previous);
        } else await this.driver.stop(target);
        await phase(
          "failed",
          "Interrupted deployment rolled back; persistent data was not restored",
        );
        return;
      }
      await phase("pulling");
      await this.driver.pull(target, op.release);
      await phase("applying");
      try {
        await this.driver.apply(target, op.release);
      } catch {
        await phase("rolling_back");
        try {
          if (op.previous) {
            assertReleaseForTarget(op.previous, target);
            await this.driver.apply(target, op.previous);
          } else await this.driver.stop(target);
          await phase(
            "failed",
            "New image failed health checks; previous service state restored",
          );
        } catch {
          await phase(
            "failed",
            "Image rollback failed; operator intervention required",
          );
        }
        return;
      }
      const state = await this.store.state(target);
      await this.store.saveState(target, {
        ...state,
        current: op.release,
        previous: op.previous,
        activeOperation: null,
      });
      await phase("succeeded");
    } catch {
      await phase("failed", "Runtime operation failed before activation");
    } finally {
      const state = await this.store.state(target);
      if (state.activeOperation === op.id)
        await this.store.saveState(target, { ...state, activeOperation: null });
      await unlock();
    }
  }
  async status(target: RuntimeTarget) {
    const state = await this.store.state(target);
    let container;
    try {
      container = await this.driver.status(target);
    } catch {
      container = {
        running: false,
        healthy: false,
        image: null,
        state: "unavailable",
      };
    }
    return {
      schemaVersion: 1,
      workspaceId: target.workspaceId,
      targetId: target.id,
      current: state.current,
      previous: state.previous,
      activeOperation: state.activeOperation,
      container,
      port: {
        port: target.containerPort,
        hostPort: target.port,
        binding: "127.0.0.1",
        url: null,
      },
      persistentDataRollback: false,
    };
  }
  async logs(target: RuntimeTarget) {
    return this.driver.logs(target);
  }
  async drain() {
    this.accepting = false;
    await this.queue.onIdle();
  }
  async idle() {
    await this.queue.onIdle();
  }
}
