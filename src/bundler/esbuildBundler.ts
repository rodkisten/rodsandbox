import type { Diagnostic } from '@/types';
import type { WorkerFileInput, BundlerMessage } from '@/workers/messages';
export interface BundleResult { code: string; cssText: string; dependencies: string[]; importMap?: Record<string, string>; diagnostics: Diagnostic[]; }
const WORKER_REQUEST_TIMEOUT_MS = 20_000;

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
  private ensureWorker() { this.worker ??= new Worker(new URL('../workers/bundler.worker.ts', import.meta.url), { type: 'module' }); return this.worker; }
  build(files: WorkerFileInput[], entryFile: string): Promise<BundleResult> {
    const worker = this.ensureWorker();
    const id = ++this.requestId;
    return new Promise((resolve) => {
      let isSettled = false;
      const settle = (result: BundleResult, shouldResetWorker = false) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeout);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
        if (shouldResetWorker) {
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
      worker.postMessage({ type: 'BUNDLE_BUILD', requestId: id, files, entryFile });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
