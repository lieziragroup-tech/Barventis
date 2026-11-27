# Laporan Resmi Perbaikan Bugs, Optimasi Performa, & Sinkronisasi Geofencing — FieldWork App V2

**Tanggal Rilis & Audit:** 30 Oktober 2026  
**Auditor / Tim:** FieldWork Operations & Ayling Systems Engineering  
**Lingkup Pemeriksaan:**
1. Generator PDF Dokumen Penawaran (`src/shared/lib/quotationLetterPdf.ts`)
2. Layar Kamera Lapangan & Watermarking Canvas (`src/widgets/camera/CameraCaptureModal.tsx`)
3. Penugasan Kerja & Modal Formulir Mobile (`src/widgets/executor/CreateProjectModal.tsx`)
4. Virtual Keyboard Viewport Engine (`src/shared/hooks/useVirtualKeyboard.ts`)
5. Service Transaksi Laporan Kerja Lapangan (`src/shared/api/workReports.ts`)
6. Penomoran Surat Resmi Bersih Kategori (`AR` & `PCO`) tanpa kode `APR`

---

## 1. Perbaikan Cetakan PDF Penawaran (`quotationLetterPdf.ts`)

| No | Temuan Bug | Lokasi Kode | Akar Masalah (Root Cause) | Solusi yang Diterapkan | Status |
|:---:|:---|:---|:---|:---|:---:|
| **1.1** | Teks kontak bertumpuk di bagian PENUTUP (Halaman 3). | `quotationLetterPdf.ts:261, 749` | Lebar label dipatok statis `labelW: 32mm`, padahal nama akun demo (*Rafi — Master All-Role...*) memiliki lebar ~62mm sehingga titik dua `:` menimpa teks. | • Diterapkan fungsi `cleanPersonDisplayName()` untuk memangkas embel-embel jabatan internal.<br>• Kolom label dihitung otomatis (*auto-fit*) dengan `getTextWidth()` teks terpanjang. | **RESOLVED** |
| **1.2** | Tag HTML `<i>Trapping</i>` dan `<i>Baiting</i>` tercetak mentah pada Halaman 2. | `quotationLetterPdf.ts:270, 819` | Kolom label kiri pada `private kv()` digambar dengan `doc.text(k)` mentah tanpa parser tag HTML. | Kolom label kiri kini dirender via `this.rich(k, ...)` sehingga tag `<i>`, `<b>`, dan `<u>` langsung diubah menjadi font miring/tebal resmi. | **RESOLVED** |
| **1.3** | Kata menyatu tanpa spasi setelah teks miring (*"Glue Trappinguntuk..."*). | `quotationLetterPdf.ts:191-234` | Font Helvetica Italic pada jsPDF memiliki kemiringan tepi (*italic overhang* ~0.65mm) yang membuat kata tegak berikutnya menempel. | Ditambahkan kompensasi jarak (*kerning compensation*) sebesar `+0.65mm` pada transisi dari token italic ke token normal. | **RESOLVED** |
| **1.4** | Baris baru (`\n`) di dalam sel tabel biaya menyatu menjadi satu baris. | `quotationLetterPdf.ts:99-116` | Regex `part.split(/(\s+)/)` menelan `\n` menjadi spasi biasa (`space = true`), menghilangkan line break. | Parser `tokenize()` kini memisahkan `\r?\n` sebagai token `{ br: true }`, dan `rich()` memotong baris baru secara eksplisit di dalam sel tabel. | **RESOLVED** |

---

## 2. Akurasi & Sinkronisasi Geofencing Teknisi Lapangan

### A. Solusi "Null Island" (Proyek Tanpa Titik Peta / Koordinat 0,0)
* **Kondisi Sebelumnya:** Saat proyek dibuat dari dokumen SPK tanpa pin peta, koordinat tersimpan `0, 0`. Saat teknisi check-in, kalkulasi Haversine menghitung jarak terhadap ekuator Afrika (10.500 km) dan otomatis memicu alarm `FLAGGED / Di Luar Radius`.
* **Solusi Diterapkan:**
  1. **Auto-Anchor Check-In Pertama (`workReports.ts`):** Jika proyek belum memiliki koordinat valid (`projectLatitude === 0 && projectLongitude === 0`), titik GPS fisik teknisi saat check-in pertama otomatis dikunci sebagai titik jangkar resmi proyek (`projects.latitude` & `longitude`), jarak dihitung `0 meter`, dan status geofence langsung **Valid (`check_in_valid: true`)**.
  2. **HUD Kamera Adaptif (`CameraCaptureModal.tsx`):** Jika proyek baru belum memiliki koordinat, HUD kamera menampilkan badge hijau informatif: **`✓ Titik Jangkar Baru (Valid)`** dan mengizinkan pengambilan foto tanpa penalti anomali.
  3. **Fallback Progres & Check-Out:** Jika proyek belum di-anchor, foto progres dan check-out otomatis merujuk ke koordinat check-in pertama teknisi (`checkInLatitude` & `checkInLongitude`).

