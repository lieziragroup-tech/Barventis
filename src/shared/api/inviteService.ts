/**
 * Invite Service — token-based user & Superadmin onboarding
 */

import {
    collection, addDoc, Timestamp,
} from '@/shared/lib/firebase';
import { db } from '@/shared/lib/firebase';
import type { UserRole } from '@/entities/types';
import { supabase } from '@/shared/lib/supabase';

const COL = "invites";
const EXPIRE_DAYS = 7;

export type InviteRole = Extract<
    UserRole,
    "SUPERADMIN" | "ADMIN" | "MARKETING" | "INVENTORY" | "TEKNISI_LAPANGAN"
>;

export interface Invite {
    id: string;
    companyId: string;
    companyName: string;
    role: InviteRole;
    createdBy: string;
    createdAt: Date;
    expiresAt: Date;
    used: boolean;
    usedBy: string | null;
}

export interface CreateInviteParams {
    companyId: string;
    companyName: string;
    role: InviteRole;
    createdBy: string;
}

/**
 * Buat invite baru (mendukung undangan SUPERADMIN oleh Master Super Admin maupun staf oleh Admin perusahaan).
 * Return token (= ID baris tabel `invites`).
 */
export async function createInvite(params: CreateInviteParams): Promise<string> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPIRE_DAYS * 24 * 60 * 60 * 1000);

    const ref = await addDoc(collection(db, COL), {
        companyId: params.companyId,
        companyName: params.companyName,
        role: params.role,
        createdBy: params.createdBy,
        createdAt: Timestamp.fromDate(now),
        expiresAt: Timestamp.fromDate(expiresAt),
        used: false,
        usedBy: null,
    });

    return ref.id;
}

/**
 * Mengambil daftar token undangan untuk suatu perusahaan (opsional difilter berdasarkan role, mis. 'SUPERADMIN').
 */
