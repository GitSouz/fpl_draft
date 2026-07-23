import { useMemo, useState } from 'react';
import type { Player, Position } from '../fpl';
import { POSITIONS } from '../draft';

type SortKey = 'totalPoints' | 'form' | 'price' | 'pointsPerGame' | 'selectedByPercent';

const SORT_LABELS: Record<SortKey, string> = {
  totalPoints: 'Total pts',
  form: 'Form',
  pointsPerGame: 'Pts/game',
  price: 'Price',
  selectedByPercent: 'Owned %',
};

interface Props {
  players: Player[];
  takenIds: Set<number>;
  availablePositions: Set<Position>;
  canPick: (p: Player) => boolean;
  onPick: (id: number) => void;
  complete: boolean;
}

const statusFlag = (p: Player): string | null => {
  switch (p.status) {
    case 'i':
      return '🚑'; // injured
    case 'd':
      return '⚠️'; // doubtful
    case 's':
      return '🟥'; // suspended
    case 'u':
    case 'n':
      return '⛔'; // unavailable / not in squad
    default:
      return null;
  }
};

export default function PlayerPool({
  players,
  takenIds,
  availablePositions,
  canPick,
  onPick,
  complete,
}: Props) {
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints');
  const [hideTaken, setHideTaken] = useState(true);
  const [onlyPickable, setOnlyPickable] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => {
        if (hideTaken && takenIds.has(p.id)) return false;
        if (posFilter !== 'ALL' && p.position !== posFilter) return false;
        if (onlyPickable && !canPick(p)) return false;
        if (q) {
          const hay = `${p.name} ${p.fullName} ${p.teamShort} ${p.teamName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b[sortKey] - a[sortKey])
      .slice(0, 300);
  }, [players, takenIds, posFilter, sortKey, hideTaken, onlyPickable, search, canPick]);

  return (
    <section className="pool">
      <div className="pool-controls">
        <input
          className="search"
          type="text"
          placeholder="Search player or team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="pos-filters">
          <button
            className={`chip ${posFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setPosFilter('ALL')}
          >
            All
          </button>
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              className={`chip pos-${pos} ${posFilter === pos ? 'active' : ''} ${
                availablePositions.size > 0 && !availablePositions.has(pos)
                  ? 'pos-full'
                  : ''
              }`}
              onClick={() => setPosFilter(pos)}
              title={
                availablePositions.size > 0 && !availablePositions.has(pos)
                  ? 'Current manager is full at this position'
                  : undefined
              }
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="pool-controls secondary">
        <label className="sort-label">
          Sort:
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={hideTaken}
            onChange={(e) => setHideTaken(e.target.checked)}
          />
          Hide drafted
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyPickable}
            onChange={(e) => setOnlyPickable(e.target.checked)}
            disabled={complete}
          />
          Only pickable
        </label>
        <span className="result-count">{filtered.length} shown</span>
      </div>

      <div className="pool-table-wrap">
        <table className="pool-table">
          <thead>
            <tr>
              <th className="col-pos">Pos</th>
              <th className="col-name">Player</th>
              <th className="col-team">Team</th>
              <th className="num">Pts</th>
              <th className="num">Form</th>
              <th className="num">£</th>
              <th className="num">Own%</th>
              <th className="col-action"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const taken = takenIds.has(p.id);
              const pickable = canPick(p);
              const flag = statusFlag(p);
              return (
                <tr key={p.id} className={taken ? 'taken' : ''}>
                  <td>
                    <span className={`pos-tag pos-${p.position}`}>{p.position}</span>
                  </td>
                  <td className="col-name">
                    <span className="pname" title={p.fullName}>
                      {p.name}
                    </span>
                    {flag && (
                      <span className="status-flag" title={p.news || 'Availability doubt'}>
                        {flag}
                      </span>
                    )}
                  </td>
                  <td className="col-team">{p.teamShort}</td>
                  <td className="num strong">{p.totalPoints}</td>
                  <td className="num">{p.form.toFixed(1)}</td>
                  <td className="num">{p.price.toFixed(1)}</td>
                  <td className="num muted">{p.selectedByPercent.toFixed(0)}</td>
                  <td className="col-action">
                    {taken ? (
                      <span className="drafted-tag">Drafted</span>
                    ) : (
                      <button
                        className="btn-pick"
                        disabled={!pickable}
                        onClick={() => onPick(p.id)}
                        title={
                          !pickable && !complete
                            ? 'Position full for the manager on the clock'
                            : 'Draft this player'
                        }
                      >
                        Draft
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="empty">No players match your filters.</p>
        )}
      </div>
    </section>
  );
}
