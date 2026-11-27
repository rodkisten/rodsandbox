'use client';
import React, { useCallback, useEffect, useRef, useImperativeHandle } from 'react';
import { PREVIEW_SANDBOX_ATTRS } from '@/constants';
import { PreviewMessage } from '@/types';
import { Button } from '@/components/ui/button';

export type BuildStatus = { phase: 'idle' | 'building' | 'built' | 'failed'; durationMs?: number };

interface PreviewPanelProps {
  buildStatus?: BuildStatus;
  previewHtml: string | null;
  onMessage: (msg: PreviewMessage) => void;
  onDetachedChange?: (detached: boolean) => void;
  ref?: React.Ref<PreviewPanelHandle>;
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

const DETACHED_PREVIEW_PLACEHOLDER = '<html><body style="background:#111;color:#666;font-family:sans-serif;padding:2rem"><p>Run to see preview</p></body></html>';

function PreviewPanel(
  { previewHtml, onMessage, onDetachedChange, ref, buildStatus }: PreviewPanelProps,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const detachedWindowRef = useRef<Window | null>(null);

  const syncDetachedContent = useCallback(() => {
    const detachedWindow = detachedWindowRef.current;
    if (!detachedWindow || detachedWindow.closed) return;
    detachedWindow.postMessage(
      { type: 'RODSANDBOX_PREVIEW_SYNC', html: previewHtml ?? DETACHED_PREVIEW_PLACEHOLDER },
      window.location.origin,
    );
  }, [previewHtml]);

  const openDetachedWindow = useCallback(() => {
    if (detachedWindowRef.current && !detachedWindowRef.current.closed) {
      detachedWindowRef.current.focus();
      onDetachedChange?.(true);
      return;
    }
    const detachedWindow = window.open('/detached-preview', '_blank', 'popup=yes,width=960,height=720');
    if (!detachedWindow) return;
    detachedWindowRef.current = detachedWindow;
    // Content is sent when we receive RODSANDBOX_DETACHED_PREVIEW_READY
    onDetachedChange?.(true);
  }, [onDetachedChange]);

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
        detachedWindow?.postMessage({ type: 'RODSANDBOX_PREVIEW_EVAL', code }, window.location.origin);
        return;
      }
      iframeRef.current?.contentWindow?.postMessage({ type: 'REPL_EVAL', code }, '*');
    },
    openDetached: openDetachedWindow,
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
  }), [previewHtml, syncDetachedContent, openDetachedWindow, onDetachedChange]);

  useEffect(() => {
    syncDetachedContent();
  }, [syncDetachedContent]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      const detachedWindow = detachedWindowRef.current;

      // Handle ready signal from detached preview page — send initial HTML
      if (event.source === detachedWindow && event.data?.type === 'RODSANDBOX_DETACHED_PREVIEW_READY') {
        syncDetachedContent();
        return;
      }

      const isIframeSource = event.source === iframeWindow;
      const isDetachedSource = Boolean(detachedWindow && event.source === detachedWindow);
      if (!isIframeSource && !isDetachedSource) return;
      if (!isPreviewMessage(event.data)) return;
      onMessage(event.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage, syncDetachedContent]);

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
    <div className="h-full w-full bg-white dark:bg-neutral-950 flex flex-col">
      <div className="flex items-center px-3 py-1 bg-neutral-800 border-b border-neutral-700 text-xs text-neutral-400">
        <span>Preview</span>
        <Button
          onClick={openDetachedWindow}
          variant="secondary"
          size="sm"
          className="ml-3 h-6 text-[11px]"
        >
          Open in New Window
        </Button>
        <div role="status" aria-live="polite" className="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
          <span className={`size-2 rounded-full ${buildStatus?.phase === 'building' ? 'animate-pulse bg-yellow-500' : buildStatus?.phase === 'failed' ? 'bg-red-500' : buildStatus?.phase === 'built' ? 'bg-green-500' : 'bg-muted-foreground'}`} />
          <span>{buildStatus?.phase === 'building' ? 'Building' : buildStatus?.phase === 'failed' ? 'Build failed' : buildStatus?.phase === 'built' ? 'Built' : 'Idle'}</span>
          {buildStatus?.durationMs !== undefined && <span className="tabular-nums text-muted-foreground">{buildStatus.durationMs} ms</span>}
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
}

export default PreviewPanel;

