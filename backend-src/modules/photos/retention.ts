import { query } from '../../db/pool.js';
import { deletePhoto } from './storage.js';

export interface PurgeResult {
  cutoffDate: string;
  purgedCount: number;
  failedCount: number;
}

export interface PurgePreview {
  cutoffDate: string;
  eligibleCount: number;
  oldestPhotoDate: string | null;
}

const DEFAULT_RETENTION_MONTHS = 2;

function cutoffDate(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

/**
 * What gets deleted vs. kept, precisely:
 *   DELETED — the image file itself (from Supabase Storage or local disk).
 *   KEPT    — the documentation_photos row (GPS, timestamp, accuracy, which
 *             risk events it triggered), every work_report, risk_event,
 *             treatment_record, customer review, and audit_log entry.
 *             Nothing else is touched.
 *
 * This is a storage-cost measure, not a data-retention-shortening measure —
 * the full history of what happened on a job stays queryable forever, only
 * the JPEG bytes are reclaimed.
 */
/** Fragmen SQL pembatas perusahaan (opsional). Tanpa companyId = semua perusahaan (khusus cron). */
const scope = (companyId?: string) => (companyId ? 'and work_report_id in (select id from work_reports where company_id = $2)' : '');

export async function previewPhotoPurge(olderThanMonths: number = DEFAULT_RETENTION_MONTHS, companyId?: string): Promise<PurgePreview> {
  const cutoff = cutoffDate(olderThanMonths);
  const rows = await query<{ count: string; oldest: string | null }>(
    `select count(*)::text as count, min(captured_at)::text as oldest
     from documentation_photos
     where captured_at < $1 and purged_at is null ${scope(companyId)}`,
    companyId ? [cutoff.toISOString(), companyId] : [cutoff.toISOString()]
  );
  return {
    cutoffDate: cutoff.toISOString(),
    eligibleCount: Number(rows[0]?.count ?? 0),
    oldestPhotoDate: rows[0]?.oldest ?? null,
  };
}

export async function purgeOldPhotos(olderThanMonths: number = DEFAULT_RETENTION_MONTHS, companyId?: string): Promise<PurgeResult> {
  const cutoff = cutoffDate(olderThanMonths);

  const eligible = await query<{ id: string; storage_path: string }>(
    `select id, storage_path from documentation_photos
     where captured_at < $1 and purged_at is null ${scope(companyId)}
     order by captured_at asc`,
    companyId ? [cutoff.toISOString(), companyId] : [cutoff.toISOString()]
  );

  let purgedCount = 0;
  let failedCount = 0;

  for (const photo of eligible) {
    try {
      await deletePhoto(photo.storage_path);
      // The row — and every other table — is untouched. Only purged_at is set,
      // marking the file (not the record) as gone.
      await query('update documentation_photos set purged_at = now() where id = $1', [photo.id]);
      purgedCount++;
    } catch (err) {
      // One bad file (already missing, storage hiccup, etc.) shouldn't stop
      // the rest of the batch — log and move on, it'll be retried next run
      // since purged_at stays null for anything that failed.
      console.error(`[retention] failed to purge photo ${photo.id}:`, err);
      failedCount++;
    }
  }

  return { cutoffDate: cutoff.toISOString(), purgedCount, failedCount };
}
