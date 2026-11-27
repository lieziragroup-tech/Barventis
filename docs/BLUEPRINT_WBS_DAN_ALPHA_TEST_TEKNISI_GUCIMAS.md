# Blueprint Arsitektur, WBS Planning, & Laporan Alpha Testing Menyeluruh — Modul Teknisi Lapangan (Stitch UI/UX + Sistem Sebelumnya)

Dokumen ini disusun secara kolaboratif oleh **Ayling** (System Architect & Project Manager), **Izumi** (Human-Centered UX Microcopy & Cognitive Load Specialist, dengan alur pemodelan **Diara**), dan **Kei** (QA/QC Test Architect) sebagai panduan implementasi dan bukti verifikasi Alpha Testing atas integrasi `stitch_gucimas_fieldwork_ui_ux_redesign.zip` ke dalam ekosistem **Guci-App / Fieldwork**.

## 1. Analisis Kognitif & Prinsip Desain (Izumi & Ayling)

Berdasarkan kapasitas memori kerja manusia (*Miller's Law* dan *Hick's Law*), layar teknisi lapangan di bawah terik matahari dan kondisi bergerak satu tangan tidak boleh menampilkan paragraf panjang atau tumpukan metadata sekaligus.

| Dimensi Desain | Kondisi pada File Stitch (`AS-IS` Referensi) | Integrasi Sistem Terpadu (`TO-BE` Terimplementasi & Terkunci) |
| ----- | ----- | ----- |
| **Navigasi Bawah (Bottom Widget)** | Bar penuh statis 4 kolom di bawah layar (`<nav>` penuh) | **Floating Bottom Pill (`TabContainer`)** dari sistem sebelumnya (`hideTopBar={true}`, `floatingOnAllScreens={true}`) yang otomatis bersembunyi saat modal, kamera, atau sub-alur kerja aktif |
| **Animasi & Gesture** | Transisi halaman dan akordion masih statis (HTML/CSS murni) | **Framer Motion Physics & Touch Gestures** dari sistem sebelumnya: transisi halaman `AnimatePresence mode="wait"`, *horizontal swipe* (`drag="x"`) pada tab hari (`Kemarin / Hari Ini / Besok`), akordion halus, dan umpan balik sentuh `whileTap={{ scale: 0.98 }}` |
| **Kepadatan Informasi per Layar** | Beberapa layar masih memuat sub-judul dan kalimat instruksi 2–3 baris | **Batas Maksimal 4 Sinyal Inti di Permukaan**: (1) ID & Chip Layanan, (2) Judul Tugas, (3) Nama Klien & Jam, (4) Satu Tombol Aksi Utama. Seluruh informasi sekunder dibuka melalui **Progressive Disclosure (`on-click`)** |
| **Standarisasi Istilah & Penghapusan Fitur Redundan** | Masih terdapat tombol `Pindai QR` dan istilah `"Berita Acara"` | **Tanpa QR Scanner** (`Pindai QR` dihapus penuh) dan seluruh dokumen distandarisasi menjadi **Laporan Hasil Pekerjaan** (bukan Berita Acara) |
| **Evaluasi PIC Klien (*Strict Blind Review*)** | Form rating & tanda tangan tampil dalam satu layar terbuka | **2 Tahap Berurutan & Strict Blind**: Sesudah PIC menandatangani laporan (`SIGN_STAGE`), form **Evaluasi Rahasia PIC (`STRICT_BLIND_EVAL_STAGE`)** otomatis terbuka, **wajib diisi oleh PIC** (bintang awal `0`), dan begitu dikirim langsung **dikunci/dienkripsi ke Manajemen** sehingga teknisi sama sekali tidak dapat melihat apa yang diinput oleh pelanggan |

## 2. Blueprint Arsitektur Komponen & Handler (`AS-IS` vs `TO-BE`)

### 2.1 Diagram Alur Interaksi & Progressive Disclosure Teknisi (Mermaid Flowchart)

