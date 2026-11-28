"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
} from "@tanstack/react-query";
import {
  publicTargetSchema,
  publicBuildSchema,
  operationSchema,
  gitSha,
  type PublicBuild,
} from "@rodverse/runtime-contracts";
import { z } from "zod";
import { useSandboxRuntime } from "@/browser/RuntimeContext";
import { Button } from "@/components/ui/button";
import type { RuntimeClient } from "./client";
const targetsSchema = z.object({ targets: z.array(publicTargetSchema) });
type Saved = {
  sourceSha: string;
  requestKey?: string;
  buildId?: string;
  operationId?: string;
  rollbackKey?: string;
};
function load(key: string): Saved {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? { sourceSha: "" };
  } catch {
    return { sourceSha: "" };
  }
}
export default function RuntimePanel({ workspaceId }: { workspaceId: string }) {
  const { remoteRuntime, storageScope } = useSandboxRuntime();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  const [lifetime, setLifetime] = useState<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setLifetime(controller);
    });
    return () => controller.abort();
  }, []);
  const scoped = useMemo<RuntimeClient | null>(
    () =>
      remoteRuntime && lifetime
        ? (path, init = {}) =>
            remoteRuntime(path, {
              ...init,
              signal: init.signal
                ? AbortSignal.any([lifetime.signal, init.signal])
                : lifetime.signal,
            })
        : null,
    [remoteRuntime, lifetime],
  );
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    return () =>
      queueMicrotask(() => {
        if (generation.current === current) {
          void client.cancelQueries();
          client.clear();
        }
      });
  }, [client]);
  if (!remoteRuntime)
    return (
      <div className="p-4 text-sm text-muted-foreground">
        <p>O host não disponibilizou acesso ao runtime remoto neste módulo.</p>
        <p>Builds e execução exigem um workspace autenticado e autorizado.</p>
      </div>
    );
  if (!scoped)
    return (
      <p role="status" className="p-3 text-sm">
        Preparando runtime…
      </p>
    );
  return (
    <QueryClientProvider client={client}>
      <RuntimeContent
        client={scoped}
        workspaceId={workspaceId}
        storageKey={`rodsandbox:runtime:v1:${storageScope}:${workspaceId}`}
      />
    </QueryClientProvider>
  );
}
function RuntimeContent({
  client,
  workspaceId,
  storageKey,
}: {
  client: RuntimeClient;
  workspaceId: string;
  storageKey: string;
}) {
  const [saved, setSaved] = useState<Saved>(() => load(storageKey)),
    [targetId, setTarget] = useState(""),
    [error, setError] = useState("");
  function save(next: Saved) {
    setSaved(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Operation still works for this session. */
    }
  }
  const targets = useQuery({
    queryKey: ["runtime-targets", workspaceId],
    queryFn: async ({ signal }) =>
      targetsSchema.parse(
        await client("/targets?" + new URLSearchParams({ workspaceId }), {
          signal,
        }),
      ).targets,
  });
  const selected =
    targets.data?.find((t) => t.id === targetId) ?? targets.data?.[0];
  const build = useQuery({
    queryKey: ["runtime-build", saved.buildId],
    enabled: !!saved.buildId,
    queryFn: async ({ signal }) =>
      publicBuildSchema.parse(
        await client(
          "/builds/" +
            saved.buildId +
            "?" +
            new URLSearchParams({ workspaceId }),
          { signal },
        ),
      ),
    refetchInterval: (query) => {
      const data = query.state.data as PublicBuild | undefined;
      return data &&
        !["failed", "succeeded"].includes(data.status) &&
        Date.now() - Date.parse(data.createdAt) < 45 * 60 * 1000
        ? 5000
        : false;
    },
  });
  const params = new URLSearchParams({
    workspaceId,
    targetId: selected?.id ?? "",
  });
  const status = useQuery({
    queryKey: ["runtime-status", workspaceId, selected?.id],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      client("/status?" + params, { signal }) as Promise<{
        current: { digest: string } | null;
        previous: { digest: string } | null;
        activeOperation: string | null;
        container: { healthy: boolean; state: string };
        port: { port: number; url: string | null };
      }>,
    refetchInterval: 5000,
  });
  const opId = status.data?.activeOperation ?? saved.operationId;
  const operation = useQuery({
    queryKey: ["runtime-operation", workspaceId, selected?.id, opId],
    enabled: !!selected && !!opId,
    queryFn: async ({ signal }) => {
      const data = (await client("/operations/" + opId + "?" + params, {
        signal,
      })) as { operations: unknown[] };
      return operationSchema.parse(data.operations[0]);
    },
    refetchInterval: (query) =>
      query.state.data &&
      !["failed", "succeeded"].includes(query.state.data.phase)
        ? 2000
        : false,
  });
  const logs = useQuery({
    queryKey: ["runtime-logs", workspaceId, selected?.id],
    enabled: !!status.data?.current,
    queryFn: ({ signal }) =>
      client("/logs?" + params, { signal }) as Promise<{ text: string }>,
    refetchInterval: 5000,
  });
  const requestBuild = useMutation({
    mutationFn: async () => {
      if (!selected || !gitSha.safeParse(saved.sourceSha).success)
        throw Error(
          "Informe o SHA completo de um commit publicado na branch aprovada.",
        );
      setError("");
      const key =
        saved.requestKey &&
        !["succeeded", "failed"].includes(build.data?.status ?? "")
          ? saved.requestKey
          : crypto.randomUUID();
      save({ ...saved, requestKey: key });
      const result = publicBuildSchema.parse(
        await client("/builds", {
          method: "POST",
          body: {
            schemaVersion: 1,
            workspaceId,
            targetId: selected.id,
            sourceSha: saved.sourceSha,
            idempotencyKey: key,
          },
        }),
      );
      save({ ...saved, requestKey: key, buildId: result.id });
      return result;
    },
    onError: (err) => setError(String(err)),
  });
  const deploy = useMutation({
    mutationFn: async () => {
      if (
        !selected ||
        !build.data?.result ||
        build.data.status !== "succeeded" ||
        build.data.targetId !== selected.id
      )
        throw Error("Selecione um build concluído e verificado deste serviço.");
      const result = (await client("/deployments", {
        method: "POST",
        body: {
          schemaVersion: 1,
          workspaceId,
          targetId: selected.id,
          buildId: build.data.id,
          idempotencyKey: build.data.id,
        },
      })) as { operation: unknown };
      const op = operationSchema.parse(result.operation);
      save({ ...saved, operationId: op.id });
    },
    onSuccess: () => void status.refetch(),
    onError: (err) => setError(String(err)),
  });
  const rollback = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const key = saved.rollbackKey ?? crypto.randomUUID();
      save({ ...saved, rollbackKey: key });
      const result = (await client("/rollbacks", {
        method: "POST",
        body: {
          schemaVersion: 1,
          workspaceId,
          targetId: selected.id,
          idempotencyKey: key,
        },
      })) as { operation: unknown };
      const op = operationSchema.parse(result.operation);
      save({ ...saved, rollbackKey: undefined, operationId: op.id });
    },
    onSuccess: () => void status.refetch(),
    onError: (err) => setError(String(err)),
  });
  const building =
    !!build.data && !["succeeded", "failed"].includes(build.data.status);
  const busy =
    requestBuild.isPending ||
    deploy.isPending ||
    rollback.isPending ||
    !!status.data?.activeOperation;
  return (
    <section
      className="h-full space-y-3 overflow-auto p-3 text-sm"
      aria-label="Runtime remoto"
    >
      <header>
        <h2 className="font-semibold">Builds & execução</h2>
        <p className="text-xs text-muted-foreground">
          GitHub Actions compila. A VPS recebe apenas imagens por digest.
        </p>
      </header>
      {targets.isPending && (
        <p role="status">Consultando serviços autorizados…</p>
      )}
      {targets.error && (
        <div role="alert">
          <p>{String(targets.error)}</p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void targets.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {targets.data && !targets.data.length && (
        <p>Nenhum serviço está autorizado para este workspace.</p>
      )}
      {selected && (
        <>
          <label className="block">
            Serviço
            <select
              aria-label="Serviço remoto"
              className="mt-1 w-full rounded border bg-background p-2 text-base"
              value={selected.id}
              onChange={(e) => setTarget(e.target.value)}
            >
              {targets.data?.map((target) => (
                <option key={target.id}>{target.id}</option>
              ))}
            </select>
          </label>
          <p className="break-all text-xs text-muted-foreground">
            {selected.repository} · {selected.platforms.join(", ")}
          </p>
          <label className="block">
            Commit publicado
            <input
              className="mt-1 w-full rounded border bg-background p-2 font-mono text-base"
              value={saved.sourceSha}
              disabled={busy || building}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="SHA completo (40 caracteres)"
              onChange={(e) =>
                save({
                  ...saved,
                  sourceSha: e.target.value.trim(),
                  requestKey: undefined,
                })
              }
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Arquivos locais não são enviados. Faça commit antes de solicitar o
            build.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={
                busy || building || !gitSha.safeParse(saved.sourceSha).success
              }
              onClick={() => requestBuild.mutate()}
            >
              Solicitar build
            </Button>
            <Button
              size="sm"
              disabled={
                busy ||
                build.data?.status !== "succeeded" ||
                build.data.targetId !== selected.id
              }
              onClick={() => deploy.mutate()}
            >
              Executar digest
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !status.data?.previous}
              onClick={() => rollback.mutate()}
            >
              Rollback
            </Button>
          </div>
        </>
      )}
      {build.data && (
        <div className="space-y-1 rounded border p-2">
          <p role="status">Build: {build.data.status}</p>
          {build.data.error && <p role="alert">{build.data.error}</p>}
          <a
            className="underline"
            target="_blank"
            rel="noreferrer"
            href={build.data.runUrl ?? build.data.runsUrl}
          >
            Abrir build e logs no GitHub
          </a>
          {build.data.result && (
            <code className="block break-all text-xs">
              {build.data.result.imageRepository}@{build.data.result.digest}
            </code>
          )}
        </div>
      )}
      {status.data && (
        <div className="rounded border p-2">
          <p>
            Serviço:{" "}
            {status.data.container.healthy
              ? "saudável"
              : status.data.container.state}
          </p>
          <p className="text-xs">
            Porta {status.data.port.port} · privada ·{" "}
            {status.data.port.url
              ? "URL disponível"
              : "gateway de preview ainda não configurado"}
          </p>
        </div>
      )}
      {operation.data && (
        <p role="status">
          Execução: {operation.data.phase}
          {operation.data.error ? " · " + operation.data.error : ""}
        </p>
      )}
      {status.error && <p role="alert">{String(status.error)}</p>}
      {build.error && <p role="alert">{String(build.error)}</p>}
      {operation.error && <p role="alert">{String(operation.error)}</p>}
      {error && <p role="alert">{error}</p>}
      {logs.data && (
        <details>
          <summary>Logs do serviço</summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all p-2 text-xs">
            {logs.data.text || "Sem logs."}
          </pre>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Rollback restaura a imagem; os volumes persistentes mantêm seus dados.
      </p>
    </section>
  );
}