export async function getInvitesByCompany(companyId: string, roleFilter?: InviteRole): Promise<Invite[]> {
    const { data, error } = await supabase
        .from('invites')
        .select('id, company_id, payload, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    if (error || !data) return [];

    const list: Invite[] = data.map((row: any) => {
        const p = row.payload || {};
        return {
            id: row.id,
            companyId: row.company_id,
            companyName: p.companyName || '',
            role: (p.role || 'SUPERADMIN') as InviteRole,
            createdBy: p.createdBy || '',
            createdAt: row.created_at ? new Date(row.created_at) : new Date(),
            expiresAt: p.expiresAt ? new Date(p.expiresAt) : new Date(Date.now() + 7 * 86400000),
            used: Boolean(p.used),
            usedBy: p.usedBy || null,
        };
    });

    return roleFilter ? list.filter(i => i.role === roleFilter) : list;
}

/**
 * Menghapus / mencabut token undangan.
 */
export async function revokeInvite(token: string): Promise<void> {
    const { error } = await supabase.from('invites').delete().eq('id', token);
    if (error) throw new Error(error.message);
}

/**
 * Memvalidasi token undangan (boleh dipanggil TANPA login — dipakai halaman daftar `/signup`).
 * Memprioritaskan Supabase RPC `get_invite_public` secara langsung agar tidak memicu error 500 di console
 * ketika backend serverless tidak mengonfigurasi DATABASE_URL.
 */
export async function getInviteByToken(token: string): Promise<Invite | null> {
    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    if (!cleanToken) return null;

    // 1. Utamakan via Supabase RPC get_invite_public (SECURITY DEFINER, cepat & bebas error 500)
    try {
        const { data, error } = await supabase.rpc('get_invite_public', { p_token: cleanToken });
        if (!error && data) {
            const d = data as { token: string; companyId: string; companyName: string; role: InviteRole; expiresAt: string };
            return {
                id: d.token,
                companyId: d.companyId,
                companyName: d.companyName || 'Perusahaan',
                role: (d.role || 'TEKNISI_LAPANGAN') as InviteRole,
                createdBy: '',
                createdAt: new Date(),
                expiresAt: d.expiresAt ? new Date(d.expiresAt) : new Date(Date.now() + 7 * 86400000),
                used: false,
                usedBy: null,
            };
        }
    } catch (rpcErr) {
        console.warn('[inviteService] get_invite_public RPC error, mencoba fallback API:', rpcErr);
    }

    // 2. Fallback via backend API server jika RPC belum tersedia
    try {
        const res = await fetch(`/api/auth/invite/${encodeURIComponent(cleanToken)}`);
        if (res.ok) {
            const raw = await res.text();
            const d = JSON.parse(raw);
            return {
                id: d.token,
                companyId: d.companyId,
                companyName: d.companyName || 'Perusahaan',
                role: (d.role || 'TEKNISI_LAPANGAN') as InviteRole,
                createdBy: '',
                createdAt: new Date(),
                expiresAt: d.expiresAt ? new Date(d.expiresAt) : new Date(Date.now() + 7 * 86400000),
                used: false,
                usedBy: null,
            };
        }
    } catch {
        // Abaikan jika endpoint backend tidak aktif
    }

    return null;
}

const PENDING_KEY = 'fw_pending_invite_v1';

export interface PendingInviteRecord {
    token: string;
    name: string;
    phone?: string;
    email?: string;
    nip?: string;
}

export function rememberPendingInvite(token: string, name: string, phone?: string, email?: string, nip?: string) {
    try {
        localStorage.setItem(
            PENDING_KEY,
            JSON.stringify({
                token: token.trim(),
                name: name.trim(),
                phone: phone?.trim() || undefined,
                email: email?.trim().toLowerCase() || undefined,
                nip: nip?.trim() || undefined,
            })
        );
    } catch {
        /* abaikan */
    }
}

export function readPendingInvite(): PendingInviteRecord | null {
    try {
        const v = localStorage.getItem(PENDING_KEY);
        return v ? JSON.parse(v) : null;
    } catch {
        return null;
    }
}

export function clearPendingInvite() {
    try {
        localStorage.removeItem(PENDING_KEY);
    } catch {
        /* abaikan */
    }
}

/**
 * Menyelesaikan registrasi undangan sekaligus auto-confirm email di `auth.users`
 * menggunakan RPC `complete_invite_registration` (atau fallback `accept_invite`).
 */
export async function completeInviteRegistration(params: {
    token: string;
    email: string;
    name: string;
    nip?: string;
    phone?: string;
}): Promise<{ ok: boolean; confirmedViaRpc: boolean; message?: string }> {
    const cleanToken = params.token.trim();
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();

    // 1. Coba RPC complete_invite_registration (SECURITY DEFINER: auto-confirm email + upsert public.users + mark invite used)
    const { data, error } = await supabase.rpc('complete_invite_registration', {
        p_token: cleanToken,
        p_email: cleanEmail,
        p_name: cleanName,
        p_nip: params.nip?.trim() || null,
        p_phone: params.phone?.trim() || null,
    });

    if (!error && data) {
        clearPendingInvite();
        return { ok: true, confirmedViaRpc: true };
    }

    if (error) {
        const msg = error.message || '';
        // Jika error bisnis eksplisit (misal token kedaluwarsa / sudah dipakai orang lain), lempar ke pemanggil
        if (msg.includes('sudah pernah digunakan') || msg.includes('kedaluwarsa') || msg.includes('tidak ditemukan')) {
            throw new Error(msg);
        }
        console.warn('[inviteService] complete_invite_registration belum terpasang atau gagal, mencoba fallback accept_invite:', msg);
    }

    // 2. Fallback: jika sudah memiliki sesi aktif, panggil accept_invite bawaan
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
        await acceptInvite(cleanToken, cleanName, params.phone);
        return { ok: true, confirmedViaRpc: false };
    }

    return { ok: false, confirmedViaRpc: false, message: error?.message };
}

/**
 * Memperbaiki akun undangan yang sempat tertahan (email belum terkonfirmasi / belum masuk ke public.users).
 */
export async function repairPendingInviteUser(email: string, token?: string, name?: string): Promise<boolean> {
    try {
        const { data, error } = await supabase.rpc('repair_pending_invite_user', {
            p_email: email.trim().toLowerCase(),
            p_token: token?.trim() || null,
            p_name: name?.trim() || null,
        });
        if (!error && data && (data as any).ok) {
            clearPendingInvite();
            return true;
        }
    } catch {
        // Abaikan jika RPC belum tersedia
    }
    return false;
}

/**
 * Menerima undangan untuk pengguna yang sedang mendaftar/login via RPC `accept_invite`.
 */
export async function acceptInvite(token: string, name: string, phone?: string): Promise<void> {
    const { error } = await supabase.rpc('accept_invite', { p_token: token.trim(), p_name: name.trim(), p_phone: phone ?? null });
    if (error) throw new Error(error.message);
    clearPendingInvite();
}
