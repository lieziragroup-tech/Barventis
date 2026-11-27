# GUCI-APP WHOLE PLATFORM — PRODUCT & UI/UX DESIGN SPECIFICATION

**Dokumen:** Whole-Application Product UI/UX Design Specification  
**Produk:** Guci-App / Fieldwork — Operational & Commercial Management Platform  
**Versi:** 1.0  
**Tanggal:** 10 November 2026  
**Status:** Design brief untuk eksplorasi Figma, validasi stakeholder, dan persiapan implementasi  
**Bahasa antarmuka utama:** Bahasa Indonesia  
**Cakupan:** Seluruh aplikasi utama, enam role, seluruh modul operasional dan komersial yang ditemukan dalam source code.

> Dokumen ini disusun berdasarkan audit ZIP aplikasi utama `Guci-App-main(1).zip`, termasuk `README.md`, `src/entities/types.ts`, `src/shared/lib/roles.ts`, `src/widgets/admin/AdminDashboard.tsx`, `src/widgets/admin/OperationsAnalyticsBento.tsx`, `src/widgets/executor/ExecutorHome.tsx`, halaman modul, serta dokumen audit navigasi dalam repository.  
> **Fakta source** berarti fungsi atau struktur yang ditemukan pada kode. **Rekomendasi desain** berarti usulan UX yang perlu divalidasi sebelum implementasi. Jangan mengubah aturan bisnis, hak akses, status, perhitungan, atau integrasi hanya berdasarkan keputusan visual.

---

## 1. Product vision

Guci-App adalah platform manajemen operasional dan komersial untuk bisnis pest control dan anti-rayap B2B. Aplikasi menghubungkan proses dari penawaran dan pelanggan, penugasan proyek, pelaksanaan pekerjaan lapangan, dokumentasi dan verifikasi, pengelolaan bahan kimia, hingga pemantauan tagihan dan performa bisnis. Sistem juga memiliki lapisan multi-tenant untuk pengelolaan perusahaan.

### 1.1 Tujuan redesign

1. Membuat setiap role memahami pekerjaan berikutnya tanpa harus memahami struktur internal sistem.
2. Mempercepat penemuan menu, data, dan tindakan yang sering digunakan.
3. Mengurangi pengulangan input, perpindahan antarhalaman, dan duplikasi konteks.
4. Menampilkan informasi dengan hierarki yang jelas, sehingga data penting tidak tenggelam oleh KPI, chart, atau kartu dekoratif.
5. Memastikan setiap role hanya melihat fungsi yang relevan dan diizinkan.
6. Menjaga akurasi transaksi, data GPS, dokumen komersial, mutasi stok, serta riwayat audit.
7. Memberikan pengalaman desktop/tablet yang efisien untuk kantor dan pengalaman mobile/PWA yang dapat diandalkan untuk lapangan.
8. Membangun satu Design System konsisten untuk seluruh platform, bukan desain terpisah yang terasa seperti aplikasi berbeda.

### 1.2 Prinsip desain

- **Role-first, task-first:** dashboard dan navigasi mengikuti peran serta tugas pengguna.
- **One clear primary action:** setiap halaman memiliki tindakan utama yang mudah ditemukan.
- **Progressive disclosure:** tampilkan ringkasan terlebih dahulu; detail dan konfigurasi lanjutan dibuka sesuai kebutuhan.
- **Single source of truth:** hindari dua menu/halaman berbeda yang mengelola objek atau data sama tanpa alasan yang jelas.
- **Clear permission:** aksi yang tidak diizinkan tidak ditampilkan sebagai tombol aktif. Alasan akses terbatas harus jelas bila diperlukan.
- **Operational clarity:** status, penanggung jawab, tanggal, dan langkah selanjutnya mudah dipindai.
- **No fake certainty:** timestamp, lokasi terakhir, status sinkronisasi, dan angka analitik harus menunjukkan konteks serta waktu pembaruan.
- **Safe actions:** aksi finansial, approval, mutasi stok, penghapusan, perubahan akun, dan perubahan status perlu konfirmasi yang proporsional.
- **Field-ready:** alur teknisi harus dapat digunakan dalam cahaya luar ruang, saat bergerak, dan pada koneksi lemah.
- **Accessible by default:** kontras, ukuran teks, target sentuh, keyboard focus, label, error feedback, dan empty state menjadi bagian desain inti.

---

## 2. Source-of-truth, batasan, dan catatan audit

### 2.1 Struktur aplikasi yang ditemukan

- Frontend menggunakan React 19, Vite, Tailwind CSS v4, Zustand, React Router, dan TanStack Query.
- Backend memakai Node.js/Express dan database PostgreSQL/Supabase.
- Autentikasi dan profil menggunakan Supabase Auth; aplikasi memiliki isolasi perusahaan/tenant.
- Teknisi menggunakan `ExecutorHome` sebagai pengalaman terpisah dengan empat tab utama.
- Role non-teknisi diarahkan ke `AdminDashboard`, lalu menu disaring berdasarkan role.
- Aplikasi memiliki PWA/offline queue, GPS tracking, upload dokumentasi, PDF/export, risk engine, dan audit log.

### 2.2 Fakta penting dari source code

1. Terdapat enam role database: `MASTER_SUPER_ADMIN`, `SUPERADMIN`, `ADMIN`, `MARKETING`, `INVENTORY`, dan `TEKNISI_LAPANGAN`.
2. `SUPERADMIN` adalah direktur utama tenant/perusahaan. `MASTER_SUPER_ADMIN` adalah pemilik platform SaaS, bukan admin operasional tenant.
3. Sidebar saat ini terkonsolidasi menjadi sekitar 10 menu untuk ADMIN/SUPERADMIN, lima menu untuk MARKETING, tiga menu untuk INVENTORY, dan konsol tenant untuk MASTER_SUPER_ADMIN. Teknisi menggunakan empat tab khusus.
4. Dashboard ADMIN/SUPERADMIN memiliki empat sub-tab: Operation Center, Live Map, Performance Team, dan Bisnis.
5. Quotation memiliki tab daftar, buat penawaran, status deal/pipeline, dan buku nomor surat; aksi create/approve berbeda menurut role.
6. Pelanggan memiliki Master Pelanggan, Jadwal Garansi, Analisis Peta, dan Pengaturan Kontrak.
7. SPK memakai status `assigned`, `in_progress`, dan `done`; ini berbeda dari status Work Report.
8. Work Report memakai `DRAFT`, `READY`, `WORKING`, `COMPLETED`, `FLAGGED`, dan `REVIEWED`.
9. Work Report juga memiliki risk level terpisah: `NORMAL`, `LOW_RISK`, `REVIEW`, `HIGH_RISK`, dan `CRITICAL`.
10. Inventory mempunyai tab stok, stok hampir habis, alokasi proyek, tren chemical, riwayat mutasi, rekap bulanan, serta analisis profitabilitas yang khusus untuk direktur.
11. Master Super Admin diarahkan ke pengelolaan perusahaan SaaS dan token undangan Superadmin, dengan profil sebagai fungsi personal.
12. Sebagian nama menu dan hak akses ditentukan secara berbeda berdasarkan role. Prototype harus menunjukkan variasi tersebut.

