# Barventis Daily Inventory — UI / IN / FULL Fix v6.2

## Tujuan perubahan

Versi ini merapikan tabel Form Input EOD dan menyelaraskan tampilan IN serta FULL dengan aturan Daily Inventory yang disepakati.

## Perubahan

1. **IN dapat diisi sebagai total harian.** Field berlabel `IN (Total)` menampilkan penerimaan otomatis dari Purchasing/transfer ditambah IN manual. Saat pengguna mengubah total itu, aplikasi menyimpan selisih manual saja (`total yang dimasukkan - penerimaan sumber`) ke model `manual_in_qty`, agar penerimaan otomatis tidak terhitung dua kali. Jika total input lebih kecil daripada penerimaan otomatis, penyimpanan ditolak.
2. **FULL awal dan FULL hari ini menggunakan satuan kemasan yang sama.** `Stok Awal (FULL)` dihitung dari saldo awal dalam satuan dasar dibagi ukuran kemasan master. `FULL` hari ini dihitung dari saldo buku akhir (saldo awal + penerimaan/mutasi masuk - OUT - WASTE - mutasi/consumption yang sah), dibagi ukuran kemasan lalu diambil jumlah kemasan utuh. Saat tidak ada mutasi, angka awal FULL dan FULL akhir sama.
3. **Helper text di baris tabel dikurangi.** Informasi berulang di bawah kolom dihilangkan; harga/satuan dan badge expired yang relevan tetap ada. Rincian lot hanya ditampilkan secara expandable untuk barang dengan expiry tracking.
4. **BROKEN tidak diinput lagi pada tabel EOD.** Input BROKEN agregat tetap berada di halaman `Catatan Limbah` melalui aksi `Input BROKEN Closing`. Aksi tersebut memperbarui pencatatan fisik di sesi EOD yang sudah disimpan, bukan membuat transaksi pengurangan stok/WASTE.
5. **Proses Produksi tetap tidak ditampilkan** di navigasi/flow operasional Daily Inventory.

## Aturan hitung

Saldo buku akhir dasar:

```text
closing = opening + net stock movement + manual IN delta - OUT - WASTE - legacy production usage
```

`FULL` adalah jumlah kemasan utuh yang dapat direpresentasikan dari saldo buku akhir:

```text
FULL = floor(closing / stock_units_per_pack)
```

BROKEN merupakan hasil timbang manual terpisah. Untuk material yang memiliki konfigurasi ukuran kemasan yang valid, pada no-movement day `opening FULL` dan current `FULL` akan sama. Jika master `full_pack` atau unit tidak valid, material harus diperbaiki di master; aplikasi tidak lagi menampilkan saldo dasar ml/g seolah-olah itu jumlah FULL.

## Database

Perubahan v6.2 bersifat frontend-only dan **tidak memerlukan migration baru**. UI tetap menggunakan RPC yang sudah ada:

- `save_daily_inventory_manual_in_v6`
- `save_daily_inventory_broken_counts_v7`

Jalankan hanya bila perlu memastikan migration sebelumnya sudah diterapkan. Jangan menjalankan ulang semua migration yang sudah sukses. Jika `save_daily_inventory_broken_counts_v7` tidak ditemukan, berarti migration v7 belum diterapkan; jalankan file v7 saja setelah memverifikasi statusnya.

## Validasi yang dilakukan

- TypeScript transpile/syntax check untuk 114 file JS/JSX/TS/TSX: 0 syntax errors.
- Domain smoke check: opening 5 botol, OUT 200 ml, saldo buku 4.800 ml dan BROKEN 800 ml menghasilkan FULL 4; IN total 7 dengan 5 dari sumber menghasilkan delta manual 2; WASTE turut mengurangi saldo buku.
- Build Vite penuh dan tes integrasi Supabase belum dijalankan dalam lingkungan ini. Lakukan `npm run build` dan uji save/closing pada staging sebelum production.

## Cara menerapkan

- Ganti `src/pages/shared/DailyInventory.jsx` di branch yang dibangun Vercel dengan versi dari paket ini, atau deploy seluruh source package v6.2 jika folder repository sama dengan baseline paket.
- Push perubahan ke branch deployment, lalu cek build Vercel.
- Uji di staging: IN otomatis saja, IN manual tanpa penerimaan, total IN + penerimaan otomatis, total IN di bawah penerimaan otomatis, OUT/WASTE memengaruhi FULL, BROKEN disimpan dari Catatan Limbah, dan closing esok hari mewarisi saldo EOD sebelumnya.


## Hotfix v6.2.1 — Runtime `outConfirmed` ReferenceError

The rendered OUT input placeholder referenced `outConfirmed` from a scope where it was not defined. This caused a runtime crash when the Daily Inventory table rendered. The row renderer now derives `outConfirmed` inside `paginatedItems.map`, using the row's saved confirmation flag, explicit zero-activity confirmation, or an entered OUT value.

- **Database migration required:** No. This is a frontend scope fix only.
- **Files changed:** `src/pages/shared/DailyInventory.jsx`.
- **Validation:** confirmed all `outConfirmed` UI references now have a valid row-local declaration and archive integrity checked. Full Vite build was not run in this environment because node dependencies are not installed here.
- **Deployment:** deploy this source fix to the branch used by Vercel, then reload Daily Inventory. Do not rerun SQL for this runtime error.
