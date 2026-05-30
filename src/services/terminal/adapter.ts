/**
 * Terminal adapter interface.
 *
 * All terminal interactions (resize, write, output) go through this abstraction
 * so the UI component stays runtime-agnostic. Three adapter kinds exist:
 *
 * | Kind             | Description                                           |
 * |------------------|-------------------------------------------------------|
 * | `vercel-fallback`| No process execution — shows an informational message |
 * | `local`          | Talks to a Node.js API route (`/api/terminal`)        |
 * | `remote`         | TODO: Connect to a dedicated remote runner service    |
 *
 * @see {@link TerminalRuntimeInfo} for capability flags.
 */

import { TerminalRuntimeInfo, TerminalRuntimeKind } from '@/types';

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
 * - On Vercel or edge runtimes: returns the `VercelFallbackAdapter`.
 * - In local Node.js dev: returns the `LocalAdapter` (HTTP long-poll stub).
 *
 * TODO: Add detection for a remote runner service (WebSocket endpoint).
 */
export function createTerminalAdapter(): TerminalAdapter {
  // Detect Vercel at runtime via the environment variable injected by the platform.
  const isVercel =
    typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_VERCEL === '1' ||
      process.env.VERCEL === '1' ||
      process.env.NEXT_RUNTIME === 'edge');

  if (isVercel || typeof window === 'undefined') {
    return new VercelFallbackAdapter();
  }

  // In a browser context on a local Node server, use the local adapter.
  // TODO: Check for a remote runner capability flag / env var.
  return new LocalTerminalAdapter();
}

// ─── Vercel fallback adapter ──────────────────────────────────────────────────

/**
 * Fallback adapter used when running on Vercel or any serverless environment
 * where spawning processes is not supported.
 *
 * TODO: Replace with a remote runner adapter backed by a separate Node.js
 *       service (e.g. a Railway / Fly.io VM or a GitHub Codespace).
 */
export class VercelFallbackAdapter implements TerminalAdapter {
  readonly info: TerminalRuntimeInfo = {
    kind: 'vercel-fallback' as TerminalRuntimeKind,
    label: 'Serverless (no execution)',
    supportsExecution: false,
    unavailableReason:
      'Interactive terminal execution requires a persistent Node.js server. ' +
      'This environment (Vercel / Edge) does not support spawning processes. ' +
      'TODO: Connect a remote runner service to enable terminal execution.',
  };

  async connect(handlers: TerminalHandlers): Promise<void> {
    // Emit the informational banner to xterm so the user understands the limitation.
    const msg =
      '\r\n\x1b[33m⚠  Terminal execution is not available in this environment.\x1b[0m\r\n' +
      '\x1b[2m   Deploy this app on a Node.js server (e.g. local dev, Railway, Fly.io)\r\n' +
      '   to enable a real interactive terminal.\x1b[0m\r\n\r\n';
    handlers.onData(msg);
  }

  write(_data: string): void {
    // No-op: there is no process to write to.
  }

  resize(_cols: number, _rows: number): void {
    // No-op.
  }

  disconnect(): void {
    // No-op.
  }
}

// ─── Local adapter ────────────────────────────────────────────────────────────

/**
 * Terminal adapter for local `next dev` environments.
 *
 * Architecture:
 * - Sends POST /api/terminal to start a session.
 * - Receives output via Server-Sent Events (EventSource).
 * - Sends input via POST /api/terminal/input.
 *
 * TODO: Replace the HTTP polling architecture with a proper WebSocket connection
 *       using `node-pty` on the server to support full PTY (arrow keys, ANSI, etc.).
 *
 * TODO: Implement `/api/terminal` route with `node-pty` or `child_process.spawn`.
 *
 * NOTE: This adapter is a functional stub. It writes the same informational banner
 *       as the fallback until the API route is implemented.
 */
export class LocalTerminalAdapter implements TerminalAdapter {
  readonly info: TerminalRuntimeInfo = {
    kind: 'local' as TerminalRuntimeKind,
    label: 'Local Node.js (dev)',
    supportsExecution: false, // TODO: set to true once /api/terminal is implemented
    unavailableReason:
      'The /api/terminal endpoint is not yet implemented. ' +
      'TODO: Add node-pty + WebSocket support to enable interactive shell execution.',
  };

  private _handlers: TerminalHandlers | null = null;

  async connect(handlers: TerminalHandlers): Promise<void> {
    this._handlers = handlers;
    const msg =
      '\r\n\x1b[36m⬡  RodSandbox Terminal\x1b[0m \x1b[2m(local dev)\x1b[0m\r\n' +
      '\x1b[2m   Full PTY support coming soon.\r\n' +
      '   TODO: implement /api/terminal with node-pty.\x1b[0m\r\n\r\n';
    handlers.onData(msg);
  }

  write(_data: string): void {
    if (!this._handlers) return;
    // TODO: forward _data to the server-sent PTY session.
  }

  resize(_cols: number, _rows: number): void {
    // TODO: send resize event to server PTY via API.
  }

  disconnect(): void {
    this._handlers = null;
    // TODO: close the SSE connection and kill the server process.
  }
}
