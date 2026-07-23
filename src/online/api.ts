import type { Player } from '../fpl';
import { db } from './supabase';
import type { DraftRow, DraftSettings, PickRow, SeatRow } from './types';

// --- Mutations (RPCs) ------------------------------------------------------

export interface CreatedDraft {
  draft_id: string;
  code: string;
  host_token: string;
}

export async function createDraft(
  settings: DraftSettings,
  seatNames: string[],
  players: Player[]
): Promise<CreatedDraft> {
  const { data, error } = await db().rpc('create_draft', {
    _settings: settings,
    _seat_names: seatNames,
    _players: players,
  });
  if (error) throw new Error(error.message);
  // Postgres set-returning function comes back as an array of one row.
  const row = Array.isArray(data) ? data[0] : data;
  return row as CreatedDraft;
}

export async function claimSeat(code: string, seatId: string): Promise<string> {
  const { data, error } = await db().rpc('claim_seat', {
    _code: code,
    _seat_id: seatId,
  });
  if (error) throw new Error(error.message);
  return data as string; // claim_token
}

export async function releaseSeat(claimToken: string): Promise<void> {
  const { error } = await db().rpc('release_seat', { _claim_token: claimToken });
  if (error) throw new Error(error.message);
}

export async function startDraft(hostToken: string): Promise<void> {
  const { error } = await db().rpc('start_draft', { _host_token: hostToken });
  if (error) throw new Error(error.message);
}

export async function makePick(claimToken: string, playerId: number): Promise<void> {
  const { error } = await db().rpc('make_pick', {
    _claim_token: claimToken,
    _player_id: playerId,
  });
  if (error) throw new Error(error.message);
}

export async function autoPick(draftId: string, hostToken?: string): Promise<void> {
  const { error } = await db().rpc('auto_pick', {
    _draft_id: draftId,
    _host_token: hostToken ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function undoPick(hostToken: string): Promise<void> {
  const { error } = await db().rpc('undo_pick', { _host_token: hostToken });
  if (error) throw new Error(error.message);
}

// --- Reads -----------------------------------------------------------------

export async function fetchDraftByCode(code: string): Promise<DraftRow | null> {
  const { data, error } = await db()
    .from('drafts')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow) ?? null;
}

export async function fetchDraftById(id: string): Promise<DraftRow | null> {
  const { data, error } = await db().from('drafts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DraftRow) ?? null;
}

export async function fetchSeats(draftId: string): Promise<SeatRow[]> {
  const { data, error } = await db()
    .from('seats')
    .select('*')
    .eq('draft_id', draftId)
    .order('ordinal');
  if (error) throw new Error(error.message);
  return (data as SeatRow[]) ?? [];
}

export async function fetchPicks(draftId: string): Promise<PickRow[]> {
  const { data, error } = await db()
    .from('picks')
    .select('*')
    .eq('draft_id', draftId)
    .order('overall');
  if (error) throw new Error(error.message);
  return (data as PickRow[]) ?? [];
}

export async function fetchPool(draftId: string): Promise<Player[]> {
  // The pool can be ~600 rows; page through to avoid the default 1000 cap being
  // an issue and to keep payloads reasonable.
  const { data, error } = await db()
    .from('draft_players')
    .select('data')
    .eq('draft_id', draftId);
  if (error) throw new Error(error.message);
  return ((data as { data: Player }[]) ?? []).map((r) => r.data);
}