### 2.3 Catatan yang harus divalidasi sebelum coding

- `App.tsx` saat ini mengarahkan semua role non-teknisi ke `AdminDashboard`; jangan menganggap setiap role memiliki route frontend tersendiri. Figma boleh memisahkan frame/entry experience per role untuk memperjelas UX, tetapi implementasi routing harus menjadi keputusan engineering.
- `isDirectorUser` memiliki pemeriksaan role dan pola email tertentu. Hak akses produksi harus tetap diputuskan oleh RBAC/backend, bukan disimulasikan dengan nama atau email dalam desain.
- Beberapa dokumentasi audit memuat target atau rencana yang belum tentu seluruhnya telah diimplementasikan. Contoh: target kunjungan, area tracking, serta beberapa rincian analytics perlu diverifikasi ke UI/backend aktual sebelum dijadikan fitur wajib.
- Modul keuangan `order-tracking`, `cashflow`, dan `performa` berada di dalam satu kelompok halaman, tetapi detail sub-tab dan hak akses internal dapat berbeda berdasarkan role. Jangan tampilkan semua tab ke semua role hanya karena modul induknya dapat diakses.
- Aplikasi utama dan versi Lite memiliki beberapa perbedaan pada file tertentu. Dokumen ini khusus untuk ZIP aplikasi utama; jangan menyalin semua keputusan Lite tanpa pengecekan.

---

## 3. Role, tujuan, dan matriks akses

### 3.1 Enam role aplikasi

| Role | Identitas bisnis | Tujuan utama | Perangkat dominan |
|---|---|---|---|
| `MASTER_SUPER_ADMIN` | Pemilik platform SaaS | Mengelola tenant/perusahaan dan akses undangan Superadmin | Desktop |
| `SUPERADMIN` | Direktur perusahaan/tenant | Melihat kesehatan bisnis, approval, profitabilitas, risiko, dan performa perusahaan | Desktop / tablet |
| `ADMIN` | Admin operasional perusahaan | Menjalankan operasional, membuat/meninjau penugasan, memonitor teknisi, mengelola tim dan sistem | Desktop / tablet |
| `MARKETING` | Surveyor / sales | Membuat quotation, mengelola pelanggan, mengikuti deal dan target/performa | Desktop / mobile |
| `INVENTORY` | Staf gudang | Mengelola stok, mutasi, alokasi bahan ke proyek, dan rekap | Desktop / tablet / mobile |
| `TEKNISI_LAPANGAN` | Eksekutor pekerjaan | Melihat tugas, melakukan check-in/out, treatment, dokumentasi, dan mengirim laporan | Mobile/PWA |

### 3.2 Matriks akses tingkat modul

Matriks berikut mencerminkan akses navigasi/menu yang ditemukan. Hak aksi detail seperti create, edit, approve, delete, dan export tetap harus mengikuti guard pada halaman serta backend.

| Modul | Master SA | Superadmin | Admin | Marketing | Inventory | Teknisi |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Konsol perusahaan SaaS | ✓ | — | — | — | — | — |
| Dashboard operasional | — | ✓ | ✓ | — | — | Beranda teknisi sendiri |
| Penawaran/Quotation | — | ✓ | ✓ | ✓ | — | — |
| Pelanggan & Garansi | — | ✓ | ✓ | ✓ | — | Detail minimum dari tugas |
| SPK & Proyek | — | ✓ | ✓ | ✓ | Proyek/lokasi sesuai akses | Tugas yang ditugaskan/tersedia |
| Hasil & Verifikasi Kerja | — | ✓ | ✓ | — | — | Isi dan kirim laporan sendiri |
| Tracking lokasi & perjalanan | — | ✓ | ✓ | — | — | Berbagi lokasi sesuai izin dan proses |
| Inventory & Chemical | — | ✓ | ✓ | — | ✓ | Tidak ada modul gudang mandiri |
| Keuangan, tagihan & performa | — | ✓ | ✓ | ✓ (terbatas) | — | — |
| Tim, kinerja & akun staf | — | ✓ | ✓ | — | — | Profil sendiri |
| Pengaturan, template, risiko, audit | — | ✓ | ✓ | Profil/preferensi | Profil/preferensi | Profil/preferensi |

**Catatan:** `✓` pada tabel menunjukkan menu/modul tersedia pada role menurut konfigurasi navigasi utama, bukan izin penuh terhadap setiap tindakan di dalam modul.

### 3.3 Batas hak akses yang harus tergambar dalam desain

**MASTER_SUPER_ADMIN**
- Fokus pada pengelolaan tenant/perusahaan SaaS dan token undangan Superadmin.
- Tidak boleh melihat data operasional, pelanggan, stok, dan transaksi tenant sebagai default.
- Pemilihan tenant harus terlihat jelas bila konteks tenant diperlukan.

**SUPERADMIN**
- Mendapatkan dashboard eksekutif dan tampilan profitabilitas/keuntungan chemical.
- Dapat melakukan approval quotation.
- Memiliki kewenangan direktur tertentu atas akun Admin.
- Tidak boleh disamakan dengan `MASTER_SUPER_ADMIN`.

**ADMIN**
- Menangani operasional tenant, penawaran, penugasan, monitoring, laporan, inventory, keuangan, tim, dan pengaturan sesuai permission.
- Dapat membuat quotation dan melakukan approval sesuai source.
- Memiliki hak tulis gudang dalam implementasi saat ini.
- Tidak boleh menonaktifkan/menghapus sesama akun ADMIN jika guard sumber membatasi aksi tersebut kepada SUPERADMIN.

**MARKETING**
- Dapat membuat dan mengelola quotation sesuai hak akses, mengelola data pelanggan, melihat pipeline/status deal, serta performa yang relevan.
- Tidak menampilkan laporan kerja internal, live tracking teknisi, inventory, atau konfigurasi sistem.

**INVENTORY**
- Fokus pada daftar proyek/lokasi yang dibutuhkan gudang dan modul Inventory.
- Aksi mutasi stok dan alokasi harus jelas dan aman.
- Tidak menampilkan profit/loss atau cashflow perusahaan.

**TEKNISI_LAPANGAN**
- Hanya melihat data pekerjaan yang relevan untuk dirinya/tim sesuai hak akses.
- Tidak melihat data komersial, harga penawaran internal, financial, atau data pelanggan di luar kebutuhan tugas.

---

## 4. Information architecture dan navigasi target

### 4.1 Aturan navigasi global

- Maksimal satu level navigasi utama pada sidebar; hindari accordion bertingkat.
- Gunakan grouping visual dan label kategori untuk mengurangi beban kognitif.
- Tab internal hanya untuk fungsi yang benar-benar satu konteks.
- Menu yang merupakan alias/duplikasi dari halaman lain harus disatukan menjadi satu sumber navigasi.
- Sediakan global menu search/quick jump yang mencari label, sinonim, dan kata kunci fitur; shortcut `Ctrl+K` boleh dipertahankan tetapi harus ada tombol yang terlihat.
- Pada mobile, sidebar beralih menjadi drawer atau navigasi yang sesuai role; jangan mengecilkan sidebar desktop.
- Tampilkan breadcrumb atau konteks halaman untuk modul bertingkat.
- Pertahankan state filter, selected item, dan tab ketika pengguna membuka detail lalu kembali.