```
flowchart TD
    A[Beranda Teknisi: 3-Metric Strip + Kartu Tugas Utama] -->|Klik Lihat Detail Rute & Scope| B(Drawer Akordion: Alamat, Peta Rute 12 mnt, Scope & Kontak PIC)
    A -->|Klik Lapor Kendala| D(Modal Kendala 1-Klik -> Eskalasi Tampil di Panel Perlu Tindakan Admin)
    A -->|Klik Mulai Perjalanan & Check-in| E[Langkah 1/6: Check-in GPS & Kamera Watermark]
    E -->|Validasi Radius Haversine| F[Langkah 2/6: Dokumentasi Foto Kondisi Awal & Hasil]
    F -->|Klik Lanjut Form Laporan| G[Langkah 3/6: Dual-Mode Treatment Form]
    G -->|Mode Anti Rayap| G1[Chip Keparahan + Estimasi Koloni + Titik Injeksi]
    G -->|Mode Pest Control| G2[Chip Rentang 1-5 / 6-15 / >20 + Kondisi Hama]
    G1 --> H[Langkah 4 & 5: Check-out & Tanda Tangan PIC Lokasi]
    G2 --> H
    H -->|Tahap 1: TTD Teknisi & TTD PIC Terkunci| I[Tahap 2 Otomatis: Evaluasi Rahasia PIC Wajib Diisi - Strict Blind]
    I -->|Terkunci & Terenkripsi ke Manajemen| J[Langkah 6/6: Layar Bersih Pengesahan Selesai - Teknisi Tidak Bisa Lihat Isi Rating]
    J -->|On-Click| K[Modal Pratinjau PDF Laporan Hasil Pekerjaan Bagian A-E]
    J -->|On-Click| L[Modal Konfirmasi Kirim Laporan Hasil Pekerjaan via WhatsApp]
```

### 2.2 Pemetaan Layar Stitch ke Komponen Kode (`Guci-App-main`)

| Kelompok Layar pada `stitch_gucimas_fieldwork_ui_ux_redesign.zip` | Komponen Target di `Guci-App-main` | Handler & State Utama (Setelah Keputusan Final) |
| ----- | ----- | ----- |
| `beranda_teknisi_state_tertutup_collapsed` & `beranda_teknisi_progressive_disclosure` | `src/widgets/executor/ExecutorHome.tsx` (`page === 'home'`) | `homeScopeExpanded`, 3-Metric Strip (`Hari Ini`, `Selesai`, `Pending`), `showIssueModal` (`fw_field_issues_v1` -> tampil di Dashboard Admin), **tanpa tombol QR** |
| `beranda_tugas_1_antrean_tersimpan_offline` & `status_pengiriman_tertunda_offline` | `src/widgets/executor/ExecutorHome.tsx` (`lite-connection-banner`, `page === 'sync'`) | `pendingCount`, `attemptSync()`, `enqueue()`, `syncQueue()` |
| `menu_tugas_teknisi_state_tertutup_collapsed` & `menu_tugas_teknisi_hari_ini` | `src/widgets/executor/ExecutorHome.tsx` (`page === 'jobs'`) | `dayHorizon` (`YESTERDAY` / `TODAY` / `TOMORROW`), `handleDaySwipe` (`drag="x"`), `expandedTaskCardId` |
| `detail_pekerjaan_terpadu` & `detail_pekerjaan_1_teknisi_tunggal` | `src/widgets/executor/ExecutorHome.tsx` (`page === 'task-detail'`) | `openReportDetail()`, `showTeamPicker`, `handleToggleQuickTeamMember()` |
| `form_input_laporan_anti_rayap_pest_control_detail`, `form_input_laporan_pest_control_detail_jumlah_temuan`, & `form_input_laporan_mode_gelap` | `src/widgets/executor/TreatmentFormModal.tsx` | `modeOverride` (`AR` vs `PCO`), `severityLevel`, `colonyEstimate`, `pestCondition`, `showTeamSection`, `showAdvancedTechDetails` |
| `modal_rahasia_feedback_klien_pengesahan` & `pengesahan_selesai_layar_bersih_teknisi` | `src/widgets/executor/CustomerReviewFormModal.tsx` & `ExecutorHome.tsx` (`page === 'review'`) | `step` (`SIGN_STAGE` -> otomatis `STRICT_BLIND_EVAL_STAGE`), `rating` (dimulai dari `0`, wajib diisi PIC), `selectedTags` (wajib minimal 1), payload `STRICT_BLIND_PIC_REVIEW` tersembunyi penuh dari teknisi |
| `pratinjau_laporan_pdf_anti_rayap` & `pratinjau_laporan_pdf_pest_control` | `src/widgets/executor/ExecutorHome.tsx` (`pdfPreviewReport`) | Pratinjau **Laporan Hasil Pekerjaan** (`expandedPdfSection` `A` s.d. `E` collapsible), `visitReportPdf.ts` |
| `konfirmasi_kirim_whatsapp` & `konfirmasi_kirim_whatsapp_anti_rayap` | `src/widgets/executor/ExecutorHome.tsx` (`waShareReport`) | `waRecipientName`, `waPhoneInput`, pratinjau pesan otomatis **Laporan Hasil Pekerjaan** & salin teks |
| `riwayat_pekerjaan_arsip_terkirim` & `riwayat_pekerjaan_pencarian_aktif` | `src/widgets/executor/ExecutorHome.tsx` (`page === 'history'`) | `searchQuery`, `historyFilterChip` (`ALL` / `COMPLETED` / `FLAGGED`), tombol cepat `PDF` & `WA` |
| `pusat_notifikasi` & `pusat_notifikasi_mode_gelap` | `src/widgets/executor/ExecutorHome.tsx` (`showNotifications`) | `notifCategory` (`ALL` / `TASK` / `OFFLINE`), `unreadNotifCount` |
| `profil_teknisi` | `src/widgets/executor/ExecutorHome.tsx` (`page === 'profile'`) | `attemptSync`, `cacheSizeMb` (`Bersihkan`), `autoWaDirect`, `setTheme('light' \| 'dark')` |

