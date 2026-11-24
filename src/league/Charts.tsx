import { useMemo, useRef, useState } from 'react';
import type { Manager, Model } from './model';

// ---------------------------------------------------------------------------
// League position over time. With ~10 managers, ten hues would be unreadable,
// so this is an emphasis chart: everyone is a thin muted line, and the chosen
// manager (plus an optional rival) is drawn in color on top.
// ---------------------------------------------------------------------------

interface RaceProps {
  model: Model;
  focus: number; // leId
  rival: number | null;
  onFocus: (leId: number) => void;
}

const W = 720;
const H = 300;
const PAD = { l: 34, r: 128, t: 14, b: 28 };

export function PositionRace({ model, focus, rival, onFocus }: RaceProps) {
  const { gws, managers, positions } = model;
  const n = managers.length;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const x = (i: number) => PAD.l + (gws.length <= 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (gws.length - 1));
  const y = (rank: number) => PAD.t + ((rank - 1) * (H - PAD.t - PAD.b)) / Math.max(1, n - 1);

  const path = (ranks: number[]) => ranks.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r).toFixed(1)}`).join('');

  if (gws.length < 2) {
    return <p className="muted">The position chart appears after two gameweeks have been played.</p>;
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const step = (W - PAD.l - PAD.r) / (gws.length - 1);
    const i = Math.round((px - PAD.l) / step);
    setHoverIdx(i >= 0 && i < gws.length ? i : null);
  };

  const highlighted = [focus, ...(rival != null && rival !== focus ? [rival] : [])];
  const colorFor = (leId: number) => (leId === focus ? 'var(--series-1)' : 'var(--series-2)');
  const last = gws.length - 1;

  const tipRows =
    hoverIdx != null
      ? managers
          .map((m) => ({ m, r: positions.get(m.leId)![hoverIdx], s: model.scores.get(m.leId)!.get(gws[hoverIdx]) }))
          .sort((a, b) => a.r - b.r)
      : [];
  const tipLeft = hoverIdx != null && x(hoverIdx) > W * 0.55;

  return (
    <div className="chart-scroll">
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="race-svg"
        role="img"
        aria-label="League position after each gameweek"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* grid: one hairline per position */}
        {managers.map((_, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(i + 1)} y2={y(i + 1)} className="grid" />
            <text x={PAD.l - 8} y={y(i + 1)} className="axis-label" textAnchor="end" dominantBaseline="middle">
              {i + 1}
            </text>
          </g>
        ))}
        {gws.map((g, i) =>
          gws.length <= 20 || i % 2 === 0 || i === last ? (
            <text key={g} x={x(i)} y={H - 8} className="axis-label" textAnchor="middle">
              {g}
            </text>
          ) : null
        )}

        {/* everyone else */}
        {managers
          .filter((m) => !highlighted.includes(m.leId))
          .map((m) => (
            <path
              key={m.leId}
              d={path(positions.get(m.leId)!)}
              className="race-line muted-line"
              onClick={() => onFocus(m.leId)}
            >
              <title>{m.team}</title>
            </path>
          ))}
        {managers
          .filter((m) => !highlighted.includes(m.leId))
          .map((m) => (
            <text
              key={`l${m.leId}`}
              x={W - PAD.r + 8}
              y={y(positions.get(m.leId)![last])}
              className="end-label muted-label"
              dominantBaseline="middle"
              onClick={() => onFocus(m.leId)}
            >
              {trim(m.team)}
            </text>
          ))}

        {/* highlighted */}
        {highlighted.map((id) => {
          const ranks = positions.get(id)!;
          const m = model.byLe.get(id)!;
          return (
            <g key={id}>
              <path d={path(ranks)} className="race-line strong-line" style={{ stroke: colorFor(id) }} />
              <circle cx={x(last)} cy={y(ranks[last])} r={4.5} className="end-dot" style={{ fill: colorFor(id) }} />
              <text x={W - PAD.r + 8} y={y(ranks[last])} className="end-label strong-label" dominantBaseline="middle">
                {trim(m.team)}
              </text>
            </g>
          );
        })}

        {hoverIdx != null && (
          <g pointerEvents="none">
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.t - 6} y2={H - PAD.b + 4} className="crosshair" />
            {highlighted.map((id) => (
              <circle
                key={id}
                cx={x(hoverIdx)}
                cy={y(positions.get(id)![hoverIdx])}
                r={5}
                className="hover-dot"
                style={{ fill: colorFor(id) }}
              />
            ))}
          </g>
        )}
      </svg>

      {hoverIdx != null && (
        <div className="chart-tip" style={tipLeft ? { left: `${(x(hoverIdx) / W) * 100}%`, transform: 'translateX(calc(-100% - 12px))' } : { left: `calc(${(x(hoverIdx) / W) * 100}% + 12px)` }}>
          <div className="tip-title">
            <span>Position after GW{gws[hoverIdx]}</span>
            <span className="muted">GW pts</span>
          </div>
          {tipRows.map(({ m, r, s }) => (
            <div key={m.leId} className={`tip-row ${highlighted.includes(m.leId) ? 'tip-strong' : ''}`}>
              <span className="tip-rank">{r}</span>
              {highlighted.includes(m.leId) && <span className="tip-swatch" style={{ background: colorFor(m.leId) }} />}
              <span className="tip-name">{m.team}</span>
              <span className="tip-val">{s ?? '–'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

const trim = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

// ---------------------------------------------------------------------------
// Gameweek score heatmap: managers × gameweeks, one blue ramp (higher = more
// saturated/lighter on the dark surface). Every cell shows its number, so the
// grid doubles as the table view.
// ---------------------------------------------------------------------------

// Dark-mode sequential blue, low → high.
const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef'];

export function ScoreHeatmap({ model, focus, onFocus }: { model: Model; focus: number; onFocus: (id: number) => void }) {
  const { gws, standings, scores } = model;
  const [lo, hi] = useMemo(() => {
    const all: number[] = [];
    for (const s of scores.values()) for (const v of s.values()) all.push(v);
    return all.length ? [Math.min(...all), Math.max(...all)] : [0, 1];
  }, [scores]);

  const cell = (v: number | undefined) => {
    if (v == null) return { background: 'transparent', color: 'var(--muted)' };
    const t = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    const idx = Math.min(RAMP.length - 1, Math.floor(t * RAMP.length));
    return { background: RAMP[idx], color: idx >= 7 ? '#0b1626' : '#e7e9ee' };
  };

  return (
    <div className="heatmap-wrap">
      <table className="heatmap">
        <thead>
          <tr>
            <th className="hm-name">Team</th>
            {gws.map((g) => (
              <th key={g}>{g}</th>
            ))}
            <th className="hm-sum">Avg</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const m: Manager = s.manager;
            return (
              <tr key={m.leId} className={m.leId === focus ? 'hm-focus' : ''} onClick={() => onFocus(m.leId)}>
                <th className="hm-name">{m.team}</th>
                {gws.map((g) => {
                  const v = scores.get(m.leId)!.get(g);
                  const live = g === model.currentGw && !model.currentFinished;
                  return (
                    <td key={g} style={cell(v)} title={`${m.team} · GW${g}: ${v ?? '–'}${live ? ' (live)' : ''}`} className={live ? 'hm-live' : ''}>
                      {v ?? ''}
                    </td>
                  );
                })}
                <td className="hm-sum">{s.avg.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="hm-legend">
        <span>{lo}</span>
        <span className="hm-ramp">
          {RAMP.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        <span>{hi} pts</span>
        {!model.currentFinished && <span className="muted"> · dashed = live gameweek</span>}
      </div>
    </div>
  );
}
