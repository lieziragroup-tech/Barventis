/**
 * Risk Engine — PRD Sections 19–22.
 *
 * This runs only on the server. The client never computes or submits a risk
 * score; it only submits raw evidence (GPS, timestamps come from the server
 * clock, photos), and this engine decides what it means. That split is the
 * whole point of the feature — see PRD Section 51 (Anti-Tampering).
 */
import { RiskConfig, RiskEvaluationInput, RiskEvaluationResult, RiskEvent, RiskLevel } from '../../types.js';
import { calculateDistanceMeters } from '../../utils/geo.js';

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  lateCheckinThresholdMinutes: 15,
  lateCheckinPoints: 10,
  outsideRadiusPoints: 30,
  shortDurationCriticalMinutes: 30,
  shortDurationCriticalPoints: 20,
  shortDurationWarningMinutes: 60,
  shortDurationWarningPoints: 10,
  minTotalPhotos: 3,
  minTotalPhotosPoints: 10,
  requireProgressPhoto: true,
  noProgressPhotoPoints: 15,
  locationDriftThresholdMeters: 300,
  locationDriftPoints: 15,
  missingTreatmentRecordPoints: 20,
  fumigationMissingAerationPoints: 40,
  reviewThreshold: 40,
  highRiskThreshold: 60,
  criticalThreshold: 80,
  lowRiskThreshold: 20,
};

/** Zona waktu bisnis untuk membandingkan jam jadwal dengan jam check-in. Bisa diganti via env APP_TIMEZONE. */
export const APP_TIMEZONE = 'Asia/Jakarta';

/** Jam dinding (hour/minute/menit-sejak-00:00) dari `date` pada zona waktu bisnis — bukan zona waktu server. */
export function localClock(date: Date, timeZone: string = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return { hour, minute, minutes: hour * 60 + minute };
}

