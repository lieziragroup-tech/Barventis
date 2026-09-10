# Manual Setup Required
Generated dari analisis file: Daily_Sales_Menu_Report_URVGANDHI_April_minuman.xlsx

---

## A. Menu di POS TANPA Resep (Belum Ada di Form COGS)
Item-item berikut terjual di POS bulan April tapi tidak ditemukan BOM-nya.
Harus diputuskan: buat resep baru, atau tandai sebagai menu non-BOM (misal bir kemasan).

- `Bali Hai Panther beer 330ml`
- `Bali Hai Premium 330ml`
- `Bali Hai Romantic Day Lager 500ml`
- `Bir Bintang 330`
- `Bir Bintang Crystal 330`
- `Bir Bintang Raddler 330`
- `Black Peach (Ice)`
- `Botol Bir (add)`
- `Bungan Jepun`
- `Draft Beer BaliHai 220ml`
- `Es Batu (add)`
- `Fresh Milk 100ml (add)`
- `Fruit Juice`
- `Heineken small 330`
- `Kiwi Ginger`
- `Teh Poci`
- `Tropical Fruit Smoothies`

---

## B. Kolom yang WAJIB Diisi Manual di `template_materials_final.xlsx`

| Kolom | Keterangan |
|---|---|
| **Kategori** | Pilih dari enum sistem (misal: Dairy, Bean, Syrup, Topping, Packaging, Utility) |
| **SUPPLIER** | Nama supplier bahan baku |
| **UNIT** | Satuan terkecil yang dipakai di resep (gram, ml, pcs, dll) |
| **Full** | Jumlah UNIT dalam 1 kemasan beli. Contoh: susu 1 liter dipotong per ml, isi `1000` |
| **Price** | Harga BELI per kemasan (bukan per gram/ml). Angka di Excel mentah tidak bisa dipakai langsung karena tidak konsisten (lihat catatan di bawah) |
| **Min Stock** | Batas minimum stok sebelum sistem notifikasi |
| **Stok Awal** | Stok awal saat sistem pertama dipakai (stok fisik hari ini) |

### Catatan Harga Bahan (PENTING)
Harga yang tertulis di Form COGS file Excel bukan harga per satuan (gram/ml).
Itu adalah harga per kemasan besar yang ukurannya berbeda-beda dan tidak tertulis di file.
Akibatnya ada inkonsistensi (contoh: Ice Cube Rp210.000 di Kopi Rempah vs Rp21.000 di resep lain).
Kolom `Price` saat ini di-set ke 0. Isi dengan harga beli riil dari faktur/invoice terbaru.

---

## C. Normalisasi Ejaan Bahan yang Sudah Dilakukan (Otomatis)

| Ejaan di Excel (raw) | Dinormalisasi menjadi |
|---|---|
| Fresh milk / Fresh milk (spasi trailing) / Fresh mlik | Fresh Milk |
| Ice Cube / ice cube / Ice cube / Ic Cube | Ice Cube |
| Harum Manis Fruit Pulp / Harum manis pulp | Harum Manis Fruit Pulp |
| Pistachio Crumbel / Pistachio/Mede crumbel | Pistachio Crumbel |

---

## D. Koreksi Data yang Sudah Diterapkan (Otomatis)

| Menu | Masalah | Perbaikan |
|---|---|---|
| Canggu Sunset | Unit Price Soda Water berisi #REF! | Di-set ke 0, harus diisi manual |
| Picolo | Kolom Qty dan Unit terbalik (Fresh milk & Espresso) | Ditukar otomatis |

---

## E. Kategori Aneka Es
7 menu dengan kategori `Aneka Es` (Es Daluman, Es Jeruk, Es Kelapa Jeruk, Es Kelapa Muda, Honey Lemon Ice Soda, Ice Lychee Tea, Kelapa Muda Utuh) telah dimapping ke `NON-KOPI`.
Ubah di Excel jika ingin kategori sendiri.

---

## F. Menu Draft (Ada di Form COGS, BELUM Tayang di POS)
Menu-menu ini digenerate dengan kode `RCP-NEW-xxxx`. Cek dulu apakah akan dipakai sebelum di-upload.

- `Buttersccoth Sea Salt` (Kode: `RCP-NEW-0001`)
- `Red Velvet` (Kode: `RCP-NEW-0002`)
- `Dilmah Tea Pot` (Kode: `RCP-NEW-0003`)
- `Huzelnut Coffee Cream` (Kode: `RCP-NEW-0004`)
- `Pistachio Matcha` (Kode: `RCP-NEW-0005`)
- `Pina Tropicano` (Kode: `RCP-NEW-0006`)
- `The Tangy Kiwie` (Kode: `RCP-NEW-0007`)
- `Prostberry Tea Bliss` (Kode: `RCP-NEW-0008`)
- `Black berries coffee mocktail` (Kode: `RCP-NEW-0009`)
- `Tropical Smoothies` (Kode: `RCP-NEW-0010`)
- `Avocado juice` (Kode: `RCP-NEW-0011`)
- `Guava juice` (Kode: `RCP-NEW-0012`)
- `Soursop juice` (Kode: `RCP-NEW-0013`)
- `Mango juice` (Kode: `RCP-NEW-0014`)
