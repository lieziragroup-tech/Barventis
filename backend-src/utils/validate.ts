import { NextFunction, Request, Response } from 'express';
import { HttpError } from './asyncHandler.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Pasang pada router: `router.param('id', uuidParam)`.
 * ID yang bukan UUID langsung dijawab 404 — tanpa pernah menyentuh database,
 * sehingga Postgres tidak melempar "invalid input syntax for type uuid" (500).
 */
export function uuidParam(_req: Request, _res: Response, next: NextFunction, value: string) {
  if (!isUuid(value)) return next(new HttpError(404, 'Data tidak ditemukan.'));
  next();
}
