/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { initAutoFlush, stopAutoFlush, flushOnLogout } from '../services/activityLogService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Read instant profile from cache to render UI immediately (< 50ms)
const getInitialProfile = () => {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem('bv_cached_profile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Clear stale or corrupted Supabase refresh tokens from localStorage when 400 refresh_token occurs
const purgeCorruptSupabaseTokens = () => {
  if (typeof localStorage === 'undefined') return;
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore storage errors
  }
};

export const AuthProvider = ({ children }) => {
  const initialCached = getInitialProfile();
  const [activeUser, setActiveUser] = useState(initialCached);
  const [isAuthenticated, setIsAuthenticated] = useState(!!initialCached);
  const [tenantName, setTenantName] = useState(initialCached?.tenant_name || '');
  // If cache exists, set loading=false immediately! Zero-wait for user.
  const [loading, setLoading] = useState(!initialCached);
  
  const isFetchingProfileRef = useRef(false);

  const applyProfile = useCallback((profile) => {
    if (!profile) return;
    setActiveUser(profile);
    setTenantName(profile.tenant_name || '');
    setIsAuthenticated(true);
    setLoading(false);
    api.setSessionData(
      profile.tenant_id,
      profile.id,
      profile.overhead_pct,
      profile.whatsapp_number,
      profile.whatsapp_token,
      profile.whatsapp_enabled,
      profile.branch_id,
      profile.role
    );
    initAutoFlush();
  }, []);

  const clearAuth = useCallback(() => {
    setIsAuthenticated(false);
    setActiveUser(null);
    setTenantName('');
    setLoading(false);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('bv_cached_profile');
    }
    api.setSessionData(null, null, null, null, null, false, null, null);
    stopAutoFlush();
  }, []);

  // Exposed checkCurrentAuth so Beta Shortcut switcher & AuthScreen can refresh profile state without "ie is not a function"
  const checkCurrentAuth = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('refresh token') || msg.includes('invalid') || error.status === 400) {
          purgeCorruptSupabaseTokens();
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        clearAuth();
        return null;
      }

      const session = data?.session;
      if (session?.user) {
        if (isFetchingProfileRef.current) return null;
        isFetchingProfileRef.current = true;
        try {
          const profile = await api.revalidateProfile();
          if (profile) {
            applyProfile(profile);
            return profile;
          }
        } catch (err) {
          console.error('[Auth Flow] Profile error:', err);
          const fallbackCached = getInitialProfile();
          if (fallbackCached) {
            applyProfile(fallbackCached);
            return fallbackCached;
          }
          clearAuth();
        } finally {
          isFetchingProfileRef.current = false;
        }
      } else {
        const fallbackCached = getInitialProfile();
        if (fallbackCached && fallbackCached.is_beta_shortcut) {
          applyProfile(fallbackCached);
          return fallbackCached;
        }
        clearAuth();
      }
    } catch (e) {
      console.warn('[Auth Flow] Session check exception:', e);
      const fallbackCached = getInitialProfile();
      if (fallbackCached && fallbackCached.is_beta_shortcut) {
        applyProfile(fallbackCached);
        return fallbackCached;
      }
      clearAuth();
    } finally {
      setLoading(false);
    }
    return null;
  }, [applyProfile, clearAuth]);

  // Fast direct session check on mount (bypass onAuthStateChange delay)
  useEffect(() => {
    let isMounted = true;

    // Safety timeout: Never hang loading more than 2 seconds under any circumstance
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 2000);

    checkCurrentAuth();

    // Listener for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED' && !session) {
        purgeCorruptSupabaseTokens();
      }
      if (event === 'SIGNED_OUT' || !session) {
        const fallbackCached = getInitialProfile();
        if (fallbackCached && fallbackCached.is_beta_shortcut) {
          if (isMounted) applyProfile(fallbackCached);
          return;
        }
        if (isMounted) clearAuth();
      } else if (event === 'SIGNED_IN') {
        if (isMounted && !isFetchingProfileRef.current) {
          isFetchingProfileRef.current = true;
          try {
            const profile = await api.revalidateProfile();
            if (isMounted && profile) applyProfile(profile);
          } catch (e) {
            console.error('[Auth Flow] Signed in profile error:', e);
          } finally {
            isFetchingProfileRef.current = false;
          }
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [applyProfile, clearAuth, checkCurrentAuth]);

  const logout = useCallback(async () => {
    try {
      await flushOnLogout();
      await api.logout();
      clearAuth();
    } catch (e) {
      console.warn('Logout error:', e);
      purgeCorruptSupabaseTokens();
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      clearAuth();
      window.location.reload();
    }
  }, [clearAuth]);

  const value = useMemo(() => ({
    isAuthenticated,
    activeUser,
    user: activeUser,
    profile: activeUser,
    tenantName,
    loading,
    logout,
    signOut: logout,
    checkCurrentAuth,
    applyProfile,
    clearAuth
  }), [isAuthenticated, activeUser, tenantName, loading, logout, checkCurrentAuth, applyProfile, clearAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
