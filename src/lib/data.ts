import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Circle, Invite, InviteRequest, Profile, Roam } from './types';

export const PROFILE = 'id, display_name, avatar_url';

/** Re-runs `load` whenever any of these tables change (subject to RLS). */
function useLive(tables: string[], load: () => void) {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const key = tables.join(',');

  useEffect(() => {
    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => loadRef.current());
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key]);
}

export function useLoader<T>(fetcher: () => Promise<T>, initial: T, live: string[] = []) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetcher);
  useEffect(() => {
    fetchRef.current = fetcher;
  });

  const reload = useCallback(async () => {
    try {
      setData(await fetchRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  useLive(live, reload);

  return { data, loading, error, reload };
}

// ─── Friends ────────────────────────────────────────────────────

export type FriendsData = {
  friends: Profile[];
  incoming: { id: string; profile: Profile }[];
  outgoing: Profile[];
};

export function useFriends() {
  const { userId } = useAuth();
  return useLoader<FriendsData>(
    async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select(`id, status, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(${PROFILE}), addressee:profiles!friendships_addressee_id_fkey(${PROFILE})`);
      if (error) throw error;
      const out: FriendsData = { friends: [], incoming: [], outgoing: [] };
      for (const f of data ?? []) {
        const requester = f.requester as unknown as Profile;
        const addressee = f.addressee as unknown as Profile;
        const other = f.requester_id === userId ? addressee : requester;
        if (!other?.display_name) continue;
        if (f.status === 'accepted') out.friends.push(other);
        else if (f.addressee_id === userId) out.incoming.push({ id: f.id, profile: requester });
        else out.outgoing.push(addressee);
      }
      out.friends.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));
      return out;
    },
    { friends: [], incoming: [], outgoing: [] },
    ['friendships'],
  );
}

// ─── Circles ──────────────────────────────────────────────────────

export function useCircles() {
  return useLoader<Circle[]>(async () => {
    const [{ data, error }, { data: last }] = await Promise.all([
      supabase
        .from('crews')
        .select(`id, name, created_at, crew_members(member:profiles(${PROFILE}))`)
        .order('created_at'),
      supabase.rpc('crew_last_roamed'),
    ]);
    if (error) throw error;
    const lastBy = new Map<string, string>(
      ((last ?? []) as { crew_id: string; last_roamed_at: string }[]).map((r) => [r.crew_id, r.last_roamed_at]),
    );
    return (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      members: ((c.crew_members ?? []) as unknown as { member: Profile }[]).map((m) => m.member).filter(Boolean),
      lastRoamedAt: lastBy.get(c.id) ?? null,
    }));
  }, []);
}

// ─── Feed ───────────────────────────────────────────────────────

export type FeedItem = {
  roam: Roam;
  mine: Invite; // my own row
  ins: Invite[]; // everyone who's In (host included), with profiles
};

export function useFeed() {
  const { userId } = useAuth();
  return useLoader<FeedItem[]>(
    async () => {
      if (!userId) return [];
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: mine, error } = await supabase
        .from('roam_invites')
        .select(`roam_id, user_id, response, note, responded_at, roam:roams!inner(*, host:profiles!roams_host_id_fkey(${PROFILE}))`)
        .eq('user_id', userId)
        .gte('roam.ends_at', since);
      if (error) throw error;

      const ids = (mine ?? []).map((m) => m.roam_id);
      if (ids.length === 0) return [];

      const { data: ins, error: insError } = await supabase
        .from('roam_invites')
        .select(`roam_id, user_id, response, note, responded_at, profile:profiles(${PROFILE})`)
        .in('roam_id', ids)
        .eq('response', 'in');
      if (insError) throw insError;

      return (mine ?? []).map((m) => ({
        roam: m.roam as unknown as Roam,
        mine: { roam_id: m.roam_id, user_id: m.user_id, response: m.response, note: m.note, responded_at: m.responded_at },
        ins: ((ins ?? []) as unknown as Invite[]).filter((i) => i.roam_id === m.roam_id),
      })) as FeedItem[];
    },
    [],
    ['roams', 'roam_invites'],
  );
}

// ─── One Roam ───────────────────────────────────────────────────

export type RoamDetail = {
  roam: Roam | null;
  invites: Invite[]; // what RLS lets me see: mine, everyone's In, or everything if I'm host
  requests: InviteRequest[];
};

export function useRoam(id: string) {
  return useLoader<RoamDetail>(
    async () => {
      const [{ data: roam, error }, { data: invites }, { data: requests }] = await Promise.all([
        supabase.from('roams').select(`*, host:profiles!roams_host_id_fkey(${PROFILE})`).eq('id', id).maybeSingle(),
        supabase
          .from('roam_invites')
          .select(`roam_id, user_id, response, note, responded_at, profile:profiles(${PROFILE})`)
          .eq('roam_id', id),
        supabase
          .from('invite_requests')
          .select(`id, roam_id, requester_id, invitee_id, status, requester:profiles!invite_requests_requester_id_fkey(${PROFILE}), invitee:profiles!invite_requests_invitee_id_fkey(${PROFILE})`)
          .eq('roam_id', id)
          .eq('status', 'pending'),
      ]);
      if (error) throw error;
      return {
        roam: roam as Roam | null,
        invites: (invites ?? []) as unknown as Invite[],
        requests: (requests ?? []) as unknown as InviteRequest[],
      };
    },
    { roam: null, invites: [], requests: [] },
    ['roams', 'roam_invites', 'invite_requests'],
  );
}

/** Other Roams I'm In on that overlap this one. */
export async function findClashes(userId: string, roam: Roam): Promise<Roam[]> {
  const { data } = await supabase
    .from('roam_invites')
    .select(`roam:roams!inner(*, host:profiles!roams_host_id_fkey(${PROFILE}))`)
    .eq('user_id', userId)
    .eq('response', 'in')
    .neq('roam_id', roam.id)
    .neq('roam.status', 'cancelled')
    .lt('roam.starts_at', roam.ends_at)
    .gt('roam.ends_at', roam.starts_at);
  return ((data ?? []) as unknown as { roam: Roam }[]).map((r) => r.roam);
}
