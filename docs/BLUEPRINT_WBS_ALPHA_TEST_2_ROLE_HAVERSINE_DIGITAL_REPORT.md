# Blueprint Arsitektur, WBS Planning, & Laporan Alpha Testing — Sistem 2 Role (Admin & Teknisi) Berfokus pada Geolocation Haversine & Digital Report

Dokumen ini disusun secara kolaboratif oleh **Ayling** (System Architect & Project Manager), **Izumi** (Human-Centered UX Microcopy & Cognitive Load Specialist, dengan alur pemodelan **Diara**), dan **Kei** (QA/QC Test Architect). Seluruh cakupan sistem pada dokumen ini difokuskan secara murni pada **2 Role (`ADMIN` dan `TEKNISI_LAPANGAN`)** dengan dua pilar inti: **Validasi Geolocation berbasis Rumus Haversine** dan **Digital Report (`Laporan Hasil Pekerjaan`)**, tanpa modul SPK, Penawaran (Quotation), Gudang (Inventory), maupun Keuangan.

## 1. Ruang Lingkup 2 Role & Prinsip Reduksi Beban Kognitif (Ayling & Izumi)

Sistem dirancang khusus untuk menyederhanakan koordinasi antara **Teknisi di lapangan (Mobile PWA)** dan **Admin Verifikasi di kantor (Web Desktop/Tablet)** dengan meminimalkan beban kognitif (*Miller's Law* & *Hick's Law*).

| Peran (Role) | Fokus Utama dalam Sistem | Hak Akses & Batasan Visibilitas (RBAC) |
| ----- | ----- | ----- |
| **1. `TEKNISI_LAPANGAN` (Mobile-First PWA)** | Eksekusi kunjungan lapangan berdasarkan klasifikasi tanggal (**Hari Ini**, **Besok**, **Kemarin**, & **Arsip** + **Filter Tanggal**), validasi kehadiran GPS Haversine, foto bukti ber-watermark, pengisian **Laporan Hasil Pekerjaan** (Anti Rayap / Pest Control), tanda tangan digital 2 tahap, pratinjau PDF, & kirim WhatsApp | Menggunakan **Floating Bottom Pill** (`Beranda`, `Tugas`, `Riwayat`, `Profil`), tampilan permukaan ringkas tanpa tombol toggle *Mode Ringkas/Detail* (rincian cukup dibuka saat *on-click*), **tanpa fitur QR**, dan **tidak dapat melihat isi Evaluasi Rahasia PIC (*Strict Blind Review*)** |
| **2. `ADMIN` (Operational & Verification Dashboard)** | Penetapan titik koordinat & radius lokasi proyek, pemantauan jarak Haversine & anomali radius, verifikasi **Laporan Hasil Pekerjaan**, tindak lanjut eskalasi **Lapor Kendala**, serta pembacaan hasil **Evaluasi Rahasia PIC** | Memiliki akses penuh ke antrian **Perlu Tindakan**, rincian jarak check-in/out Haversine, galeri foto watermark GPS, dokumen PDF **Laporan Hasil Pekerjaan**, serta nilai bintang & ulasan rahasia dari PIC Klien |

### 1.1 Prinsip Desain UI/UX Teknisi (`Stitch Redesign` + Sistem Sebelumnya)

