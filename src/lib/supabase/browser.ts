'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_KEY, SUPABASE_URL, hasSupabase } from './env';

let client: SupabaseClient | null = null;

/** The one browser client, or null when Supabase isn't configured (local preview). */
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
    // events are often sent as the reader leaves (a tap out to an outlet, switching app):
    // keepalive lets that request finish after the page is hidden or frozen
    global: { fetch: (input, init) => fetch(input, String(input).includes('/rest/v1/events') ? { ...init, keepalive: true } : init) },
  });
  return client;
}
