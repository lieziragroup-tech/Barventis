# Audit Navigasi, Konsolidasi Sidebar, dan Optimasi Efisiensi Workflow (Guci-App + Referensi Jarivis)

**Dokumen Spesifikasi Peningkatan Sistem (*System Enhancement Specification*)**

**Basis Kode Diaudit**: `Guci-App-main` (`src/app/App.tsx`, `src/widgets/common/AppLayout.tsx`, `src/widgets/admin/AdminDashboard.tsx`, dan 18 modul di `src/pages/*`)

**Referensi Visual Tambahan**: 14 Tangkapan Layar `beta.jarivis.com` (termasuk 4 tangkapan layar terbaru: `member/list`, `member/setting`, `tracking/location`, dan `tracking/journey`)

**Status Dokumen**: **Tahap Analisis & Rekomendasi Arsitektur (Menunggu Persetujuan Sebelum Implementasi Kode)**

## Ringkasan Eksekutif & Analisis 4 Screenshot Tambahan (`beta.jarivis.com`)

Sebelum masuk ke 9 Deliverable utama, berikut hasil bedah terhadap **4 screenshot tambahan** yang baru dilampirkan beserta cara pengintegrasiannya agar **tidak menambah panjang menu sidebar**:

| \# | Screenshot Tambahan (`beta.jarivis.com`) | Fungsi di Jarivis (Terpisah-pisah di Sidebar) | Strategi Konsolidasi & Integrasi di Guci-App | 
| ----- | ----- | ----- | ----- | 
| **11** | **`beta.jarivis.com/member/list`** (`image_b88ea3.png` — *Daftar Anggota & Target Kunjungan*) | Menampilkan tabel `NO`, `NAMA`, `TELEPON`, `EMAIL`, `TARGET KUNJUNGAN (0/0)`, tombol `Unduh Anggota`, dan tombol aksi `Target Kunjungan`. Di Jarivis ini menjadi submenu terpisah (`Daftar Anggota`) yang menduplikasi `Master Anggota`. | **INTEGRATE & MERGE**: Digabung langsung ke dalam modul **Tim, Kinerja & Akun Staf** pada tab **`Kinerja & Target Kunjungan`** (bersama metrik `executors` Guci-App: Total Pekerjaan, Selesai, Risiko Tinggi, Durasi, dan pengaturan kuota *Target Kunjungan* per teknisi/marketing). | 
| **12** | **`beta.jarivis.com/member/setting`** (`image_b88e87.png` — *Pengaturan Anggota*) | Layout *Split Master-Detail* 30:70 berisi pengaturan **Live Tracking** (toggle aktif/nonaktif, `Unduh/Unggah Template`, `Daftar Area Live Tracking`, `+ Tambah Area Live Tracking`) dan **Master Feedback**. | **CONTEXTUALIZE**: Tidak dibuatkan menu sidebar baru. Diintegrasikan sebagai tab **`Pengaturan Pelacakan & Feedback`** di dalam modul **Tim, Kinerja & Akun Staf**. | 
| **13** | **`beta.jarivis.com/tracking/location`** (`image_b88ba1.jpg` — *Pelacakan > Lokasi*) | Panel kiri daftar anggota (avatar, status `CHECK OUT` / `CHECK IN` / `ABSEN OUT` / `AUTO UPDATE`, lokasi, badge tanggal) + 3 kartu indikator keaktifan di atas peta (`0 Terakhir aktif dalam 10 menit`, `0 Aktif < 60 menit`, `6 Aktif > 60 menit`) + Peta Leaflet. | **MERGE**: Digabung dengan *Perjalanan* ke dalam 1 menu tunggal **Lacak Peta & Perjalanan (`tracking`)** menggunakan *Segmented Mode Switch* di atas peta: **`[📍 Posisi Terkini (Live)]`**. | 
| **14** | **`beta.jarivis.com/tracking/journey`** (`image_b88b80.jpg` — *Pelacakan > Perjalanan*) | Panel kiri yang 95% identik dengan menu *Lokasi* (`Cari anggota...`, kartu status & lokasi anggota) + Peta Leaflet dengan garis rute (*polyline*) dan tombol `Legenda`. | **MERGE**: Diintegrasikan sebagai mode kedua pada *Segmented Mode Switch* di halaman peta yang sama: **`[🛣️ Riwayat Perjalanan (Journey)]`**, sehingga Admin/Direktur cukup klik 1 tombol untuk beralih dari titik posisi terakhir ke garis rute perjalanan tanpa pindah halaman. | 

## Deliverable 1 — Audit Navigasi Eksisting (`Existing Navigation Audit`)

Berdasarkan inspeksi langsung pada kode sumber `src/widgets/admin/AdminDashboard.tsx` (baris 776–930) dan `src/app/App.tsx`, saat ini `Guci-App-main` memiliki **19 definisi menu (`ALL_ITEMS`)** pada Sidebar utama ditambah **2 rute form mandiri** (`/quotations/new` dan `/quotations/:id/edit`), serta **1 antarmuka khusus teknisi** (`ExecutorHome.tsx`).

