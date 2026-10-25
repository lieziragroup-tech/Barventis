# Proposal & Analisis Bisnis: Valuasi & Penawaran Harga Sistem Barventis ERP ke Owner Umatis Resto

**Konsultan**: Ayling & Izumi / Tim Freelance Engineering  
**Klien Target**: Owner & Manajemen PT Asta Boga Nusantara (Umatis Resto BSD & Kasuna Menara Astra)  
**Status**: DRAFT PROPOSAL & VALUASI BISNIS (Siap Dipresentasikan)  

---

## 1. Analisis Nilai Tambah Bisnis (Value Proposition & ROI)

Mengapa Owner Umatis mau membayar mahal untuk sistem ini? Berdasarkan audit operasional Agustus 2026:
1. **Penyelamatan Kebocoran HPP (Shrinkage Prevention)**:
   - Pada lembar Excel lama ditemukan variansi pemakaian tak tercatat sebesar **Rp 2.084.876/bulan** di satu outlet bar.
   - Dengan sistem *Photo Evidence Waste*, validasi timbangan *Broken*, dan kontrol *FEFO*, kebocoran stok berkurang drastis $\ge 80\%$.
   - **Penghematan Langsung**: Minimal **Rp 25.000.000 – Rp 40.000.000 / tahun** per cabang.
2. **Eliminasi Human Error 8.208 Formula Manual**:
   - Menghilangkan risiko formula rusak (seperti sel `O153` di sheet `COST CONTROL` yang menghasilkan biaya 0%).
   - Barista menghemat 1–1.5 jam setiap malam saat closing shift (fokus pelayanan tamu, bukan lembur ketik Excel).
3. **Multi-Cabang Real-Time Monitoring**:
   - Owner dapat memantau stok dan HPP konsolidasi Umatis BSD dan Kasuna Menara Astra dari HP kapan saja tanpa menunggu rekap bulanan staf yang telat 1–2 minggu.

---

## 2. Struktur Model Penawaran Harga (Pricing Model Options)

Terdapat 2 opsi strategi harga yang lazim dan sangat menguntungkan:

### OPSI A: Software As A Service (SaaS Subscription Bulanan / Tahunan) — *Rekomendasi untuk Cashflow Jangka Panjang*
- **Biaya Implementasi & Setup Awal (One-Time Onboarding Fee)**:
  - **Rp 15.000.000 – Rp 20.000.000**
  - *Mencakup*: Migrasi data 13 Sheet Excel (Bahan, Resep, Saldo Awal, Supplier), setup database cloud Supabase, konfigurasi domain, pelatihan staf Barista & Supervisor, masa pendampingan 1 bulan pertama.
- **Biaya Langganan Sistem (Subscription Maintenance & Cloud)**:
  - **Rp 1.500.000 – Rp 2.500.000 / cabang / bulan**.
  - Untuk 2 Cabang (Umatis BSD + Kasuna Menara Astra):
    $$\text{Total Bulanan} = \mathbf{Rp\ 3.500.000\ –\ Rp\ 4.500.000\ /\ \text{bulan}}$$
  - *Mencakup*: Maintenance server Supabase, update fitur minor, backup database berkala, bantuan teknis via WhatsApp.

### OPSI B: Sistem Jual Putus / Custom ERP Enterprise (One-Time Purchase + Retainer) — *Rekomendasi jika Owner ingin Bayar Penuh*
- **Harga Lisensi Software & Custom Development**:
  - **Rp 45.000.000 – Rp 65.000.000** (Full Ownership / Self-Hosted per Tenant).
  - *Mencakup*: Hak pakai sistem penuh untuk Umatis BSD & Kasuna, penyesuaian alur khusus, instalasi database, panduan operasional.
- **SLA Maintenance Retainer (Opsional, mulai bulan ke-4)**:
  - **Rp 1.500.000 – Rp 2.000.000 / bulan** untuk server maintenance, security patch, dan bug support.

---

## 3. Strategi Presentasi ke Owner ("The Pitch")

1. **Tunjukkan Masalah Nyata di Excel Mereka**:
   - Tunjukkan sel `O153` dan `B20` di berkas `SO BARISTA AGUSTUS 2026.xlsx` yang bernilai 0% karena salah formula, serta selisih Rp 2 juta pemakaian yang tidak jelas lari ke mana.
2. **Demokan Solusi Barventis**:
   - Buka form Daily Inventory: tunjukkan bagaimana barista cukup input timbangan botol terbuka (`BROKEN`), sementara botol utuh (`FULL`) dihitung matematis oleh sistem.
   - Tunjukkan fitur *Photo Evidence Waste* (kamera foto tumpahan/basi) yang mencegah manipulasi angka.
   - Tunjukkan dashboard Cost Control yang menampilkan rasio 22,56% secara otomatis dari data kasir POS ESB.
3. **Tawarkan Masa Trial / Pilot Project**:
   - "Bapak/Ibu, mari kita jalankan paralel di Umatis BSD selama 1–2 minggu. Jika terbukti closing lebih cepat dan tidak ada data selisih yang bocor, baru kita finalisasi kontrak."
