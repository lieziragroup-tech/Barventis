# Dokumentasi Rilis & Laporan White-Box Cyclomatic Complexity Barventis v4.5

**Proyek:** Barventis (Resto Umatis — BSD, Kasuna & Central)  
**Tanggal:** 24 November 2026  
**Tim Kolaborasi:** Ayling (Implementasi & Arsitektur), Kei (White-Box QA & Cyclomatic Complexity), Izumi (Dokumentasi & Keterlacakan)

## 1. Ringkasan Fitur & Perbaikan v4.5

1. **Bulk Import & Export Gelas & Alat Bar (`SoGlassAndTool.jsx`):**
   - Mendukung **Download Template Excel**, **Import Massal (Excel/CSV)** untuk upsert daftar gelas & alat per cabang aktif, serta **Export Excel** (2 sheet: Stok Gelas & Alat + Catatan Pecah) dan **Export PDF** (otomatis memuat Foto Validasi Umatis).
2. **Bahasa Singkat, Humanis & Bebas AI-Slop / Em-Dash:**
   - Seluruh label sub-menu kepanjangan diringkas agar langsung jelas: **`Urgent Cutting Portion`**, **`Olah Bahan`**, **`Rekap Tgl 1-31`**, **`Petty Cash & Tempo`**, **`Acuan Stok Bulanan`**, **`Stok Gelas & Alat`**, **`Catat Pecah`**.
   - Karakter em-dash (`—`) pada judul/sub-menu utama dibersihkan.
3. **Icon Sidebar Semantik (`sidebarMenuConfig.js`):**
   - Menyesuaikan icon Lucide dengan fungsi nyata tiap menu: `GlassWater` (Gelas & Alat Bar), `FileCheck2` (Berita Acara), `Truck` (Mutasi Gudang / Kirim ke Cabang), `BarChart3` (Cost Control), `BookOpen` (Menu & Resep), `ClipboardCheck` (Daily Inventory), `PackageCheck` (Stock Opname), dan `ShoppingBag` (PO).
4. **Modal Rekap Notifikasi Urgent H-2 (`UrgentRecapModal.jsx` + `urgentRecapUtils.js`):**
   - Terbuka otomatis **1 kali per sesi login** saat ada item urgent (menunggu Panduan Spotlight selesai terlebih dahulu agar tidak bertumpuk) dan bisa dibuka kembali kapan saja lewat tombol Lonceng.
   - Terpisah bersih menjadi 2 tab:
     - **Urgent Action:** PO mendekati jadwal kirim mulai **H-2**, H-1, Hari Ini, atau lewat jadwal; PO Central menunggu ACC Head Bar; Mutasi Gudang menunggu konfirmasi terima.
     - **Urgent Materials:** Bahan baku habis (`<= 0`) atau menipis di bawah batas stok minimum.
5. **Panduan Spotlight Interaktif dengan Animasi (`RoleSpotlightGuide.jsx`):**
   - Dilengkapi animasi *pulse highlight* pada area target yang disorot dan indikator progres langkah (*step-dots*) berbasis Framer Motion agar user baru langsung paham arah kliknya.

## 2. Hasil Audit McCabe Cyclomatic Complexity (Kei)

Total kode sumber produksi `src/`: **130 file**, **61.160 LOC**, **1.817 fungsi**, rata-rata **4,85 CC/fungsi**, dengan **88,3% (1.604 fungsi)** berada di zona **Low Risk (1–10)**.

| Modul v4.5 | LOC | File CC | Avg CC/Fungsi | Max Func CC | Kategori Risiko |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `src/config/sidebarMenuConfig.js` | 196 | 9 | 2,33 | 3 | **Low Risk** |
| `src/components/RoleSpotlightGuide.jsx` | 484 | 50 | 3,33 | 9 | **Low Risk** |
| `src/config/roleSpotlightSteps.js` | 506 | 22 | 4,50 | 12 | **Low–Moderate** |
| `src/services/modules/urgentRecapUtils.js` | 123 | 29 | 5,00 | 23 | **Low–Moderate** |
| `src/components/UrgentRecapModal.jsx` | 221 | 23 | 12,00 | 19 | **Moderate** |
| `src/pages/shared/SoGlassAndTool.jsx` | 934 | 172 | 8,43 | 36 | **Moderate–High** |
| `src/components/AppLayout.jsx` | 1.590 | 222 | 10,61 | 73 | Turun dari 169 (-56,8%) + **TDZ Check OK** |

## 3. Matriks Verifikasi White-Box Basis-Path Testing (Kei)

Dieksekusi langsung di Node.js v18.20.4 terhadap modul produksi nyata (`urgentRecapUtils.js` & `roleSpotlightSteps.js`):

| No | Jalur Uji (Basis Path) | Hasil |
| :---: | :--- | :---: |
| P1 | Konstanta ambang batas PO urgent tepat `2` hari (`H-2`) | **PASS** |
| P2 | Tanggal kosong atau tidak valid mengembalikan `isUrgent: false` | **PASS** |
| P3 | Jadwal kirim `H-3` diklasifikasikan `NORMAL` (tidak masuk modal urgent) | **PASS** |
| P4 | Jadwal kirim `H-2` diklasifikasikan `SOON` dengan badge `H-2 Kirim` | **PASS** |
| P5 | Jadwal kirim `Hari Ini` diklasifikasikan `TODAY` dengan badge `Kirim Hari Ini` | **PASS** |
| P6 | Jadwal kirim lewat tanggal diklasifikasikan `OVERDUE` dengan badge `Lewat 2 hari` | **PASS** |
| P7 | Pemisahan `Urgent Action` (PO H-2/Overdue + ACC Head Bar + Mutasi) vs `Urgent Materials` (Habis + Menipis) + urutan prioritas kritis di atas | **PASS** |
| P8 | Isolasi role: Rekan Bar tidak menerima item `ACC Head Bar` di `Urgent Action` | **PASS** |
| P9 | Seluruh 8 role Spotlight Guide memiliki topik dan langkah valid | **PASS** |

**Ringkasan White-Box Test:** `PASSED = 9`, `FAILED = 0` (**100% Lulus**) serta urutan inisialisasi variabel `AppLayout.jsx` diverifikasi bebas error TDZ (`basePath:244 < sidebarGroups:248 < urgentRecap:271`).
