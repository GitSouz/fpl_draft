import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Online mode is only available when the app is configured with a Supabase
// project. Without these env vars the app runs in local-only mode and none of
// the online code paths are reachable.
// Normalize the URL to the bare project origin. The client appends
// "/rest/v1/..." itself, so a trailing slash or an accidental "/rest/v1"
// suffix produces a malformed path the Supabase gateway rejects with
// "Invalid path specified in request URL".
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '')
  .replace(/\/+$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

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
