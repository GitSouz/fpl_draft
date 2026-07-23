import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, Position } from '../fpl';
import { SQUAD_LIMITS, managerForPick, positionCounts, totalPicks } from '../draft';
import { downloadCsv, picksToCsv } from '../csv';
import PlayerPool from '../components/PlayerPool';
import RosterBoard from '../components/RosterBoard';
import type { Roster } from '../components/DraftRoom';
import { autoPick, makePick, undoPick } from './api';
import type { DraftRow, PickRow, SeatRow } from './types';
import type { OnlineSession } from './session';

interface Props {
  draft: DraftRow;
  seats: SeatRow[];
  picks: PickRow[];
  pool: Player[];
  poolById: Map<number, Player>;
  session: OnlineSession;
  onExit: () => void;
}

// Live countdown (in whole seconds) to an ISO deadline; null when no deadline.
function useCountdown(deadlineIso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineIso) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [deadlineIso]);
  if (!deadlineIso) return null;
  return Math.max(0, Math.round((new Date(deadlineIso).getTime() - now) / 1000));
}

export default function OnlineDraftRoom({
  draft,
  seats,
  picks,
  pool,
  poolById,
  session,
  onExit,
}: Props) {
  const [actionErr, setActionErr] = useState<string | null>(null);

  const managers = seats.map((s) => s.name);
  const managerCount = seats.length;
  const total = totalPicks(managerCount);
  const overall = draft.current_pick;
  const complete = draft.status === 'done' || overall >= total;

  const isHost = Boolean(session.hostToken);
  const seatById = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);

  const takenIds = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  const usePriceRanking = useMemo(() => pool.every((p) => p.totalPoints === 0), [pool]);
  const rankScore = (p: Player) => (usePriceRanking ? p.price : p.totalPoints);

  // Rosters keyed by seat ordinal (so RosterBoard indexes line up with order).
  const rosters: Roster[] = useMemo(() => {
    const byOrdinal: Player[][] = seats.map(() => []);
    for (const pk of picks) {
      const seat = seatById.get(pk.seat_id);
      const player = poolById.get(pk.player_id);
      if (seat && player) byOrdinal[seat.ordinal].push(player);
    }
    return seats.map((s) => ({
      managerIndex: s.ordinal,
      name: s.name,
      players: byOrdinal[s.ordinal],
      counts: positionCounts(byOrdinal[s.ordinal].map((p) => p.position)),
    }));
  }, [seats, picks, seatById, poolById]);

  const onClockOrdinal = complete ? -1 : managerForPick(overall, managerCount);
  const onClockSeat = onClockOrdinal >= 0 ? seats[onClockOrdinal] : null;
  const currentRoster = onClockOrdinal >= 0 ? rosters[onClockOrdinal] : null;
  const round = complete ? -1 : Math.floor(overall / managerCount);

  const isMyTurn = !complete && onClockSeat?.id === session.seatId;
  const mySeat = seats.find((s) => s.id === session.seatId);

  const availablePositions = useMemo<Set<Position>>(() => {
    const s = new Set<Position>();
    if (!currentRoster) return s;
    (Object.keys(SQUAD_LIMITS) as Position[]).forEach((pos) => {
      if (currentRoster.counts[pos] < SQUAD_LIMITS[pos]) s.add(pos);
    });
    return s;
  }, [currentRoster]);

  const suggestions = useMemo<Player[]>(() => {
    if (complete) return [];
    return pool
      .filter((p) => !takenIds.has(p.id) && availablePositions.has(p.position))
      .sort((a, b) => rankScore(b) - rankScore(a))
      .slice(0, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, takenIds, availablePositions, complete, usePriceRanking]);

  // Only the manager on the clock can draft; others see a read-only board.
  const canPick = (player: Player): boolean =>
    Boolean(isMyTurn) &&
    !takenIds.has(player.id) &&
    availablePositions.has(player.position);

  const runAction = (fn: () => Promise<void>) => {
    setActionErr(null);
    fn().catch((e: unknown) =>
      setActionErr(e instanceof Error ? e.message : 'Action failed')
    );
  };

  const pickPlayer = (playerId: number) => {
    if (!session.claimToken || !isMyTurn) return;
    runAction(() => makePick(session.claimToken!, playerId));
  };

  const autoTarget = suggestions[0];
  const autoPickNow = () => {
    if (isMyTurn && autoTarget) {
      pickPlayer(autoTarget.id);
    } else if (isHost) {
      runAction(() => autoPick(draft.id, session.hostToken));
    }
  };

  // Server-authoritative pick clock.
  const remaining = useCountdown(complete ? null : draft.deadline);

  // When the clock expires, any client nudges the server to auto-pick (the RPC
  // validates the deadline; a unique constraint means only one call wins). The
  // on-clock manager and host fire immediately; others add jitter as a backup
  // in case the on-clock manager has disconnected.
  const autoFiredFor = useRef(-1);
  useEffect(() => {
    if (complete || !draft.deadline || !draft.settings.autoOnTimeout) return;
    const msLeft = new Date(draft.deadline).getTime() - Date.now();
    const backup = isMyTurn || isHost ? 0 : 600 + Math.random() * 1600;
    const delay = Math.max(0, msLeft) + backup;
    const t = setTimeout(() => {
      if (autoFiredFor.current === overall) return;
      autoFiredFor.current = overall;
      autoPick(draft.id, isHost ? session.hostToken : undefined).catch(() => {
        /* someone else got there first — fine */
      });
    }, delay);
    return () => clearTimeout(t);
  }, [draft.deadline, draft.settings.autoOnTimeout, overall, complete, isMyTurn, isHost, draft.id, session.hostToken]);

  const timerState =
    remaining === null
      ? ''
      : remaining === 0
        ? 'expired'
        : remaining <= 10
          ? 'danger'
          : remaining <= 20
            ? 'warn'
            : 'ok';
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Map picks to the shape picksToCsv expects.
  const csvPicks = picks.map((p) => ({
    playerId: p.player_id,
    managerIndex: seatById.get(p.seat_id)?.ordinal ?? 0,
    overall: p.overall,
    round: p.round,
  }));

  const upcoming: number[] = [];
  for (let o = overall + 1; o < Math.min(overall + 6, total); o++) {
    upcoming.push(managerForPick(o, managerCount));
  }

  return (
    <div className="draft-room">
      <header className="draft-topbar">
        <div className="topbar-left">
          <span className="brand">⚽ Draft</span>
          <span className="room-chip">Room {draft.code}</span>
          {mySeat && <span className="you-chip">You: {mySeat.name}</span>}
          <span className="progress">
            Pick {Math.min(overall + 1, total)} of {total}
            {round >= 0 && <> · Round {round + 1}</>}
          </span>
        </div>
        <div className="topbar-right">
          <button
            className="btn-secondary"
            onClick={() =>
              downloadCsv(
                `fpl-draft-${draft.code}.csv`,
                picksToCsv(managers, csvPicks, poolById)
              )
            }
            disabled={picks.length === 0}
          >
            ⬇ CSV
          </button>
          {isHost && (
            <>
              <button
                className="btn-secondary"
                onClick={() => runAction(() => undoPick(session.hostToken!))}
                disabled={picks.length === 0}
                title="Host: undo the last pick"
              >
                ↩ Undo
              </button>
              {!complete && (
                <button
                  className="btn-secondary"
                  onClick={() => runAction(() => autoPick(draft.id, session.hostToken))}
                  title="Host: force auto-pick for the manager on the clock"
                >
                  ⚡ Force pick
                </button>
              )}
            </>
          )}
          <button className="btn-secondary" onClick={onExit} title="Leave (rejoin with the code)">
            Leave
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
              <span className="onclock-name">{onClockSeat?.name}</span>
              {isMyTurn && <span className="your-turn">← your pick!</span>}
              <span className="onclock-badge">
                {currentRoster?.players.length ?? 0}/15
              </span>
            </div>
            <div className="upcoming">
              <span className="upcoming-label">Next:</span>
              {upcoming.map((ord, i) => (
                <span key={i} className="upcoming-chip">
                  {seats[ord]?.name}
                </span>
              ))}
            </div>
            {remaining !== null && (
              <div className={`pick-timer ${timerState}`}>
                <span className="timer-time">
                  {remaining === 0 ? "Time's up!" : fmt(remaining)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {actionErr && <div className="action-error">{actionErr}</div>}

      {!complete && isMyTurn && suggestions.length > 0 && (
        <div className="suggestion-bar">
          <span className="suggestion-label">
            💡 Best available{' '}
            <span className="muted">(by {usePriceRanking ? 'price' : 'points'})</span>
          </span>
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              className={`suggestion-chip ${i === 0 ? 'auto-target' : ''}`}
              onClick={() => pickPlayer(p.id)}
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
          <button className="btn-autopick" onClick={autoPickNow} disabled={!autoTarget}>
            ⚡ Auto-pick now
          </button>
        </div>
      )}

      {!complete && !isMyTurn && (
        <div className="waiting-bar">
          Waiting for <strong>{onClockSeat?.name}</strong> to pick… (you can browse
          the pool below)
        </div>
      )}

      <div className="draft-main">
        <PlayerPool
          players={pool}
          takenIds={takenIds}
          availablePositions={availablePositions}
          canPick={canPick}
          onPick={pickPlayer}
          complete={complete}
        />
        <RosterBoard rosters={rosters} onClockIndex={onClockOrdinal} />
      </div>
    </div>
  );
}
