import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { forgetSavedPushToken, registerForPush } from './push';
import { kv } from './storage';
import { supabase } from './supabase';
import type { Profile } from './types';

// Your profile is cached on the phone so the app opens instantly, and offline.
const profileKey = (id: string) => `roami.profile.${id}`;

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  userId: string | null;
  needsProfile: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const userId = session?.user.id ?? null;
  // Whose profile is loaded (undefined until the first auth event), so hourly token refreshes don't reload it.
  const profileFor = useRef<string | null | undefined>(undefined);

  const loadProfile = useCallback(async (id: string | null) => {
    if (!id) return setProfile(null);
    const { data, error } = await supabase.from('profiles').select('id, display_name, avatar_url').eq('id', id).maybeSingle();
    // A failed load keeps what we have (treating it as "no profile" would send you to onboarding),
    // and one that finishes after you signed out or switched accounts is stale.
    if (error || profileFor.current !== id) return;
    const next = data ?? { id, display_name: null, avatar_url: null };
    kv.setJSON(profileKey(id), next);
    setProfile(next);
  }, []);

  useEffect(() => {
    // Fires INITIAL_SESSION on subscribe, then on every sign-in, sign-out and token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const id = next?.user.id ?? null;
      if (id === profileFor.current) return;
      if (profileFor.current) {
        kv.set(profileKey(profileFor.current), null); // signed out (any way, including deleting the account)
        forgetSavedPushToken();
      }
      profileFor.current = id;
      const cached = id ? kv.getJSON<Profile | null>(profileKey(id), null) : null;
      setProfile(cached);
      if (cached?.display_name) setReady(true);
      // Not awaited inside the callback, as Supabase recommends.
      setTimeout(() => loadProfile(id).finally(() => setReady(true)), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    if (userId && profile?.display_name) registerForPush(userId).catch(() => {});
  }, [userId, profile?.display_name]);

  const value: AuthState = {
    ready,
    session,
    profile,
    userId,
    needsProfile: !!session && !profile?.display_name,
    refreshProfile: () => loadProfile(userId),
    signOut: async () => {
      // Stop pushes to this phone (while still signed in, so the delete is allowed).
      if (userId) await supabase.from('push_tokens').delete().eq('user_id', userId);
      await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
