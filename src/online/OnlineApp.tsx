import { useState } from 'react';
import { claimSeat, fetchDraftByCode, releaseSeat, startDraft } from './api';
import { clearSession, loadSession, saveSession, type OnlineSession } from './session';
import { useOnlineDraft } from './useOnlineDraft';
import CreateOnlineDraft from './CreateOnlineDraft';
import Lobby from './Lobby';
import OnlineDraftRoom from './OnlineDraftRoom';

interface Props {
  onExitToMenu: () => void;
}

type View = 'menu' | 'create' | 'join';

export default function OnlineApp({ onExitToMenu }: Props) {
  const [session, setSession] = useState<OnlineSession | null>(() => loadSession());
  const [view, setView] = useState<View>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const data = useOnlineDraft(session?.draftId ?? null);

  const setAndSave = (s: OnlineSession | null) => {
    setSession(s);
    if (s) saveSession(s);
    else clearSession();
  };

  const leaveDraft = () => {
    setAndSave(null);
    setView('menu');
  };

  // --- No active draft: create / join menu ---------------------------------
  if (!session) {
    if (view === 'create') {
      return (
        <CreateOnlineDraft
          onBack={() => setView('menu')}
          onCreated={(created) =>
            setAndSave({
              draftId: created.draft_id,
              code: created.code,
              hostToken: created.host_token,
            })
          }
        />
      );
    }

    if (view === 'join') {
      const join = async () => {
        const code = joinCode.trim().toUpperCase();
        if (code.length < 4) {
          setJoinErr('Enter the room code your host shared.');
          return;
        }
        setJoining(true);
        setJoinErr(null);
        try {
          const draft = await fetchDraftByCode(code);
          if (!draft) {
            setJoinErr('No draft found with that code.');
          } else {
            setAndSave({ draftId: draft.id, code: draft.code });
          }
        } catch (e) {
          setJoinErr(e instanceof Error ? e.message : 'Failed to join');
        } finally {
          setJoining(false);
        }
      };
      return (
        <div className="center-screen">
          <h2>Join a draft</h2>
          <input
            className="search code-input"
            placeholder="ROOM CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            autoFocus
          />
          {joinErr && <p className="error-text">{joinErr}</p>}
          <div className="error-actions">
            <button className="btn-primary" onClick={join} disabled={joining}>
              {joining ? 'Joining…' : 'Join'}
            </button>
            <button className="btn-secondary" onClick={() => setView('menu')}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="landing">
        <button className="link-btn back-link" onClick={onExitToMenu}>
          ← Back to menu
        </button>
        <h1>🌐 Online draft</h1>
        <div className="mode-cards">
          <button className="mode-card" onClick={() => setView('create')}>
            <span className="mode-emoji">➕</span>
            <span className="mode-title">Create a draft</span>
            <span className="mode-desc">
              Set up managers and the pick clock, then share the room code.
            </span>
          </button>
          <button className="mode-card" onClick={() => setView('join')}>
            <span className="mode-emoji">🔑</span>
            <span className="mode-title">Join a draft</span>
            <span className="mode-desc">Enter a room code and claim your seat.</span>
          </button>
        </div>
      </div>
    );
  }

  // --- Active session: load + route by draft status ------------------------
  if (data.loading && !data.draft) {
    return (
      <div className="center-screen">
        <div className="spinner" />
        <p>Loading draft {session.code}…</p>
      </div>
    );
  }

  if (data.error || !data.draft) {
    return (
      <div className="center-screen">
        <h2>Couldn’t load draft {session.code}</h2>
        <p className="error-text">{data.error ?? 'Draft not found (it may have been removed).'}</p>
        <div className="error-actions">
          <button className="btn-primary" onClick={data.reload}>
            Retry
          </button>
          <button className="btn-secondary" onClick={leaveDraft}>
            Leave
          </button>
        </div>
      </div>
    );
  }

  const onClaim = async (seatId: string) => {
    const token = await claimSeat(session.code, seatId);
    setAndSave({ ...session, seatId, claimToken: token });
  };
  const onRelease = async () => {
    if (session.claimToken) await releaseSeat(session.claimToken);
    setAndSave({ ...session, seatId: undefined, claimToken: undefined });
  };
  const onStart = async () => {
    if (session.hostToken) await startDraft(session.hostToken);
  };

  if (data.draft.status === 'lobby') {
    return (
      <Lobby
        draft={data.draft}
        seats={data.seats}
        mySeatId={session.seatId}
        isHost={Boolean(session.hostToken)}
        onClaim={onClaim}
        onRelease={onRelease}
        onStart={onStart}
        onExit={leaveDraft}
      />
    );
  }

  return (
    <OnlineDraftRoom
      draft={data.draft}
      seats={data.seats}
      picks={data.picks}
      pool={data.pool}
      poolById={data.poolById}
      session={session}
      onExit={leaveDraft}
    />
  );
}
