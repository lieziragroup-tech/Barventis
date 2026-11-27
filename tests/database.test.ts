import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REAL_COMPANY_DATA,
  REAL_USERS,
  REAL_PROJECTS,
  REAL_CHEMICALS_SNI,
  REAL_SPK
} from '../backend-src/db/seed.ts'
import { calculateHaversineDistance, validateGeofence } from '../src/shared/utils/geo.ts'

test('Database Model: Integritas Tenant & Users', () => {
  // Semua user harus terasosiasi dengan company_id PT Guci Emas Pratama
  for (const user of REAL_USERS) {
    assert.equal(user.company_id, REAL_COMPANY_DATA.id)
    assert.ok(
      user.email.endsWith('@guciemas.co.id') || user.email === 'lieziragroup@gmail.com',
      `Email ${user.email} tidak valid`
    )
  }

  // Ada 1 Superadmin, 1 Supervisor dan 2 Teknisi Lapangan
  const superadmins = REAL_USERS.filter((u) => u.role === 'SUPERADMIN')
  const supervisors = REAL_USERS.filter((u) => u.role === 'SUPERVISOR')
  const technicians = REAL_USERS.filter((u) => u.role === 'TEKNISI_LAPANGAN')
  assert.equal(superadmins.length, 1)
  assert.equal(supervisors.length, 1)
  assert.equal(technicians.length, 2)
})

test('Database Model: Relasi Integritas Proyek & SPK Riil', () => {
  for (const spk of REAL_SPK) {
    // Proyek harus eksis di katalog proyek
    const project = REAL_PROJECTS.find((p) => p.id === spk.project_id)
    assert.ok(project, `Proyek dengan ID ${spk.project_id} tidak ditemukan`)

    // Teknisi harus eksis
    const technician = REAL_USERS.find((u) => u.id === spk.technician_id)
    assert.ok(technician, `Teknisi ID ${spk.technician_id} tidak valid`)
    assert.equal(technician.role, 'TEKNISI_LAPANGAN')
  }
})

test('Database Model: Standar Bahan Kimia SNI 2404 / 2405', () => {
  for (const chem of REAL_CHEMICALS_SNI) {
    assert.ok(chem.recommended_dose_ml_per_liter > 0)
    assert.ok(chem.stock_qty > 0)
    assert.ok(chem.sni_standard && chem.sni_standard.length > 0)
  }
})

test('Geofence Uji Operasional: Presensi Teknisi di Bintaro Jaya Xchange', () => {
  const bintaroPrj = REAL_PROJECTS.find((p) => p.project_code === 'PRJ-BXCHANGE-02')!
  
  // Posisi Teknisi tiba di lobby Bintaro Xchange (~30m dari koordinat target)
  const techAtLobby = {
    latitude: -6.284350,
    longitude: 106.728600
  }

  const resultValid = validateGeofence(techAtLobby, bintaroPrj, bintaroPrj.geofence_radius_meters)
  assert.equal(resultValid.isInside, true)
  assert.ok(resultValid.distanceMeters < bintaroPrj.geofence_radius_meters)

  // Posisi Teknisi mencoba presensi dari rumah di Ciputat (~3.6 km dari Bintaro Xchange)
  const techAtHome = {
    latitude: -6.314643,
    longitude: 106.716157
  }

  const resultFraud = validateGeofence(techAtHome, bintaroPrj, bintaroPrj.geofence_radius_meters)
  assert.equal(resultFraud.isInside, false)
  assert.ok(resultFraud.distanceMeters > 3000)
  assert.ok(resultFraud.differenceMeters > 0)
})
