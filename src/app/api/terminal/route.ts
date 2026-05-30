/**
 * Terminal API route — stub for future PTY/shell execution.
 *
 * TODO: Implement a real PTY session using `node-pty`:
 *
 * ```ts
 * import pty from 'node-pty';
 * const term = pty.spawn('bash', [], { name: 'xterm-256color', cols: 80, rows: 24 });
 * ```
 *
 * Architecture:
 * - POST /api/terminal      → start session, return sessionId
 * - GET  /api/terminal      → SSE stream for output (by ?sessionId=)
 * - POST /api/terminal/input → send input to running PTY
 * - POST /api/terminal/resize → resize the PTY
 *
 * NOTE: This route is not compatible with Vercel serverless functions because:
 *  1. Vercel functions time out after 10–30 s — not suitable for long-lived connections.
 *  2. `node-pty` spawns native processes, which Vercel's sandboxed environment does not allow.
 *  3. Persistent state (session map) cannot be shared across function invocations.
 *
 * Deploy on a Node.js server (Railway, Fly.io, self-hosted) to enable this endpoint.
 *
 * @see {@link LocalTerminalAdapter} in `src/services/terminal/adapter.ts`
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Terminal execution is not yet implemented.',
      hint: 'TODO: Add node-pty integration. See src/app/api/terminal/route.ts for details.',
    },
    { status: 501 },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'Terminal SSE stream is not yet implemented.',
      hint: 'TODO: Return a Server-Sent Events stream of PTY output.',
    },
    { status: 501 },
  );
}
