'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_KEY, SUPABASE_URL, hasSupabase } from './env';

let client: SupabaseClient | null = null;

/** The one browser client, or null when Supabase isn't configured (local preview). */
export function supabaseBrowser(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
