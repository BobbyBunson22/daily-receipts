import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

import { supabaseServer } from '../../../lib/supabase/server';

/**
 * Where the sign-in email's button lands (see supabase/templates/sign-in.html).
 * Verifies the one-time token directly, so the link works in any browser or email app,
 * not only the one that asked for it.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = (url.searchParams.get('type') ?? 'email') as EmailOtpType;
  const nextParam = url.searchParams.get('next') ?? '/';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  if (tokenHash) {
    const db = await supabaseServer();
    const { error } = await db.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL('/signin?error=link', url.origin));
}
