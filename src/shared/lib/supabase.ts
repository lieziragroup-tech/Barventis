import { createClient } from '@supabase/supabase-js';

/**
 * Menormalisasi URL Supabase: jika pengguna tidak sengaja memasukkan URL endpoint REST
 * (misal: `https://xyz.supabase.co/rest/v1`), otomatis dipangkas menjadi origin dasar
 * (`https://xyz.supabase.co`) agar `/auth/v1/token` tidak menghasilkan 404.
 */
function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return raw
        .trim()
        .replace(/\/+(rest|auth|storage|functions)\/v1(\/.*)?$/i, '')
        .replace(/\/+$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!supabaseUrl || !supabaseKey) {
    const msg =
        'VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diatur. Salin .env.example menjadi .env lalu isi nilainya ' +
        '(di Vercel: Project Settings → Environment Variables, lalu deploy ulang).';
    if (import.meta.env.PROD) throw new Error(msg);
    console.warn('[supabase] ' + msg);
}

export const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseKey || 'missing-anon-key');

/**
 * Klien terisolasi TANPA persistensi sesi. Dipakai untuk membuat akun pengguna lain (signUp) tanpa
 * menimpa sesi admin yang sedang login.
 */
export function createIsolatedSupabaseClient() {
    return createClient(supabaseUrl || 'http://localhost:54321', supabaseKey || 'missing-anon-key', {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-isolated-signup' },
    });
}
