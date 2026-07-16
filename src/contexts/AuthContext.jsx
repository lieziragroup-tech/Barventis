/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../services/api';
import { initAutoFlush, stopAutoFlush, flushOnLogout } from '../services/activityLogService';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  const [activeUser, setActiveUser] = useState(null);
  const [tenantName, setTenantName] = useState('');
  const [loading, setLoading] = useState(true);
  
  const isFetchingProfileRef = useRef(false);

  // Auth State Listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth Event] Triggered: ${event}`, session?.user?.email);
      setAuthSession(session);
      if (!session) {
        setIsAuthenticated(false);
        setActiveUser(null);
        setTenantName('');
        api.setSessionData(null, null, null, null, null, false);
        stopAutoFlush();
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Profile Loader
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (authSession) {
        if (isFetchingProfileRef.current) return;
        isFetchingProfileRef.current = true;

        try {
          console.log("[Auth Flow] Starting profile fetch...");
          const profile = await api.getProfile();
          
          if (profile && isMounted) {
            setActiveUser(profile);
            setTenantName(profile.tenant_name || '');
            api.setSessionData(profile.tenant_id, profile.id, profile.overhead_pct, profile.whatsapp_number, profile.whatsapp_token, profile.whatsapp_enabled);
            setIsAuthenticated(true);
            initAutoFlush();
          }
        } catch (e) {
          console.error('[Auth Flow] Profile fetch failed with error:', e);
          if (isMounted) {
            setIsAuthenticated(false);
            setActiveUser(null);
            api.setSessionData(null, null, null, null, null, false);
            // Sign out if profile failed to load but session exists
            const { data: { session: currentSession } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
            if (currentSession) await supabase.auth.signOut();
          }
        } finally {
          isFetchingProfileRef.current = false;
          if (isMounted) setLoading(false);
        }
      } else {
        if (isMounted) {
          setIsAuthenticated(false);
          setActiveUser(null);
          setTenantName('');
          api.setSessionData(null, null, null, null, null, false);
          setLoading(false);
        }
      }
    };

    if (authSession) {
      loadProfile();
    }
  }, [authSession]);

  const logout = async () => {
    try {
      await flushOnLogout();
      await api.logout();
    } catch (e) {
      console.warn('Logout error:', e);
      await supabase.auth.signOut();
      window.location.reload();
    }
  };

  const value = {
    isAuthenticated,
    activeUser,
    tenantName,
    loading,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
