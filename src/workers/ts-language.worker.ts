/// <reference lib="webworker" />
import { BrowserTypeScriptCompiler } from '@/compiler';
import type { TsMessage } from './messages';
let compiler: BrowserTypeScriptCompiler | null = null;
self.onmessage = (event: MessageEvent<TsMessage>) => {
  const msg = event.data;
  if (msg.type !== 'TS_DIAGNOSTICS') return;
  compiler ??= new BrowserTypeScriptCompiler();
  for (const file of msg.files) compiler.updateFile(file.path, file.content);
  const diagnostics = compiler.compile().diagnostics;
  self.postMessage({ type: 'TS_DIAGNOSTICS_RESULT', requestId: msg.requestId, diagnostics });
};
