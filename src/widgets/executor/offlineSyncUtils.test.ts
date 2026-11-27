import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppUser, Project, WorkReport } from '@/entities/types';
import {
  applyOptimisticOfflineCheckIn,
  applyOptimisticOfflineCheckOut,
  applyOptimisticOfflineProgress,
  applyOptimisticOfflineTreatment,
  clearCachedAuthProfile,
  clearTechnicianDataCache,
  isConnectionSnapshotUnstable,
  isNetworkOfflineError,
  loadCachedAuthProfile,
  loadTechnicianDataCache,
  resolveSyncStatus,
  saveCachedAuthProfile,
  saveTechnicianDataCache,
  withNetworkTimeout,
} from './offlineSyncUtils';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const sampleReport: WorkReport = {
  id: 'rep-1',
  projectId: 'proj-1',
  projectName: 'Gudang Cikarang',
  clientName: 'PT Sinar Logistik',
  projectAddress: 'Jl. Industri Raya 12',
  projectLatitude: -6.28,
  projectLongitude: 107.15,
  projectRadius: 200,
  scheduledStartTime: '09:00',
  serviceType: 'GENERAL_PEST_CONTROL',
  focusTarget: null,
  targetFocus: [],
  buildingAreaSqm: 500,
  contractType: 'ONE_TIME',
  warrantyMonths: 0,
  nextServiceDate: null,
  executorId: 'tech-1',
  executorName: 'Andi Pratama',
  executorEmail: 'andi@gucimas.co.id',
  status: 'READY',
  checkInAt: null,
  checkInLatitude: null,
  checkInLongitude: null,
  checkInAccuracy: null,
  checkInDistance: null,
  checkInValid: null,
  checkOutAt: null,
  checkOutLatitude: null,
  checkOutLongitude: null,
  checkOutAccuracy: null,
  checkOutDistance: null,
  checkOutValid: null,
  durationSeconds: null,
  riskScore: 0,
  riskLevel: 'NORMAL',
  riskEvents: [],
  treatmentRecord: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  customerName: null,
  customerPhone: null,
  customerFeedback: null,
  customerSignature: null,
  technicianSignature: null,
  notes: null,
  teamMembers: [],
  photos: [],
  createdAt: '2026-11-23T01:00:00.000Z',
  updatedAt: '2026-11-23T01:00:00.000Z',
};

const sampleProject: Project = {
  id: 'proj-1',
  projectName: 'Gudang Cikarang',
  clientName: 'PT Sinar Logistik',
  address: 'Jl. Industri Raya 12',
  latitude: -6.28,
  longitude: 107.15,
  radius: 200,
  workDate: '2026-11-23',
  workType: 'Pest Control Rutin',
  scheduledStartTime: '09:00',
  serviceType: 'GENERAL_PEST_CONTROL',
  targetFocus: ['Kecoa'],
  contractType: 'ONE_TIME',
  warrantyMonths: 0,
  createdBy: 'admin-1',
  createdAt: '2026-11-23T01:00:00.000Z',
};

test('isNetworkOfflineError classifies offline, fetch TypeError, timeout, and rejects 4xx validation errors', () => {
  assert.equal(isNetworkOfflineError(new Error('Anything'), false), true);
  assert.equal(isNetworkOfflineError(new TypeError('Failed to fetch'), true), true);
  assert.equal(isNetworkOfflineError(new Error('NetworkError when attempting to fetch resource'), true), true);
  assert.equal(isNetworkOfflineError(new Error('Load failed'), true), true);
  assert.equal(isNetworkOfflineError({ status: 0, message: 'Offline' }, true), true);
  assert.equal(isNetworkOfflineError({ status: 503, message: 'Service Unavailable' }, true), true);

  // Genuine server validation / auth rejection should NOT be mistaken for network offline
  assert.equal(isNetworkOfflineError({ status: 400, message: 'Bad Request' }, true), false);
  assert.equal(isNetworkOfflineError({ status: 403, message: 'Forbidden' }, true), false);
  assert.equal(isNetworkOfflineError(new Error('Password salah'), true), false);
});

test('isConnectionSnapshotUnstable detects slow 2g, high RTT, and very low downlink', () => {
  assert.equal(isConnectionSnapshotUnstable({ effectiveType: '4g', rtt: 80, downlink: 10 }), false);
  assert.equal(isConnectionSnapshotUnstable({ effectiveType: '2g', rtt: 300, downlink: 1 }), true);
  assert.equal(isConnectionSnapshotUnstable({ effectiveType: 'slow-2g', rtt: 200, downlink: 1 }), true);
  assert.equal(isConnectionSnapshotUnstable({ effectiveType: '3g', rtt: 950, downlink: 1.5 }), true);
  assert.equal(isConnectionSnapshotUnstable({ effectiveType: '3g', rtt: 150, downlink: 0.25 }), true);
  assert.equal(isConnectionSnapshotUnstable(null), false);
});

