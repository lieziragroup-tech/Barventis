import { query } from '../db/pool.js';
import { AuthUser } from '../middleware/auth.js';

/** Catat aksi pengguna. company_id diambil dari `actor.companyId` (tenant yang sedang dioperasikan). */
export async function logAction(
  actor: AuthUser,
  action: string,
  entityType: string,
  entityId: string | null,
  details: string,
  metadata?: Record<string, unknown>
) {
  await query(
    `insert into audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, metadata, company_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [actor.id, actor.name, actor.role, action, entityType, entityId, details, metadata ? JSON.stringify(metadata) : null, actor.companyId]
  );
}

/** Untuk aksi tanpa pengguna (cron). `companyId` null = lintas perusahaan. */
export async function logSystemAction(
  action: string,
  entityType: string,
  entityId: string | null,
  details: string,
  metadata?: Record<string, unknown>,
  companyId: string | null = null
) {
  await query(
    `insert into audit_logs (user_id, user_name, user_role, action, entity_type, entity_id, details, metadata, company_id)
     values (null, 'Scheduled Job', 'ADMIN', $1,$2,$3,$4,$5,$6)`,
    [action, entityType, entityId, details, metadata ? JSON.stringify(metadata) : null, companyId]
  );
}
