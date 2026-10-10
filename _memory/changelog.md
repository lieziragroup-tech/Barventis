# Barventis Version Control & Changelog

## [v2.1.0] - Phase 3 (Photo Evidence)
- **Feat**: Tambahkan kewajiban unggah foto fisik (UI Upload WebP constraint) di modul `WasteLogs.jsx`.
- **Refactor**: Verifikasi final 100% penghapusan sistem Maker-Checker usang (Signature Canvas & routing Pengawas tidak lagi eksis).

## [v2.0.1] - Phase 1 (Database Migration)
- **Feat**: Tambah tabel `location_transfers` dan `location_transfer_items`.
- **Refactor**: Override `CLAUDE.md` untuk membersihkan arsitektur Maker-Checker usang.
- **Docs**: Pembuatan *Blueprint* `business_goals.md` dan *Gap Analysis* berdasarkan forensik 13 sheets operasional riil.

## [v2.0.0] - Baseline
- **Build**: Struktur UI eksisting (Daily EOD, POS Upload, Trimming, Waste Logs) sebelum pemangkasan terarah.

## [v2.2.0] - Phase 4 (POS & BOM Engine Parser)
- **Feat**: Integrasi Parser ESB pintar di `PosUpload.jsx` untuk mendeteksi kolom `Type` (`PACKAGE HEAD` vs `PACKAGE CONTENT` vs `ALA CARTE`). Omset diambil dari Header, pemotongan kuantitas (BOM) diambil dari Content.

## [v2.2.1] - Phase 3 (Storage Wiring)
- **Feat**: Tambahkan injeksi `photo_evidence_url` ke `atomic_record_waste` RPC.
- **Feat**: Integrasi Supabase Storage `waste-evidences` di `api.recordWaste` (`src/services/api.js`).
- **Fix**: Teruskan file unggahan dari komponen UI `WasteLogs.jsx` ke API service layer.

## [v2.2.2] - Finalisasi Arsitektur
- **Docs**: Sinkronisasi dan verifikasi skema akhir (*Source of Truth*) database riil vs kode Frontend.
- **Refactor**: Konfirmasi absennya sisa-sisa Maker-Checker di DB maupun UI. Sistem mutlak beralih ke Blueprint *Role BAR First*.

## [v2.2.3] - Database Integrity Audit
- **Fix**: Suntikkan `FOREIGN KEY` yang hilang pada `stock_adjustments.material_id` dan `daily_inventory_items.material_id` yang memicu error PostgREST API 400.
- **Docs**: Pembuatan dokumen pengujian White Box dan Black Box.
