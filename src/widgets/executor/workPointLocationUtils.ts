import { calculateDistanceMeters } from '@/shared/utils/geo';

export type WorkPointSource = 'MANUAL_GPS' | 'CHECK_IN' | 'PROJECT';

export interface WorkPointLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt?: string | null;
  source: WorkPointSource;
}

export interface ResolvedWorkPointLocation extends WorkPointLocation {
  label: string;
  distanceToProjectMeters: number | null;
  projectTarget: { latitude: number; longitude: number } | null;
}

export interface ReportLocationLike {
  id: string;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkInAt?: string | null;
  projectLatitude?: number | null;
  projectLongitude?: number | null;
}

export function getWorkPointStorageKey(reportId: string): string {
  return `gep_workpoint_coords_${reportId}`;
}

/**
 * Validates geographic coordinates and rejects uninitialized (0, 0) sentinels.
 */
export function isValidCoordinate(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function formatWorkPointCoordinates(lat: number, lng: number, precision = 6): string {
  return `${lat.toFixed(precision)}, ${lng.toFixed(precision)}`;
}

export function formatAccuracyLabel(accuracy?: number | null): string | null {
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0) {
    return null;
  }
  return `±${Math.round(accuracy)} m`;
}

export function parseWorkPointLocation(raw: string | null): WorkPointLocation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkPointLocation>;
    if (!isValidCoordinate(parsed.latitude, parsed.longitude)) return null;
    const source: WorkPointSource =
      parsed.source === 'MANUAL_GPS' || parsed.source === 'CHECK_IN' || parsed.source === 'PROJECT'
        ? parsed.source
        : 'MANUAL_GPS';
    return {
      latitude: parsed.latitude as number,
      longitude: parsed.longitude as number,
      accuracy:
        typeof parsed.accuracy === 'number' && Number.isFinite(parsed.accuracy)
          ? Math.round(parsed.accuracy)
          : null,
      capturedAt: typeof parsed.capturedAt === 'string' ? parsed.capturedAt : null,
      source,
    };
  } catch {
    return null;
  }
}

export function saveWorkPointLocation(reportId: string, location: WorkPointLocation): boolean {
  if (!reportId || !isValidCoordinate(location.latitude, location.longitude)) return false;
  try {
    localStorage.setItem(getWorkPointStorageKey(reportId), JSON.stringify(location));
    return true;
  } catch {
    return false;
  }
}

export function loadWorkPointLocation(reportId: string): WorkPointLocation | null {
  if (!reportId) return null;
  try {
    return parseWorkPointLocation(localStorage.getItem(getWorkPointStorageKey(reportId)));
  } catch {
    return null;
  }
}

/**
 * Resolves the highest-priority coordinate to display on the report summary mini-map:
 * 1) Technician's explicitly saved work-point GPS coordinate
 * 2) Report check-in GPS coordinate
 * 3) Project site coordinate fallback
 */
export function resolveReportDisplayLocation(
  report: ReportLocationLike,
  savedWorkPoint?: WorkPointLocation | null
): ResolvedWorkPointLocation | null {
  const projectTarget = isValidCoordinate(report.projectLatitude, report.projectLongitude)
    ? {
        latitude: report.projectLatitude as number,
        longitude: report.projectLongitude as number,
      }
    : null;

  if (savedWorkPoint && isValidCoordinate(savedWorkPoint.latitude, savedWorkPoint.longitude)) {
    const distanceToProjectMeters = projectTarget
      ? calculateDistanceMeters(
          { latitude: savedWorkPoint.latitude, longitude: savedWorkPoint.longitude },
          projectTarget
        )
      : null;

    return {
      ...savedWorkPoint,
      source: 'MANUAL_GPS',
      label: 'Titik Pengerjaan (GPS Tersimpan)',
      distanceToProjectMeters,
      projectTarget,
    };
  }

  if (isValidCoordinate(report.checkInLatitude, report.checkInLongitude)) {
    const lat = report.checkInLatitude as number;
    const lng = report.checkInLongitude as number;
    const distanceToProjectMeters = projectTarget
      ? calculateDistanceMeters({ latitude: lat, longitude: lng }, projectTarget)
      : null;

    return {
      latitude: lat,
      longitude: lng,
      accuracy: null,
      capturedAt: report.checkInAt || null,
      source: 'CHECK_IN',
      label: 'Titik Check-In GPS',
      distanceToProjectMeters,
      projectTarget,
    };
  }

  if (projectTarget) {
    return {
      latitude: projectTarget.latitude,
      longitude: projectTarget.longitude,
      accuracy: null,
      capturedAt: null,
      source: 'PROJECT',
      label: 'Titik Lokasi Proyek',
      distanceToProjectMeters: null,
      projectTarget,
    };
  }

  return null;
}

export function mapGeolocationErrorToIndonesian(code?: number): string {
  switch (code) {
    case 1:
      return 'Izin lokasi ditolak. Aktifkan izin GPS di browser lalu coba lagi.';
    case 2:
      return 'Sinyal GPS belum terdeteksi. Pastikan GPS aktif dan coba di area terbuka.';
    case 3:
      return 'Pengambilan GPS terlalu lama. Silakan tekan tombol sekali lagi.';
    default:
      return 'Gagal membaca koordinat GPS saat ini. Silakan coba lagi.';
  }
}
