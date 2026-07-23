import { useEffect, useRef, useState } from 'react';

interface Props {
  // Changing this value restarts the clock (pass the current pick number).
  pickNumber: number;
  durationSec: number; // 0 disables the clock
  // Called once when the clock reaches 0 (e.g. to auto-pick).
  onExpire?: () => void;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // audio not available — ignore
  }
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function PickTimer({ pickNumber, durationSec, onExpire }: Props) {
  const [remaining, setRemaining] = useState(durationSec);
  const [running, setRunning] = useState(true);
  const fired = useRef(false); // guards the once-per-pick expiry actions

  // Restart whenever a new manager comes on the clock or the duration changes.
  useEffect(() => {
    setRemaining(durationSec);
    setRunning(true);
    fired.current = false;
  }, [pickNumber, durationSec]);

  useEffect(() => {
    if (!running || durationSec === 0) return;
    const id = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running, durationSec]);

  useEffect(() => {
    if (durationSec > 0 && remaining === 0 && !fired.current) {
      fired.current = true;
      beep();
      onExpire?.();
    }
  }, [remaining, durationSec, onExpire]);

  if (durationSec === 0) return null;

  const state =
    remaining === 0 ? 'expired' : remaining <= 10 ? 'danger' : remaining <= 20 ? 'warn' : 'ok';

  return (
    <div className={`pick-timer ${state}`}>
      <span className="timer-time">{remaining === 0 ? "Time's up!" : fmt(remaining)}</span>
      <div className="timer-controls">
        <button
          className="icon-btn"
          onClick={() => setRunning((r) => !r)}
          title={running ? 'Pause' : 'Resume'}
        >
          {running ? '⏸' : '▶'}
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            setRemaining(durationSec);
            setRunning(true);
            fired.current = false;
          }}
          title="Reset clock"
        >
          ↺
        </button>
      </div>
    </div>
  );
}
