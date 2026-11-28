import { readFile } from "node:fs/promises";
import { Elysia } from "elysia";
import { node } from "@elysia/node";
import { StateStore } from "./store.js";
import { ComposeDriver } from "./docker.js";
import { RuntimeManager } from "./manager.js";
import { agentHandler } from "./api.js";
const policyFile = process.env.RUNTIME_POLICY_FILE;
if (!policyFile) throw Error("RUNTIME_POLICY_FILE required");
const secret = process.env.RUNTIME_AGENT_TOKEN_FILE
  ? (await readFile(process.env.RUNTIME_AGENT_TOKEN_FILE, "utf8")).trim()
  : (process.env.RUNTIME_AGENT_TOKEN ?? "");
if (secret.length < 32)
  throw Error("Runtime agent credential is not configured");
const store = new StateStore(
  process.env.RUNTIME_STATE_DIR ?? "/var/lib/rodsandbox-runtime",
);
const manager = new RuntimeManager(
  JSON.parse(await readFile(policyFile, "utf8")),
  store,
  new ComposeDriver((t) => store.directory(t)),
);
await (
  await import("node:fs/promises")
).mkdir(store.root, { recursive: true, mode: 0o700 });
const release = await manager.lease();
await manager.initialize();
const handler = agentHandler(manager, secret),
  host = process.env.RUNTIME_BIND ?? "127.0.0.1",
  port = Number(process.env.RUNTIME_PORT ?? 9183);
if (
  !["127.0.0.1", "0.0.0.0", "::1"].includes(host) ||
  !Number.isSafeInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw Error("Invalid runtime listener");
const app = new Elysia({ adapter: node(), aot: false })
  .all("*", ({ request }) => handler(request), { parse: "none" })
  .listen({ hostname: host, port });
console.log(
  JSON.stringify({
    service: "rodsandbox-runtime-agent",
    host,
    port,
    schemaVersion: 1,
  }),
);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      await app.stop();
      await manager.drain();
      await release();
      process.exit(0);
    })();
  });
