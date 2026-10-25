# Skema Harga SaaS Ramah UMKM / F&B & Branding Lieziragroup (Barventis ERP)

**Perusahaan Pengembang**: **Lieziragroup** (Rafi)  
**Klien Mitra**: PT Asta Boga Nusantara (Umatis Resto BSD & Kasuna Menara Astra)  
**Model Bisnis**: **Ultra-Lean SaaS Subscription (Kontrak 12 Bulan, Tagihan Bulanan Ringan)**  
**Watermark Resmi**: *"Powered by Lieziragroup"* / *"Developed by Lieziragroup"*  
**Status**: DRAFT PROPOSAL STRATEGIS  

---

## 1. Analisis Biaya Operasional Riil (Infrastruktur Ultra-Lean)

Mengapa kita bisa menjual murah namun margin profit Lieziragroup tetap sangat sehat?
1. **Hosting Frontend (Vercel / Cloudflare Pages)**: Biaya **Rp 0 / bulan** (Free tier sangat cepat dan stabil).
2. **Database & Auth (Supabase Cloud)**:
   - Free Tier: Menampung hingga 500 MB data (cukup untuk ribuan transaksi inventaris selama berbulan-bulan).
   - Pro Tier (jika kelak data transaksi sudah jutaan): ~$25 / bulan (hanya ~Rp 400.000).
3. **Penyimpanan Gambar Bukti Limbah (WebP Compressed)**:
   - Foto limbah otomatis dikompresi ke WebP berukuran kecil (< 80 KB per foto), menghemat storage 90%.
4. **Estimasi Cost Bulanan Lieziragroup**: **< Rp 100.000 – Rp 400.000 / bulan**.

---

## 2. Struktur Harga Penyesuaian (Murah, Masuk Akal, dan Menguntungkan)

Dengan *cost* infrastruktur yang minim, kita bisa menawarkan harga yang sangat manis (*sweet spot*) bagi owner restoran:

### Opsi Rekomendasi: Paket Kemitraan Khusus (Early Adopter Partner)

| Komponen | Penawaran Awal (Kemahalan) | **Skema Baru yang Disesuaikan (Lieziragroup)** | Margin Profit Lieziragroup |
|---|:---:|:---:|:---:|
| **Biaya Setup & Onboarding** *(One-Time)* | ~~Rp 10.000.000~~ | **Rp 2.500.000 – Rp 3.500.000** *(sekali di awal)* | ~95% Margin (Modal jasa & migrasi data) |
| **Langganan per Cabang** *(Per Bulan)* | ~~Rp 1.750.000~~ | **Rp 450.000 – Rp 650.000** / cabang / bulan | ~90% Margin bersih |
| **Paket Bundling 2 Cabang (Umatis + Kasuna)** | ~~Rp 3.500.000~~ | **Rp 950.000 – Rp 1.250.000 / bulan** | Arus kas bersih masuk rutin ke Lieziragroup |

> **Catatan Finansial**:
> - Di angka **Rp 1.000.000 / bulan** untuk 2 outlet (hanya setara ~Rp 33.000 / hari, seharga 1 gelas kopi), Owner Umatis **hampir mustahil menolak** karena nilainya jauh lebih murah dibanding menyewa admin tambahan atau risiko selisih stok jutaan rupiah di bar.
> - Bagi Lieziragroup, kontrak 1 tahun bernilai **Rp 12.000.000 – Rp 15.000.000 / tahun** dengan beban cloud mendekati nol.

---

## 3. Strategi Branding: Watermark "Powered by Lieziragroup"

Penetapan harga murah ini memiliki kompensasi strategis: **Hak Branding Penuh**. Sistem akan memuat identitas Lieziragroup sebagai portofolio resmi:

1. **Footer Navigasi & Sidebar**:
   - Di bagian bawah sidebar `AppLayout.jsx`:
     `"BARVENTIS v2.1 • Powered by Lieziragroup"`
2. **Kop & Catatan Kaki Laporan PDF / Cetak**:
   - Pada `PrintReportFooter.jsx` dan hasil ekspor PDF Cost Control/Daily Inventory:
     `"Barventis ERP — Engineered & Maintained by Lieziragroup (www.lieziragroup.com)"`
3. **Layar Login & Auth**:
   - Di bawah kartu login `AuthScreen.jsx`:
     `"A Product of Lieziragroup Tech Ecosystem"`

*Manfaat*: Setiap supervisor, barista, auditor, dan owner lain yang bertamu ke Umatis atau melihat laporan PDF mereka akan langsung mengenal brand **Lieziragroup**.

---

## 4. Cara Penyampaian ke Owner ("The Gentle Pitch")

> *"Bapak/Ibu, karena Umatis dan Kasuna adalah mitra strategis pertama kami, saya dari **Lieziragroup** memberikan harga khusus mitra perintis:*  
> - *Setup awal & input data lengkap 13 sheet lama: **Rp 2,5 Juta** (sekali saja).*  
> - *Langganan bulanan kontrak 1 tahun: **Rp 950.000 / bulan untuk KEDUA cabang sekaligus** (BSD & Menara Astra).*  
>  
> *Sebagai gantinya, kami menyematkan watermark resmi 'Powered by Lieziragroup' di sistem dan laporan cetak sebagai portofolio teknologi kami. Dengan biaya Rp 30 ribuan per hari, seluruh stok bar, waste foto, dan HPP kedua resto Bapak/Ibu sudah terpantau rapi dari HP tanpa pusing rumus Excel rusak."*
