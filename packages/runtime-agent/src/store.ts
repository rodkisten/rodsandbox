import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  buildResultSchema,
  operationSchema,
  type RuntimeTarget,
  type RuntimeOperation,
} from "@rodverse/runtime-contracts";
const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    current: buildResultSchema.nullable(),
    previous: buildResultSchema.nullable(),
    activeOperation: z.string().uuid().nullable(),
  })
  .strict();
export type ServiceState = z.infer<typeof stateSchema>;
export function scopeKey(target: RuntimeTarget) {
  return createHash("sha256")
    .update(target.workspaceId + ":" + target.id)
    .digest("hex")
    .slice(0, 24);
}
export class StateStore {
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }
  directory(target: RuntimeTarget) {
    return join(this.root, scopeKey(target));
  }
  async initialize(target: RuntimeTarget) {
    await mkdir(join(this.directory(target), "operations"), {
      recursive: true,
      mode: 0o700,
    });
  }
  async atomic(path: string, value: unknown) {
    const temp = path + "." + randomUUID() + ".tmp";
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, path);
  }
  async state(target: RuntimeTarget): Promise<ServiceState> {
    try {
      return stateSchema.parse(
        JSON.parse(
          await readFile(join(this.directory(target), "state.json"), "utf8"),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          schemaVersion: 1,
          current: null,
          previous: null,
          activeOperation: null,
        };
      throw Error("Runtime state is invalid");
    }
  }
  async saveState(target: RuntimeTarget, value: ServiceState) {
    await this.atomic(
      join(this.directory(target), "state.json"),
      stateSchema.parse(value),
    );
  }
  async operation(target: RuntimeTarget, id: string) {
    if (!z.string().uuid().safeParse(id).success) return null;
    try {
      return operationSchema.parse(
        JSON.parse(
          await readFile(
            join(this.directory(target), "operations", id + ".json"),
            "utf8",
          ),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw Error("Runtime operation is invalid");
    }
  }
  async saveOperation(target: RuntimeTarget, op: RuntimeOperation) {
    await this.atomic(
      join(this.directory(target), "operations", op.id + ".json"),
      operationSchema.parse(op),
    );
  }
  async allOperations(target: RuntimeTarget) {
    const files = await readdir(join(this.directory(target), "operations"));
    if (files.length > 10000)
      throw Error("Runtime history retention requires operator review");
    const ops = await Promise.all(
      files
        .filter((v) => /^[a-f0-9-]{36}\.json$/i.test(v))
        .map((v) => this.operation(target, v.slice(0, -5))),
    );
    return ops
      .filter((v): v is RuntimeOperation => !!v)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async operations(target: RuntimeTarget) {
    return (await this.allOperations(target)).slice(0, 30);
  }
}
