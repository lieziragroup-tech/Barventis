import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  getSupabaseClient,
  getSupabasePublicOrAdminClient,
  isSupabaseAnonConfigured,
  isSupabaseStorageConfigured,
} from '../../lib/supabase.js';

export const authRouter = Router();

const registerInviteSchema = z.object({
  token: z.string().min(1, 'Token undangan wajib disertakan.'),
  name: z.string().min(2, 'Nama minimal 2 karakter.'),
  email: z.string().email('Format email tidak valid.').max(255),
  password: z.string().min(6, 'Password minimal 6 karakter.').max(100),
  phone: z.string().max(50).optional(),
  nip: z.string().max(50).optional(),
});

/**
 * Registrasi akun baru menggunakan token undangan resmi (di-generate oleh Admin/Direktur).
 * Mendukung mode Supabase Admin API, Supabase RPC (`complete_invite_registration`), maupun PostgreSQL langsung.
 */
authRouter.post(
  '/register-invite',
  asyncHandler(async (req, res) => {
    const parsed = registerInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, parsed.error.errors[0]?.message ?? 'Data registrasi tidak valid.');
    }
    const d = parsed.data;
    const cleanToken = d.token.trim();
    const emailClean = d.email.trim().toLowerCase();

    // Jalur 1: Jika SUPABASE_SERVICE_ROLE_KEY tersedia di server, lakukan full admin creation + PostgREST (tanpa butuh DATABASE_URL)
    if (isSupabaseStorageConfigured) {
      const sb = getSupabaseClient();
      const { data: invRow, error: invErr } = await sb
        .from('invites')
        .select('id, company_id, payload')
        .eq('id', cleanToken)
        .maybeSingle();

      if (invErr || !invRow) {
        throw new HttpError(404, 'Token undangan tidak ditemukan.');
      }

      const payload = (invRow.payload || {}) as Record<string, any>;
      if (payload.used) {
        throw new HttpError(400, 'Token undangan ini sudah pernah digunakan.');
      }
      if (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now()) {
        throw new HttpError(400, 'Token undangan ini sudah kedaluwarsa.');
      }

      const role = payload.role || 'TEKNISI_LAPANGAN';
      const companyId = invRow.company_id;
      const sbAdmin = sb.auth.admin;

      const { data: userList } = await sbAdmin.listUsers({ page: 1, perPage: 1000 });
      const existingAuth = (userList?.users || []).find(u => u.email?.toLowerCase() === emailClean);

      let uid: string;
      if (existingAuth) {
        uid = existingAuth.id;
        await sbAdmin.updateUserById(uid, {
          password: d.password,
          email_confirm: true,
          user_metadata: {
            full_name: d.name.trim(),
            company_id: companyId,
            role,
            invite_token: cleanToken,
          },
        });
      } else {
        const { data: created, error: createErr } = await sbAdmin.createUser({
          email: emailClean,
          password: d.password,
          email_confirm: true,
          user_metadata: {
            full_name: d.name.trim(),
            company_id: companyId,
            role,
            invite_token: cleanToken,
          },
        });
        if (createErr || !created.user) {
          throw new HttpError(400, `Gagal membuat akun login: ${createErr?.message ?? 'tidak diketahui'}`);
        }
        uid = created.user.id;
      }

      const { error: upsertErr } = await sb.from('users').upsert(
        {
          id: uid,
          company_id: companyId,
          name: d.name.trim(),
          email: emailClean,
          nip: d.nip?.trim() || null,
          password_hash: 'managed-by-supabase-auth',
          role,
          phone: d.phone?.trim() || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      if (upsertErr) {
        throw new HttpError(400, `Gagal menyimpan profil pengguna: ${upsertErr.message}`);
      }

      await sb
        .from('invites')
        .update({
          payload: {
            ...payload,
            used: true,
            usedBy: uid,
            usedByEmail: emailClean,
            usedByName: d.name.trim(),
          },
        })
        .eq('id', cleanToken);

      return res.status(201).json({
        success: true,
        message: 'Akun Anda berhasil dibuat dan langsung aktif! Silakan masuk.',
        user: {
          id: uid,
          email: emailClean,
          name: d.name.trim(),
          role,
        },
      });
    }

    // Jalur 2: Jika hanya VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY yang tersedia (tanpa DATABASE_URL & tanpa SERVICE_ROLE_KEY)
    if (!process.env.DATABASE_URL && isSupabaseAnonConfigured) {
      const sbAnon = getSupabasePublicOrAdminClient();
      const { data: pubInv, error: pubErr } = await sbAnon.rpc('get_invite_public', { p_token: cleanToken });
      if (pubErr || !pubInv) {
        throw new HttpError(404, 'Token undangan tidak ditemukan, sudah digunakan, atau sudah kedaluwarsa.');
      }

      const { data: signUpData, error: signUpErr } = await sbAnon.auth.signUp({
        email: emailClean,
        password: d.password,
        options: {
          data: {
            full_name: d.name.trim(),
            invite_token: cleanToken,
            company_id: (pubInv as any).companyId,
            role: (pubInv as any).role || 'TEKNISI_LAPANGAN',
          },
        },
      });

      if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) {
        throw new HttpError(400, signUpErr.message);
      }

      const { data: rpcDone, error: rpcErr } = await sbAnon.rpc('complete_invite_registration', {
        p_token: cleanToken,
        p_email: emailClean,
        p_name: d.name.trim(),
        p_nip: d.nip?.trim() || null,
        p_phone: d.phone?.trim() || null,
      });

      if (!rpcErr && rpcDone) {
        return res.status(201).json({
          success: true,
          message: 'Akun Anda berhasil dibuat dan langsung aktif! Silakan masuk.',
          user: {
            id: (rpcDone as any).userId || signUpData?.user?.id,
            email: emailClean,
            name: d.name.trim(),
            role: (rpcDone as any).role || (pubInv as any).role || 'TEKNISI_LAPANGAN',
          },
        });
      }

      // Beri tahu client untuk melanjutkan sesi via client-side tanpa error 500
      return res.status(200).json({
        success: false,
        fallbackClient: true,
        message: 'Melanjutkan aktivasi undangan melalui sesi aplikasi.',
      });
    }

    // Jalur 3: Koneksi PostgreSQL langsung (DATABASE_URL tersedia)
    const inviteRows = await query<{ id: string; company_id: string; payload: any }>(
      'select id, company_id, payload from invites where id = $1',
      [cleanToken]
    );
    if (inviteRows.length === 0) {
      throw new HttpError(404, 'Token undangan tidak ditemukan.');
    }
    const inv = inviteRows[0];
    const payload = inv.payload || {};
    if (payload.used) {
      throw new HttpError(400, 'Token undangan ini sudah pernah digunakan.');
    }
    if (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(400, 'Token undangan ini sudah kedaluwarsa.');
    }

    const role = payload.role || 'TEKNISI_LAPANGAN';
    const companyId = inv.company_id;
    const existingUser = await query<{ id: string }>('select id from users where lower(email) = $1', [emailClean]);
    const uid = existingUser[0]?.id || cleanToken;

    await withTransaction(async (client) => {
      await client.query(
        `insert into users (id, company_id, name, email, password_hash, role, phone, is_active)
         values ($1, $2, $3, $4, 'managed-by-supabase-auth', $5, $6, true)
         on conflict (id) do update set
           company_id = excluded.company_id,
           name = excluded.name,
           role = excluded.role,
           phone = excluded.phone,
           is_active = true,
           updated_at = now()`,
        [uid, companyId, d.name.trim(), emailClean, role, d.phone || null]
      );

      await client.query(
        `update invites
         set payload = jsonb_set(
           jsonb_set(payload, '{used}', 'true'::jsonb),
           '{usedBy}',
           to_jsonb($2::text)
         )
         where id = $1`,
        [cleanToken, d.name.trim()]
      );
    });

    res.status(201).json({
      success: true,
      message: 'Akun Anda berhasil dibuat dan langsung aktif! Silakan masuk.',
      user: {
        id: uid,
        email: emailClean,
        name: d.name.trim(),
        role,
      },
    });
  })
);

