# Barventis — Daily Inventory & Cost Control v6

## Tujuan revisi

Versi ini memperbaiki dua masalah dari v4:

1. Kolom IN sebelumnya bukan input universal: untuk material dengan expiry tracking, kolom dinonaktifkan dan manual IN ditolak oleh RPC. Sekarang input manual tersedia untuk semua material. Material biasa memakai input IN langsung; material dengan expiry tracking memakai rincian multi-lot (qty + expired date per lot), sehingga satu hari tetap bisa menerima 3–5 lot berbeda.
2. FULL dihitung otomatis dari saldo buku penutupan saja (`floor(book closing / stock units per pack)`), tidak pernah dengan mengurangi BROKEN. Pada hari tanpa IN/WASTE/transfer/penyesuaian lain, ini sama dengan stok awal dikurangi OUT. IN yang benar-benar masuk tetap harus tercermin pada stok akhir agar hasil fisik tidak salah.

## Aturan FULL dan BROKEN

- Opening berasal dari closing EOD sebelumnya dan mutasi sah setelah closing tersebut.
- Saldo buku akhir dihitung dari opening + seluruh IN dan mutasi stok positif/negatif yang sah - OUT aktual - WASTE dan konsumsi legacy yang masih valid.
- Jika tidak ada IN/WASTE/transfer/penyesuaian lain, ini setara dengan stok awal dikurangi OUT.
- FULL adalah jumlah kemasan utuh yang diinferensikan dari saldo buku akhir, bukan dihitung dengan mengurangi BROKEN.
- BROKEN wajib ditimbang manual saat closing untuk material yang `broken_tracking_enabled`; nilainya dalam satuan dasar isi kemasan. Server memeriksa bahwa `FULL * isi kemasan + BROKEN` sesuai saldo buku dalam toleransi yang dikonfigurasi.
- Selisih yang tidak konsisten akan menolak closing dengan pesan rekonsiliasi, bukan dibulatkan diam-diam.

## Input IN

- Kolom `IN` menampilkan total masuk harian dan dapat diedit langsung pada semua material.
- Nilai yang sudah tercatat dari Purchasing/transfer otomatis termasuk pada kolom IN; hanya selisih di atasnya yang disimpan sebagai manual IN. Jika total yang diketik lebih kecil dari IN sumber, validasi menolak penyimpanan agar penerimaan yang sah tidak terhapus atau terhitung ganda.
- Draft IN tersimpan ke `daily_inventory_items.manual_in_qty` pada aksi Simpan Progress; perubahan saldo master baru diposting ketika closing berhasil, sesuai aturan transaksi atomik. Kolom input menampilkan total IN (penerimaan auto + manual delta), bukan hanya delta manual. Jika kolom disabled karena EOD terkunci, pengguna berwenang perlu memilih Buka Kunci (Revisi EOD) terlebih dahulu.
- Untuk material expiry-tracked, buka rincian lot dan masukkan setiap lot tambahan manual (nomor batch opsional, expired date wajib, qty > 0). Jumlah lot harus cocok dengan selisih IN manual, bukan dengan penerimaan yang sudah masuk otomatis.
- Manual IN tersimpan sebagai draft dan baru mem-posting transaksi/mengubah saldo saat closing berhasil. Transaction dan lot records memakai idempotency key agar retry tidak menggandakan stok.
- Lot yang sudah dikonsumsi/ditransfer tidak boleh dihapus atau diubah sembarangan saat re-open; gunakan penyesuaian terotorisasi.

## Proses Produksi

Workflow/UI/API/report entry point `Proses Produksi` telah dihapus dari aplikasi. Tabel serta histori transaksi lama tidak dihapus oleh migration ini demi menjaga data historis. Referensi produksi legacy tetap dibaca hanya untuk rekonsiliasi saldo transaksi lama; tidak ada alur input produksi baru dari Daily Inventory.

## Perubahan file

