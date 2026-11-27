'use client';

/**
 * XTermInner — inner component that initialises xterm.js after the DOM mounts.
 *
 * Loaded lazily via `next/dynamic` to avoid SSR issues with xterm.
 */

import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import xtermCss from '@xterm/xterm/css/xterm.css?inline';
import { TerminalAdapter } from '@/services/terminal/adapter';

interface XTermInnerProps {
  adapter: TerminalAdapter;
  scrollbackLines: number;
}

export default function XTermInner({ adapter, scrollbackLines }: XTermInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    const root = containerRef.current?.getRootNode();
    const style = document.createElement('style');
    style.textContent = xtermCss;
    (root instanceof ShadowRoot ? root : document.head).append(style);
    return () => style.remove();
  }, []);
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        cursorAccent: '#020617',
        selectionBackground: '#1e3a5f',
        black: '#0f172a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
        brightBlack: '#334155',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f8fafc',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: scrollbackLines,
      allowTransparency: true,
      convertEol: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);

    // Fit terminal to container size.
    const frame = requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {
        // Ignore sizing errors during first render.
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    // Route user input to the adapter.
    const inputDisposable = term.onData((data) => {
      adapter.write(data);
    });

    // Connect the adapter and pipe its output to xterm.
    void adapter.connect({
      onData: (data) => term.write(data),
      onClose: (code) => {
        term.write(`\r\n\x1b[2mProcess exited with code ${code}\x1b[0m\r\n`);
      },
      onError: (msg) => {
        term.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`);
      },
    });

    // Resize observer — refit when container dimensions change.
    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
        adapter.resize(term.cols, term.rows);
      } catch {
        // Ignore transient resize errors.
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(frame);
      inputDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      adapter.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        // Prevent iOS Safari from zooming in on text selection in the terminal.
        touchAction: 'manipulation',
      }}
    />
  );
}