### 4.2 Navigasi target ADMIN dan SUPERADMIN

Pertahankan modul utama yang telah ada, tetapi rapikan ke tiga kelompok besar. Label akhir dapat dipersingkat untuk sidebar dan dijelaskan di header halaman.

**GRUP 1 — Ringkasan & Komersial**
1. Dashboard Utama
2. Penawaran Harga
3. Pelanggan & Garansi

**GRUP 2 — Operasional Lapangan**
4. Penugasan SPK & Proyek
5. Hasil & Verifikasi Kerja
6. Tracking & Perjalanan

**GRUP 3 — Sumber Daya & Sistem**
7. Gudang & Chemical
8. Keuangan & Performa
9. Tim & Akun Staf
10. Pengaturan & Audit

Maksimal 10 item; tidak ada menu duplikat seperti `reports` dan `anomalies` secara terpisah. Anomali menjadi filter/queue di halaman Hasil & Verifikasi Kerja.

### 4.3 Navigasi target MARKETING

1. Penawaran Harga
2. Pelanggan & Garansi
3. SPK & Proyek (fungsi terbatas sesuai role)
4. Tagihan & Performa (hanya bagian yang diizinkan)
5. Profil & Preferensi (dapat diletakkan di avatar/header, bukan menu utama)

### 4.4 Navigasi target INVENTORY

1. Gudang & Mutasi Stok
2. Proyek & Alokasi
3. Profil & Preferensi di avatar/header

Pada Inventory, menu proyek sebaiknya menjadi konteks/filter di modul Gudang bila itu mengurangi perpindahan tanpa menghilangkan akses proyek yang diperlukan.

### 4.5 Navigasi target MASTER_SUPER_ADMIN

1. Perusahaan / Tenant
2. Profil & Preferensi

Konsol SaaS harus mempunyai identitas visual yang konsisten dengan Guci-App, tetapi memiliki konteks platform yang berbeda dari operasional tenant.

### 4.6 Navigasi target TEKNISI_LAPANGAN

Bottom navigation atau top-level mobile navigation:
1. Tugas Hari Ini
2. Daftar Proyek/Tugas
3. Riwayat
4. Profil

Sembunyikan navigasi global saat kamera, tanda tangan, atau workflow full-screen sedang aktif agar tidak menghalangi tugas.

---

## 5. Model alur bisnis lintas modul

Diagram berikut adalah **peta konteks produk**, bukan jaminan bahwa setiap langkah otomatis mentransisikan data di backend.

```text
MARKETING / ADMIN
  Pelanggan & Lokasi
       ↓
  Survey dan Penawaran Harga (Quotation)
       ↓
  Draft → Pending → Approved / Rejected
       ↓
  Sent to Client → Deal (bila disepakati)
       ↓
ADMIN / SUPERADMIN
  SPK & Penjadwalan Proyek
       ↓
INVENTORY
  Cek ketersediaan dan alokasi chemical (bila diperlukan)
       ↓
TEKNISI_LAPANGAN
  Tugas → GPS Check-in → Treatment → Foto → Check-out
       ↓
  Work Report
       ↓
ADMIN / SUPERADMIN
  Hasil & Verifikasi → Review / tindak lanjut
       ↓
CUSTOMER / BUSINESS FOLLOW-UP
  Garansi, kontrol, kontrak, tagihan, dan performa
```

### 5.1 Workflow kritis yang harus mudah dipahami

**Workflow A — Quotation sampai Deal**
1. Marketing/Admin membuka daftar quotation.
2. Pengguna mencari pelanggan, kategori layanan (AR/PCO), dan status.
3. Membuat atau mengedit penawaran menggunakan form terstruktur.
4. Preview kalkulasi, diskon, pajak, garansi, serta isi dokumen.
5. Pengajuan untuk approval atau approval oleh role yang berwenang.
6. Penerbitan/unduh PDF dan pencatatan status kirim/deal sesuai alur yang didukung.
7. Pengguna dapat membuka pipeline dan buku nomor surat tanpa berpindah ke menu yang tidak terkait.

**Workflow B — Pelanggan dan Garansi**
1. Cari atau buat master pelanggan.
2. Lihat detail kontak, alamat, perusahaan/PIC, dan riwayat proyek.
3. Kelola jadwal garansi atau kontrol rayap.
4. Lihat analisis pelanggan di peta, termasuk pelanggan tanpa pin.
5. Kelola pengaturan pengingat kontrak/garansi yang memang tersedia.
6. Aksi WhatsApp/pengingat harus jelas status dan penerimanya; jangan tampilkan klaim terkirim bila baru membuka aplikasi eksternal.

**Workflow C — Penjadwalan SPK**
1. Buka SPK & Proyek.
2. Pilih quotation yang memenuhi status bisnis yang disyaratkan.
3. Pilih teknisi, jadwal, layanan, lokasi, instruksi, dan parameter kunjungan bila relevan.
4. Untuk jadwal rutin, tampilkan generator beberapa tanggal dan preview seluruh SPK sebelum konfirmasi.
5. Setelah dibuat, tampilkan status `assigned`, `in_progress`, atau `done` sesuai data.
6. Detail SPK memperlihatkan teknisi, jadwal, lokasi, layanan, aktual mulai/selesai, dan laporan terkait bila tersedia.

**Workflow D — Monitoring dan Verifikasi Hasil**
1. Admin melihat semua Work Report.
2. Filter status, tanggal, teknisi, pelanggan/proyek, dan laporan yang memerlukan pemeriksaan.
3. Masuk ke detail laporan dengan timeline, GPS, akurasi, durasi, foto, treatment, serta tanda tangan/ulasan yang tersedia.
4. Risk Level dipisahkan dari Work Report Status.
5. Admin melakukan aksi review yang didukung backend dan melihat siapa/kapan review dilakukan bila tersedia.
6. Export PDF atau berbagi laporan mengikuti permission.

**Workflow E — Mutasi Gudang**
1. Cari barang berdasarkan nama/kategori/kondisi stok.
2. Aksi `Stok Masuk` dimulai dari item yang dipilih atau pemilih barang eksplisit.
3. Aksi `Keluar ke Proyek` mengharuskan pemilihan barang dan proyek yang jelas.
4. Preview jumlah, satuan, tujuan, dan dampak stok sebelum simpan.
5. Tampilkan receipt/konfirmasi transaksi dan riwayat mutasi.
6. Hindari default otomatis ke `items[0]` atau `projects[0]` tanpa penegasan pengguna.

**Workflow F — Teknisi Lapangan**
1. Buka tugas prioritas dan periksa detail proyek, pelanggan, layanan, jadwal, alamat, dan instruksi.
2. Mulai check-in dan tampilkan state izin lokasi, proses mendapatkan GPS, akurasi, radius, dan timestamp.
3. Jalankan tahapan pekerjaan dengan progress yang terlihat.
4. Isi treatment sesuai jenis layanan; label, satuan, serta validasi harus jelas.
5. Ambil dokumentasi foto sesuai tipe/tag yang didukung.
6. Check-out, lengkapi tanda tangan/ulasan pelanggan jika memang diperlukan.
7. Review ringkasan sebelum mengirim laporan.
8. Jika offline, simpan lokal dan tunjukkan antrean sinkronisasi; jangan menyebut laporan terkirim sebelum server mengonfirmasi.