- `src/pages/shared/DailyInventory.jsx`: membuka tab Form Input EOD secara default (sebelumnya membuka Rekap yang hanya-baca); kolom IN menampilkan total harian yang bisa diedit; expiry IN memiliki rincian multi-lot; validasi closing lot; pagination/search tetap dipertahankan.
- `src/services/api.js`: menyimpan `manual_in_qty`/`manual_in_lots`, memanggil `save_daily_inventory_manual_in_v6`.
- `src/services/dailyInventoryMath.js`: FULL diambil dari saldo buku lalu BROKEN divalidasi terpisah.
- `src/services/__tests__/dailyInventoryMath.test.js`: cakupan FULL berdasarkan opening minus OUT dan validasi BROKEN.
- `supabase/migrations/20261023000000_daily_inventory_in_input_fix_v6.sql`: kolom lot manual, idempotent lot creation, RPC manual IN yang lot-aware, serta penggantian server-side EOD calculation.

## Acceptance criteria sebelum production

1. Halaman Daily Inventory membuka Form Input EOD (editable) secara default, bukan tab Rekap yang hanya-baca. Material non-expiry dapat mengisi total IN, menyimpan draft, refresh, dan melihat nilai tetap ada.
2. Saat closing, IN manual dicatat satu kali ke transaction ledger dan saldo material naik tepat sekali.
3. Mengulang request yang sama tidak membuat transaction atau mutasi lot ganda.
4. Material expiry-tracked menerima satu atau banyak rincian lot; total kuantitas lot sama dengan total IN dan setiap lot punya expired date.
5. Input expiry lot valid menghasilkan jumlah yang sama pada `materials` dan aggregate lot per lokasi.
6. Input lot tanpa expiry date, qty nol/negatif, atau total tidak cocok ditolak saat closing.
7. IN dari Purchasing/transfer tetap dihitung otomatis dan tidak perlu dimasukkan ulang.
8. FULL = floor(saldo buku akhir / ukuran isi per kemasan), tanpa menggunakan BROKEN sebagai input untuk menghitung FULL.
9. BROKEN manual yang cocok dengan saldo buku diterima; tidak cocok menampilkan exception dan tidak mengubah saldo secara diam-diam.
10. Opening tanggal berikutnya berasal dari closing sebelumnya ditambah mutasi sah setelah closing.
11. Pagination/search tidak menghapus draft input pada halaman lain; preview mencakup semua material, bukan hanya hasil search.
12. Closing pada sesi terkunci tetap ditolak; perubahan setelah closing harus melalui reopen/otorisasi dan audit trail.
13. Tab/action `Proses Produksi` tidak tersedia di UI/API/report output. Data lama di database tetap dipertahankan.
14. Build Vite penuh, test suite, serta migration harus berhasil di staging sebelum deployment production.

## Deployment

### Jika v3, v4, dan v5 sudah sukses diterapkan

Jalankan hanya migration v6 (`20261023000000_daily_inventory_in_input_fix_v6.sql`) pada staging terlebih dahulu, kemudian build/test aplikasi.

### Jika memulai dari database yang belum menerapkan migration v3/v4/v5

Gunakan SQL all-in-one yang disediakan terpisah dan jalankan di staging. Jangan menjalankan all-in-one bersamaan dengan migration individual pada instance yang sama dalam satu sesi.

## Status verifikasi

- Pemeriksaan transpile syntax pada file JS/JSX yang diubah: lulus.
- Perhitungan contoh domain: opening 5 botol, OUT 0,2 botol, BROKEN 800 ml, ukuran botol 1000 ml menghasilkan saldo buku 4,8 botol dan FULL 4; lulus.
- Belum ada koneksi live ke Supabase/PostgreSQL dalam environment ini; migration belum dieksekusi terhadap database aktif.
- Build Vite penuh belum diverifikasi di environment ini karena dependencies lokal tidak tersedia. Jalankan `npm ci`, `npm run build`, dan `npm test` pada branch staging.
