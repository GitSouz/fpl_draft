// Turns the raw API bundle into everything the dashboard shows. Pure functions,
// no React — easy to reason about and test.

import { POS_BY_TYPE, type DraftElement, type LeagueBundle, type Pos } from './api';

export interface Manager {
  leId: number; // league-entry id
  entryId: number; // entry id
  team: string; // entry (team) name
  owner: string; // manager's real name
  short: string;
}

export interface PlayerInfo {
  id: number;
  name: string;
  fullName: string;
  team: string;
  pos: Pos;
  total: number;
  gw: number; // points this gameweek (live)
  minutesGw: number;
  form: number;
  status: string;
  news: string;
  ownerEntry: number | null;
}

export type Result = 'W' | 'D' | 'L';

export interface StandingRow {
  manager: Manager;
  rank: number;
  lastRank: number | null;
  w: number;
  d: number;
  l: number;
  pf: number;
  pa: number;
  total: number; // league points (H2H) or points scored (classic)
  form: { gw: number; result?: Result; score: number }[];
  allPlay: { w: number; d: number; l: number; pct: number };
  luck: number; // actual wins − all-play expected wins (H2H only)
  best: number;
  worst: number;
  avg: number;
}

export interface Fixture {
  gw: number;
  a: Manager;
  b: Manager;
  aPts: number;
  bPts: number;
  finished: boolean;
  started: boolean;
}

export interface RecordItem {
  label: string;
  value: string;
  who: string;
  detail: string;
}

export interface SquadPlayer extends PlayerInfo {
  slot: number; // 1-15, 99 if unknown
  starting: boolean;
}

export interface Move {
  key: string;
  gw: number;
  time: string;
  kind: 'Waiver' | 'Free agent' | 'Trade';
  manager: Manager;
  other?: Manager;
  ins: PlayerInfo[];
  outs: PlayerInfo[];
}

export interface DraftPickView {
  round: number;
  pick: number;
  manager: Manager;
  player: PlayerInfo;
  stillOwned: boolean;
}

export interface Model {
  leagueName: string;
  isH2H: boolean;
  currentGw: number;
  currentFinished: boolean;
  managers: Manager[];
  byLe: Map<number, Manager>;
  byEntry: Map<number, Manager>;
  players: Map<number, PlayerInfo>;
  /** score[leId][gw] */
  scores: Map<number, Map<number, number>>;
  gws: number[]; // gameweeks that have scores, ascending
  standings: StandingRow[];
  /** position[leId] = rank after each gw in `gws` */
  positions: Map<number, number[]>;
  fixtures: Fixture[];
  records: RecordItem[];
  squads: Map<number, SquadPlayer[]>; // by entry id
  liveScores: Map<number, number>; // entry id -> live starting-XI points this GW
  moves: Move[];
  draft: DraftPickView[];
  freeAgents: PlayerInfo[];
  fetchedAt: number;
}

const num = (s: string | undefined) => {
  const n = parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
};

function playerInfo(
  e: DraftElement,
  teams: Map<number, string>,
  live: LeagueBundle['live'],
  owners: Map<number, number | null>
): PlayerInfo {
  const l = live[e.id]?.stats;
  return {
    id: e.id,
    name: e.web_name,
    fullName: `${e.first_name} ${e.second_name}`.trim(),
    team: teams.get(e.team) ?? '???',
    pos: POS_BY_TYPE[e.element_type] ?? 'MID',
    total: e.total_points,
    gw: l ? l.total_points : e.event_points ?? 0,
    minutesGw: l ? l.minutes : 0,
    form: num(e.form),
    status: e.status,
    news: e.news,
    ownerEntry: owners.get(e.id) ?? null,
  };
}

const unknownPlayer = (id: number): PlayerInfo => ({
  id,
  name: `#${id}`,
  fullName: `Player ${id}`,
  team: '???',
  pos: 'MID',
  total: 0,
  gw: 0,
  minutesGw: 0,
  form: 0,
  status: 'u',
  news: '',
  ownerEntry: null,
});

