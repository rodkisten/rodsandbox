import type { FileLanguage } from '@/types';
import type { FormatterMessage } from '@/workers/messages';

const WORKER_REQUEST_TIMEOUT_MS = 20_000;

export class FormatterWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;

  private getWorker(): Worker {
    this.worker ??= new Worker(new URL('../workers/formatter.worker.ts', import.meta.url), { type: 'module' });
    return this.worker;
  }

  async format(content: string, language: FileLanguage): Promise<string> {
    const worker = this.getWorker();
    const requestId = ++this.requestId;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const settleWithError = (error: Error) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        this.worker?.terminate();
        this.worker = null;
        reject(error);
      };

      const onMessage = (event: MessageEvent<FormatterMessage>) => {
        const msg = event.data;
        if (msg.type !== 'FORMAT_RESULT' || msg.requestId !== requestId) return;
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (msg.success) resolve(msg.formatted);
        else reject(new Error(msg.error));
      };

      const onError = (event: ErrorEvent) => settleWithError(new Error(event.message || 'Formatter worker failed'));
      const onMessageError = () => settleWithError(new Error('Formatter worker sent an unreadable response'));
      const timeout = setTimeout(() => settleWithError(new Error('Formatter worker request timed out')), WORKER_REQUEST_TIMEOUT_MS);

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      worker.postMessage({ type: 'FORMAT_FILE', requestId, language, content });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
