import type { FileLanguage } from '@/types';
import type { FormatterMessage } from '@/workers/messages';

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
      const onMessage = (event: MessageEvent<FormatterMessage>) => {
        const msg = event.data;
        if (msg.type !== 'FORMAT_RESULT' || msg.requestId !== requestId) return;
        worker.removeEventListener('message', onMessage);
        if (msg.success) resolve(msg.formatted);
        else reject(new Error(msg.error));
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'FORMAT_FILE', requestId, language, content });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
