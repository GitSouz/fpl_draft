import { useState } from 'react';
import { SQUAD_SIZE } from '../draft';

const DEFAULT_MANAGERS = 10;

interface Props {
  onStart: (managers: string[]) => void;
}

export default function Setup({ onStart }: Props) {
  const [names, setNames] = useState<string[]>(
    Array.from({ length: DEFAULT_MANAGERS }, () => '')
  );

  const setName = (i: number, value: string) =>
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));

  const addManager = () => setNames((prev) => [...prev, '']);
  const removeManager = (i: number) =>
    setNames((prev) => prev.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= names.length) return;
    setNames((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const shuffle = () => {
    setNames((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  };

  const trimmed = names.map((n) => n.trim());
  const filled = trimmed.filter((n) => n.length > 0);
  const hasDuplicates =
    new Set(filled.map((n) => n.toLowerCase())).size !== filled.length;
  const canStart = filled.length >= 2 && !hasDuplicates && filled.length === names.length;

  const start = () => {
    if (!canStart) return;
    onStart(trimmed);
  };

  return (
    <div className="setup">
      <header className="setup-header">
        <h1>⚽ FPL Snake Draft</h1>
        <p className="muted">
          Enter your managers in draft order. Round 1 goes top-to-bottom, round 2
          snakes back, and so on for {SQUAD_SIZE} rounds. Reorder with the arrows
          or hit <strong>Randomize</strong>.
        </p>
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
              onKeyDown={(e) => e.key === 'Enter' && start()}
              autoFocus={i === 0}
            />
            <div className="row-actions">
              <button
                className="icon-btn"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                className="icon-btn"
                onClick={() => move(i, 1)}
                disabled={i === names.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                className="icon-btn danger"
                onClick={() => removeManager(i)}
                disabled={names.length <= 2}
                title="Remove"
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

      {hasDuplicates && (
        <p className="error-text">Manager names must be unique.</p>
      )}
      {!hasDuplicates && filled.length !== names.length && (
        <p className="muted">Fill in every name (or remove empty rows) to start.</p>
      )}

      <button className="btn-primary big" onClick={start} disabled={!canStart}>
        Start draft — {names.length} managers × {SQUAD_SIZE} rounds ={' '}
        {names.length * SQUAD_SIZE} picks
      </button>
    </div>
  );
}
