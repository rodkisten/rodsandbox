/**
 * Terminal adapter interface.
 *
 * All terminal interactions (resize, write, output) go through this abstraction
 * so the UI component stays runtime-agnostic. Three adapter kinds exist:
 *
 * | Kind             | Description                                            |
 * |------------------|--------------------------------------------------------|
 * | `browser`        | Full browser-based shell (BrowserShell) — default      |
 * | `node-pty`       | Real PTY via /api/terminal (requires Node.js server)   |
 * | `vercel-fallback`| No process execution — shows an informational message  |
 *
 * @see {@link TerminalRuntimeInfo} for capability flags.
 */

import { TerminalRuntimeInfo, TerminalRuntimeKind, Workspace } from '@/types';
import { BrowserShell } from './browserShell';

// ─── Data types ────────────────────────────────────────────────────────────────

export type TerminalDataHandler = (data: string) => void;
export type TerminalCloseHandler = (code: number) => void;
export type TerminalErrorHandler = (message: string) => void;

export interface TerminalHandlers {
  onData: TerminalDataHandler;
  onClose: TerminalCloseHandler;
  onError: TerminalErrorHandler;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

/**
 * A terminal adapter manages the lifecycle of a terminal session:
 * connect → write / resize → disconnect.
 */
export interface TerminalAdapter {
  readonly info: TerminalRuntimeInfo;

  /**
   * Opens the terminal session. Must be called before `write`.
   * Handlers receive data/close/error events asynchronously.
   */
  connect(handlers: TerminalHandlers): Promise<void>;

  /**
   * Sends raw input bytes to the running process.
   * No-op if `info.supportsExecution` is false.
   */
  write(data: string): void;

  /**
   * Notifies the adapter that the terminal has been resized.
   * Used to pass SIGWINCH to the underlying PTY.
   */
  resize(cols: number, rows: number): void;

