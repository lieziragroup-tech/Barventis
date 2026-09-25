# Barventis ERP V2 – WBS Feature Integration & Refactor Changelog (2026-09)

## Objective
Mendokumentasikan perubahan kode, fitur baru, refaktor/bugfix, dan adjustment pattern untuk toast/auth/data context di seluruh modul terkait WBS 2026-09.

---

## 1. Fitur & File Baru

**Supabase/Backend:**
- `supabase/migrations/20260925000000_wbs_f1_triggers_storage.sql`
  - Trigger insert gambar, validate, policy improvement untuk file storage (nota/foto datang)
  - "AutomatedCostControl"/"DailyInventoryEOD"/"TrimmingCaptureFlow"/"GoodsReceiptNote"/"LeanProcurementDashboard"/"UnifiedCogsPricing" table/view/trigger (lihat script untuk detail DDL)
- `supabase/functions/purge-old-media/index.ts`
  - Edge Function baru: clean up file media lama (integrasi supabase storage policy)

**Utilities:**
- `src/utils/imageCompressor.js`
  - Baru: compress dan watermark image sebelum upload/proses
  - Fix logika scaling, fill, optimalisasi watermark

---

## 2. Frontend Komponen & Halaman

### 2.1 Fitur & Perubahan Baru
- `src/components/DualPhotoCapture.jsx`
  - Komponen ambil dua gambar, preview, delete, callback blobs
  - Pattern fix: toast pakai method (showSuccess/dll), context tanpa destructure, Auth pakai activeUser
  - Import path diperbaiki (../utils/imageCompressor)

- `src/pages/shared/MarketlistExcelView.jsx`
  - Katalog barang, auto-fill par stock, grouping supplier, usulan belanja
  - Pattern: toast pakai objek (bukan destructure)

- `src/pages/shared/LeanProcurementDashboard.jsx`
  - Konsolidasi usulan → PO, edit qty, issue PO per supplier
- `src/pages/shared/GoodsReceiptNote.jsx`
  - GRN flow: input qty aktual, expiry, foto bukti, variance
- `src/pages/shared/TrimmingCaptureFlow.jsx`
  - Pencatatan trimming, flow multi-step, foto lengkap
- `src/pages/shared/UnifiedCogsPricing.jsx`
  - Edit/set HPP, array.fill bugfix, slice(0,10)
- `src/pages/shared/DailyInventoryEOD.jsx`
  - Input stok (quantity/fraction), warning fraksi
- `src/pages/shared/AutomatedCostControl.jsx`
  - Kontrol biaya otomatis, export Excel/PDF, chart

### 2.2 Refaktor Pola Konsistensi Context
- Semua `useToast` kini:
  - `const toast = useToast();`, dipanggil via: `toast.showSuccess()`, `toast.showError()` dll
  - Tidak lagi: `const { showToast } = useToast();`
- Auth context:
  - Selalu `const { activeUser } = useAuth();`
  - Tidak lagi destructure user/user_metadata
- Seluruh import path internal diperbaiki (utils/components)

---

## 3. Bugfix/Improvement
- [Fixed] Array.fill menghasilkan shared ref → pakai Array.from di UnifiedCogsPricing.jsx
- [Fixed] Marketlist: input negative qty jadi 0, submit qty 0/warning
- [Fixed] GRN expiry wajib (perishable), toast error jika kosong
- [Fixed] Trimming: toleransi berat (gross ≈ clean+limbah ±5g), validasi toast error
- [Fixed] Semua context usage (toast, auth) konsisten
dipandang dari QA/UAT
- [Fixed] Camera/file error handling + revokeObjectURL untuk remove/ganti photo
- [Fixed] Import path util/komponen untuk build success

---

## 4. QA/UAT Evidence
- Semua flow: build lulus tanpa error/warning (npm run build verified)
- Semua komponen: QA test scenario pass (cek excel, toast, photo, context, edge case, error handling, tidak ada memory leak)

---

## 5. Catatan Migrasi
- SQL migration: conditional IF NOT EXISTS, policy aman, edge function sinkron
- Semua komponen/page siap sambung ke AppLayout/router bila diperlukan

---

## Penempatan File
- Backend: `/supabase/migrations/`, `/supabase/functions/`
- Frontend: `/src/pages/shared/`, `/src/components/`, `/src/utils/`
- Context: `/src/contexts/AuthContext.jsx`, `/src/contexts/ToastContext.jsx`, `/src/contexts/DataContext.jsx`

---

**Summary:**
Semua perubahan memenuhi WBS 2026-09, konsistensi context & toast, modul baru/fix siap produksi.