| Dimensi UI/UX | Spesifikasi Implementasi pada Sistem 2 Role |
| ----- | ----- |
| **Klasifikasi Tanggal Tugas & Tab Arsip (`> Kemarin`)** | Setiap tugas diklasifikasikan secara otomatis terhadap tanggal hari ini (`todayKey` zona waktu lokal): **Hari Ini (`TODAY`)**, **Besok (`TOMORROW`)**, **Kemarin (`YESTERDAY`)**, dan **Arsip (`ARCHIVE` — semua tugas yang tanggalnya lebih lampau dari kemarin `dateKey < yesterdayKey`)**, dilengkapi **Filter Tanggal (`YYYY-MM-DD`)** |
| **On-Click Detail Tanpa Toggle Mode Ringkas** | Tombol toggle *Mode Ringkas / Mode Detail* dihilangkan agar antarmuka lebih tenang; seluruh kartu tampil ringkas secara alami dan menampilkan rincian lengkap ketika pengguna melakukan klik (*on-click*) pada kartu atau baris rincian |
| **Navigasi Bawah (*Floating Bottom Pill*) & Gesture** | Menggantikan bar statis bawah dengan kapsul melayang (`TabContainer`: `hideTopBar={true}`, `floatingOnAllScreens={true}`, `showFloatingBottom={!isAnyModalOpen}`) yang dipadukan dengan transisi `AnimatePresence mode="wait"` dan *horizontal swipe* (`drag="x"`) antar tab hari |
| **Standarisasi Dokumen & Evaluasi Strict Blind** | Seluruh dokumen menggunakan istilah **Laporan Hasil Pekerjaan** (tanpa Berita Acara dan tanpa QR). Sesudah PIC menandatangani layar, form **Evaluasi Rahasia PIC** otomatis terbuka, wajib diisi oleh PIC, dan langsung dikunci/dienkripsi ke Admin tanpa bisa dilihat oleh Teknisi |

## 2. Blueprint Arsitektur Geolocation Haversine & Digital Report (Diara & Ayling)

### 2.1 Spesifikasi Matematis & Algoritma Geolocation Haversine (`src/shared/utils/geo.ts`)

Untuk memastikan validitas kehadiran teknisi di titik lokasi pelanggan, sistem menghitung jarak bola bumi (*great-circle distance*) antara koordinat proyek $(\phi_1, \lambda_1)$ dan koordinat perangkat teknisi saat *Check-In* / *Check-Out* $(\phi_2, \lambda_2)$ menggunakan **Rumus Haversine**:

$$\Delta\phi = \text{rad}(\phi_2 - \phi_1), \quad \Delta\lambda = \text{rad}(\lambda_2 - \lambda_1)$$

$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cdot\cos(\phi_2)\cdot\sin^2\left(\frac{\Delta\lambda}{2}\right)$$

$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right), \quad d = R \cdot c$$

dengan $R = 6.371.000\text{ meter}$ (jari-jari rata-rata bumi) dan keputusan validasi geofence:

$$\text{checkInValid} = \begin{cases} \text{true}, & \text{jika } d \le R_{\text{radius}} \text{ (default } 100\text{ m)} \\ \text{false (FLAGGED)}, & \text{jika } d > R_{\text{radius}} \end{cases}$$

### 2.2 Logika Klasifikasi Tanggal Tugas & Arsip (`resolveTaskDateKey` & `classifyTaskHorizon`)

Pada `src/shared/api/projects.ts` dan `src/widgets/executor/ExecutorHome.tsx`, tanggal pelaksanaan setiap tugas (`workDate` $\rightarrow$ `nextServiceDate` $\rightarrow$ `createdAt` lokal) dibandingkan terhadap tanggal lokal hari ini ($T_0$):

$$\text{Horizon}(T_{\text{task}}) = \begin{cases} \text{TODAY (Hari Ini)}, & \text{jika } T_{\text{task}} = T_0 \\ \text{TOMORROW (Besok)}, & \text{jika } T_{\text{task}} \ge T_0 + 1\text{ hari} \\ \text{YESTERDAY (Kemarin)}, & \text{jika } T_{\text{task}} = T_0 - 1\text{ hari} \\ \text{ARCHIVE (Arsip)}, & \text{jika } T_{\text{task}} < T_0 - 1\text{ hari (lebih lampau dari kemarin)} \end{cases}$$

Apabila teknisi memilih tanggal spesifik pada **Filter Tanggal (`taskDateFilter`)**, daftar tugas langsung menyaring seluruh tugas yang memiliki $T_{\text{task}} = \text{taskDateFilter}$.

