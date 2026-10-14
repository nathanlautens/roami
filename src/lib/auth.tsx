import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { SKIP_LOGIN } from './config';
import { registerForPush } from './push';
import { supabase } from './supabase';
import type { Profile } from './types';

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
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .eq('id', id)
      .maybeSingle();
    setProfile(data ?? { id, display_name: null, avatar_url: null });
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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      let current = data.session;
      // Testing mode: no phone login, just a background anonymous account.
      if (!current && SKIP_LOGIN) current = await signInQuietly();
      if (!mounted) return;
      setSession(current);
      await loadProfile(current?.user.id ?? null);
      if (mounted) setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Don't await inside the callback (Supabase recommends deferring other calls).
      setTimeout(() => loadProfile(next?.user.id ?? null), 0);
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
