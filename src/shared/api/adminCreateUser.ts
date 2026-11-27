import { auth } from '@/shared/lib/firebase';
import { sendPasswordResetEmail } from '@/shared/lib/firebase';
import { createUser } from '@/shared/api/admin';
import type { UserRole } from '@/entities/types';

export interface CreateUserParams {
    email: string;
    password: string;
    name: string;
    role: Extract<UserRole, "ADMIN" | "MARKETING" | "INVENTORY" | "TEKNISI_LAPANGAN">;
    /** Diabaikan: perusahaan SELALU ditentukan server dari akun admin yang login (SUPERADMIN: header X-Company-Id). */
    companyId?: string;
    jabatan?: string;
    wa?: string;
}

/**
 * Membuat akun lewat backend (POST /api/admin/users) yang memakai service-role Supabase: login + profil dibuat atomik
 * dan dibatalkan otomatis bila salah satunya gagal; sesi admin tidak berpindah; role/perusahaan tidak bisa dipalsukan
 * dari browser. (Versi lama menulis tabel `users` langsung dari browser — kini ditolak RLS.)
 */
export async function createUserByAdmin(params: CreateUserParams): Promise<string> {
    const user = await createUser({ email: params.email, password: params.password, name: params.name, role: params.role, phone: params.wa });
    return user.id;
}

export async function sendActivationEmail(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
}
