import { createClient, SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .trim()
    .replace(/\/+(rest|auth|storage|functions)\/v1(\/.*)?$/i, '')
    .replace(/\/+$/, '');
}

export function getSupabaseUrl(): string | undefined {
  return normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

export function getSupabaseAnonKey(): string | undefined {
  return (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)?.trim();
}

export const isSupabaseStorageConfigured = Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
export const isSupabaseAnonConfigured = Boolean(getSupabaseUrl() && (getSupabaseServiceRoleKey() || getSupabaseAnonKey()));

let client: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) {
    throw new Error(
      'VITE_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi untuk menggunakan Supabase Storage / Admin API.'
    );
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function getSupabasePublicOrAdminClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey() || getSupabaseAnonKey();
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi di server.');
  }
  if (!anonClient) {
    anonClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

export const EVIDENCE_BUCKET = 'evidence-photos';
