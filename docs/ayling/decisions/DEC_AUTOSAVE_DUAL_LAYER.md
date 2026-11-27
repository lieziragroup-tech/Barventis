# Catatan Keputusan Arsitektur: Dual-Layer Persistence & Unmount Flush pada Daily Inventory

**ID Keputusan**: DEC-20261023-01  
**Tanggal**: 2026-10-23  
**Status**: APPROVED & IMPLEMENTED  
**Author**: Ayling (Lead Autonomous Orchestrator) / Rafi

---

## 1. Konteks Masalah
Pada form EOD Daily Inventory, pengguna sering berpindah halaman (navigasi) sebelum batas debounce auto-save 5 detik tercapai atau saat request API sedang berjalan. React `useEffect` cleanup membatalkan timer (`clearTimeout`) sehingga draft yang sedang diketik belum sempat mendarat di database Supabase dan tidak pernah muncul kembali saat kembali ke halaman.

## 2. Keputusan Desain (Dual-Layer Resilience)
1. **Instant Local Storage Mirror (Zero Data Loss)**:
   - Setiap mutasi input (`IN`, `OUT`, `BROKEN`, `Lots`) langsung menulis snapshot ke `localStorage` dengan key tenant-aware `barventis_daily_inv_draft_${tenantId}_${location}_${date}`.
2. **Unmount Flush (Server Sync on Navigation)**:
   - Pada hook unmount (`useEffect cleanup`), jika flag `isDirtyRef.current === true`, sistem langsung mengeksekusi flush save ke database secara instan tanpa menunggu sisa timer 5 detik.
3. **Rehidrasi Cerdas (Smart Rehydration)**:
   - Saat `fetchEodData()` selesai memuat data dari database, komponen memeriksa apakah terdapat draft lokal yang belum di-commit ke server. Jika ada dan sesi belum terkunci (`!isLocked`), state lokal di-merge secara mulus.
4. **Pembersihan Cache Otomatis**:
   - Cache lokal otomatis dihapus hanya saat EOD closing resmi berhasil di-*Lock*.

## 3. Hasil Pengujian
- Transpile build Vite production: **PASS (100% clean bundle)**.
- Test suite Vitest: **10 test files passed, 140/140 unit tests passed (100% PASS)**.
