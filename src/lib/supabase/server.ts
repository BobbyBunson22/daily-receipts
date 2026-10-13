import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

import { SUPABASE_KEY, SUPABASE_URL } from './env';

/** Server client that acts as the signed-in reader (reads their session cookie). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}

/** Anonymous client for public content (the edition), so pages can be cached. */
export function supabasePublic() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
