/**
 * Terminal adapter interface.
 *
 * All terminal interactions (resize, write, output) go through this abstraction
 * so the UI component stays runtime-agnostic. Three adapter kinds exist:
 *
 * | Kind             | Description                                            |
 * |------------------|--------------------------------------------------------|
 * | `browser`        | Full browser-based shell (BrowserShell) — default      |
 * | `vercel-fallback`| No process execution — shows an informational message  |
 * | `local`          | Reserved for a future Node.js / node-pty API route     |
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
 * Always returns the BrowserShellAdapter which works everywhere.
 */
export function createTerminalAdapter(workspace?: Workspace): TerminalAdapter {
  return new BrowserShellAdapter(workspace);
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

  constructor(workspace?: Workspace) {
    this.workspace = workspace;
  }

  /** Update workspace when files change. */
  updateWorkspace(workspace: Workspace) {
    this.workspace = workspace;
    this.shell?.setWorkspace(workspace);
  }

  async connect(handlers: TerminalHandlers): Promise<void> {
    const shell = new BrowserShell((data) => handlers.onData(data));
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
    this.shell = null;
  }
}

export class VercelFallbackAdapter implements TerminalAdapter {
  readonly info: TerminalRuntimeInfo = {
    kind: 'vercel-fallback' as TerminalRuntimeKind,
    label: 'Browser Shell',
    supportsExecution: true,
  };

  async connect(handlers: TerminalHandlers): Promise<void> {
    handlers.onData('\r\n\x1b[33m⚠  Fallback adapter\x1b[0m\r\n');
  }

  write(_data: string): void {}
  resize(_cols: number, _rows: number): void {}
  disconnect(): void {}
}
