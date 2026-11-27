import { Router } from 'express';
import { query } from '../../db/pool.js';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { requireAuth, withTenant, isAdminRole } from '../../middleware/auth.js';
import { readPhoto } from './storage.js';
import { uuidParam } from '../../utils/validate.js';

export const photoRouter = Router();
photoRouter.use(requireAuth, withTenant);
photoRouter.param('id', uuidParam);

/**
 * Evidence photos are never served from a public bucket (PRD Section 50).
 * Every request is authenticated and checked against the owning work report
 * before the file is streamed back — the same access rule a Supabase
 * signed-URL policy would enforce in production.
 */
photoRouter.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `select dp.storage_path, dp.purged_at, wr.executor_id from documentation_photos dp
       join work_reports wr on wr.id = dp.work_report_id
       where dp.id = $1 and wr.company_id = $2`,
      [req.params.id, req.user!.companyId]
    );
    const photo = rows[0];
    if (!photo) throw new HttpError(404, 'Foto tidak ditemukan.');
    if (!isAdminRole(req.user!.role) && photo.executor_id !== req.user!.id) {
      throw new HttpError(403, 'Anda tidak memiliki akses ke foto ini.');
    }
    if (photo.purged_at) {
      // 410 Gone: the record still exists (see /admin/photos/purge) — only
      // the file was removed by the retention job. Distinct from 404 so the
      // frontend can show "purged" instead of a generic broken-image state.
      throw new HttpError(410, 'File foto ini telah dihapus sesuai kebijakan retensi penyimpanan.');
    }

    const buffer = await readPhoto(photo.storage_path);
    res.setHeader('Content-Type', 'image/jpeg');
    // Cegah browser menebak tipe konten dari byte (file diunggah pengguna).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  })
);