---

## 6. Page inventory — seluruh aplikasi

Gunakan frame terpisah per role, modul, dan state penting. Nama frame memakai ID agar mudah dicari di Figma.

### 6.1 Shared Authentication & Account

| ID | Frame | Konten dan state |
|---|---|---|
| SH-00 | Login | Brand, email, password, show/hide, validasi, error, loading |
| SH-01 | Sign Up / Invitation | Alur pendaftaran sesuai token/invitation yang valid; jangan menciptakan open registration bila tidak didukung |
| SH-02 | Unauthorized / Access Denied | Penjelasan akses role dan jalur kembali |
| SH-03 | Change Password | Form, validasi, feedback sukses/gagal |
| SH-04 | Profile & Preferences | Identitas, role, perusahaan, tema light/dark, preferensi yang tersedia |
| SH-05 | Session Expired | Penjelasan sesi berakhir dan tindakan login ulang |

### 6.2 MASTER_SUPER_ADMIN — SaaS Console

| ID | Frame | Konten wajib |
|---|---|---|
| MSA-00 | SaaS Overview | Ringkasan tenant/platform hanya bila datanya tersedia; hindari KPI fiktif |
| MSA-01 | Company/Tenant List | Daftar perusahaan, status tenant, pencarian, filter, pagination |
| MSA-02 | Company Detail | Identitas perusahaan, status plan/aktif, masa berlaku, batas teknisi bila tersedia |
| MSA-03 | Company Users | Daftar pengguna tenant dan informasi role yang diizinkan |
| MSA-04 | Superadmin Invite Tokens | Generate/kelola token undangan, masa berlaku, status token |
| MSA-05 | SaaS Profile | Profil dan preferensi pribadi |

### 6.3 SUPERADMIN / DIREKTUR — Executive & Approval

**Dashboard — 4 sub-tab yang ditemukan**

| ID | Frame | Konten wajib |
|---|---|---|
| SA-00 | Executive Dashboard / Operation Center | KPI tugas, workforce, kunjungan pelanggan, flagged rate, efisiensi dan daftar perhatian |
| SA-01 | Dashboard — Live Map | Peta, status tugas/lokasi, filter tanggal, teknisi terpilih, last update |
| SA-02 | Dashboard — Performance Team | Ringkasan anggota aktif/idle, kunjungan, pekerjaan belum/selesai, leaderboard bila datanya tersedia |
| SA-03 | Dashboard — Bisnis | Analitik pelanggan, kontrak kedaluwarsa, aktivitas dan tren bisnis yang berbasis data |
| SA-04 | Approval Penawaran | Daftar quotation pending, detail harga/garansi, histori penyesuaian, tanda tangan/approval |
| SA-05 | Profitabilitas Chemical | Analisis estimasi dan pemakaian bahan per proyek, angka biaya/nilai hanya dari sumber data yang benar |
| SA-06 | Company Switcher (bila digunakan) | Konteks perusahaan aktif, nama perusahaan dan efek pergantian tenant |

### 6.4 ADMIN — Operational Management

Admin menggunakan sebagian besar modul tenant dengan action sesuai hak akses.

| ID | Frame | Konten wajib |
|---|---|---|
| AD-00 | Admin Dashboard | KPI operasional dan perhatian prioritas, bukan dashboard finansial direktur bila tidak diizinkan |
| AD-01 | Quotation List | Daftar penawaran, filter AR/PCO, tipe kontrak, status, marketing, pencarian |
| AD-02 | Create Quotation — Client & Service | Identitas pelanggan, PIC, lokasi, kategori AR/PCO, jenis layanan, data survey |
| AD-03 | Create Quotation — Scope & Pricing | Item layanan, kuantitas/basis, biaya tambahan, diskon, pajak, garansi, estimasi |
| AD-04 | Quotation Preview & Approval | Preview nilai dan dokumen, validasi, approval/signature sesuai permission |
| AD-05 | Quotation Pipeline | Draft, pending, approved, rejected, sent to client, deal, cancelled |
| AD-06 | Buku Nomor Surat | Nomor draft/resmi/approval, kategori, tipe, tanggal, pencarian |
| AD-07 | Customer Master | Daftar pelanggan, import/export bila tersedia, search/filter, detail |
| AD-08 | Warranty Schedule | Jadwal kontrol/garansi, tanggal, hasil kontrol, catatan, tindak lanjut |
| AD-09 | Customer Map Analysis | Peta pelanggan, pelanggan tanpa pin, filter aktif/riwayat |
| AD-10 | Contract Reminder Settings | Pengaturan pengingat kontrak/garansi sesuai konfigurasi aktual |
| AD-11 | SPK & Project List | Daftar/jadwal SPK, filter status/tanggal, teknisi, proyek, pencarian |
| AD-12 | Create SPK | Pilih quotation, teknisi, tanggal, layanan, lokasi dan instruksi |
| AD-13 | Recurring SPK Builder | Atur interval/tanggal, jumlah, teknisi, preview beberapa SPK sebelum membuat |
| AD-14 | SPK Detail | Status, jadwal, teknisi, lokasi, aktual mulai/selesai, catatan, laporan terkait |
| AD-15 | Project Locations | Daftar proyek/lokasi, koordinat, radius/geofence, status proyek |
| AD-16 | Work Reports — All | Kartu/filter status, tanggal, teknisi, proyek, pencarian, pagination |
| AD-17 | Work Reports — Anomalies | Queue laporan yang perlu pemeriksaan, risk level, alasan flag yang dapat dibaca |
| AD-18 | Work Report Detail | Timeline, check-in/out, GPS, foto, treatment, durasi, tanda tangan, risk signals |
| AD-19 | Report Review State | Aksi review yang benar-benar didukung, catatan/histori jika tersedia |
| AD-20 | Live Tracking | Peta teknisi, kelompok keaktifan, lokasi terakhir, akurasi dan timestamp |
| AD-21 | Journey / Route History | Riwayat rute per teknisi dan rentang waktu jika data rute tersedia |
| AD-22 | Team Directory & Account | Akun staf, status, role, pencarian, undangan, tindakan sesuai permission |
| AD-23 | Technician Performance | Kinerja dan ringkasan pekerjaan teknisi sesuai data yang tersedia |
| AD-24 | Risk & Attendance Configuration | Konfigurasi poin/risk yang benar-benar tersedia; nilai default dan dampak harus dijelaskan |
| AD-25 | Templates & Company Branding | Kop surat, logo, identitas, footer, tanda tangan direktur, preview dokumen |
| AD-26 | Photo Retention | Aturan retensi foto, batas, dan konfirmasi perubahan bila tersedia |
| AD-27 | Audit Log | Waktu, aktor, aksi, entitas, hasil; read-only kecuali ada aksi admin yang sah |
| AD-28 | Profile & Theme | Profil pribadi, ubah password, tema |

### 6.5 MARKETING — Sales Workspace

