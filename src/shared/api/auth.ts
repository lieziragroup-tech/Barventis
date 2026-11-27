import { supabase } from '@/shared/lib/supabase';
import { createInvite } from '@/shared/api/inviteService';
import type { Invite } from '@/shared/api/inviteService';
import { api } from '@/shared/api/client';

export const DEFAULT_ACCOUNT_PASSWORD = '12345678';

/** Ganti password: verifikasi password lama (login ulang), lalu perbarui di Supabase Auth. */
export async function changePassword(oldPassword: string, newPassword: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) throw new Error('Sesi tidak ditemukan. Silakan masuk kembali.');
  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
  if (verifyErr) throw new Error('Kata sandi lama salah.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
  return 'Kata sandi berhasil diubah.';
}

/** Reset kata sandi via endpoint admin backend atau email pemulihan Supabase Auth. */
export async function resetAccountPasswordToDefault(email: string, userId?: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error('Email akun wajib diisi.');
  if (userId) {
    try {
      await api.post(`/admin/users/${userId}/reset-password`, { password: DEFAULT_ACCOUNT_PASSWORD });
      return DEFAULT_ACCOUNT_PASSWORD;
    } catch {
      // Fallback ke email reset Supabase Auth
    }
  }
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
  });
  if (error) throw new Error(error.message);
  return 'Tautan pemulihan kata sandi telah dikirim ke email Anda.';
}

export async function generateInvite(role: 'TEKNISI_LAPANGAN' | 'ADMIN' | 'SUPERADMIN' | 'MARKETING' | 'INVENTORY', email?: string): Promise<{ token: string; expiresAt: string; role: string }> {
  const inv: Invite = await createInvite({ role: role as Invite['role'], email });
  return {
    token: inv.token,
    expiresAt: inv.expiresAt.toISOString(),
    role: inv.role,
  };
}

export async function sendPasswordResetEmail(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) throw new Error('Email wajib diisi.');
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
  });
  if (error) throw new Error(error.message);
  return 'Tautan pemulihan kata sandi telah dikirim ke email Anda.';
}
