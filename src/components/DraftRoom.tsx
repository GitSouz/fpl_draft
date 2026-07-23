import { useMemo, useState } from 'react';
import type { Player, Position } from '../fpl';
import type { Action, DraftState } from '../state';
import {
  SQUAD_LIMITS,
  managerForPick,
  positionCounts,
  roundForPick,
  totalPicks,
} from '../draft';
import { downloadCsv, picksToCsv } from '../csv';
import PlayerPool from './PlayerPool';
import RosterBoard from './RosterBoard';
import PickTimer from './PickTimer';

const TIMER_OPTIONS: { label: string; value: number }[] = [
  { label: 'No clock', value: 0 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '2 min', value: 120 },
];

interface Props {
  state: DraftState;
  players: Player[];
  playersById: Map<number, Player>;
  dispatch: React.Dispatch<Action>;
}

export interface Roster {
  managerIndex: number;
  name: string;
  players: Player[];
  counts: Record<Position, number>;
}

export default function DraftRoom({ state, players, playersById, dispatch }: Props) {
  const { managers, picks } = state;
  const managerCount = managers.length;
  const total = totalPicks(managerCount);
  const overall = picks.length; // next pick number
  const complete = overall >= total;

  const [timerSec, setTimerSec] = useState(90);
  const [autoOnTimeout, setAutoOnTimeout] = useState(true);

  const takenIds = useMemo(() => new Set(picks.map((p) => p.playerId)), [picks]);

  // Pre-season the API reports 0 total points for everyone, so ranking by
  // points is meaningless. In that case fall back to FPL price, which encodes
  // expected quality. Mid-season we rank by points.
  const usePriceRanking = useMemo(
    () => players.every((p) => p.totalPoints === 0),
    [players]
  );
  const rankScore = (p: Player): number =>
    usePriceRanking ? p.price : p.totalPoints;

  // Build a roster per manager.
  const rosters: Roster[] = useMemo(() => {
    const byManager: Player[][] = managers.map(() => []);
    for (const pick of picks) {
      const player = playersById.get(pick.playerId);
      if (player) byManager[pick.managerIndex].push(player);
    }
    return managers.map((name, i) => ({
      managerIndex: i,
      name,
      players: byManager[i],
      counts: positionCounts(byManager[i].map((p) => p.position)),
    }));
  }, [managers, picks, playersById]);

  const onClockIndex = complete ? -1 : managerForPick(overall, managerCount);
  const currentRoster = onClockIndex >= 0 ? rosters[onClockIndex] : null;
  const round = complete ? -1 : roundForPick(overall, managerCount);

  // Positions the current manager can still draft (under the cap).
  const availablePositions = useMemo<Set<Position>>(() => {
    const s = new Set<Position>();
    if (!currentRoster) return s;
    (Object.keys(SQUAD_LIMITS) as Position[]).forEach((pos) => {
      if (currentRoster.counts[pos] < SQUAD_LIMITS[pos]) s.add(pos);
    });
    return s;
  }, [currentRoster]);

  // Preview the next few managers on the clock.
  const upcoming = useMemo(() => {
    const out: { overall: number; managerIndex: number }[] = [];
    for (let o = overall; o < Math.min(overall + managerCount, total); o++) {
      out.push({ overall: o, managerIndex: managerForPick(o, managerCount) });
    }
    return out;
  }, [overall, managerCount, total]);

  const canPick = (player: Player): boolean =>
    !complete && !takenIds.has(player.id) && availablePositions.has(player.position);

  // Best available players the manager on the clock can legally draft.
  const suggestions = useMemo<Player[]>(() => {
    if (complete) return [];
    return players
      .filter(
        (p) => !takenIds.has(p.id) && availablePositions.has(p.position)
      )
      .sort((a, b) => rankScore(b) - rankScore(a))
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, takenIds, availablePositions, complete, usePriceRanking]);

  // Draft the best available player for the manager on the clock.
  const autoTarget = suggestions[0];
  const autoPick = () => {
    if (autoTarget) dispatch({ type: 'PICK', playerId: autoTarget.id });
  };

  const lastPick = picks[picks.length - 1];
  const lastPlayer = lastPick ? playersById.get(lastPick.playerId) : undefined;

  return (
    <div className="draft-room">
      <header className="draft-topbar">
        <div className="topbar-left">
          <span className="brand">⚽ FPL Snake Draft</span>
          <span className="progress">
            Pick {Math.min(overall + 1, total)} of {total}
            {round >= 0 && <> · Round {round + 1}</>}
          </span>
        </div>
        <div className="topbar-right">
          <label className="clock-select" title="Pick clock">
            ⏱
            <select
              value={timerSec}
              onChange={(e) => setTimerSec(Number(e.target.value))}
            >
              {TIMER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className={`check topbar-check ${timerSec === 0 ? 'disabled' : ''}`}
            title="When the clock hits 0, automatically draft the best available player"
          >
            <input
              type="checkbox"
              checked={autoOnTimeout}
              disabled={timerSec === 0}
              onChange={(e) => setAutoOnTimeout(e.target.checked)}
            />
            Auto-pick at 0
          </label>
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCsv(
                `fpl-draft-${new Date().toISOString().slice(0, 10)}.csv`,
                picksToCsv(managers, picks, playersById)
              )
            }
            disabled={picks.length === 0}
            title="Export all squads to CSV"
          >
            ⬇ Export CSV
          </button>
          <button
            className="btn-secondary"
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={picks.length === 0}
            title="Undo last pick"
          >
            ↩ Undo{lastPlayer ? ` (${lastPlayer.name})` : ''}
          </button>
          <button
            className="btn-secondary danger"
            onClick={() => {
              if (
                confirm(
                  'Reset the entire draft? This clears all picks and managers.'
                )
              ) {
                dispatch({ type: 'RESET' });
              }
            }}
          >
            Reset
          </button>
        </div>
      </header>

      <div className="onclock-bar">
        {complete ? (
          <div className="onclock done">🏁 Draft complete — all {total} picks made!</div>
        ) : (
          <>
            <div className="onclock">
              <span className="onclock-label">On the clock</span>
              <span className="onclock-name">{currentRoster?.name}</span>
              <span className="onclock-badge">
                {currentRoster && currentRoster.players.length}/{' '}
                {Object.values(SQUAD_LIMITS).reduce((a, b) => a + b, 0)} picked
              </span>
            </div>
            <div className="upcoming">
              <span className="upcoming-label">Next:</span>
              {upcoming.slice(1, 6).map((u) => (
                <span key={u.overall} className="upcoming-chip">
                  {managers[u.managerIndex]}
                </span>
              ))}
            </div>
            <PickTimer
              pickNumber={overall}
              durationSec={timerSec}
              onExpire={autoOnTimeout ? autoPick : undefined}
            />
          </>
        )}
      </div>

      {!complete && suggestions.length > 0 && (
        <div className="suggestion-bar">
          <span className="suggestion-label">
            💡 Best available{' '}
            <span className="muted">
              (by {usePriceRanking ? 'price' : 'points'})
            </span>
          </span>
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              className={`suggestion-chip ${i === 0 ? 'auto-target' : ''}`}
              onClick={() => dispatch({ type: 'PICK', playerId: p.id })}
              title={`Draft ${p.fullName}`}
            >
              <span className={`pos-tag sm pos-${p.position}`}>{p.position}</span>
              <span className="sug-name">{p.name}</span>
              <span className="sug-team">{p.teamShort}</span>
              <span className="sug-stat">
                {usePriceRanking ? `£${p.price.toFixed(1)}` : `${p.totalPoints} pts`}
              </span>
            </button>
          ))}
          <button
            className="btn-autopick"
            onClick={autoPick}
            disabled={!autoTarget}
            title={
              autoTarget
                ? `Auto-pick ${autoTarget.fullName} (${autoTarget.teamShort}) for ${currentRoster?.name}`
                : 'No eligible player'
            }
          >
            ⚡ Auto-pick now
          </button>
        </div>
      )}

      <div className="draft-main">
        <PlayerPool
          players={players}
          takenIds={takenIds}
          availablePositions={availablePositions}
          canPick={canPick}
          onPick={(id) => dispatch({ type: 'PICK', playerId: id })}
          complete={complete}
        />
        <RosterBoard rosters={rosters} onClockIndex={onClockIndex} />
      </div>
    </div>
  );
}
