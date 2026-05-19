import type { Diagnostic } from '@/types';
import type { TsMessage } from '@/workers/messages';
import type { TsCompletionItem, TsQuickInfo } from '@/types/tsLanguage';

export class TypeScriptWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;

  private getWorker(): Worker {
    this.worker ??= new Worker(new URL('../workers/ts-language.worker.ts', import.meta.url), { type: 'module' });
    return this.worker;
  }

  async getDiagnostics(files: Array<{ path: string; content: string }>): Promise<Diagnostic[]> {
    const worker = this.getWorker();
    const requestId = ++this.requestId;
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent<TsMessage>) => {
        const msg = event.data;
        if (msg.type !== 'TS_DIAGNOSTICS_RESULT' || msg.requestId !== requestId) return;
        worker.removeEventListener('message', onMessage);
        resolve(msg.diagnostics);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'TS_DIAGNOSTICS', requestId, files });
    });
  }

  async getCompletions(files: Array<{ path: string; content: string }>, path: string, position: number): Promise<TsCompletionItem[]> {
    const worker = this.getWorker();
    const requestId = ++this.requestId;
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent<TsMessage>) => {
        const msg = event.data;
        if (msg.type !== 'TS_COMPLETIONS_RESULT' || msg.requestId !== requestId) return;
        worker.removeEventListener('message', onMessage);
        resolve(msg.items);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'TS_COMPLETIONS', requestId, files, path, position });
    });
  }

  async getQuickInfo(files: Array<{ path: string; content: string }>, path: string, position: number): Promise<TsQuickInfo | null> {
    const worker = this.getWorker();
    const requestId = ++this.requestId;
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent<TsMessage>) => {
        const msg = event.data;
        if (msg.type !== 'TS_QUICK_INFO_RESULT' || msg.requestId !== requestId) return;
        worker.removeEventListener('message', onMessage);
        resolve(msg.info);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'TS_QUICK_INFO', requestId, files, path, position });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
