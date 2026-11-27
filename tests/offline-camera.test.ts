import test from 'node:test'
import assert from 'node:assert/strict'
import { OfflineQueueManager, OfflineQueueItem } from '../src/shared/utils/offlineQueue.ts'
import { generateWatermarkedPhoto, WatermarkPayload } from '../src/shared/utils/watermark.ts'

test('Offline Queue Manager: Enqueue presensi dan audit panjang antrean', () => {
  const qManager = new OfflineQueueManager()
  assert.equal(qManager.getQueueLength(), 0)

  const item1 = qManager.enqueue('CHECK_IN', {
    projectId: 'p1',
    distanceMeters: 45,
    isInside: true
  })

  assert.equal(item1.action, 'CHECK_IN')
  assert.equal(item1.status, 'PENDING')
  assert.equal(qManager.getQueueLength(), 1)

  const item2 = qManager.enqueue('SUBMIT_BAP', {
    projectId: 'p1',
    chemicalUsed: 'Premise 200 SL'
  })

  assert.equal(qManager.getQueueLength(), 2)
  assert.equal(qManager.getPendingItems().length, 2)
})

test('Offline Queue Manager: Siklus Sinkronisasi Otomatis (Sync & Purge)', async () => {
  const qManager = new OfflineQueueManager()
  qManager.enqueue('CHECK_IN', { test: true })
  qManager.enqueue('SUBMIT_BAP', { test: true })

  // Simulasi sender berhasil
  const mockSender = async (_item: OfflineQueueItem) => true
  const syncResult = await qManager.syncAll(mockSender)

  assert.equal(syncResult.syncedCount, 2)
  assert.equal(syncResult.failedCount, 0)
  assert.equal(qManager.getPendingItems().length, 0)

  qManager.purgeSynced()
  assert.equal(qManager.getQueueLength(), 0)
})

test('Watermark Photo Generator: Menghasilkan gambar bertanda geografis dan timestamp', () => {
  const payload: WatermarkPayload = {
    projectName: 'Bintaro Jaya Xchange Mall',
    clientName: 'PT Jaya Real Property, Tbk',
    latitude: -6.284200,
    longitude: 106.728500,
    timestamp: '14:35:10'
  }

  const result = generateWatermarkedPhoto(payload)
  assert.ok(result.length > 0, 'Gambar watermark harus memiliki panjang byte valid')
  assert.ok(
    result.startsWith('data:image/'),
    'Format dataUrl harus berupa gambar data URL'
  )
})
