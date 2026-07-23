import { useMemo } from 'react';
import type { Player, Position } from '../fpl';
import type { Action, DraftState } from '../state';
import {
  SQUAD_LIMITS,
  managerForPick,
  positionCounts,
  roundForPick,
  totalPicks,
} from '../draft';
import PlayerPool from './PlayerPool';
import RosterBoard from './RosterBoard';

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

  const takenIds = useMemo(() => new Set(picks.map((p) => p.playerId)), [picks]);

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
          </>
        )}
      </div>

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
