import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { queryClient } from './query';
import { supabase } from './supabase';

/**
 * Live updates, done once for the whole app.
 *
 * One realtime channel per signed-in session listens to every table the app
 * shows (Supabase only sends rows your privacy rules let you see). A change
 * marks the queries that read that table as stale; the ones on screen refetch,
 * the rest refetch when you go back to them. Bursts of changes (five friends
 * answering at once) are coalesced into one refetch.
 *
 * The socket is closed while the app is in the background (saves battery and
 * data), and everything live is refreshed when it reconnects, so nothing
 * that changed in the meantime is missed.
 *
 * Queries opt in by naming their tables: `meta: { tables: ['roams'] }`.
 */

/** Tables in the supabase_realtime publication (see the migrations). */
export const LIVE_TABLES = [
  'roams',
  'roam_invites',
  'invite_requests',
  'friendships',
  'open_roams',
  'open_roam_invites',
  'open_roam_night_votes',
  'open_roam_vibe_votes',
  'open_roam_ideas',
  'open_roam_idea_votes',
] as const;
export type LiveTable = (typeof LIVE_TABLES)[number];

const COALESCE_MS = 250;

let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function readsAny(meta: Record<string, unknown> | undefined, tables: Set<string>) {
  const read = meta?.tables as string[] | undefined;
  return !!read?.some((t) => tables.has(t));
}

/** Marks queries reading these tables stale (on-screen ones refetch), batched. */
export function invalidateTables(tables: Iterable<string>) {
  for (const t of tables) pending.add(t);
  if (timer) return;
  timer = setTimeout(() => {
    const changed = pending;
    pending = new Set();
    timer = null;
    queryClient.invalidateQueries({ predicate: (q) => readsAny(q.meta, changed) });
  }, COALESCE_MS);
}

/** Refreshes every live query (after a reconnect, when events may have been missed). */
function invalidateAllLive() {
  invalidateTables(LIVE_TABLES);
}

function openChannel(userId: string): RealtimeChannel {
  const channel = supabase.channel(`app:${userId}`);
  for (const table of LIVE_TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => invalidateTables([table]));
  }
  let connectedBefore = false;
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    // The first connect follows a fresh load; later ones are reconnects after a gap.
    if (connectedBefore) invalidateAllLive();
    connectedBefore = true;
  });
  return channel;
}

/** Keeps the app's one realtime channel open while signed in and in the foreground. */
export function useRealtimeSync(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let channel: RealtimeChannel | null = null;

    const start = () => {
      if (channel) return;
      channel = openChannel(userId);
    };
    const stop = () => {
      if (!channel) return;
      supabase.removeChannel(channel);
      channel = null;
    };

    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const resuming = !channel;
        start();
        // Changes made while we were away never reached us.
        if (resuming) invalidateAllLive();
      } else if (state === 'background') {
        stop();
      }
    });

    return () => {
      sub.remove();
      stop();
    };
  }, [userId]);
}
