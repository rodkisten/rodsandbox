import bundlerWorkerUrl from '@/workers/bundler.worker.ts?worker&url';
import { createModuleWorker } from '@/browser/moduleWorker';
import type { Diagnostic } from '@/types';
import type { WorkerFileInput, BundlerMessage } from '@/workers/messages';
export interface BundleResult { cancelled?: boolean; code: string; cssText: string; dependencies: string[]; importMap?: Record<string, string>; diagnostics: Diagnostic[]; }
const WORKER_REQUEST_TIMEOUT_MS = 45_000;

function createBundlerFailureDiagnostic(fileId: string, message: string): Diagnostic {
  return {
    id: `diag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    fileId,
    severity: 'error',
    message,
    line: 1,
    column: 1,
    source: 'build',
  };
}

export class EsbuildBundlerService {
  private worker: Worker | null = null;
  private requestId = 0;
  private running = false;
  private pending: { files: WorkerFileInput[]; entryFile: string; resolve: (result: BundleResult) => void } | null = null;
  private cancelActive: (() => void) | null = null;
  private cancelled(): BundleResult { return { cancelled: true, code: '', cssText: '', dependencies: [], diagnostics: [] }; }
  private ensureWorker() { this.worker ??= createModuleWorker(bundlerWorkerUrl); return this.worker; }
  build(files: WorkerFileInput[], entryFile: string): Promise<BundleResult> {
    return new Promise(resolve => {
      this.pending?.resolve(this.cancelled());
      this.pending = { files, entryFile, resolve };
      void this.drain();
    });
  }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending) {
        const task = this.pending;
        this.pending = null;
        let result: BundleResult;
        try { result = await this.execute(task.files, task.entryFile); }
        catch (error) {
          result = { code: '', cssText: '', dependencies: [], diagnostics: [createBundlerFailureDiagnostic(task.entryFile, String(error))] };
        }
        task.resolve(this.pending ? this.cancelled() : result);
      }
    } finally { this.running = false; }
  }
  private execute(files: WorkerFileInput[], entryFile: string): Promise<BundleResult> {
    const worker = this.ensureWorker();
    const id = ++this.requestId;
    return new Promise((resolve) => {
      let isSettled = false;
      const settle = (result: BundleResult, shouldResetWorker = false) => {
        if (isSettled) return;
        isSettled = true;
        this.cancelActive = null;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (shouldResetWorker && this.worker === worker) {
          this.worker?.terminate();
          this.worker = null;
        }
        resolve(result);
      };

      const fail = (message: string, shouldResetWorker = false) => {
        settle({
          code: '',
          cssText: '',
          dependencies: [],
          diagnostics: [createBundlerFailureDiagnostic(entryFile, message)],
        }, shouldResetWorker);
      };

      const onMessage = (event: MessageEvent<BundlerMessage>) => {
        const msg = event.data;
        if (msg.type !== 'BUNDLE_RESULT' || msg.requestId !== id) return;
        settle(msg.success
          ? { code: msg.code, cssText: msg.cssText, dependencies: msg.dependencies, importMap: msg.importMap, diagnostics: [] }
          : { code: '', cssText: '', dependencies: [], diagnostics: msg.errors });
      };
      const onError = (event: ErrorEvent) => fail(event.message || 'Bundler worker failed', true);
      const onMessageError = () => fail('Bundler worker sent an unreadable response', true);
      const timeout = setTimeout(() => fail('Bundler worker request timed out', true), WORKER_REQUEST_TIMEOUT_MS);

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      this.cancelActive = () => settle(this.cancelled(), true);
      try { worker.postMessage({ type: 'BUNDLE_BUILD', requestId: id, files, entryFile }); }
      catch (error) { fail(String(error), true); }
    });
  }

  terminate(): void {
    this.pending?.resolve(this.cancelled());
    this.pending = null;
    this.cancelActive?.();
    this.worker?.terminate();
    this.worker = null;
  }
}
