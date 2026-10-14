import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';
import type { UserProfile } from '@/types';
import { fetchProfile, readLocalPrefs, saveProfile, writeLocalPrefs } from '@/lib/repository/library';

interface AuthState {
  /** Supabase credentials are present, so real accounts are available. */
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, displayName: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  updateProfile(p: Omit<UserProfile, 'id'>): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(config.supabaseConfigured);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!supabase) {
      // Device-only preferences for visitors without accounts.
      setProfile({ id: 'device', ...readLocalPrefs() });
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) return;
    if (!user) {
      setProfile({ id: 'device', ...readLocalPrefs() });
      return;
    }
    fetchProfile(user.id)
      .then((p) => setProfile(p ?? { id: user.id, displayName: null, preferredBudget: null, preferredNeighbourhood: null, dietaryPreferences: [] }))
      .catch(() => setProfile({ id: user.id, displayName: null, preferredBudget: null, preferredNeighbourhood: null, dietaryPreferences: [] }));
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Accounts are not available in demo mode.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!supabase) throw new Error('Accounts are not available in demo mode.');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim().slice(0, 40) }, emailRedirectTo: `${window.location.origin}/profile` },
    });
    if (error) throw new Error(error.message);
    return { needsConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }, []);

  const updateProfile = useCallback(
    async (p: Omit<UserProfile, 'id'>) => {
      if (user && supabase) {
        await saveProfile({ id: user.id, ...p });
        setProfile({ id: user.id, ...p });
      } else {
        writeLocalPrefs(p);
        setProfile({ id: 'device', ...p });
      }
    },
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({ configured: config.supabaseConfigured, loading, user, session, profile, signIn, signUp, signOut, updateProfile }),
    [loading, user, session, profile, signIn, signUp, signOut, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
