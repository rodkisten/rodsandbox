'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSandboxRuntime } from '@/browser/RuntimeContext';
import { BrowserShellAdapter, createTerminalAdapter } from '@/services/terminal/adapter';
import { TERMINAL_SCROLLBACK_LINES } from '@/constants';
import { Workspace } from '@/types';
import { ExternalLink, RefreshCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';


const LazyXTerm = React.lazy(() => import('./XTermInner'));
const XTermComponent = (props: React.ComponentProps<typeof LazyXTerm>) => <React.Suspense fallback={null}><LazyXTerm {...props} /></React.Suspense>;

interface TerminalPanelProps {
  className?: string;
  workspace?: Workspace;
  onDetach?: () => void;
}

export default function TerminalPanel({ className = '', workspace, onDetach }: TerminalPanelProps) {
  const { persistence: { loadTerminalHistory, saveTerminalHistory } } = useSandboxRuntime();
  const [adapter, setAdapter] = useState<ReturnType<typeof createTerminalAdapter> | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const adapterRef = useRef(adapter);

  // Load persisted history on mount, then create the adapter.
  useEffect(() => {
    let cancelled = false;
    loadTerminalHistory().then((history) => {
      if (cancelled) return;
      const onHistorySave = (h: string[]) => { saveTerminalHistory(h).catch(() => {}); };
      const next = createTerminalAdapter(workspace, history, onHistorySave);
      adapterRef.current = next;
      setAdapter(next);
    }).catch(() => {
      if (cancelled) return;
      const next = createTerminalAdapter(workspace);
      adapterRef.current = next;
      setAdapter(next);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep adapter workspace in sync when files change.
  useEffect(() => {
    if (workspace && adapterRef.current instanceof BrowserShellAdapter) {
      adapterRef.current.updateWorkspace(workspace);
    }
  }, [workspace]);

  useEffect(() => {
    return () => { adapter?.disconnect(); };
  }, [adapter]);

  const handleReset = useCallback(() => {
    adapter?.disconnect();
    loadTerminalHistory().then((history) => {
      const onHistorySave = (h: string[]) => { saveTerminalHistory(h).catch(() => {}); };
      const next = createTerminalAdapter(workspace, history, onHistorySave);
      adapterRef.current = next;
      setAdapter(next);
      setResetKey((k) => k + 1);
    }).catch(() => {
      const next = createTerminalAdapter(workspace);
      adapterRef.current = next;
      setAdapter(next);
      setResetKey((k) => k + 1);
    });
  }, [adapter, workspace]);

  if (!adapter) return null;

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-neutral-950 ${className}`}>
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
        <div className="flex items-center gap-1">
          {onDetach && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onDetach}
              title="Abrir terminal em nova janela"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
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
