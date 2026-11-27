export type GuidePageId =
  | 'home'
  | 'jobs'
  | 'history'
  | 'profile'
  | 'worksheet'
  | 'completion';

export type GuideTopicId = 'all' | GuidePageId;

export interface SpotlightStep {
  id: string;
  page: GuidePageId;
  sectionLabel: string;
  target: string;
  title: string;
  description: string;
  tip?: string;
}

export interface GuideSectionCard {
  id: GuidePageId;
  label: string;
  subtitle: string;
  stepCount: number;
}

export const TECH_HOME_GUIDE_STEPS: SpotlightStep[] = [
  {
    id: 'header-status',
    page: 'home',
    sectionLabel: 'Beranda',
    target: 'header-status',
    title: 'Status Internet & Data Tersimpan',
    description:
      'Cek apakah HP sedang tersambung internet atau tidak. Jika sinyal hilang, laporan tetap tersimpan aman di HP dan bisa dikirim ulang lewat tombol ini.',
  },
  {
    id: 'kpi-strip',
    page: 'home',
    sectionLabel: 'Beranda',
    target: 'kpi-strip',
    title: 'Jumlah Tugas Hari Ini',
    description:
      'Menampilkan jumlah tugas hari ini, laporan yang sudah selesai, dan tugas yang masih menunggu. Ketuk salah satu angka untuk langsung membuka daftarnya.',
  },
  {
    id: 'primary-task',
    page: 'home',
    sectionLabel: 'Beranda',
    target: 'primary-task',
    title: 'Tugas Berikutnya & Absen Lokasi',
    description:
      'Jadwal terdekat selalu muncul di paling atas beserta alamat klien. Tekan tombol hijau untuk mulai jalan, absen GPS di lokasi, atau lanjut isi laporan.',
    tip: 'Buka rincian tugas jika ingin melihat peta, target pengerjaan, atau nomor PIC lokasi.',
  },
  {
    id: 'quick-actions',
    page: 'home',
    sectionLabel: 'Beranda',
    target: 'quick-actions',
    title: 'Tambah Tugas & Ambil Jadwal Baru',
    description:
      'Gunakan Tugas Baru jika ada lokasi tambahan mendadak di lapangan. Tekan Sinkron Data untuk menarik jadwal terbaru dari kantor atau mengirim data yang tertunda.',
  },
  {
    id: 'upcoming-jobs',
    page: 'home',
    sectionLabel: 'Beranda',
    target: 'upcoming-jobs',
    title: 'Jadwal Kunjungan Selanjutnya',
    description:
      'Daftar tugas berikutnya sudah diurutkan berdasarkan jam mulai supaya Anda mudah mengatur rute perjalanan.',
  },
  {
    id: 'home-history-preview',
    page: 'home',
    sectionLabel: 'Beranda',
    target: 'home-history-preview',
    title: 'Laporan yang Baru Selesai',
    description:
      'Pekerjaan terakhir yang sudah beres tampil ringkas di sini. Ketuk salah satu laporan untuk melihat rinciannya atau menyimpan PDF.',
  },
];

export const TECH_JOBS_GUIDE_STEPS: SpotlightStep[] = [
  {
    id: 'jobs-day-tabs',
    page: 'jobs',
    sectionLabel: 'Daftar Tugas',
    target: 'jobs-day-tabs',
    title: 'Pilih Hari Jadwal',
    description:
      'Ganti tab Kemarin, Hari Ini, Besok, atau Semua untuk mengecek pekerjaan yang sudah selesai atau persiapan jadwal besok.',
  },
  {
    id: 'jobs-search',
    page: 'jobs',
    sectionLabel: 'Daftar Tugas',
    target: 'jobs-search',
    title: 'Cari Proyek atau Klien',
    description:
      'Ketik nomor WO, nama proyek, atau nama pelanggan agar tugas langsung ketemu tanpa perlu menggulir panjang.',
  },
  {
    id: 'jobs-list',
    page: 'jobs',
    sectionLabel: 'Daftar Tugas',
    target: 'jobs-list',
    title: 'Daftar Kartu Tugas',
    description:
      'Setiap kartu menampilkan nomor WO, jenis layanan (Anti Rayap atau Pest Control), dan status pengerjaan. Ketuk kartu untuk melihat alamat lengkap sebelum absen.',
  },
];