### B. Proteksi Anti-Geser Pin Peta (`CreateProjectModal.tsx`)
* **Kondisi Sebelumnya:** Debounced auto-geocoding 1,5 detik otomatis mengirim teks alamat ke Nominatim OpenStreetMap dan menimpa koordinat GPS riil teknisi dengan titik tengah kelurahan.
* **Solusi Diterapkan:**
  * Auto-geocoding latar belakang dimatikan total.
  * Pencarian koordinat alamat hanya berjalan jika teknisi secara eksplisit menekan tombol **"Cari dari Alamat"**.
  * Pengambilan GPS awal dan tombol **"Posisi GPS Saya (Akurat)"** dikunci menggunakan sensor presisi tinggi: `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }`.

---

## 3. Optimasi Responsivitas & Performa Mobile (Lancar 60 FPS)

1. **Throttled Viewport Metrics (`useVirtualKeyboard.ts`):**
   * Pemantauan resize dan scroll pada `window.visualViewport` di-throttle dengan `requestAnimationFrame` dan batas selisih tinggi minimal `3px`.
   * Mencegah re-render berlebihan (*layout thrashing*) sehingga animasi keyboard Android/iOS berjalan mulus tanpa lag.
2. **Auto-Scroll Input Form:**
   * Ditambahkan handler `onFocus` yang memanggil `scrollInputIntoView()` pada field nama proyek, pelanggan, jadwal, dan textarea alamat.
   * Container form dilengkapi padding bawah ekstra (`pb-56`) dan kelas `scroll-mb-48` agar teks tidak tertutup keyboard saat mengetik.
3. **Zero Background HTTP Overhead:**
   * Pengetikan alamat tidak lagi mengirim request jaringan berulang-ulang, menghemat kuota seluler teknisi dan menjaga UI tetap enteng.

---

## 4. Standarisasi Penomoran Surat Resmi (Peniadaan Total Kode `APR`)

Sesuai arahan operasional manajemen, format penomoran surat dibersihkan dari imbuhan sementara `APR`:
* **Fase Draft (Surveyor/Marketing):** Memuat kode `-DRF`, contoh:
  * Anti Rayap: `GP-DRF/AR/PH/YYYY/MM/NNNN`
  * Pest Control: `GP-DRF/PCO/PH/YYYY/MM/NNNN`
* **Fase Disetujui (Admin/Direktur Approve):** Kode `-DRF` langsung tanggal dan langsung menjadi format resmi kategori (`AR` atau `PCO`), contoh:
  * Anti Rayap: **`GP/AR/PH/YYYY/MM/NNNN`**
  * Pest Control: **`GP/PCO/PH/YYYY/MM/NNNN`**

---

## 6. Konfigurasi Tema Bawaan (Light Theme Default)

* **Inisialisasi Bawaan:** Aplikasi kini langsung aktif dalam tema **Terang (Light)** pada kunjungan pertama atau saat penyimpanan `localStorage` masih kosong.
* **Mencegah Flash Tampilan (FOUC):** Tag `<html>` pada `index.html` dan skrip *pre-hydration* dikonfigurasi menggunakan `class="light" data-theme="light"`.
* **Pilihan Pengguna:** Pengguna tetap dapat berganti ke tema Gelap (*Dark*) atau Ikuti Sistem (*System*) melalui tombol toggle pada navigasi atas atau menu Pengaturan Profil.

---

## 7. Manajemen Profil Pelanggan & Rekomendasi Peta Interaktif (Map Autocomplete)

* **Edit Profil Lengkap:** Pengguna dapat memperbarui nama klien, kontak WhatsApp, U.P. / PIC, wilayah operasional, alamat lengkap, dan titik koordinat GPS.
* **Pencarian Autocomplete ala Google Maps:** Tersedia input pencarian otomatis berbasis OpenStreetMap Nominatim & Photon API. Memilih saran tempat/gedung otomatis mengisi alamat, mendeteksi wilayah, dan mengarahkan peta ke koordinat akurat.
* **Peta Interaktif & Geser Pin:** Dilengkapi Leaflet `MapPicker` yang mendukung penggeseran pin secara bebas untuk ketepatan pintu masuk/gerbang klien, tombol cepat *"Posisi GPS Saya Saat Ini"*, dan input angka latitude/longitude manual.
* **Sinkronisasi Otomatis:** Perubahan profil tersinkronisasi ke seluruh penawaran dan SPK penugasan kerja lapangan.

