import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasPermission,
  getPermissionsForRole,
  UserRole
} from '../src/shared/utils/rbacEngine.ts'

test('RBAC: Teknisi Lapangan hanya memiliki izin eksekusi operasional', () => {
  const role: UserRole = 'TEKNISI_LAPANGAN'

  // Harus diizinkan
  assert.equal(hasPermission(role, 'PRESENCE_GEOFENCE'), true)
  assert.equal(hasPermission(role, 'WATERMARK_CAMERA'), true)
  assert.equal(hasPermission(role, 'CHEMICAL_AUDIT'), true)
  assert.equal(hasPermission(role, 'BAP_SIGNATURE'), true)

  // Harus dilarang (Terkunci)
  assert.equal(hasPermission(role, 'QUOTATION_DRAFT'), false)
  assert.equal(hasPermission(role, 'QUOTATION_APPROVE'), false)
  assert.equal(hasPermission(role, 'CHEMICAL_STOCK_MANAGE'), false)
  assert.equal(hasPermission(role, 'CMS_ANALYTICS_VIEW'), false)
})

test('RBAC: Marketing memiliki akses Quotation tetapi dilarang mutasi stok & presensi', () => {
  const role: UserRole = 'MARKETING'

  assert.equal(hasPermission(role, 'QUOTATION_DRAFT'), true)
  assert.equal(hasPermission(role, 'CMS_ANALYTICS_VIEW'), true)

  assert.equal(hasPermission(role, 'PRESENCE_GEOFENCE'), false)
  assert.equal(hasPermission(role, 'CHEMICAL_STOCK_MANAGE'), false)
  assert.equal(hasPermission(role, 'QUOTATION_APPROVE'), false)
})

test('RBAC: Inventory Manager memiliki akses stok & chemical audit', () => {
  const role: UserRole = 'INVENTORY'

  assert.equal(hasPermission(role, 'CHEMICAL_STOCK_MANAGE'), true)
  assert.equal(hasPermission(role, 'CHEMICAL_AUDIT'), true)
  assert.equal(hasPermission(role, 'CMS_ANALYTICS_VIEW'), true)

  assert.equal(hasPermission(role, 'PRESENCE_GEOFENCE'), false)
  assert.equal(hasPermission(role, 'QUOTATION_DRAFT'), false)
})

test('RBAC: Supervisor & Superadmin memiliki hak akses penuh operasional', () => {
  const supervisorPermissions = getPermissionsForRole('SUPERVISOR')
  const superadminPermissions = getPermissionsForRole('SUPERADMIN')

  assert.ok(supervisorPermissions.includes('QUOTATION_APPROVE'))
  assert.ok(supervisorPermissions.includes('CMS_ANALYTICS_VIEW'))
  assert.equal(superadminPermissions.length >= 8, true)
})