export const TECH_HISTORY_GUIDE_STEPS: SpotlightStep[] = [
  {
    id: 'history-search-date',
    page: 'history',
    sectionLabel: 'Riwayat',
    target: 'history-search-date',
    title: 'Cari Laporan & Pilih Tanggal',
    description:
      'Cari laporan lama berdasarkan nama klien atau nomor WO. Tekan tombol Tanggal jika ingin memilih rentang hari dari awal sampai akhir.',
    tip: 'Tanggal dengan titik hijau di kalender berarti ada laporan selesai pada hari itu.',
  },
  {
    id: 'history-filters',
    page: 'history',
    sectionLabel: 'Riwayat',
    target: 'history-filters',
    title: 'Saring Laporan',
    description:
      'Saring daftar laporan berdasarkan waktu (Hari Ini, 7 Hari, 30 Hari), jenis layanan (Anti Rayap atau Pest Control), maupun statusnya.',
  },
  {
    id: 'history-groups',
    page: 'history',
    sectionLabel: 'Riwayat',
    target: 'history-groups',
    title: 'Daftar Laporan per Tanggal & Simpan PDF',
    description:
      'Laporan dikelompokkan berdasarkan tanggal pengerjaan. Anda bisa langsung membuka rinciannya atau menekan Unduh PDF untuk menyimpan salinan di HP.',
  },
];

export const TECH_PROFILE_GUIDE_STEPS: SpotlightStep[] = [
  {
    id: 'profile-metrics',
    page: 'profile',
    sectionLabel: 'Profil',
    target: 'profile-metrics',
    title: 'Ringkasan Kerja Bulan Ini',
    description:
      'Lihat jumlah kunjungan bulan ini, laporan yang sudah masuk ke kantor, dan apakah masih ada data yang belum terkirim.',
  },
  {
    id: 'profile-theme',
    page: 'profile',
    sectionLabel: 'Profil',
    target: 'profile-theme',
    title: 'Tampilan Terang & Gelap',
    description:
      'Pilih Mode Gelap saat bekerja di tempat redup seperti basement atau gudang agar layar lebih nyaman dilihat.',
  },
  {
    id: 'profile-actions',
    page: 'profile',
    sectionLabel: 'Profil',
    target: 'profile-actions',
    title: 'Penyimpanan HP, Kata Sandi & Panduan',
    description:
      'Bersihkan sisa foto sementara agar memori HP tetap lega (data laporan tetap aman), ganti kata sandi, atau buka lagi panduan ini kapan saja.',
  },
];

export const WORKSHEET_GUIDE_STEPS: SpotlightStep[] = [
  {
    id: 'worksheet-locked',
    page: 'worksheet',
    sectionLabel: 'Form Laporan',
    target: 'worksheet-locked',
    title: 'Jenis Form Otomatis Sesuai Tugas',
    description:
      'Form otomatis menyesuaikan tugas Anda (Anti Rayap saja atau Pest Control saja) supaya tidak salah isi.',
  },
  {
    id: 'worksheet-gps',
    page: 'worksheet',
    sectionLabel: 'Form Laporan',
    target: 'worksheet-gps',
    title: 'Tandai Lokasi Kerja (GPS)',
    description:
      'Tekan Simpan Lokasi Saat Ini untuk mencatat titik koordinat pengerjaan. Lokasinya otomatis muncul sebagai peta kecil di hasil laporan.',
  },
  {
    id: 'worksheet-findings',
    page: 'worksheet',
    sectionLabel: 'Form Laporan',
    target: 'worksheet-findings',
    title: 'Isi Temuan, Cara Kerja & Area',
    description:
      'Pilih temuan hama, metode pengerjaan, dan area yang ditangani. Semua isian tersimpan otomatis di HP meskipun aplikasi sempat tertutup.',
  },
  {
    id: 'worksheet-voice',
    page: 'worksheet',
    sectionLabel: 'Form Laporan',
    target: 'worksheet-voice',
    title: 'Tulis Catatan Pakai Suara',
    description:
      'Jika tangan sedang kotor atau pakai sarung tangan, tekan tombol suara lalu bicara. Ucapan Anda langsung tertulis ke kolom catatan.',
  },
  {
    id: 'worksheet-sign',
    page: 'worksheet',
    sectionLabel: 'Form Laporan',
    target: 'worksheet-sign',
    title: 'Tanda Tangan Teknisi & PIC',
    description:
      'Isi tanda tangan teknisi dan nama penanggung jawab lokasi, lalu lanjut ke tanda tangan pelanggan untuk menyelesaikan laporan.',
  },
];

