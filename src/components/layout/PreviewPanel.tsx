'use client';
import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { PREVIEW_SANDBOX_ATTRS } from '@/constants';
import { PreviewMessage } from '@/types';

interface PreviewPanelProps {
  previewHtml: string | null;
  onMessage: (msg: PreviewMessage) => void;
}

export interface PreviewPanelHandle {
  reload(): void;
}

function isPreviewMessage(data: unknown): data is PreviewMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (d.type === 'CONSOLE_LOG' || d.type === 'RUNTIME_ERROR') && typeof d.timestamp === 'number';
}

const PreviewPanel = forwardRef<PreviewPanelHandle, PreviewPanelProps>(function PreviewPanel(
  { previewHtml, onMessage },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useImperativeHandle(ref, () => ({
    reload() {
      if (iframeRef.current) {
        iframeRef.current.srcdoc = previewHtml ?? '';
      }
    },
  }));

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!isPreviewMessage(event.data)) return;
      onMessage(event.data);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  return (
    <div className="h-full w-full bg-white dark:bg-gray-950 flex flex-col">
      <div className="flex items-center px-3 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-400">
        <span>Preview</span>
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
