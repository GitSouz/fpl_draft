import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Online mode is only available when the app is configured with a Supabase
// project. Without these env vars the app runs in local-only mode and none of
// the online code paths are reachable.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const onlineEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = onlineEnabled
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

/** Narrowing helper so callers get a non-null client or a clear error. */
export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error('Online mode is not configured (missing Supabase env vars).');
  }
  return supabase;
}
