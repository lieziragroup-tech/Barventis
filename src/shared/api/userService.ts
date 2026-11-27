/**
 * User Service - Supabase PostgreSQL user management per company
 */
import { supabase } from '@/shared/lib/supabase';
import type { AppUser, UserRole } from '@/entities/types';
import { mapDbRole, USER_PROFILE_COLUMNS } from '@/shared/lib/roles';

const MAX_USERS_PER_COMPANY = 25;

function mapRoleToAppUser(role: string): UserRole {
    return mapDbRole(role);
}

export async function getUsersByCompany(companyId: string, roleFilter?: UserRole): Promise<AppUser[]> {
    let q = supabase
        .from("users")
        .select(USER_PROFILE_COLUMNS)
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });

    if (roleFilter) {
        q = q.eq("role", roleFilter);
    }

    const { data, error } = await q;
    if (error) throw error;

    return (data || []).filter((d: any) => d.role !== 'MASTER_SUPER_ADMIN' && String(d.email || '').toLowerCase() !== 'lieziragroup@gmail.com').map((d: any) => ({
        uid: d.id,
        email: d.email,
        name: d.name,
        role: mapRoleToAppUser(d.role),
        companyId: d.company_id,
        isActive: d.is_active,
        wa: d.phone,
        nip: d.nip,
        jabatan: d.role,
    }));
}

export async function countActiveUsers(companyId: string): Promise<number> {
    const { count, error } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_active", true);

    if (error) throw error;
    return count || 0;
}

export async function hasUserSlot(companyId: string): Promise<boolean> {
    const count = await countActiveUsers(companyId);
    return count < MAX_USERS_PER_COMPANY;
}

export { MAX_USERS_PER_COMPANY };

export async function setUserActive(uid: string, isActive: boolean): Promise<void> {
    const { error: rpcErr } = await supabase.rpc('admin_set_user_active', {
        p_user_id: uid,
        p_active: isActive,
    });
    if (!rpcErr) return;

    const { error } = await supabase
        .from("users")
        .update({ is_active: isActive })
        .eq("id", uid);

    if (error) throw error;
}

export async function activateUserAfterVerification(uid: string): Promise<void> {
    await setUserActive(uid, true);
}