### 2.3 Diagram Alur End-to-End 2 Role: Haversine Geolocation & Digital Report

```
flowchart TD
    subgraph TEKNISI ["ROLE 1: TEKNISI LAPANGAN (Mobile PWA)"]
        T1[Beranda & Daftar Tugas: Tab Kemarin / Hari Ini / Besok / Arsip + Filter Tanggal] -->|On-Click Kartu / Rincian| T2(Detail Rute, Scope, & Radius Haversine)
        T1 -->|Klik Lapor Kendala| T3(Input Kendala Lapangan: Akses Terkunci / PIC Absen)
        T1 -->|Klik Mulai & Check-in| T4[Langkah 1: Akuisisi GPS & Hitung Jarak Haversine d]
        T4 -->|Ambil Foto Check-In Ber-Watermark GPS| T5[Langkah 2: Dokumentasi Foto Kondisi Awal & Hasil]
        T5 -->|Klik Lanjut Form Laporan| T6[Langkah 3: Input Digital Report Dual-Mode]
        T6 -->|Mode Anti Rayap| T6A[Chip Keparahan + Estimasi Koloni + Metode Injeksi/Baiting]
        T6 -->|Mode Pest Control| T6B[Chip Jumlah 1-5 / 6-15 / >20 + Kondisi Hama + Metode PCO]
        T6A --> T7[Langkah 4: Check-Out GPS Haversine & Tanda Tangan Teknisi]
        T6B --> T7
        T7 -->|Serahkan HP ke PIC Klien| T8[Langkah 5A: Tanda Tangan Digital PIC Lokasi]
        T8 -->|Otomatis Terbuka Sesudah TTD| T9[Langkah 5B: Evaluasi Rahasia PIC - Wajib Diisi 1-5 Bintang]
        T9 -->|Strict Blind Lock| T10[Langkah 6: Layar Bersih Teknisi + Pratinjau PDF A-E + Kirim WA]
    end

    subgraph ADMIN ["ROLE 2: ADMIN (Verification & Geolocation Dashboard)"]
        A1[Panel Perlu Tindakan Admin]
        A2[Verifikasi Digital Report & Audit Geolocation Haversine]
        A3[Rekap Evaluasi Rahasia PIC & Arsip PDF Laporan Hasil Pekerjaan]
    end

    T3 -->|Eskalasi Langsung fw_field_issues_v1| A1
    T4 -->|Jika d > Radius: Status FLAGGED| A1
    T10 -->|Sinkronisasi Online / Antrean IndexedDB| A2
    T9 -->|Dienkripsi Khusus Admin - Tertutup dari Teknisi| A3
```

## 3. Work Breakdown Structure (WBS) Planning — Fokus 2 Role (Ayling)

| Kode WBS | Paket Pekerjaan (Work Package) | Rincian Deliverable Teknis (2 Role: Admin & Teknisi) | PIC Agen | Status |
| ----- | ----- | ----- | ----- | ----- |
| **WBS-1.0** | **Arsitektur Geolocation Haversine & Geofence Engine** | Implementasi rumus Haversine (`geo.ts`), validasi radius, *auto-anchor*, & *watermark* foto bukti | Ayling & Kei | **SELESAI (100%)** |
| **WBS-2.0** | **Klasifikasi Tanggal Tugas, Tab Arsip (`> Kemarin`), Filter Tanggal, & On-Click Detail** | Resolusi tanggal lokal akurat (`projects.ts` & `ExecutorHome.tsx`), 4 tab horizon (`Kemarin`, `Hari Ini`, `Besok`, `Arsip`), input Filter Tanggal, dan penghapusan toggle *Mode Ringkas/Detail* | Ayling & Izumi | **SELESAI (100%)** |
| **WBS-3.0** | **Digital Report (`Laporan Hasil Pekerjaan`) & Strict Blind Review PIC** | Form Dual-Mode AR/PCO, TTD 2 Tahap, Evaluasi Rahasia PIC otomatis sesudah TTD, PDF Seksi A–E, & Kirim WA | Ayling & Izumi | **SELESAI (100%)** |
| **WBS-4.0** | **Dashboard Verifikasi Admin & Eskalasi Kendala Lapangan** | Pemantauan hasil kerja, audit jarak Haversine, eskalasi kendala (`fw_field_issues_v1`), & pembacaan rating PIC | Ayling & Kei | **SELESAI (100%)** |
| **WBS-5.0** | **Alpha Testing Menyeluruh Fokus 2 Role (Kei QA/QC)** | Pengujian Whitebox Haversine, Klasifikasi Tanggal & Arsip, Digital Report, Offline Sync, & Strict Blind Privacy | Kei QA/QC | **SELESAI (100%)** |

