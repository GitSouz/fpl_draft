// Draft state, reducer, and localStorage persistence.
import { totalPicks } from './draft';

export interface Pick {
  playerId: number;
  managerIndex: number;
  overall: number; // zero-based overall pick number
  round: number; // zero-based
}

export type Phase = 'setup' | 'draft';

export interface DraftState {
  phase: Phase;
  managers: string[]; // ordered by draft position
  picks: Pick[];
}

export type Action =
  | { type: 'START'; managers: string[] }
  | { type: 'PICK'; playerId: number }
  | { type: 'UNDO' }
  | { type: 'RESET' };

export const initialState: DraftState = {
  phase: 'setup',
  managers: [],
  picks: [],
};

export function reducer(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'START':
      return { phase: 'draft', managers: action.managers, picks: [] };

    case 'PICK': {
      const overall = state.picks.length;
      if (overall >= totalPicks(state.managers.length)) return state;
      // Guard against picking the same player twice.
      if (state.picks.some((p) => p.playerId === action.playerId)) return state;
      const managerCount = state.managers.length;
      const round = Math.floor(overall / managerCount);
      const indexInRound = overall % managerCount;
      const managerIndex =
        round % 2 === 0 ? indexInRound : managerCount - 1 - indexInRound;
      return {
        ...state,
        picks: [...state.picks, { playerId: action.playerId, managerIndex, overall, round }],
      };
    }

    case 'UNDO':
      if (state.picks.length === 0) return state;
      return { ...state, picks: state.picks.slice(0, -1) };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

const STORAGE_KEY = 'fpl-draft-state-v1';

export function loadState(): DraftState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as DraftState;
    // Minimal shape validation.
    if (
      (parsed.phase === 'setup' || parsed.phase === 'draft') &&
      Array.isArray(parsed.managers) &&
      Array.isArray(parsed.picks)
    ) {
      return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return initialState;
}

export function saveState(state: DraftState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full / unavailable — non-fatal
  }
}
