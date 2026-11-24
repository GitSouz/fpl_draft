// Types and fetch helpers for the FPL *Draft* API (draft.premierleague.com),
// reached through the same-origin /api/fpldraft proxy (see vite.config.ts and
// api/fpldraft.js).
//
// ID gotcha: a manager has TWO ids. `league_entries[].id` (the "league entry")
// is what standings and H2H matches use; `league_entries[].entry_id` (the
// "entry") is what squads, waivers, trades and ownership use.

export type Pos = 'GKP' | 'DEF' | 'MID' | 'FWD';
export const POS_BY_TYPE: Record<number, Pos> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export interface DraftElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  total_points: number;
  event_points: number;
  form: string;
  points_per_game: string;
  minutes: number;
  goals_scored: number;
  assists: number;
  status: string;
  news: string;
  expected_goal_involvements?: string;
}

export interface DraftTeam {
  id: number;
  name: string;
  short_name: string;
}

export interface DraftEvent {
  id: number;
  name: string;
  finished: boolean;
  deadline_time: string;
}

export interface Bootstrap {
  elements: DraftElement[];
  teams: DraftTeam[];
  events: { current: number | null; next: number | null; data: DraftEvent[] };
}

export interface GameStatus {
  current_event: number | null;
  current_event_finished: boolean;
  next_event: number | null;
  waivers_processed: boolean;
}

export interface LeagueEntry {
  id: number; // league-entry id (standings / matches)
  entry_id: number | null; // entry id (squads / waivers / trades). null for the "Average" ghost.
  entry_name: string;
  player_first_name: string;
  player_last_name: string;
  short_name: string;
  waiver_pick?: number;
}

export interface Match {
  event: number;
  finished: boolean;
  started: boolean;
  league_entry_1: number;
  league_entry_1_points: number;
  league_entry_2: number;
  league_entry_2_points: number;
  winning_league_entry: number | null;
}

export interface Standing {
  league_entry: number;
  rank: number;
  last_rank: number | null;
  total: number;
  event_total?: number;
  matches_won?: number;
  matches_drawn?: number;
  matches_lost?: number;
  points_for?: number;
  points_against?: number;
}

export interface LeagueDetails {
  league: {
    id: number;
    name: string;
    scoring: 'h' | 'c'; // head-to-head or classic
    start_event: number;
    draft_status: string;
  };
  league_entries: LeagueEntry[];
  matches: Match[];
  standings: Standing[];
}

export interface Transaction {
  id: number;
  added: string;
  element_in: number;
  element_out: number;
  entry: number; // entry id
  event: number;
  kind: 'w' | 'f' | string; // waiver / free agent
  result: string; // 'a' = accepted
}

export interface Trade {
  id: number;
  event: number;
  offered_entry: number;
  received_entry: number;
  offer_time: string;
  response_time: string | null;
  state: string; // 'p' processed, 'a' accepted (awaiting veto window), others = declined/expired/etc
  tradeitem_set: { element_in: number; element_out: number }[];
}

export interface ElementStatus {
  element: number;
  owner: number | null; // entry id
  status: string;
}

export interface Choice {
  element: number;
  entry: number;
  round: number;
  pick: number;
  index: number;
  was_auto?: boolean;
}

export interface Pick {
  element: number;
  position: number; // 1-11 starting, 12-15 bench
  multiplier: number;
}

export interface EntryEvent {
  picks: Pick[];
  subs?: { element_in: number; element_out: number }[];
}

export interface LiveElement {
  stats: { total_points: number; minutes: number; bonus: number };
}

export interface EventLive {
  elements: Record<string, LiveElement>;
}

export interface EntryHistory {
  history: { event: number; points: number; total_points: number }[];
}