| ID | Frame | Konten wajib |
|---|---|---|
| MK-00 | Marketing Dashboard / Starting Page | Daftar tugas marketing, penawaran terbaru dan tindakan follow-up; KPI hanya bila didukung data |
| MK-01 | My Quotations | Daftar penawaran milik pengguna, status, search/filter |
| MK-02 | Survey & Quotation Form | Data pelanggan, objek, alamat, hasil survey, foto/lampiran bila tersedia, layanan AR/PCO |
| MK-03 | Quotation Pricing & Preview | Rincian item, harga, diskon/garansi, validasi dan preview PDF |
| MK-04 | Deal & Contract Pipeline | Status penawaran/deal/kontrak sesuai data dan hak akses |
| MK-05 | Customer Master | Buat/cari/edit pelanggan sesuai permission |
| MK-06 | Warranty & Map View | Informasi garansi atau lokasi pelanggan yang diperlukan untuk tindak lanjut |
| MK-07 | Billing / Performance View | Hanya bagian Tagihan & Performa yang memang diizinkan bagi Marketing |
| MK-08 | Profile & Preferences | Profil dan preferensi |

### 6.6 INVENTORY — Warehouse Workspace

| ID | Frame | Konten wajib |
|---|---|---|
| IV-00 | Warehouse Overview | Ringkasan stok, stok minim, mutasi terakhir, tindakan utama |
| IV-01 | Stock Catalog | Nama item, kategori, satuan, stok, ambang minimum, search/filter |
| IV-02 | Stock In | Supplier/sumber, barang, kuantitas, satuan, tanggal, catatan dan preview |
| IV-03 | Stock Out to Project | Pilih item dan proyek secara eksplisit, kuantitas, penerima/teknisi bila didukung |
| IV-04 | Low Stock | Daftar item hampir habis, batas minimum, tindakan restock |
| IV-05 | Project Allocation | Pemakaian/alokasi chemical per ID proyek, estimasi vs realisasi bila tersedia |
| IV-06 | Chemical Usage Trend | Filter bahan cair/padat dan periode; tampilkan satuan dengan konsisten |
| IV-07 | Movement History | Riwayat IN/OUT, aktor, waktu, proyek/supplier, detail transaksi |
| IV-08 | Monthly Recap | Rekap stok dan mutasi per bulan, export jika tersedia |
| IV-09 | Inventory Item Detail | Detail item, satuan, stok, perubahan, dan riwayat |

### 6.7 FINANCE & BUSINESS PERFORMANCE — Role-gated

Modul ini berada pada menu `Keuangan, Tagihan & Performa`. Jangan menganggap seluruh submodul dapat dilihat setiap role.

| ID | Frame | Konten wajib |
|---|---|---|
| FN-00 | Billing / Order Tracking | Klien, quotation/kontrak terkait, nilai tagihan, termin/cicilan, status, jatuh tempo sesuai data |
| FN-01 | Billing Detail | Rincian tagihan, histori pembayaran, informasi kontrak, tindakan yang diizinkan |
| FN-02 | Cashflow | Ringkasan pemasukan/cashflow berbasis data, filter periode, tren; hindari data dummy sebagai real |
| FN-03 | Marketing Performance / MoM | Performa bulanan, survey, approval, deal, target, AR vs PCO, filter tahun/bulan |
| FN-04 | Target Setup | Pengaturan target marketing bila role dan fitur backend mengizinkan |
| FN-05 | Export / Report State | Preview laporan, periode, sumber data, status export |

### 6.8 TEKNISI_LAPANGAN — Mobile PWA

| ID | Frame | Konten wajib |
|---|---|---|
| TK-00 | Technician Home | Tugas aktif, siap dikerjakan, pekerjaan berjalan, indikator sync |
| TK-01 | Project / Task List | Daftar tugas/proyek, search, filter tanggal/status |
| TK-02 | Task Detail | Pelanggan, lokasi, jadwal, layanan, instruksi, tim, CTA utama |
| TK-03 | GPS Permission & Check-in | Status izin, proses GPS, timestamp, accuracy, radius dan error state |
| TK-04 | Work In Progress | Stepper pekerjaan, timer bila ada, progres yang tersimpan |
| TK-05 | Camera & Photo Evidence | Capture, tag/jenis foto, preview, ulangi, upload state |
| TK-06 | Treatment Form | Form dinamis sesuai layanan/metode, chemical, dosis, unit, area dan field relevan |
| TK-07 | Check-out | GPS dan bukti check-out, validasi dan konfirmasi |
| TK-08 | Customer Signature / Review | Tanda tangan/ulasan jika diwajibkan oleh skenario layanan |
| TK-09 | Report Summary & Submit | Ringkasan seluruh input, kelengkapan dan CTA kirim |
| TK-10 | Offline Queue & Sync | Offline, item tersimpan lokal, menunggu upload, sedang sync, gagal, berhasil server-confirmed |
| TK-11 | Work History | Riwayat selesai/perlu review sesuai akses, detail laporan |
| TK-12 | Technician Profile | Identitas, role, password, logout, preferensi |

---

## 7. Modul dan spesifikasi UX rinci

### 7.1 Dashboard — Operation Center

Empat sub-tab yang ditemukan: `Operation Center`, `Live Map`, `Performance Team`, dan `Bisnis`.

**Operation Center**
- Mulai dengan ringkasan hari/periode yang sedang dipilih.
- Fokus pada total tugas, tugas selesai, tenaga kerja aktif/clock-in, kunjungan pelanggan, tingkat anomali, dan efisiensi pekerjaan.
- Bagian `Perlu Perhatian` harus lebih menonjol daripada grafik sekunder.
- Klik KPI harus membuka daftar yang sudah terfilter, bukan halaman kosong.
- Tampilkan sumber/periode data dan status refresh.

**Live Map**
- Peta dengan marker teknisi/proyek dan overview status tugas/lokasi.
- Daftar teknisi bisa dicari dan dipilih.
- Detail panel memuat nama, status/lokasi terakhir, waktu pembaruan, dan akurasi jika tersedia.

**Performance Team**
- Ringkasan anggota aktif/idle, kunjungan, tugas belum selesai/selesai.
- Leaderboard atau perbandingan performa harus punya metrik, periode, dan cara baca yang jelas.
- Jangan menggunakan ranking yang tidak memiliki denominator atau basis perhitungan.

**Bisnis**
- Informasi pelanggan aktif, kontrak kedaluwarsa/mendekati, pekerjaan pelanggan, pelanggan baru/tidak aktif, serta metrik bisnis yang memang dipasok data.
- Angka rupiah hanya boleh muncul dari sumber finansial yang terdefinisi.

### 7.2 Quotation / Surat Penawaran Harga

- Satu modul untuk daftar, create/edit, pipeline, dan buku nomor surat.
- Pisahkan status quotation dari status SPK dan Work Report.
- Status source: `draft`, `pending`, `approved`, `rejected`, `sent_to_client`, `deal`, `cancelled`.
- Form bertahap: data tujuan/pelanggan → kategori AR/PCO dan jenis layanan → survey/objek → item/biaya dan kalkulasi → garansi/ketentuan → preview dokumen.
- Tampilkan ringkasan biaya/subtotal/diskon/PPN/total dalam panel ringkas yang selalu terlihat saat review; mobile dapat memakai sticky summary.
- Approval dan tanda tangan hanya tampil bagi role berwenang.
- Perubahan harga/garansi dan histori penyesuaian harus transparan.
- PDF memiliki preview, status download, dan indikator tanda tangan.

