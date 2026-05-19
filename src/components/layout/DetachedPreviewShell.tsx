'use client';

import React, { useEffect, useRef } from 'react';
import { PREVIEW_SANDBOX_ATTRS } from '@/constants';

export default function DetachedPreviewShell() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;

      // Relay preview messages from the sandboxed inner iframe to the opener (main app)
      if (event.source === iframeWindow) {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(event.data, location.origin);
        }
        return;
      }

      // Accept control messages only from the opener (main app)
      if (event.source !== window.opener) return;
      if (event.origin !== location.origin) return;

      if (event.data?.type === 'RODSANDBOX_PREVIEW_SYNC') {
        if (iframeRef.current) {
          iframeRef.current.srcdoc = (event.data.html as string) ?? '';
        }
        return;
      }

      if (event.data?.type === 'RODSANDBOX_PREVIEW_EVAL') {
        iframeWindow?.postMessage({ type: 'REPL_EVAL', code: event.data.code as string }, '*');
        return;
      }
    };

    window.addEventListener('message', handleMessage);
    // Signal opener that we are ready to receive the initial content
    if (window.opener) {
      window.opener.postMessage({ type: 'RODSANDBOX_DETACHED_PREVIEW_READY' }, location.origin);
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      sandbox={PREVIEW_SANDBOX_ATTRS}
      srcDoc="<html><body style='background:#111;color:#666;font-family:sans-serif;padding:2rem'><p>Loading preview…</p></body></html>"
      className="w-full h-screen border-0 block"
      title="Detached Preview"
    />
  );
}
