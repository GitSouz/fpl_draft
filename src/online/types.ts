// Row shapes for the online (Supabase) tables.

export type DraftStatus = 'lobby' | 'drafting' | 'done';

export interface DraftSettings {
  timerSec: number;
  autoOnTimeout: boolean;
}

export interface DraftRow {
  id: string;
  code: string;
  status: DraftStatus;
  settings: DraftSettings;
  current_pick: number;
  deadline: string | null; // ISO timestamp
  created_at: string;
}

export interface SeatRow {
  id: string;
  draft_id: string;
  ordinal: number;
  name: string;
  claimed: boolean;
}

export interface PickRow {
  id: string;
  draft_id: string;
  overall: number;
  round: number;
  seat_id: string;
  player_id: number;
  auto: boolean;
}
