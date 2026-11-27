/**
 * Barventis v5.7 Full-Coverage Role Spotlight Steps
 * Every step targets its exact sidebar menu (`nav-<navTarget>`) on Desktop/Tablet
 * and adapts automatically to Bottom Navigation (`mob-<navTarget>`) on Mobile.
 */

export function resolveSpotlightRoleKey(role = '', isHeadBarUser = false) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'owner' || r === 'admin / owner' || r === 'admin  owner' || r === 'super admin' || r === 'superadmin') {
    return 'OWNER';
  }
  if (r === 'purchasing') return 'PURCHASING';
  if (r === 'central') return 'CENTRAL';
  if (r === 'head bar' || r === 'supervisor' || isHeadBarUser) return 'HEAD_BAR';
  return 'BARISTA';
}

export function getRoleDisplayName(roleKey) {
  const labels = {
    OWNER: 'Owner / Admin',
    HEAD_BAR: 'Head Bar',
    BARISTA: 'Barista',
    PURCHASING: 'Purchasing',
    CENTRAL: 'Gudang Central',
  };
  return labels[roleKey] || 'Tim Operasional';
}

export function getSpotlightGuideForRole(role = '', isHeadBarUser = false, basePath = '/dashboard') {
  const roleKey = resolveSpotlightRoleKey(role, isHeadBarUser);
  const roleLabel = getRoleDisplayName(roleKey);

  if (roleKey === 'OWNER') {
    const steps = [
      {
        id: 'owner-dashboard',
        section: 'Ringkasan',
        navTarget: 'dashboard',
        target: 'nav-dashboard',
        route: basePath,
        title: 'Dashboard Eksekutif',
        body: 'Pantau rasio biaya F&B terhadap target 27%, total penjualan, nilai stok, dan perbandingan performa seluruh cabang dari satu layar.',
        tip: 'Gunakan pilihan Cabang Aktif atau Semua Cabang di bagian atas untuk membandingkan tiap lokasi.',
      },
      {
        id: 'owner-daily',
        section: 'Operasional',
        navTarget: 'daily-inventory',
        target: 'nav-daily-inventory',
        route: `${basePath}/daily-inventory`,
        title: 'Stok Harian (EOD)',
        body: 'Periksa catatan pemakaian bahan harian dari setiap cabang, kecocokan dengan penjualan POS, dan status kunci shift harian.',
        tip: 'Data yang sudah dikunci EOD otomatis menjadi dasar perhitungan pemakaian aktual.',
      },
      {
        id: 'owner-prep',
        section: 'Operasional',
        navTarget: 'olah-bahan',
        target: 'nav-olah-bahan',
        route: `${basePath}/olah-bahan`,
        title: 'Olah Bahan & Pemecahan Stok',
        body: 'Pantau pencatatan olahan bahan mentah menjadi satu atau beberapa bahan jadi beserta persentase hasil dan ampasnya.',
        tip: 'Olahan dengan 0 waste otomatis tidak masuk ke laporan kerugian ampas.',
      },
      {
        id: 'owner-po',
        section: 'Pengadaan',
        navTarget: 'invoicing',
        target: 'nav-invoicing',
        route: `${basePath}/procurement?tab=invoicing`,
        title: 'Pengadaan & Purchase Order',
        body: 'Awasi seluruh tahapan PO mulai dari Requested, On Review, Validation Supplier, In Order, hingga Completed, Rejected, atau Canceled.',
        tip: 'Setiap perubahan harga saat penerimaan otomatis tercatat ke riwayat harga bahan.',
      },
      {
        id: 'owner-transfer',
        section: 'Distribusi',
        navTarget: 'transfer',
        target: 'nav-transfer',
        route: `${basePath}/transfer`,
        title: 'Mutasi Gudang',
        body: 'Pantau pengiriman stok dari Gudang Central ke masing-masing cabang dengan pencatatan transfer internal Rp 0 agar modal tidak terhitung ganda.',
        tip: 'Status mutasi tersusun rapi dari Requested, Approved, In Transit, hingga Completed.',
      },
      {
        id: 'owner-opname',
        section: 'Audit Stok',
        navTarget: 'opname-assets',
        target: 'nav-opname-assets',
        route: `${basePath}/opname-assets`,
        title: 'Stock Opname & Gelas Bar',
        body: 'Verifikasi selisih stok fisik bahan baku serta pantau inventaris gelas dan peralatan bar secara terpisah.',
        tip: 'Barang pecah yang dicatat langsung terhubung ke rekap Berita Acara bulanan.',
      },
      {
        id: 'owner-cost',
        section: 'Keuangan',
        navTarget: 'cost-control',
        target: 'nav-cost-control',
        route: `${basePath}/excel-cost-control`,
        title: 'Cost Control & Selisih HPP',
        body: 'Bandingkan pemakaian teoritis dari penjualan POS terhadap pemakaian aktual di lapangan untuk mendeteksi kebocoran biaya lebih awal.',
        tip: 'Kamu bisa mencatat penyesuaian event atau buffet agar rasio biaya tetap akurat.',
      },
      {
        id: 'owner-ba',
        section: 'Laporan',
        navTarget: 'berita-acara',
        target: 'nav-berita-acara',
        route: `${basePath}/excel-berita-acara`,
        title: 'Berita Acara Bulanan',
        body: 'Cetak dokumen resmi rekap bulanan waste bahan dan gelas pecah lengkap dengan kop logo perusahaan.',
        tip: 'Data ditarik otomatis dari catatan harian tanpa input ulang.',
      },
      {
        id: 'owner-admin',
        section: 'Pengaturan',
        navTarget: 'admin',
        target: 'nav-admin',
        route: `${basePath}/sistem?tab=admin`,
        title: 'Pengaturan Perusahaan & Logo PDF',
        body: 'Kelola cabang, undang akun asli untuk setiap peran (Central, Purchasing, Head Bar, Barista), dan atur logo resmi kop dokumen PDF.',
        tip: 'Logo yang diunggah di sini langsung aktif di seluruh PDF ekspor sistem.',
      },
    ];
    return {
      roleKey,
      roleLabel,
      sectionCards: [
        { id: 'ringkasan', label: 'Dashboard & Stok', subtitle: 'Rasio biaya, stok harian & olah bahan' },
        { id: 'pengadaan', label: 'PO & Mutasi', subtitle: 'Pantau pengadaan & distribusi Central' },
        { id: 'audit', label: 'Opname & Cost Control', subtitle: 'Audit fisik, gelas & selisih HPP' },
        { id: 'admin', label: 'Berita Acara & Setelan', subtitle: 'Cetak dokumen resmi & kelola staf' },
      ],
      allSteps: steps,
    };
  }

  if (roleKey === 'HEAD_BAR') {
    const steps = [
      {
        id: 'hb-dashboard',
        section: 'Ringkasan',
        navTarget: 'dashboard',
        target: 'nav-dashboard',
        route: basePath,
        title: 'Dashboard Head Bar',
        body: 'Lihat langsung bahan Bar yang menipis di cabangmu, pengiriman masuk dari Central, dan status permintaan PO cabang.',
        tip: 'Semua data di sini otomatis tersaring khusus untuk cabang tugasmu.',
      },
      {
        id: 'hb-daily',
        section: 'Harian',
        navTarget: 'daily-inventory',
        target: 'nav-daily-inventory',
        route: `${basePath}/daily-inventory`,
        title: 'Stok Harian (EOD)',
        body: 'Periksa input stok akhir shift dari tim Barista, unggah foto bukti closing, lalu kunci EOD di akhir operasional.',
        tip: 'Bar simpan di bawah selalu siap dijangkau tanpa perlu scroll kembali ke atas.',
      },
      {
        id: 'hb-prep',
        section: 'Harian',
        navTarget: 'olah-bahan',
        target: 'nav-olah-bahan',
        route: `${basePath}/olah-bahan`,
        title: 'Olah Bahan & Pemecahan Stok',
        body: 'Catat pengolahan bahan mentah menjadi satu atau beberapa bahan turunan dengan satuan fleksibel, termasuk opsi 0 waste tanpa foto ampas.',
        tip: 'Foto bahan mentah dan hasil bersih dapat diunggah setelah proses olah selesai.',
      },
      {
        id: 'hb-po',
        section: 'Pengadaan',
        navTarget: 'invoicing',
        target: 'nav-invoicing',
        route: `${basePath}/procurement?tab=invoicing`,
        title: 'Pengadaan & PO Cabang',
        body: 'Ajukan permintaan pembelian bahan cabang, pantau statusnya, dan konfirmasi penerimaan barang dengan foto bukti.',
        tip: 'PO yang sudah diterima akan otomatis menambah stok cabangmu.',
      },
      {
        id: 'hb-transfer',
        section: 'Distribusi',
        navTarget: 'transfer',
        target: 'nav-transfer',
        route: `${basePath}/transfer`,
        title: 'Mutasi Gudang',
        body: 'Ajukan permintaan barang dari Gudang Central ke cabangmu dan konfirmasi penerimaan saat pengiriman tiba.',
        tip: 'Tujuan mutasi otomatis dikunci ke cabang tugasmu agar tidak salah kirim.',
      },
      {
        id: 'hb-opname',
        section: 'Audit',
        navTarget: 'opname-assets',
        target: 'nav-opname-assets',
        route: `${basePath}/opname-assets`,
        title: 'Stock Opname Bahan',
        body: 'Lakukan penghitungan stok fisik berkala untuk memastikan angka sistem sama dengan stok nyata di bar.',
        tip: 'Catat alasan selisih agar mudah ditelusuri saat evaluasi bulanan.',
      },
      {
        id: 'hb-glass',
        section: 'Audit',
        navTarget: 'so-glass-tool',
        target: 'nav-so-glass-tool',
        route: `${basePath}/excel-so-glass-tool`,
        title: 'Gelas & Alat Bar',
        body: 'Catat inventaris gelas, shaker, dan peralatan bar serta laporan pecah atau rusak secara terpisah dari bahan baku.',
        tip: 'Catatan gelas pecah otomatis masuk ke rekap Berita Acara bulanan.',
      },
      {
        id: 'hb-ba',
        section: 'Laporan',
        navTarget: 'berita-acara',
        target: 'nav-berita-acara',
        route: `${basePath}/excel-berita-acara`,
        title: 'Berita Acara & Logo Kop PDF',
        body: 'Cetak Berita Acara bulanan cabang dan atur logo resmi kop dokumen PDF tanpa perlu merepotkan Owner.',
        tip: 'Periksa rekap otomatis sebelum mengunduh PDF resmi.',
      },
    ];
    return {
      roleKey,
      roleLabel,
      sectionCards: [
        { id: 'harian', label: 'Kerja Harian Bar', subtitle: 'Dashboard, stok harian & olah bahan' },
        { id: 'po_mutasi', label: 'PO & Mutasi', subtitle: 'Ajukan PO cabang & minta barang Central' },
        { id: 'audit', label: 'Opname & Gelas', subtitle: 'Audit fisik bahan & peralatan bar' },
        { id: 'laporan', label: 'Berita Acara & Kop', subtitle: 'Cetak BA bulanan & atur logo PDF' },
      ],
      allSteps: steps,
    };
  }

  if (roleKey === 'PURCHASING') {
    const steps = [
      {
        id: 'pur-dashboard',
        section: 'Ringkasan',
        navTarget: 'dashboard',
        target: 'nav-dashboard',
        route: basePath,
        title: 'Dashboard Pengadaan',
        body: 'Pantau jumlah permintaan PO yang menunggu proses, total nilai pengadaan bulan ini, dan ringkasan seluruh status PO.',
        tip: 'Klik tombol Buat PO Baru untuk memulai pengadaan cepat.',
      },
      {
        id: 'pur-invoicing',
        section: 'Pengadaan',
        navTarget: 'invoicing',
        target: 'nav-invoicing',
        route: `${basePath}/procurement?tab=invoicing`,
        title: 'Kelola PO (7 Tahapan)',
        body: 'Proses setiap PO dari Requested ke On Review (saat buka detail), Validation Supplier (saat klik WhatsApp supplier), In Order, hingga Completed.',
        tip: 'Jika PO ditolak atau dibatalkan, catatan alasan wajib diisi sebagai arsip.',
      },
      {
        id: 'pur-marketlist',
        section: 'Harga',
        navTarget: 'marketlist',
        target: 'nav-marketlist',
        route: `${basePath}/procurement?tab=marketlist`,
        title: 'Komparasi Harga & Bahan',
        body: 'Bandingkan harga antar supplier untuk setiap bahan baku dan atur pengingat jadwal PO H-2.',
        tip: 'Perubahan harga terbaru otomatis tersimpan ke riwayat harga.',
      },
      {
        id: 'pur-supplier',
        section: 'Supplier',
        navTarget: 'pembelian',
        target: 'nav-pembelian',
        route: `${basePath}/procurement?tab=pembelian`,
        title: 'Master Supplier & Petty Cash',
        body: 'Kelola daftar supplier, kontak WhatsApp resmi, matriks pembelian harian tanggal 1 sampai 31, dan kas kecil pengadaan.',
        tip: 'Pastikan nomor WhatsApp supplier aktif agar pintasan kirim PO berjalan lancar.',
      },
    ];
    return {
      roleKey,
      roleLabel,
      sectionCards: [
        { id: 'dash', label: 'Dashboard PO', subtitle: 'Ringkasan antrean & belanja bulanan' },
        { id: 'po', label: 'Kelola PO', subtitle: '7 tahapan status PO & kirim WhatsApp' },
        { id: 'harga', label: 'Komparasi Harga', subtitle: 'Bandingkan penawaran antar supplier' },
        { id: 'supplier', label: 'Supplier & Rekap', subtitle: 'Kontak supplier, matriks & petty cash' },
      ],
      allSteps: steps,
    };
  }

  if (roleKey === 'CENTRAL') {
    const steps = [
      {
        id: 'cen-dashboard',
        section: 'Ringkasan',
        navTarget: 'dashboard',
        target: 'nav-dashboard',
        route: basePath,
        title: 'Dashboard Gudang Central',
        body: 'Pantau jumlah unit barang masuk ke Central, pengiriman keluar ke cabang, antrean PO khusus Central, dan stok kritis gudang.',
        tip: 'Seluruh angka di sini fokus pada logistik fisik Gudang Central.',
      },
      {
        id: 'cen-transfer',
        section: 'Distribusi',
        navTarget: 'transfer',
        target: 'nav-transfer',
        route: `${basePath}/transfer`,
        title: 'Mutasi Central ke Cabang',
        body: 'Setujui permintaan barang dari cabang, kirim mutasi keluar, dan pantau status pengiriman hingga diterima (Completed).',
        tip: 'Klik Setuju atau Tolak untuk memproses permintaan cabang secara langsung.',
      },
      {
        id: 'cen-po',
        section: 'Pengadaan',
        navTarget: 'invoicing',
        target: 'nav-invoicing',
        route: `${basePath}/procurement?tab=invoicing`,
        title: 'PO Khusus Gudang Central',
        body: 'Ajukan permintaan PO grosir tujuan Central dan lakukan penerimaan barang (Goods Receipt) lengkap dengan foto bukti saat barang tiba.',
        tip: 'Daftar ini hanya menampilkan PO tujuan Central agar tidak bercampur dengan PO cabang.',
      },
      {
        id: 'cen-stock',
        section: 'Inventaris',
        navTarget: 'stock-ledger',
        target: 'nav-stock-ledger',
        route: `${basePath}/sistem?tab=stock-ledger`,
        title: 'Stok Gudang Central',
        body: 'Periksa sisa stok fisik tiap bahan di Gudang Central dan pantau bahan yang sudah menyentuh batas minimum.',
        tip: 'Segera ajukan PO Central jika bahan utama mendekati batas minimum.',
      },
    ];
    return {
      roleKey,
      roleLabel,
      sectionCards: [
        { id: 'dash', label: 'Dashboard Central', subtitle: 'Ringkasan barang masuk & keluar' },
        { id: 'mutasi', label: 'Mutasi ke Cabang', subtitle: 'Proses & kirim permintaan cabang' },
        { id: 'po', label: 'PO Central', subtitle: 'Permintaan PO & penerimaan barang' },
        { id: 'stok', label: 'Stok Central', subtitle: 'Pantau sisa & stok kritis gudang' },
      ],
      allSteps: steps,
    };
  }

  // BARISTA (Default Floor Role - 6 complete features)
  const steps = [
    {
      id: 'bar-dashboard',
      section: 'Shift',
      navTarget: 'dashboard',
      target: 'nav-dashboard',
      route: basePath,
      title: 'Dashboard Shift Barista',
      body: 'Lihat ringkasan tugas harian shift, daftar bahan yang menipis di bar cabangmu, dan informasi pengiriman barang masuk.',
      tip: 'Gunakan 3 tombol aksi cepat di atas untuk langsung memulai tugas shift.',
    },
    {
      id: 'bar-daily',
      section: 'Harian',
      navTarget: 'daily-inventory',
      target: 'nav-daily-inventory',
      route: `${basePath}/daily-inventory`,
      title: 'Stok Harian (EOD)',
      body: 'Isi sisa stok fisik bahan di akhir shift. Perubahan otomatis tersimpan setiap 5 detik, lalu gunakan bar bawah untuk foto bukti dan Kunci EOD.',
      tip: 'Tampilan ini sudah disederhanakan khusus untuk layar HP.',
    },
    {
      id: 'bar-prep',
      section: 'Harian',
      navTarget: 'olah-bahan',
      target: 'nav-olah-bahan',
      route: `${basePath}/olah-bahan`,
      title: 'Olah Bahan',
      body: 'Catat bahan mentah yang diolah menjadi satu atau beberapa bahan jadi. Jika tidak ada ampas (0 waste), foto ampas tidak perlu diunggah.',
      tip: 'Foto bahan mentah dan hasil olahan bisa diunggah setelah proses olah selesai.',
    },
    {
      id: 'bar-po',
      section: 'Pengadaan',
      navTarget: 'invoicing',
      target: 'nav-invoicing',
      route: `${basePath}/procurement?tab=invoicing`,
      title: 'Permintaan PO Cabang',
      body: 'Ajukan permintaan pembelian bahan bar yang habis dan bantu unggah foto penerimaan saat barang dari supplier datang.',
      tip: 'Status permintaan bisa dipantau langsung dari Requested sampai Completed.',
    },
    {
      id: 'bar-transfer',
      section: 'Distribusi',
      navTarget: 'transfer',
      target: 'nav-transfer',
      route: `${basePath}/transfer`,
      title: 'Minta Barang ke Central',
      body: 'Ajukan permintaan stok dari Gudang Central dan konfirmasi penerimaan saat barang sampai di cabangmu.',
      tip: 'Pastikan jumlah fisik sesuai sebelum menandai penerimaan selesai.',
    },
    {
      id: 'bar-glass',
      section: 'Peralatan',
      navTarget: 'so-glass-tool',
      target: 'nav-so-glass-tool',
      route: `${basePath}/excel-so-glass-tool`,
      title: 'Catat Gelas & Alat Pecah',
      body: 'Laporkan gelas pecah atau alat bar yang rusak agar stok peralatan cabang selalu akurat dan otomatis tercatat untuk Head Bar.',
      tip: 'Input angka langsung membuka keypad numerik di HP.',
    },
  ];
  return {
    roleKey,
    roleLabel,
    sectionCards: [
      { id: 'shift', label: 'Dashboard & Stok', subtitle: 'Tugas shift & input stok harian' },
      { id: 'prep', label: 'Olah Bahan', subtitle: 'Catat olahan multi-hasil & 0 waste' },
      { id: 'po_mutasi', label: 'PO & Mutasi', subtitle: 'Minta barang cabang & terima kiriman' },
      { id: 'gelas', label: 'Gelas & Alat Bar', subtitle: 'Lapor gelas pecah & alat rusak' },
    ],
    allSteps: steps,
  };
}
