import { AppUser, DocumentationPhoto, PhotoTag, Project, WorkReport } from '@/entities/types';
import type { EvidencePayload, TreatmentInput } from '@/shared/api/workReports';

export type SyncConnectivityState = 'online' | 'unstable' | 'offline' | 'syncing';

export interface NetworkConnectionSnapshot {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
}

export interface SyncStatusInput {
  isOnline: boolean;
  isSyncing: boolean;
  isNetworkUnstable: boolean;
  pendingCount: number;
  lastSyncedAt?: string | null;
}

export interface SyncStatusDescriptor {
  state: SyncConnectivityState;
  label: string;
  shortLabel: string;
  detail: string;
  showManualSync: boolean;
}

export interface TechnicianDataCacheSnapshot {
  version: 1;
  savedAt: string;
  reports: WorkReport[];
  projects: Project[];
}

const DATA_CACHE_PREFIX = 'fw_tech_data_cache_v1_';
const AUTH_PROFILE_CACHE_PREFIX = 'fw_auth_profile_cache_v1_';
const MAX_INLINE_PHOTO_CACHE_CHARS = 20_000;

export function getDataCacheKey(uid: string): string {
  return `${DATA_CACHE_PREFIX}${uid}`;
}

export function getAuthProfileCacheKey(uid: string): string {
  return `${AUTH_PROFILE_CACHE_PREFIX}${uid}`;
}

/**
 * Menentukan apakah error berasal dari jaringan terputus / tidak stabil
 * (mencakup browser offline, Supabase fetch TypeError, timeout, dan ApiError status 0/5xx).
 */
export function isNetworkOfflineError(err: unknown, navigatorOnline?: boolean): boolean {
  const online =
    typeof navigatorOnline === 'boolean'
      ? navigatorOnline
      : typeof navigator !== 'undefined'
        ? navigator.onLine
        : true;

  if (!online) return true;
  if (!err) return false;

  const status = typeof err === 'object' && 'status' in err ? Number((err as { status?: unknown }).status) : NaN;
  if (!Number.isNaN(status)) {
    if (status === 0 || status === 408 || status === 502 || status === 503 || status === 504) {
      return true;
    }
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  const name = typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)
        : String(err);

  const normalized = `${name} ${message}`.toLowerCase();
  const networkMarkers = [
    'failed to fetch',
    'networkerror',
    'network request failed',
    'load failed',
    'fetch failed',
    'err_internet_disconnected',
    'err_network',
    'timeout',
    'timed out',
    'aborterror',
    'offline',
    'tidak ada koneksi',
    'connection refused',
    'socket hang up',
  ];

  return networkMarkers.some(marker => normalized.includes(marker));
}

/**
 * Menjaga agar panggilan jaringan tidak menggantung terlalu lama pada sinyal seluler yang tidak stabil.
 * Jika melewati batas waktu, melempar Error timeout yang otomatis dikenali oleh isNetworkOfflineError().
 */
export function withNetworkTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, timeoutMs);

    promise.then(
      val => {
        clearTimeout(timer);
        resolve(val);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Evaluasi Network Information API (jika tersedia pada browser mobile/Android)
 * untuk mendeteksi jaringan sangat lambat / tidak stabil.
 */
export function isConnectionSnapshotUnstable(conn?: NetworkConnectionSnapshot | null): boolean {
  if (!conn) return false;
  const eff = (conn.effectiveType || '').toLowerCase();
  if (eff === 'slow-2g' || eff === '2g') return true;
  if (typeof conn.rtt === 'number' && conn.rtt >= 800) return true;
  if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink <= 0.4) return true;
  return false;
}

export function readBrowserConnectionSnapshot(): NetworkConnectionSnapshot | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NetworkConnectionSnapshot;
    mozConnection?: NetworkConnectionSnapshot;
    webkitConnection?: NetworkConnectionSnapshot;
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType,
    rtt: conn.rtt,
    downlink: conn.downlink,
    saveData: conn.saveData,
  };
}

