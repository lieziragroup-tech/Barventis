import { timingSafeEqual } from 'node:crypto';
import { Request, Response, Router } from 'express';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { purgeOldPhotos } from './retention.js';
import { logSystemAction } from '../../utils/audit.js';
import { query } from '../../db/pool.js';

export const cronRouter = Router();

/** Konstanta bawaan retensi sistem (tanpa perlu konfigurasi di .env). */
const DEFAULT_PHOTO_RETENTION_MONTHS = 2;
const DEFAULT_LOCATION_RETENTION_DAYS = 30;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Endpoint pembersihan retensi foto & lokasi GPS.
 * Menerima Bearer token dari `SUPABASE_SERVICE_ROLE_KEY` (atau `CRON_SECRET` bila diatur di CI/test)
 * sehingga tidak membutuhkan variabel tambahan di `.env`.
 */
const purgeHandler = asyncHandler(async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new HttpError(500, 'SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi di server.');
  }
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!safeEqual(provided, secret)) {
    throw new HttpError(401, 'Unauthorized cron request.');
  }

  const months = DEFAULT_PHOTO_RETENTION_MONTHS;
  const result = await purgeOldPhotos(months);

  await logSystemAction(
    'PURGE_PHOTOS',
    'system',
    null,
    `[cron] Menghapus file foto lebih lama dari ${months} bulan: ${result.purgedCount} berhasil, ${result.failedCount} gagal.`
  );

  const days = DEFAULT_LOCATION_RETENTION_DAYS;
  const del = await query<{ n: string }>(
    `with d as (delete from user_locations where tracked_at < now() - make_interval(days => $1) returning 1) select count(*)::text as n from d`,
    [days]
  );
  res.json({ ...result, locationsDeleted: Number(del[0]?.n ?? 0) });
});

cronRouter.get('/purge-photos', purgeHandler);
cronRouter.post('/purge-photos', purgeHandler);
