import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { queryClient } from './query';
import { supabase } from './supabase';

/**
 * One live channel per signed-in session. A change to a table marks the queries that read it
 * (`meta.tables`) stale, coalesced over 250ms; on-screen ones refetch. The socket closes in the
 * background, and everything live refreshes on resume or reconnect, since changes were missed.
 */
const LIVE_TABLES = [
  'roams', 'roam_invites', 'invite_requests', 'friendships', 'open_roams', 'open_roam_invites',
  'open_roam_night_votes', 'open_roam_vibe_votes', 'open_roam_ideas', 'open_roam_idea_votes',
] as const; // the supabase_realtime publication (see the migrations)
export type LiveTable = (typeof LIVE_TABLES)[number];

let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function invalidateTables(tables: readonly string[]) {
  tables.forEach((t) => pending.add(t));
  timer ??= setTimeout(() => {
    const changed = pending;
    pending = new Set();
    timer = null;
    queryClient.invalidateQueries({ predicate: (q) => !!(q.meta?.tables as string[] | undefined)?.some((t) => changed.has(t)) });
  }, 250);
}

export function useRealtimeSync(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let channel: RealtimeChannel | null = null;
    const start = () => {
      if (channel) return;
      let connectedBefore = false;
      channel = supabase.channel(`app:${userId}`);
      for (const table of LIVE_TABLES) channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => invalidateTables([table]));
      channel.subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (connectedBefore) invalidateTables(LIVE_TABLES); // a reconnect after a gap
        connectedBefore = true;
      });
    };
    const stop = () => {
      if (channel) supabase.removeChannel(channel);
      channel = null;
    };

    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !channel) {
        start();
        invalidateTables(LIVE_TABLES); // changes made while we were away never reached us
      } else if (state === 'background') stop();
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [userId]);
}
