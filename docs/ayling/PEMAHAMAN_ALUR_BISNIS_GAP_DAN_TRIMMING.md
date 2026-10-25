# Pemahaman Alur Bisnis Inti (Core Flow): Daily Inventory vs POS Upload (Variance GAP) & Trimming Yield

**Analisis**: Ayling & Izumi / Rafi  
**Prinsip Utama**: **F&B Reconciliation Triangle (Fisik Riil vs Kasir Teoretis vs Yield Olahan)**  
**Status**: CONFIRMED & ALIGNED  

---

## 1. Segitiga Rekonsiliasi F&B (The Core Reconciliation)

```
        +-------------------------------------------------------+
        |                 1. TRANSAKSI POS ESB                  |
        |  "Apa yang terjual di meja kasir?"                   |
        |  Contoh: 50 Americano Ice terjual                     |
        +-------------------------------------------------------+
                                   |
                     BOM Resep (20gr / porsi)
                                   v
        +-------------------------------------------------------+
        |             2. THEORETICAL USAGE (ESB)                |
        |  "Berapa bahan baku yang SEHARUSNYA habis?"          |
        |  Hitungan Teori: 50 x 20gr = 1.000 gr Kopi           |
        +-------------------------------------------------------+
                                   |
                             DIKOMPARASIKAN
                                   |
                                   v
        +-------------------------------------------------------+
        |             3. ACTUAL USAGE (DAILY EOD)               |
        |  "Berapa bahan baku yang NYATA-NYATA berkurang?"      |
        |  Hitungan Fisik: Sisa Awal - Sisa Akhir Closing      |
        |  Fisik Riil Barista: 1.250 gr Kopi terpakai          |
        +-------------------------------------------------------+
                                   |
                                   v
        +=======================================================+
        |            VARIANCE GAP = 250 gr (BOCOR / OVER)       |
        |  1. Over-portioning (barista bikin double shot/kebanyakan)
        |  2. Spillage / Tumpah tanpa difoto di Waste Logs      |
        |  3. Freebies / Minum karyawan tidak di-input kasir   |
        +=======================================================+
```

---

## 2. Alur 1: Daily Inventory EOD vs POS Upload (Deteksi GAP)

1. **Daily Inventory (Closing Fisik Malam Hari)**:
   - Barista setiap malam menghitung sisa bahan di bar meja kerja.
   - Sisa botol utuh (`FULL`) dihitung sistem, botol terbuka (`BROKEN`) ditimbang barista.
   - **Tujuan Operasional**:
     - Mengetahui sisa stok fisik riil untuk persiapan (*prep/par stock*) operasional esok hari.
     - Menghitung **Pemakaian Aktual Riil (Actual Stock Depletion)**.
2. **POS Upload (Penjualan Kasir ESB)**:
   - Kasir melayani transaksi tamu. File penjualan di-upload ke sistem.
   - Melalui Bill of Materials (BOM Resep), sistem menghitung **Pemakaian Teoretis (Expected Usage)**.
3. **GAP Analysis (Variance di Cost Control)**:
   $$\text{Variance GAP} = \text{Pemakaian Fisik (Daily EOD)} - \text{Pemakaian Teoretis (POS BOM)}$$
   - **GAP > 0 (Over-consumption / Pemborosan)**: Barista memakai bahan lebih banyak dari resep standar (misal porsi sirup kemanisan, kopi tumpah, atau free drinks).
   - **GAP < 0 (Under-portioning)**: Barista takaran kurang (kopi terlalu encer, komplain tamu).
   - **GAP = 0 (Presisi Sempurna)**: Racikan barista 100% disiplin sesuai resep.

---

## 3. Alur 2: Trimming & Olah Bahan Mentah (Yield & Rendemen)

Di modul **`SimplePrep.jsx` (Olah Bahan Mentah)**:
1. **Masalah Operasional**:
   - Bahan mentah dibeli kotor (misal 5 kg Jeruk Pontianak atau Buah Lemon).
   - Buah dikupas, diperas menjadi *Lemon Juice / Fresh Orange Juice* untuk resep bar.
2. **Hitungan Matematis Rendemen (Yield %)**:
   $$\text{Yield \%} = \frac{\text{Berat Bersih Siap Pakai (Target Qty)}}{\text{Berat Kotor Dibeli (Source Qty)}} \times 100\%$$
   $$\text{Waste \% (Susut Kulit/Biji)} = 100\% - \text{Yield \%}$$
3. **Perhitungan HPP Baru Bahan Olahan**:
   - Jika beli 5 kg Jeruk @ Rp 23.000 = Rp 115.000.
   - Kulit dan ampas terbuang 2 kg (Waste = 40%).
   - Hasil perasan air jeruk murni hanya 3 Liter (Yield = 60%).
   - **HPP Air Jeruk Sebenarnya**:
     $$\text{HPP Air Jeruk} = \frac{\text{Rp 115.000}}{3\ \text{Liter}} = \mathbf{Rp\ 38.333\ /\ \text{Liter}}$$
     (Bukan lagi Rp 23.000! Jika resep mengira modalnya Rp 23.000, margin resto akan bocor).

---

## 4. Dua Pertanyaan Penting untuk Mempertajam Sistem

Untuk memastikan visualisasi dan analitiknya nanti 100% sesuai kebutuhan Rafi:

1. **Frekuensi Analisis GAP**:
   Apakah Rafi dan Owner Umatis ingin melihat perbandingan GAP (Fisik EOD vs POS Teoretis) ini **setiap hari (Daily Variance)** atau **diakumulasi mingguan/bulanan di halaman Cost Control**?
2. **Toleransi Standar Industri**:
   Apakah di Umatis BSD ada batas ambang toleransi variansi yang dianggap wajar (misalnya selisih $\le 3\%$ atau $\le 5\%$ masih dianggap toleransi tumpah/busa susu, sedangkan $> 5\%$ diberi tanda merah/peringatan)?
