/**
 * Shared PTY session store for the terminal API routes.
 * Lives in the Node.js module cache so sessions are shared across route handlers.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require('node-pty') as typeof import('node-pty');

export interface PtySession {
  ptyProcess: ReturnType<typeof pty.spawn>;
  buffer: string[];
  onData: ((data: string) => void) | null;
  cleanup: (() => void) | null;
}

/** In-process session store. Keys are random session IDs. */
export const sessions = new Map<string, PtySession>();

/** Generate a random session ID. */
function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Spawn a new PTY and register it in the session map. Returns the session ID. */
export function createSession(cols: number, rows: number): string {
  const sid = randomId();

  const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? 'bash');

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    } as Record<string, string>,
  });

  const session: PtySession = {
    ptyProcess,
    buffer: [],
    onData: null,
    cleanup: null,
  };

  ptyProcess.onData((data: string) => {
    if (session.onData) {
      session.onData(data);
    } else {
      // Buffer output until the SSE client connects.
      session.buffer.push(data);
    }
  });

  ptyProcess.onExit(() => {
    session.cleanup?.();
    sessions.delete(sid);
  });

  sessions.set(sid, session);
  return sid;
}

/** Kill and remove a session. */
export function killSession(sid: string): boolean {
  const session = sessions.get(sid);
  if (!session) return false;
  try {
    session.ptyProcess.kill();
  } catch {
    // Ignore if already dead.
  }
  session.cleanup?.();
  sessions.delete(sid);
  return true;
}
