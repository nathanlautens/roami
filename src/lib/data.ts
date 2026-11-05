import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAuth } from './auth';
import type { LiveTable } from './realtime';
import { supabase } from './supabase';
import type { Circle, Invite, InviteRequest, Profile, Roam } from './types';

export const PROFILE = 'id, display_name, avatar_url';

/**
 * Loads data through the shared query cache (see query.ts).
 *
 * `key` identifies the data, so every screen asking for the same key shares
 * one request and one copy. `live` names the tables it reads: realtime marks
 * it stale when they change (see realtime.ts). Screens that aren't focused
 * stop listening and catch up when you come back to them.
 */
export function useLoader<T>(key: QueryKey, fetcher: () => Promise<T>, initial: T, live: LiveTable[] = []) {
  const focused = useIsFocused();
  // A stable placeholder, so effects that depend on `data` don't re-run every render while loading.
  const [placeholder] = useState(initial);
  const query = useQuery({ queryKey: key, queryFn: fetcher, meta: { tables: live }, subscribed: focused });
  const { refetch } = query;
  const reload = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    data: query.data ?? placeholder,
    loading: query.isPending,
    error: query.error ? errorMessage(query.error) : null,
    reload,
  };
}

function errorMessage(e: unknown) {
  return (e as { message?: string })?.message ?? String(e);
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
    ['friends', userId],
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
  const { userId } = useAuth();
  return useLoader<Circle[]>(['circles', userId], async () => {
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

const INVITE = 'roam_id, user_id, response, note, responded_at';
const MY_INVITES = `${INVITE}, roam:roams!inner(*, host:profiles!roams_host_id_fkey(${PROFILE}))`;

/** My invites (from `query`) with everyone who's In on each, in one more query. */
async function withIns(query: PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<FeedItem[]> {
  const { data, error } = await query;
  if (error) throw error;
  const mine = (data ?? []) as (Invite & { roam: Roam })[];
  if (!mine.length) return [];
  const { data: ins, error: insError } = await supabase
    .from('roam_invites')
    .select(`${INVITE}, profile:profiles(${PROFILE})`)
    .in('roam_id', mine.map((m) => m.roam_id))
    .eq('response', 'in');
  if (insError) throw insError;
  const all = (ins ?? []) as unknown as Invite[];
  return mine.map(({ roam, ...inv }) => ({ roam, mine: inv, ins: all.filter((i) => i.roam_id === inv.roam_id) }));
}

export function useFeed() {
  const { userId } = useAuth();
  return useLoader<FeedItem[]>(
    ['feed', userId],
    async () =>
      userId
        ? withIns(supabase.from('roam_invites').select(MY_INVITES).eq('user_id', userId).gt('roam.ends_at', new Date().toISOString()).neq('roam.status', 'cancelled'))
        : [],
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
  const { userId } = useAuth();
  return useLoader<RoamDetail>(
    ['roam', id, userId],
    async () => {
      const [{ data: roam, error }, { data: invites }, { data: requests }] = await Promise.all([
        supabase.from('roams').select(`*, host:profiles!roams_host_id_fkey(${PROFILE})`).eq('id', id).maybeSingle(),
        supabase
          .from('roam_invites')
          .select(`${INVITE}, profile:profiles(${PROFILE})`)
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

// ─── Archive ────────────────────────────────────────────────────

/** Roams that are over or were called off, newest first. */
export function useArchive() {
  const { userId } = useAuth();
  return useLoader<FeedItem[]>(['archive', userId], async () => {
    if (!userId) return [];
    const items = await withIns(
      supabase
        .from('roam_invites')
        .select(MY_INVITES)
        .eq('user_id', userId)
        .or(`ends_at.lte.${new Date().toISOString()},status.eq.cancelled`, { referencedTable: 'roam' })
        .order('invited_at', { ascending: false }) // so the 200 kept are your latest
        .limit(200),
    );
    return items.sort((a, b) => b.roam.starts_at.localeCompare(a.roam.starts_at));
  }, []);
}
