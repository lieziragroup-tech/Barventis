import { query } from '../../db/pool.js';
import { RiskConfig } from '../../types.js';
import { DEFAULT_RISK_CONFIG } from './riskEngine.js';

interface RiskConfigRow {
  late_checkin_threshold_minutes: number;
  late_checkin_points: number;
  outside_radius_points: number;
  short_duration_critical_minutes: number;
  short_duration_critical_points: number;
  short_duration_warning_minutes: number;
  short_duration_warning_points: number;
  min_total_photos: number;
  min_total_photos_points: number;
  require_progress_photo: boolean;
  no_progress_photo_points: number;
  location_drift_threshold_meters: number;
  location_drift_points: number;
  missing_treatment_record_points: number;
  fumigation_missing_aeration_points: number;
  review_threshold: number;
  high_risk_threshold: number;
  critical_threshold: number;
  low_risk_threshold: number;
}

function rowToConfig(row: RiskConfigRow): RiskConfig {
  return {
    lateCheckinThresholdMinutes: row.late_checkin_threshold_minutes,
    lateCheckinPoints: row.late_checkin_points,
    outsideRadiusPoints: row.outside_radius_points,
    shortDurationCriticalMinutes: row.short_duration_critical_minutes,
    shortDurationCriticalPoints: row.short_duration_critical_points,
    shortDurationWarningMinutes: row.short_duration_warning_minutes,
    shortDurationWarningPoints: row.short_duration_warning_points,
    minTotalPhotos: row.min_total_photos,
    minTotalPhotosPoints: row.min_total_photos_points,
    requireProgressPhoto: row.require_progress_photo,
    noProgressPhotoPoints: row.no_progress_photo_points,
    locationDriftThresholdMeters: row.location_drift_threshold_meters,
    locationDriftPoints: row.location_drift_points,
    missingTreatmentRecordPoints: row.missing_treatment_record_points,
    fumigationMissingAerationPoints: row.fumigation_missing_aeration_points,
    reviewThreshold: row.review_threshold,
    highRiskThreshold: row.high_risk_threshold,
    criticalThreshold: row.critical_threshold,
    lowRiskThreshold: row.low_risk_threshold,
  };
}

const NUMERIC_KEYS = new Set<keyof RiskConfig>([
  'lateCheckinThresholdMinutes', 'lateCheckinPoints', 'outsideRadiusPoints', 'shortDurationCriticalMinutes',
  'shortDurationCriticalPoints', 'shortDurationWarningMinutes', 'shortDurationWarningPoints', 'minTotalPhotos',
  'minTotalPhotosPoints', 'noProgressPhotoPoints', 'locationDriftThresholdMeters', 'locationDriftPoints',
  'missingTreatmentRecordPoints', 'fumigationMissingAerationPoints', 'reviewThreshold', 'highRiskThreshold',
  'criticalThreshold', 'lowRiskThreshold',
]);

/** Hanya kunci RiskConfig yang dikenal dan bertipe benar yang diterima dari JSON simpanan (data tak tepercaya). */
function sanitizeOverride(raw: unknown): Partial<RiskConfig> {
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (NUMERIC_KEYS.has(k as keyof RiskConfig) && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      else if (k === 'requireProgressPhoto' && typeof v === 'boolean') out[k] = v;
    }
  }
  return out as Partial<RiskConfig>;
}

/** Nilai bawaan GLOBAL (tabel risk_config, baris id=1). Tidak pernah diubah oleh admin perusahaan. */
async function getGlobalDefaults(): Promise<RiskConfig> {
  const rows = await query<RiskConfigRow>('select * from risk_config where id = 1');
  return rows.length === 0 ? DEFAULT_RISK_CONFIG : rowToConfig(rows[0]);
}

/**
 * Aturan risiko EFEKTIF sebuah perusahaan = nilai bawaan global + penyesuaian perusahaan itu
 * (company_settings.settings.riskConfig). Sebelumnya hanya ada SATU baris global yang bisa diubah oleh
 * admin mana pun, sehingga satu perusahaan dapat mengubah aturan perusahaan lain.
 */
export async function getRiskConfig(companyId: string): Promise<RiskConfig> {
  const [base, rows] = await Promise.all([
    getGlobalDefaults(),
    query<{ o: unknown }>("select settings -> 'riskConfig' as o from company_settings where company_id = $1", [companyId]),
  ]);
  return { ...base, ...sanitizeOverride(rows[0]?.o) };
}

export async function updateRiskConfig(partial: Partial<RiskConfig>, updatedBy: string, companyId: string): Promise<RiskConfig> {
  const current = await getRiskConfig(companyId);
  const merged: RiskConfig = { ...current, ...sanitizeOverride(partial) };
  await query(
    `insert into company_settings (company_id, settings, updated_by, updated_at)
     values ($1, jsonb_build_object('riskConfig', $2::jsonb), $3, now())
     on conflict (company_id) do update
       set settings = company_settings.settings || jsonb_build_object('riskConfig', $2::jsonb),
           updated_by = $3, updated_at = now()`,
    [companyId, JSON.stringify(merged), updatedBy]
  );
  return merged;
}

/** Kembalikan aturan perusahaan ke nilai bawaan global. */
export async function resetRiskConfig(companyId: string): Promise<RiskConfig> {
  await query("update company_settings set settings = settings - 'riskConfig', updated_at = now() where company_id = $1", [companyId]);
  return getGlobalDefaults();
}