  /**
   * Terminates the session and releases resources.
   */
  disconnect(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Returns the best available terminal adapter for the current environment.
 *
 * Priority:
 * 1. Vercel serverless / edge runtime → VercelFallbackAdapter (no process execution).
 * 2. Browser client → NodePtyAdapter (tries /api/terminal, falls back to BrowserShell).
 * 3. Server-side Node.js (non-Vercel) → BrowserShellAdapter.
 */
export function createTerminalAdapter(workspace?: Workspace, initialHistory?: string[], onHistorySave?: (history: string[]) => void): TerminalAdapter {
  // On Vercel or edge runtimes, native execution is unavailable.
  if (typeof process !== 'undefined' && (process.env['VERCEL'] || process.env['NEXT_RUNTIME'] === 'edge' || process.env['NEXT_RUNTIME'] === 'experimental-edge')) {
    return new VercelFallbackAdapter();
  }
  // In the browser, try the node-pty API first, then fall back to BrowserShell.
  if (typeof window !== 'undefined') {
    return new BrowserShellAdapter(workspace, initialHistory, onHistorySave);
  }
  return new BrowserShellAdapter(workspace, initialHistory, onHistorySave);
}

// ─── Node PTY adapter ─────────────────────────────────────────────────────────

/**
 * Real PTY adapter backed by the /api/terminal SSE API.
 * Requires a Node.js server with node-pty installed.
 * Falls back to BrowserShellAdapter if the API is unavailable.
 */
export class NodePtyAdapter implements TerminalAdapter {
  readonly info: TerminalRuntimeInfo = {
    kind: 'node-pty' as TerminalRuntimeKind,
    label: 'Local Terminal',
    supportsExecution: true,
  };

  private sessionId: string | null = null;
  private eventSource: EventSource | null = null;
  private cols = 80;
  private rows = 24;
  private handlers: TerminalHandlers | null = null;
  private fallback: BrowserShellAdapter | null = null;
  private readonly workspace: Workspace | undefined;
  private readonly initialHistory: string[];
  private readonly onHistorySave: ((history: string[]) => void) | undefined;

  constructor(workspace?: Workspace, initialHistory?: string[], onHistorySave?: (history: string[]) => void) {
    this.workspace = workspace;
    this.initialHistory = initialHistory ?? [];
    this.onHistorySave = onHistorySave;
  }

  async connect(handlers: TerminalHandlers): Promise<void> {
    this.handlers = handlers;

    try {
      // Try to create a PTY session on the server.
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cols: this.cols, rows: this.rows }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const { sessionId } = await res.json() as { sessionId: string };
      this.sessionId = sessionId;

      // Open an SSE stream to receive PTY output.
      const es = new EventSource(`/api/terminal?sid=${sessionId}`);
      this.eventSource = es;

      es.onmessage = (event) => {
        try {
          const { data } = JSON.parse(event.data as string) as { data: string };
          handlers.onData(data);
        } catch {
          // Malformed SSE — ignore.
        }
      };

      es.onerror = () => {
        handlers.onError('Terminal connection lost');
      };

      // Update the info label to reflect the confirmed PTY connection.
      (this.info as { label: string }).label = 'Local Terminal';

    } catch {
      // node-pty API not available — fall back to browser shell.
      (this.info as { kind: string; label: string }).kind = 'browser';
      (this.info as { label: string }).label = 'Browser Shell';
      const fb = new BrowserShellAdapter(this.workspace, this.initialHistory, this.onHistorySave);
      this.fallback = fb;
      await fb.connect(handlers);
    }
  }

  write(data: string): void {
    if (this.fallback) {
      this.fallback.write(data);
      return;
    }
    if (!this.sessionId) return;
    fetch(`/api/terminal/input?sid=${this.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    }).catch(() => {
      // Fire-and-forget; errors are surfaced via onError.
    });
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.fallback) {
      this.fallback.resize(cols, rows);
      return;
    }
    if (!this.sessionId) return;
    fetch(`/api/terminal/resize?sid=${this.sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    }).catch(() => {});
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    if (this.fallback) {
      this.fallback.disconnect();
      this.fallback = null;
    }
    if (this.sessionId) {
      fetch(`/api/terminal/close?sid=${this.sessionId}`, { method: 'POST' }).catch(() => {});
      this.sessionId = null;
    }
    this.handlers = null;
  }
}

// ─── Browser shell adapter ────────────────────────────────────────────────────

/**
 * Full browser-based terminal adapter backed by BrowserShell.
 * Works everywhere (Vercel, local dev, any browser) without a server.
 */
export class BrowserShellAdapter implements TerminalAdapter {
  readonly info: TerminalRuntimeInfo = {
    kind: 'browser' as TerminalRuntimeKind,
    label: 'Browser Shell',
    supportsExecution: true,
  };

  private shell: BrowserShell | null = null;
  private workspace: Workspace | undefined;
  private initialHistory: string[];
  private onHistorySave: ((history: string[]) => void) | undefined;

  constructor(workspace?: Workspace, initialHistory?: string[], onHistorySave?: (history: string[]) => void) {
    this.workspace = workspace;
    this.initialHistory = initialHistory ?? [];
    this.onHistorySave = onHistorySave;
  }

  /** Update workspace when files change. */
  updateWorkspace(workspace: Workspace) {
    this.workspace = workspace;
    this.shell?.setWorkspace(workspace);
  }

  async connect(handlers: TerminalHandlers): Promise<void> {
    const shell = new BrowserShell((data) => handlers.onData(data), this.initialHistory);
    if (this.workspace) shell.setWorkspace(this.workspace);
    this.shell = shell;
    shell.start();
  }

  write(data: string): void {
    this.shell?.handleData(data);
  }

  resize(_cols: number, _rows: number): void {
    // No-op for browser shell — layout is managed by xterm.js fitAddon.
  }

  disconnect(): void {
    if (this.shell && this.onHistorySave) {
      this.onHistorySave(this.shell.getHistory());
    }
    this.shell = null;
  }
}

export class VercelFallbackAdapter implements TerminalAdapter {
  readonly info: TerminalRuntimeInfo = {
    kind: 'vercel-fallback' as TerminalRuntimeKind,
    label: 'Serverless Terminal',
    supportsExecution: false,
  };

  async connect(handlers: TerminalHandlers): Promise<void> {
    handlers.onData('\r\n\x1b[33m⚠  Terminal execution is not available in serverless environments.\x1b[0m\r\n');
  }

  write(_data: string): void {}
  resize(_cols: number, _rows: number): void {}
  disconnect(): void {}
}
