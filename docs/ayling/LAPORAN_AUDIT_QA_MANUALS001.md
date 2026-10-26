# Laporan Analisis Mendalam: Temuan Audit QA Manual (Check-Manual/qa-manuals001.md)

**Analis**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect)  
**Klien & Project**: Rafi / Barventis ERP (PT Asta Boga Nusantara)  
**Dokumen Rujukan**: `Check-Manual/qa-manuals001.md`  
**Status**: AUDIT TERVERIFIKASI & ANALISIS AKAR MASALAH LENGKAP  

---

## 1. Ringkasan Eksekutif Kasus Black Berries & Black Peach

Laporan QA manual menyoroti ketidaksinkronan ekstrem HPP:
- **Black berries coffee mocktail**:
  - Tab 1 (*Menu Pricing*): **Rp 3.502.683** (Food Cost: **9.217,6%**) 🔴
  - Tab 2 (*COGS All Beverage*): **Rp 22.076** (Food Cost: **58,1%**)
- **Black Peach**:
  - HPP membengkak menjadi **Rp 380.192** (Food Cost: **1.001%**) 🔴

---

## 2. Empat Akar Masalah Berantai (Root Causes)

### A. Perbedaan Cara Baca Antar-Tab (Stale DB vs Live Client Calculation)
- **Tab 1 (`MenuPricing.jsx:39-44, 188`)**:
  Melakukan kueri langsung `supabase.from('recipes').select('*')` dan menampilkan kolom statis `recipes.basic_cost` yang tersimpan di DB (**Rp 3.502.683**). Tab ini tidak menghitung ulang bahan secara dinamis.
- **Tab 2 (`Recipes.jsx:211-236`)**:
  Mengabaikan `basic_cost` dari DB pada UI dan menghitung ulang secara *live* di RAM browser menggunakan `calcRowAmount()` (**Rp 22.076**). Namun, hasil hitungan *live* ini **tidak otomatis menimpa DB** sebelum tombol simpan ditekan.

### B. Bug Historis Perkalian Langsung Harga Per-Pack
Nilai jutaan rupiah di DB berasal dari rumus lama yang mengalikan gramasi pemakaian langsung dengan harga satu kardus/pack utuh tanpa dibagi isi kemasan (`qty_in_use * material.price`). Nilai lama ini telanjur tersimpan permanen di database.

### C. Celah Logika Unit Satuan di `costUtils.js` & Fallback Stale di `Recipes.jsx`
1. **Bypass Validasi Kemasan (`costUtils.js:80`)**:
   Pengecekan `isPackUnitConsistent` langsung meloloskan bahan dengan unit `pck`, `pcs`, atau `btl`. Jika master bahan tertulis `unit: 'pck'` dan `full_pack: '1 pck'` seharga Rp 15.000 atau Rp 360.000, saat resep meminta pemakaian `10 gr` atau `20 gr`, sistem mengalikan pemakaian dengan harga pack penuh (seolah-olah resep memakai 10 atau 20 kardus utuh!).
2. **Lookup Key Case-Sensitive & Fallback ke `ing.amount` Lama (`Recipes.jsx:212-219`)**:
   `stockMap` diindeks berdasarkan nama string *case-sensitive* (`map[item.name]`). Jika nama bahan di resep beda huruf besar/kecil atau ada spasi, `stockMap` gagal menemukan bahan dan jatuh ke `if (ing.amount > 0) return ing.amount;` yang mengembalikan nilai usang dari database.

### D. Navigasi Antar-Tab Terputus
Tombol **Lihat Resep** di Tab 1 memanggil `navigate('../recipes')`, padahal di `PricingCogsHub.jsx` perpindahan tab diatur melalui URL query `?tab=cogs-all`.

---

## 3. Matriks 11 Defect Serupa di Seluruh Repositori (Hasil Audit Kode)

| ID | Lokasi File | Kategori | Severity | Dampak Nyata |
|:---:|---|---|:---:|---|
| **BUG-01** | `MenuPricing.jsx:39-44, 218` | Stale DB & Nav Broken | **Critical** | Membaca HPP statis DB lama (Rp 3,5jt) & tombol Lihat Resep keluar konteks. |
| **BUG-02** | `costUtils.js:78-83, 126-136` | Pack Size Bypass | **Critical** | Resep gramasi (gr/ml) pada bahan bersatuan `pck/pcs` mengalikan harga pack utuh per gram. |
| **BUG-03** | `Recipes.jsx:55-72, 212-219` | Case-Sensitive & Stale Fallback | **Major** | Typo nama bahan menyebabkan fallback ke `ing.amount` lama yang salah. |
| **BUG-04** | `upgradeModulesApi.js:254-270` | Column Mismatch | **Critical** | View memanggil kolom `name` & `total_cost` (harusnya `menu_name` & `basic_cost`), Tab 3 Menu Engineering Matrix kosong. |
| **BUG-05** | `UsageRecap.jsx:119, 127` | Unscaled Pack Price | **Critical** | Di Rekap Pemakaian, `total_cost` & `gap_value` mengalikan `a.price` (harga pack) langsung tanpa `calculateIngredientCost`. |
| **BUG-06** | `WasteLogs.jsx:261` & `api.js:1919` | Unscaled Pack Price | **Major** | Estimasi kerugian limbah mengalikan harga pack utuh. |
| **BUG-07** | `SimplePrep.jsx:189-192` | Unscaled Pack Price | **Major** | Modal olah bahan mentah & susut mengalikan gramasi langsung dengan harga beli kg/pack. |
| **BUG-08** | `api.js:1661, 1743` | Fallback Unit Mismatch | **Major** | Fallback adjust stock dan transfer request memakai harga pack langsung. |
| **BUG-09** | `reportGenerator.js:269, 287` | Unscaled PDF Calculation | **Major** | Ekspor PDF SO Resto/Central menghitung nilai aset tanpa konversi kemasan. |
| **BUG-10** | `api.js:2054` vs `maintenanceService.js` | Inconsistent Price & Overhead | **Major** | Perbedaan acuan `price` vs `new_price` vs `avg_cost` memicu desinkronisasi HPP. |
| **BUG-11** | `UnifiedCogsPricing.jsx` | Dead/Broken Component | **Minor** | Komponen legacy yang field-nya sudah tidak sesuai skema database. |

---

## 4. Rencana Solusi & Rekomendasi Tindakan (Action Plan)

### Langkah Segera (Workaround Operasional Saat Ini):
1. Di tab **COGS All Beverage**, klik tombol **Hitung Ulang Semua Resep (RefreshCw)** untuk menimpa nilai `basic_cost` lama di DB dengan angka hitungan yang benar.
2. Periksa bahan baku terkait di **Marketlist**: pastikan kolom **Full Pack** memuat isi gramasi/ml yang jelas (contoh: `1000 gr` atau `750 ml`, bukan `1 pck` kosong).

### Perbaikan Kode Permanen:
1. **Perbaiki `costUtils.js`**: Perketat deteksi satuan isi kemasan agar tidak pernah mengalikan harga pack utuh dengan gramasi.
2. **Sinkronkan `MenuPricing.jsx`**: Sambungkan dengan `useData()` dan fungsi hitung HPP bersama.
3. **Perbaiki `UsageRecap.jsx` & `SimplePrep.jsx`**: Gunakan `calculateIngredientCost` untuk total biaya dan GAP rupiah.
4. **Perbaiki `upgradeModulesApi.js`**: Sesuaikan kolom `menu_name` dan `basic_cost` agar Menu Engineering Matrix menyala.
