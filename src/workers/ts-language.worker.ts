/// <reference lib="webworker" />
import { BrowserTypeScriptCompiler } from '@/compiler';
import type { TsMessage } from './messages';

const WORKER_IDLE_TIMEOUT_MS = 45_000;
let compiler: BrowserTypeScriptCompiler | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function refreshIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    compiler = null;
  }, WORKER_IDLE_TIMEOUT_MS);
}

function ensureCompiler(): BrowserTypeScriptCompiler {
  compiler ??= new BrowserTypeScriptCompiler();
  return compiler;
}

function syncFiles(files: Array<{ path: string; content: string }>) {
  const service = ensureCompiler();
  for (const file of files) service.updateFile(file.path, file.content);
  refreshIdleTimer();
  return service;
}

self.onmessage = (event: MessageEvent<TsMessage>) => {
  const msg = event.data;

  if (msg.type === 'TS_DIAGNOSTICS') {
    const service = syncFiles(msg.files);
    const diagnostics = service.compile().diagnostics;
    self.postMessage({ type: 'TS_DIAGNOSTICS_RESULT', requestId: msg.requestId, diagnostics });
    return;
  }

  if (msg.type === 'TS_COMPLETIONS') {
    const service = syncFiles(msg.files);
    const items = service.getCompletions(msg.path, msg.position);
    self.postMessage({ type: 'TS_COMPLETIONS_RESULT', requestId: msg.requestId, items });
    return;
  }

  if (msg.type === 'TS_QUICK_INFO') {
    const service = syncFiles(msg.files);
    const info = service.getQuickInfo(msg.path, msg.position);
    self.postMessage({ type: 'TS_QUICK_INFO_RESULT', requestId: msg.requestId, info });
    return;
  }

  if (msg.type === 'TS_DEFINITION') {
    const service = syncFiles(msg.files);
    const location = service.getDefinitionLocation(msg.path, msg.position);
    self.postMessage({ type: 'TS_DEFINITION_RESULT', requestId: msg.requestId, location });
  }
};
