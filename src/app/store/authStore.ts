import { create } from 'zustand';
import type { AppUser } from '@/entities/types';

const ACTIVE_COMPANY_KEY = 'fw_active_company_v1';
const REMEMBERED_EMAIL_KEY = 'fw_remembered_email_v1';
const REMEMBER_ME_FLAG_KEY = 'fw_remember_me_v1';
const DEFAULT_GUCI_COMPANY_ID = '00000000-0000-4000-a000-000000000001';

function readActiveCompany(): string | null {
    try {
        return localStorage.getItem(ACTIVE_COMPANY_KEY) || DEFAULT_GUCI_COMPANY_ID;
    } catch {
        return DEFAULT_GUCI_COMPANY_ID;
    }
}

export function readRememberMeFlag(): boolean {
    try {
        const raw = localStorage.getItem(REMEMBER_ME_FLAG_KEY);
        if (raw === null) return true;
        return raw === 'true';
    } catch {
        return true;
    }
}

export function readRememberedEmail(): string {
    try {
        return localStorage.getItem(REMEMBERED_EMAIL_KEY) || '';
    } catch {
        return '';
    }
}

export function saveRememberedEmail(email: string, rememberMe: boolean): void {
    try {
        localStorage.setItem(REMEMBER_ME_FLAG_KEY, String(rememberMe));
        if (rememberMe && email.trim()) {
            localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
        } else {
            localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
    } catch {
        /* abaikan */
    }
}

interface AuthState {
    user: AppUser | null;
    loading: boolean;
    /** Hanya untuk SUPERADMIN/MASTER_SUPER_ADMIN: perusahaan yang sedang dipilih untuk dipantau. */
    activeCompanyId: string | null;
    setUser: (user: AppUser | null, rememberMe?: boolean) => void;
    setLoading: (loading: boolean) => void;
    setActiveCompanyId: (companyId: string | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    loading: true,
    activeCompanyId: readActiveCompany(),
    setUser: (user, rememberMe) => {
        if (user && typeof rememberMe === 'boolean') {
            saveRememberedEmail(user.email, rememberMe);
        }
        set({ user, loading: false });
    },
    setLoading: (loading) => set({ loading }),
    setActiveCompanyId: (companyId) => {
        try {
            if (companyId) localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
            else localStorage.removeItem(ACTIVE_COMPANY_KEY);
        } catch { /* abaikan */ }
        set({ activeCompanyId: companyId });
    },
    logout: () => set({ user: null, loading: false }),
}));
