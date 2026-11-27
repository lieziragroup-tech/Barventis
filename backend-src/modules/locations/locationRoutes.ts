import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool.js';
import { asyncHandler, HttpError } from '../../utils/asyncHandler.js';
import { requireAuth, requireRole, withTenant } from '../../middleware/auth.js';
import { ADMIN_ROLES, FIELD_ROLES } from '../../types.js';

export const locationRouter = Router();

locationRouter.use(requireAuth, withTenant);

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number(),
});

// Pelaksana records their location
locationRouter.post(
  '/',
  requireRole(...FIELD_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = locationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Data lokasi tidak valid.');
    }
    const d = parsed.data;

    await query(
      `insert into user_locations (user_id, latitude, longitude, accuracy) values ($1, $2, $3, $4)`,
      [req.user!.id, d.latitude, d.longitude, d.accuracy]
    );

    res.status(201).json({ success: true });
  })
);

// Admin fetches latest locations of all executors
locationRouter.get(
  '/latest',
  requireRole(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    // Lokasi terakhir tiap teknisi AKTIF di perusahaan ini, hanya 24 jam terakhir (data lama = tidak relevan untuk
    // peta live). Sebelumnya: seluruh pengguna semua perusahaan dari seluruh riwayat.
    const rows = await query(`
      select distinct on (l.user_id)
        l.id, l.user_id, u.name as user_name, u.email as user_email, u.phone as user_phone,
        l.latitude, l.longitude, l.accuracy, l.tracked_at
      from user_locations l
      join users u on u.id = l.user_id
      where u.company_id = $1 and u.is_active = true and l.tracked_at > now() - interval '24 hours'
      order by l.user_id, l.tracked_at desc
    `, [req.user!.companyId]);

    res.json({
      locations: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        userPhone: r.user_phone,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        accuracy: Number(r.accuracy),
        trackedAt: r.tracked_at
      }))
    });
  })
);
