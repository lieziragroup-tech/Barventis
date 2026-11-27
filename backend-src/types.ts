/** Sama dengan enum `user_role` di database. */
export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'MARKETING' | 'INVENTORY' | 'TEKNISI_LAPANGAN';

/** Role yang boleh memakai API admin lapangan (tinjau laporan, kelola user, aturan risiko, template). */
export const ADMIN_ROLES: UserRole[] = ['ADMIN', 'SUPERADMIN'];
/** Role pelaksana lapangan (check-in/out, foto, treatment). */
export const FIELD_ROLES: UserRole[] = ['TEKNISI_LAPANGAN'];

export type WorkReportStatus = 'DRAFT' | 'READY' | 'WORKING' | 'COMPLETED' | 'FLAGGED' | 'REVIEWED';

export type RiskLevel = 'NORMAL' | 'LOW_RISK' | 'REVIEW' | 'HIGH_RISK' | 'CRITICAL';

export type PhotoType = 'CHECK_IN' | 'PROGRESS' | 'CHECK_OUT';

export type PhotoTag = 'BEFORE' | 'AFTER' | null;

/** Pest control service taxonomy — see db/migrations/001_init.sql for the full enum (this app currently only exposes 3 broad categories in the UI; the DB enum has more room for future granularity). */
export type ServiceType = 'GENERAL_PEST_CONTROL' | 'TERMITE_CONTROL' | 'FUMIGATION';

export type ApplicationMethod =
  | 'SPRAYING'
  | 'BAITING'
  | 'DRILLING'
  | 'TRENCHING'
  | 'FOGGING'
  | 'MISTING'
  | 'DUSTING'
  | 'GEL_INJECTION';

export type ContractType = 'ONE_TIME' | 'RECURRING';

export interface TreatmentRecord {
  applicationMethod: ApplicationMethod;
  chemicalName: string;
  activeIngredient?: string | null;
  dosage: string;
  treatmentAreaSqm?: number | null;
  drillingPointsCount?: number | null;
  fumigantType?: string | null;
  gasConcentrationPpm?: number | null;
  sealingStartedAt?: string | null;
  aerationCompletedAt?: string | null;
  safetyNotes?: string | null;
  technicianNotes?: string | null;
}

export interface RiskConfig {
  lateCheckinThresholdMinutes: number;
  lateCheckinPoints: number;
  outsideRadiusPoints: number;
  shortDurationCriticalMinutes: number;
  shortDurationCriticalPoints: number;
  shortDurationWarningMinutes: number;
  shortDurationWarningPoints: number;
  minTotalPhotos: number;
  minTotalPhotosPoints: number;
  requireProgressPhoto: boolean;
  noProgressPhotoPoints: number;
  locationDriftThresholdMeters: number;
  locationDriftPoints: number;
  missingTreatmentRecordPoints: number;
  fumigationMissingAerationPoints: number;
  reviewThreshold: number;
  highRiskThreshold: number;
  criticalThreshold: number;
  lowRiskThreshold: number;
}

export interface RiskEvent {
  eventType:
    | 'LATE_CHECK_IN'
    | 'OUTSIDE_RADIUS'
    | 'SHORT_DURATION'
    | 'NO_PROGRESS_PHOTO'
    | 'INSUFFICIENT_PHOTOS'
    | 'LOCATION_DRIFT'
    | 'MISSING_TREATMENT_RECORD'
    | 'FUMIGATION_SAFETY_INCOMPLETE';
  points: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  expectedValue?: string;
  actualValue?: string;
}

export interface RiskEvaluationInput {
  scheduledStartTime?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  checkInDistance?: number | null;
  checkOutDistance?: number | null;
  projectRadius: number;
  photos: { photoType: PhotoType }[];
  serviceType: ServiceType;
  treatmentRecord?: TreatmentRecord | null;
}

export interface RiskEvaluationResult {
  score: number;
  level: RiskLevel;
  events: RiskEvent[];
  isFlagged: boolean;
}
