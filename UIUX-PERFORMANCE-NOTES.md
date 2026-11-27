# UI/UX & Performance Notes — FieldWork Operational Dashboard Refresh

## 1. Operational Analytics Bento (`Ringkasan Hari Ini` / `Pantau KPI & Laporan Kerja`)

- **Reusable Presentational Primitives (`src/shared/ui/analytics-bento.tsx`)**:
  - Menyediakan `BentoGrid`, `BentoCard`, `OperationalKpiCard`, `WorkTrendChartCard`, `StatusCompositionCard`, `PriorityVerificationCard`, `BentoSkeleton`, dan `BentoErrorState` tanpa ketergantungan langsung pada Supabase atau state autentikasi.
  - Seluruh metrik e-commerce/demo generik (revenue, visitor sessions, desktop/mobile, seasonality radar, treemap) dihapus dan digantikan oleh semantik operasional lapangan FieldWork.
- **Domain Mapping Widget (`src/widgets/admin/OperationsAnalyticsBento.tsx`)**:
  - Menghubungkan data agregat 30 hari terakhir (`KPIStats` / `OperationalDashboardSummary`) ke empat kartu Bento operasional:
    1. **Ringkasan Operasional**: Total penugasan 30 hari terakhir (dengan rentang tanggal eksplisit `id-ID`), Selesai Terverifikasi (`COMPLETED` + `REVIEWED`), Sedang Berlangsung (`WORKING`), dan Perlu Pemeriksaan (`FLAGGED` + sub-indikator terpisah untuk `HIGH_RISK`/`CRITICAL`), dilengkapi rata-rata durasi kerja dan rata-rata skor risiko.
    2. **Tren Pekerjaan Harian**: Grafik area/garis responsif untuk 30 hari terakhir (`Asia/Jakarta`) dengan filter seri interaktif (`Semua Seri`, `Total`, `Selesai`, `Perlu Cek`), ringkasan teks yang tidak bergantung pada hover, serta penanganan jujur untuk nilai nol.
    3. **Komposisi Status Laporan**: Perbandingan horizontal untuk 6 status resmi (`COMPLETED`, `REVIEWED`, `WORKING`, `READY`, `DRAFT`, `FLAGGED`) yang dapat diklik untuk memfilter tabel laporan di bawahnya (dilengkapi tombol **Urungkan filter status** dan **Reset**).
    4. **Prioritas Verifikasi & Risiko**: Daftar laporan prioritas unik (deduplikasi laporan yang berstatus `FLAGGED` sekaligus `HIGH_RISK`/`CRITICAL`) dengan tombol **Buka detail** dan **Lihat semua laporan perlu dicek**.

## 2. Konsistensi Data 30 Hari & Isolasi Multi-Tenant

- **`src/shared/utils/operationalSummary.ts` & `src/shared/api/admin.ts`**:
  - `fetchAdminSummary()` kini menerapkan batas jendela waktu 30 hari terakhir secara konsisten dalam zona waktu operasional (`Asia/Jakarta`), terisolasi berdasarkan `company_id` aktif, serta melempar `ApiError` berbahasa manusia saat gagal (tidak lagi menyamarkan kegagalan jaringan/query sebagai angka `0`).
- **`backend-src/modules/admin/adminRoutes.ts` (`GET /api/admin/summary`)**:
  - Mengembalikan agregasi server-side `dailyTrend` (via `generate_series` 30 hari), `statusBreakdown`, `priorityUniqueCount`, dan `priorityReports` yang seluruhnya dibatasi `company_id = $1` melalui middleware `requireAuth`, `withTenant`, dan `requireRole`.
- **Pergantian Tenant (`SUPERADMIN`)**:
  - Saat `activeCompanyId` berubah di `CompanyPicker`, state ringkasan dan laporan di `AdminDashboard` langsung dibersihkan sebelum memuat ulang agar data perusahaan sebelumnya tidak pernah tampil sebagai data perusahaan baru.

## 3. Sistem Tema (Terang / Gelap / Ikuti Sistem) & Aksesibilitas

- **`index.html`, `src/app/index.css`, & `src/shared/hooks/useTheme.ts`**:
  - Mendukung pilihan **Terang**, **Gelap**, dan **Ikuti sistem** yang disimpan secara persisten di `localStorage` (`fw_theme_preference_v1`) dan diinisialisasi sebelum render pertama untuk mencegah flash tema yang salah (FOUC).
  - Menyediakan semantic tokens lengkap untuk Light dan Dark mode (`--bg-primary`, `--bg-card`, `--bg-tertiary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--status-*`, `--chart-*`), menghormati `prefers-reduced-motion`, dan menjaga target sentuh nyaman pada perangkat mobile (320px–1440px tanpa horizontal overflow).

## 4. Reusable Utilities & Pagination

- `src/shared/hooks/useDebouncedValue.ts` menunda pembaruan pencarian selama 300 ms pada halaman daftar.
- `src/shared/ui/Pagination.tsx` menyediakan kontrol paginasi responsif.
- Tindakan berisiko (seperti menonaktifkan akun, menghapus akun permanen, mereset konfigurasi poin risiko, dan menghapus file foto lama) dilindungi konfirmasi eksplisit (`AlertDialog`), serta dilengkapi aksi **Urungkan (Undo)** untuk perubahan filter maupun status akun yang dapat dipulihkan.
