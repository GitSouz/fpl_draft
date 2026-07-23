import { POSITIONS, SQUAD_LIMITS } from '../draft';
import type { Roster } from './DraftRoom';

interface Props {
  rosters: Roster[];
  onClockIndex: number;
}

export default function RosterBoard({ rosters, onClockIndex }: Props) {
  return (
    <aside className="roster-board">
      <h2 className="roster-title">Squads</h2>
      <div className="roster-scroll">
        {rosters.map((r) => (
          <div
            key={r.managerIndex}
            className={`roster-card ${r.managerIndex === onClockIndex ? 'on-clock' : ''}`}
          >
            <div className="roster-head">
              <span className="roster-name">
                {r.managerIndex === onClockIndex && <span className="dot" />}
                {r.name}
              </span>
              <span className="roster-count">{r.players.length}/15</span>
            </div>
            <div className="roster-pos-summary">
              {POSITIONS.map((pos) => (
                <span
                  key={pos}
                  className={`pos-mini pos-${pos} ${
                    r.counts[pos] >= SQUAD_LIMITS[pos] ? 'filled' : ''
                  }`}
                >
                  {pos} {r.counts[pos]}/{SQUAD_LIMITS[pos]}
                </span>
              ))}
            </div>
            {r.players.length > 0 && (
              <ul className="roster-players">
                {[...r.players]
                  .sort(
                    (a, b) =>
                      POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position)
                  )
                  .map((p) => (
                    <li key={p.id}>
                      <span className={`pos-tag sm pos-${p.position}`}>
                        {p.position}
                      </span>
                      <span className="rp-name">{p.name}</span>
                      <span className="rp-team">{p.teamShort}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
