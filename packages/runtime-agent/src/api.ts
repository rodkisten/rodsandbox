import { createHash, timingSafeEqual } from "node:crypto";
import {
  deployRequestSchema,
  rollbackRequestSchema,
  workspaceId,
  identifier,
} from "@rodverse/runtime-contracts";
import { ZodError } from "zod";
import { AgentError, type RuntimeManager } from "./manager.js";
export function redact(text: string, secrets: string[]) {
  let value = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  for (const secret of secrets.filter((v) => v.length >= 8))
    value = value.split(secret).join("[REDACTED]");
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
    .replace(
      /((?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}
async function jsonBody(request: Request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) {
        await reader.cancel();
        throw new AgentError(413, "Runtime request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function agentHandler(manager: RuntimeManager, secret: string) {
  if (secret.length < 32)
    throw Error("Runtime agent credential must contain at least 32 characters");
  const expected = createHash("sha256")
    .update("Bearer " + secret)
    .digest();
  return async (request: Request) => {
    const headers = {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/v1/health")
        return Response.json(
          {
            status: "ok",
            service: "rodsandbox-runtime-agent",
            schemaVersion: 1,
          },
          { headers },
        );
      const supplied = createHash("sha256")
        .update(request.headers.get("authorization") ?? "")
        .digest();
      if (request.headers.has("origin") || !timingSafeEqual(expected, supplied))
        throw new AgentError(401, "Unauthorized runtime client");
      const match =
        /^\/v1\/workspaces\/([^/]+)\/targets\/([^/]+)(?:\/(deploy|rollback|logs|operations)(?:\/([a-f0-9-]{36}))?)?$/.exec(
          path,
        );
      if (!match) throw new AgentError(404, "Runtime route unavailable");
      const workspace = workspaceId.parse(decodeURIComponent(match[1]!)),
        id = identifier.parse(decodeURIComponent(match[2]!)),
        target = manager.target(workspace, id),
        action = match[3];
      if (request.method === "GET" && !action)
        return Response.json(await manager.status(target), { headers });
      if (request.method === "GET" && action === "logs")
        return Response.json(
          { text: redact(await manager.logs(target), [secret]) },
          { headers },
        );
      if (request.method === "GET" && action === "operations") {
        const value = match[4]
          ? await manager.store.operation(target, match[4])
          : await manager.store.operations(target);
        if (!value) throw new AgentError(404, "Runtime operation unavailable");
        return Response.json(
          { operations: Array.isArray(value) ? value : [value] },
          { headers },
        );
      }
      if (request.method === "POST" && action === "deploy") {
        const body = deployRequestSchema.parse(await jsonBody(request));
        if (
          body.release.workspaceId !== workspace ||
          body.release.targetId !== id
        )
          throw new AgentError(403, "Release target mismatch");
        return Response.json(
          {
            operation: await manager.submit(
              target,
              body.idempotencyKey,
              "deploy",
              body.release,
            ),
            persistentDataRollback: false,
          },
          { status: 202, headers },
        );
      }
      if (request.method === "POST" && action === "rollback") {
        const body = rollbackRequestSchema.parse(await jsonBody(request));
        return Response.json(
          {
            operation: await manager.submit(
              target,
              body.idempotencyKey,
              "rollback",
            ),
            persistentDataRollback: false,
          },
          { status: 202, headers },
        );
      }
      throw new AgentError(405, "Runtime method unavailable");
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof AgentError
              ? error.message
              : error instanceof ZodError || error instanceof SyntaxError
                ? "Invalid runtime request"
                : "Runtime operation failed",
        },
        {
          status:
            error instanceof AgentError
              ? error.status
              : error instanceof ZodError || error instanceof SyntaxError
                ? 400
                : 500,
          headers,
        },
      );
    }
  };
}
