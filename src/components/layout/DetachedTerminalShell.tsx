'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { BrowserShellAdapter, createTerminalAdapter } from '@/services/terminal/adapter';
import { TERMINAL_SCROLLBACK_LINES } from '@/constants';
import { RefreshCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

const XTermComponent = dynamic(() => import('./XTermInner'), { ssr: false });

export default function DetachedTerminalShell() {
  const [adapter, setAdapter] = useState(() => createTerminalAdapter(undefined));
  const [resetKey, setResetKey] = useState(0);
  const adapterRef = useRef(adapter);

  useEffect(() => {
    return () => { adapterRef.current.disconnect(); };
  }, []);

  const handleReset = useCallback(() => {
    adapterRef.current.disconnect();
    const next = createTerminalAdapter(undefined);
    adapterRef.current = next;
    setAdapter(next);
    setResetKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-white">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Terminal
          </span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {adapter.info.label}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleReset}
          title="Restart terminal"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1 overflow-hidden">
        <XTermComponent
          key={resetKey}
          adapter={adapter}
          scrollbackLines={TERMINAL_SCROLLBACK_LINES}
        />
      </div>
    </div>
  );
}