export function formatSyncTimeWib(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Mengubah sinyal konektivitas & antrean lokal menjadi status UI yang jelas dan konsisten.
 */
export function resolveSyncStatus(input: SyncStatusInput): SyncStatusDescriptor {
  const { isOnline, isSyncing, isNetworkUnstable, pendingCount, lastSyncedAt } = input;
  const syncedTime = formatSyncTimeWib(lastSyncedAt);

  if (!isOnline) {
    return {
      state: 'offline',
      label: pendingCount > 0 ? `Offline · ${pendingCount}` : 'Offline',
      shortLabel: 'Offline',
      detail:
        pendingCount > 0
          ? `${pendingCount} data disimpan di cache browser. Dikirim saat online.`
          : 'Mode offline · Data disimpan dulu ke cache browser.',
      showManualSync: false,
    };
  }

  if (isSyncing) {
    return {
      state: 'syncing',
      label: 'Sinkron...',
      shortLabel: 'Sinkron...',
      detail:
        pendingCount > 0
          ? `Mengirim ${pendingCount} data dari cache browser ke server...`
          : 'Memuat ulang jadwal dan laporan terbaru...',
      showManualSync: false,
    };
  }

  if (isNetworkUnstable || pendingCount > 0) {
    const label = pendingCount > 0 ? `Tidak Stabil · ${pendingCount}` : 'Tidak Stabil';
    const detail =
      pendingCount > 0
        ? `Koneksi tidak stabil · ${pendingCount} data di cache browser.`
        : 'Koneksi tidak stabil · Data aman di cache browser.';
    return {
      state: 'unstable',
      label,
      shortLabel: 'Tidak Stabil',
      detail,
      showManualSync: true,
    };
  }

  return {
    state: 'online',
    label: 'Online',
    shortLabel: 'Online',
    detail: syncedTime ? `Tersinkron pukul ${syncedTime}` : 'Koneksi stabil & data tersinkron',
    showManualSync: false,
  };
}

function getStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Strip inline data-URL foto yang sangat besar agar snapshot cache baca tetap ringan (< 5MB localStorage),
 * sementara blob asli tetap aman di IndexedDB offlineQueue.
 */
function sanitizeReportsForReadCache(reports: WorkReport[]): WorkReport[] {
  return reports.map(rep => ({
    ...rep,
    photos: (rep.photos || []).map(p => ({
      ...p,
      url:
        typeof p.url === 'string' && p.url.startsWith('data:') && p.url.length > MAX_INLINE_PHOTO_CACHE_CHARS
          ? ''
          : p.url,
    })),
  }));
}

export function saveTechnicianDataCache(
  uid: string,
  reports: WorkReport[],
  projects: Project[],
  storage?: Storage | null
): string | null {
  const store = getStorage(storage);
  if (!store || !uid) return null;
  const savedAt = new Date().toISOString();
  const payload: TechnicianDataCacheSnapshot = {
    version: 1,
    savedAt,
    reports: sanitizeReportsForReadCache(reports),
    projects,
  };
  try {
    store.setItem(getDataCacheKey(uid), JSON.stringify(payload));
    return savedAt;
  } catch {
    // Jika kuota ketat, simpan versi minimal (tanpa URL foto inline)
    try {
      const compact: TechnicianDataCacheSnapshot = {
        version: 1,
        savedAt,
        reports: reports.map(r => ({ ...r, photos: (r.photos || []).map(p => ({ ...p, url: '' })) })),
        projects,
      };
      store.setItem(getDataCacheKey(uid), JSON.stringify(compact));
      return savedAt;
    } catch {
      return null;
    }
  }
}

export function loadTechnicianDataCache(
  uid: string,
  storage?: Storage | null
): TechnicianDataCacheSnapshot | null {
  const store = getStorage(storage);
  if (!store || !uid) return null;
  try {
    const raw = store.getItem(getDataCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TechnicianDataCacheSnapshot>;
    if (!parsed || !Array.isArray(parsed.reports) || !Array.isArray(parsed.projects)) {
      return null;
    }
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      reports: parsed.reports,
      projects: parsed.projects,
    };
  } catch {
    return null;
  }
}

export function clearTechnicianDataCache(uid?: string | null, storage?: Storage | null): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    if (uid) {
      store.removeItem(getDataCacheKey(uid));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(DATA_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => store.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

export function saveCachedAuthProfile(user: AppUser, storage?: Storage | null): void {
  const store = getStorage(storage);
  if (!store || !user?.uid) return;
  try {
    store.setItem(getAuthProfileCacheKey(user.uid), JSON.stringify(user));
  } catch {
    // ignore storage errors
  }
}

export function loadCachedAuthProfile(uid: string, storage?: Storage | null): AppUser | null {
  const store = getStorage(storage);
  if (!store || !uid) return null;
  try {
    const raw = store.getItem(getAuthProfileCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppUser>;
    if (!parsed || parsed.uid !== uid || !parsed.role || !parsed.name) return null;
    return parsed as AppUser;
  } catch {
    return null;
  }
}

export function clearCachedAuthProfile(uid?: string | null, storage?: Storage | null): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    if (uid) {
      store.removeItem(getAuthProfileCacheKey(uid));
      return;
    }
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith(AUTH_PROFILE_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach(k => store.removeItem(k));
  } catch {
    // ignore storage errors
  }
}

// ─── Optimistic Offline Report Updates ───────────────────────────────────────

function buildLocalOfflinePhoto(
  photoType: DocumentationPhoto['photoType'],
  evidence: EvidencePayload,
  nowIso: string,
  photoTag?: PhotoTag | null,
  previewUrl = ''
): DocumentationPhoto {
  return {
    id: `offline-photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    photoType,
    photoTag: photoTag ?? evidence.photoTag ?? null,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracy: evidence.accuracy,
    distanceToProject: 0,
    isWithinRadius: true,
    capturedAt: evidence.capturedAt || nowIso,
    metadata: { caption: 'Tersimpan sementara di cache browser' },
    purgedAt: null,
    url: previewUrl,
  };
}

export function applyOptimisticOfflineCheckIn(
  reports: WorkReport[],
  reportId: string,
  evidence: EvidencePayload,
  nowIso: string = new Date().toISOString(),
  previewUrl = ''
): WorkReport[] {
  return reports.map(rep => {
    if (rep.id !== reportId) return rep;
    const photo = buildLocalOfflinePhoto('CHECK_IN', evidence, nowIso, evidence.photoTag ?? null, previewUrl);
    const nonCheckIn = (rep.photos || []).filter(p => p.photoType !== 'CHECK_IN');
    return {
      ...rep,
      status: 'WORKING',
      checkInAt: rep.checkInAt || nowIso,
      checkInLatitude: evidence.latitude,
      checkInLongitude: evidence.longitude,
      checkInAccuracy: evidence.accuracy,
      checkInValid: true,
      photos: [photo, ...nonCheckIn],
      updatedAt: nowIso,
    };
  });
}

export function applyOptimisticOfflineProgress(
  reports: WorkReport[],
  reportId: string,
  evidence: EvidencePayload,
  nowIso: string = new Date().toISOString(),
  previewUrl = ''
): WorkReport[] {
  return reports.map(rep => {
    if (rep.id !== reportId) return rep;
    const photo = buildLocalOfflinePhoto('PROGRESS', evidence, nowIso, evidence.photoTag ?? 'BEFORE', previewUrl);
    return {
      ...rep,
      photos: [...(rep.photos || []), photo],
      updatedAt: nowIso,
    };
  });
}

export function applyOptimisticOfflineTreatment(
  reports: WorkReport[],
  reportId: string,
  input: TreatmentInput,
  nowIso: string = new Date().toISOString()
): WorkReport[] {
  return reports.map(rep => {
    if (rep.id !== reportId) return rep;
    return {
      ...rep,
      treatmentRecord: {
        applicationMethod: input.applicationMethod,
        chemicalName: input.chemicalName,
        activeIngredient: input.activeIngredient ?? null,
        dosage: input.dosage,
        treatmentAreaSqm: input.treatmentAreaSqm ?? null,
        drillingPointsCount: input.drillingPointsCount ?? null,
        fumigantType: input.fumigantType ?? null,
        gasConcentrationPpm: input.gasConcentrationPpm ?? null,
        sealingStartedAt: input.sealingStartedAt ?? null,
        aerationCompletedAt: input.aerationCompletedAt ?? null,
        safetyNotes: input.safetyNotes ?? null,
        technicianNotes: input.technicianNotes ?? null,
      },
      teamMembers: input.teamMembers ?? rep.teamMembers,
      notes: input.technicianNotes ?? rep.notes,
      updatedAt: nowIso,
    };
  });
}

export function applyOptimisticOfflineCheckOut(
  reports: WorkReport[],
  reportId: string,
  evidence: EvidencePayload,
  nowIso: string = new Date().toISOString(),
  previewUrl = ''
): WorkReport[] {
  return reports.map(rep => {
    if (rep.id !== reportId) return rep;
    const photo = buildLocalOfflinePhoto('CHECK_OUT', evidence, nowIso, evidence.photoTag ?? 'AFTER', previewUrl);
    const checkInMs = rep.checkInAt ? new Date(rep.checkInAt).getTime() : new Date(nowIso).getTime() - 3600_000;
    const durationSeconds = Math.max(60, Math.round((new Date(nowIso).getTime() - checkInMs) / 1000));
    return {
      ...rep,
      status: 'COMPLETED',
      checkOutAt: nowIso,
      checkOutLatitude: evidence.latitude,
      checkOutLongitude: evidence.longitude,
      checkOutAccuracy: evidence.accuracy,
      checkOutValid: true,
      durationSeconds,
      customerName: evidence.customerName ?? rep.customerName,
      customerPhone: evidence.customerPhone ?? rep.customerPhone,
      customerFeedback: evidence.customerFeedback ?? rep.customerFeedback,
      customerSignature: evidence.customerSignature ?? rep.customerSignature,
      technicianSignature: evidence.technicianSignature ?? rep.technicianSignature,
      photos: [...(rep.photos || []), photo],
      updatedAt: nowIso,
    };
  });
}