---

## 8. Migrasi MapPicker ke Native Leaflet & Resolusi Defek Lintas Modul

1. **Resolusi Crash `fE is not a constructor`:**
   * Komponen `src/widgets/common/MapPicker.tsx` dimigrasikan sepenuhnya dari wrapper `react-leaflet` ke **Native Leaflet murni (`import L from 'leaflet'`)**, menyamakan arsitektur yang sudah terbukti stabil pada `LocationMap.tsx` dan `AllProjectsMap.tsx`.
   * Bundle `vendor-maps` terpangkas 35 kB lebih ringan dan bebas dari konflik ESM / React 19 constructor.
   * Koordinat yang masuk diproteksi dengan guard numerik `safeLat` & `safeLng` sehingga tidak ada lagi `TypeError toFixed`.
2. **Penyelesaian Favicon 404:**
   * Ditambahkan `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` dan `<link rel="alternate icon" href="/favicon.svg" />` di `index.html`.
3. **Penyelesaian Celah Rute & Data Safety:**
   * Rute `/quotations/new` dan `/quotations/:id/edit` dikunci dari akses URL ilegal peran teknisi dan inventori.
   * Sinkronisasi koordinat riil survey saat approval quotation menggantikan koordinat statis Cilandak.
   * Format mata uang `formatRupiah` dan tanggal `formatDate` diproteksi dari nilai `NaN` dan invalid string.
   * Properti `prevDealPct` dipulihkan pada return object `categoryStats` di `PerformaPage`.
   * Pengecekan akun aktif `isSelf` di `AdminDashboard` diperbaiki menggunakan properti `user.uid`.

---

## 9. Kebijakan Nomor Kontak Penawaran (Wajib & Pengelolaan Internal)

* **Input Bersih & Wajib (*Required*):** Kolom Nomor Telepon / WhatsApp pada formulir pembuatan maupun pengeditan penawaran diwajibkan terisi (minimal 8 digit angka valid). Jika dikosongkan, formulir secara otomatis memblokir langkah berikutnya dengan pesan error jelas.
* **Pembersihan Tombol Kirim Penawaran WA:** Tombol `Kirim WA` dengan template draf penawaran resmi pada tabel penawaran dieliminasi. Nomor kontak klien disajikan secara bersih untuk keperluan pencatatan dan pelacakan internal yang dikelola secara eksklusif oleh Direktur dan Admin.
* **Integrasi Modul Tracking CMS:** Nomor telepon klien ditampilkan secara langsung pada kartu pelacakan `TrackingCard` untuk mempermudah monitoring termin pembayaran dan progres pekerjaan.

---

## 10. Bukti Pengujian & Integritas Sistem (Dimonitor oleh Izumi Gatekeeper)

1. **Vite Production Build:**
   * Status: **SUCCESS** (2505 modules transformed, 0 error, build in ~68s).
2. **Whitebox Unit Tests (`npm run test:whitebox`):**
   * Status: **72 / 72 PASS (100%)**
   * Mencakup **WB-01 s.d. WB-20** (termasuk validasi formula ukuran, SNI 2404, sanitasi PDF, auto-anchor GPS, bulk import validator, jadwal SPK modulo math, default light theme, autocomplete rekomendasi alamat, dan validasi wajib nomor telepon penawaran).
3. **Blackbox Integration Tests (`npm run test:blackbox`):**
   * Status: **34 / 34 PASS (100%)**
   * Mencakup **BB-01 s.d. BB-11** (RBAC 6 role, alur SPK & laporan kerja, System Usability Scale, antrean offline idempotency, tanda tangan digital, bulk customer import, SPK recurring dispatch, penomoran resmi bersih tanpa APR, geofence auto-anchor, dan sinkronisasi geser pin peta pelanggan).
4. **Automated QA Test Suite (`python scripts/run-qa-whitebox-blackbox.py`):**
   * Status: **20 / 20 SUITES PASS (100%)**
   * Memvalidasi seluruh gerbang arsitektur Izumi (Gate 1 - 4), Operational Bento, Bulk Import, SPK Schedule, Geofence Anchor, dan Customer Profile Autocomplete Map.
5. **Riwayat Git:**
   * Branch: `origin/main`.
