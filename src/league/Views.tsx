import { useMemo, useState } from 'react';
import type { Pos } from './api';
import { PositionRace, ScoreHeatmap } from './Charts';
import type { Manager, Model, PlayerInfo, StandingRow } from './model';

// ---------------------------------------------------------------------------
// small shared bits
// ---------------------------------------------------------------------------

const STATUS_FLAG: Record<string, string> = { i: '🚑', d: '⚠️', s: '🟥', u: '⛔', n: '⛔' };

function PlayerName({ p }: { p: PlayerInfo }) {
  const flag = STATUS_FLAG[p.status];
  return (
    <span className="pl">
      <span className={`pos-tag pos-${p.pos.toLowerCase()}`}>{p.pos}</span>
      <span className="pl-name">{p.name}</span>
      <span className="pl-team">{p.team}</span>
      {flag && (
        <span className="status-flag" title={p.news || 'Availability flag'}>
          {flag}
        </span>
      )}
    </span>
  );
}

function ManagerChips({ model, value, onChange, allowAll }: { model: Model; value: number | null; onChange: (id: number | null) => void; allowAll?: boolean }) {
  return (
    <div className="chip-row">
      {allowAll && (
        <button className={`chip ${value == null ? 'active' : ''}`} onClick={() => onChange(null)}>
          Everyone
        </button>
      )}
      {model.standings.map((s) => (
        <button key={s.manager.leId} className={`chip ${value === s.manager.leId ? 'active' : ''}`} onClick={() => onChange(s.manager.leId)}>
          {s.manager.team}
        </button>
      ))}
    </div>
  );
}

function Card({ title, sub, children, className = '' }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="card-head">
        <h2>{title}</h2>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {children}
    </section>
  );
}

