'use client';

/**
 * TerminalPanel — xterm.js-powered terminal UI.
 *
 * This component renders a full xterm.js terminal instance and connects it
 * to the appropriate {@link TerminalAdapter} for the current runtime.
 *
 * On Vercel / serverless: shows an informational banner explaining the limitation.
 * In local dev: shows the banner while the PTY API is being developed.
 *
 * @see {@link createTerminalAdapter} for runtime detection logic.
 */

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { TerminalAdapter, createTerminalAdapter } from '@/services/terminal/adapter';
import { TERMINAL_SCROLLBACK_LINES } from '@/constants';
import { TerminalRuntimeInfo } from '@/types';
import { RefreshCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Dynamically import xterm to avoid SSR issues.
const XTermComponent = dynamic(() => import('./XTermInner'), { ssr: false });

interface TerminalPanelProps {
  /** Optional CSS class applied to the outer container. */
  className?: string;
}

/**
 * Public terminal panel component.
 * Manages adapter lifecycle and passes xterm instance to the inner component.
 */
export default function TerminalPanel({ className = '' }: TerminalPanelProps) {
  // Lazy initializer creates the adapter once synchronously on the client,
  // avoiding a setState call inside a useEffect.
  const [adapter, setAdapter] = useState<TerminalAdapter>(() => createTerminalAdapter());
  const [resetKey, setResetKey] = useState(0);

  // Only the cleanup step lives in the effect — no setState calls.
  useEffect(() => {
    return () => { adapter.disconnect(); };
  }, [adapter]);

  const handleReset = useCallback(() => {
    adapter.disconnect();
    setAdapter(createTerminalAdapter());
    setResetKey((k) => k + 1);
  }, [adapter]);

  const runtimeInfo: TerminalRuntimeInfo = adapter.info;

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-neutral-950 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900/70 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Terminal
          </span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {runtimeInfo.label}
          </span>
          {!runtimeInfo.supportsExecution && (
            <span className="rounded bg-yellow-950/60 px-1.5 py-0.5 text-[10px] text-yellow-600">
              read-only
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleReset}
          title="Reset terminal"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* xterm area */}
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