### 7.3 Customer, Warranty & Contract

- Master pelanggan menggunakan search cepat, filter, pagination, table/card view.
- Detail pelanggan menyatukan kontak, PIC, alamat, koordinat, riwayat proyek, quotation/kontrak, garansi dan catatan yang memang tersedia.
- Warranty schedule memprioritaskan tanggal kontrol/masa garansi.
- Map Analysis menampilkan pelanggan tanpa koordinat sebagai task data-quality, bukan sekadar angka dekoratif.
- Contract Settings memisahkan konfigurasi global dari data masing-masing kontrak.
- Import/export, template Excel, dan pengiriman reminder harus menampilkan format, validasi, serta hasil proses.

### 7.4 SPK & Projects

- Satu tempat untuk daftar SPK dan konteks proyek.
- Kalender 7 hari/date carousel boleh dipakai sebagai filter cepat, bukan satu-satunya akses tanggal.
- Filter status SPK: `assigned`, `in_progress`, `done`.
- Buat SPK dari quotation yang memenuhi syarat; tampilkan validasi jika belum tersedia.
- Jadwal rutin harus memiliki preview jumlah tanggal/SPK, teknisi, dan jadwal sebelum konfirmasi.
- Detail proyek memuat alamat, peta, radius/geofence, instruksi, jadwal, teknisi, kunjungan ke berapa, dan keterkaitan SPK bila data tersedia.
- Role INVENTORY sebaiknya mendapat tampilan project/location yang ringkas dan tidak diberikan aksi edit SPK yang tidak diizinkan.

### 7.5 Work Reports & Anomaly Review

- Satukan semua laporan dan anomali dalam satu modul; anomali adalah filter/queue, bukan menu terpisah.
- Gunakan status cards/segmented filters: Semua, Draft, Siap Dikerjakan, Sedang Berlangsung, Selesai, Perlu Pemeriksaan, Sudah Ditinjau (sesuaikan dengan status yang tampil dari API).
- Tampilkan risk level sebagai informasi terpisah dari status pekerjaan.
- Detail laporan memakai tab/section: Ringkasan, Timeline GPS, Foto, Treatment, Customer feedback/signature, Anomaly signals, Review history.
- Jelaskan alasan flag dengan kalimat dan data pendukung. Jangan hanya mengandalkan badge warna.
- Aksi review mengikuti backend. Jangan mengarang tombol Reject/Request Revision bila belum ada transisi atau endpoint yang mendukung.
- PDF/report export harus menyebut rentang tanggal, proyek, teknisi, dan waktu dibuat.

### 7.6 Tracking & Journey

- Satukan Live Location dan Journey/History di satu modul dengan segmented switch.
- Peta mendapat area utama; daftar teknisi dan detail terpilih ditempatkan dalam side panel desktop atau bottom sheet mobile.
- Kelompok keaktifan seperti `kurang dari 10 menit`, `kurang dari 60 menit`, dan `lebih dari 60 menit/standby` hanya tampil bila definisi aktual dipertahankan oleh sumber data.
- Timestamp lokasi dan accuracy harus terlihat. Jika lokasi stale, tampilkan indikator stale.
- Perjalanan menampilkan periode dan teknisi yang dipilih; pertahankan selected technician saat berpindah mode.
- Tidak ada klaim live jika data terakhir tidak real-time.

### 7.7 Inventory & Chemical

- Prioritaskan pencarian item dan stok tersedia.
- Kartu ringkas: total item, stok aman, stok minimum, mutasi terbaru.
- Aksi stok masuk dan keluar harus dimulai dari item/proyek yang telah dipilih dengan sadar.
- Tampilkan satuan konsisten untuk bahan cair dan padat (misalnya mL/L dan gr/kg/pcs sesuai unit data aktual).
- Mutasi menampilkan jenis, jumlah, unit, aktor, waktu, proyek/supplier, dan catatan.
- Alokasi proyek membedakan estimasi dan realisasi hanya jika dua data tersebut benar-benar ada.
- Tren chemical perlu filter cair/padat dan rentang waktu; tooltip harus menunjukkan unit, proyek, dan periode.
- Rekap bulanan memiliki preview sebelum export.
- Direktur melihat analisis profitabilitas chemical; role lain tidak melihat P/L jika tidak diberi izin.

### 7.8 Finance & Performance

- Billing/order tracking memprioritaskan status tagihan, nominal, jatuh tempo, termin/cicilan, dan pelanggan terkait.
- Jangan memakai warna merah/kuning sebagai satu-satunya petunjuk status pembayaran.
- Cashflow memiliki filter periode dan definisi pemasukan yang transparan.
- Marketing Performance/MoM memisahkan survey, approval rate, deal rate, nilai revenue dan target; jangan menyamakan approved dengan deal.
- Setup target hanya muncul pada role yang diizinkan.
- Angka demo dalam prototype harus diberi label jelas `Data Demo`.

### 7.9 Team, Accounts & Settings

- Team directory: nama, role, status aktif, pencarian dan filter.
- Invite/create user: role dipilih secara eksplisit; jelaskan akibat pemilihan role terhadap akses.
- Tindakan disable/delete harus memerlukan permission, reason/confirmation sesuai mekanisme aktual, dan tidak boleh disimulasikan sebagai aksi universal.
- Pengaturan template menampilkan preview dokumen realistik.
- Risk configuration menjelaskan parameter, unit, current value, dan konsekuensi tanpa memanipulasi angka.
- Photo retention menjelaskan apa yang akan terpengaruh sebelum penyimpanan.
- Audit log harus mudah dibaca dan berisi actor, action, entity, timestamp, dan outcome bila data tersedia.

### 7.10 Master Super Admin — SaaS Management

- Bedakan konteks `Platform` dari konteks `Perusahaan` dengan label tenant yang jelas.
- Daftar perusahaan fokus pada nama, plan/status, masa berlaku, batas pengguna/teknisi bila tersedia.
- Aksi perubahan status perusahaan atau token harus dikonfirmasi dan dijelaskan dampaknya.
- Jangan tampilkan informasi sensitif atau credential.
- Jangan menganggap Master Super Admin dapat melihat transaksi tenant secara default.

### 7.11 Technician PWA

- Mobile-first 360–430 px; tombol aksi utama mudah dijangkau ibu jari.
- Satu pekerjaan aktif harus memiliki CTA yang jelas.
- Stepper/progress menunjukkan tahap selesai, berjalan, atau belum dilakukan.
- Form treatment dibuat sesuai metode/jenis layanan; hindari satu form panjang dengan semua field.
- Camera state meliputi izin, kamera aktif, preview, retake, local save, upload, dan upload error.
- GPS state meliputi permission prompt, searching, valid, accuracy rendah, di luar radius, gagal, dan timestamp.
- Offline state menunjukkan item antrean, kapan dibuat, apakah tersimpan lokal, dan status server sync.
- Bottom navigation disembunyikan ketika modal kamera/tanda tangan atau workflow kritis full-screen terbuka.

