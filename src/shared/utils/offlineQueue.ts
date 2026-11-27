/**
 * Offline queue — IndexedDB backend (Task #2 fix: localStorage limit ~5MB
 * too small for JPEG blobs; IDB handles binary natively without base64 inflation).
 *
 * Also supports TREATMENT action (Task #1 fix) and GPS batching (Task #3 fix).
 */
import { checkIn, addProgressPhoto, checkOut, submitTreatment, EvidencePayload, TreatmentInput } from '@/shared/api/workReports';
import { ApiError } from '@/shared/api/client';
import { postLocation } from '@/shared/api/location';

export type QueuedAction = 'CHECK_IN' | 'PROGRESS' | 'CHECK_OUT' | 'TREATMENT' | 'GPS';

interface QueuedItem {
  id: string;
  action: QueuedAction;
  reportId: string;
  // Photo evidence — stored as Blob (IDB handles binary natively)
  photoBlob?: Blob;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  photoTag?: string;
  notes?: string;
  customerName?: string;
  customerPhone?: string;
  customerFeedback?: string;
  customerSignature?: string;
  // Treatment-specific
  treatmentInput?: TreatmentInput;
  queuedAt: string;
  /** Terisi bila server menolak permanen (4xx) — item dilewati, tidak lagi memblokir antrean. */
  deadReason?: string;
  deadAt?: string;
}

const DB_NAME = 'fieldwork_offline_v2';
const STORE = 'queue';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function idbGetAll(db: IDBDatabase): Promise<QueuedItem[]> {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readonly').getAll();
    req.onsuccess = () => resolve(req.result as QueuedItem[]);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, item: QueuedItem): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getQueueLength(): Promise<number> {
  try {
    const db = await openDb();
    const items = await idbGetAll(db);
    return items.filter(i => !i.deadReason).length;
  } catch {
    return 0;
  }
}

/** Enqueue a photo-based action (CHECK_IN / PROGRESS / CHECK_OUT). */
export async function enqueue(action: QueuedAction, reportId: string, evidence: EvidencePayload): Promise<void> {
  const db = await openDb();
  const item: QueuedItem = {
    id: crypto.randomUUID(),
    action,
    reportId,
    photoBlob: evidence.photoBlob,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
    accuracy: evidence.accuracy,
    photoTag: evidence.photoTag,
    notes: evidence.notes,
    customerName: evidence.customerName,
    customerPhone: evidence.customerPhone,
    customerFeedback: evidence.customerFeedback,
    customerSignature: evidence.customerSignature,
    queuedAt: new Date().toISOString(),
  };
  await idbPut(db, item);
}

/** Task #1 fix — Enqueue Treatment form data (no photo). */
export async function enqueueTreatment(reportId: string, input: TreatmentInput): Promise<void> {
  const db = await openDb();
  const item: QueuedItem = {
    id: crypto.randomUUID(),
    action: 'TREATMENT',
    reportId,
    treatmentInput: input,
    queuedAt: new Date().toISOString(),
  };
  await idbPut(db, item);
}

/** Task #3 fix — Enqueue GPS ping (no photo). */
export async function enqueueGps(latitude: number, longitude: number, accuracy: number): Promise<void> {
  const db = await openDb();
  const item: QueuedItem = {
    id: crypto.randomUUID(),
    action: 'GPS',
    reportId: '__gps__',
    latitude,
    longitude,
    accuracy,
    queuedAt: new Date().toISOString(),
  };
  await idbPut(db, item);
}

async function runOne(item: QueuedItem): Promise<void> {
  if (item.action === 'TREATMENT') {
    await submitTreatment(item.reportId, item.treatmentInput!);
    return;
  }
  if (item.action === 'GPS') {
    await postLocation({ latitude: item.latitude!, longitude: item.longitude!, accuracy: item.accuracy });
    return;
  }
  const evidence: EvidencePayload = {
    photoBlob: item.photoBlob!,
    latitude: item.latitude!,
    longitude: item.longitude!,
    accuracy: item.accuracy!,
    photoTag: item.photoTag as any,
    notes: item.notes,
    customerName: item.customerName,
    customerPhone: item.customerPhone,
    customerFeedback: item.customerFeedback,
    customerSignature: item.customerSignature,
    // Waktu aksi ASLI (saat tombol ditekan di lapangan), bukan waktu sinkron — lihat resolveEventTime di server.
    capturedAt: item.queuedAt,
    offlineReplay: true,
  };
  if (item.action === 'CHECK_IN') { await checkIn(item.reportId, evidence); return; }
  if (item.action === 'PROGRESS') { await addProgressPhoto(item.reportId, evidence); return; }
  await checkOut(item.reportId, evidence);
}

