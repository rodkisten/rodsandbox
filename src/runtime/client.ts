export type RuntimeClient = (
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
) => Promise<unknown>;
export const standaloneRuntimeClient: RuntimeClient = async (
  path,
  init = {},
) => {
  const response = await fetch("/api/runtime" + path, {
    method: init.method ?? "GET",
    headers:
      init.body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    redirect: "error",
    signal: init.signal,
  });
  const value = (await response.json()) as { error?: string };
  if (!response.ok) throw Error(value.error ?? "Runtime unavailable");
  return value;
};
