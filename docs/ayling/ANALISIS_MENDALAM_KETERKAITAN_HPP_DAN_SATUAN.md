# Investigasi Mendalam: Dampak Sistemik Celah Kalkulasi HPP & Konversi Satuan Kemasan

**Analis**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect)  
**Dokumen Terkait**: `Check-Manual/qa-manuals001.md`  
**Status**: ANALISIS SISTEMIK TUNTAS & PEMETAAN DAMPAK END-TO-END  

---

## 1. Peta Rantai Reaksi (The Systemic Domino Effect)

Celah pada perhitungan satuan kemasan (*Pack Size*) dan pembacaan harga bukan hanya masalah visual di satu halaman. Masalah ini menjalar ke **5 pilar utama sistem Barventis**:

```
+----------------------------------------------------------------------------------------------------+
|                                    AKAR MASALAH (ROOT CAUSE)                                       |
|  1. isPackUnitConsistent bypass validasi jika unit = pck/pcs/btl/kaleng.                          |
|  2. Perkalian langsung kuantitas dengan `material.price` (harga dus/kardus) tanpa dibagi packSize. |
|  3. Desinkronisasi nilai statis DB (basic_cost) vs hitung live di RAM browser.                   |
+----------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
     ┌──────────────────────┬─────────────────────┼──────────────────────┬──────────────────────┐
     ▼                      ▼                     ▼                      ▼                      ▼
[PILAR 1: RESEP & BOM] [PILAR 2: SALES POS] [PILAR 3: INVENTARIS] [PILAR 4: TRIMMING]   [PILAR 5: LAPORAN]
HPP Menu Pricing &     Expected Usage &      Rekap Pemakaian &    Modal Olah Bahan      PDF Report &
COGS melonjak hingga   Theoretical Usage     GAP Selisih Tekor    Mentah & Waste        Cost Control
Rp 3,5 Jt (9.217% FC)  membengkak 1.000x     membengkak 1.000x    membengkak 1.000x     menghasilkan rasio
                                                                                        biaya yang salah
```

---

## 2. Analisis Keterkaitan Mendalam per Modul

### A. Keterkaitan ke Impor Penjualan POS ESB (`api.js:745-770`)
- **Mekanisme**: Saat file POS di-upload, sistem menghitung biaya bahan yang seharusnya habis (*expected_usage*):
  ```javascript
  const costingMaterial = { ...material, price: Number(material.new_price) > 0 ? material.new_price : material.price };
  const cost = calculateIngredientCost(costingMaterial, ingredientQty * qtySold, ingredientUnit, unitConversionMap);
  ```
- **Dampak Keterkaitan**: Jika `costUtils.js` gagal menormalisasi satuan (misal bahan sirup dicatat `unit: 'btl'` tapi resep memakai `ml`), `calculateIngredientCost()` mengembalikan angka 0 atau harga 1 botol per ml. Akibatnya:
  - Nilai rupiah `expected_usage` di database menjadi tidak realistis (terlalu kecil atau terlalu besar miliaran rupiah).
  - Laporan rekonsiliasi HPP Teoretis di `CostControl.jsx` menjadi bias.

### B. Keterkaitan ke Rekap Pemakaian & GAP Analysis (`UsageRecap.jsx:119, 127`)
- **Mekanisme**:
  - `total_cost = a.total_terpakai * a.price`
  - `gap_value = gap_qty * a.price`
- **Dampak Keterkaitan**:
  - Kolom `total_terpakai` dan `gap_qty` berdimensi unit riil (misal gram atau ml).
  - Namun dikalikan langsung dengan `a.price` yang merupakan **harga beli per pack/kardus** (misal Rp 111.000 per botol Monin 750ml).
  - Selisih 250 gram kopi atau 100 ml sirup dihitung rugi: $100 \times \text{Rp } 111.000 = \mathbf{Rp\ 11.100.000}$ (seharusnya hanya $\approx \text{Rp } 14.800$!).
  - **Efek ke Pengajuan Event**: Head of Bar yang berniat mengajukan kompensasi event kaget melihat angka tekor bernilai puluhan juta rupiah di popup pengajuan ACC ke Direktur.