test('resolveSyncStatus maps online, unstable, offline, and syncing states cleanly', () => {
  const online = resolveSyncStatus({
    isOnline: true,
    isSyncing: false,
    isNetworkUnstable: false,
    pendingCount: 0,
  });
  assert.equal(online.state, 'online');
  assert.equal(online.showManualSync, false);

  const unstable = resolveSyncStatus({
    isOnline: true,
    isSyncing: false,
    isNetworkUnstable: true,
    pendingCount: 0,
  });
  assert.equal(unstable.state, 'unstable');
  assert.equal(unstable.showManualSync, true);

  const unstableQueued = resolveSyncStatus({
    isOnline: true,
    isSyncing: false,
    isNetworkUnstable: false,
    pendingCount: 2,
  });
  assert.equal(unstableQueued.state, 'unstable');
  assert.equal(unstableQueued.showManualSync, true);
  assert.match(unstableQueued.label, /2/);

  const offline = resolveSyncStatus({
    isOnline: false,
    isSyncing: false,
    isNetworkUnstable: true,
    pendingCount: 3,
  });
  assert.equal(offline.state, 'offline');
  assert.equal(offline.showManualSync, false);
  assert.match(offline.detail, /cache browser/i);

  const syncing = resolveSyncStatus({
    isOnline: true,
    isSyncing: true,
    isNetworkUnstable: true,
    pendingCount: 2,
  });
  assert.equal(syncing.state, 'syncing');
  assert.equal(syncing.showManualSync, false);
});

test('technician data read cache saves, loads, strips bulky base64 photos, and clears per user', () => {
  const storage = new MemoryStorage();
  const hugeDataUrl = `data:image/jpeg;base64,${'A'.repeat(25_000)}`;
  const reportWithHugePhoto: WorkReport = {
    ...sampleReport,
    photos: [
      {
        id: 'p1',
        photoType: 'CHECK_IN',
        photoTag: null,
        latitude: -6.28,
        longitude: 107.15,
        accuracy: 10,
        distanceToProject: 5,
        isWithinRadius: true,
        capturedAt: '2026-11-23T02:00:00.000Z',
        metadata: {},
        purgedAt: null,
        url: hugeDataUrl,
      },
    ],
  };

  const savedAt = saveTechnicianDataCache('tech-1', [reportWithHugePhoto], [sampleProject], storage);
  assert.ok(savedAt);

  const loaded = loadTechnicianDataCache('tech-1', storage);
  assert.ok(loaded);
  assert.equal(loaded!.reports.length, 1);
  assert.equal(loaded!.projects.length, 1);
  assert.equal(loaded!.reports[0].photos[0].url, '');

  // Other user should not see tech-1 cache
  assert.equal(loadTechnicianDataCache('tech-2', storage), null);

  clearTechnicianDataCache('tech-1', storage);
  assert.equal(loadTechnicianDataCache('tech-1', storage), null);
});

test('auth profile offline cache round-trips and clears cleanly', () => {
  const storage = new MemoryStorage();
  const user: AppUser = {
    uid: 'tech-1',
    name: 'Andi Pratama',
    email: 'andi@gucimas.co.id',
    role: 'TEKNISI_LAPANGAN',
    companyId: 'comp-1',
    isActive: true,
  };
  saveCachedAuthProfile(user, storage);
  const loaded = loadCachedAuthProfile('tech-1', storage);
  assert.deepEqual(loaded, user);
  assert.equal(loadCachedAuthProfile('other-user', storage), null);
  clearCachedAuthProfile('tech-1', storage);
  assert.equal(loadCachedAuthProfile('tech-1', storage), null);
});

test('optimistic offline updates transition a report smoothly through check-in, progress, treatment, and check-out', () => {
  const dummyBlob = new Blob(['test'], { type: 'image/jpeg' });
  const checkInList = applyOptimisticOfflineCheckIn(
    [sampleReport],
    'rep-1',
    { photoBlob: dummyBlob, latitude: -6.28, longitude: 107.15, accuracy: 12 },
    '2026-11-23T02:00:00.000Z'
  );
  assert.equal(checkInList[0].status, 'WORKING');
  assert.equal(checkInList[0].photos.length, 1);

  const progressList = applyOptimisticOfflineProgress(
    checkInList,
    'rep-1',
    { photoBlob: dummyBlob, latitude: -6.28, longitude: 107.15, accuracy: 10, photoTag: 'BEFORE' },
    '2026-11-23T02:15:00.000Z'
  );
  assert.equal(progressList[0].photos.length, 2);

  const treatmentList = applyOptimisticOfflineTreatment(
    progressList,
    'rep-1',
    {
      applicationMethod: 'SPRAYING',
      chemicalName: 'Cypermethrin 100 EC',
      dosage: '10 ml/L',
      technicianNotes: 'Area gudang selesai disemprot',
    },
    '2026-11-23T02:30:00.000Z'
  );
  assert.equal(treatmentList[0].treatmentRecord?.chemicalName, 'Cypermethrin 100 EC');
  assert.equal(treatmentList[0].notes, 'Area gudang selesai disemprot');

  const checkOutList = applyOptimisticOfflineCheckOut(
    treatmentList,
    'rep-1',
    {
      photoBlob: dummyBlob,
      latitude: -6.28,
      longitude: 107.15,
      accuracy: 8,
      customerName: 'Pak Hendra',
      customerPhone: '08123456789',
    },
    '2026-11-23T03:00:00.000Z'
  );
  assert.equal(checkOutList[0].status, 'COMPLETED');
  assert.equal(checkOutList[0].customerName, 'Pak Hendra');
  assert.equal(checkOutList[0].photos.length, 3);
  assert.equal(checkOutList[0].durationSeconds, 3600);
});

test('withNetworkTimeout resolves fast responses and rejects stalled connections as network errors', async () => {
  const fast = await withNetworkTimeout(Promise.resolve('ok'), 100);
  assert.equal(fast, 'ok');

  const slow = new Promise<string>(() => {
    // intentionally never resolves
  });
  await assert.rejects(
    () => withNetworkTimeout(slow, 25),
    (err: unknown) => isNetworkOfflineError(err, true) === true
  );
});
