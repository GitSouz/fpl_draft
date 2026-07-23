// Snake-draft ordering and FPL squad-composition rules.
import type { Position } from './fpl';

export const POSITIONS: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

// Standard FPL Draft squad: 2 GK, 5 DEF, 5 MID, 3 FWD = 15 players.
export const SQUAD_LIMITS: Record<Position, number> = {
  GKP: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export const SQUAD_SIZE = Object.values(SQUAD_LIMITS).reduce((a, b) => a + b, 0); // 15

/**
 * Which manager (index into the ordered managers array) is on the clock for a
 * given zero-based overall pick number, using snake order.
 *
 * Round 0 (picks 0..N-1):   managers 0 -> N-1
 * Round 1 (picks N..2N-1):  managers N-1 -> 0
 * ...and so on, alternating.
 */
export function managerForPick(overallPick: number, managerCount: number): number {
  const round = Math.floor(overallPick / managerCount);
  const indexInRound = overallPick % managerCount;
  return round % 2 === 0 ? indexInRound : managerCount - 1 - indexInRound;
}

export function roundForPick(overallPick: number, managerCount: number): number {
  return Math.floor(overallPick / managerCount); // zero-based
}

export function totalPicks(managerCount: number): number {
  return managerCount * SQUAD_SIZE;
}

/** Count of each position already on a roster. */
export function positionCounts(positions: Position[]): Record<Position, number> {
  const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of positions) counts[p]++;
  return counts;
}