---

## 8. Design system

### 8.1 Visual direction

Arah visual: **modern enterprise operations, calm, precise, minimal, warm-professional**. Hindari tampilan terlalu padat, neon, glassmorphism, gradient dekoratif, shadow tebal, dan kartu KPI berlebihan. Gunakan ruang kosong untuk membentuk hierarki, bukan membuat halaman terasa kosong.

### 8.2 Color tokens — rekomendasi

Identitas utama tetap hijau Guci. Implementasi saat ini menggunakan hijau `#1A5C38` sebagai accent pada Light Mode, sedangkan Dark Mode mengubah accent ke biru. Redesign disarankan menyatukan token brand agar identitas tidak berubah antar-tema.

| Token | Light recommendation | Dark recommendation | Usage |
|---|---|---|---|
| Brand Primary | `#1A5C38` | `#4B9B70` | Primary CTA, active navigation |
| Brand Hover | `#13462A` | `#61AD83` | Hover/pressed |
| Canvas | `#F4F6F4` | `#101613` | App background |
| Surface | `#FFFFFF` | `#1A211D` | Cards and panels |
| Surface Secondary | `#EDF2EE` | `#222C26` | Nested panels |
| Text Primary | `#17231C` | `#F0F4F1` | Main text |
| Text Secondary | `#66736B` | `#A8B4AC` | Supporting text |
| Border | `#DCE5DE` | `#344239` | Dividers and outlines |
| Success | `#237A4B` | `#55B980` | Success states |
| Warning | `#A96B16` | `#E7B35D` | Warning states |
| Danger | `#B54141` | `#E47D7D` | Error/destructive states |
| Info | `#356C91` | `#79ABD0` | Informational states |

Semantic colors must be accessible and accompanied by text/icon. These are proposed tokens, not a claim that the current CSS already uses them.

### 8.3 Typography

Font stack source uses Inter, Outfit, and JetBrains Mono. Recommended usage:
- Inter: primary interface text, forms, tables, navigation.
- Outfit: selected headings/brand display only; do not mix excessively.
- JetBrains Mono: coordinates, IDs, numeric technical values, timestamps when helpful.

Recommended sizes:
- Page title: 28–32 px desktop; 24–28 px mobile.
- Section title: 18–20 px.
- Body: 14–16 px.
- Form label: 13–14 px.
- Table body: 13–14 px (avoid 10–11 px for important content).
- Helper/metadata: 12–13 px.
- KPI number: 26–32 px.

### 8.4 Layout and spacing

- Use 4 px base spacing grid.
- Content max width by context; data-heavy pages may use wide canvas.
- Desktop app shell: sidebar 240–260 px expanded; 64–72 px collapsed; topbar 60–68 px.
- Card radius: 12–16 px; controls 8–12 px.
- Border subtle; shadow light and consistent.
- Use responsive grids, not fixed-width cards.
- Data tables need sticky header only when useful, visible row actions, and horizontal scroll fallback only when unavoidable.

### 8.5 Shared components and variants

Build a dedicated Figma page `00 — Foundations & Components` with:
- Color styles/tokens for light/dark and semantic states.
- Type scale and text styles.
- Spacing, radius, elevation, grid and breakpoints.
- Buttons: primary, secondary, tertiary, ghost, danger, icon-only; default/hover/focus/disabled/loading.
- Text inputs, select, searchable select, date picker, numeric input, textarea, file upload, OTP/token field if applicable.
- Sidebar: expanded/collapsed, active, hover, role-filtered, mobile drawer.
- Header: tenant context, page title/breadcrumb, global search, notification/profile actions.
- Tabs, segmented control, filter chips, status badges, risk badges.
- KPI/stat cards and chart cards.
- Data table, mobile data cards, pagination, bulk-selection toolbar.
- Empty state, skeleton, error, offline banner, sync status, toast.
- Modal, drawer, confirmation dialog, command palette.
- Map panel, technician marker, location info card, route legend.
- Photo gallery/viewer, camera capture, signature panel.
- PDF preview and export panel.
- Timeline, stepper, audit log row, activity feed.
- Form section, sticky form summary, validation message.

---

## 9. Responsive behavior

| Viewport | Main use | Layout behavior |
|---|---|---|
| 1440 × 1000 | Admin/Director desktop | Full sidebar, wide content, multi-column dashboard and side detail panel |
| 1280 × 800 | Office laptop | Sidebar can collapse; data table and map adapt without clipping |
| 1024 × 768 | Tablet | Compact sidebar/drawer; cards reflow; detail panel may become drawer |
| 768 × 1024 | Tablet portrait | One/two-column content; tables switch to cards where appropriate |
| 390 × 844 | Mobile | Mobile-friendly shell; filters in bottom sheet/drawer; one primary column |
| 360 × 800 | Small mobile | No horizontal overflow; minimum touch target 44×44 px |

### Role-specific responsive principles
- Admin/Director: desktop-first, but all critical review and monitoring tasks must work on tablet/mobile.
- Marketing: responsive forms; pricing summary sticky on desktop and collapsible/sticky bottom summary on mobile.
- Inventory: mobile cards for stock and mutation; avoid wide stock tables on narrow screens.
- Technician: mobile-first, large controls, reduced text entry, clear offline mode, no dense side-by-side panels.
- Master Super Admin: desktop-first tenant console; tablet read-only overview acceptable if supported.

---

## 10. Interaction, data, and system states

### 10.1 Required states for every data-driven screen

- Initial loading / skeleton.
- Refreshing without losing the current context.
- Empty state with a useful next action.
- Search/filter no-result state.
- Permission denied state.
- Network/server error with retry guidance.
- Success confirmation only after the operation is actually confirmed.
- Partial data / stale data state when applicable.
- Destructive action confirmation.
- Form invalid state with inline explanations.

### 10.2 Status taxonomy — do not mix

**Quotation Status**
- `draft` — Draft
- `pending` — Menunggu persetujuan/proses sesuai implementasi
- `approved` — Disetujui
- `rejected` — Ditolak
- `sent_to_client` — Dikirim ke pelanggan
- `deal` — Deal
- `cancelled` — Dibatalkan

**SPK Status**
- `assigned` — Ditugaskan
- `in_progress` — Sedang Berjalan
- `done` — Selesai

**Work Report Status**
- `DRAFT` — Draft
- `READY` — Siap Dikerjakan
- `WORKING` — Sedang Berlangsung
- `COMPLETED` — Selesai
- `FLAGGED` — Perlu Pemeriksaan
- `REVIEWED` — Sudah Ditinjau

**Risk Level**
- `NORMAL` — Normal
- `LOW_RISK` — Risiko Rendah
- `REVIEW` — Perlu Ditinjau
- `HIGH_RISK` — Risiko Tinggi
- `CRITICAL` — Kritis

**Aturan:** Quotation status, SPK status, Work Report status, dan Risk Level adalah entitas/status berbeda. Jangan menggunakan badge atau warna yang sama tanpa label teks. Jangan menambah status transisi baru hanya untuk mempercantik prototype.

