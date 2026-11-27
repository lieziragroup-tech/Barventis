export type AppGuideModuleId =
  | 'navigation'
  | 'dashboard'
  | 'reports'
  | 'tracking'
  | 'customers'
  | 'approval'
  | 'templates'
  | 'quotation'
  | 'inventory'
  | 'spk-cms'
  | 'order-tracking'
  | 'saas-companies';

export type AppGuideScope = 'all' | AppGuideModuleId;

export interface AppGuideStep {
  id: string;
  moduleId: AppGuideModuleId;
  /** Tab ID in AdminDashboard that should be active for this step (omit for global shell steps). */
  tabId?: string;
  /** Value of `data-app-tour` attribute to highlight. */
  target: string;
  sectionLabel: string;
  title: string;
  description: string;
  tip?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export interface AppGuideModuleCard {
  id: AppGuideModuleId;
  label: string;
  subtitle: string;
  stepCount: number;
  tabId?: string;
}

const MODULE_META: Record<
  AppGuideModuleId,
  { label: string; subtitle: string; tabId?: string }
> = {
  navigation: {
    label: 'Menu & Header',
    subtitle: 'Pindah halaman, muat ulang & akun',
  },
  dashboard: {
    label: 'Dashboard',
    subtitle: 'Ringkasan kerja hari ini & laporan terbaru',
    tabId: 'dashboard',
  },
  reports: {
    label: 'Laporan Kerja',
    subtitle: 'Cek laporan teknisi, cetak PDF & unduh foto',
    tabId: 'reports',
  },
  tracking: {
    label: 'Peta Lokasi',
    subtitle: 'Lihat posisi teknisi & rute kunjungan',
    tabId: 'tracking',
  },
  customers: {
    label: 'Pelanggan',
    subtitle: 'Daftar klien, alamat peta & masa garansi',
    tabId: 'customers',
  },
  approval: {
    label: 'Tim & Akun',
    subtitle: 'Tambah staf, buat link daftar & atur akses',
    tabId: 'approval',
  },
  templates: {
    label: 'Pengaturan',
    subtitle: 'Kop surat, aturan jarak & tema layar',
    tabId: 'templates',
  },
  quotation: {
    label: 'Penawaran (PH)',
    subtitle: 'Buat draf penawaran, persetujuan & cetak PDF',
    tabId: 'quotation',
  },
  inventory: {
    label: 'Gudang & Obat',
    subtitle: 'Catat stok masuk, stok keluar & pemakaian proyek',
    tabId: 'inventory',
  },
  'spk-cms': {
    label: 'SPK & Proyek',
    subtitle: 'Buat surat perintah kerja & atur jadwal',
    tabId: 'spk-cms',
  },
  'order-tracking': {
    label: 'Tagihan & Performa',
    subtitle: 'Pantau pembayaran, pemasukan & target bulanan',
    tabId: 'order-tracking',
  },
  'saas-companies': {
    label: 'Daftar Perusahaan',
    subtitle: 'Atur perusahaan terdaftar & status langganan',
    tabId: 'saas-companies',
  },
};

export const APP_GUIDE_STEPS_BY_MODULE: Record<AppGuideModuleId, AppGuideStep[]> = {
  navigation: [
    {
      id: 'nav-sidebar',
      moduleId: 'navigation',
      target: 'sidebar-nav',
      sectionLabel: 'Menu Utama',
      title: 'Pindah Halaman dari Menu Kiri',
      description:
        'Klik menu di sebelah kiri untuk membuka halaman yang Anda butuhkan. Jika muncul angka merah, berarti ada laporan yang perlu segera dicek.',
      tip: 'Tekan Ctrl+K di keyboard untuk langsung mencari nama menu.',
      placement: 'right',
    },
    {
      id: 'nav-header-tools',
      moduleId: 'navigation',
      target: 'header-actions',
      sectionLabel: 'Bagian Atas',
      title: 'Panduan, Muat Ulang & Menu Akun',
      description:
        'Tombol Panduan selalu ada di pojok kanan atas untuk membuka bantuan kapan saja. Di sebelahnya ada tombol muat ulang data serta menu profil untuk ganti tema dan kata sandi.',
      placement: 'bottom',
    },
  ],
  dashboard: [
    {
      id: 'dash-kpi',
      moduleId: 'dashboard',
      tabId: 'dashboard',
      target: 'dashboard-kpi',
      sectionLabel: 'Dashboard',
      title: 'Ringkasan Status Pekerjaan',
      description:
        'Empat kotak ini menampilkan jumlah tugas yang siap dikerjakan, sedang berjalan, sudah selesai, dan perlu dicek. Klik salah satu kotak untuk langsung menyaring laporan.',
      placement: 'bottom',
    },
    {
      id: 'dash-recent-reports',
      moduleId: 'dashboard',
      tabId: 'dashboard',
      target: 'dashboard-recent-reports',
      sectionLabel: 'Dashboard',
      title: 'Laporan Kerja Terbaru',
      description:
        'Berisi daftar kunjungan teknisi terakhir lengkap dengan nama proyek, jam mulai, dan statusnya. Klik salah satu baris untuk melihat foto dan tanda tangan.',
      placement: 'top',
    },
    {
      id: 'dash-priority',
      moduleId: 'dashboard',
      tabId: 'dashboard',
      target: 'dashboard-priority',
      sectionLabel: 'Dashboard',
      title: 'Daftar Perlu Tindakan',
      description:
        'Menampilkan laporan yang sedang dikerjakan atau perlu pemeriksaan admin agar tidak terlewat.',
      placement: 'left',
    },
  ],
  reports: [
    {
      id: 'reports-kpi',
      moduleId: 'reports',
      tabId: 'reports',
      target: 'reports-kpi',
      sectionLabel: 'Laporan Kerja',
      title: 'Filter Cepat & Ringkasan Laporan',
      description:
        'Klik kartu Semua Laporan, Selesai, Perlu Dicek, atau Sedang Kerja untuk langsung menyaring daftar. Kartu paling kanan menampilkan Rata-Rata Durasi kerja.',
      placement: 'bottom',
    },
    {
      id: 'reports-toolbar',
      moduleId: 'reports',
      tabId: 'reports',
      target: 'reports-toolbar',
      sectionLabel: 'Laporan Kerja',
      title: 'Cari, Buat Rekap & Unduh Laporan',
      description:
        'Ketik nama teknisi, proyek, atau alamat untuk mencari laporan. Gunakan tombol di kanan untuk membuat rekap bulanan, mengunduh arsip foto (ZIP), atau menyimpan data ke PDF dan Excel.',
      placement: 'bottom',
    },
    {
      id: 'reports-table',
      moduleId: 'reports',
      tabId: 'reports',
      target: 'reports-table',
      sectionLabel: 'Laporan Kerja',
      title: 'Daftar Laporan Teknisi',
      description:
        'Klik baris laporan mana saja untuk melihat detail lengkap mulai dari lokasi GPS, foto pengerjaan, catatan obat, verifikasi admin, hingga unduh PDF resmi.',
      placement: 'top',
    },
  ],
  tracking: [
    {
      id: 'tracking-switcher',
      moduleId: 'tracking',
      tabId: 'tracking',
      target: 'tracking-mode-switcher',
      sectionLabel: 'Peta Lokasi',
      title: 'Pilih Posisi Saat Ini atau Riwayat Rute',
      description:
        'Pilih "Posisi Saat Ini" untuk melihat titik terakhir teknisi di peta, atau "Riwayat Rute" untuk melihat urutan lokasi yang sudah dikunjungi hari ini.',
      placement: 'bottom',
    },
    {
      id: 'tracking-summary',
      moduleId: 'tracking',
      tabId: 'tracking',
      target: 'tracking-activity-cards',
      sectionLabel: 'Peta Lokasi',
      title: 'Status Keaktifan Lokasi Tim',
      description:
        'Melihat cepat berapa teknisi yang baru mengirim lokasi dalam 10 menit terakhir, 1 jam terakhir, atau sedang istirahat.',
      placement: 'bottom',
    },
    {
      id: 'tracking-map',
      moduleId: 'tracking',
      tabId: 'tracking',
      target: 'tracking-map-panel',
      sectionLabel: 'Peta Lokasi',
      title: 'Pilih Teknisi & Lihat Peta',
      description:
        'Klik nama salah satu teknisi di kiri untuk fokus pada posisi atau rute orang tersebut, atau klik "Tampilkan Semua" untuk melihat seluruh tim.',
      placement: 'top',
    },
  ],
  customers: [
    {
      id: 'customers-workspace',
      moduleId: 'customers',
      tabId: 'customers',
      target: 'customers-workspace',
      sectionLabel: 'Pelanggan',
      title: 'Data Pelanggan & Kontrol Garansi',
      description:
        'Simpan data klien, titik peta lokasi proyek agar absen GPS teknisi akurat, riwayat layanan Anti Rayap atau Pest Control, serta masa garansi yang masih aktif.',
      placement: 'top',
    },
  ],
  approval: [
    {
      id: 'approval-create',
      moduleId: 'approval',
      tabId: 'approval',
      target: 'approval-create-form',
      sectionLabel: 'Tim & Akun',
      title: 'Tambah Akun Staf Baru',
      description:
        'Isi nama, email, kata sandi awal, dan jabatan untuk membuat akun baru. Akun langsung aktif dan bisa dipakai login.',
      placement: 'bottom',
    },
    {
      id: 'approval-invite',
      moduleId: 'approval',
      tabId: 'approval',
      target: 'approval-invite-card',
      sectionLabel: 'Tim & Akun',
      title: 'Buat Link Pendaftaran Sendiri',
      description:
        'Pilih jabatan lalu buat link undangan (berlaku 7 hari) supaya anggota tim baru bisa mengisi data dan kata sandi sendiri.',
      placement: 'bottom',
    },
    {
      id: 'approval-list',
      moduleId: 'approval',
      tabId: 'approval',
      target: 'approval-user-list',
      sectionLabel: 'Tim & Akun',
      title: 'Daftar Akun Anggota Tim',
      description:
        'Cari nama staf, lihat status aktif atau nonaktif, reset kata sandi jika lupa, atau nonaktifkan akun yang sudah tidak bertugas.',
      placement: 'top',
    },
  ],
  templates: [
    {
      id: 'settings-tabs',
      moduleId: 'templates',
      tabId: 'templates',
      target: 'settings-subtabs',
      sectionLabel: 'Pengaturan',
      title: 'Pilihan Menu Pengaturan',
      description:
        'Ganti antara pengaturan "Kop Surat & TTD" untuk tampilan PDF, "Aturan Jarak & Foto" untuk batas absen teknisi, serta "Profil & Tema".',
      placement: 'bottom',
    },
    {
      id: 'settings-panel',
      moduleId: 'templates',
      tabId: 'templates',
      target: 'settings-content',
      sectionLabel: 'Pengaturan',
      title: 'Atur Kop Dokumen & Tanda Tangan',
      description:
        'Pasang logo perusahaan, alamat kantor, dan nama penandatangan agar setiap PDF laporan dan penawaran tercetak rapi dan seragam.',
      placement: 'top',
    },
  ],
  quotation: [
    {
      id: 'quotation-workspace',
      moduleId: 'quotation',
      tabId: 'quotation',
      target: 'quotation-workspace',
      sectionLabel: 'Penawaran (PH)',
      title: 'Buat & Pantau Surat Penawaran',
      description:
        'Susun draf penawaran harga untuk klien, ajukan persetujuan pimpinan, cetak PDF resmi, lalu ubah statusnya jika sudah disepakati.',
      placement: 'top',
    },
  ],
  inventory: [
    {
      id: 'inventory-workspace',
      moduleId: 'inventory',
      tabId: 'inventory',
      target: 'inventory-workspace',
      sectionLabel: 'Gudang & Obat',
      title: 'Kelola Stok Obat & Pemakaian Proyek',
      description:
        'Catat barang masuk dari supplier, catat obat yang dibawa teknisi ke proyek, pantau stok yang hampir habis, dan unduh laporan Excel.',
      placement: 'top',
    },
  ],
  'spk-cms': [
    {
      id: 'spk-workspace',
      moduleId: 'spk-cms',
      tabId: 'spk-cms',
      target: 'spk-workspace',
      sectionLabel: 'SPK & Proyek',
      title: 'Buat SPK & Jadwal Lapangan',
      description:
        'Terbitkan Surat Perintah Kerja untuk teknisi lapangan dan atur lokasi serta jadwal setiap proyek yang berjalan.',
      placement: 'top',
    },
  ],
  'order-tracking': [
    {
      id: 'order-tracking-workspace',
      moduleId: 'order-tracking',
      tabId: 'order-tracking',
      target: 'order-tracking-workspace',
      sectionLabel: 'Tagihan & Performa',
      title: 'Pantau Tagihan, Pemasukan & Target',
      description:
        'Cek status pembayaran dan cicilan klien, rekap pemasukan bulanan, serta pencapaian target tim marketing.',
      placement: 'top',
    },
  ],
  'saas-companies': [
    {
      id: 'saas-workspace',
      moduleId: 'saas-companies',
      tabId: 'saas-companies',
      target: 'saas-workspace',
      sectionLabel: 'Daftar Perusahaan',
      title: 'Kelola Perusahaan Terdaftar',
      description:
        'Lihat daftar perusahaan yang memakai aplikasi, ubah status aktif atau masa percobaan, serta buat link undangan untuk Direktur perusahaan.',
      placement: 'top',
    },
  ],
};

/**
 * Memetakan berbagai alias activeTab di AdminDashboard ke moduleId induk yang konsisten.
 */
export function resolveGuideModuleId(activeTab: string): AppGuideModuleId {
  switch (activeTab) {
    case 'dashboard':
      return 'dashboard';
    case 'reports':
    case 'anomalies':
      return 'reports';
    case 'tracking':
      return 'tracking';
    case 'customers':
    case 'kontrol-rayap':
      return 'customers';
    case 'approval':
    case 'executors':
      return 'approval';
    case 'templates':
    case 'risk-config':
    case 'profile':
      return 'templates';
    case 'quotation':
      return 'quotation';
    case 'inventory':
      return 'inventory';
    case 'spk-cms':
    case 'projects':
      return 'spk-cms';
    case 'order-tracking':
    case 'cashflow':
    case 'performa':
      return 'order-tracking';
    case 'saas-companies':
      return 'saas-companies';
    default:
      return 'navigation';
  }
}

/**
 * Menentukan daftar modul panduan yang relevan dengan role pengguna & item sidebar yang tersedia.
 */
export function getAvailableGuideModuleIds(
  role?: string | null,
  sidebarModuleIds: string[] = [],
  activeTab?: string
): AppGuideModuleId[] {
  const ordered: AppGuideModuleId[] = ['navigation'];
  const pushUnique = (id: AppGuideModuleId) => {
    if (!ordered.includes(id)) ordered.push(id);
  };

  for (const rawId of sidebarModuleIds) {
    const resolved = resolveGuideModuleId(rawId);
    if (resolved !== 'navigation') {
      pushUnique(resolved);
    }
  }

  if (role === 'MASTER_SUPER_ADMIN') {
    pushUnique('saas-companies');
  } else if (role === 'INVENTORY') {
    pushUnique('inventory');
  } else if (role === 'MARKETING') {
    pushUnique('quotation');
  }

  if (activeTab) {
    const activeResolved = resolveGuideModuleId(activeTab);
    if (activeResolved !== 'navigation') {
      pushUnique(activeResolved);
    }
  }

  return ordered;
}

/**
 * Menghasilkan daftar kartu modul untuk ditampilkan pada Hub 'Panduan Aplikasi'.
 */
export function getAppGuideModuleCards(
  role?: string | null,
  sidebarModuleIds: string[] = [],
  activeTab?: string
): AppGuideModuleCard[] {
  const moduleIds = getAvailableGuideModuleIds(role, sidebarModuleIds, activeTab);
  return moduleIds.map(id => {
    const meta = MODULE_META[id];
    const steps = APP_GUIDE_STEPS_BY_MODULE[id] || [];
    return {
      id,
      label: meta.label,
      subtitle: meta.subtitle,
      stepCount: steps.length,
      tabId: meta.tabId,
    };
  });
}

/**
 * Mengambil urutan langkah tur sesuai cakupan:
 * - `'all'`: seluruh langkah lintas modul yang tersedia untuk role pengguna
 * - `<moduleId>`: langkah spesifik modul tersebut saja
 */
export function getAppGuideStepsForScope(
  scope: AppGuideScope,
  role?: string | null,
  sidebarModuleIds: string[] = [],
  activeTab?: string
): AppGuideStep[] {
  if (scope === 'all') {
    const moduleIds = getAvailableGuideModuleIds(role, sidebarModuleIds, activeTab);
    return moduleIds.flatMap(id => APP_GUIDE_STEPS_BY_MODULE[id] || []);
  }
  return APP_GUIDE_STEPS_BY_MODULE[scope] || APP_GUIDE_STEPS_BY_MODULE.navigation;
}
