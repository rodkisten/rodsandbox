import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { stringify } from "yaml";
import {
  imageReference,
  type BuildResult,
  type RuntimeTarget,
} from "@rodverse/runtime-contracts";
import { scopeKey } from "./store.js";
const execute = promisify(execFile);
export type ContainerStatus = {
  running: boolean;
  healthy: boolean;
  image: string | null;
  state: string;
};
export interface DockerDriver {
  pull(target: RuntimeTarget, release: BuildResult): Promise<void>;
  apply(target: RuntimeTarget, release: BuildResult): Promise<void>;
  stop(target: RuntimeTarget): Promise<void>;
  status(target: RuntimeTarget): Promise<ContainerStatus>;
  logs(target: RuntimeTarget): Promise<string>;
}
export function composeConfiguration(
  target: RuntimeTarget,
  release: BuildResult,
) {
  const name = "rod-" + scopeKey(target),
    volumeName = "rod-data-" + scopeKey(target);
  return {
    name,
    services: {
      app: {
        image: imageReference(release),
        platform: target.platform,
        init: true,
        restart: "unless-stopped",
        user: target.user,
        read_only: true,
        cap_drop: ["ALL"],
        security_opt: ["no-new-privileges:true"],
        cpus: target.cpu,
        mem_limit: target.memoryMb + "m",
        pids_limit: target.pids,
        tmpfs: ["/tmp:rw,noexec,nosuid,size=67108864"],
        ports: [
          {
            target: target.containerPort,
            published: String(target.port),
            host_ip: "127.0.0.1",
            protocol: "tcp",
          },
        ],
        ...(target.volume !== "none"
          ? {
              volumes: [
                {
                  type: "volume",
                  source: "data",
                  target: target.volume === "data" ? "/data" : "/workspace",
                },
              ],
            }
          : {}),
        healthcheck: {
          test: ["CMD", ...target.healthCommand],
          interval: "2s",
          timeout: "2s",
          start_period: "3s",
          retries: 3,
        },
        logging: {
          driver: "json-file",
          options: { "max-size": "5m", "max-file": "2" },
        },
        labels: {
          "club.migos.rod.runtime": "1",
          "club.migos.rod.workspace": target.workspaceId,
          "club.migos.rod.target": target.id,
          "club.migos.rod.source-sha": release.sourceSha,
        },
      },
    },
    ...(target.volume !== "none"
      ? {
          volumes: {
            data: {
              name: volumeName,
              labels: {
                "club.migos.rod.workspace": target.workspaceId,
                "club.migos.rod.target": target.id,
              },
            },
          },
        }
      : {}),
  };
}
export function parseContainerStatus(text: string): ContainerStatus {
  const raw = text.trim();
  if (!raw)
    return { running: false, healthy: false, image: null, state: "missing" };
  const values = raw.startsWith("[")
    ? JSON.parse(raw)
    : raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  if (!Array.isArray(values) || values.length > 1)
    throw Error("Unexpected service inventory");
  const row = values[0];
  if (!row)
    return { running: false, healthy: false, image: null, state: "missing" };
  return {
    running: row.State === "running",
    healthy: row.State === "running" && row.Health === "healthy",
    image: typeof row.Image === "string" ? row.Image : null,
    state: String(row.State ?? "unknown"),
  };
}
export class ComposeDriver implements DockerDriver {
  private directory: (target: RuntimeTarget) => string;
  private run: (args: string[], timeout: number) => Promise<string>;
  constructor(
    directory: (target: RuntimeTarget) => string,
    run?: (args: string[], timeout: number) => Promise<string>,
  ) {
    this.directory = directory;
    if (
      process.env.DOCKER_HOST &&
      !process.env.DOCKER_HOST.startsWith("unix://")
    )
      throw Error("Runtime requires a local Unix Docker socket");
    this.run =
      run ??
      (async (args, timeout) => {
        try {
          const result = await execute("docker", args, {
            timeout,
            maxBuffer: 256 * 1024,
            env: {
              PATH: process.env.PATH,
              HOME: process.env.HOME,
              DOCKER_CONFIG: process.env.DOCKER_CONFIG,
              DOCKER_HOST: process.env.DOCKER_HOST,
            },
            windowsHide: true,
          });
          return result.stdout;
        } catch {
          throw Error("Docker operation failed");
        }
      });
  }
  private args(target: RuntimeTarget) {
    return [
      "compose",
      "--ansi",
      "never",
      "--project-name",
      "rod-" + scopeKey(target),
      "--file",
      join(this.directory(target), "compose.yaml"),
    ];
  }
  async pull(_target: RuntimeTarget, release: BuildResult) {
    await this.run(["pull", imageReference(release)], 180000);
  }
  async apply(target: RuntimeTarget, release: BuildResult) {
    const file = join(this.directory(target), "compose.yaml");
    await writeFile(
      file + ".tmp",
      stringify(composeConfiguration(target, release)),
      { mode: 0o600 },
    );
    await rename(file + ".tmp", file);
    await this.run(
      [
        ...this.args(target),
        "up",
        "--detach",
        "--no-build",
        "--pull",
        "never",
        "--force-recreate",
        "--wait",
        "--wait-timeout",
        String(target.healthTimeoutSeconds),
      ],
      (target.healthTimeoutSeconds + 15) * 1000,
    );
    const status = await this.status(target);
    if (!status.healthy || status.image !== imageReference(release))
      throw Error("Service health or image digest mismatch");
  }
  async stop(target: RuntimeTarget) {
    await this.run([...this.args(target), "stop", "--timeout", "10"], 15000);
  }
  async status(target: RuntimeTarget) {
    try {
      return parseContainerStatus(
        await this.run(
          [...this.args(target), "ps", "--all", "--format", "json"],
          10000,
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          running: false,
          healthy: false,
          image: null,
          state: "missing",
        };
      throw error;
    }
  }
  async logs(target: RuntimeTarget) {
    return (
      await this.run(
        [
          ...this.args(target),
          "logs",
          "--no-color",
          "--no-log-prefix",
          "--tail",
          "100",
          "app",
        ],
        10000,
      )
    ).slice(-65536);
  }
}