export function buildModel(b: LeagueBundle): Model {
  const { details } = b;
  const isH2H = details.league.scoring !== 'c';
  const currentGw = b.currentEvent;
  const currentFinished = b.game.current_event_finished;

  // ---- managers ----
  const managers: Manager[] = details.league_entries
    .filter((e) => e.entry_id != null)
    .map((e) => ({
      leId: e.id,
      entryId: e.entry_id!,
      team: e.entry_name,
      owner: `${e.player_first_name} ${e.player_last_name}`.trim(),
      short: e.short_name || e.entry_name.slice(0, 3).toUpperCase(),
    }));
  const byLe = new Map(managers.map((m) => [m.leId, m]));
  const byEntry = new Map(managers.map((m) => [m.entryId, m]));

  // ---- players ----
  const teams = new Map(b.bootstrap.teams.map((t) => [t.id, t.short_name]));
  const owners = new Map<number, number | null>(b.elementStatus.map((s) => [s.element, s.owner]));
  // If element-status is missing, infer ownership from the current squads.
  if (owners.size === 0) {
    for (const [entry, picks] of Object.entries(b.picks)) for (const p of picks) owners.set(p.element, Number(entry));
  }
  const players = new Map<number, PlayerInfo>();
  for (const e of b.bootstrap.elements) players.set(e.id, playerInfo(e, teams, b.live, owners));
  const P = (id: number) => players.get(id) ?? unknownPlayer(id);

  // ---- squads + live scores ----
  const squads = new Map<number, SquadPlayer[]>();
  const liveScores = new Map<number, number>();
  for (const m of managers) {
    const picks = b.picks[m.entryId] ?? [];
    let squad: SquadPlayer[];
    if (picks.length) {
      squad = picks
        .map((p) => ({ ...P(p.element), slot: p.position, starting: p.position <= 11 }))
        .sort((x, y) => x.slot - y.slot);
      liveScores.set(
        m.entryId,
        picks.filter((p) => p.position <= 11).reduce((s, p) => s + P(p.element).gw * (p.multiplier || 1), 0)
      );
    } else {
      const order: Record<Pos, number> = { GKP: 0, DEF: 1, MID: 2, FWD: 3 };
      squad = [...players.values()]
        .filter((p) => p.ownerEntry === m.entryId)
        .sort((x, y) => order[x.pos] - order[y.pos] || y.total - x.total)
        .map((p) => ({ ...p, slot: 99, starting: true }));
    }
    squads.set(m.entryId, squad);
  }

  // ---- per-gameweek scores ----
  const scores = new Map<number, Map<number, number>>(managers.map((m) => [m.leId, new Map()]));
  const fixtures: Fixture[] = [];
  const liveGw = !currentFinished;
  if (isH2H) {
    for (const x of details.matches) {
      const a = byLe.get(x.league_entry_1);
      const bb = byLe.get(x.league_entry_2);
      if (!a || !bb) continue;
      let aPts = x.league_entry_1_points;
      let bPts = x.league_entry_2_points;
      // For the in-progress gameweek, prefer our live XI calculation if the
      // match feed lags behind.
      if (x.event === currentGw && liveGw && x.started) {
        aPts = Math.max(aPts, liveScores.get(a.entryId) ?? 0);
        bPts = Math.max(bPts, liveScores.get(bb.entryId) ?? 0);
      }
      fixtures.push({ gw: x.event, a, b: bb, aPts, bPts, finished: x.finished, started: x.started });
      if (x.started || x.finished) {
        scores.get(a.leId)!.set(x.event, aPts);
        scores.get(bb.leId)!.set(x.event, bPts);
      }
    }
  } else {
    for (const m of managers) {
      for (const h of b.history[m.entryId] ?? []) scores.get(m.leId)!.set(h.event, h.points);
      if (liveGw && liveScores.has(m.entryId)) {
        const cur = scores.get(m.leId)!.get(currentGw) ?? 0;
        scores.get(m.leId)!.set(currentGw, Math.max(cur, liveScores.get(m.entryId)!));
      }
    }
  }
  const gwSet = new Set<number>();
  for (const s of scores.values()) for (const g of s.keys()) gwSet.add(g);
  const gws = [...gwSet].sort((x, y) => x - y);
  // Gameweeks that count for "settled" stats (all-play, records): finished ones.
  const settledGws = gws.filter((g) => g < currentGw || currentFinished);

  // ---- all-play record ----
  const allPlay = new Map(managers.map((m) => [m.leId, { w: 0, d: 0, l: 0 }]));
  for (const g of settledGws) {
    const row = managers
      .map((m) => ({ m, s: scores.get(m.leId)!.get(g) }))
      .filter((r): r is { m: Manager; s: number } => r.s != null);
    for (const r of row) {
      const ap = allPlay.get(r.m.leId)!;
      for (const o of row) {
        if (o === r) continue;
        if (r.s > o.s) ap.w++;
        else if (r.s < o.s) ap.l++;
        else ap.d++;
      }
    }
  }

  // ---- standings ----
  const resultFor = (f: Fixture, leId: number): Result | undefined => {
    if (!f.finished) return undefined;
    const mine = f.a.leId === leId ? f.aPts : f.bPts;
    const theirs = f.a.leId === leId ? f.bPts : f.aPts;
    return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
  };
  const apiStanding = new Map(details.standings.map((s) => [s.league_entry, s]));
  let standings: StandingRow[] = managers.map((m) => {
    const st = apiStanding.get(m.leId);
    const my = fixtures.filter((f) => f.a.leId === m.leId || f.b.leId === m.leId);
    const done = my.filter((f) => f.finished);
    let w = 0, d = 0, l = 0, pa = 0;
    for (const f of done) {
      const r = resultFor(f, m.leId);
      if (r === 'W') w++;
      else if (r === 'D') d++;
      else l++;
      pa += f.a.leId === m.leId ? f.bPts : f.aPts;
    }
    const sc = settledGws.map((g) => scores.get(m.leId)!.get(g)).filter((x): x is number => x != null);
    const pf = sc.reduce((a, x) => a + x, 0);
    const ap = allPlay.get(m.leId)!;
    const apGames = ap.w + ap.d + ap.l;
    const apPct = apGames ? (ap.w + ap.d / 2) / apGames : 0;
    const luck = isH2H ? w + d / 2 - apPct * done.length : 0;
    const form = isH2H
      ? done.slice(-5).map((f) => ({
          gw: f.gw,
          result: resultFor(f, m.leId),
          score: f.a.leId === m.leId ? f.aPts : f.bPts,
        }))
      : settledGws.slice(-5).map((g) => ({ gw: g, score: scores.get(m.leId)!.get(g) ?? 0 }));
    return {
      manager: m,
      rank: st?.rank ?? 0,
      lastRank: st?.last_rank ?? null,
      w: st?.matches_won ?? w,
      d: st?.matches_drawn ?? d,
      l: st?.matches_lost ?? l,
      pf: st?.points_for ?? pf,
      pa: st?.points_against ?? pa,
      total: st?.total ?? (isH2H ? w * 3 + d : pf),
      form,
      allPlay: { ...ap, pct: apPct },
      luck,
      best: sc.length ? Math.max(...sc) : 0,
      worst: sc.length ? Math.min(...sc) : 0,
      avg: sc.length ? pf / sc.length : 0,
    };
  });
  standings.sort((x, y) => (x.rank && y.rank ? x.rank - y.rank : y.total - x.total || y.pf - x.pf));
  standings = standings.map((s, i) => ({ ...s, rank: s.rank || i + 1 }));

  // ---- position after each gameweek (rank race) ----
  const positions = new Map<number, number[]>(managers.map((m) => [m.leId, []]));
  const cum = new Map(managers.map((m) => [m.leId, { pts: 0, pf: 0 }]));
  for (const g of gws) {
    for (const m of managers) {
      const c = cum.get(m.leId)!;
      const s = scores.get(m.leId)!.get(g) ?? 0;
      c.pf += s;
      if (isH2H) {
        const f = fixtures.find((x) => x.gw === g && (x.a.leId === m.leId || x.b.leId === m.leId));
        const r = f && (f.finished || f.started) ? provisional(f, m.leId) : undefined;
        c.pts += r === 'W' ? 3 : r === 'D' ? 1 : 0;
      } else c.pts += s;
    }
    const order = [...managers].sort((x, y) => {
      const a = cum.get(x.leId)!, bb = cum.get(y.leId)!;
      return bb.pts - a.pts || bb.pf - a.pf;
    });
    order.forEach((m, i) => positions.get(m.leId)!.push(i + 1));
  }

  // Fall back to the computed previous-gameweek position for movement arrows
  // when the API doesn't supply last_rank.
  standings = standings.map((s) => {
    if (s.lastRank != null) return s;
    const p = positions.get(s.manager.leId)!;
    return { ...s, lastRank: p.length >= 2 ? p[p.length - 2] : null };
  });

  // ---- records ----
  const records: RecordItem[] = [];
  const allScores: { m: Manager; gw: number; s: number }[] = [];
  for (const m of managers)
    for (const g of settledGws) {
      const s = scores.get(m.leId)!.get(g);
      if (s != null) allScores.push({ m, gw: g, s });
    }
  if (allScores.length) {
    const hi = allScores.reduce((a, x) => (x.s > a.s ? x : a));
    const lo = allScores.reduce((a, x) => (x.s < a.s ? x : a));
    records.push({ label: 'Highest gameweek', value: `${hi.s}`, who: hi.m.team, detail: `GW${hi.gw}` });
    records.push({ label: 'Lowest gameweek', value: `${lo.s}`, who: lo.m.team, detail: `GW${lo.gw}` });
  }
  const done = fixtures.filter((f) => f.finished && f.aPts !== f.bPts);
  if (done.length) {
    const margin = (f: Fixture) => Math.abs(f.aPts - f.bPts);
    const win = (f: Fixture) => (f.aPts > f.bPts ? { w: f.a, l: f.b, ws: f.aPts, ls: f.bPts } : { w: f.b, l: f.a, ws: f.bPts, ls: f.aPts });
    const big = done.reduce((a, x) => (margin(x) > margin(a) ? x : a));
    const close = done.reduce((a, x) => (margin(x) < margin(a) ? x : a));
    const unluckiest = done.reduce((a, x) => (win(x).ls > win(a).ls ? x : a));
    const jammiest = done.reduce((a, x) => (win(x).ws < win(a).ws ? x : a));
    const bw = win(big), cw = win(close), uw = win(unluckiest), jw = win(jammiest);
    records.push({ label: 'Biggest win', value: `+${margin(big)}`, who: bw.w.team, detail: `${bw.ws}–${bw.ls} vs ${bw.l.team}, GW${big.gw}` });
    records.push({ label: 'Closest win', value: `+${margin(close)}`, who: cw.w.team, detail: `${cw.ws}–${cw.ls} vs ${cw.l.team}, GW${close.gw}` });
    records.push({ label: 'Most points in a loss', value: `${uw.ls}`, who: uw.l.team, detail: `lost ${uw.ls}–${uw.ws} to ${uw.w.team}, GW${unluckiest.gw}` });
    records.push({ label: 'Fewest points in a win', value: `${jw.ws}`, who: jw.w.team, detail: `beat ${jw.l.team} ${jw.ws}–${jw.ls}, GW${jammiest.gw}` });
  }
  if (isH2H && standings.length) {
    const lucky = standings.reduce((a, x) => (x.luck > a.luck ? x : a));
    const unlucky = standings.reduce((a, x) => (x.luck < a.luck ? x : a));
    const sign = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));
    records.push({ label: 'Luckiest manager', value: sign(lucky.luck), who: lucky.manager.team, detail: 'more wins than their scores deserve' });
    records.push({ label: 'Unluckiest manager', value: sign(unlucky.luck), who: unlucky.manager.team, detail: 'fewer wins than their scores deserve' });
  }

  // ---- transfers ----
  const moves: Move[] = [];
  for (const t of b.transactions) {
    if (t.result !== 'a') continue;
    const m = byEntry.get(t.entry);
    if (!m) continue;
    moves.push({
      key: `t${t.id}`,
      gw: t.event,
      time: t.added,
      kind: t.kind === 'w' ? 'Waiver' : 'Free agent',
      manager: m,
      ins: [P(t.element_in)],
      outs: [P(t.element_out)],
    });
  }
  for (const t of b.trades) {
    if (t.state !== 'p' && t.state !== 'a') continue;
    const m = byEntry.get(t.offered_entry);
    const o = byEntry.get(t.received_entry);
    if (!m || !o) continue;
    moves.push({
      key: `x${t.id}`,
      gw: t.event,
      time: t.response_time ?? t.offer_time,
      kind: 'Trade',
      manager: m,
      other: o,
      ins: t.tradeitem_set.map((i) => P(i.element_in)),
      outs: t.tradeitem_set.map((i) => P(i.element_out)),
    });
  }
  moves.sort((x, y) => (y.time ?? '').localeCompare(x.time ?? ''));

  // ---- draft review ----
  const draft: DraftPickView[] = b.choices
    .filter((c) => byEntry.has(c.entry) && c.element)
    .sort((x, y) => x.index - y.index)
    .map((c) => ({
      round: c.round,
      pick: c.pick,
      manager: byEntry.get(c.entry)!,
      player: P(c.element),
      stillOwned: P(c.element).ownerEntry === c.entry,
    }));

  const freeAgents = [...players.values()]
    .filter((p) => p.ownerEntry == null && p.status !== 'u')
    .sort((x, y) => y.form - x.form || y.total - x.total);

  return {
    leagueName: details.league.name,
    isH2H,
    currentGw,
    currentFinished,
    managers,
    byLe,
    byEntry,
    players,
    scores,
    gws,
    standings,
    positions,
    fixtures,
    records,
    squads,
    liveScores,
    moves,
    draft,
    freeAgents,
    fetchedAt: b.fetchedAt,
  };
}

/** Result of a fixture as it stands (including live, unfinished matches). */
function provisional(f: Fixture, leId: number): Result {
  const mine = f.a.leId === leId ? f.aPts : f.bPts;
  const theirs = f.a.leId === leId ? f.bPts : f.aPts;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}
