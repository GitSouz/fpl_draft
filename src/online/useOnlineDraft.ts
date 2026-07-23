import { useEffect, useMemo, useState } from 'react';
import type { Player } from '../fpl';
import { supabase } from './supabase';
import { fetchDraftById, fetchPicks, fetchPool, fetchSeats } from './api';
import type { DraftRow, PickRow, SeatRow } from './types';

export interface OnlineDraftData {
  draft: DraftRow | null;
  seats: SeatRow[];
  picks: PickRow[];
  pool: Player[];
  poolById: Map<number, Player>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads a draft's rows and keeps them live via Supabase realtime. The player
 * pool is fetched once (it never changes for a draft); drafts/seats/picks are
 * subscribed to so every client sees picks and lobby changes instantly.
 */
export function useOnlineDraft(draftId: string | null): OnlineDraftData {
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [pool, setPool] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = () => setNonce((n) => n + 1);

  // Initial load (and full reloads).
  useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchDraftById(draftId),
      fetchSeats(draftId),
      fetchPicks(draftId),
      fetchPool(draftId),
    ])
      .then(([d, s, p, pl]) => {
        if (cancelled) return;
        setDraft(d);
        setSeats(s);
        setPicks(p);
        setPool(pl);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load draft');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [draftId, nonce]);

  // Realtime subscriptions for drafts / seats / picks.
  useEffect(() => {
    if (!draftId || !supabase) return;
    const client = supabase;
    const filter = `draft_id=eq.${draftId}`;
    const channel = client
      .channel(`draft:${draftId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drafts', filter: `id=eq.${draftId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          setDraft(payload.new as DraftRow);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seats', filter },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as SeatRow;
            setSeats((prev) => prev.filter((s) => s.id !== old.id));
          } else {
            const row = payload.new as SeatRow;
            setSeats((prev) => {
              const rest = prev.filter((s) => s.id !== row.id);
              return [...rest, row].sort((a, b) => a.ordinal - b.ordinal);
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'picks', filter },
        (payload) => {
          const row = payload.new as PickRow;
          setPicks((prev) =>
            prev.some((p) => p.id === row.id)
              ? prev
              : [...prev, row].sort((a, b) => a.overall - b.overall)
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'picks', filter },
        (payload) => {
          const old = payload.old as PickRow;
          setPicks((prev) => prev.filter((p) => p.id !== old.id));
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [draftId]);

  const poolById = useMemo(() => {
    const m = new Map<number, Player>();
    for (const p of pool) m.set(p.id, p);
    return m;
  }, [pool]);

  return { draft, seats, picks, pool, poolById, loading, error, reload };
}
