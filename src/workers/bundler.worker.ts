/// <reference lib="webworker" />
import type { BundlerBuildRequest, BundlerMessage } from './messages';
import type { Diagnostic } from '@/types';
interface EsbuildApi { initialize(options: { wasmURL: string; worker: boolean }): Promise<void>; build(options: Record<string, unknown>): Promise<{ outputFiles?: Array<{ path: string; text: string }> }>; }
let esbuild: EsbuildApi | null = null;
let latestRequestId = 0;
async function ensureEsbuild() {
  if (esbuild) return esbuild;
  // @ts-expect-error Remote ESM loaded at runtime in worker
  const loaded = await import('https://esm.sh/esbuild-wasm@0.27.0') as EsbuildApi;
  await loaded.initialize({ wasmURL: 'https://esm.sh/esbuild-wasm@0.27.0/esbuild.wasm', worker: false });
  esbuild = loaded;
  return loaded;
}
function normalizeBuildError(error: unknown, fileId: string): Diagnostic {
  return { id: `diag-${Date.now()}`, fileId, severity: 'error', message: error instanceof Error ? error.message : 'Build failed', line: 1, column: 1, source: 'typescript' };
}
self.onmessage = async (event: MessageEvent<BundlerMessage>) => {
  const msg = event.data;
  if (msg.type !== 'BUNDLE_BUILD') return;
  latestRequestId = msg.requestId;
  const req = msg as BundlerBuildRequest;
  const fileMap = new Map(req.files.map((f) => [f.path, f.content]));
  try {
    const buildApi = await ensureEsbuild();
    const result = await buildApi.build({ stdin: { contents: fileMap.get(req.entryFile) ?? '', sourcefile: req.entryFile, resolveDir: '/', loader: 'ts' }, bundle: true, write: false, format: 'iife' });
    if (req.requestId !== latestRequestId) return;
    const js = result.outputFiles?.find((f) => f.path.endsWith('.js'))?.text ?? '';
    self.postMessage({ type: 'BUNDLE_RESULT', requestId: req.requestId, success: true, code: js, cssText: '' });
  } catch (error) {
    if (req.requestId !== latestRequestId) return;
    self.postMessage({ type: 'BUNDLE_RESULT', requestId: req.requestId, success: false, errors: [normalizeBuildError(error, req.entryFile)] });
  }
};
