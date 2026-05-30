import { NextRequest, NextResponse } from 'next/server';
import { sessions } from '../sessions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sid') ?? '';
  const session = sessions.get(sid);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const cols = Number(body.cols) || 80;
  const rows = Number(body.rows) || 24;
  session.ptyProcess.resize(cols, rows);
  return NextResponse.json({ ok: true });
}