### 10.3 GPS, camera, offline, sync

Desain seluruh state berikut:
- Location permission belum diminta, ditolak, atau granted.
- GPS sedang mencari lokasi.
- GPS ditemukan; tampilkan accuracy dan timestamp.
- Accuracy di luar toleransi atau lokasi di luar radius.
- Check-in/out gagal dan cara mencoba lagi.
- Camera permission ditolak, kamera siap, capture, preview, retake.
- Foto tersimpan lokal, upload in progress, upload failed, upload confirmed.
- Online, offline, pending queue, syncing, sync failed, sync confirmed.
- Konflik/duplikasi antrean jika backend mengembalikan kondisi tersebut.

**Bahasa status harus presisi:** `Tersimpan di perangkat` tidak sama dengan `Terkirim ke server`. Jangan tampilkan sukses hijau pada state lokal yang belum tersinkron.

---

## 11. Figma file structure dan naming

Buat pages dalam urutan:

1. `00 — Read Me & Product Map`
2. `01 — Foundations & Tokens`
3. `02 — Components & Patterns`
4. `03 — Shared Auth & Account`
5. `04 — Master Super Admin`
6. `05 — Superadmin / Director`
7. `06 — Admin Operations`
8. `07 — Marketing Workspace`
9. `08 — Inventory Workspace`
10. `09 — Finance & Performance`
11. `10 — Technician PWA`
12. `11 — Responsive & Edge States`
13. `12 — Prototype Flows`

### Naming convention
- Frame: `[ROLE] / [MODULE] / [SCREEN] / [STATE]`
- Component: `cmp/[category]/[name]`
- Variant: `size=sm|md|lg`, `state=default|hover|focus|disabled|loading`, `theme=light|dark`.
- Example: `ADMIN / Reports / Work Report Detail / Flagged`.

### Prototype links minimum
1. Marketing: create quotation → preview → pending/approval representation → deal pipeline.
2. Admin: create SPK → preview → assigned project detail.
3. Admin: open report anomaly → inspect evidence → complete supported review action.
4. Admin: live tracking → choose technician → journey view.
5. Inventory: select item → stock in or stock out → review → confirmation.
6. Technician: task detail → check-in → treatment/photo → check-out → report summary → submit/sync.
7. Master Super Admin: company list → company detail → invitation token management.

---

## 12. Acceptance criteria for design

A whole-app prototype is considered ready for stakeholder review when:

1. Semua enam role mempunyai entry point dan navigasi yang sesuai.
2. Tidak ada role yang melihat menu tanpa dasar permission.
3. Admin/Superadmin memiliki maksimal 10 item sidebar utama; tidak ada duplikasi laporan/anomali atau pelanggan/garansi sebagai menu terpisah.
4. Superadmin dan Admin dibedakan pada aksi serta data yang memang berbeda.
5. Master Super Admin terpisah secara mental model dari tenant operational workspace.
6. Semua modul inti yang ditemukan dalam source mempunyai frame list/detail/form atau state yang relevan.
7. Workflow utama dari quotation hingga field report dapat diprototipekan tanpa dead end.
8. Stock out tidak memiliki default item/project tersembunyi yang dapat memicu salah transaksi.
9. Status quotation, SPK, Work Report, dan risk level tidak tercampur.
10. GPS, photo, offline queue, dan server sync memiliki state yang jelas.
11. Semua desain desktop memiliki adaptasi tablet/mobile yang direncanakan; teknisi mobile-first.
12. Tidak ada horizontal overflow yang tidak disengaja pada 360 px.
13. Text penting umumnya 14 px atau lebih, metadata minimal 12 px.
14. Tombol utama dan aksi destruktif memiliki state hover/focus/disabled/loading/confirmation yang tepat.
15. Design tokens dan components dipakai lintas role.
16. Angka demo diberi label `Data Demo`; angka keuangan dan KPI tidak disajikan seolah data produksi.
17. Tidak ada desain yang mengarang endpoint, business rule, status, tarif, hitungan chemical, atau aksi backend.

---

## 13. Success metrics dan usability validation

Gunakan pengujian task-based sebelum/sesudah redesign. Jangan menjanjikan persentase peningkatan tanpa baseline.

| Metric | Cara ukur | Target awal yang disarankan |
|---|---|---|
| Task Completion Rate | Tugas selesai tanpa bantuan / seluruh percobaan | ≥ 90% untuk tugas inti setelah iterasi |
| Time on Task | Waktu dari mulai hingga sukses | Lebih rendah dari baseline tiap workflow |
| Error Rate | Kesalahan input/aksi per percobaan | Turun dari baseline |
| Navigation Steps | Jumlah klik/perpindahan relevan | Turun tanpa menyembunyikan fitur |
| SUS | System Usability Scale dari responden nyata | Target evaluasi ditetapkan dalam metodologi penelitian |
| Critical Workflow Coverage | Workflow prioritas yang berhasil diuji | 100% workflow yang disepakati |

Kumpulkan responden nyata sesuai role. Data contoh yang tertanam pada source/test hanya boleh digunakan untuk uji kalkulasi atau prototype, bukan diperlakukan sebagai hasil survei pengguna.

---

## 14. Open questions sebelum implementasi

1. Apakah versi utama akan mempertahankan seluruh modul, atau ada modul yang boleh dihapus setelah validasi stakeholder?
2. Siapa pengguna aktif untuk tiap role, dan apakah ada role yang jarang digunakan?
3. Apakah Marketing benar-benar perlu akses Tagihan/Performa penuh, atau hanya pipeline dan performa miliknya?
4. Apakah ADMIN dan SUPERADMIN perlu dashboard yang berbeda total, atau hanya variasi KPI dan aksi?
5. Apakah semua inventory mutation dilakukan oleh role INVENTORY dan ADMIN, atau ada approval tambahan?
6. Apakah pelanggan menerima laporan PDF dari aplikasi secara otomatis, manual, atau hanya setelah review?
7. Apakah Tracking harus real-time atau cukup menampilkan lokasi terakhir yang terekam?
8. Apakah pembuatan proyek manual oleh teknisi tetap dipertahankan pada versi utama?
9. Apakah seluruh modul harus nyaman digunakan pada mobile, atau hanya Teknisi dan fungsi cepat role kantor?
10. Apa identitas visual final yang harus dipertahankan: logo, warna hijau, font, dan template dokumen?

---

## 15. Instruksi akhir untuk designer dan implementer

- Gunakan dokumen ini sebagai acuan desain whole app.
- Jadikan source code dan API sebagai batas kemampuan sistem; Figma tidak boleh menciptakan fitur seolah sudah tersedia.
- Tandai asumsi yang belum divalidasi dengan label `NEEDS CONFIRMATION`.
- Desain ulang hierarki dan alur, bukan mengganti seluruh brand tanpa alasan.
- Jangan mengubah database, kalkulasi, permission, atau business logic demi menyesuaikan tampilan.
- Pertahankan fitur lama sampai pemilik produk menyetujui penghapusan atau perubahan.
- Hasil utama yang diharapkan adalah produk enterprise yang terasa sederhana untuk masing-masing pengguna, walaupun sistem di belakangnya kompleks.
