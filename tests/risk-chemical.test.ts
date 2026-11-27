import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateOperationalRisk,
  RiskEvaluationInput
} from '../src/shared/utils/riskEngine.ts'
import {
  calculatePreConstructionSNI,
  calculatePostConstructionSNI
} from '../src/shared/utils/chemicalCalculator.ts'

test('Chemical Calculator: Akurasi Standar SNI 2404 (Pra-Konstruksi 5 L/m2)', () => {
  // Luas area 100 m2
  const calc = calculatePreConstructionSNI(100, 2.5)
  assert.equal(calc.standardSolutionLiters, 500) // 100 * 5 L
  assert.equal(calc.concentrateLitersNeeded, 1.25) // (500 * 2.5) / 1000
})

test('Chemical Calculator: Akurasi Standar SNI 2405 (Pasca-Konstruksi)', () => {
  // Perimeter 70 meter, spasi 35 cm -> 200 lubang bor
  const calc = calculatePostConstructionSNI(70, 35, 2.5)
  assert.equal(calc.totalDrillHoles, 200)
  assert.equal(calc.standardSolutionLiters, 350) // 200 * 1.75 L
  assert.equal(calc.concentrateLitersNeeded, 0.88)
})

test('Risk Engine: Operasi Normal (Low Risk / No Anomaly)', () => {
  const normalInput: RiskEvaluationInput = {
    distanceMeters: 40,
    geofenceRadiusMeters: 100,
    actualChemicalLiters: 350,
    standardChemicalLiters: 350,
    durationMinutes: 60,
    areaSquareMeters: 100
  }

  const result = evaluateOperationalRisk(normalInput)
  assert.equal(result.riskLevel, 'LOW')
  assert.equal(result.riskScore, 0)
  assert.equal(result.isFlaggedForReview, false)
  assert.equal(result.anomalies.length, 0)
})

test('Risk Engine: Deteksi Anomali Geofence Breach + Under-Dosing Chemical', () => {
  const fraudInput: RiskEvaluationInput = {
    distanceMeters: 650, // > 500m di luar toleransi
    geofenceRadiusMeters: 100,
    actualChemicalLiters: 150, // Standar 350L -> under-dosing > 50%
    standardChemicalLiters: 350,
    durationMinutes: 10, // Luas 100m2 dalam 10 menit
    areaSquareMeters: 100
  }

  const result = evaluateOperationalRisk(fraudInput)
  assert.equal(result.riskLevel, 'CRITICAL')
  assert.ok(result.riskScore >= 60)
  assert.equal(result.isFlaggedForReview, true)
  assert.equal(result.anomalies.length, 3) // Fraud GPS, under-dosing, durasi terlalu singkat
})