/**
 * Endpoint publik untuk memvalidasi token undangan sebelum pengguna mengisi form signup.
 */
authRouter.get(
  '/invite/:token',
  asyncHandler(async (req, res) => {
    const cleanToken = req.params.token.trim();

    if (isSupabaseAnonConfigured) {
      const sb = getSupabasePublicOrAdminClient();
      const { data, error } = await sb.rpc('get_invite_public', { p_token: cleanToken });
      if (!error && data) {
        const d = data as { token: string; companyId: string; companyName: string; role: string; expiresAt: string };
        return res.json({
          token: d.token,
          companyId: d.companyId,
          companyName: d.companyName || '',
          role: d.role || 'TEKNISI_LAPANGAN',
          expiresAt: d.expiresAt,
        });
      }
      if (!process.env.DATABASE_URL) {
        throw new HttpError(404, 'Token undangan tidak ditemukan, sudah digunakan, atau sudah kedaluwarsa.');
      }
    }

    const inviteRows = await query<{ id: string; company_id: string; payload: any }>(
      'select id, company_id, payload from invites where id = $1',
      [cleanToken]
    );
    if (inviteRows.length === 0) {
      throw new HttpError(404, 'Token undangan tidak ditemukan atau tidak valid.');
    }
    const inv = inviteRows[0];
    const payload = inv.payload || {};
    if (payload.used) {
      throw new HttpError(400, 'Token undangan ini sudah pernah digunakan.');
    }
    if (payload.expiresAt && new Date(payload.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(400, 'Token undangan ini sudah kedaluwarsa (melebihi 7 hari).');
    }
    res.json({
      token: inv.id,
      companyId: inv.company_id,
      companyName: payload.companyName || '',
      role: payload.role || 'TEKNISI_LAPANGAN',
      expiresAt: payload.expiresAt,
    });
  })
);

/**
 * Endpoint untuk auto-confirm akun yang tersangkut kendala OTP / link konfirmasi kedaluwarsa.
 */
authRouter.post(
  '/auto-confirm-email',
  asyncHandler(async (req, res) => {
    const { email, token, name } = req.body || {};
    if (!email || typeof email !== 'string') {
      throw new HttpError(400, 'Email wajib diisi.');
    }
    const emailClean = email.trim().toLowerCase();

    if (isSupabaseStorageConfigured) {
      const sb = getSupabaseClient();
      const sbAdmin = sb.auth.admin;
      const { data: userList } = await sbAdmin.listUsers({ page: 1, perPage: 1000 });
      const targetUser = (userList?.users || []).find(u => u.email?.toLowerCase() === emailClean);
      if (targetUser) {
        await sbAdmin.updateUserById(targetUser.id, { email_confirm: true });
        await sb.from('users').update({ is_active: true }).eq('email', emailClean);
        return res.json({ success: true, message: 'Email akun Anda telah berhasil dikonfirmasi langsung oleh sistem. Silakan login.' });
      }
    }

    if (isSupabaseAnonConfigured) {
      const sbAnon = getSupabasePublicOrAdminClient();
      const { data: repaired, error: repErr } = await sbAnon.rpc('repair_pending_invite_user', {
        p_email: emailClean,
        p_token: typeof token === 'string' ? token : null,
        p_name: typeof name === 'string' ? name : null,
      });
      if (!repErr && repaired && (repaired as any).ok) {
        return res.json({ success: true, message: 'Akun undangan Anda telah diaktifkan. Silakan login.' });
      }
    }

    res.json({ success: false, message: 'Akun tidak ditemukan atau sudah aktif.' });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const u = req.user!;
    res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId } });
  })
);
