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
  const data: string = body.data ?? '';
  session.ptyProcess.write(data);
  return NextResponse.json({ ok: true });
}
