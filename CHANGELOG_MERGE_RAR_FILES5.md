# Changelog — Merge `Barventis.rar` + `files__5_.zip`

**Tanggal:** 23 Agustus 2026

## Ringkasan situasi

Dua file yang diupload ternyata **bukan dua codebase independen** — keduanya cabang dari pekerjaan yang sama, terpecah karena dikerjakan paralel oleh alat/sesi berbeda:

- **`Barventis.rar`** = kelanjutan langsung dari sesi kerja saya sebelumnya, dengan tambahan patch kasar (`fix-api.patch`, `fix-bulk.cjs`, `fix-stock.patch`, dll) dari alat lain yang mencoba menambah fitur "konversi satuan manual". Patch ini **cuma 2 dari 13 titik hitung biaya** yang benar-benar tersambung `unitConversionMap` — sisanya hilang.
- **`files__5_.zip`** = 5 file lepas (`costUtils.js`, `costUtils.test.js`, `StockLedger.jsx`, `Recipes.jsx`, `api.js`) dari sesi kerja **lain** yang membangun fitur serupa dengan pendekatan **jauh lebih matang**: konversi ditulis langsung ke kolom `full_pack` material (format `"Carton = 24 pcs"`), bukan tabel terpisah — otomatis kebaca di semua tempat tanpa wiring manual.

## Temuan kritis selama analisis

**Bug ditemukan oleh sesi files5, dikonfirmasi & diperbaiki di merge ini:** query `select()` di `processPosCheckout` (fungsi checkout POS Terminal real-time) **hilang kolom `full_pack`** dari relasi `recipe_ingredients.materials`. Akibatnya: **setiap transaksi kasir di POS Terminal menghitung biaya bahan sebagai Rp 0**, apapun perbaikan pack-size lain yang sudah ada. Bug yang sama juga sempat ada di `bulkImportRecipes` (sudah dibenarkan di `Barventis.rar` sebelum merge ini, terverifikasi).

## Strategi merge yang dipakai

1. **Base**: `Barventis.rar` (paling lengkap — berisi seluruh riwayat: HPP merge, flexible-ID, security audit, reset-approval workflow).
2. **Diganti total** dengan versi `files__5_.zip` (lebih superior): `costUtils.js`, `costUtils.test.js`, `StockLedger.jsx`, `Recipes.jsx`.
3. **`api.js` digabung manual, baris per baris** — bukan replace total, karena kedua sisi punya perbaikan berbeda yang saling melengkapi:
   - Dari files5: fix `full_pack` hilang di `processPosCheckout`, fungsi `convertQtyToStockUnit` (pengganti kalkulasi faktor gr/ml↔kg/l manual yang lebih sempit), `recalculateAllRecipes` versi lebih lengkap (menghormati Fix Cost % per-resep, memperbaiki `selling_price` yang macet di 0)
   - Dipertahankan dari sesi saya: CRUD `unit_conversions` (dirapikan jadi upsert-by-id yang aman, bukan delete-then-insert)
   - **Baru**: menyelesaikan wiring `unitConversionMap` ke **seluruh 13 titik** hitung biaya di `api.js` (sebelumnya cuma 2)
4. **Melengkapi wiring `unitConversionMap`** ke seluruh sisa aplikasi yang belum tersentuh: `Dashboard.jsx`, `StockOpname.jsx`, `AIAssistant.jsx`, `DailyInventory.jsx`, `Recipes.jsx`, `maintenanceService.js`, `varianceCalculator.js`, dan **5 titik + 2 fungsi helper** di `reportGenerator.js` (termasuk `generatePDF`/`generateReports` dan pemanggilnya di `BaristaReport.jsx`).
5. **Halaman Settings baru** (`Maintenance.jsx`, bagian "Konversi Satuan Kemasan") — sesuai permintaan awal Anda: daftar semua override manual, form tambah/edit/hapus, terhubung ke CRUD yang sudah ada. Diposisikan sebagai **jalur sekunder/opsional** — jalur utama tetap kolom Full Pack di Stock Ledger (sudah otomatis kebaca di mana saja tanpa perlu diatur di sini).
6. Dibersihkan: 5 file patch mentah (`fix-api.patch`, `fix-bulk.cjs`, `fix-stock.patch`, `patch_stock.cjs`, `patch_stock2.cjs`) dihapus dari root proyek — isinya sudah terintegrasi dengan benar ke kode, tidak perlu lagi berupa file terpisah yang membingungkan.
7. Sekalian dibenerin: teks di halaman Settings yang sudah lama menyesatkan (bilang semua resep pakai formula overhead tenant, padahal tiap resep sudah punya Fix Cost % sendiri sejak fitur HPP baru).

## Validasi akhir

- ✅ `vite build` — sukses, seluruh 40+ halaman ter-bundle tanpa error
- ✅ `eslint src` — 0 error, 0 warning
- ✅ `vitest run` — **30/30 test lulus** (naik dari 22 — test file dari files5 punya cakupan lebih luas untuk fitur pack/content-unit baru)
- ✅ Sweep akhir: dipastikan **tidak ada satupun** pemanggilan `calculateIngredientCost()` di seluruh codebase yang masih tanpa `unitConversionMap`

## Cara pakai fitur konversi satuan (untuk end-user)

**Cara utama (disarankan):** edit kolom "Full Pack" di form bahan (Stock Ledger) dengan format `"Carton = 24 pcs"` — otomatis berlaku di HPP resep, laporan, Dashboard, dan POS Terminal, tanpa langkah tambahan.

**Cara alternatif (Settings → Konversi Satuan Kemasan):** kalau tidak mau mengubah teks Full Pack secara langsung, bisa tambahkan override di halaman Settings — bahan tsb akan pakai angka dari sana, mengabaikan apapun yang tertulis di Full Pack.
