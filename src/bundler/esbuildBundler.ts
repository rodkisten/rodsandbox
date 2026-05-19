import type { Diagnostic } from '@/types';
import type { WorkerFileInput, BundlerMessage } from '@/workers/messages';
export interface BundleResult { code: string; cssText: string; diagnostics: Diagnostic[]; }
export class EsbuildBundlerService {
  private worker: Worker | null = null;
  private requestId = 0;
  private ensureWorker() { this.worker ??= new Worker(new URL('../workers/bundler.worker.ts', import.meta.url), { type: 'module' }); return this.worker; }
  build(files: WorkerFileInput[], entryFile: string): Promise<BundleResult> {
    const worker = this.ensureWorker();
    const id = ++this.requestId;
    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent<BundlerMessage>) => {
        const msg = event.data;
        if (msg.type !== 'BUNDLE_RESULT' || msg.requestId !== id) return;
        worker.removeEventListener('message', onMessage);
        resolve(msg.success ? { code: msg.code, cssText: msg.cssText, diagnostics: [] } : { code: '', cssText: '', diagnostics: msg.errors });
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'BUNDLE_BUILD', requestId: id, files, entryFile });
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
