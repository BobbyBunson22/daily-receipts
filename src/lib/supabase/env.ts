/** Public Supabase settings. Both are safe to ship to the browser; row-level security does the guarding. */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const hasSupabase = () => !!(SUPABASE_URL && SUPABASE_KEY);
