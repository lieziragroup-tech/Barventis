# Dokumentasi Rilis Final Barventis v5.7 (Unified Olah Bahan, Clean Copy & Adaptive Sidebar Spotlight Tour)

**Tanggal Rilis:** 27 November 2026  
**Tim Pelaksana:** Nia (UI/UX Minimalist Lead), Ayling (Arsitektur & Spotlight Engine), Izumi (Clean Copy & Dokumentasi), Kei (AST & White-Box QA/QC)  
**Target Repositori:** `github.com/lieziragroup-tech/Barventis` (`barventis-v2.vercel.app`)

## 1. Ringkasan Pembaruan Utama v5.7

| Pilar Pembaruan | Perubahan yang Diterapkan | Berkas Terkait |
| :--- | :--- | :--- |
| **1. Penyatuan `Olah Bahan` + `Cutting Portion`** | Menghapus 2 sub-tab ganda dan tombol contoh dummy; seluruh proses pengolahan bahan dan pemecahan stok (seperti 1 bahan induk menjadi 2+ bahan turunan) kini menyatu dalam 1 formulir bersih. Mendukung **multi-output dinamis (`+ Tambah Hasil Olahan`)** dengan **satuan bebas** (`kg`, `gr`, `L`, `ml`, `pcs`, `porsi`, `btl`, `pack`, atau kustom), tombol cepat **`Tanpa Ampas (0 Waste)`** yang menyembunyikan foto ampas saat waste = 0, serta unggah foto bahan mentah & hasil bersih non-blocking (bisa diunggah dari galeri setelah proses selesai). | `src/pages/shared/SimplePrep.jsx` |
| **2. Bahasa Sehari-hari & Anti-AI-Slop** | Menghapus kata teknis `"kartu"` di Dashboard Owner (`Dashboard.jsx`) serta judul `Olah Bahan` duplikat, diganti bahasa operasional yang lugas, ringkas, dan tenang. | `src/pages/shared/Dashboard.jsx`, `src/pages/shared/SimplePrep.jsx` |
| **3. Sidebar Spotlight Tour (Border Putih) + Tablet Locked Sidebar** | Menambahkan atribut `data-tour="nav-<slug>"` pada seluruh item sidebar dan `data-tour="mob-<slug>"` pada Bottom Navigation HP. Pada **Desktop (`>=1024px`)** dan **Tablet (`768px–1023px`, sidebar otomatis terkunci 244px)**, border putih Tur Panduan menyorot langsung segmen menu di sidebar sambil membuka halaman fiturnya. Pada **HP (`<768px`)**, sorotan berpindah adaptif ke ikon Bottom Navigation. Cakupan panduan diperluas ke **100% fitur tiap role** (`Owner` 9 langkah, `Head Bar` 8 langkah, `Barista` 6 langkah, `Purchasing` 4 langkah, `Central` 4 langkah). | `src/components/AppLayout.jsx`, `src/components/RoleSpotlightGuide.jsx`, `src/config/roleSpotlightSteps.js` |

## 2. Verifikasi QA/QC v5.7 (Kei)

- **Parse AST Babel (`@babel/parser`):** **134 / 134 berkas JS/JSX PASS (0 error sintaks)**.
- **Spotlight Coverage Test (Node.js):** Semua 5 role terverifikasi memiliki langkah lengkap dengan `navTarget` valid (Owner: 9, Head Bar: 8, Barista: 6, Purchasing: 4, Central: 4) dan 0 kebocoran nama klien.
- **Unified `Olah Bahan` Gate:** 0 sub-tab `Urgent Cutting Portion` terpisah, multi-output `extraOutputs` aktif, kondisional `Waste = 0` menyembunyikan unggah foto ampas, dan privasi harga `Barista` tetap aktif.
- **Responsive Sidebar Gate:** Breakpoint Tablet (`768px–1023px`) mengunci sidebar secara otomatis (`isTabletViewport` + `md:block`), dan `AppLayout.jsx` TDZ ordering aman.
