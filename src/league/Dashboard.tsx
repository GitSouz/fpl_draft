import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLeague, type LeagueBundle } from './api';
import { buildModel } from './model';
import { GameweekView, OverviewView, PlayersView, SquadsView, TransfersView } from './Views';
import './league.css';

// The dashboard is fixed to this one FPL Draft league.
const LEAGUE_ID = 24630;

type Tab = 'overview' | 'gameweek' | 'squads' | 'transfers' | 'players';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'gameweek', label: 'Gameweek' },
  { id: 'squads', label: 'Squads' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'players', label: 'Draft & players' },
];

export default function Dashboard({ onBack }: { onBack?: () => void }) {
  const [bundle, setBundle] = useState<LeagueBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError(null);
      try {
        setBundle(await fetchLeague(LEAGUE_ID));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load league');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const model = useMemo(() => (bundle ? buildModel(bundle) : null), [bundle]);

  // Refresh every 2 minutes while a gameweek is in progress.
  const live = model ? !model.currentFinished : false;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => load(true), 120_000);
    return () => window.clearInterval(t);
  }, [live, load]);

  if (loading && !model) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading your league from FPL Draft…</p>
      </div>
    );
  }

  if (error && !model) {
    return (
      <div className="center-screen">
        <h2>Couldn’t load the league</h2>
        <p className="error-text">{error}</p>
        <div className="error-actions">
          <button className="btn-primary" onClick={() => load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!model) return null;

  return (
    <div className="dash">
      <header className="dash-top">
        <div className="dash-title">
          {onBack && (
            <button className="link-btn" onClick={onBack}>
              ← Menu
            </button>
          )}
          <h1>{model.leagueName}</h1>
          <span className="dash-meta">
            GW{model.currentGw} {model.currentFinished ? '· finished' : <span className="live-pill">● live</span>} ·{' '}
            {model.isH2H ? 'Head-to-head' : 'Classic'} · {model.managers.length} managers
          </span>
        </div>
        <div className="dash-actions">
          <span className="muted small-text">
            Updated {new Date(model.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {error && <span className="error-text"> · refresh failed</span>}
          </span>
          <button className="btn-secondary" onClick={() => load(true)} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </header>
      <nav className="dash-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`dash-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="dash-body">
        {tab === 'overview' && <OverviewView model={model} />}
        {tab === 'gameweek' && <GameweekView model={model} />}
        {tab === 'squads' && <SquadsView model={model} />}
        {tab === 'transfers' && <TransfersView model={model} />}
        {tab === 'players' && <PlayersView model={model} />}
      </main>
    </div>
  );
}
