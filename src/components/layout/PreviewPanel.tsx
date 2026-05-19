'use client';
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { PREVIEW_SANDBOX_ATTRS } from '@/constants';
import { PreviewMessage } from '@/types';
import { Button } from '@/components/ui/button';

interface PreviewPanelProps {
  previewHtml: string | null;
  onMessage: (msg: PreviewMessage) => void;
  onDetachedChange?: (detached: boolean) => void;
}

export interface PreviewPanelHandle {
  reload(): void;
  evaluate(code: string, runtime?: 'iframe' | 'detached' | 'auto'): void;
  openDetached(): void;
  closeDetached(): void;
  hasDetachedWindow(): boolean;
}

function isPreviewMessage(data: unknown): data is PreviewMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (d.type === 'CONSOLE_LOG' || d.type === 'RUNTIME_ERROR' || d.type === 'REPL_RESULT') && typeof d.timestamp === 'number';
}

const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(function PreviewPanel(
  { previewHtml, onMessage, onDetachedChange },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const detachedWindowRef = useRef<Window | null>(null);

  const syncDetachedContent = () => {
    const detachedWindow = detachedWindowRef.current;
    if (!detachedWindow || detachedWindow.closed) return;
    detachedWindow.document.open();
    detachedWindow.document.write(previewHtml ?? '<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#999;background:#111">Run to see preview</body></html>');
    detachedWindow.document.close();
  };

  useImperativeHandle(ref, () => ({
    reload() {
      if (iframeRef.current) {
        iframeRef.current.srcdoc = previewHtml ?? '';
      }
      syncDetachedContent();
    },
    evaluate(code: string, runtime: 'iframe' | 'detached' | 'auto' = 'auto') {
      const detachedWindow = detachedWindowRef.current;
      const detachedAvailable = Boolean(detachedWindow && !detachedWindow.closed);
      if (runtime === 'detached' || (runtime === 'auto' && detachedAvailable)) {
        detachedWindow?.postMessage({ type: 'REPL_EVAL', code }, '*');
        return;
      }
      iframeRef.current?.contentWindow?.postMessage({ type: 'REPL_EVAL', code }, '*');
    },
    openDetached() {
      if (detachedWindowRef.current && !detachedWindowRef.current.closed) {
        detachedWindowRef.current.focus();
        onDetachedChange?.(true);
        return;
      }
      const detachedWindow = window.open('', '_blank', 'popup=yes,width=960,height=720');
      if (!detachedWindow) return;
      detachedWindowRef.current = detachedWindow;
      syncDetachedContent();
      onDetachedChange?.(true);
    },
    closeDetached() {
      if (detachedWindowRef.current && !detachedWindowRef.current.closed) {
        detachedWindowRef.current.close();
      }
      detachedWindowRef.current = null;
      onDetachedChange?.(false);
    },
    hasDetachedWindow() {
      return Boolean(detachedWindowRef.current && !detachedWindowRef.current.closed);
    },
  }));

  useEffect(() => {
    syncDetachedContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewHtml]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const detachedWindow = detachedWindowRef.current;
      const isIframeSource = event.source === iframeWindow;
      const isDetachedSource = Boolean(detachedWindow && event.source === detachedWindow);
      if (!isIframeSource && !isDetachedSource) return;
      if (!isPreviewMessage(event.data)) return;
      onMessage(event.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const detachedWindow = detachedWindowRef.current;
      if (detachedWindow && detachedWindow.closed) {
        detachedWindowRef.current = null;
        onDetachedChange?.(false);
      }
    }, 600);
    return () => window.clearInterval(timer);
  }, [onDetachedChange]);

  return (
    <div className="h-full w-full bg-white dark:bg-gray-950 flex flex-col">
      <div className="flex items-center px-3 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400">
        <span>Preview</span>
        <Button
          onClick={() => {
            if (detachedWindowRef.current && !detachedWindowRef.current.closed) {
              detachedWindowRef.current.focus();
              return;
            }
            const detachedWindow = window.open('', '_blank', 'popup=yes,width=960,height=720');
            if (!detachedWindow) return;
            detachedWindowRef.current = detachedWindow;
            syncDetachedContent();
            onDetachedChange?.(true);
          }}
          variant="secondary"
          size="sm"
          className="ml-3 h-6 text-[11px]"
        >
          Open in New Window
        </Button>
        <div className="flex gap-1.5 ml-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
      </div>
      <iframe
        ref={iframeRef}
        sandbox={PREVIEW_SANDBOX_ATTRS}
        srcDoc={previewHtml ?? '<html><body style="background:#111;color:#666;font-family:sans-serif;padding:2rem"><p>Run to see preview</p></body></html>'}
        className="flex-1 w-full border-0"
        title="Preview"
      />
    </div>
  );
});

export default PreviewPanel;
