# Dokumentasi Arsitektur: Klasifikasi Raw Data Transaksi POS vs Raw Materials (Trimming Bahan Mentah)

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Status**: DOCUMENTED & COMMITTED TO MAIN  
**Dokumen Standar**: `agent_lean_prompt_v2.md` & `skills/barventis-architect/SKILL.md`  

---

## 1. Pemisahan Dua Konsep "Raw" dalam Ekosistem Barventis ERP

Untuk menghindari kerancuan istilah operasional antara data digital kasir dengan bahan baku fisik dapur/bar:

```
+----------------------------------------------------------------------------------------------------+
|                                    KLASIFIKASI "RAW" DI BARVENTIS                                   |
+--------------------------------------------------+-------------------------------------------------+
| 1. RAW DATA PENJUALAN KASIR (Digital Data)       | 2. RAW MATERIALS / BAHAN MENTAH (Fisik Resto)  |
+--------------------------------------------------+-------------------------------------------------+
| • Asal: File ekspor mesin POS ESB                | • Asal: Pengadaan pasar / supplier buah segar   |
| • Lokasi di App: Sub-tab "Data Mentah (Viewer)"  | • Lokasi di App: Master Marketlist & SimplePrep |
|   di dalam halaman Penjualan Beverage (/penjualan)| • Kategori Resmi: "Bahan Mentah / Raw Material"|
| • Fungsi: Memeriksa baris per baris transaksi    | • Alur: Diproses di menu "Olah Bahan Mentah"    |
|   sebelum memicu pemotongan teoretis (BOM).      |   menjadi bahan olahan siap racik (Yield/Susut).|
+--------------------------------------------------+-------------------------------------------------+
```

---

## 2. Alur 1: Raw Data Transaksi Penjualan POS (Integrated Viewer)

- **Mengapa Disatukan di Halaman Upload?**
  Melihat data mentah kasir adalah proses verifikasi (*preview / validation step*) saat staf mengunggah berkas harian/bulanan. Meletakkannya di sub-tab dalam halaman upload menjaga navigasi sidebar tetap ramping (*zero clutter*) tanpa menu tambahan yang redundan.
- **Fitur di Dalam Tab**:
  1. *Tanggal Sales*: Tanggal transaksi per baris.
  2. *Menu Name & Menu Code*: Nama menu kasir dan kode PLU.
  3. *Qty & Total (Rp)*: Kuantitas terjual dan nominal rupiah.
  4. *Audit Hash*: Validasi duplikasi file agar omset tidak terhitung ganda.

---

## 3. Alur 2: Raw Materials / Bahan Mentah & Trimming (SimplePrep)

- **Katalog Terpisah dalam Master Materials**:
  Bahan mentah tidak bercampur aduk dengan minuman botol atau sirup. Di halaman `Marketlist.jsx`, bahan diklasifikasikan di bawah kategori resmi `Bahan Mentah / Raw Material`:
  - Jeruk Pontianak (kg)
  - Buah Lemon Segar (kg)
  - Jahe / Rempah Mentah (kg)
- **Konversi Trimming & HPP Dinamis**:
  1. Bahan mentah kotor dipotong/diperas di modul `SimplePrep.jsx` (*Olah Bahan Mentah*).
  2. Sistem menghitung:
     $$\text{Yield (Rendemen) \%} = \frac{\text{Berat Bersih Siap Pakai}}{\text{Berat Kotor}} \times 100\%$$
     $$\text{Waste (Kulit/Biji) \%} = 100\% - \text{Yield \%}$$
  3. HPP bahan jadi secara otomatis disesuaikan (naik proporsional terhadap sampah kulit yang terbuang).
  4. Stok bahan mentah terpotong, dan stok bahan siap pakai bertambah di bar meja kerja.
