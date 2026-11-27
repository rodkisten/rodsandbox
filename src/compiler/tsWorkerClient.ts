import type { Diagnostic } from '@/types';
import type { TsMessage } from '@/workers/messages';
import type { TsCompletionItem, TsDefinitionLocation, TsQuickInfo, TsSignatureHelp } from '@/types/tsLanguage';

const WORKER_REQUEST_TIMEOUT_MS = 20_000;
type TsRequestMessage = Extract<TsMessage, { type: 'TS_DIAGNOSTICS' | 'TS_COMPLETIONS' | 'TS_QUICK_INFO' | 'TS_DEFINITION' | 'TS_SIGNATURE' }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class TypeScriptWorkerClient {
  private worker: Worker | null = null;
  private requestId = 0;
  constructor(private readonly onTypesSnapshot?: (paths: string[]) => void) {}

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/ts-language.worker.ts', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', event => {
        if (event.data?.type === 'TS_TYPES_SNAPSHOT' && Array.isArray(event.data.paths)) this.onTypesSnapshot?.(event.data.paths);
      });
    }
    return this.worker;
  }

  private resetWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.onTypesSnapshot?.([]);
  }

  private requestWithFallback<Result>(
    payload: DistributiveOmit<TsRequestMessage, 'requestId'>,
    matchAndExtract: (message: TsMessage, requestId: number) => { matched: true; value: Result } | { matched: false },
    fallback: Result,
  ): Promise<Result> {
    const worker = this.getWorker();
    const requestId = ++this.requestId;

    return new Promise((resolve) => {
      let isSettled = false;
      const settle = (value: Result, shouldResetWorker = false) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (shouldResetWorker && this.worker === worker) this.resetWorker();
        resolve(value);
      };

      const onMessage = (event: MessageEvent<TsMessage>) => {
        const extracted = matchAndExtract(event.data, requestId);
        if (!extracted.matched) return;
        settle(extracted.value);
      };

      const onError = () => settle(fallback, true);
      const onMessageError = () => settle(fallback, true);
      const timeout = setTimeout(() => settle(fallback, true), WORKER_REQUEST_TIMEOUT_MS);

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      worker.postMessage({ ...payload, requestId });
    });
  }

  async getDiagnostics(files: Array<{ path: string; content: string }>): Promise<Diagnostic[]> {
    return this.requestWithFallback<Diagnostic[]>(
      { type: 'TS_DIAGNOSTICS', files },
      (msg, requestId) => (msg.type === 'TS_DIAGNOSTICS_RESULT' && msg.requestId === requestId
        ? { matched: true, value: msg.diagnostics ?? [] as Diagnostic[] }
        : { matched: false }),
      [],
    );
  }

  async getCompletions(files: Array<{ path: string; content: string }>, path: string, position: number): Promise<TsCompletionItem[]> {
    return this.requestWithFallback<TsCompletionItem[]>(
      { type: 'TS_COMPLETIONS', files, path, position },
      (msg, requestId) => (msg.type === 'TS_COMPLETIONS_RESULT' && msg.requestId === requestId
        ? { matched: true, value: msg.items ?? [] as TsCompletionItem[] }
        : { matched: false }),
      [],
    );
  }

  async getSignatureHelp(files: Array<{ path: string; content: string }>, path: string, position: number): Promise<TsSignatureHelp | null> {
    return this.requestWithFallback<TsSignatureHelp | null>(
      { type: 'TS_SIGNATURE', files, path, position },
      (msg, requestId) => msg.type === 'TS_SIGNATURE_RESULT' && msg.requestId === requestId
        ? { matched: true, value: msg.signature }
        : { matched: false },
      null,
    );
  }

  async getQuickInfo(files: Array<{ path: string; content: string }>, path: string, position: number): Promise<TsQuickInfo | null> {
    return this.requestWithFallback<TsQuickInfo | null>(
      { type: 'TS_QUICK_INFO', files, path, position },
      (msg, requestId) => (msg.type === 'TS_QUICK_INFO_RESULT' && msg.requestId === requestId
        ? { matched: true, value: msg.info ?? null }
        : { matched: false }),
      null,
    );
  }


  async getDefinition(files: Array<{ path: string; content: string }>, path: string, position: number): Promise<TsDefinitionLocation | null> {
    return this.requestWithFallback<TsDefinitionLocation | null>(
      { type: 'TS_DEFINITION', files, path, position },
      (msg, requestId) => (msg.type === 'TS_DEFINITION_RESULT' && msg.requestId === requestId
        ? { matched: true, value: msg.location ?? null }
        : { matched: false }),
      null,
    );
  }

  terminate(): void {
    this.resetWorker();
  }
}