/**
 * Kegagalan sementara → hentikan sinkron & coba lagi nanti (urutan aksi tetap terjaga):
 * jaringan putus (status 0), 5xx, 401 (login ulang), 408, 429.
 * Kegagalan permanen (4xx lain: 400/403/404/409/413/422) tidak akan pernah berhasil bila diulang —
 * termasuk 409 saat aksi ternyata sudah tersimpan (respons sebelumnya hilang di jalan).
 */
function isTransient(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true; // error tak dikenal: jangan buang data
  const s = err.status;
  return s === 0 || s >= 500 || s === 401 || s === 408 || s === 429;
}

/**
 * Replay antrean sesuai urutan waktu. Berhenti pada kegagalan SEMENTARA; item yang ditolak
 * PERMANEN ditandai (deadReason) dan dilewati. Sebelumnya satu item yang selalu ditolak (mis. 409)
 * memblokir seluruh antrean selamanya.
 */
export async function syncQueue(
  onProgress?: (remaining: number) => void
): Promise<{ synced: number; failed: boolean; dropped: number }> {
  const db = await openDb();
  const items = (await idbGetAll(db))
    .filter(i => !i.deadReason)
    .sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());
  let synced = 0;
  let dropped = 0;
  for (const item of items) {
    try {
      await runOne(item);
      await idbDelete(db, item.id);
      synced++;
    } catch (err) {
      if (isTransient(err)) return { synced, failed: true, dropped };
      await idbPut(db, {
        ...item,
        deadReason: err instanceof Error ? err.message : 'Ditolak server',
        deadAt: new Date().toISOString(),
      });
      dropped++;
      console.warn(`[offlineQueue] Aksi ${item.action} dibuang karena ditolak server:`, err);
    }
    onProgress?.(await getQueueLength());
  }
  return { synced, failed: false, dropped };
}

/** Aksi offline yang ditolak server secara permanen (untuk ditampilkan/diaudit). */
export async function getDeadLetters(): Promise<Array<{ id: string; action: QueuedAction; reportId: string; queuedAt: string; reason: string }>> {
  try {
    const db = await openDb();
    return (await idbGetAll(db))
      .filter(i => i.deadReason)
      .map(i => ({ id: i.id, action: i.action, reportId: i.reportId, queuedAt: i.queuedAt, reason: i.deadReason! }));
  } catch {
    return [];
  }
}

/** Ringkasan item antrean offline aktif untuk Pusat Notifikasi & Profil Teknisi. */
export async function getPendingQueueSummary(): Promise<Array<{ id: string; action: QueuedAction; reportId: string; queuedAt: string }>> {
  try {
    const db = await openDb();
    return (await idbGetAll(db))
      .filter(i => !i.deadReason)
      .sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime())
      .map(i => ({ id: i.id, action: i.action, reportId: i.reportId, queuedAt: i.queuedAt }));
  } catch {
    return [];
  }
}

/**
 * Bersihkan cache sementara & item dead-letter secara aman tanpa menghapus antrean offline aktif.
 * Mengembalikan jumlah item / draft sementara yang dibersihkan.
 */
export async function clearSafeTechnicianCache(): Promise<number> {
  let cleared = 0;
  try {
    const db = await openDb();
    const all = await idbGetAll(db);
    for (const item of all) {
      if (item.deadReason) {
        await idbDelete(db, item.id);
        cleared++;
      }
    }
  } catch {
    // ignore IDB errors
  }
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('fw_photo_cache_') || key.startsWith('fw_tech_draft_completed_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => {
      localStorage.removeItem(k);
      cleared++;
    });
  } catch {
    // ignore storage errors
  }
  return cleared;
}

