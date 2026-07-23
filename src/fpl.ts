// Types and fetch helpers for the official Fantasy Premier League API.
// We only pull the small subset of fields the draft board needs.

export interface RawElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number; // team id
  element_type: number; // 1 GK, 2 DEF, 3 MID, 4 FWD
  now_cost: number; // price * 10
  total_points: number;
  form: string;
  points_per_game: string;
  selected_by_percent: string;
  status: string; // 'a' available, 'i' injured, 'd' doubtful, 's' suspended, 'u' unavailable
  news: string;
}

export interface RawTeam {
  id: number;
  name: string;
  short_name: string;
}

export interface RawElementType {
  id: number;
  singular_name_short: string; // GKP / DEF / MID / FWD
  plural_name: string;
}

interface Bootstrap {
  elements: RawElement[];
  teams: RawTeam[];
  element_types: RawElementType[];
}

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

const POSITION_BY_TYPE: Record<number, Position> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

// Flattened, UI-friendly player record.
export interface Player {
  id: number;
  name: string; // web_name (short display name)
  fullName: string;
  teamId: number;
  teamShort: string;
  teamName: string;
  position: Position;
  price: number; // in millions, e.g. 12.5
  totalPoints: number;
  form: number;
  pointsPerGame: number;
  selectedByPercent: number;
  status: string;
  news: string;
}

const num = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export async function fetchPlayers(): Promise<Player[]> {
  const res = await fetch('/api/fpl/bootstrap-static/');
  if (!res.ok) {
    throw new Error(`FPL API responded ${res.status} ${res.statusText}`);
  }
  const data: Bootstrap = await res.json();

  const teamById = new Map<number, RawTeam>();
  for (const t of data.teams) teamById.set(t.id, t);

  return data.elements.map((e): Player => {
    const team = teamById.get(e.team);
    return {
      id: e.id,
      name: e.web_name,
      fullName: `${e.first_name} ${e.second_name}`.trim(),
      teamId: e.team,
      teamShort: team?.short_name ?? '???',
      teamName: team?.name ?? 'Unknown',
      position: POSITION_BY_TYPE[e.element_type] ?? 'MID',
      price: e.now_cost / 10,
      totalPoints: e.total_points,
      form: num(e.form),
      pointsPerGame: num(e.points_per_game),
      selectedByPercent: num(e.selected_by_percent),
      status: e.status,
      news: e.news,
    };
  });
}
