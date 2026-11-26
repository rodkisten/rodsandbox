/// <reference lib="webworker" />
import { BrowserTypeScriptCompiler, parseTsConfigCompilerOptions } from '@/compiler';
import type { Diagnostic } from '@/types';
import type { TsMessage } from './messages';

const WORKER_IDLE_TIMEOUT_MS = 45_000;
let compiler: BrowserTypeScriptCompiler | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastTsConfigHash: string | null = null;
let previousPaths = new Set<string>();

function refreshIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    compiler = null;
    lastTsConfigHash = null;
    previousPaths.clear();
  }, WORKER_IDLE_TIMEOUT_MS);
}

function ensureCompiler(): BrowserTypeScriptCompiler {
  compiler ??= new BrowserTypeScriptCompiler();
  return compiler;
}

function syncFiles(files: Array<{ path: string; content: string }>) {
  const service = ensureCompiler();

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
  refreshIdleTimer();
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

self.onmessage = (event: MessageEvent<TsMessage>) => {
  const msg = event.data;

  if (msg.type === 'TS_DIAGNOSTICS') {
    try {
      const service = syncFiles(msg.files);
      const diagnostics = service.compile().diagnostics;
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
      const service = syncFiles(msg.files);
      const items = service.getCompletions(msg.path, msg.position);
      self.postMessage({ type: 'TS_COMPLETIONS_RESULT', requestId: msg.requestId, items });
    } catch {
      self.postMessage({ type: 'TS_COMPLETIONS_RESULT', requestId: msg.requestId, items: [] });
    }
    return;
  }

  if (msg.type === 'TS_QUICK_INFO') {
    try {
      const service = syncFiles(msg.files);
      const info = service.getQuickInfo(msg.path, msg.position);
      self.postMessage({ type: 'TS_QUICK_INFO_RESULT', requestId: msg.requestId, info });
    } catch {
      self.postMessage({ type: 'TS_QUICK_INFO_RESULT', requestId: msg.requestId, info: null });
    }
    return;
  }

  if (msg.type === 'TS_DEFINITION') {
    try {
      const service = syncFiles(msg.files);
      const location = service.getDefinitionLocation(msg.path, msg.position);
      self.postMessage({ type: 'TS_DEFINITION_RESULT', requestId: msg.requestId, location });
    } catch {
      self.postMessage({ type: 'TS_DEFINITION_RESULT', requestId: msg.requestId, location: null });
    }
  }
};