export function evaluateWorkReportRisk(
  report: RiskEvaluationInput,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): RiskEvaluationResult {
  const events: RiskEvent[] = [];
  let score = 0;

  // 1. Late check-in
  // Jadwal (`scheduled_start_time`) adalah jam dinding di zona waktu bisnis (WIB),
  // sedangkan server (mis. Vercel) berjalan di UTC. Membandingkan keduanya memakai
  // getHours()/setHours() milik server menghasilkan selisih salah ±7 jam — karena itu
  // jam check-in selalu dikonversi ke zona waktu bisnis lebih dulu.
  if (report.scheduledStartTime && report.checkInAt) {
    const checkIn = new Date(report.checkInAt);
    const [expH, expM] = report.scheduledStartTime.split(':').map(Number);
    if (Number.isFinite(expH) && Number.isFinite(expM) && !Number.isNaN(checkIn.getTime())) {
      const clock = localClock(checkIn);
      const diffMinutes = clock.minutes - (expH * 60 + expM);

      if (diffMinutes > config.lateCheckinThresholdMinutes) {
        score += config.lateCheckinPoints;
        events.push({
          eventType: 'LATE_CHECK_IN',
          points: config.lateCheckinPoints,
          severity: diffMinutes > 60 ? 'HIGH' : 'MEDIUM',
          title: 'Check-in terlambat',
          description: `Check-in dilakukan ${diffMinutes} menit setelah jadwal ${report.scheduledStartTime.slice(0, 5)}.`,
          expectedValue: report.scheduledStartTime.slice(0, 5),
          actualValue: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
        });
      }
    }
  }

  // 2. Outside project radius
  const checkInOutside = (report.checkInDistance ?? 0) > report.projectRadius;
  const checkOutOutside = (report.checkOutDistance ?? 0) > report.projectRadius;
  if (checkInOutside || checkOutOutside) {
    score += config.outsideRadiusPoints;
    const maxDist = Math.max(report.checkInDistance ?? 0, report.checkOutDistance ?? 0);
    events.push({
      eventType: 'OUTSIDE_RADIUS',
      points: config.outsideRadiusPoints,
      severity: 'HIGH',
      title: 'GPS di luar radius proyek',
      description: `Lokasi tercatat ${maxDist}m dari titik proyek (batas ${report.projectRadius}m).`,
      expectedValue: `≤ ${report.projectRadius} m`,
      actualValue: `${maxDist} m`,
    });
  }

  // 3. Duration
  if (report.checkInAt && report.checkOutAt) {
    const minutes = Math.round(
      (new Date(report.checkOutAt).getTime() - new Date(report.checkInAt).getTime()) / 60000
    );
    if (minutes < config.shortDurationCriticalMinutes) {
      score += config.shortDurationCriticalPoints;
      events.push({
        eventType: 'SHORT_DURATION',
        points: config.shortDurationCriticalPoints,
        severity: 'HIGH',
        title: `Durasi sangat singkat (< ${config.shortDurationCriticalMinutes} menit)`,
        description: `Pekerjaan tercatat hanya ${minutes} menit.`,
        expectedValue: `≥ ${config.shortDurationWarningMinutes} menit`,
        actualValue: `${minutes} menit`,
      });
    } else if (minutes < config.shortDurationWarningMinutes) {
      score += config.shortDurationWarningPoints;
      events.push({
        eventType: 'SHORT_DURATION',
        points: config.shortDurationWarningPoints,
        severity: 'MEDIUM',
        title: `Durasi singkat (< ${config.shortDurationWarningMinutes} menit)`,
        description: `Total durasi ${minutes} menit, lebih cepat dari perkiraan.`,
        expectedValue: `≥ ${config.shortDurationWarningMinutes} menit`,
        actualValue: `${minutes} menit`,
      });
    }
  }

  // 4. Photo completeness (only meaningful once the job is checked out)
  const photos = report.photos ?? [];
  const progressPhotos = photos.filter(p => p.photoType === 'PROGRESS');
  if (report.checkOutAt) {
    if (config.requireProgressPhoto && progressPhotos.length === 0) {
      score += config.noProgressPhotoPoints;
      events.push({
        eventType: 'NO_PROGRESS_PHOTO',
        points: config.noProgressPhotoPoints,
        severity: 'MEDIUM',
        title: 'Tidak ada foto progres',
        description: 'Pekerjaan selesai tanpa dokumentasi progres selama berlangsung.',
        expectedValue: '≥ 1 foto progres',
        actualValue: '0 foto progres',
      });
    }
    if (photos.length < config.minTotalPhotos) {
      score += config.minTotalPhotosPoints;
      events.push({
        eventType: 'INSUFFICIENT_PHOTOS',
        points: config.minTotalPhotosPoints,
        severity: 'MEDIUM',
        title: 'Jumlah foto dokumentasi minim',
        description: `Total ${photos.length} foto, standar minimum ${config.minTotalPhotos} foto.`,
        expectedValue: `≥ ${config.minTotalPhotos} foto`,
        actualValue: `${photos.length} foto`,
      });
    }
  }

  // 5. Check-in vs check-out location drift
  if (
    typeof report.checkInLatitude === 'number' &&
    typeof report.checkInLongitude === 'number' &&
    typeof report.checkOutLatitude === 'number' &&
    typeof report.checkOutLongitude === 'number'
  ) {
    const drift = calculateDistanceMeters(
      { latitude: report.checkInLatitude, longitude: report.checkInLongitude },
      { latitude: report.checkOutLatitude, longitude: report.checkOutLongitude }
    );
    if (drift > config.locationDriftThresholdMeters) {
      score += config.locationDriftPoints;
      events.push({
        eventType: 'LOCATION_DRIFT',
        points: config.locationDriftPoints,
        severity: 'MEDIUM',
        title: 'Lokasi check-in dan check-out bergeser signifikan',
        description: `Posisi bergeser ${drift}m antara check-in dan check-out.`,
        expectedValue: `≤ ${config.locationDriftThresholdMeters} m`,
        actualValue: `${drift} m`,
      });
    }
  }

  // 6. Pest-control-specific: a completed job with no treatment record means
  // nobody documented what chemical, dosage, or method was actually used —
  // a serious gap for a company that has to answer for pesticide use.
  if (report.checkOutAt) {
    if (!report.treatmentRecord) {
      score += config.missingTreatmentRecordPoints;
      events.push({
        eventType: 'MISSING_TREATMENT_RECORD',
        points: config.missingTreatmentRecordPoints,
        severity: 'HIGH',
        title: 'Data perlakuan (treatment) belum diisi',
        description: 'Pekerjaan selesai tanpa catatan bahan kimia, dosis, atau metode aplikasi yang digunakan.',
        expectedValue: 'Formulir treatment terisi',
        actualValue: 'Kosong',
      });
    } else if (
      report.serviceType === 'FUMIGATION' &&
      !report.treatmentRecord.aerationCompletedAt
    ) {
      // Fumigation without a recorded aeration/ventilation time is a safety
      // compliance gap, not just a paperwork one — the area may have been
      // reopened before the gas cleared. This is weighted heavily on purpose.
      score += config.fumigationMissingAerationPoints;
      events.push({
        eventType: 'FUMIGATION_SAFETY_INCOMPLETE',
        points: config.fumigationMissingAerationPoints,
        severity: 'CRITICAL',
        title: 'Data aerasi fumigasi belum tercatat',
        description: 'Waktu selesai aerasi/ventilasi tidak tercatat — tidak dapat dipastikan area aman untuk diakses kembali.',
        expectedValue: 'Waktu aerasi tercatat',
        actualValue: 'Kosong',
      });
    }
  }

  let level: RiskLevel = 'NORMAL';
  if (score >= config.criticalThreshold) level = 'CRITICAL';
  else if (score >= config.highRiskThreshold) level = 'HIGH_RISK';
  else if (score >= config.reviewThreshold) level = 'REVIEW';
  else if (score >= config.lowRiskThreshold) level = 'LOW_RISK';

  return { score, level, events, isFlagged: score >= config.reviewThreshold };
}