## 4. Laporan Alpha Testing — Fokus 2 Role: Haversine Geolocation & Digital Report (Kei QA/QC)

| ID Test Case | Kategori Uji | Skenario Pengujian (Admin & Teknisi) | Kriteria Lulus (Expected Result) | Hasil Eksekusi |
| ----- | ----- | ----- | ----- | ----- |
| **ALPHA-DATE-01** (`KEI-25`) | Functional Date & Archive | Uji klasifikasi tugas berdasarkan tanggal hari ini (`Kemarin`, `Hari Ini`, `Besok`, `Arsip < Kemarin`), input **Filter Tanggal**, dan detail *on-click* tanpa toggle *Mode Ringkas* | Tugas terkelompok akurat sesuai `workDate` lokal, tugas lebih lampau dari kemarin otomatis masuk tab **Arsip**, dapat disaring dengan **Filter Tanggal**, dan detail terbuka cukup saat *on-click* | **PASS** |
| **ALPHA-GEO-01** (`WB-04`) | Whitebox Unit | Uji akurasi rumus Haversine (`calculateDistanceMeters` & `isWithinRadius`) pada `src/shared/utils/geo.ts` | Menghitung jarak bola bumi dalam satuan meter secara presisi dan memvalidasi apakah jarak $\le$ radius proyek | **PASS** |
| **ALPHA-GEO-02** (`BB-13`) | Integration | Uji *Geofence Auto-Anchor* pada lokasi baru tanpa koordinat awal $(0,0)$ dan filter akurasi GPS perangkat | Check-in pertama mengunci titik jangkar baru tanpa *false-alarm* jarak jauh; sinyal GPS tidak akurat ($>150\text{ m}$) ditolak | **PASS** |
| **ALPHA-REP-01** (`KEI-15/16`) | System / Functional | Uji pemisahan Digital Report **Laporan Hasil Pekerjaan** antara mode **Anti Rayap** vs **Pest Control** | Menampilkan chip keparahan & estimasi koloni pada Anti Rayap, serta stepper jumlah (`1-5`, `6-15`, `>20`) & kondisi hama pada Pest Control | **PASS** |
| **ALPHA-REP-02** (`KEI-26`) | Security & Privacy | Uji alur **Strict Blind Evaluation PIC** sesudah tanda tangan (`SIGN_STAGE` $\rightarrow$ `STRICT_BLIND_EVAL_STAGE`) | Muncul otomatis sesudah tanda tangan PIC, menolak pengiriman jika bintang $= 0$, dan menyembunyikan hasil evaluasi dari seluruh layar Teknisi | **PASS** |
| **ALPHA-ADM-01** (`KEI-07/25`) | Role Integration | Uji eskalasi **Lapor Kendala** teknisi (`fw_field_issues_v1`) dan laporan `FLAGGED` ke Dashboard Admin | Kendala lapangan dari teknisi dan anomali radius Haversine langsung tampil di panel **Perlu tindakan** pada Dashboard Admin | **PASS** |

**Keputusan Akhir Alpha Testing (Kei QA/QC):** **`PASS (6/6 Suite 2-Role & 26/26 Suite Utama LULUS)`**.