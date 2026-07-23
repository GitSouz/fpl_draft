import { useEffect, useMemo, useReducer, useState } from 'react';
import { fetchPlayers, type Player } from './fpl';
import { SAMPLE_PLAYERS } from './sampleData';
import { reducer, loadState, saveState } from './state';
import Setup from './components/Setup';
import DraftRoom from './components/DraftRoom';

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Persist draft state on every change.
  useEffect(() => {
    saveState(state);
  }, [state]);

  const load = () => {
    setLoading(true);
    setError(null);
    setDemo(false);
    fetchPlayers()
      .then((p) => setPlayers(p))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load players')
      )
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const useSampleData = () => {
    setPlayers(SAMPLE_PLAYERS);
    setDemo(true);
    setError(null);
    setLoading(false);
  };

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
        <h2>Couldn’t load live players</h2>
        <p className="error-text">{error}</p>
        <p className="muted">
          Make sure you’re running <code>npm run dev</code> (the dev server
          proxies the FPL API).
        </p>
        <div className="error-actions">
          <button className="btn-primary" onClick={load}>
            Retry live data
          </button>
          <button className="btn-secondary" onClick={useSampleData}>
            Use sample data instead
          </button>
        </div>
        <p className="muted small">
          Sample data is 400 fictional players across the real Premier League
          clubs — perfect for a practice run while FPL is offline.
        </p>
      </div>
    );
  }

  const banner = demo ? (
    <div className="demo-banner">
      🧪 <strong>Demo mode</strong> — using sample data, not live FPL players.
      <button className="link-btn" onClick={load}>
        Try live data
      </button>
    </div>
  ) : null;

  return (
    <>
      {banner}
      {state.phase === 'setup' ? (
        <Setup onStart={(managers) => dispatch({ type: 'START', managers })} />
      ) : (
        <DraftRoom
          state={state}
          players={players}
          playersById={playersById}
          dispatch={dispatch}
        />
      )}
    </>
  );
}
