import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient, getSupabaseCredentials, SupabaseConfigInfo } from '../lib/supabase';
import type { Profile, UserRole } from '../types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isConfigured: boolean;
  configInfo: SupabaseConfigInfo;
  authError: string | null;
  isAccountInactive: boolean;
  isPasswordRecoveryMode: boolean;
  setIsPasswordRecoveryMode: (val: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; profile?: Profile | null }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  resendVerificationEmail: (email: string) => Promise<{ error: Error | null }>;
  updateUserPassword: (password: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
  recheckConfiguration: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAccountInactive, setIsAccountInactive] = useState<boolean>(false);
  const [configInfo, setConfigInfo] = useState<SupabaseConfigInfo>(() => getSupabaseCredentials());

  // Detect recovery mode from URL hash/search on initial load
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      return hash.includes('type=recovery') || search.includes('type=recovery');
    }
    return false;
  });

  const isFetchingProfileRef = useRef(false);

  const recheckConfiguration = useCallback(() => {
    const creds = getSupabaseCredentials();
    setConfigInfo(creds);
  }, []);

  /**
   * Fetch authenticated user's profile from public.profiles
   * Verifies that profile exists, is_active is true, and reads the database role.
   */
  const fetchProfile = useCallback(async (userId: string, userEmail?: string): Promise<Profile | null> => {
    const client = getSupabaseClient();
    if (!client) {
      setAuthError('Supabase client not initialized.');
      return null;
    }

    try {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        if (error.code === 'PGRST205' || error.message.includes('schema cache')) {
          const creds = getSupabaseCredentials();
          setAuthError(`Database notice: table 'public.profiles' was not found in project '${creds.projectHost}'. Please verify connection to the intended 'global-chinar-crm' project.`);
        } else {
          setAuthError(`Database error accessing public.profiles: ${error.message}`);
        }
        return null;
      }

      if (!data) {
        if (userEmail) {
          const { data: emailData, error: emailErr } = await client
            .from('profiles')
            .select('*')
            .eq('email', userEmail.toLowerCase())
            .maybeSingle();

          if (!emailErr && emailData) {
            const foundProfile = emailData as Profile;
            if (!foundProfile.is_active) {
              setIsAccountInactive(true);
              setAuthError('Your user account is deactivated in public.profiles. Contact Super Admin (simpliain@gmail.com).');
              return null;
            }
            setIsAccountInactive(false);
            setAuthError(null);
            return foundProfile;
          }
        }

        setAuthError(`Authentication succeeded for ${userEmail || userId}, but no profile was found in public.profiles. Contact Super Admin (simpliain@gmail.com).`);
        return null;
      }

      const userProfile = data as Profile;

      if (!userProfile.is_active) {
        setIsAccountInactive(true);
        setAuthError('Your user account is deactivated in public.profiles. Contact Super Admin (simpliain@gmail.com).');
        return null;
      }

      setIsAccountInactive(false);
      setAuthError(null);
      return userProfile;
    } catch (err: any) {
      const msg = err.message || 'An unexpected error occurred while fetching user profile.';
      setAuthError(msg);
      return null;
    }
  }, []);

  // Initialize and listen to Supabase auth session
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function initSession() {
      try {
        const { data: { session: initialSession }, error } = await client!.auth.getSession();
        if (error) {
          console.warn('Initial session fetch notification:', error.message);
        }

        if (!isMounted) return;

        // If in password recovery mode, keep the user session for password setting
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (hash.includes('type=recovery')) {
          setIsPasswordRecoveryMode(true);
        }

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);

          // Only attempt profile fetch if not currently in password recovery mode
          if (!hash.includes('type=recovery')) {
            const userProf = await fetchProfile(initialSession.user.id, initialSession.user.email);
            if (isMounted) {
              if (userProf) {
                setProfile(userProf);
              } else {
                await client!.auth.signOut();
                setUser(null);
                setSession(null);
                setProfile(null);
              }
            }
          }
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Session initialization error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    // Listen to auth state transitions
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoveryMode(true);
        if (newSession?.user) {
          setUser(newSession.user);
          setSession(newSession);
        }
        setIsLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        setProfile(null);
        setIsPasswordRecoveryMode(false);
        setIsLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && newSession) {
        setSession(newSession);
        setUser(newSession.user);
        return;
      }

      if (newSession?.user && !profile && !isPasswordRecoveryMode) {
        if (!isFetchingProfileRef.current) {
          isFetchingProfileRef.current = true;
          const userProf = await fetchProfile(newSession.user.id, newSession.user.email);
          isFetchingProfileRef.current = false;
          if (isMounted) {
            setSession(newSession);
            setUser(newSession.user);
            if (userProf) {
              setProfile(userProf);
            }
            setIsLoading(false);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, configInfo.url, configInfo.isConfigured, isPasswordRecoveryMode]);

  /**
   * Primary Login via supabase.auth.signInWithPassword()
   * Safely captures and surfaces Supabase authentication errors with clear messaging.
   */
  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    setIsAccountInactive(false);

    const client = getSupabaseClient();
    if (!client) {
      const err = new Error('Supabase client is not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      setAuthError(err.message);
      return { error: err };
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const creds = getSupabaseCredentials();
        let message = error.message;

        if (error.message.toLowerCase().includes('invalid login credentials')) {
          message = `Invalid email or password for Supabase project '${creds.projectHost}'.`;
        }

        setAuthError(message);
        return { error };
      }

      if (data.user) {
        const prof = await fetchProfile(data.user.id, data.user.email);
        if (!prof) {
          await client.auth.signOut();
          setUser(null);
          setSession(null);
          setProfile(null);

          const inactiveErr = new Error(
            isAccountInactive
              ? 'Your account is deactivated in public.profiles. Contact Super Admin (simpliain@gmail.com).'
              : 'Authenticated, but no profile was found in public.profiles. Contact Super Admin.'
          );
          return { error: inactiveErr, profile: null };
        }

        setUser(data.user);
        setSession(data.session);
        setProfile(prof);
        return { error: null, profile: prof };
      }

      return { error: null };
    } catch (err: any) {
      const safeMsg = err.message || 'Authentication request failed.';
      setAuthError(safeMsg);
      return { error: new Error(safeMsg) };
    }
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        console.warn('Sign out warning:', err);
      }
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAccountInactive(false);
    setIsPasswordRecoveryMode(false);
    setAuthError(null);
  };

  const resetPasswordForEmail = async (email: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: new Error('Supabase client not initialized.') };
    }

    try {
      // Configured redirect URL: Current origin (supports both Development and Production crm.globalchinar.com)
      const redirectUrl = window.location.origin;
      const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectUrl,
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const resendVerificationEmail = async (email: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: new Error('Supabase client not initialized.') };
    }

    try {
      const { error } = await client.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const updateUserPassword = async (password: string) => {
    const client = getSupabaseClient();
    if (!client) {
      return { error: new Error('Supabase client not initialized.') };
    }

    try {
      const { error } = await client.auth.updateUser({ password });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id, user.email);
      if (p) {
        setProfile(p);
      }
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    role: profile?.role ?? null,
    isLoading,
    isConfigured: configInfo.isConfigured,
    configInfo,
    authError,
    isAccountInactive,
    isPasswordRecoveryMode,
    setIsPasswordRecoveryMode,
    signIn,
    signOut,
    resetPasswordForEmail,
    resendVerificationEmail,
    updateUserPassword,
    refreshProfile,
    clearAuthError,
    recheckConfiguration,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
