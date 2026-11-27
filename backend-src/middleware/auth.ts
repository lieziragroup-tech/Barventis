import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { HttpError, asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../db/pool.js';
import { UserRole, ADMIN_ROLES } from '../types.js';
import { isUuid } from '../utils/validate.js';
import { getSupabaseClient, getSupabaseUrl, isSupabaseStorageConfigured } from '../lib/supabase.js';

export interface AuthUser {
  id: string;
  /** Perusahaan tempat user bekerja. SUPERADMIN: perusahaan yang dipilih lewat header X-Company-Id (lihat withTenant). */
  companyId: string | null;
  name: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ─── Verifikasi token Supabase (Tanpa perlu konfigurasi SUPABASE_JWT_SECRET di .env) ──────────────
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

async function verifyAccessToken(token: string): Promise<{ sub: string }> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw new HttpError(401, 'Sesi tidak valid. Silakan masuk kembali.');
  }

  try {
    if (alg === 'HS256') {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (secret) {
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
          algorithms: ['HS256'],
          audience: 'authenticated',
        });
        if (!payload.sub) throw new Error('no sub');
        return { sub: payload.sub };
      }
      // Fallback otomatis via Supabase Auth API apabila SUPABASE_JWT_SECRET tidak diset di .env
      if (isSupabaseStorageConfigured) {
        const { data, error } = await getSupabaseClient().auth.getUser(token);
        if (!error && data.user?.id) {
          return { sub: data.user.id };
        }
      }
      throw new HttpError(500, 'Konfigurasi autentikasi Supabase (SUPABASE_SERVICE_ROLE_KEY) belum lengkap di server.');
    }

    if (alg === 'ES256' || alg === 'RS256') {
      const base = getSupabaseUrl();
      if (!base) throw new HttpError(500, 'VITE_SUPABASE_URL belum dikonfigurasi di server.');
      jwks ??= createRemoteJWKSet(new URL(`${base.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['ES256', 'RS256'],
        audience: 'authenticated',
      });
      if (!payload.sub) throw new Error('no sub');
      return { sub: payload.sub };
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
  }
  throw new HttpError(401, 'Sesi telah berakhir. Silakan masuk kembali.');
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Sesi tidak ditemukan. Silakan masuk kembali.');
  const { sub } = await verifyAccessToken(header.slice('Bearer '.length));
  if (!isUuid(sub)) throw new HttpError(401, 'Sesi tidak valid.');

  const rows = await query<{ id: string; company_id: string | null; name: string; email: string; role: UserRole; is_active: boolean }>(
    'select id, company_id, name, email, role, is_active from users where id = $1', [sub]
  );
  const u = rows[0];
  if (!u) throw new HttpError(401, 'Akun tidak terdaftar di sistem.');
  if (!u.is_active) throw new HttpError(401, 'Akun Anda dinonaktifkan. Hubungi administrator perusahaan.');
  req.user = { id: u.id, companyId: u.company_id, name: u.name, email: u.email, role: u.role };
  next();
});

export const withTenant = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user!;
  if (user.role === 'SUPERADMIN') {
    const h = req.header('x-company-id');
    if (!isUuid(h)) throw new HttpError(400, 'SUPERADMIN harus memilih perusahaan terlebih dahulu (header X-Company-Id).');
    const rows = await query('select 1 from companies where id = $1', [h]);
    if (rows.length === 0) throw new HttpError(404, 'Perusahaan tidak ditemukan.');
    req.user = { ...user, companyId: h };
  } else if (!user.companyId) {
    throw new HttpError(403, 'Akun Anda belum terhubung ke perusahaan manapun.');
  }
  next();
});

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, 'Anda tidak memiliki akses untuk aksi ini.');
    }
    next();
  };
}

export const isAdminRole = (role: UserRole) => ADMIN_ROLES.includes(role);

export function tenant(req: Request): string {
  const id = req.user?.companyId;
  if (!id) throw new HttpError(403, 'Perusahaan tidak ditentukan.');
  return id;
}
