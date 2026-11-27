import test from 'node:test'
import assert from 'node:assert/strict'
import { FULL_SIDEBAR_MENU } from '../src/shared/config/navigation.ts'

test('Menu FSD: Validasi 10 menu operasional lengkap tanpa mockup AI', () => {
  assert.equal(FULL_SIDEBAR_MENU.length, 10)

  // Pastikan tidak ada menu AI di daftar menu utama
  const hasAIMenu = FULL_SIDEBAR_MENU.some((m) => m.id.includes('ai') || m.label.toLowerCase().includes('ai'))
  assert.equal(hasAIMenu, false, 'Modul mockup AI tidak boleh ada di sidebar menu utama')

  // Verifikasi kelengkapan 10 modul bisnis inti
  const expectedMenuIds = [
    'dashboard',
    'spk',
    'tracking',
    'field-execution',
    'camera',
    'quotation',
    'inventory',
    'reports',
    'anomalies',
    'users'
  ]

  for (const expectedId of expectedMenuIds) {
    const item = FULL_SIDEBAR_MENU.find((m) => m.id === expectedId)
    assert.ok(item, `Menu ${expectedId} wajib tersedia di sidebar`)
    assert.ok(item.allowedRoles.length > 0)
  }
})

test('Menu FSD: Filter hak akses Teknisi Lapangan (Hanya menu operasional)', () => {
  const teknisiMenus = FULL_SIDEBAR_MENU.filter((m) =>
    m.allowedRoles.includes('TEKNISI_LAPANGAN')
  )

  const teknisiMenuIds = teknisiMenus.map((m) => m.id)
  assert.ok(teknisiMenuIds.includes('field-execution'))
  assert.ok(teknisiMenuIds.includes('camera'))
  assert.ok(teknisiMenuIds.includes('spk'))
  assert.ok(teknisiMenuIds.includes('reports'))

  // Teknisi dilarang mengakses Dashboard Finansial, Quotation, Inventory Gudang, dan Manajemen User
  assert.equal(teknisiMenuIds.includes('quotation'), false)
  assert.equal(teknisiMenuIds.includes('inventory'), false)
  assert.equal(teknisiMenuIds.includes('users'), false)
})

test('Menu FSD: Filter hak akses Marketing (Quotation & Dashboard)', () => {
  const marketingMenus = FULL_SIDEBAR_MENU.filter((m) =>
    m.allowedRoles.includes('MARKETING')
  )
  const marketingMenuIds = marketingMenus.map((m) => m.id)

  assert.ok(marketingMenuIds.includes('dashboard'))
  assert.ok(marketingMenuIds.includes('quotation'))
  assert.equal(marketingMenuIds.includes('tracking'), false)
  assert.equal(marketingMenuIds.includes('anomalies'), false)
})