export const COMPLETION_GUIDE_STEPS: SpotlightStep[] = [
  {
    id: 'summary-minimap',
    page: 'completion',
    sectionLabel: 'Ringkasan Laporan',
    target: 'summary-minimap',
    title: 'Info Proyek & Peta Lokasi',
    description:
      'Cek kembali nama proyek, jam mulai-selesai, durasi kerja, serta peta kecil titik lokasi pengerjaan yang sudah disimpan.',
  },
  {
    id: 'summary-docs',
    page: 'completion',
    sectionLabel: 'Ringkasan Laporan',
    target: 'summary-docs',
    title: 'Foto Bukti & Tanda Tangan',
    description:
      'Semua foto lapangan (ketuk foto untuk memperbesar), nama tim, dan tanda tangan teknisi beserta PIC tersusun di bagian ini.',
  },
  {
    id: 'summary-actions',
    page: 'completion',
    sectionLabel: 'Ringkasan Laporan',
    target: 'summary-actions',
    title: 'Simpan PDF & Kirim WhatsApp',
    description:
      'Simpan salinan laporan berbentuk PDF ke HP Anda, atau langsung kirim ringkasannya ke pelanggan lewat WhatsApp.',
  },
];

export const TECH_FULL_TOUR_STEPS: SpotlightStep[] = [
  ...TECH_HOME_GUIDE_STEPS,
  ...TECH_JOBS_GUIDE_STEPS,
  ...TECH_HISTORY_GUIDE_STEPS,
  ...TECH_PROFILE_GUIDE_STEPS,
];

const STEPS_BY_PAGE: Record<GuidePageId, SpotlightStep[]> = {
  home: TECH_HOME_GUIDE_STEPS,
  jobs: TECH_JOBS_GUIDE_STEPS,
  history: TECH_HISTORY_GUIDE_STEPS,
  profile: TECH_PROFILE_GUIDE_STEPS,
  worksheet: WORKSHEET_GUIDE_STEPS,
  completion: COMPLETION_GUIDE_STEPS,
};

export function getSpotlightStepsForTopic(topic: GuideTopicId): SpotlightStep[] {
  if (topic === 'all') return TECH_FULL_TOUR_STEPS;
  return STEPS_BY_PAGE[topic] || TECH_HOME_GUIDE_STEPS;
}

export function resolveDefaultTopicForPage(currentPage: string): GuideTopicId {
  if (currentPage === 'worksheet') return 'worksheet';
  if (currentPage === 'completion') return 'completion';
  return 'all';
}

export function isContextualSubpage(currentPage: string): currentPage is 'worksheet' | 'completion' {
  return currentPage === 'worksheet' || currentPage === 'completion';
}

export function getMainGuideSectionCards(): GuideSectionCard[] {
  return [
    {
      id: 'home',
      label: 'Beranda',
      subtitle: 'Tugas hari ini, absen GPS & kirim data',
      stepCount: TECH_HOME_GUIDE_STEPS.length,
    },
    {
      id: 'jobs',
      label: 'Daftar Tugas',
      subtitle: 'Lihat jadwal kerja & cari proyek',
      stepCount: TECH_JOBS_GUIDE_STEPS.length,
    },
    {
      id: 'history',
      label: 'Riwayat',
      subtitle: 'Cari laporan lama & simpan PDF',
      stepCount: TECH_HISTORY_GUIDE_STEPS.length,
    },
    {
      id: 'profile',
      label: 'Profil',
      subtitle: 'Ringkasan kerja, tema gelap & akun',
      stepCount: TECH_PROFILE_GUIDE_STEPS.length,
    },
  ];
}
