import { useEffect, useMemo, useReducer, useState } from 'react';
import { fetchPlayers, type Player } from './fpl';
import { reducer, loadState, saveState } from './state';
import Setup from './components/Setup';
import DraftRoom from './components/DraftRoom';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Persist draft state on every change.
  useEffect(() => {
    saveState(state);
  }, [state]);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchPlayers()
      .then((p) => setPlayers(p))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load players')
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const playersById = useMemo(() => {
    const m = new Map<number, Player>();
    if (players) for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading the latest Premier League players…</p>
      </div>
    );
  }

  if (error || !players) {
    return (
      <div className="center-screen">
        <h2>Couldn’t load players</h2>
        <p className="error-text">{error}</p>
        <p className="muted">
          Make sure you’re running <code>npm run dev</code> (the dev server
          proxies the FPL API). If it persists, the FPL site may be briefly
          unavailable.
        </p>
        <button className="btn-primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (state.phase === 'setup') {
    return <Setup onStart={(managers) => dispatch({ type: 'START', managers })} />;
  }

  return (
    <DraftRoom
      state={state}
      players={players}
      playersById={playersById}
      dispatch={dispatch}
    />
  );
}