## 3. Work Breakdown Structure (WBS) Planning (Ayling)

| Kode WBS | Paket Pekerjaan (Work Package) | Deliverable Teknis | PIC Agen | Status |
| ----- | ----- | ----- | ----- | ----- |
| **WBS-1.0** | **Audit Desain Stitch & Standarisasi Kognitif** | Pemetaan 21 layar Stitch, spesifikasi token `DESIGN.md` (`#1B4332`), dan reduksi teks per layar | Ayling & Izumi | **SELESAI (100%)** |
| **WBS-1.1** | Audit struktur HTML/CSS 21 layar `stitch_gucimas_fieldwork_ui_ux_redesign.zip` | Inventarisasi komponen Beranda, Tugas, Form AR/PCO, PDF, WA, Notifikasi, Profil (tanpa QR) | Ayling | **SELESAI (100%)** |
| **WBS-1.2** | Penyederhanaan Microcopy, Standarisasi **Laporan Hasil Pekerjaan**, & *Progressive Disclosure* | Maksimal 4 informasi inti per kartu; detail teknis/rute/tim hanya muncul saat *on-click*; istilah Berita Acara diganti penuh menjadi **Laporan Hasil Pekerjaan** | Izumi | **SELESAI (100%)** |
| **WBS-2.0** | **Integrasi Navigasi Floating Pill, Animasi, & Gesture** | Penggantian `<nav>` bawah statis dengan `TabContainer` + Framer Motion | Ayling | **SELESAI (100%)** |
| **WBS-2.1** | Penggantian Bottom Widget statis menjadi *Floating Bottom Pill* | `TabContainer` dengan `hideTopBar={true}`, `floatingOnAllScreens={true}`, `showFloatingBottom={!isAnyModalOpen}` | Ayling | **SELESAI (100%)** |
| **WBS-2.2** | Integrasi Animasi Transisi & *Swipe Gesture* dari sistem sebelumnya | `AnimatePresence mode="wait"`, `drag="x"` pada tab hari (`handleDaySwipe`), akordion progresif, dan `whileTap` | Ayling | **SELESAI (100%)** |
| **WBS-3.0** | **Implementasi Fitur Lapangan Final (Dual-Mode, Eskalasi Admin, Strict Blind Review PIC)** | Pembaruan `ExecutorHome.tsx`, `TreatmentFormModal.tsx`, `CustomerReviewFormModal.tsx`, `OperationsAnalyticsBento.tsx` | Ayling & Izumi | **SELESAI (100%)** |
| **WBS-3.1** | Form Laporan Dual-Mode (`Anti Rayap` vs `Pest Control`) dengan Chip Cepat | Chip keparahan (`Ringan/Sedang/Kritis`), koloni (`< 500`, `1rb - 3rb`, `> 5.000`), rentang jumlah (`1-5`, `6-15`, `>20`), dan akordion detail teknis | Ayling | **SELESAI (100%)** |
| **WBS-3.2** | Alur 2 Tahap **Strict Blind Evaluation PIC** (Wajib Diisi Sesudah TTD & Terkunci dari Teknisi) | `SIGN_STAGE` -> otomatis buka `STRICT_BLIND_EVAL_STAGE` (wajib pilih 1–5 bintang + kriteria); begitu dikirim langsung tertutup & tidak bisa dilihat teknisi | Ayling & Izumi | **SELESAI (100%)** |
| **WBS-3.3** | Eskalasi `Lapor Kendala` ke Dashboard Admin + Pratinjau PDF & WA **Laporan Hasil Pekerjaan** | Kendala lapangan tampil di panel **Perlu tindakan** Admin (`fw_field_issues_v1`); Pratinjau PDF berseksi (`A` s.d. `E`) & WA otomatis | Ayling | **SELESAI (100%)** |
| **WBS-4.0** | **Persiapan & Eksekusi Alpha Testing Menyeluruh (Kei QA/QC)** | Rencana uji, matriks risiko, skrip otomatis `KEI-01` s.d. `KEI-26` + `WB/BB` | Kei QA/QC | **SELESAI (100%)** |

