import { useEffect } from "react";
import { supabase } from '@/shared/lib/supabase';
import { useAuthStore } from '@/app/store/authStore';
import type { AppUser, UserRole } from '@/entities/types';
import { mapDbRole, USER_PROFILE_COLUMNS } from '@/shared/lib/roles';

export function useAuth() {
    const { user, loading, setUser, setLoading } = useAuthStore();

    useEffect(() => {
        let mounted = true;

        async function fetchUserProfile(userId: string) {
            try {
                const { data: userData, error } = await supabase
                    .from("users")
                    .select(`${USER_PROFILE_COLUMNS}, companies(status, subscription_plan)`)
                    .eq("id", userId)
                    .single();

                if (error || !userData) {
                    console.error("User profile not found:", error);
                    return null;
                }

                const role: UserRole = mapDbRole(userData.role);

                const appUser: AppUser = {
                    uid: userData.id,
                    email: userData.email,
                    name: userData.name,
                    role: role,
                    companyId: userData.company_id,
                    isActive: userData.is_active,
                    wa: userData.phone,
                    jabatan: userData.role,
                };

                return appUser;
            } catch (err) {
                console.error("Error fetching user profile:", err);
                return null;
            }
        }

        async function initAuth() {
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session?.user) {
                const profile = await fetchUserProfile(session.user.id);
                if (mounted) setUser(profile);
            } else {
                if (mounted) setUser(null);
            }
            if (mounted) setLoading(false);
        }

        initAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                const profile = await fetchUserProfile(session.user.id);
                if (mounted) setUser(profile);
            } else if (event === 'SIGNED_OUT') {
                if (mounted) setUser(null);
            }
            if (mounted) setLoading(false);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [setUser, setLoading]);

    return { user, loading };
}
