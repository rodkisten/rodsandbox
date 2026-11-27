/// <reference lib="webworker" />
import { BrowserTypeScriptCompiler, parseTsConfigCompilerOptions } from '@/compiler';
import type { Diagnostic } from '@/types';
import type { TsMessage } from './messages';
import { acquireWorkspaceTypes } from '@/compiler/typeAcquisition';

let libraryPromise: Promise<Record<string, string>> | undefined;
function loadLibraries() {
  return libraryPromise ??= fetch('/typescript-libs.json').then(async (response) => {
    if (!response.ok) throw new Error('TypeScript standard libraries unavailable');
    return await response.json() as Record<string, string>;
  }).catch((error: unknown) => { libraryPromise = undefined; throw error; });
}
let compiler: BrowserTypeScriptCompiler | null = null;
let lastTsConfigHash: string | null = null;
let previousPaths = new Set<string>();
let dependencyKey = '';
let dependencyRefresh = 0;


async function ensureCompiler(): Promise<BrowserTypeScriptCompiler> {
  if (!compiler) {
    const libraries = await loadLibraries();
    if (!compiler) {
      compiler = new BrowserTypeScriptCompiler();
      compiler.setLibraries(libraries);
    }
  }
  return compiler;
}

async function syncFiles(files: Array<{ path: string; content: string }>) {
  const service = await ensureCompiler();
  const key = JSON.stringify(files.map(file => [file.path, /(?:^|\/)package\.json$/.test(file.path) ? file.content : (file.content.match(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"][^'"]+['"]/g) ?? [])]));
  if (key !== dependencyKey || Date.now() - dependencyRefresh > 60_000) {
    const dependencies = await acquireWorkspaceTypes(files);
    service.setDependencyFiles(dependencies);
    self.postMessage({ type: 'TS_TYPES_SNAPSHOT', paths: [...dependencies.keys()].filter(path => /\.d\.[cm]?ts$/.test(path)) });
    dependencyKey = key;
    dependencyRefresh = Date.now();
  }

  // Detect tsconfig.json and apply compiler options if changed
  const tsConfig = files.find((f) => f.path === '/tsconfig.json' || f.path === 'tsconfig.json');
  if ((tsConfig?.content ?? null) !== lastTsConfigHash) {
    lastTsConfigHash = tsConfig?.content ?? null;
    const options = parseTsConfigCompilerOptions(tsConfig?.content ?? '{}');
    service.setCompilerOptions(options);
  }

  const nextPaths = new Set(files.map((file) => file.path));
  for (const path of previousPaths) if (!nextPaths.has(path)) service.removeFile(path);
  for (const file of files) service.updateFile(file.path, file.content);
  previousPaths = nextPaths;
  return service;
}

function createWorkerFailureDiagnostic(fileId: string, error: unknown): Diagnostic {
  return {
    id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    fileId,
    severity: 'error',
    message: error instanceof Error ? error.message : 'TypeScript worker failed',
    line: 1,
    column: 1,
    source: 'typescript',
  };
}

async function handleMessage(event: MessageEvent<TsMessage>) {
  const msg = event.data;

  if (msg.type === 'TS_DIAGNOSTICS') {
    try {
      const service = await syncFiles(msg.files);
      const diagnostics = service.collectDiagnostics();
      self.postMessage({ type: 'TS_DIAGNOSTICS_RESULT', requestId: msg.requestId, diagnostics });
    } catch (error) {
      self.postMessage({
        type: 'TS_DIAGNOSTICS_RESULT',
        requestId: msg.requestId,
        diagnostics: [createWorkerFailureDiagnostic(msg.files[0]?.path ?? 'main.ts', error)],
      });
    }
    return;
  }

  if (msg.type === 'TS_COMPLETIONS') {
    try {
      const service = await syncFiles(msg.files);
      const items = service.getCompletions(msg.path, msg.position);
      self.postMessage({ type: 'TS_COMPLETIONS_RESULT', requestId: msg.requestId, items });
    } catch {
      self.postMessage({ type: 'TS_COMPLETIONS_RESULT', requestId: msg.requestId, items: [] });
    }
    return;
  }

  if (msg.type === 'TS_SIGNATURE') {
    try {
      const service = await syncFiles(msg.files);
      self.postMessage({ type: 'TS_SIGNATURE_RESULT', requestId: msg.requestId, signature: service.getSignatureHelp(msg.path, msg.position) });
    } catch {
      self.postMessage({ type: 'TS_SIGNATURE_RESULT', requestId: msg.requestId, signature: null });
    }
    return;
  }

  if (msg.type === 'TS_QUICK_INFO') {
    try {
      const service = await syncFiles(msg.files);
      const info = service.getQuickInfo(msg.path, msg.position);
      self.postMessage({ type: 'TS_QUICK_INFO_RESULT', requestId: msg.requestId, info });
    } catch {
      self.postMessage({ type: 'TS_QUICK_INFO_RESULT', requestId: msg.requestId, info: null });
    }
    return;
  }

  if (msg.type === 'TS_DEFINITION') {
    try {
      const service = await syncFiles(msg.files);
      const location = service.getDefinitionLocation(msg.path, msg.position);
      self.postMessage({ type: 'TS_DEFINITION_RESULT', requestId: msg.requestId, location });
    } catch {
      self.postMessage({ type: 'TS_DEFINITION_RESULT', requestId: msg.requestId, location: null });
    }
  }
}

let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<TsMessage>) => {
  queue = queue.then(() => handleMessage(event)).catch(() => undefined);
};