## 4. Laporan Alpha Testing Menyeluruh (Kei QA/QC Specialist)

### 4.1 Ruang Lingkup & Pendekatan Pengujian Alpha

Sesuai protokol **Kei QA/QC**, Alpha Testing dieksekusi secara berlapis (*Shift-Left Static & Structural Analysis*, *Component/Integration Verification*, *Whitebox Formula & Geolocation Audit*, dan *Blackbox End-to-End Role Workflow*) pada repositori `Guci-App-main`.

### 4.2 Matriks Risiko & Mitigasi Alpha Testing

| ID Risiko | Skenario Risiko Operasional | Dampak | Probabilitas | Mitigasi & Bukti Verifikasi | Status Gate |
| ----- | ----- | ----- | ----- | ----- | ----- |
| **RSK-01** | Beban kognitif berlebih saat teknisi membaca layar di bawah sinar matahari | Tinggi | Sedang | Diterapkan *Progressive Disclosure* (`homeScopeExpanded`, `expandedTaskCardId`, `showAdvancedTechDetails`, `expandedPdfSection`), tanpa tombol QR, + kontras tinggi `#1B4332` | **MITIGATED (PASS)** |
| **RSK-02** | *Floating Bottom Pill* menutupi tombol simpan pada kamera, tanda tangan, atau modal | Kritis | Sedang | Guard `showFloatingBottom={!isAnyModalOpen}` menyembunyikan kapsul otomatis pada seluruh sub-halaman workflow & modal interaktif | **MITIGATED (PASS)** |
| **RSK-03** | Teknisi melihat atau mempengaruhi ulasan kepuasan yang diinput oleh PIC pelanggan | Kritis | Tinggi | `CustomerReviewFormModal.tsx` memisahkan `SIGN_STAGE` dan `STRICT_BLIND_EVAL_STAGE` (wajib diisi PIC, bintang awal `0`), lalu langsung membersihkan memori state lokal dan mengunci tampilan teknisi menjadi `Evaluasi PIC Klien: Terkunci & Rahasia` | **MITIGATED (PASS)** |
| **RSK-04** | Kendala lapangan teknisi (akses terkunci / PIC absen) tidak terpantau cepat oleh Admin | Tinggi | Sedang | `handleSubmitFieldIssueEscalation` menyimpan eskalasi ke `fw_field_issues_v1` yang langsung dirender di bagian atas panel **Perlu tindakan** pada `OperationsAnalyticsBento.tsx` | **MITIGATED (PASS)** |
| **RSK-05** | Kesalahan pilih obat/proyek pada Gudang akibat *default* `items[0]` | Kritis | Tinggi | `InventoryPage.tsx` mewajibkan pilihan eksplisit (`-- Pilih Barang / Obat / Alat Secara Eksplisit --`) dan menampilkan pratinjau stok sebelum/sesudah | **MITIGATED (PASS)** |

