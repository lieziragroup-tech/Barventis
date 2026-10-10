# CLAUDE.md — Barventis (Role BAR First)

Dokumen ini adalah panduan wajib. (Diperbarui berdasarkan Audit Bisnis Agustus 2026).

## 1. Arsitektur & Aturan Sistem Baru
- **Role Utama:** Barista & Supervisor (Tidak ada lagi "Pencatat" & "Pengawas" per baris).
- **Alur Logistik:** Multi-lokasi (Central Warehouse vs Resto Bar).
- **Daily EOD Closing:** Menggunakan sistem Draft/Batch (tabel `daily_inventories`), BUKAN Maker-Checker log per-item.
- **Validasi Limbah:** Wajib menggunakan *Photo Evidence* (WebP), bukan tanda tangan digital.
- **Pemotongan Stok:** Melalui impor (Parser) POS ESB + Engine BOM Resep.

## 2. Struktur Database (TO-BE)
- `daily_inventories`: Pencatatan EOD (FULL, BROKEN, IN, OUT).
- `waste_logs`: Mencatat bahan basi/rusak (wajib `photo_evidence_url`).
- `location_transfers`: Mutasi stok antar lokasi di dalam 1 cabang (Central -> Bar).
- `pos_transactions` & `recipes`: Integrasi kasir dan resep.

(Semua referensi ke tabel `inventory_logs` lama dengan `pencatat_signature_url` RESMI DIHAPUS).

## 3. Desain UI/UX
- Hapus semua form "Tanda Tangan Digital" (Canvas).
- Gunakan UI Grid/Batch untuk form Daily Inventory.
- Sediakan tombol "Simpan Draf" dan "Lock EOD".
