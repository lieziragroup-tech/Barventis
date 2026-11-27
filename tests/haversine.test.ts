import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateHaversineDistance,
  validateGeofence,
  Coordinates
} from '../src/shared/utils/geo.ts'

// Titik Proyek Uji: Kantor PT Guci Emas Pratama (Serua, Ciputat)
const GUCI_EMAS_OFFICE: Coordinates = {
  latitude: -6.314643,
  longitude: 106.716157
}

test('Haversine: Jarak titik identik adalah 0 meter', () => {
  const distance = calculateHaversineDistance(GUCI_EMAS_OFFICE, GUCI_EMAS_OFFICE)
  assert.equal(distance, 0)
})

test('Haversine: Jarak koordinat berjarak dekat (~23 meter)', () => {
  // Titik geser sangat tipis di dekat kantor
  const nearbyPoint: Coordinates = {
    latitude: -6.314800,
    longitude: 106.716250
  }
  const distance = calculateHaversineDistance(GUCI_EMAS_OFFICE, nearbyPoint)
  assert.ok(distance > 15 && distance < 30, `Jarak terhitung ${distance}m di luar batas ekspektasi 15-30m`)
})

test('Geofence: Teknisi dalam batas toleransi 100m -> Valid', () => {
  const pointInside: Coordinates = {
    latitude: -6.314900,
    longitude: 106.716200
  }
  const result = validateGeofence(pointInside, GUCI_EMAS_OFFICE, 100)
  assert.equal(result.isInside, true)
  assert.equal(result.differenceMeters, 0)
  assert.ok(result.distanceMeters <= 100)
})

test('Geofence: Teknisi di luar batas toleransi 100m -> Invalid dengan selisih jarak', () => {
  // Geser ~500 meter ke arah selatan
  const pointOutside: Coordinates = {
    latitude: -6.319000,
    longitude: 106.716157
  }
  const result = validateGeofence(pointOutside, GUCI_EMAS_OFFICE, 100)
  assert.equal(result.isInside, false)
  assert.ok(result.distanceMeters > 400)
  assert.equal(result.differenceMeters, Math.round((result.distanceMeters - 100) * 100) / 100)
})