### 4.3 Hasil Eksekusi Otomatis Alpha Testing (46/46 Test Suites LULUS)

1. **Suite Kei QA/QC Phases 1–11 (`scripts/run-kei-qa-qc-phases-1-4.py`) — 26/26 PASS**:
   * `KEI-01` s.d. `KEI-13`: Konsolidasi Sidebar 10 Menu, Mode Gudang Minimalis, Isolasi Margin Direktur, Analitik Tren Bahan Kimia Cair/Padat, 4 Tab Dashboard Bento, Peta Live/Journey, 7-Day SPK Carousel, Detektor Pin Peta Pelanggan, dan Integritas Sintaks TSX (**PASS**).
   * `KEI-14` s.d. `KEI-18`: Input Pelanggan Manual, Engine 2 Mode Laporan (Kunjungan + Rekapitulasi Permenkes No. 2 Tahun 2023), Pemisahan Katalog Anti Rayap vs Pest Control, dan Fokus Hama Checkbox Dinamis (**PASS**).
   * `KEI-19` s.d. `KEI-24`: Adaptasi UI/UX Teknisi Minimalis, Penghapusan Top Tab Bar Ganda (`hideTopBar={true}`), Integrasi `RedesignFieldworkGuciMasLite`, Token Warna Hijau Dark Mode (`#4B9B70`), dan Isolasi Multi-Tenant `MASTER_SUPER_ADMIN` (**PASS**).
   * `KEI-25` (**Alpha Test Stitch UI/UX Tanpa QR, Standar Laporan Hasil Pekerjaan, Eskalasi Admin, & Floating Pill**): Verifikasi penghapusan `Pindai QR`, standarisasi istilah **Laporan Hasil Pekerjaan** (tanpa Berita Acara), integrasi eskalasi `Lapor Kendala` (`fw_field_issues_v1`) ke panel **Perlu tindakan** Admin, serta `Floating Bottom Pill` (**PASS**).
   * `KEI-26` (**Alpha Test Animasi, Gesture, & Strict Blind Evaluation PIC**): Verifikasi `AnimatePresence mode="wait"`, *swipe gesture* `drag="x"` (`handleDaySwipe`), `whileTap`, serta alur `SIGN_STAGE` -> `STRICT_BLIND_EVAL_STAGE` (wajib diisi PIC dengan bintang awal `0` dan 100% tersembunyi dari teknisi) (**PASS**).

2. **Suite Whitebox, Blackbox, & Izumi Quality Gates (`scripts/run-qa-whitebox-blackbox.py`) — 20/20 PASS**:
   * `WB-01` s.d. `WB-06`: Parser rumus volume survey (`99.5 m¹`, `1332 m²`), interpolasi garansi (`warrantyPricingEngine.ts`), kalkulasi finansial PPN/Diskon, rumus jarak Haversine (`geo.ts`), eliminasi *dynamic import*, dan proteksi *race condition* peta Leaflet (**PASS**).
   * `BB-01` s.d. `BB-14`: Autentikasi 6 Role RBAC, Alur End-to-End Quotation (`GP-DRF` -> `GP-APR`), Mutasi Stok Atomik Gudang, PostgREST RLS Policies, MoM Performance Marketing, Setup Tim Teknisi, Bulk Import Multi-Sheet, Penjadwalan SPK Rutin *Round-Robin*, dan *Geofence Auto-Anchor* (**PASS**).

**Rekomendasi Rilis Alpha (Kei QA/QC):** **`GO FOR ALPHA / USER ACCEPTANCE TESTING (UAT)`** — Seluruh 4 keputusan bisnis telah dikunci dan 46 pemeriksaan otomatis lulus penuh.