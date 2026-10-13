import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_KEY, SUPABASE_URL, hasSupabase } from './lib/supabase/env';

/**
 * Keeps sign-in sessions fresh on the pages that read them (the admin page and the
 * sign-in callback). The edition page itself is public and cached, so it skips this.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasSupabase()) return response;
  const db = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await db.auth.getUser();
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
