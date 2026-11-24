import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBootstrap, fetchLeague, type LeagueBundle } from './api';
import { buildDemoBundle } from './demo';
import { buildModel } from './model';
import { GameweekView, OverviewView, PlayersView, SquadsView, TransfersView } from './Views';
import './league.css';

const STORAGE_KEY = 'fpl-league-dashboard:id';
type Tab = 'overview' | 'gameweek' | 'squads' | 'transfers' | 'players';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'gameweek', label: 'Gameweek' },
  { id: 'squads', label: 'Squads' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'players', label: 'Draft & players' },
];

function readLeagueParam(): string | null {
  const q = new URLSearchParams(window.location.search).get('league');
  if (q) return q;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLeagueParam(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('league', id);
  else url.searchParams.delete('league');
  window.history.replaceState(null, '', url);
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — URL still carries it */
  }
}

/** Accepts a bare ID or a pasted draft.premierleague.com URL. */
function parseLeagueInput(s: string): string | null {
  const t = s.trim();
  if (t.toLowerCase() === 'demo') return 'demo';
  const m = t.match(/league\/(\d+)/) ?? t.match(/^(\d+)$/);
  return m ? m[1] : null;
}

export default function Dashboard({ onBack }: { onBack?: () => void }) {
  const [leagueId, setLeagueId] = useState<string | null>(readLeagueParam);
  const [bundle, setBundle] = useState<LeagueBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(
    async (quiet = false) => {
      if (!leagueId) return;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        if (leagueId === 'demo') {
          const bs = await fetchBootstrap();
          const cur = bs.events.current ?? 1;
          const ev = bs.events.data.find((e) => e.id === cur);
          setBundle(buildDemoBundle(bs, cur, ev?.finished ?? true));
        } else {
          setBundle(await fetchLeague(Number(leagueId)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load league');
      } finally {
        setLoading(false);
      }
    },
    [leagueId]
  );

  useEffect(() => {
    setBundle(null);
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

  if (!leagueId) {
    return (
      <LeaguePicker
        onBack={onBack}
        onPick={(id) => {
          writeLeagueParam(id);
          setLeagueId(id);
        }}
      />
    );
  }

  const changeLeague = () => {
    writeLeagueParam(null);
    setLeagueId(null);
    setBundle(null);
  };

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
          <button className="btn-secondary" onClick={changeLeague}>
            Change league
          </button>
        </div>
      </div>
    );
  }

  if (!model) return null;

  return (
    <div className="dash">
      {leagueId === 'demo' && (
        <div className="demo-banner">
          🧪 <strong>Demo league</strong> — real players, made-up managers and results.
          <button className="link-btn" onClick={changeLeague}>
            Use my league
          </button>
        </div>
      )}
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
          <button className="btn-secondary" onClick={changeLeague}>
            Change league
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

function LeaguePicker({ onPick, onBack }: { onPick: (id: string) => void; onBack?: () => void }) {
  const [value, setValue] = useState('');
  const parsed = parseLeagueInput(value);
  return (
    <div className="landing">
      <h1>📊 League dashboard</h1>
      <p className="muted">
        Standings, form, luck, live gameweek scores, squads, waivers and trades for your FPL Draft mini league.
      </p>
      <form
        className="league-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed) onPick(parsed);
        }}
      >
        <input
          className="code-input"
          inputMode="numeric"
          placeholder="League ID or league URL"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button className="btn-primary" type="submit" disabled={!parsed}>
          Open
        </button>
      </form>
      <p className="muted small">
        To find your league ID (a number, not the invite code): log in at draft.premierleague.com, then open{' '}
        <a href="https://draft.premierleague.com/api/bootstrap-dynamic" target="_blank" rel="noreferrer">
          draft.premierleague.com/api/bootstrap-dynamic
        </a>{' '}
        in the same browser and look for <code>"leagues"</code> — the <code>"id"</code> next to your league’s name is it.
        It’s saved in this browser and in the link, so you can bookmark or share the page.
      </p>
      <button className="link-btn" onClick={() => onPick('demo')}>
        Just looking? Open the demo league
      </button>
      {onBack && (
        <button className="link-btn" onClick={onBack}>
          ← Back
        </button>
      )}
    </div>
  );
}
