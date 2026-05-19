/// <reference lib="webworker" />
import type { FormatterMessage } from './messages';
import { formatFile } from '@/formatter/prettier';
self.onmessage = async (event: MessageEvent<FormatterMessage>) => {
  const msg = event.data;
  if (msg.type !== 'FORMAT_FILE') return;
  try {
    const formatted = await formatFile(msg.content, msg.language);
    self.postMessage({ type: 'FORMAT_RESULT', requestId: msg.requestId, success: true, formatted });
  } catch (error) {
    self.postMessage({ type: 'FORMAT_RESULT', requestId: msg.requestId, success: false, error: error instanceof Error ? error.message : 'Format failed' });
  }
};
