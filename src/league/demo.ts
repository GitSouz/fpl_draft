// Builds a fake-but-plausible 10-team H2H league on top of the REAL player
// list, so the dashboard can be explored without a league ID. Seeded, so the
// demo looks the same on every load.

import type { Bootstrap, Choice, LeagueBundle, LeagueEntry, Match, Pick, Transaction } from './api';

const TEAMS = [
  ['Haaland Globetrotters', 'Alex', 'Morgan'],
  ['Saka Potatoes', 'Sam', 'Patel'],
  ['Cole Palmer Violet', 'Jordan', 'Reid'],
  ['Expected Toulouse', 'Chris', 'Okafor'],
  ['Murphy’s Law', 'Taylor', 'Nguyen'],
  ['Isak to the Future', 'Jamie', 'Kowalski'],
  ['Trent Reznor', 'Riley', 'Santos'],
  ['Pope John Paul', 'Casey', 'Lindqvist'],
  ['Bowen Arrow', 'Drew', 'Adeyemi'],
  ['No Kane No Gain', 'Robin', 'Fischer'],
];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function buildDemoBundle(bootstrap: Bootstrap, currentEvent: number, currentFinished: boolean): LeagueBundle {
  const rand = rng(42);
  const n = TEAMS.length;
  const entries: LeagueEntry[] = TEAMS.map(([team, first, last], i) => ({
    id: 1000 + i,
    entry_id: 5000 + i,
    entry_name: team,
    player_first_name: first,
    player_last_name: last,
    short_name: team.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
  }));

  // --- snake draft by total points (with some noise), respecting 2/5/5/3 ---
  const caps: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 };
  const pool = bootstrap.elements
    .map((e) => ({ e, v: e.total_points + rand() * 25 }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.e);
  const taken = new Set<number>();
  const squads: number[][] = entries.map(() => []);
  const counts = entries.map(() => ({ 1: 0, 2: 0, 3: 0, 4: 0 }) as Record<number, number>);
  const choices: Choice[] = [];
  let index = 0;
  for (let round = 1; round <= 15; round++) {
    const order = round % 2 ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    order.forEach((t, pickInRound) => {
      const el = pool.find((e) => !taken.has(e.id) && counts[t][e.element_type] < caps[e.element_type]);
      if (!el) return;
      taken.add(el.id);
      squads[t].push(el.id);
      counts[t][el.element_type]++;
      choices.push({ element: el.id, entry: entries[t].entry_id!, round, pick: pickInRound + 1, index: index++ });
    });
  }

  // --- a few waivers / free agent moves ---
  const byId = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const freePool = bootstrap.elements
    .filter((e) => !taken.has(e.id))
    .sort((a, b) => parseFloat(b.form) - parseFloat(a.form));
  const transactions: Transaction[] = [];
  let txId = 1;
  for (let gw = 2; gw <= currentEvent; gw++) {
    const movers = Math.floor(rand() * 4) + 1;
    for (let k = 0; k < movers; k++) {
      const t = Math.floor(rand() * n);
      const outIdx = Math.floor(rand() * squads[t].length);
      const out = squads[t][outIdx];
      const outType = byId.get(out)!.element_type;
      const inn = freePool.find((e) => e.element_type === outType && !taken.has(e.id));
      if (!inn) continue;
      taken.add(inn.id);
      taken.delete(out);
      squads[t][outIdx] = inn.id;
      const day = String(Math.min(28, gw * 2)).padStart(2, '0');
      transactions.push({
        id: txId++,
        added: `2026-${gw < 6 ? '09' : gw < 10 ? '10' : '11'}-${day}T1${k}:00:00Z`,
        element_in: inn.id,
        element_out: out,
        entry: entries[t].entry_id!,
        event: gw,
        kind: rand() < 0.6 ? 'w' : 'f',
        result: 'a',
      });
    }
  }

  // --- current-gameweek picks: 1 GK, 4 DEF, 4 MID, 2 FWD start; rest bench ---
  const picks: Record<number, Pick[]> = {};
  squads.forEach((sq, t) => {
    const byType = (ty: number) =>
      sq.filter((id) => byId.get(id)!.element_type === ty).sort((a, b) => byId.get(b)!.total_points - byId.get(a)!.total_points);
    const [g, d, m, f] = [1, 2, 3, 4].map(byType);
    const xi = [g[0], ...d.slice(0, 4), ...m.slice(0, 4), ...f.slice(0, 2)];
    const bench = [g[1], d[4], m[4], f[2]].filter((x) => x != null);
    picks[entries[t].entry_id!] = [...xi, ...bench].map((element, i) => ({ element, position: i + 1, multiplier: 1 }));
  });
  const liveScore = (t: number) =>
    picks[entries[t].entry_id!].filter((p) => p.position <= 11).reduce((s, p) => s + (byId.get(p.element)!.event_points ?? 0), 0);

  // --- H2H fixtures: circle-method round robin repeated across the season ---
  const matches: Match[] = [];
  const strength = entries.map(() => 38 + rand() * 14);
  const ids = [...Array(n).keys()];
  for (let gw = 1; gw <= 38; gw++) {
    const rot = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + gw - 1) % (n - 1))])];
    for (let k = 0; k < n / 2; k++) {
      const a = rot[k], b = rot[n - 1 - k];
      const played = gw < currentEvent || (gw === currentEvent && currentFinished);
      const live = gw === currentEvent && !currentFinished;
      const score = (t: number) => Math.max(12, Math.round(strength[t] + (rand() - 0.5) * 40));
      // The current gameweek uses the real points of each demo line-up, so the
      // fixture scores match the line-ups shown on the Gameweek tab.
      const cur = gw === currentEvent;
      const aPts = cur ? liveScore(a) : played ? score(a) : 0;
      const bPts = cur ? liveScore(b) : played ? score(b) : 0;
      matches.push({
        event: gw,
        finished: played,
        started: played || live,
        league_entry_1: entries[a].id,
        league_entry_1_points: aPts,
        league_entry_2: entries[b].id,
        league_entry_2_points: bPts,
        winning_league_entry: played ? (aPts > bPts ? entries[a].id : aPts < bPts ? entries[b].id : null) : null,
      });
    }
  }

  const owner = new Map<number, number>();
  squads.forEach((sq, t) => sq.forEach((id) => owner.set(id, entries[t].entry_id!)));

  return {
    bootstrap,
    game: { current_event: currentEvent, current_event_finished: currentFinished, next_event: currentEvent + 1, waivers_processed: true },
    details: {
      league: { id: 0, name: 'Demo League (sample managers)', scoring: 'h', start_event: 1, draft_status: 'post' },
      league_entries: entries,
      matches,
      standings: [], // derived by the model
    },
    elementStatus: bootstrap.elements.map((e) => ({ element: e.id, owner: owner.get(e.id) ?? null, status: owner.has(e.id) ? 'o' : 'a' })),
    transactions,
    trades: [],
    choices,
    picks,
    live: {},
    history: {},
    currentEvent,
    fetchedAt: Date.now(),
  };
}