| No | Nama Menu Eksisting (`label`) | ID Tab / Route | Grup Saat Ini (`group`) | Tujuan Utama Bisnis | Fitur & Fungsionalitas Eksisting | Role Pengguna (`roles`) | Dependensi Data & API | Pola Penggunaan & Potensi Konsolidasi | Risiko Restrukturisasi | 
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | 
| **1** | **Kelola Perusahaan & Token Superadmin** | `saas-companies` (`/*`) | `KONSOL PLATFORM SAAS` | Manajemen multi-tenant SaaS & kuota perusahaan | CRUD perusahaan tenant, kuota teknisi, pembuatan token undangan Superadmin/Direktur (`CompaniesPage.tsx`). | `MASTER_SUPER_ADMIN` | `companies`, `role_invite_tokens` | Terisolasi khusus pemilik platform SaaS. **Pertahankan Terpisah (`KEEP SEPARATE`)**. | Rendah (khusus role `MASTER_SUPER_ADMIN`). | 
| **2** | **Dashboard Utama & KPI** / **Dashboard Ringkasan** | `dashboard` (`/*`) | `1. RINGKASAN & APPROVAL` / `1. PENAWARAN & PELANGGAN` | Pusat komando eksekutif & operasional harian | `OperationsAnalyticsBento.tsx` (4 sub-tab: *Operation Center*, *Live Map*, *Performance Team*, *Bisnis*). | `SUPERADMIN`, `ADMIN` | `fetchAdminSummary`, `fetchAdminReports`, `fetchAdminProjects`, `fetchExecutors`, `getQuotations`, `fetchLatestLocations` | Diakses setiap kali login oleh Admin & Direktur. **Pertahankan Terpisah (`KEEP SEPARATE`)** sebagai menu teratas. | Rendah. | 
| **3** | **Approval & Pantau Penawaran** / **Buat & Cek Penawaran** | `quotation` (`/*`, `/quotations/new`, `/quotations/:id/edit`) | `1. RINGKASAN & APPROVAL` / `1. PENAWARAN & PELANGGAN` | Siklus hidup Surat Penawaran Harga (PH) AR & PCO | `QuotationPage.tsx` (sudah memiliki 4 sub-tab internal: *Daftar PH*, *Buat PH Baru*, *Pipeline Status PH* \[`StatusPHPage`\], dan *Log Nomor Surat* \[`NomorSuratLogPage`\]), tanda tangan direktur, terbit nomor `GP-APR`, dan cetak PDF. | `SUPERADMIN`, `ADMIN`, `MARKETING` | `quotations`, `quotationService.ts`, `documentConfig.ts` | Sudah terkonsolidasi dengan baik di level halaman melalui `TabContainer`. **Pertahankan Terpisah (`KEEP SEPARATE`)**. | Rendah (wajib jaga rute `/quotations/new` & `/quotations/:id/edit`). | 
| **4** | **Data Pelanggan & Kontrol** | `customers` (`/*`) | `1. PENAWARAN & PELANGGAN` | Direktori pelanggan, riwayat layanan, & titik koordinat | `CustomersPage.tsx`: agregasi pelanggan dari PH & profil, filter wilayah, import/export Excel, set koordinat (`MapPicker`), riwayat layanan AR/PCO, status garansi, dan checklist kontrol. | `ADMIN`, `MARKETING` | `quotations`, `customer_profiles`, `projects` | Berbagi entitas dan sumber data yang **sama persis** dengan `kontrol-rayap`. **Kandidat Utama `MERGE`**. | Rendah–Sedang (tambahkan akses `SUPERADMIN`). | 
| **5** | **Jadwal Garansi Rayap** | `kontrol-rayap` (`/*`) | `1. PENAWARAN & PELANGGAN` | Pemantauan masa berlaku garansi anti-rayap & jadwal kontrol berkala | `KontrolRayapPage.tsx`: daftar masa aktif garansi (`overdue`, `expiring`, `safe`), hitung mundur hari kontrol, kirim pengingat WA 1-klik, dan catat tindak lanjut kontrol. | `ADMIN`, `MARKETING` | `quotations` (kategori `AR` berstatus `deal`), `warrantyPricingEngine.ts` | **Duplikasi konteks data** dengan `customers` (`CustomersPage.tsx` juga menghitung `WarrantyInfo`). **Kandidat Utama `MERGE` ke modul Pelanggan**. | Rendah (sediakan alias tab `kontrol-rayap`). | 
| **6** | **Perintah Kerja (SPK)** | `spk-cms` (`/*`) | `1. PENAWARAN & PELANGGAN` | Penerbitan & penugasan Surat Perintah Kerja ke teknisi | `SPKPage.tsx` + `CreateSPKModal.tsx`: buat SPK dari PH Deal, pilih teknisi & jadwal, ubah status (`assigned` -> `in_progress` -> `done`), *reassign* teknisi. | `ADMIN`, `MARKETING` | `spk`, `projects`, `users`, `quotations` | Satu alur kerja langsung dengan `projects` (`Lokasi & Daftar Proyek`).Saat ini terpisah di Grup 1 dan Grup 2. **Kandidat Utama `MERGE`**. | Sedang (pastikan role `INVENTORY` tetap bisa melihat daftar proyek). | 
| **7** | **Lokasi & Daftar Proyek** | `projects` (`/*`) | `2. PEKERJAAN LAPANGAN` | Pemantauan daftar lokasi proyek kerja lapangan, radius geofence, & status kunci proyek | Seksi `activeTab === 'projects'` di `AdminDashboard.tsx`: pencarian proyek, filter layanan & status (`OPEN`/`LOCKED`), kartu detail proyek (radius, luas m², garansi, jadwal berikutnya). | `ADMIN`, `MARKETING`, `INVENTORY` | `fetchAdminProjects` (`projects` table) | Merupakan hasil hilir dari pembuatan SPK (`spk-cms`). Memisahkannya dari `spk-cms` membuat pengguna harus pindah menu untuk mengecek proyek dari SPK. **Kandidat Utama `MERGE`**. | Rendah–Sedang. | 
| **8** | **Hasil Kerja Teknisi** | `reports` (`/*`) | `2. PEKERJAAN LAPANGAN` / `2. PANTAU LAPORAN & P/L` | Pemeriksaan laporan kunjungan teknisi (Check-In/Out, foto, bahan kimia, PDF) | Seksi `activeTab === 'reports'` di `AdminDashboard.tsx`: filter periode/jam/pelaksana/proyek/risiko/status, ekspor PDF/Excel/CSV, tabel laporan, dan modal detail laporan + verifikasi Admin. | `SUPERADMIN`, `ADMIN` | `fetchAdminReports`, `fetchAdminReportDetail`, `reviewReport` | Menggunakan **komponen tabel dan modal yang 100% identik** dengan `anomalies`. **Kandidat Utama `MERGE`**. | Sangat Rendah. | 
| **9** | **Verifikasi Laporan Anomali** / **Laporan Perlu Dicek** | `anomalies` (`/*`) | `1. RINGKASAN & APPROVAL` / `2. PEKERJAAN LAPANGAN` | Memfilter laporan teknisi yang melanggar batas risiko (`FLAGGED` atau `riskScore >= 40`) | Seksi `activeTab === 'anomalies'` di `AdminDashboard.tsx`: menampilkan kotak info 3 poin kriteria anomali lalu merender tabel `reports` yang sama persis dengan filter `status === 'FLAGGED' || riskScore >= 40`. | `SUPERADMIN`, `ADMIN` | Sama persis dengan `reports` (`visibleReports` filter di memori) | **100% duplikasi halaman dengan `reports`**. Cukup dijadikan *Status Card / Filter Tab* utama di dalam modul `reports` dengan badge merah tetap tampil di sidebar. **Kandidat Utama `MERGE` / `CONTEXTUALIZE`**. | Sangat Rendah (alias `anomalies` tetap didukung). | 
| **10** | **Kinerja Teknisi** | `executors` (`/*`) | `2. PEKERJAAN LAPANGAN` / `2. PANTAU LAPORAN & P/L` | Rekapitulasi produktivitas dan kepatuhan masing-masing teknisi | Seksi `activeTab === 'executors'` di `AdminDashboard.tsx`: tabel Nama, NIP, Total Pekerjaan, Selesai, Risiko Tinggi, dan Rata-rata Durasi. | `SUPERADMIN`, `ADMIN` | `fetchExecutors` (`users` + agregasi `work_reports`) | Berbagi entitas `users` dengan menu `approval` (*Kelola Akun Staf*) dan referensi Jarivis *Master Anggota / Target Kunjungan*. **Kandidat `MERGE` ke modul Tim & Akun Staf**. | Rendah. | 
| **11** | **Lacak Posisi Teknisi** | `tracking` (`/*`) | `2. PEKERJAAN LAPANGAN` | Pemantauan titik GPS terkini teknisi & peta lokasi proyek aktif | Seksi `activeTab === 'tracking'` di `AdminDashboard.tsx`: `AllProjectsMap` + tabel koordinat terakhir (`user_locations`) + tombol *Buka di Maps*. | `ADMIN` | `fetchLatestLocations` (`user_locations`), `projects` | Perlu dibuka juga untuk `SUPERADMIN` dan digabung dengan mode *Riwayat Perjalanan (Journey)* dari referensi Jarivis (`image_b88ba1.jpg` & `image_b88b80.jpg`). **Pertahankan sebagai 1 menu Peta Terpadu (`INTEGRATE`)**. | Rendah. | 
| **12** | **Stok Obat & Alokasi Proyek** / **Analisis Untung Rugi Proyek** | `inventory` (`/*`) | `3. STOK OBAT & KEUANGAN` / `2. PANTAU LAPORAN & P/L` | Manajemen stok gudang pestisida/termisida, mutasi keluar-masuk proyek, & kalkulasi HPP Untung/Rugi | `InventoryPage.tsx`: katalog item gudang, import/export Excel, form stok masuk & alokasi keluar ke proyek (`processInventoryRPC`), log mutasi, dan tabel P/L proyek. | `SUPERADMIN`, `ADMIN`, `INVENTORY` | `inventory_items`, `inventory_logs`, `quotations`, `projects` | Modul inti untuk role `INVENTORY` (Gudang) sekaligus tempat integrasi **Tren Bahan Kimia** (Keputusan #2). **Pertahankan Terpisah (`KEEP SEPARATE`)** dengan penyederhanaan tab internal. | Rendah. | 
| **13** | **Tagihan & Cicilan Klien** | `order-tracking` (`/*`) | `3. STOK OBAT & KEUANGAN` | Pelacakan termin pembayaran AR (DP/Termin) dan tagihan kontrak bulanan PCO | `TrackingPage.tsx`: daftar tagihan dari PH Deal, status bayar (`belum_bayar`, `dp`, `lunas`, `nunggak`), generator termin AR & cicilan bulanan PCO. | `ADMIN`, `MARKETING` | `order_tracking`, `quotations` | Satu domain bisnis keuangan/komersial dengan `cashflow` dan `performa`. **Kandidat Utama `MERGE` ke modul Keuangan & Performa**. | Rendah (tambahkan akses `SUPERADMIN` & filter role untuk tab internal). | 
| **14** | **Laporan Pemasukan & Cashflow** | `cashflow` (`/*`) | `3. STOK OBAT & KEUANGAN` / `2. PANTAU LAPORAN & P/L` | Rekapitulasi nilai penawaran Approved vs Deal bulanan per kategori (AR/PCO) & per Marketing | `CashflowPage.tsx`: kartu ringkasan pendapatan, grafik batang bulanan Approved vs Deal, rincian per staf Marketing, dan daftar transaksi. | `SUPERADMIN`, `ADMIN` | `quotations` (`approved` & `deal`) | Berbagi sumber data `quotations` yang sama dengan `order-tracking` dan `performa`. **Kandidat Utama `MERGE` ke modul Keuangan & Performa**. | Rendah. | 
| **15** | **Performa MoM & Capaian** | `performa` (`/*`) | `3. STOK OBAT & KEUANGAN` / `2. PANTAU LAPORAN & P/L` | Evaluasi rasio konversi survei/PH (`approval_pct`, `deal_pct`) dari bulan ke bulan (*Month-over-Month*) | `PerformaPage.tsx`: konfigurasi target bulanan marketing, grafik tren 3/6/12 bulan, kartu *team performance*, dan indikator kenaikan/penurunan MoM. | `SUPERADMIN`, `ADMIN`, `MARKETING` | `quotations`, `marketing_targets` | Berbagi konteks evaluasi pendapatan/konversi dengan `cashflow` dan `order-tracking`. **Kandidat Utama `MERGE` ke modul Keuangan & Performa**. | Rendah. | 
| **16** | **Kop Surat & TTD Direktur** | `templates` (`/*`) | `4. PENGATURAN` / `3. SETUP PERUSAHAAN` | Kustomisasi identitas dokumen resmi perusahaan (Kop, Logo, Warna, TTD, Format Nomor) | `TemplateSettingsPanel.tsx`: pratinjau langsung dokumen PH, unggah logo & stempel/TTD, format nomor surat otomatis. | `SUPERADMIN`, `ADMIN` | `company_templates` | Merupakan konfigurasi sistem perusahaan bersama `risk-config` dan `audit`. **Kandidat Utama `MERGE` ke modul Pengaturan & Audit Sistem**. | Rendah. | 
| **17** | **Kelola Akun Staf** | `approval` (`/*`) | `4. PENGATURAN` / `3. SETUP PERUSAHAAN` | Pembuatan akun karyawan baru, tautan undangan mandiri 7 hari, serta aktivasi/suspensi akun | Seksi `activeTab === 'approval'` di `AdminDashboard.tsx`: form tambah user langsung, generator link invite (`role_invite_tokens`), daftar akun aktif/ditangguhkan. | `SUPERADMIN`, `ADMIN` | `users`, `role_invite_tokens` | Terpisah jauh di Grup 4 padahal mengelola entitas SDM yang sama dengan `executors` (*Kinerja Teknisi*) dan *Master Anggota* Jarivis. **Kandidat Utama `MERGE` ke modul Tim, Kinerja & Akun Staf**. | Rendah. | 
| **18** | **Aturan Poin Kehadiran** | `risk-config` (`/*`) | `4. PENGATURAN` | Pengaturan bobot skor risiko keterlambatan/radius GPS & retensi penghapusan file foto lama | `RiskConfigPanel` + `PhotoRetentionPanel` di `AdminDashboard.tsx`: ubah batas menit/meter/poin risiko, reset ke bawaan, dan hapus file foto > N bulan. | `ADMIN` (perlu dibuka juga untuk `SUPERADMIN`) | `risk_config`, `documentation_photos` | Konfigurasi operasional yang sejenis dengan `templates` dan `audit`. **Kandidat Utama `MERGE` ke modul Pengaturan & Audit Sistem**. | Rendah. | 
| **19** | **Riwayat Audit Sistem** | `audit` (`/*`) | `4. PENGATURAN` / `3. SETUP PERUSAHAAN` | Log keamanan atas seluruh perubahan data dan aksi sensitif pengguna | Seksi `activeTab === 'audit'` di `AdminDashboard.tsx`: daftar kronologis aksi user, role, waktu WIB, dan rincian perubahan. | `SUPERADMIN`, `ADMIN` | `audit_logs` (`fetchAuditLogs`) | Bagian dari tata kelola & administrasi sistem. **Kandidat Utama `MERGE` ke modul Pengaturan & Audit Sistem**. | Rendah. | 
| **20** | **Profil Saya** | `profile` (`/*`) | `4. PENGATURAN` / `3. SETUP PERUSAHAAN` | Informasi akun pengguna yang sedang login, pengubah tema (Terang/Gelap/Sistem), & ganti password | Seksi `activeTab === 'profile'` di `AdminDashboard.tsx` + `ChangePasswordModal.tsx`. | Semua Role (`MASTER_SUPER_ADMIN`, `SUPERADMIN`, `ADMIN`, `MARKETING`, `INVENTORY`) | `useAuth`, `useTheme`, `/api/auth/change-password` | Dapat diakses langsung dari klik profil di Header atas maupun tab di dalam Pengaturan tanpa harus memakan baris menu terpisah bagi Admin/Direktur. **Kandidat `CONTEXTUALIZE` / `INTEGRATE`**. | Sangat Rendah. | 

## Deliverable 2 — Analisis Masalah Navigasi (`Navigation Problem Analysis`)

Dari audit kode sumber `Guci-App-main` dan komparasi terhadap `beta.jarivis.com`, ditemukan **7 masalah struktural utama** yang membebani kecepatan kerja pengguna:

1. **Duplikasi Halaman 100% pada Menu Sidebar (`reports` vs `anomalies`)**:

   * **Temuan Kode**: Di `AdminDashboard.tsx` baris 1195, ekspresi `(activeTab === 'reports' || activeTab === 'anomalies')` merender komponen pencarian, *filter drawer*, tabel 10 kolom, dan modal detail yang **100% sama**. Perbedaannya hanyalah `anomalies` menyaring `status === 'FLAGGED' || riskScore >= 40` di memori.

   * **Dampak UX**: Memisahkan keduanya menjadi 2 menu berbeda (bahkan bagi Direktur diletakkan di grup yang berbeda: `anomalies` di Grup 1, `reports` di Grup 2) memaksa pengguna berpindah halaman hanya untuk mengganti filter status laporan.

2. **Fragmentasi Satu Alur Kerja ke Grup Sidebar yang Berbeda (`spk-cms` di Grup 1 vs `projects` di Grup 2)**:

   * **Temuan Kode**: Saat Admin/Marketing menerbitkan SPK di `Perintah Kerja (SPK)` (`spk-cms`, Grup 1), sistem membuat/memperbarui data proyek kerja lapangan. Namun untuk melihat daftar lokasi proyek, status *Terbuka/Terkunci*, dan radius *geofence*-nya, pengguna harus pindah ke grup lain yaitu `Lokasi & Daftar Proyek` (`projects`, Grup 2).

   * **Dampak UX**: Memutus alur kerja penugasan lapangan (*Task Lifecycle Fragmentation*).

3. **Pemisahan Entitas Pelanggan & Garansi yang Berbagi Sumber Data Identik (`customers` vs `kontrol-rayap`)**:

   * **Temuan Kode**: `CustomersPage.tsx` dan `KontrolRayapPage.tsx` sama-sama memanggil `getQuotations()` dan menghitung masa berlaku garansi menggunakan `warrantyToTotalMonths()`. Bahkan `CustomersPage.tsx` sudah memiliki struktur `WarrantyInfo` dan `ControlChecklist`.

   * **Dampak UX**: Staf Admin/Marketing harus membuka dua menu berbeda untuk melihat profil pelanggan dan jadwal kontrol garansi rayap milik pelanggan yang sama.

4. **Pemisahan Manajemen Akun Staf dan Evaluasi Kinerja/Target Staf (`approval` di Grup 4 vs `executors` di Grup 2)**:

   * **Temuan Kode & Referensi Jarivis**: Di `Guci-App-main`, menambah/menonaktifkan staf berada di `Kelola Akun Staf` (`approval`, Grup 4), sedangkan memantau kinerja teknisi berada di `Kinerja Teknisi` (`executors`, Grup 2). Sementara di `beta.jarivis.com` (`image_b8a10c.jpg`, `image_b88ea3.png`, `image_b88e87.png`), menu `Anggota` dipecah menjadi **7 submenu** (*Master Anggota*, *Detail Anggota*, *Grup Anggota*, *Daftar Anggota*, *Pengaturan Anggota*, *Umpan Balik*, *Akses Menu Template*).

   * **Dampak UX**: Baik pendekatan terpisah di Grup 2 & 4 maupun 7 submenu di Jarivis membuat manajemen SDM terlalu tersebar.

5. **Duplikasi Peta Pelacakan Lokasi vs Riwayat Perjalanan (`tracking/location` vs `tracking/journey` pada Screenshot 13 & 14)**:

   * **Temuan Referensi Jarivis**: Pada `image_b88ba1.jpg` (`/tracking/location`) dan `image_b88b80.jpg` (`/tracking/journey`), panel daftar teknisi di sebelah kiri dan komponen Peta Leaflet di sebelah kanan adalah komponen yang sama, hanya berbeda pada *layer* yang digambar di atas peta (pin posisi terakhir vs garis *polyline* rute harian).

   * **Dampak UX**: Memisahkan *Lokasi* dan *Perjalanan* menjadi 2 menu sidebar mengharuskan pengguna memilih ulang nama teknisi ketika ingin mengecek rute perjalanannya.

6. **Pencampuran Modul Gudang Fisik dengan Modul Keuangan & Target Marketing di Grup 3**:

   * **Temuan Kode**: Grup 3 (`3. STOK OBAT & KEUANGAN`) mencampurkan `Stok Obat & Alokasi Proyek` (`inventory`) dengan 3 menu keuangan/marketing (`Tagihan & Cicilan Klien`, `Laporan Pemasukan & Cashflow`, dan `Performa MoM & Capaian`).

   * **Dampak UX**: Ketiga menu keuangan/performa tersebut sebenarnya membaca sumber data yang sama (`quotations` yang berstatus `approved` dan `deal`), sedangkan `inventory` mengelola stok fisik gudang (`inventory_items` & `inventory_logs`).

7. **Menu Pengaturan Sistem yang Terlalu Terpecah di Grup 4 (`templates`, `approval`, `risk-config`, `audit`, `profile`)**:

   * **Temuan Kode**: Terdapat 5 item di bagian bawah sidebar untuk fungsi konfigurasi yang jarang diubah setiap jam (`Kop Surat`, `Aturan Poin`, `Riwayat Audit`, `Profil`, `Akun Staf`), sehingga memaksa pengguna melakukan *scroll* vertikal pada sidebar.

## Deliverable 3 — Matriks Konsolidasi Menu (`Menu Consolidation Matrix`)

Setiap keputusan di bawah ini dievaluasi menggunakan **10 kriteria Merger Decision Framework** (*MERGE*, *INTEGRATE*, *REORGANIZE*, *CONTEXTUALIZE*, *KEEP SEPARATE*, *DEFER*) dengan jaminan **0% fitur hilang**:

| Menu Eksisting / Fitur Referensi | Fungsionalitas Saat Ini | Kategori Baru yang Diusulkan | Destinasi Halaman / Modul | Keputusan (`Action`) | Alasan Bisnis & UX (`Reason`) | Risiko (`Risk`) | Dampak Izin Akses (`Permission Impact`) | Kompleksitas (`Complexity`) | Perlu Persetujuan? | 
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | 
| **1. `saas-companies`** (*Kelola Perusahaan & Token*) | Manajemen tenant SaaS & token Superadmin | `KONSOL PLATFORM SAAS` | `CompaniesPage.tsx` (Menu Mandiri) | **KEEP SEPARATE** | Hanya digunakan oleh `MASTER_SUPER_ADMIN`; tidak boleh dicampur dengan menu operasional tenant. | Tidak Ada | Tetap khusus `MASTER_SUPER_ADMIN`. | Rendah | Ya | 
| **2. `dashboard`** (*Dashboard Utama & KPI*) | `OperationsAnalyticsBento` (4 tab: *Operation Center*, *Live Map*, *Performance Team*, *Bisnis*) | `1. KOMERSIAL & PELANGGAN` (Urutan #1 Teratas) | `OperationsAnalyticsBento.tsx` (Menu Mandiri #1) | **KEEP SEPARATE** | Pusat komando utama yang langsung dibuka saat Admin/Direktur login. | Tidak Ada | Dikunci khusus `SUPERADMIN` & `ADMIN` (sesuai Keputusan #1). | Rendah | Ya | 
| **3. `quotation`** (*Buat & Approval Penawaran*) | Daftar PH, Buat PH Baru, Approval TTD Direktur, Pipeline Status PH, Log Nomor Surat | `1. KOMERSIAL & PELANGGAN` | `QuotationPage.tsx` (Menu Mandiri #2) | **KEEP SEPARATE** | Sudah mengintegrasikan 4 sub-fitur secara rapi melalui `TabContainer` internal. | Tidak Ada | Tetap `SUPERADMIN`, `ADMIN`, `MARKETING`. | Rendah | Ya | 
| **4. `customers`** (*Data Pelanggan & Kontrol*) | Direktori pelanggan, koordinat GPS, import/export Excel, riwayat layanan | `1. KOMERSIAL & PELANGGAN` | Modul Terpadu: **Pelanggan & Garansi (`customers`)** — Tab 1: *Master Pelanggan* | **MERGE** (dengan `kontrol-rayap`) | Menyatukan seluruh siklus hidup pelanggan dalam satu tempat tanpa pindah menu. | Rendah | Tambahkan `SUPERADMIN` (Direktur) agar bisa memantau analisis pelanggan. | Rendah | Ya | 
| **5. `kontrol-rayap`** (*Jadwal Garansi Rayap*) | Pantau masa garansi AR, hitung mundur kontrol, pengingat WA 1-klik, catat hasil kontrol | `1. KOMERSIAL & PELANGGAN` | Modul Terpadu: **Pelanggan & Garansi (`customers`)** — Tab 2: *Jadwal Garansi Rayap* | **MERGE** (ke dalam `customers`) | Membaca sumber data `quotations` yang sama persis dengan `customers`. Menghemat 1 menu sidebar & mempercepat tindak lanjut garansi. | Rendah (alias tab `kontrol-rayap` tetap aktif) | Tetap `SUPERADMIN`, `ADMIN`, `MARKETING`. | Rendah | Ya | 
| **Ref. Jarivis: `customer/analysis` & `customer/setting`** (Screenshot 2 & 3) | Peta sebaran pelanggan, detektor **Pelanggan Tanpa Pin Point Map**, & pengingat kontrak H-14/H-30 | `1. KOMERSIAL & PELANGGAN` | Modul Terpadu: **Pelanggan & Garansi (`customers`)** — Tab 3 (*Peta & Analisis*) & Tab 4 (*Pengaturan Kontrak*) | **INTEGRATE** (ke dalam `customers`) | Menambahkan kecerdasan spasial & peringatan kontrak langsung di modul Pelanggan tanpa menambah submenu sidebar seperti di Jarivis. | Rendah | `SUPERADMIN`, `ADMIN`, `MARKETING` (Tab Pengaturan khusus `ADMIN`/`SUPERADMIN`). | Sedang | Ya | 
| **6. `spk-cms`** (*Perintah Kerja / SPK*) | Buat SPK dari PH Deal, jadwal teknisi, update status SPK, *reassign* teknisi | `2. OPERASIONAL & LAPANGAN` | Modul Terpadu: **Penugasan & Proyek (SPK) (`spk-cms`)** — Tab 1: *Jadwal & Daftar SPK (7-Day Carousel)* | **MERGE** (dengan `projects`) | Menyatukan pembuatan perintah kerja (SPK) dengan pemantauan proyek lapangan yang dihasilkan. | Rendah | `SUPERADMIN`, `ADMIN`, `MARKETING`. | Sedang | Ya | 
| **7. `projects`** (*Lokasi & Daftar Proyek*) | Daftar proyek lapangan, status Terbuka/Terkunci, radius geofence, luas m², jadwal berkala | `2. OPERASIONAL & LAPANGAN` | Modul Terpadu: **Penugasan & Proyek (SPK) (`spk-cms`)** — Tab 2: *Lokasi & Radius Proyek* | **MERGE** (ke dalam `spk-cms`) | Menghilangkan lompatan antar Grup 1 dan Grup 2 saat Admin mengecek proyek dari SPK. | Rendah (alias `projects` tetap aktif) | Untuk role `INVENTORY`, menu ini langsung membuka Tab 2 (*Lokasi Proyek*) secara *read-only*. | Sedang | Ya | 
| **Ref. Jarivis: `task/calendar`, `task/analytics`, `task/type`, `task/setting`** (Screenshot 4, 5, 7, 8, 9) | Kalender Timeline Teknisi, Heatmap 12 Bulan, Matriks SOP Tipe Tugas, & Pratinjau Peta Radius Geofence | `2. OPERASIONAL & LAPANGAN` | Modul Terpadu: **Penugasan & Proyek (SPK) (`spk-cms`)** — Tab 3 (*Kalender Timeline*) & Tab 4 (*Analitik Heatmap & SOP*) | **INTEGRATE** (ke dalam `spk-cms`) | Menggantikan **7 submenu Tugas di Jarivis** menjadi 4 tab kerja yang cepat di dalam satu modul Penugasan. | Rendah | `SUPERADMIN`, `ADMIN`, `MARKETING` (SOP & Radius khusus `ADMIN`/`SUPERADMIN`). | Sedang | Ya | 
| **8. `reports`** (*Hasil Kerja Teknisi*) | Tabel laporan kunjungan lapangan, filter lengkap, ekspor PDF/Excel/CSV, modal detail & verifikasi | `2. OPERASIONAL & LAPANGAN` | Modul Terpadu: **Hasil & Verifikasi Kerja (`reports`)** | **MERGE** (dengan `anomalies`) | Merupakan halaman yang 100% sama dengan `anomalies`. Dilengkapi 5 kartu ringkasan status warna solid ala *Task Monitoring* Jarivis (Screenshot 6). | Sangat Rendah | Tetap `SUPERADMIN` & `ADMIN`. | Rendah | Ya | 
| **9. `anomalies`** (*Verifikasi Laporan Anomali*) | Filter laporan berstatus `FLAGGED` atau `riskScore >= 40` beserta banner kriteria anomali | `2. OPERASIONAL & LAPANGAN` | Modul Terpadu: **Hasil & Verifikasi Kerja (`reports`)** — Kartu/Filter Cepat **`⚠️ Perlu Verifikasi / Anomali`** | **CONTEXTUALIZE & MERGE** | Menghapus duplikasi menu sidebar sambil mempertahankan **Badge Merah jumlah anomali** pada menu `Hasil & Verifikasi Kerja` di sidebar. | Sangat Rendah (klik dari Dashboard otomatis mengaktifkan filter Anomali) | Tetap `SUPERADMIN` & `ADMIN`. | Rendah | Ya | 
| **10. `tracking`** (*Lacak Posisi Teknisi*) + **Ref. Jarivis `tracking/location` & `tracking/journey`** (Screenshot 13 & 14) | Peta lokasi terkini teknisi (`user_locations`), 3 kartu keaktifan (`<10m`, `<60m`, `>60m`), & garis rute perjalanan (*Journey Polyline*) | `2. OPERASIONAL & LAPANGAN` | Modul Terpadu: **Lacak Peta & Perjalanan (`tracking`)** dengan *Segmented Switch*: `[📍 Posisi Terkini]` | `[🛣️ Riwayat Perjalanan]` | **MERGE & INTEGRATE** | Menggabungkan 2 menu terpisah di Jarivis (*Lokasi* & *Perjalanan*) ke dalam 1 peta interaktif sehingga Admin tidak perlu memilih ulang teknisi. | Sangat Rendah | Dibuka untuk `SUPERADMIN` & `ADMIN` (sebelumnya `SUPERADMIN` tidak melihat menu `tracking`). | Rendah | Ya | 
| **11. `inventory`** (*Stok Obat & Alokasi Proyek*) + **Tren Bahan Kimia** | Mode Kerja Gudang Minimalis (Stok Masuk/Keluar 1-Klik), Alokasi Proyek, Tren Bahan Kimia, & Analisis Untung Rugi (P/L) | `3. GUDANG, KEUANGAN & SISTEM` | Modul Terpadu: **Gudang, Alokasi & Tren Kimia (`inventory`)** | **KEEP SEPARATE & INTEGRATE** | Sesuai Keputusan #2, modul Gudang dioptimalkan menjadi super simpel untuk staf `INVENTORY`, ditambah tab *Tren Bahan Kimia* & *Untung Rugi Proyek*. | Rendah | `SUPERADMIN`, `ADMIN`, `INVENTORY` (Tab Untung Rugi P/L disembunyikan dari `INVENTORY`). | Sedang | Ya | 
| **12. `order-tracking`** (*Tagihan & Cicilan Klien*) | Pelacakan status bayar DP/Termin AR & cicilan kontrak bulanan PCO | `3. GUDANG, KEUANGAN & SISTEM` | Modul Terpadu: **Keuangan, Tagihan & Performa (`finance-hub`)** — Tab 1: *Tagihan & Cicilan Klien* | **MERGE** (dengan `cashflow` & `performa`) | Menyatukan seluruh tindak lanjut piutang klien, arus kas masuk, dan capaian target bulanan dalam satu pusat keuangan. | Rendah (alias `order-tracking` tetap aktif) | `SUPERADMIN`, `ADMIN`, `MARKETING`. | Rendah | Ya | 
| **13. `cashflow`** (*Laporan Pemasukan & Cashflow*) | Rekapitulasi omzet Approved vs Deal bulanan AR/PCO & rincian per Marketing | `3. GUDANG, KEUANGAN & SISTEM` | Modul Terpadu: **Keuangan, Tagihan & Performa (`finance-hub`)** — Tab 2: *Pemasukan & Cashflow* | **MERGE** (ke dalam `finance-hub`) | Berbagi sumber data `quotations` yang sama dengan `order-tracking` dan `performa`. | Rendah (alias `cashflow` tetap aktif) | Tab ini khusus `SUPERADMIN` & `ADMIN` (tersembunyi bagi `MARKETING`). | Rendah | Ya | 
| **14. `performa`** (*Performa MoM & Capaian*) | Evaluasi konversi bulanan (MoM) & target tim marketing | `3. GUDANG, KEUANGAN & SISTEM` | Modul Terpadu: **Keuangan, Tagihan & Performa (`finance-hub`)** — Tab 3: *Performa MoM & Target* | **MERGE** (ke dalam `finance-hub`) | Menyatukan evaluasi target konversi dengan realisasi cashflow & tagihan. | Rendah (alias `performa` tetap aktif) | `SUPERADMIN`, `ADMIN`, `MARKETING`. | Rendah | Ya | 
| **15. `executors`** (*Kinerja Teknisi*) + **16. `approval`** (*Kelola Akun Staf*) + **Ref. Jarivis `member`, `member/list`, `member/setting`** (Screenshot 10, 11, 12) | Buat akun staf, link invite 7 hari, tabel kinerja teknisi, **Target Kunjungan (`0/0`)**, indikator perangkat/Geofence, & pengaturan Live Tracking | `3. GUDANG, KEUANGAN & SISTEM` | Modul Terpadu: **Tim, Kinerja & Akun Staf (`team-hub`)** — Tab 1 (*Direktori & Akun Staf*), Tab 2 (*Kinerja & Target Kunjungan*), Tab 3 (*Pengaturan Tracking & Feedback*) | **MERGE & INTEGRATE** | Menggabungkan 2 menu Guci-App (`executors` + `approval`) dan **7 submenu Anggota Jarivis** menjadi 1 pusat manajemen SDM yang utuh. | Rendah (alias `executors` & `approval` tetap aktif) | Khusus `SUPERADMIN` & `ADMIN` (proteksi akun sesama Admin oleh Direktur tetap berlaku 100%). | Sedang | Ya | 
| **17. `templates`** (*Kop Surat & TTD*) + **18. `risk-config`** (*Aturan Poin & Retensi Foto*) + **19. `audit`** (*Riwayat Audit*) + **20. `profile`** (*Profil & Tema*) | Pengaturan kop surat/TTD, bobot poin risiko kehadiran, penghapusan file foto lama, log audit sistem, serta profil & tema pengguna | `3. GUDANG, KEUANGAN & SISTEM` | Modul Terpadu: **Pengaturan, Kop & Audit (`settings-hub`)** — Tab 1 (*Kop Surat & TTD*), Tab 2 (*Aturan Poin & Retensi Foto*), Tab 3 (*Riwayat Audit*), Tab 4 (*Profil & Tema Saya*) | **MERGE & CONTEXTUALIZE** | Mengurangi 4 menu pengaturan di bawah sidebar menjadi **1 menu Pengaturan Terpadu**, ditambah akses cepat *Profil & Tema* dari klik nama/avatar pengguna di Header atas. | Sangat Rendah (alias `templates`, `risk-config`, `audit`, `profile` tetap aktif) | Tab 1–3 khusus `SUPERADMIN` & `ADMIN`; Tab 4 (*Profil & Tema*) terbuka untuk **semua role**. | Rendah | Ya | 

## Deliverable 4 — Perbandingan Sidebar Sebelum & Sesudah (`Before and After Sidebar`)

Perhitungan di bawah ini didasarkan **100% pada kode aktual `AdminDashboard.tsx`** dan struktur `beta.jarivis.com`:

### 1. Struktur Sidebar Saat Ini (`Before` — 18 Menu untuk Admin di `Guci-App-main` / 28+ Item di `beta.jarivis.com`)

```
[SIDEBAR SAAT INI DI GUCI-APP-MAIN — ROLE: ADMIN (18 ITEM TOP-LEVEL DALAM 4 GRUP)]
├── GRUP 1: PENAWARAN & PELANGGAN (5 Item)
│   ├── 1. Dashboard Ringkasan (dashboard)
│   ├── 2. Buat & Cek Penawaran (quotation)
│   ├── 3. Data Pelanggan & Kontrol (customers)
│   ├── 4. Jadwal Garansi Rayap (kontrol-rayap)          <-- Duplikasi konteks dengan #3
│   └── 5. Perintah Kerja / SPK (spk-cms)                <-- Terpisah dari #6 di Grup 2
├── GRUP 2: PEKERJAAN LAPANGAN (5 Item)
│   ├── 6. Lokasi & Daftar Proyek (projects)             <-- Hasil langsung dari #5
│   ├── 7. Hasil Kerja Teknisi (reports)
│   ├── 8. Laporan Perlu Dicek / Anomali (anomalies)     <-- Komponen 100% sama dengan #7
│   ├── 9. Kinerja Teknisi (executors)                   <-- Terpisah dari #15 di Grup 4
│   └── 10. Lacak Posisi Teknisi (tracking)
├── GRUP 3: STOK OBAT & KEUANGAN (4 Item)
│   ├── 11. Stok Obat & Alokasi Proyek (inventory)
│   ├── 12. Tagihan & Cicilan Klien (order-tracking)     <-- Satu domain dengan #13 & #14
│   ├── 13. Laporan Pemasukan & Cashflow (cashflow)
│   └── 14. Performa MoM & Capaian (performa)
└── GRUP 4: PENGATURAN (4 Item)
    ├── 15. Kop Surat & TTD Direktur (templates)
    ├── 16. Kelola Akun Staf (approval)
    ├── 17. Aturan Poin Kehadiran (risk-config)
    ├── 18. Riwayat Audit Sistem (audit)
    └── 19. Profil Saya (profile)                        <-- (Total 18 item untuk ADMIN; 19 di ALL_ITEMS)

```

### 2. Struktur Sidebar Baru yang Diusulkan (`After` — 9 Menu Utama Terfokus, 0 Submenu Bertingkat)

```
[SIDEBAR USULAN TERKONSOLIDASI — GUCI-APP (MAKSIMAL 9 ITEM TOP-LEVEL DALAM 3 GRUP LOGIS)]
🔍 [ Cari menu atau fitur... (Filter Instan) ]

├── 1. KOMERSIAL & PELANGGAN (3 Item)
│   ├── 1. Dashboard Utama & Analitik (dashboard)
│   │      └── [In-Page Tabs: Operation Center | Live Map | Performance Team | Bisnis]
│   ├── 2. Penawaran Harga / PH (quotation)
│   │      └── [In-Page Tabs: Daftar & Approval PH | Buat PH | Pipeline Status | Log Nomor Surat]
│   └── 3. Pelanggan & Garansi (customers + kontrol-rayap)
│          └── [In-Page Tabs: Master Pelanggan | Jadwal Garansi Rayap | Peta & Analisis Pin | Pengaturan Kontrak]
│
├── 2. OPERASIONAL & LAPANGAN (3 Item)
│   ├── 4. Penugasan & Proyek / SPK (spk-cms + projects)
│   │      └── [In-Page Tabs: Jadwal SPK (7-Day Carousel) | Lokasi & Radius Proyek | Kalender Timeline | Analitik & SOP]
│   ├── 5. Hasil & Verifikasi Kerja (reports + anomalies) [🔴 Badge Anomali Aktif]
│   │      └── [In-Page Status Cards: Semua | ⚠️ Perlu Verifikasi (Anomali) | Selesai | Sedang Kerja | Ditunda]
│   └── 6. Lacak Peta & Perjalanan (tracking)
│          └── [In-Page Map Switch: 📍 Posisi Terkini (Live + 3 Kartu Keaktifan) | 🛣️ Riwayat Perjalanan (Journey)]
│
└── 3. GUDANG, KEUANGAN & SISTEM (3 Item)
    ├── 7. Gudang, Alokasi & Tren Kimia (inventory)
    │      └── [In-Page Tabs: Stok Gudang Minimalis (1-Klik) | Alokasi Proyek | Tren Bahan Kimia | Untung Rugi (P/L)]
    ├── 8. Keuangan, Tagihan & Performa (finance-hub: order-tracking + cashflow + performa)
    │      └── [In-Page Tabs: Tagihan & Cicilan Klien | Pemasukan & Cashflow | Performa MoM & Target]
    └── 9. Tim, Pengaturan & Sistem (atau dipisah menjadi #9 Tim & Akun Staf + #10 Pengaturan & Audit)
           ├── 9A. Tim, Kinerja & Akun Staf (team-hub: approval + executors + Target Kunjungan + Area Tracking)
           └── 9B. Pengaturan, Kop & Audit (settings-hub: Kop & TTD | Aturan Poin & Foto | Audit Log | Profil & Tema)

```

*(Catatan Arsitektur: Memisahkan **#9 Tim, Kinerja & Akun Staf** dan **#10 Pengaturan, Kop & Audit** menghasilkan tepat **10 item top-level** bagi Admin/Direktur—turun **44,4%** dari 18 item di Guci-App dan turun **64%** dari 28+ item di `beta.jarivis.com`—tanpa mencampur urusan SDM harian dengan konfigurasi teknis sistem).*

### 3. Tabel Kuantitatif Before vs After Berdasarkan Kode Aktual

| Indikator Struktur Navigasi | Kondisi Saat Ini (`Guci-App-main`) | Referensi `beta.jarivis.com` | Usulan Baru (`Optimized Guci-App`) | Dampak Efisiensi Nyata | 
| ----- | ----- | ----- | ----- | ----- | 
| **Jumlah Item Sidebar (`ADMIN`)** | **18 item** | **28+ item & submenu** | **10 item** (atau 9 jika Pengaturan di-footer) | **Pengurangan 8 menu sidebar (-44,4%)** tanpa perlu *scroll* panjang di sidebar desktop. | 
| **Jumlah Item Sidebar (`SUPERADMIN` / Direktur)** | **12 item** | **28+ item & submenu** | **10 item** (Kini mencakup akses ke *Pelanggan*, *SPK/Proyek*, dan *Lacak Peta*) | Direktur mendapat visibilitas penuh ke seluruh modul dengan jumlah menu yang justru lebih ringkas (**-16,7%**). | 
| **Jumlah Item Sidebar (`MARKETING`)** | **7 item** (`quotation`, `customers`, `kontrol-rayap`, `spk-cms`, `projects`, `order-tracking`, `performa`, `profile`) | Tidak terdefinisi khusus | **4 item utama** (`Penawaran Harga`, `Pelanggan & Garansi`, `Penugasan & Proyek SPK`, `Tagihan & Performa`) + `Profil` di Header | **Pengurangan 43% menu sidebar** untuk Marketing; seluruh alur dari PH -> Pelanggan -> SPK -> Tagihan berurutan dari atas ke bawah. | 
| **Jumlah Item Sidebar (`INVENTORY` / Gudang)** | **3 item** (`projects`, `inventory`, `profile`) | Tidak terdefinisi khusus | **2 item kerja** (`Gudang, Alokasi & Tren Kimia` dan `Lokasi Proyek`) + `Profil` di Header | Staf Gudang langsung masuk ke tampilan **Stok Minimalis** tanpa terdistraksi menu lain. | 
| **Kedalaman Submenu Sidebar (*Nested Depth*)** | 1 level (datar namun panjang) | **2–3 level** (Accordion `Tugas` 7 item, `Anggota` 7 item, `Pelanggan` 3 item) | **1 level di Sidebar + 1 level In-Page `TabContainer`** | **0 klik buka-tutup accordion di sidebar**; perpindahan sub-fitur berlangsung instan di dalam halaman (`< 50ms`). | 

## Deliverable 5 — Optimasi Alur Kerja Pengguna (`Optimized User Workflow`)

Berikut adalah perbandingan langkah navigasi (*click & page transition audit*) untuk **5 alur kerja operasional harian paling kritis**:

### Workflow 1: Pemeriksaan & Verifikasi Laporan Kerja Teknisi (Normal vs Anomali)

* **Alur Saat Ini**:

  1. Admin membuka `Hasil Kerja Teknisi` (`reports` di Grup 2) untuk memeriksa laporan harian.

  2. Untuk memeriksa laporan yang melanggar radius/durasi, Admin harus membuka sidebar -> pindah ke `Laporan Perlu Dicek` (`anomalies` di Grup 1 atau 2).

  3. Untuk kembali melihat semua laporan, Admin harus klik sidebar lagi ke `Hasil Kerja Teknisi`.

* **Inefisiensi**: 2 menu terpisah merender komponen kode yang 100% sama.

* **Alur Baru yang Diusulkan**:

  1. Admin membuka **Hasil & Verifikasi Kerja (`reports`)** (yang menampilkan *badge* merah jumlah anomali di sidebar).

  2. Di bagian atas halaman terdapat **5 Kartu Status Warna Solid** (seperti *Task Monitoring* `image_b8a188.png`: `Semua`, `⚠️ Perlu Verifikasi / Anomali`, `Selesai`, `Sedang Kerja`, `Ditunda/Dibatalkan`).

  3. Klik 1x pada kartu **`⚠️ Perlu Verifikasi / Anomali`** langsung menyaring tabel secara instan di halaman yang sama dan memunculkan tombol aksi cepat **`Verifikasi Sekarang`** pada tiap baris.

* **Manfaat & Validasi**: Mengurangi perpindahan menu dari 3 langkah menjadi 1 klik filter instan; aturan otorisasi `reviewReport` tetap divalidasi di backend.

### Workflow 2: Penerbitan SPK hingga Pemantauan Lokasi & Radius Proyek Lapangan

* **Alur Saat Ini**:

  1. Admin/Marketing membuka `Perintah Kerja (SPK)` (`spk-cms` di Grup 1) -> klik `+ Buat SPK`.

  2. Setelah SPK terbit, untuk mengecek apakah proyek lapangan sudah terbuka (`OPEN`), berapa meter radius *geofence*-nya, atau melihat jadwal layanan berkala berikutnya, pengguna harus membuka sidebar -> *scroll* ke Grup 2 -> klik `Lokasi & Daftar Proyek` (`projects`).

* **Inefisiensi**: Pemisahan SPK dan Proyek di dua grup berbeda padahal SPK adalah pemicu proyek.

* **Alur Baru yang Diusulkan**:

  1. Pengguna membuka **Penugasan & Proyek (SPK) (`spk-cms`)**.

  2. Tab 1 (**Jadwal & Daftar SPK**) menampilkan *7-Day Date Carousel* (`Min`–`Sab`) beserta status SPK; setiap kartu SPK memiliki tombol kontekstual langsung **`📍 Lihat Proyek & Radius`** yang membuka panel/Tab 2 (**Lokasi & Radius Proyek**) tanpa keluar dari modul.

  3. Jika perlu mengatur ulang jadwal teknisi secara visual, pengguna cukup klik Tab 3 (**Kalender Timeline Teknisi**).

* **Manfaat & Validasi**: Menghemat 2–3 kali perpindahan halaman setiap kali menerbitkan dan memverifikasi penugasan baru.

### Workflow 3: Pengelolaan Data Pelanggan, Koordinat Peta, & Tindak Lanjut Garansi Rayap

* **Alur Saat Ini**:

  1. Staf membuka `Data Pelanggan & Kontrol` (`customers`) untuk melihat alamat dan riwayat layanan klien.

  2. Untuk mengecek garansi rayap yang hampir habis dan mengirim pesan pengingat WhatsApp, staf harus pindah menu ke `Jadwal Garansi Rayap` (`kontrol-rayap`).

  3. Pelanggan yang belum memiliki titik koordinat GPS sulit dideteksi satu per satu.

* **Alur Baru yang Diusulkan**:

  1. Staf membuka **Pelanggan & Garansi (`customers`)**.

  2. Di bagian atas halaman terdapat indikator peringatan langsung: **`⚠️ X Garansi Perlu Kontrol`** (klik langsung pindah ke Tab *Jadwal Garansi Rayap*) dan **`📍 Y Pelanggan Belum Ada Pin Point Map -> Cek Pelanggan ↗`** (diadopsi dari Screenshot 3 `image_b8a1c5.jpg`, klik langsung memfilter pelanggan yang belum memiliki koordinat untuk diisi via `MapPicker`).

* **Manfaat & Validasi**: Menghilangkan duplikasi pencarian nama klien di dua halaman berbeda dan mempercepat kelengkapan titik koordinat GPS proyek.

### Workflow 4: Pencatatan Stok Obat Gudang & Pemantauan Tren Bahan Kimia

* **Alur Saat Ini**:

  1. Staf Gudang (`INVENTORY`) membuka `InventoryPage.tsx` yang menampilkan banyak elemen secara bersamaan (katalog, form input di tab terpisah, log mutasi, hingga elemen P/L proyek).

  2. Untuk menambah stok masuk atau mengeluarkan obat ke proyek, staf harus berpindah ke tab form khusus lalu memilih nama obat dari *dropdown* panjang.

* **Alur Baru yang Diusulkan (Sesuai Keputusan #2)**:

  1. Staf Gudang membuka **Gudang, Alokasi & Tren Kimia (`inventory`)** yang langsung menampilkan **Mode Kerja Gudang Minimalis**: 4 kartu indikator di atas (`Total Item`, `Stok Aman`, `Stok Menipis`, `Stok Habis`) dan daftar barang yang bersih.

  2. Pada setiap baris/kartu obat terdapat 2 tombol aksi kontekstual berukuran jelas: **`[+ Stok Masuk]`** dan **`[- Keluar ke Proyek]`** yang membuka *mini-modal* 3 kolom (otomatis mengunci nama obat yang diklik, tinggal isi *Jumlah* dan *Pilih Proyek* -> *Simpan*).

  3. Setelah data mutasi gudang tercatat rapi, Admin, Direktur, dan Staf Gudang cukup klik Tab **`Tren Bahan Kimia`** di halaman yang sama untuk melihat grafik tren pemakaian bahan kimia **Cair (mL/L)** dan **Padat (gr/butir)** beserta rincian per proyek/pelanggan.

* **Manfaat & Validasi**: Mengurangi langkah pencatatan mutasi gudang dari 5 klik + *scroll dropdown* menjadi **2 klik langsung pada baris barang**, sekaligus menjamin akurasi data untuk analitik *Tren Bahan Kimia*.

### Workflow 5: Pemantauan Posisi Terkini Teknisi ke Pemutaran Rute Perjalanan (`Live` -> `Journey`)

* **Alur Saat Ini (di Jarivis Screenshot 13 & 14)**:

  1. Admin membuka `Pelacakan > Lokasi` (`/tracking/location`) dan memilih teknisi "Gucimas Pratama" untuk melihat titik Check-In terakhirnya di Ciputat.

  2. Saat ingin melihat jalur perjalanan yang ditempuh teknisi tersebut sejak pagi, Admin harus pindah menu sidebar ke `Pelacakan > Perjalanan` (`/tracking/journey`) lalu mencari dan mengklik ulang nama teknisi "Gucimas Pratama".

* **Alur Baru yang Diusulkan di Guci-App**:

  1. Admin/Direktur membuka **Lacak Peta & Perjalanan (`tracking`)**.

  2. Memilih nama teknisi di panel kiri (atau pada *Bottom Sheet* di HP).

  3. Di bagian atas peta terdapat *Segmented Switch* **`[📍 Posisi Terkini (Live)]` | `[🛣️ Riwayat Perjalanan (Journey)]`** — saat diklik ke *Riwayat Perjalanan*, teknisi yang sedang dipilih **tetap terkunci** dan peta langsung menggambar garis *polyline* rute perjalanannya beserta tombol `Legenda`!

## Deliverable 6 — Rekomendasi UX Level Halaman (`Page-Level UX Recommendations`)

Agar pengurangan menu sidebar **tidak membuat halaman menjadi penuh atau membingungkan**, setiap modul terpadu wajib menerapkan 6 pola antarmuka berikut:

1. **In-Page `TabContainer` yang Konsisten (Maksimal 4 Tab per Modul)**:

   * Gunakan komponen `src/shared/ui/TabContainer.tsx` yang sudah ada di Guci-App (seperti pada `QuotationPage.tsx`) untuk beralih antar-tampilan yang berbagi konteks bisnis yang sama.

   * Setiap tab menampilkan *counter badge* (contoh: `Jadwal Garansi Rayap [4 Perlu Kontrol]`) sehingga informasi penting langsung terlihat tanpa harus membuka tab tersebut terlebih dahulu.

2. **Aksi Kontekstual Baris/Kartu (`Contextual Row Actions`)**:

   * Tempatkan tombol aksi di tempat data berada:

     * Pada baris barang di **Gudang**: tombol langsung **`+ Masuk`** dan **`- Keluar ke Proyek`**.

     * Pada baris **Master Anggota**: tombol langsung **`Target Kunjungan`** (dari `image_b88ea3.png`) dan **`Akses Menu [Ubah]`** (dari `image_b8a10c.jpg`).

     * Pada baris **Hasil Kerja / Anomali**: tombol **`Verifikasi`** dan **`Unduh PDF`** langsung dari baris/modal.

3. **Kartu Status Interaktif sebagai Filter Cepat (`Clickable Status Summary Cards`)**:

   * Mengadopsi pola *Task Monitoring* (`image_b8a188.png`) dan *Lokasi* (`image_b88ba1.jpg`): kartu ringkasan angka di bagian atas halaman (`Semua`, `Selesai`, `Anomali/Perlu Cek`, atau `Aktif < 10 menit`, `Aktif < 60 menit`, `Aktif > 60 menit`) berfungsi ganda sebagai **tombol filter 1-klik**.

4. **Pencarian dengan Debounce & Filter Drawer Terlipat (`Collapsible Filter Drawer`)**:

   * Pertahankan `useDebouncedValue(search, 300)` dan sembunyikan filter lanjutan (rentang jam, kategori, wilayah) di balik tombol **`Filter Lengkap`** agar tampilan utama tetap minimalis dan lega.

5. **Panel Detail & Modal Terfokus (`Focused Detail Modals / Slide-Over Panels`)**:

   * Informasi padat seperti foto dokumentasi Check-In/Out, riwayat checklist garansi pelanggan, atau rincian bahan kimia disimpan di dalam *Detail Modal* (seperti `selectedReportId` dan `SPKDetailModal` yang sudah berjalan baik), bukan ditumpuk di tabel utama.

6. **Adaptasi Responsif *Dual-Viewport* (Desktop vs Mobile HP)**:

   * Pada layar Desktop (`>= 1024px`): tampilkan tabel multi-kolom dan *split-view* (daftar di kiri + peta di kanan) ala `beta.jarivis.com`.

   * Pada layar HP (`< 768px`): tabel otomatis berubah menjadi *Actionable Summary Cards*, *split-view* peta menggunakan *Segmented Toggle* (`Daftar | Peta`), dan *7-Day Date Carousel* mendukung geser horizontal (*touch snap-scroll*).

## Deliverable 7 — Spesifikasi Perubahan Teknis (`Technical Change Specification`)

Seluruh konsolidasi dilakukan **di lapisan UI dan konfigurasi navigasi tanpa mengubah skema database PostgreSQL/Supabase dan tanpa memutus kompatibilitas URL/state eksisting**:

| Komponen / File Target | Jenis Perubahan | Rincian Spesifikasi Teknis | Dampak API & Database | Strategi Backward-Compatibility & Redirect | 
| ----- | ----- | ----- | ----- | ----- | 
| **`src/widgets/common/AppLayout.tsx`** | Peningkatan Komponen Sidebar | Menambahkan input **`Search Menu...`** di bagian atas daftar navigasi (ketika sidebar diperlebar) yang memfilter `sidebarItems` secara *real-time* berdasarkan kata kunci menu maupun sub-tab. | **0 perubahan API / DB**. | Tetap mempertahankan *rail* 56px -> 252px di Desktop dan *Hamburger Drawer* di Mobile/Tablet. | 
| **`src/widgets/admin/AdminDashboard.tsx`** | Konsolidasi `ALL_ITEMS` & Alias `activeTab` | Mengurangi daftar `ALL_ITEMS` yang tampil di sidebar menjadi 10 item terfokus dalam 3 grup, sambil **mempertahankan seluruh nilai union `type Tab`** (`'reports'`, `'anomalies'`, `'customers'`, `'kontrol-rayap'`, `'spk-cms'`, `'projects'`, `'order-tracking'`, `'cashflow'`, `'performa'`, `'executors'`, `'approval'`, `'templates'`, `'risk-config'`, `'audit'`, `'profile'`). | **0 perubahan API / DB**. | Jika ada komponen/tombol (misal dari `OperationsAnalyticsBento`) yang memanggil `setActiveTab('anomalies')` atau `setActiveTab('projects')`, sistem otomatis membuka modul induknya dengan sub-tab/filter yang tepat! | 
| **`src/pages/inventory/InventoryPage.tsx`** | Optimasi UX Gudang Minimalis + Integrasi Tab `Tren Bahan Kimia` | Merombak tab utama menjadi **Mode Kerja Gudang Minimalis** (4 kartu indikator stok + aksi 1-klik `+ Stok Masuk` / `- Keluar ke Proyek`), menambahkan tab **`Tren Bahan Kimia`** (`SUPERADMIN`, `ADMIN`, `INVENTORY`), dan membatasi tab **`Analisis Untung Rugi (P/L)`** khusus `SUPERADMIN` & `ADMIN`. | Menggunakan RPC & tabel eksisting (`inventory_items`, `inventory_logs`, `treatment_records`). **0 migrasi DB wajib**. | Seluruh fungsi import/export Excel dan `processInventoryRPC` tetap utuh 100%. | 
| **`src/pages/customers/CustomersPage.tsx`** & **`KontrolRayapPage.tsx`** | Integrasi Sub-Tab Modul Pelanggan | Membungkus `CustomersPage` dan `KontrolRayapPage` dalam `TabContainer` terpadu di modul **Pelanggan & Garansi**, dilengkapi tab *Peta & Analisis Pin Point* (Screenshot 3) dan *Pengaturan Kontrak H-14/H-30* (Screenshot 2). | Membaca data `quotations` & `customer_profiles` eksisting. | Komponen `KontrolRayapPage.tsx` tetap utuh dan dirender langsung saat Tab 2 (*Jadwal Garansi Rayap*) aktif. | 
| **`src/pages/spk/SPKPage.tsx`** & Seksi `projects` | Integrasi Sub-Tab Modul Penugasan & Proyek | Menggabungkan tampilan `SPKPage` (ditambah *7-Day Date Carousel* Screenshot 4) dengan tampilan `Lokasi & Daftar Proyek` (`projects`), *Kalender Timeline* (Screenshot 9), dan *Heatmap Analitik* (Screenshot 8) melalui `TabContainer`. | Membaca `spk` dan `projects` eksisting. | Role `INVENTORY` saat mengklik menu ini langsung diarahkan ke Tab *Lokasi Proyek* (mode *read-only*). | 
| **Seksi `tracking` di `AdminDashboard.tsx`** | Penyatuan Mode `Lokasi (Live)` & `Perjalanan (Journey)` | Menambahkan *Segmented Switch* \*\*`[📍 Posisi Terkini]` | `[🛣️ Riwayat Perjalanan]`\*\* beserta 3 kartu keaktifan (`<10m`, `<60m`, `>60m` dari Screenshot 13 `image_b88ba1.jpg`) dan panel daftar teknisi ber-status di sebelah kiri peta (Screenshot 14 `image_b88b80.jpg`). | Membaca `user_locations` dan `work_reports` eksisting. | 
| **Modul Baru Wrapper: `FinanceHub` & `TeamSettingsHub`** | Penyatuan Tab Keuangan (`order-tracking`, `cashflow`, `performa`) & Tim/Pengaturan | Menyediakan *wrapper* `TabContainer` yang merender komponen asli (`TrackingPage`, `CashflowPage`, `PerformaPage`, serta `executors`, `approval` + `Target Kunjungan` Screenshot 11, `templates`, `risk-config`, `audit`, `profile`) sesuai hak akses role. | **0 perubahan API / DB**. | Tidak ada logika bisnis di dalam `TrackingPage`, `CashflowPage`, atau `PerformaPage` yang diubah atau dihapus. | 

## Deliverable 8 — Rencana Implementasi Bertahap (`Prioritized Implementation Plan`)

Sesuai Keputusan #4 (eksekusi per-phase) dan urutan prioritas risiko:

### Phase 1: Pembersihan Navigasi Berisiko Rendah & Optimasi Gudang Minimalis (*Low-Risk Navigation Cleanup & Warehouse UX*)

* **Cakupan Kerja (*Scope*)**:

  1. Menambahkan fitur **`Search Menu...`** dan indikator garis vertikal aktif pada Sidebar (`AppLayout.tsx`).

  2. Mengonsolidasikan `ALL_ITEMS` di `AdminDashboard.tsx` dari 18 item menjadi **10 menu utama** dengan **dukungan penuh alias `activeTab` lama** (0 rute/tombol putus).

  3. Merombak **`InventoryPage.tsx` (Menu Role Gudang)** menjadi simpel, minimalis, dan ramah HP (4 kartu status stok + tombol 1-klik `+ Stok Masuk` & `- Keluar ke Proyek` per baris + pemisahan tab P/L untuk Admin/Direktur).

* **Hasil yang Diharapkan**: Sidebar langsung rapi dan ringkas; staf Gudang dapat mencatat mutasi barang dalam 2 klik.

* **Dependensi & Risiko**: Risiko **Sangat Rendah** (murni lapisan UI & state navigasi).

* **Kebutuhan Pengujian**: Uji login dan klik seluruh menu pada 5 role (`MASTER_SUPER_ADMIN`, `SUPERADMIN`, `ADMIN`, `MARKETING`, `INVENTORY`) serta uji mutasi stok masuk/keluar.

### Phase 2: Kelengkapan Penuh 4 Tab `Dasbor Personal` (`ADMIN` & `SUPERADMIN`) + Modul `Tren Bahan Kimia` (`ADMIN`, `SUPERADMIN`, `INVENTORY`)

* **Cakupan Kerja (*Scope*)**:

  1. Melengkapi seluruh komponen bawah & modal interaktif pada 4 tab `OperationsAnalyticsBento.tsx` (`NeedAttentionModal` 5 tab, `IdleMembersModal`, `Current Workload`, `Leaderboard`, `Live Map Journey & Bottom Panels`, `Completion by Day/Hour`, `Quality Trend`, `Renewal Contract`, `No Activity Customer`) khusus `ADMIN` & `SUPERADMIN`.

  2. Menambahkan tab **`Tren Bahan Kimia`** (Cair mL/L & Padat gr/butir beserta rincian proyek) di dalam modul Gudang (`InventoryPage.tsx`) untuk `ADMIN`, `SUPERADMIN`, dan `INVENTORY`.

* **Hasil yang Diharapkan**: Dasbor eksekutif dan analitik pemakaian bahan kimia PCO/AR setara 100% dengan `beta.jarivis.com` namun responsif penuh di HP.

* **Dependensi & Risiko**: Bergantung pada Phase 1; Risiko **Rendah**.

### Phase 3: Integrasi Workflow Level Halaman — Modul Tugas/SPK, Hasil Kerja, & Peta Pelacakan (Screenshot 4–9, 13–14)

* **Cakupan Kerja (*Scope*)**:

  1. **Modul Hasil & Verifikasi Kerja (`reports` + `anomalies`)**: Menambahkan 5 kartu status warna solid ala *Task Monitoring* (`image_b8a188.png`) dengan filter 1-klik ke laporan Anomali.

  2. **Modul Lacak Peta & Perjalanan (`tracking`)**: Menyatukan tampilan *Lokasi* (`image_b88ba1.jpg` dengan 3 kartu keaktifan `<10m`, `<60m`, `>60m`) dan *Perjalanan* (`image_b88b80.jpg` dengan garis rute & `Legenda`) menggunakan *Segmented Switch* 1-klik di atas peta.

  3. **Modul Penugasan & Proyek (`spk-cms` + `projects`)**: Menambahkan *7-Day Date Carousel* + Banner Topografi (`image_b8a1a8.jpg`), tab *Lokasi & Radius Proyek* dengan pratinjau peta lingkaran radius (`image_b8a16d.jpg`), tab *Kalender Timeline Teknisi* (`image_b8a149.png`), dan tab *Heatmap Kalender 12 Bulan* (`image_b8a166.png`).

* **Hasil yang Diharapkan**: Seluruh alur penugasan, pemantauan proyek, verifikasi laporan, dan pelacakan GPS/perjalanan menyatu tanpa duplikasi menu.

* **Dependensi & Risiko**: Risiko **Rendah–Sedang**.

### Phase 4: Optimasi UX Lanjutan — Modul Pelanggan, Garansi, Tim & Target Kunjungan (Screenshot 1–3, 10–12)

* **Cakupan Kerja (*Scope*)**:

  1. **Modul Pelanggan & Garansi (`customers` + `kontrol-rayap`)**: Menyatukan *Master Pelanggan* (`image_b8a204.jpg`), *Jadwal Garansi Rayap*, *Peta Sebaran & Detektor Pelanggan Tanpa Pin Point Map* (`image_b8a1c5.jpg`), serta *Pengaturan Pengingat Kontrak H-14/H-30* (`image_b8a1e0.png`).

  2. **Modul Tim, Kinerja & Akun Staf (`approval` + `executors`)**: Menyatukan *Direktori & Akun Staf* (`image_b8a10c.jpg`), *Kinerja & Target Kunjungan (`0/0`)* (`image_b88ea3.png`), serta *Pengaturan Area Live Tracking & Feedback* (`image_b88e87.png`).

* **Hasil yang Diharapkan**: Manajemen pelanggan dan tim staf menjadi terpusat, ringkas, dan responsif di Desktop maupun HP.

* **Dependensi & Risiko**: Risiko **Rendah**.

## Deliverable 9 — Kriteria Penerimaan Terukur (`Testable Acceptance Criteria`)

Setiap fase implementasi wajib lulus **10 kriteria pengujian terukur** berikut sebelum dinyatakan selesai:

 1. **Struktur Sidebar (`Sidebar Structure`)**: Jumlah item top-level di sidebar untuk role `ADMIN` dan `SUPERADMIN` tidak melebihi **10 item** dalam maksimal **3 grup kategori**, dengan **0 submenu bertingkat di dalam sidebar** dan fitur `Search Menu...` berfungsi menyaring menu secara instan.

 2. **Aksesibilitas Menu (`Menu Accessibility`)**: Seluruh 20 fungsi menu yang ada pada tabel audit Deliverable 1 dapat diakses dalam **maksimal 2 klik** (1 klik menu sidebar + maksimal 1 klik tab internal).

 3. **Integritas Rute & Deep-Link (`Route & State Integrity`)**: Rute mandiri `/login`, `/signup`, `/quotations/new`, dan `/quotations/:id/edit` tetap berjalan normal, dan pemanggilan fungsi internal `setActiveTab('anomalies' | 'projects' | 'kontrol-rayap' | 'order-tracking' | 'cashflow' | 'performa' | 'executors' | 'approval' | 'templates' | 'risk-config' | 'audit' | 'profile')` otomatis membuka modul induk beserta sub-tab yang sesuai tanpa *blank screen*.

 4. **Preservasi Fitur 100% (`Feature Preservation`)**: Tidak ada satu pun fitur eksisting (pembuatan PH, tanda tangan direktur, nomor `GP-APR`, cetak PDF laporan kunjungan, pengingat WA garansi rayap, mutasi RPC gudang, buat link invite 7 hari, reset poin risiko, maupun hapus retensi foto) yang hilang atau berkurang kemampuannya.

 5. **Kepatuhan Hak Akses Role (`Role-Based Access Control`)**:

    * `Dasbor Personal` (4 tab lengkap) **hanya** tampil untuk `SUPERADMIN` dan `ADMIN`.

    * `Tren Bahan Kimia` **hanya** tampil untuk `SUPERADMIN`, `ADMIN`, dan `INVENTORY`.

    * `Analisis Untung Rugi (P/L)` dan `Laporan Cashflow` **tidak pernah** tampil untuk `INVENTORY` maupun `TEKNISI_LAPANGAN`.

    * Proteksi bahwa `ADMIN` tidak dapat menonaktifkan/menghapus sesama akun `ADMIN` (khusus wewenang `SUPERADMIN`/Direktur) tetap berjalan 100%.

 6. **Efisiensi Alur Kerja (`Workflow Efficiency`)**:

    * Beralih dari laporan normal ke laporan Anomali memerlukan **1 klik** pada halaman yang sama (sebelumnya 2 klik pindah menu sidebar).

    * Beralih dari peta *Posisi Terkini (Live)* ke *Riwayat Perjalanan (Journey)* memerlukan **1 klik** dengan teknisi yang dipilih tetap dipertahankan.

    * Mencatat stok masuk/keluar di Gudang memerlukan **2 klik** langsung dari baris barang.

 7. **Konsistensi Visual (`UI Consistency`)**: Seluruh halaman dan tab baru mempertahankan 100% font (`Inter`, `Outfit`, `JetBrains Mono`) dan variabel CSS palet warna Guci-App (`--bg-primary`, `--bg-card`, `--accent` Emerald `#1a5c38` di Light Mode & Matte Slate di Dark Mode).

 8. **Perilaku Responsif (`Responsive Behavior`)**: Tidak ada *horizontal overflow* yang tidak disengaja pada lebar viewport `360px` (Mobile HP), `768px` (Tablet), dan `1440px` (Desktop).

 9. **Integritas Data (`Data Integrity`)**: Tidak ada perubahan destruktif pada tabel database Supabase; seluruh transaksi gudang, laporan kerja, dan penawaran tetap menggunakan RPC dan validasi server yang sudah ada.

10. **Pengujian Regresi (`Regression Testing`)**: Build TypeScript & Vite (`npm run build`) lulus dengan **0 error**, dan pengujian *blackbox/whitebox* eksisting tetap hijau.

## Bagian 15 — Metrik Keberhasilan (`Success Metrics — Baseline vs Target`)

| Metrik Terukur | Baseline Aktual (`Guci-App-main` Saat Ini) | Baseline Referensi (`beta.jarivis.com`) | Target Setelah Konsolidasi (`Guci-App Optimized`) | 
| ----- | ----- | ----- | ----- | 
| **Jumlah Item Top-Level Sidebar (`ADMIN`)** | 18 item (4 grup) | 12 kategori + 28 submenu | **10 item (3 grup)** | 
| **Jumlah Item Top-Level Sidebar (`MARKETING`)** | 7 item + Profil | Tidak terpisah per role | **4 item utama + Profil** | 
| **Jumlah Item Top-Level Sidebar (`INVENTORY`)** | 3 item | Tidak ada | **2 item kerja fokus + Profil** | 
| **Kedalaman Submenu Sidebar (*Nested Levels*)** | 1 level | 2–3 level accordion | **1 level di Sidebar (0 accordion bertingkat)** | 
| **Jumlah Duplikasi Halaman di Sidebar** | 3 pasang (`reports`/`anomalies`, `customers`/`kontrol-rayap`, `spk-cms`/`projects`) | 4 pasang (`Lokasi`/`Perjalanan`, `Master Anggota`/`Daftar Anggota`, dll.) | **0 duplikasi halaman di Sidebar** | 
| **Jumlah Klik Cek Laporan Normal -> Anomali** | 2–3 klik (pindah menu sidebar) | 2 klik (pindah submenu) | **1 klik (kartu filter di halaman yang sama)** | 
| **Jumlah Klik Input Mutasi Stok Gudang** | 4–5 klik (pindah tab + cari di dropdown) | Tidak tersedia | **2 klik (tombol langsung di baris barang)** | 
| **Jumlah Fitur Eksisting yang Dipertahankan** | 20 modul/fitur | — | **20 modul/fitur (100% utuh) + fitur unggulan Jarivis** | 
