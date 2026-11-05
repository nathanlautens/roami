import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { SKIP_LOGIN } from './config';
import { forgetSavedPushToken, registerForPush } from './push';
import { kv } from './storage';
import { supabase } from './supabase';
import type { Profile } from './types';

// Your own profile, kept on the phone so the app opens straight away (and
// offline) without waiting for the network.
const profileKey = (id: string) => `roami.profile.${id}`;
const cachedProfile = (id: string) => kv.getJSON<Profile | null>(profileKey(id), null);

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  userId: string | null;
  needsProfile: boolean;
  /** Set when the background (testing-mode) sign-in failed. */
  loginError: string | null;
  retryQuickLogin: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', id)
      .maybeSingle();
    // Offline or a blip: keep what we have. Treating a failed load as "no profile"
    // would send a signed-in person back to onboarding.
    if (error) return;
    const next = data ?? { id, display_name: null, avatar_url: null };
    kv.setJSON(profileKey(id), next);
    setProfile(next);
  }, []);

  const signInQuietly = useCallback(async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      setLoginError(error.message);
      return null;
    }
    setLoginError(null);
    return data.session;
  }, []);

  // Whose profile is loaded, so token refreshes (hourly) don't reload it.
  const profileFor = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      let current = data.session;
      // Testing mode: no phone login, just a background anonymous account.
      if (!current && SKIP_LOGIN) current = await signInQuietly();
      if (!mounted) return;
      const id = current?.user.id ?? null;
      profileFor.current = id;
      setSession(current);
      const cached = id ? cachedProfile(id) : null;
      if (cached?.display_name) {
        // Open with what we know, refresh in the background.
        setProfile(cached);
        setReady(true);
        loadProfile(id);
      } else {
        await loadProfile(id);
        if (mounted) setReady(true);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      const id = next?.user.id ?? null;
      if (id === profileFor.current) return;
      // Signed out (any way, including deleting the account): forget the cached profile.
      if (profileFor.current) {
        kv.set(profileKey(profileFor.current), null);
        forgetSavedPushToken();
      }
      profileFor.current = id;
      if (id) {
        const cached = cachedProfile(id);
        if (cached) setProfile(cached);
      }
      // Don't await inside the callback (Supabase recommends deferring other calls).
      setTimeout(() => loadProfile(id), 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, signInQuietly]);

  // Push notifications: best effort, never blocks the app.
  useEffect(() => {
    if (userId && profile?.display_name) registerForPush(userId).catch(() => {});
  }, [userId, profile?.display_name]);

  const value: AuthState = {
    ready,
    session,
    profile,
    userId,
    needsProfile: !!session && !profile?.display_name,
    loginError,
    retryQuickLogin: async () => {
      await signInQuietly();
    },
    refreshProfile: () => loadProfile(userId),
    signOut: async () => {
      // Stop this phone getting pushes for this account (must happen while still signed in).
      if (userId) {
        await supabase.from('push_tokens').delete().eq('user_id', userId);
        kv.set(profileKey(userId), null);
      }
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
