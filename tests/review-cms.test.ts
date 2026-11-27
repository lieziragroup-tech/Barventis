import test from 'node:test'
import assert from 'node:assert/strict'
import {
  processCustomerReviewBAP,
  CustomerReviewInput
} from '../src/shared/utils/signatureEngine.ts'
import { computeCMSMetrics } from '../src/shared/utils/cmsMetrics.ts'

test('Signature & BAP Engine: Pengesahan BAP Legal Defensif (Rating 5 Bintang)', () => {
  const input: CustomerReviewInput = {
    spkNumber: 'SPK-GEP-202610-001',
    clientSignerName: 'Bapak Hendra (Building Manager Bintaro Xchange)',
    clientRating: 5,
    feedbackNotes: 'Treatment anti rayap rapi dan steril.',
    signatureDataUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
    completedAt: '2026-10-14T15:30:00.000Z'
  }

  const result = processCustomerReviewBAP(input)

  assert.equal(result.isLegalValid, true)
  assert.equal(result.clientRating, 5)
  assert.equal(result.satisfactionCategory, 'VERY_SATISFIED')
  assert.equal(result.spkNumber, 'SPK-GEP-202610-001')
  assert.ok(result.verificationHash.startsWith('BAP-VERIF-'))
})

test('Signature & BAP Engine: Deteksi Rating Klien Rendah (Dissatisfied Alert)', () => {
  const badInput: CustomerReviewInput = {
    spkNumber: 'SPK-GEP-202610-002',
    clientSignerName: 'Ibu Ratna',
    clientRating: 2,
    feedbackNotes: 'Teknisi datang terlambat.',
    signatureDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    completedAt: '2026-10-14T16:00:00.000Z'
  }

  const result = processCustomerReviewBAP(badInput)
  assert.equal(result.satisfactionCategory, 'DISSATISFIED')
  assert.equal(result.clientRating, 2)
})

test('CMS Executive Metrics: Agregasi KPI Perusahaan Riil', () => {
  const metrics = computeCMSMetrics()

  assert.equal(metrics.zeroFraudRate, 100)
  assert.ok(metrics.totalChemicalStockLiters > 0)
  assert.ok(metrics.activeProjectsCount >= 2)
  assert.ok(metrics.fieldAuditComplianceScore >= 95)
})
