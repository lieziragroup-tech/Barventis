# Model Bisnis SaaS B2B: Annual Contract with Monthly Billing (Barventis ERP)

**Author**: Ayling (Lead Autonomous Orchestrator) & Izumi (Architect) / Rafi  
**Target Klien**: PT Asta Boga Nusantara (Umatis Resto BSD & Kasuna Menara Astra)  
**Model**: **SaaS Subscription Kontrak 12 Bulan (Tagihan Bulanan)**  
**Status**: APPROVED BUSINESS PLANNING  

---

## 1. Keunggulan Strategis Model Kontrak 1 Tahun (Bayar Bulanan)

1. **Komunikasi Rutin & Membangun Kepercayaan (Relationship Building)**:
   - Tagihan bulanan membuka ruang evaluasi berkala (*Monthly Business Review* singkat): membahas laporan HPP, performa variansi stok, dan kendala barista di lapangan.
   - Klien merasa didampingi secara profesional, bukan "ditinggal pergi setelah beli putus".
2. **Kepastian Pendapatan (Predictable Monthly Recurring Revenue / MRR)**:
   - Kontrak 1 tahun mengikat komitmen kedua belah pihak. Klien mendapatkan stabilitas sistem dan support prioritas, sedangkan Rafi memiliki kepastian arus kas (*cashflow* terjamin selama 12 bulan).
3. **Barrier to Entry Rendah untuk Klien**:
   - Owner restoran tidak terbebani *capital expenditure* (capex) besar di depan (Rp 50jt+), melainkan masuk sebagai biaya operasional bulanan (*opex*) yang sangat terjangkau dibanding omset mereka (omset minuman Umatis saja mencapai ~Rp 148 Juta/bulan).

---

## 2. Struktur Paket Penawaran Resmi

### A. Biaya Onboarding & Migrasi Data (Bulan ke-1 / Dimuka)
- **Komponen**: 
  - Migrasi data historis 13 Sheet Excel (128 Bahan, 54 Resep BOM, Saldo Awal, 48 Vendor).
  - Setup multi-cabang (Umatis BSD & Kasuna Astra) di database cloud Supabase.
  - Sesi pelatihan teknis untuk Barista, Supervisor, dan Admin Owner (1–2 hari).
  - Pendampingan intensif closing EOD pada minggu pertama go-live.
- **Biaya**: **Rp 7.500.000 – Rp 10.000.000** *(One-time onboarding fee)*.

### B. Biaya Langganan Bulanan (SaaS Retainer — Kontrak 12 Bulan)
- **Harga per Cabang**: **Rp 1.750.000 / cabang / bulan**.
- **Paket Bundling 2 Cabang (Umatis BSD + Kasuna Menara Astra)**:
  $$\mathbf{Rp\ 3.000.000\ –\ Rp\ 3.500.000\ /\ \text{bulan}}$$
  *(Total nilai kontrak 1 tahun: Rp 36.000.000 – Rp 42.000.000)*.

### C. Hak & Layanan yang Diterima Klien Setiap Bulan
1. **Akses Penuh Sistem Cloud 24/7**:
   - Modul Daily EOD, Foto Limbah WebP, Transfer Stok Central-Resto, Parser POS ESB, dan Dashboard HPP Cost Control.
2. **Dedicated Tech Support (WhatsApp & Remote)**:
   - Respon cepat jika barista mengalami kendala input closing malam hari.
3. **Database Health Check & Auto-Backup**:
   - Pemeliharaan integritas database PostgreSQL, backup mingguan otomatis, dan update keamanan.
4. **Sesi Evaluasi Bulanan (Monthly Review)**:
   - Ringkasan performa biaya bahan baku: apakah rasio HPP berhasil ditekan mendekati target $\le 27\%$.

---

## 3. Strategi Komunikasi ("Script Negosiasi ke Owner")

> *"Bapak/Ibu, sistem ini saya rancang sebagai layanan kemitraan berkelanjutan (SaaS) dengan **kontrak kerjasama 1 tahun**. Pembayarannya dilakukan **rutin setiap bulan** (Rp 3.500.000 untuk kedua outlet BSD dan Astra).*  
>  
> *Tujuan sistem bulanan ini adalah agar saya dan tim bisa terus memantau, mendampingi staf bar di awal implementasi, memastikan database selalu aman, serta mengevaluasi laporan HPP setiap bulan bersama manajemen. Jika dibandingkan kebocoran bahan atau selisih stok manual di bar yang mencapai Rp 2–3 juta per bulan, investasi sistem ini langsung terbayar (ROI positif) sejak bulan pertama."*

---

## 4. Ketentuan Kontrak (Term Sheet Sederhana)
1. **Durasi**: 12 Bulan kalender terhitung sejak tanggal *Go-Live*.
2. **Metode Pembayaran**: Invoice diterbitkan setiap tanggal 25 untuk operasional bulan berjalan/berikutnya (Jatuh tempo 7 hari).
3. **Kepemilikan Data**: 100% data transaksi, resep, dan inventaris adalah milik penuh PT Asta Boga Nusantara dan dapat diekspor kapan saja.
4. **Perpanjangan**: Otomatis diperpanjang untuk tahun ke-2 dengan notifikasi 30 hari sebelumnya.