### C. Keterkaitan ke Olah Bahan Mentah / Trimming (`SimplePrep.jsx:189-192`)
- **Mekanisme**:
  - `sourcePricePerUnit = selectedSourceMat?.price || ...`
  - `totalSourceCost = sQty * sourcePricePerUnit`
  - `newTargetHppPerUnit = totalSourceCost / tQty`
- **Dampak Keterkaitan**:
  - Jika staf menimbang bahan mentah dalam satuan `gr` (misal 500 gr Strawberry) sementara master bahan dibeli per kg (Rp 80.000/kg), modal dihitung $500 \times 80.000 = \mathbf{Rp\ 40.000.000}$!
  - Akibatnya, HPP sirup/jus olahan yang dihasilkan menjadi puluhan juta per botol, merusak seluruh resep minuman yang memakai bahan olahan tersebut.

### D. Keterkaitan ke Modul Menu Engineering Matrix (Tab 3 yang Mati)
- **Mekanisme di `upgradeModulesApi.js:260`**:
  - Kueri fallback memanggil:
    `select('id, name, category, selling_price, total_cost, ...')`
  - Di database `public.recipes`, nama kolom adalah `menu_name` dan `basic_cost`.
- **Dampak Keterkaitan**:
  - Tab 3 **Menu Engineering Matrix** (yang seharusnya memetakan menu kategori *STAR, PLOWHORSE, PUZZLE, DOG*) selalu gagal mengambil data dan tampil kosong.

### E. Keterkaitan ke Ekspor PDF Laporan Bulanan (`reportGenerator.js:269, 287`)
- **Mekanisme**:
  - Pada pembuatan lembar SO Resto & Central versi PDF, nilai sisa fisik masih dihitung `(item.physical_qty) * (item.materials?.price)`.
  - Berbeda dengan versi Excel yang sudah memakai `calculateIngredientCost`.
  - Akibatnya, laporan audit PDF ke Direktur/Investor menampilkan total aset bernilai fantastis dan bertolak belakang dengan angka di Excel.

---

## 3. Matriks Hubungan Antar-Modul (Traceability Matrix)

| Modul Asal | Masalah Konversi / Harga | Modul Terdampak | Bentuk Kesalahan |
|---|---|---|---|
| `costUtils.js` | Bypass `unit: pck/pcs` | `Recipes.jsx` | HPP Resep membengkak jutaan rupiah. |
| `costUtils.js` | Bypass `unit: pck/pcs` | `MenuPricing.jsx` | Simulasi margin minus ribuan persen. |
| `costUtils.js` | Bypass `unit: pck/pcs` | `PosUpload.jsx` | Theoretical usage tekor/lonjak drastis. |
| `UsageRecap.jsx` | `gapQty * a.price` | Popup Event Justification | Angka pengajuan selisih ke Direktur salah 1.000x lipat. |
| `SimplePrep.jsx` | `sQty * mat.price` | `materials.price` (Bahan Jadi) | HPP bahan olahan batching rusak permanen. |
| `upgradeModulesApi.js` | Kolom `name`/`total_cost` | `PricingCogsHub (Tab 3)` | Menu Engineering Matrix tidak bisa dibuka. |
| `reportGenerator.js` | Hitungan PDF manual | Laporan Cetak PDF | Selisih total valuasi aset antara Excel vs PDF. |

---

## 4. Kesimpulan & Rekomendasi Solusi Tunggal (Single Source of Truth)

Seluruh kekacauan di atas bersumber dari **ketiadaan fungsi penghitung harga satuan terkecil yang dipakai secara konsisten**:
1. Standarkan seluruh perhitungan biaya di seluruh aplikasi agar **WAJIB** melalui fungsi tunggal `calculateIngredientCost(material, qty, unit, unitConversionMap)` di `costUtils.js`.
2. Jangan biarkan ada satu baris kode pun yang melakukan perkalian manual `qty * material.price`.
3. Perbaiki skema query kolom di `upgradeModulesApi.js` agar Tab 3 Menu Engineering Matrix hidup kembali.
