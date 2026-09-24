# Dokumentasi Upgrade Barventis ERP V2.1

## WBS & Perencanaan
Dokumen perencanaan komprehensif 4-level telah disusun di `WBS_UPGRADE_PLANNING.md`. Eksekusi didasarkan pada dokumen tersebut.

## Penyelesaian Backlog (Fase 2)
- Hapus file usang (`ESBUpload.jsx`, `DashboardLayout.jsx`).
- Implementasi `UsageRecap.jsx` (Tab Pemakaian Harian dengan date-range & kalkulasi kumulatif).
- Implementasi tombol "Kirim ke PO" di `Marketlist.jsx`.

## Refactoring & Database (Fase 3)
- Pendekatan incremental: `api.js` lama dipertahankan, modul baru dibuat di `src/services/upgradeModulesApi.js`.
- File migrasi database: `supabase/migrations/20260924000000_upgrade_modules.sql` (tabel `material_batches`, `stock_adjustments`, `equipment_service_logs`, dan kolom tambahan untuk par-stock/vendor/menu engineering).

## Modul Pendukung Baru (Fase 4)
Semua modul UI baru diintegrasikan ke halaman "Hub" yang sesuai:
1. **FEFO & Kedaluwarsa:** `ExpiryMonitor.jsx` (Tab di `DailyInventoryHub`).
2. **Audit Selisih:** `StockAdjustments.jsx` (Tab di `OpnameAssetsHub`).
3. **Pemeliharaan Alat:** `EquipmentMaintenance.jsx` (Tab di `ProductionHub`).
4. **Menu Engineering:** `MenuEngineering.jsx` (Tab di `PricingCogsHub`).
5. **Vendor & Par-Stock:** Logika backend tersedia di `upgradeModulesApi.js`.

## Verifikasi (Fase 5)
- Unit test diperbarui dan lulus (`npm run test` -> 42/42 passed).
- Build production berhasil tanpa error (`vite build`).

**Status Codebase:** 100% Development Complete. Siap untuk deployment tahap akhir (Fase 6).