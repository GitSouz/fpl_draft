import { useState } from 'react';
import type { DraftRow, SeatRow } from './types';

interface Props {
  draft: DraftRow;
  seats: SeatRow[];
  mySeatId?: string;
  isHost: boolean;
  onClaim: (seatId: string) => Promise<void>;
  onRelease: () => Promise<void>;
  onStart: () => Promise<void>;
  onExit: () => void;
}

export default function Lobby({
  draft,
  seats,
  mySeatId,
  isHost,
  onClaim,
  onRelease,
  onStart,
  onExit,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const claimedCount = seats.filter((s) => s.claimed).length;
  const allClaimed = seats.length > 0 && claimedCount === seats.length;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(draft.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  const start = () => {
    if (!allClaimed) {
      const ok = confirm(
        `${seats.length - claimedCount} seat(s) are still unclaimed. ` +
          `Unclaimed managers will only get players via the pick clock's ` +
          `auto-pick (or your host "force auto-pick"). Start anyway?`
      );
      if (!ok) return;
    }
    run('start', onStart);
  };

  return (
    <div className="lobby">
      <button className="link-btn back-link" onClick={onExit}>
        ← Leave
      </button>

      <div className="code-card">
        <span className="code-label">Room code</span>
        <span className="code-value">{draft.code}</span>
        <button className="btn-secondary" onClick={copyCode}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <p className="muted center">
        Share this code with your league. Everyone opens the app, chooses
        <strong> Join</strong>, enters the code, and claims their seat.
      </p>

      <h2 className="lobby-title">
        Draft order · {claimedCount}/{seats.length} claimed
      </h2>
      <div className="seat-list">
        {seats.map((s) => {
          const mine = s.id === mySeatId;
          return (
            <div key={s.id} className={`seat-row ${mine ? 'mine' : ''}`}>
              <span className="pick-badge">{s.ordinal + 1}</span>
              <span className="seat-name">{s.name}</span>
              {mine ? (
                <span className="seat-actions">
                  <span className="you-tag">✓ You</span>
                  <button
                    className="btn-secondary danger sm"
                    disabled={busy !== null}
                    onClick={() => run('release', onRelease)}
                  >
                    Release
                  </button>
                </span>
              ) : s.claimed ? (
                <span className="taken-tag">Taken</span>
              ) : (
                <button
                  className="btn-primary sm"
                  disabled={busy !== null || Boolean(mySeatId)}
                  title={mySeatId ? 'Release your current seat first' : 'Claim this seat'}
                  onClick={() => run(`claim-${s.id}`, () => onClaim(s.id))}
                >
                  {busy === `claim-${s.id}` ? '…' : 'Claim'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {err && <p className="error-text center">{err}</p>}

      <div className="lobby-footer">
        {isHost ? (
          <button className="btn-primary big" onClick={start} disabled={busy === 'start'}>
            {busy === 'start' ? 'Starting…' : '▶ Start draft'}
          </button>
        ) : (
          <p className="muted center">
            {mySeatId
              ? '✓ Seat claimed — waiting for the host to start the draft…'
              : 'Claim your seat above, then wait for the host to start.'}
          </p>
        )}
      </div>
    </div>
  );
}