export class DraftApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api/fpldraft?path=${encodeURIComponent(path)}`);
  if (res.status === 503) {
    throw new DraftApiError(
      'FPL Draft is updating right now (daily maintenance or between seasons). Try again shortly.',
      503
    );
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    // A non-JSON error means our proxy (not FPL) answered — e.g. the Vercel
    // function isn't deployed. Don't report that as "league not found".
    if (!ct.includes('json')) {
      throw new DraftApiError(
        `Couldn’t reach the FPL Draft API through this site’s /api/fpldraft proxy (HTTP ${res.status}). Check the deployment includes api/fpldraft.js.`
      );
    }
    throw new DraftApiError(`FPL Draft API responded ${res.status} for ${path}`, res.status);
  }
  if (!ct.includes('json')) {
    throw new DraftApiError(
      'FPL Draft returned a non-JSON response — make sure the app is running via `npm run dev` or deployed with its /api proxy.'
    );
  }
  return res.json() as Promise<T>;
}

/** Same as get(), but resolves to `fallback` instead of throwing (for optional extras). */
async function soft<T>(path: string, fallback: T): Promise<T> {
  try {
    return await get<T>(path);
  } catch {
    return fallback;
  }
}

export interface LeagueBundle {
  bootstrap: Bootstrap;
  game: GameStatus;
  details: LeagueDetails;
  elementStatus: ElementStatus[];
  transactions: Transaction[];
  trades: Trade[];
  choices: Choice[];
  /** Squad for the current gameweek, keyed by entry id (automatic subs already applied). */
  picks: Record<number, Pick[]>;
  /** Live points for the current gameweek, keyed by element id. */
  live: Record<number, LiveElement>;
  /** Per-gameweek history, keyed by entry id (used for classic leagues). */
  history: Record<number, EntryHistory['history']>;
  currentEvent: number;
  fetchedAt: number;
}

export async function fetchLeague(leagueId: number): Promise<LeagueBundle> {
  const [bootstrap, game, details] = await Promise.all([
    get<Bootstrap>('bootstrap-static'),
    get<GameStatus>('game'),
    get<LeagueDetails>(`league/${leagueId}/details`).catch((e: unknown) => {
      if (e instanceof DraftApiError && e.status === 404) {
        throw new DraftApiError(`No FPL Draft league with ID ${leagueId}. Double-check the number.`, 404);
      }
      throw e;
    }),
  ]);

  const currentEvent = game.current_event ?? bootstrap.events.current ?? 1;
  const entries = details.league_entries.filter((e) => e.entry_id != null);
  const isClassic = details.league.scoring === 'c';

  const [es, tx, tr, ch, live, pickList, histList] = await Promise.all([
    soft<{ element_status: ElementStatus[] }>(`league/${leagueId}/element-status`, { element_status: [] }),
    soft<{ transactions: Transaction[] }>(`draft/league/${leagueId}/transactions`, { transactions: [] }),
    soft<{ trades: Trade[] }>(`draft/league/${leagueId}/trades`, { trades: [] }),
    soft<{ choices: Choice[] }>(`draft/${leagueId}/choices`, { choices: [] }),
    soft<EventLive>(`event/${currentEvent}/live`, { elements: {} }),
    Promise.all(
      entries.map((e) => soft<EntryEvent>(`entry/${e.entry_id}/event/${currentEvent}`, { picks: [] }))
    ),
    isClassic
      ? Promise.all(entries.map((e) => soft<EntryHistory>(`entry/${e.entry_id}/history`, { history: [] })))
      : Promise.resolve([] as EntryHistory[]),
  ]);

  const picks: Record<number, Pick[]> = {};
  const history: Record<number, EntryHistory['history']> = {};
  entries.forEach((e, i) => {
    picks[e.entry_id!] = applySubs(pickList[i].picks ?? [], pickList[i].subs ?? []);
    if (histList[i]) history[e.entry_id!] = histList[i].history ?? [];
  });

  const liveById: Record<number, LiveElement> = {};
  for (const [k, v] of Object.entries(live.elements ?? {})) liveById[Number(k)] = v;

  return {
    bootstrap,
    game,
    details,
    elementStatus: es.element_status ?? [],
    transactions: tx.transactions ?? [],
    trades: tr.trades ?? [],
    choices: ch.choices ?? [],
    picks,
    live: liveById,
    history,
    currentEvent,
    fetchedAt: Date.now(),
  };
}

/** Swap automatic substitutions into the XI so line-ups match the official score. */
function applySubs(picks: Pick[], subs: { element_in: number; element_out: number }[]): Pick[] {
  if (!subs.length) return picks;
  const out = picks.map((p) => ({ ...p }));
  for (const s of subs) {
    const a = out.find((p) => p.element === s.element_in);
    const b = out.find((p) => p.element === s.element_out);
    if (a && b) [a.position, b.position] = [b.position, a.position];
  }
  return out;
}
