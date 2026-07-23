// Persists just enough to rejoin an online draft after a refresh: which draft
// we're in, our seat + its secret claim token, and (if we created it) the host
// token. Stored per-browser in localStorage.

export interface OnlineSession {
  draftId: string;
  code: string;
  hostToken?: string; // present if this browser created the draft
  seatId?: string; // the seat this browser has claimed
  claimToken?: string; // secret proving ownership of that seat
}

const KEY = 'fpl-online-session-v1';

export function loadSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as OnlineSession;
    if (s && typeof s.draftId === 'string' && typeof s.code === 'string') return s;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSession(s: OnlineSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
