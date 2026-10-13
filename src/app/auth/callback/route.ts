import { NextResponse, type NextRequest } from 'next/server';

import { supabaseServer } from '../../../lib/supabase/server';

/** The sign-in link (email or Google) lands here; swap the one-time code for a session. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/';
  // only ever send people back into this site
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  if (code) {
    const db = await supabaseServer();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL('/signin?error=link', url.origin));
}
