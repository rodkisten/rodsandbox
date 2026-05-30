/**
 * Terminal API route — real PTY sessions via node-pty.
 *
 * Architecture:
 * - POST /api/terminal           → create session, returns { sessionId }
 * - GET  /api/terminal?sid=...   → SSE stream of PTY output
 *
 * NOTE: Requires Node.js runtime (not Edge). Works during `next dev` and on
 * any self-hosted Node.js server (Railway, Fly.io, etc.).
 * Not compatible with Vercel serverless due to native binaries and long-lived connections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sessions, createSession } from './sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/terminal → create a new PTY session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cols = Number(body.cols) || 80;
    const rows = Number(body.rows) || 24;
    const sid = createSession(cols, rows);
    return NextResponse.json({ sessionId: sid });
  } catch (err) {
    console.error('[terminal] POST error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/terminal?sid=... → SSE stream of PTY output
export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sid') ?? '';
  const session = sessions.get(sid);

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send buffered output that arrived before the client connected.
      for (const chunk of session.buffer) {
        const payload = `data: ${JSON.stringify({ data: chunk })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }
      session.buffer = [];

      // Register live output handler.
      session.onData = (data: string) => {
        try {
          const payload = `data: ${JSON.stringify({ data })}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected — ignore.
        }
      };

      // Keep-alive ping every 15 s.
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15_000);

      session.cleanup = () => {
        clearInterval(pingInterval);
        try { controller.close(); } catch { /* ignore */ }
      };
    },
    cancel() {
      const s = sessions.get(sid);
      if (s) s.onData = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
