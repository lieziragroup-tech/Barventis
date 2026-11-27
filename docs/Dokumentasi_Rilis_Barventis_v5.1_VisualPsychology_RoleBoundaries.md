# Dokumentasi Rilis Barventis v5.1 (Visual Psychology Dashboard & Strict Role Boundaries)

**Tanggal Rilis:** 26 November 2026  
**Cakupan Tim:** Nia (Visual Psychology & Design System), Ayling (Pemisahan Role Boundaries & Data Filtering), Kei (QA/QC & White-Box Testing), Izumi (Dokumentasi Rilis)  
**Target Repositori:** `github.com/lieziragroup-tech/Barventis` (`barventis-v2.vercel.app`)

## 1. Ringkasan Pembaruan Utama

Rilis **Barventis v5.1** menata ulang tampilan dashboard seluruh role menggunakan prinsip **Ilmu Psikologi Mata dan Desain** sekaligus menutup seluruh kebocoran batas data antar-role (*strict role boundaries*) agar informasi sensitif (nilai finansial, omzet, rasio biaya, dan PO cabang lain) tidak pernah terlihat oleh role yang tidak berwenang.

## 2. Penerapan Ilmu Psikologi Mata & Design (Nia)

1. **F-Pattern & Focal Action Banner (`DashboardPrimitives.jsx`):** Setiap dashboard dibuka dengan satu zona fokus utama di kiri atas dengan garis aksen semantik 4px (hijau aman, kuning perlu perhatian, merah kritis) yang merangkum kondisi paling mendesak dalam satu kalimat beserta **1 tombol aksi primer** untuk mengurangi kelelahan memilih (*Hick's Law*).
2. **Pre-Attentive Status Cues (`StatusPill`):** Mengganti teks status mentah (`REQUESTED`, `CANCELLED`) menjadi lencana pil lembut dengan titik warna semantik agar mata menangkap status dalam hitungan milidetik.
3. **Calm Surface & Tabular Numerals (`CalmKpiCard`):** Menggunakan permukaan netral yang tenang (aturan 60-30-10), angka rata kolom (`tabular-nums`), dan pembersihan angka desimal nol (`formatCleanQty`: `3.0` menjadi `3`, `134.0` menjadi `134`).
4. **Gestalt Grouping & Mobile-First Touch Targets:** Memisahkan secara tegas blok filter periode, zona fokus, ringkasan 2–4 kartu KPI, dan panel detail berdampingan dengan tinggi tombol minimal 44px–56px untuk penggunaan lapangan lewat ponsel.

## 3. Matriks Pemisahan Role Boundaries (Ayling)

| Role | Cakupan Dashboard & Modul PO | Data Sensitif yang Diblokir 100% |
| :--- | :--- | :--- |
| **Owner / Admin** | Ringkasan eksekutif, Rasio Biaya F&B vs target 27%, Total Penjualan, Nilai Stok, perbandingan Cabang Aktif vs Semua Cabang. | Tidak ada (akses penuh tingkat perusahaan). |
| **Purchasing** | Antrean PO menunggu verifikasi (`Requested`/`On Review`), total nilai pengadaan bulanan, komparasi harga supplier, dan daftar PO lengkap. | Omzet penjualan cabang, rasio HPP/COGS cabang, dan analitik performa cabang. |
| **Central** | **Khusus PO tujuan `CENTRAL`** (`location === 'CENTRAL'`), mutasi barang yang melibatkan Gudang Central (Central <-> Cabang), penerimaan qty Central, dan stok kritis Gudang Central. Badge topbar menampilkan **Gudang Central**. | **Seluruh PO tujuan `RESTO`/cabang** (diblokir di `Dashboard.jsx`, `Invoicing.jsx`, dan `api.js`), mutasi antar-cabang non-Central, serta seluruh nominal finansial (Rp). |
| **Head Bar** | Operasional khusus cabang sendiri: stok kritis Bar (`qty_resto`), SKU aktif Bar, mutasi masuk cabang, status PO cabang sendiri, dan pintasan Opname Gelas/Alat, Urgent Cutting Portion, serta Berita Acara. | Seluruh nilai finansial (Rp), omzet penjualan, rasio biaya perusahaan, PO Central, dan data cabang lain. |
| **Rekan Bar / Barista** | Tampilan shift tenang (3 kartu tugas utama: Input Stok Harian, Urgent Cutting Portion, Catat Pecah/Waste), penghitung bahan menipis, pengiriman masuk, dan daftar bahan kritis fisik. | Seluruh nilai finansial (Rp), harga PO (field `total` dihapus di utilitas filter), modul keuangan, dan data cabang lain. |

## 4. Hasil Verifikasi QA/QC (Kei)

| Pengujian | Status | Hasil |
| :--- | :--- | :--- |
| McCabe Cyclomatic Complexity (`src/`) | **PASS** | 151 berkas, 66.099 LOC, 761 fungsi, rata-rata $V(G) = 14,55$ (552 fungsi / 72,5% Low Risk); kompleksitas `Dashboard.jsx` turun dari `295` menjadi `275`. |
| Audit Zero Financial Leak (`RoleOperationalDashboards.jsx`) | **PASS (0)** | Nol pemanggilan `formatIDR()` pada dashboard Central, Head Bar, dan Rekan Bar; kolom `Total Nilai` dan KPI `Total Belanja` pada `Invoicing.jsx` disembunyikan dari non-Owner/Purchasing. |
| Urutan Deklarasi TDZ (`AppLayout.jsx`) | **PASS** | Seluruh urutan `basePath`, `sidebarGroups`, `urgentRecap`, dan `isSidebarExpanded` terverifikasi aman. |
| Live Node.js White-Box Role-Boundary Tests | **PASS (7/7)** | Seluruh 7 uji batas role (`RB-1` s.d. `RB-7`: pemetaan 5 role, larangan finansial Central/Head Bar/Rekan Bar, blokir 100% PO `RESTO` pada Central, isolasi PO cabang Head Bar, sanitasi `total` pada Rekan Bar, blokir mutasi non-Central, dan `formatCleanQty`/`StatusPill`) lulus penuh. |

## 5. Artefak Rilis

1. `Barventis-main-v5.1-deployment-ready.zip` — Paket kode sumber final Barventis v5.1 siap push ke GitHub dan deploy ke Vercel.
2. `Dokumentasi_Rilis_Barventis_v5.1_VisualPsychology_RoleBoundaries.md` — Dokumen rilis, matriks boundaries antar-role, dan laporan QA/QC v5.1.