const signed = (n: number, dp = 1) => (n > 0 ? `+${n.toFixed(dp)}` : n.toFixed(dp));

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function OverviewView({ model }: { model: Model }) {
  const [focus, setFocus] = useState<number>(model.standings[0]?.manager.leId);
  const [rival, setRival] = useState<number | null>(model.standings[1]?.manager.leId ?? null);
  const leader = model.standings[0];
  const gwScores = model.managers
    .map((m) => ({ m, s: model.scores.get(m.leId)!.get(model.currentGw) }))
    .filter((x): x is { m: Manager; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s);
  const topPf = [...model.standings].sort((a, b) => b.pf - a.pf)[0];
  const gwAvg = gwScores.length ? gwScores.reduce((a, x) => a + x.s, 0) / gwScores.length : 0;

  return (
    <div className="grid">
      <div className="kpis">
        <Kpi label="League leader" value={leader?.manager.team ?? '–'} sub={leader ? `${leader.total} pts${model.isH2H ? ` · ${leader.w}-${leader.d}-${leader.l}` : ''}` : ''} />
        <Kpi
          label={`Top score GW${model.currentGw}${model.currentFinished ? '' : ' (live)'}`}
          value={gwScores[0] ? `${gwScores[0].s}` : '–'}
          sub={gwScores[0] ? `${gwScores[0].m.team} · avg ${gwAvg.toFixed(1)}` : ''}
        />
        <Kpi label="Most points scored" value={topPf ? `${topPf.pf}` : '–'} sub={topPf ? `${topPf.manager.team} · ${topPf.avg.toFixed(1)}/GW` : ''} />
        <Kpi label="Waivers & trades" value={`${model.moves.length}`} sub={busiest(model)} />
      </div>

      <Card title="Standings" sub={model.isH2H ? 'All-play: your record if you played every team every week. Luck: actual wins minus that.' : undefined} className="span-2">
        <StandingsTable model={model} focus={focus} onFocus={setFocus} />
      </Card>

      <Card
        title="League position by gameweek"
        sub={
          <span className="race-pickers">
            <label>
              <span className="swatch" style={{ background: 'var(--series-1)' }} />
              <select value={focus} onChange={(e) => setFocus(Number(e.target.value))}>
                {model.standings.map((s) => (
                  <option key={s.manager.leId} value={s.manager.leId}>
                    {s.manager.team}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="swatch" style={{ background: 'var(--series-2)' }} />
              <select value={rival ?? ''} onChange={(e) => setRival(e.target.value ? Number(e.target.value) : null)}>
                <option value="">No comparison</option>
                {model.standings.map((s) => (
                  <option key={s.manager.leId} value={s.manager.leId}>
                    {s.manager.team}
                  </option>
                ))}
              </select>
            </label>
          </span>
        }
        className="span-2"
      >
        <PositionRace model={model} focus={focus} rival={rival} onFocus={setFocus} />
      </Card>

      <Card title="Points per gameweek" sub="Click a row to highlight that team above." className="span-2">
        <ScoreHeatmap model={model} focus={focus} onFocus={setFocus} />
      </Card>

      <Card title="Season records" className="span-2">
        {model.records.length ? (
          <div className="records">
            {model.records.map((r) => (
              <div key={r.label} className="record">
                <div className="record-label">{r.label}</div>
                <div className="record-value">{r.value}</div>
                <div className="record-who">{r.who}</div>
                <div className="record-detail muted">{r.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Records appear once the first gameweek is finished.</p>
        )}
      </Card>
    </div>
  );
}

function busiest(model: Model) {
  const c = new Map<string, number>();
  for (const m of model.moves) c.set(m.manager.team, (c.get(m.manager.team) ?? 0) + 1);
  const top = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `busiest: ${top[0]} (${top[1]})` : 'none yet';
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub muted">{sub}</div>
    </div>
  );
}

function Movement({ s }: { s: StandingRow }) {
  if (s.lastRank == null || s.lastRank === s.rank) return <span className="mv mv-same" aria-label="No change">–</span>;
  const up = s.rank < s.lastRank;
  return (
    <span className={`mv ${up ? 'mv-up' : 'mv-down'}`} title={`Was ${s.lastRank}`}>
      {up ? '▲' : '▼'}
      {Math.abs(s.lastRank - s.rank)}
    </span>
  );
}

function StandingsTable({ model, focus, onFocus }: { model: Model; focus: number; onFocus: (id: number) => void }) {
  const h2h = model.isH2H;
  return (
    <div className="table-scroll">
      <table className="dtable standings">
        <thead>
          <tr>
            <th className="num">#</th>
            <th />
            <th>Team</th>
            {h2h && <th className="num">W</th>}
            {h2h && <th className="num hide-sm">D</th>}
            {h2h && <th className="num">L</th>}
            <th className="num hide-sm">PF</th>
            {h2h && <th className="num hide-sm">PA</th>}
            <th className="num">Pts</th>
            <th className="hide-sm">Form</th>
            {h2h && <th className="num hide-sm" title="Win % if you played every team every gameweek">All-play</th>}
            {h2h && <th className="num hide-sm" title="Actual wins minus all-play expected wins">Luck</th>}
          </tr>
        </thead>
        <tbody>
          {model.standings.map((s) => (
            <tr key={s.manager.leId} className={s.manager.leId === focus ? 'row-focus' : ''} onClick={() => onFocus(s.manager.leId)}>
              <td className="num strong">{s.rank}</td>
              <td>
                <Movement s={s} />
              </td>
              <td>
                <div className="team-name">{s.manager.team}</div>
                <div className="owner muted">{s.manager.owner}</div>
              </td>
              {h2h && <td className="num">{s.w}</td>}
              {h2h && <td className="num hide-sm">{s.d}</td>}
              {h2h && <td className="num">{s.l}</td>}
              <td className="num hide-sm">{s.pf}</td>
              {h2h && <td className="num hide-sm">{s.pa}</td>}
              <td className="num strong">{s.total}</td>
              <td className="hide-sm">
                <span className="form">
                  {s.form.map((f) =>
                    f.result ? (
                      <span key={f.gw} className={`res res-${f.result}`} title={`GW${f.gw}: ${f.score}`}>
                        {f.result}
                      </span>
                    ) : (
                      <span key={f.gw} className="res res-score" title={`GW${f.gw}`}>
                        {f.score}
                      </span>
                    )
                  )}
                </span>
              </td>
              {h2h && <td className="num hide-sm">{(s.allPlay.pct * 100).toFixed(0)}%</td>}
              {h2h && (
                <td className={`num hide-sm ${s.luck > 0.5 ? 'luck-pos' : s.luck < -0.5 ? 'luck-neg' : ''}`}>{signed(s.luck)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gameweek
// ---------------------------------------------------------------------------

export function GameweekView({ model }: { model: Model }) {
  const allGws = model.isH2H ? [...new Set(model.fixtures.map((f) => f.gw))].sort((a, b) => a - b) : model.gws;
  const [gw, setGw] = useState(model.currentGw);
  const [open, setOpen] = useState<string | null>(null);
  const isCurrent = gw === model.currentGw;
  const fixtures = model.fixtures.filter((f) => f.gw === gw);
  const live = isCurrent && !model.currentFinished;

  const owned = [...model.players.values()].filter((p) => p.ownerEntry != null);
  const topOwned = isCurrent ? [...owned].sort((a, b) => b.gw - a.gw).slice(0, 8) : [];
  const topFree = isCurrent ? model.freeAgents.filter((p) => p.gw > 0).sort((a, b) => b.gw - a.gw).slice(0, 5) : [];

  const ranking = model.managers
    .map((m) => ({ m, s: model.scores.get(m.leId)!.get(gw) }))
    .filter((x): x is { m: Manager; s: number } => x.s != null)
    .sort((a, b) => b.s - a.s);

  return (
    <div className="grid">
      <div className="span-2 gw-bar">
        <button className="btn-secondary" disabled={gw <= (allGws[0] ?? 1)} onClick={() => setGw(gw - 1)}>
          ←
        </button>
        <select value={gw} onChange={(e) => setGw(Number(e.target.value))}>
          {allGws.map((g) => (
            <option key={g} value={g}>
              Gameweek {g}
              {g === model.currentGw ? ' (current)' : ''}
            </option>
          ))}
        </select>
        <button className="btn-secondary" disabled={gw >= (allGws[allGws.length - 1] ?? 38)} onClick={() => setGw(gw + 1)}>
          →
        </button>
        {live && <span className="live-pill">● live — auto-refreshes every 2 min</span>}
      </div>

      {model.isH2H ? (
        <Card title={`GW${gw} fixtures`} sub={isCurrent ? 'Tap a match to see both line-ups.' : undefined} className="span-2">
          <div className="fixtures">
            {fixtures.map((f) => {
              const key = `${f.a.leId}-${f.b.leId}`;
              const aWin = f.started && f.aPts > f.bPts;
              const bWin = f.started && f.bPts > f.aPts;
              return (
                <div key={key} className={`fixture-block ${open === key ? 'open' : ''}`}>
                  <button className="fixture" onClick={() => isCurrent && setOpen(open === key ? null : key)} disabled={!isCurrent}>
                    <span className={`fx-team fx-a ${aWin ? 'fx-win' : ''}`}>{f.a.team}</span>
                    <span className="fx-score">
                      {f.started ? (
                        <>
                          {f.aPts} <span className="muted">–</span> {f.bPts}
                        </>
                      ) : (
                        <span className="muted">vs</span>
                      )}
                    </span>
                    <span className={`fx-team fx-b ${bWin ? 'fx-win' : ''}`}>{f.b.team}</span>
                  </button>
                  {open === key && (
                    <div className="lineups">
                      <Lineup model={model} m={f.a} />
                      <Lineup model={model} m={f.b} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card title={`GW${gw} scores`} className={model.isH2H ? '' : 'span-2'}>
        <table className="dtable">
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.m.leId}>
                <td className="num muted">{i + 1}</td>
                <td>{r.m.team}</td>
                <td className="num strong">{r.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!ranking.length && <p className="muted">Not played yet.</p>}
      </Card>

      {isCurrent && (
        <Card title="Top performers this gameweek">
          <table className="dtable">
            <tbody>
              {topOwned.map((p) => (
                <tr key={p.id}>
                  <td>
                    <PlayerName p={p} />
                  </td>
                  <td className="muted small-text">{model.byEntry.get(p.ownerEntry!)?.team}</td>
                  <td className="num strong">{p.gw}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {topFree.length > 0 && (
            <>
              <h3 className="mini-h">Unowned — the ones that got away</h3>
              <table className="dtable">
                <tbody>
                  {topFree.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <PlayerName p={p} />
                      </td>
                      <td className="muted small-text">free agent</td>
                      <td className="num strong">{p.gw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function Lineup({ model, m }: { model: Model; m: Manager }) {
  const squad = model.squads.get(m.entryId) ?? [];
  const xi = squad.filter((p) => p.starting);
  const bench = squad.filter((p) => !p.starting);
  const played = xi.filter((p) => p.minutesGw > 0).length;
  return (
    <div className="lineup">
      <div className="lineup-head">
        <strong>{m.team}</strong>
        <span className="muted small-text">
          {model.liveScores.get(m.entryId) ?? 0} pts{model.currentFinished ? '' : ` · ${played}/11 played`}
        </span>
      </div>
      {xi.map((p) => (
        <div key={p.id} className="lineup-row">
          <PlayerName p={p} />
          <span className={`num ${p.minutesGw > 0 ? 'strong' : 'muted'}`}>{p.gw}</span>
        </div>
      ))}
      {bench.length > 0 && <div className="bench-label muted">Bench</div>}
      {bench.map((p) => (
        <div key={p.id} className="lineup-row bench">
          <PlayerName p={p} />
          <span className="num muted">{p.gw}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Squads
// ---------------------------------------------------------------------------

export function SquadsView({ model }: { model: Model }) {
  const [sel, setSel] = useState<number>(model.standings[0]?.manager.leId);
  const m = model.byLe.get(sel)!;
  const squad = model.squads.get(m.entryId) ?? [];

  const strength = useMemo(
    () =>
      model.standings
        .map((s) => {
          const sq = model.squads.get(s.manager.entryId) ?? [];
          return { m: s.manager, total: sq.reduce((a, p) => a + p.total, 0), form: sq.reduce((a, p) => a + p.form, 0), flagged: sq.filter((p) => STATUS_FLAG[p.status]).length };
        })
        .sort((a, b) => b.total - a.total),
    [model]
  );
  const maxTotal = Math.max(1, ...strength.map((s) => s.total));

  return (
    <div className="grid">
      <div className="span-2">
        <ManagerChips model={model} value={sel} onChange={(id) => id != null && setSel(id)} />
      </div>
      <Card title={m.team} sub={`${m.owner} · GW${model.currentGw} squad`}>
        <div className="table-scroll">
          <table className="dtable">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">GW</th>
                <th className="num">Total</th>
                <th className="num hide-sm">Form</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => (
                <tr key={p.id} className={p.starting ? '' : 'bench-row'}>
                  <td>
                    <PlayerName p={p} />
                    {!p.starting && <span className="bench-tag">bench</span>}
                  </td>
                  <td className="num">{p.gw}</td>
                  <td className="num strong">{p.total}</td>
                  <td className="num hide-sm">{p.form.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {squad.some((p) => p.news) && (
          <ul className="news">
            {squad
              .filter((p) => p.news)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.name}:</strong> {p.news}
                </li>
              ))}
          </ul>
        )}
      </Card>
      <Card title="Squad strength" sub="Season points of each team’s current 15.">
        <div className="bars">
          {strength.map((s) => (
            <button key={s.m.leId} className={`bar-row ${s.m.leId === sel ? 'bar-focus' : ''}`} onClick={() => setSel(s.m.leId)} title={`${s.m.team}: ${s.total} pts · form ${s.form.toFixed(1)} · ${s.flagged} flagged`}>
              <span className="bar-label">{s.m.team}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(s.total / maxTotal) * 100}%` }} />
              </span>
              <span className="bar-val">{s.total}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export function TransfersView({ model }: { model: Model }) {
  const [sel, setSel] = useState<number | null>(null);
  const [kind, setKind] = useState<'all' | 'Waiver' | 'Free agent' | 'Trade'>('all');
  const moves = model.moves.filter(
    (mv) => (sel == null || mv.manager.leId === sel || mv.other?.leId === sel) && (kind === 'all' || mv.kind === kind)
  );

  const counts = model.standings.map((s) => {
    const mine = model.moves.filter((mv) => mv.manager.leId === s.manager.leId || mv.other?.leId === s.manager.leId);
    return {
      m: s.manager,
      w: mine.filter((x) => x.kind === 'Waiver').length,
      f: mine.filter((x) => x.kind === 'Free agent').length,
      t: mine.filter((x) => x.kind === 'Trade').length,
    };
  });

  return (
    <div className="grid">
      <div className="span-2 filter-row">
        <ManagerChips model={model} value={sel} onChange={setSel} allowAll />
        <div className="chip-row">
          {(['all', 'Waiver', 'Free agent', 'Trade'] as const).map((k) => (
            <button key={k} className={`chip ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
              {k === 'all' ? 'All moves' : `${k}s`}
            </button>
          ))}
        </div>
      </div>
      <Card title="Activity" sub={`${moves.length} move${moves.length === 1 ? '' : 's'}`}>
        {moves.length === 0 && <p className="muted">No moves match.</p>}
        <div className="moves">
          {moves.map((mv) => (
            <div key={mv.key} className="move">
              <div className="move-head">
                <span className={`kind kind-${mv.kind.replace(' ', '-').toLowerCase()}`}>{mv.kind}</span>
                <strong>{mv.manager.team}</strong>
                {mv.other && (
                  <>
                    <span className="muted">⇄</span>
                    <strong>{mv.other.team}</strong>
                  </>
                )}
                <span className="muted small-text move-gw">GW{mv.gw}</span>
              </div>
              {mv.kind === 'Trade' ? (
                <div className="move-body">
                  <div>
                    <span className="muted small-text">{mv.manager.team} get</span>
                    {mv.ins.map((p) => (
                      <div key={p.id} className="in">
                        + <PlayerName p={p} /> <span className="muted small-text">{p.total} pts</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <span className="muted small-text">{mv.other?.team} get</span>
                    {mv.outs.map((p) => (
                      <div key={p.id} className="in">
                        + <PlayerName p={p} /> <span className="muted small-text">{p.total} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="move-body">
                  <div className="in">
                    + <PlayerName p={mv.ins[0]} /> <span className="muted small-text">{mv.ins[0].total} pts</span>
                  </div>
                  <div className="out">
                    − <PlayerName p={mv.outs[0]} /> <span className="muted small-text">{mv.outs[0].total} pts</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card title="Moves per team">
        <table className="dtable">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">Waivers</th>
              <th className="num">Free agents</th>
              <th className="num">Trades</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.m.leId} onClick={() => setSel(c.m.leId)} className={sel === c.m.leId ? 'row-focus' : ''}>
                <td>{c.m.team}</td>
                <td className="num">{c.w}</td>
                <td className="num">{c.f}</td>
                <td className="num">{c.t}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft review + free agents
// ---------------------------------------------------------------------------

export function PlayersView({ model }: { model: Model }) {
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL');
  const [sort, setSort] = useState<'form' | 'total'>('form');
  const n = model.managers.length;

  const steals = [...model.draft].filter((d) => d.round > 5).sort((a, b) => b.player.total - a.player.total).slice(0, 6);
  const busts = [...model.draft].filter((d) => d.round <= 3).sort((a, b) => a.player.total - b.player.total).slice(0, 6);
  const byManager = model.standings.map((s) => {
    const picks = model.draft.filter((d) => d.manager.leId === s.manager.leId);
    return { m: s.manager, pts: picks.reduce((a, d) => a + d.player.total, 0), kept: picks.filter((d) => d.stillOwned).length, n: picks.length };
  });
  byManager.sort((a, b) => b.pts - a.pts);

  const free = model.freeAgents
    .filter((p) => pos === 'ALL' || p.pos === pos)
    .sort((a, b) => (sort === 'form' ? b.form - a.form || b.total - a.total : b.total - a.total))
    .slice(0, 20);

  const pickLabel = (round: number, pick: number) => `R${round}.${pick} (#${(round - 1) * n + pick})`;

  return (
    <div className="grid">
      {model.draft.length > 0 ? (
        <>
          <Card title="Draft steals" sub="Picked after round 5, most points since.">
            <DraftList items={steals} pickLabel={pickLabel} />
          </Card>
          <Card title="Draft busts" sub="Picked in rounds 1–3, fewest points since.">
            <DraftList items={busts} pickLabel={pickLabel} />
          </Card>
          <Card title="Draft grades" sub="Season points of every player each team drafted (whether kept or not)." className="span-2">
            <table className="dtable">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="num">Drafted pts</th>
                  <th className="num">Still on squad</th>
                </tr>
              </thead>
              <tbody>
                {byManager.map((r) => (
                  <tr key={r.m.leId}>
                    <td>{r.m.team}</td>
                    <td className="num strong">{r.pts}</td>
                    <td className="num">
                      {r.kept}/{r.n}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <Card title="Draft review" className="span-2">
          <p className="muted">Draft picks aren’t available for this league.</p>
        </Card>
      )}

      <Card
        title="Best free agents"
        sub={
          <span className="chip-row">
            {(['ALL', 'GKP', 'DEF', 'MID', 'FWD'] as const).map((p) => (
              <button key={p} className={`chip ${pos === p ? 'active' : ''}`} onClick={() => setPos(p)}>
                {p === 'ALL' ? 'All' : p}
              </button>
            ))}
            <select value={sort} onChange={(e) => setSort(e.target.value as 'form' | 'total')}>
              <option value="form">by form</option>
              <option value="total">by total points</option>
            </select>
          </span>
        }
        className="span-2"
      >
        <div className="table-scroll">
          <table className="dtable">
            <thead>
              <tr>
                <th>Player</th>
                <th className="num">Form</th>
                <th className="num">Total</th>
                <th className="num hide-sm">GW{model.currentGw}</th>
              </tr>
            </thead>
            <tbody>
              {free.map((p) => (
                <tr key={p.id}>
                  <td>
                    <PlayerName p={p} />
                  </td>
                  <td className="num strong">{p.form.toFixed(1)}</td>
                  <td className="num">{p.total}</td>
                  <td className="num hide-sm">{p.gw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DraftList({ items, pickLabel }: { items: Model['draft']; pickLabel: (r: number, p: number) => string }) {
  return (
    <table className="dtable">
      <tbody>
        {items.map((d) => (
          <tr key={`${d.round}-${d.pick}`}>
            <td>
              <PlayerName p={d.player} />
              <div className="muted small-text">
                {d.manager.team} · {pickLabel(d.round, d.pick)}
                {!d.stillOwned && ' · since dropped'}
              </div>
            </td>
            <td className="num strong">{d.player.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
