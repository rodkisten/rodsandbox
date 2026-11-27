/** Module workers cannot be constructed directly from a different origin. */
export function createModuleWorker(url: string): Worker {
  const absolute = new URL(url, import.meta.url);
  if (absolute.origin === location.origin)
    return new Worker(absolute, { type: "module" });
  const blob = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(absolute.href)};`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(blob, { type: "module" });
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    terminate();
    URL.revokeObjectURL(blob);
  };
  return worker;
}
