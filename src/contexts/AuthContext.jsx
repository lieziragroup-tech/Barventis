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
  } catch (e) {
    return null;
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
      profile.branch_id
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
    api.setSessionData(null, null, null, null, null, false, null);
    stopAutoFlush();
  }, []);

  // Fast direct session check on mount (bypass onAuthStateChange delay)
  useEffect(() => {
    let isMounted = true;

    // Safety timeout: Never hang loading more than 2 seconds under any circumstance
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 2000);

    const checkCurrentAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          if (isFetchingProfileRef.current) return;
          isFetchingProfileRef.current = true;
          
          try {
            const profile = await api.getProfile();
            if (isMounted && profile) {
              applyProfile(profile);
            }
          } catch (err) {
            console.error('[Auth Flow] Profile error:', err);
            // If we have cached profile, keep user in, else clear
            if (!initialCached && isMounted) {
              clearAuth();
            }
          } finally {
            isFetchingProfileRef.current = false;
          }
        } else {
          if (isMounted) clearAuth();
        }
      } catch (e) {
        if (isMounted) clearAuth();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    checkCurrentAuth();

    // Listener for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
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
  }, [applyProfile, clearAuth]);

  const logout = useCallback(async () => {
    try {
      await flushOnLogout();
      await api.logout();
    } catch (e) {
      console.warn('Logout error:', e);
      await supabase.auth.signOut();
      window.location.reload();
    }
  }, []);

  const value = useMemo(() => ({
    isAuthenticated,
    activeUser,
    tenantName,
    loading,
    logout
  }), [isAuthenticated, activeUser, tenantName, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
