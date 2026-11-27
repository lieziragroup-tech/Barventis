import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/asyncHandler.js';

const isProd = process.env.NODE_ENV === 'production';

interface KnownErrorShape {
  name?: string;
  code?: string;
  type?: string;
  message?: string;
}

/**
 * Pemetaan error → respons HTTP.
 *
 * Aturan keamanan: pesan internal, SQL error, dan stack trace TIDAK PERNAH
 * dikirim ke klien pada production. Detail teknis hanya masuk ke log server
 * (console.error) dan — khusus development — ke body respons agar debugging
 * lokal tetap mudah.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  const e = (err ?? {}) as KnownErrorShape;
  const message = err instanceof Error ? err.message : 'Unknown error';

  // multer (upload foto)
  if (e.name === 'MulterError') {
    if (e.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Ukuran foto terlalu besar. Kecilkan resolusi lalu coba lagi.' });
    }
    return res.status(400).json({ error: 'Unggahan file tidak valid.' });
  }

  // body-parser (express.json)
  if (e.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Data yang dikirim terlalu besar.' });
  }
  if (e.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format data (JSON) tidak valid.' });
  }

  // PostgreSQL: invalid_text_representation (mis. UUID/enum/tanggal tidak valid dari input klien)
  if (e.code === '22P02' || e.code === '22007' || e.code === '22008') {
    return res.status(400).json({ error: 'Format data yang dikirim tidak valid.' });
  }

  // Trigger database: proyek terkunci setelah check-in pertama
  if (message.startsWith('PROJECT_LOCKED')) {
    return res.status(409).json({
      error: 'Proyek sudah terkunci sejak check-in pertama dan tidak dapat diubah.',
    });
  }

  console.error('[error]', err);
  const body: Record<string, unknown> = {
    error: 'Terjadi kesalahan pada server. Coba lagi sebentar lagi.',
  };
  if (!isProd) {
    body.details = message;
    body.stack = err instanceof Error ? err.stack : undefined;
  }
  return res.status(500).json(body);
}
