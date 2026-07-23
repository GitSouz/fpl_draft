import { useEffect, useState } from 'react';
import { fetchPlayers, type Player } from '../fpl';
import { SAMPLE_PLAYERS } from '../sampleData';
import { SQUAD_SIZE } from '../draft';
import { createDraft, type CreatedDraft } from './api';
import type { DraftSettings } from './types';

const TIMER_OPTIONS = [
  { label: 'No clock', value: 0 },
  { label: '30s', value: 30 },
  { label: '60s', value: 60 },
  { label: '90s', value: 90 },
  { label: '2 min', value: 120 },
];

interface Props {
  onCreated: (created: CreatedDraft, players: Player[]) => void;
  onBack: () => void;
}

export default function CreateOnlineDraft({ onCreated, onBack }: Props) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [names, setNames] = useState<string[]>(Array.from({ length: 10 }, () => ''));
  const [timerSec, setTimerSec] = useState(90);
  const [autoOnTimeout, setAutoOnTimeout] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const loadLive = () => {
    setLoading(true);
    setLoadErr(null);
    setDemo(false);
    fetchPlayers()
      .then(setPlayers)
      .catch((e: unknown) =>
        setLoadErr(e instanceof Error ? e.message : 'Failed to load players')
      )
      .finally(() => setLoading(false));
  };
  useEffect(loadLive, []);

  const useSample = () => {
    setPlayers(SAMPLE_PLAYERS);
    setDemo(true);
    setLoadErr(null);
    setLoading(false);
  };

  const setName = (i: number, v: string) =>
    setNames((p) => p.map((n, idx) => (idx === i ? v : n)));
  const addManager = () => setNames((p) => [...p, '']);
  const removeManager = (i: number) => setNames((p) => p.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= names.length) return;
    setNames((p) => {
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const shuffle = () =>
    setNames((p) => {
      const n = [...p];
      for (let i = n.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [n[i], n[j]] = [n[j], n[i]];
      }
      return n;
    });

  const trimmed = names.map((n) => n.trim());
  const filled = trimmed.filter(Boolean); // blank rows are ignored
  const dupes = new Set(filled.map((n) => n.toLowerCase())).size !== filled.length;
  const namesOk = filled.length >= 2 && !dupes;

  const create = async () => {
    if (!players || !namesOk || creating) return;
    setCreating(true);
    setCreateErr(null);
    const settings: DraftSettings = { timerSec, autoOnTimeout };
    try {
      const created = await createDraft(settings, filled, players);
      onCreated(created, players);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Failed to create draft');
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading players…</p>
      </div>
    );
  }

  if (loadErr || !players) {
    return (
      <div className="center-screen">
        <h2>Couldn’t load live players</h2>
        <p className="error-text">{loadErr}</p>
        <div className="error-actions">
          <button className="btn-primary" onClick={loadLive}>
            Retry live data
          </button>
          <button className="btn-secondary" onClick={useSample}>
            Use sample data instead
          </button>
        </div>
        <button className="link-btn" onClick={onBack}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="setup">
      <header className="setup-header">
        <button className="link-btn back-link" onClick={onBack}>
          ← Back
        </button>
        <h1>🌐 Create online draft</h1>
        <p className="muted">
          Add your managers in draft order — any number from 2 up (blank rows are
          ignored). They'll claim their own seat by name once you share the code.
          Snake order runs for {SQUAD_SIZE} rounds.
        </p>
        {demo && (
          <p className="muted small">
            🧪 Using sample data — this draft will use fictional players.
          </p>
        )}
      </header>

      <div className="manager-list">
        {names.map((name, i) => (
          <div className="manager-row" key={i}>
            <span className="pick-badge">{i + 1}</span>
            <input
              type="text"
              value={name}
              placeholder={`Manager ${i + 1}`}
              onChange={(e) => setName(i, e.target.value)}
            />
            <div className="row-actions">
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button
                className="icon-btn"
                onClick={() => move(i, 1)}
                disabled={i === names.length - 1}
              >
                ↓
              </button>
              <button
                className="icon-btn danger"
                onClick={() => removeManager(i)}
                disabled={names.length <= 2}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="setup-controls">
        <button className="btn-secondary" onClick={addManager}>
          + Add manager
        </button>
        <button className="btn-secondary" onClick={shuffle}>
          🎲 Randomize order
        </button>
      </div>

      <div className="create-settings">
        <label className="sort-label">
          Pick clock:
          <select value={timerSec} onChange={(e) => setTimerSec(Number(e.target.value))}>
            {TIMER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`check ${timerSec === 0 ? 'disabled' : ''}`}>
          <input
            type="checkbox"
            checked={autoOnTimeout}
            disabled={timerSec === 0}
            onChange={(e) => setAutoOnTimeout(e.target.checked)}
          />
          Auto-pick best available when a clock expires
        </label>
      </div>

      {dupes && <p className="error-text">Manager names must be unique.</p>}
      {!dupes && filled.length < 2 && (
        <p className="muted">Enter at least 2 manager names to start.</p>
      )}
      {createErr && <p className="error-text">{createErr}</p>}

      <button className="btn-primary big" onClick={create} disabled={!namesOk || creating}>
        {creating ? 'Creating…' : `Create draft — ${filled.length} manager${filled.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}
