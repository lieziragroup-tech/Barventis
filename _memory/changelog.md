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
