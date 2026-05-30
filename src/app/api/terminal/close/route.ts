import { NextRequest, NextResponse } from 'next/server';
import { killSession } from '../sessions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get('sid') ?? '';
  const killed = killSession(sid);
  if (!killed) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
