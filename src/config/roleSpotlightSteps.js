/**
 * Role-based Interactive Spotlight Guide steps for Barventis.
 * Adapted from TechnicianSpotlightGuide.tsx with everyday Indonesian copy
 * tailored to each active role in Umatis Resto & Venue.
 */

export function resolveSpotlightRoleKey(role = '', isHeadBarUser = false) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'bar' || r === 'barista' || r === 'head bar' || r === 'rekan bar') {
    return isHeadBarUser || r === 'head bar' ? 'HEAD_BAR' : 'REKAN_BAR';
  }
  if (r === 'purchasing') return 'PURCHASING';
  if (r === 'central') return 'CENTRAL';
  if (r === 'kitchen') return 'KITCHEN';
  if (r === 'service') return 'SERVICE';
  if (r === 'kasir') return 'KASIR';
  return 'OWNER';
}

export function getRoleDisplayName(roleKey) {
  const labels = {
    OWNER: 'Owner / Admin',
    HEAD_BAR: 'Head Bar',
    REKAN_BAR: 'Rekan Bar',
    PURCHASING: 'Purchasing',
    CENTRAL: 'Gudang Central',
    KITCHEN: 'Kitchen (Dapur)',
    SERVICE: 'Service & Alat',
    KASIR: 'Kasir / Layanan'
  };
  return labels[roleKey] || 'Pengguna Barventis';
}

function buildStepsForRole(roleKey, basePath = '/dashboard') {
  switch (roleKey) {
    case 'PURCHASING':
      return {
        topics: [
          { id: 'po', label: 'Pembuatan PO', subtitle: 'Buat PO, bandingkan supplier & proses kirim' },
          { id: 'rekap', label: 'Rekap & Bulanan', subtitle: 'Pantau total PO dan matriks Tgl 1–31' },
          { id: 'komparasi', label: 'Komparasi Harga', subtitle: 'Cek efisiensi harga antar supplier' },
          { id: 'supplier', label: 'Supplier & Petty Cash', subtitle: 'Master supplier, Pasar Umum & Tempo' }
        ],
        steps: [
          {
            id: 'purch-header',
            topic: 'po',
            sectionLabel: 'Pembuatan PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'header-bar',
            title: 'Area Kerja Divisi Purchasing',
            description: 'Dari halaman ini kamu kelola seluruh permintaan PO cabang & Central, cek pengingat jadwal kirim, sampai penerimaan barang.',
            tip: 'Arahkan kursor ke sidebar kiri kapan saja untuk berpindah menu.'
          },
          {
            id: 'purch-create-po',
            topic: 'po',
            sectionLabel: 'Pembuatan PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'po-create-btn',
            title: 'Buat PO Baru (Pilih Bahan Dulu)',
            description: 'Klik + Buat PO Baru, cari bahan dulu dengan pencarian cepat, lalu bandingkan langsung harga antar supplier dan atur tanggal kirim (kalender H+N).',
            tip: 'Kalau ada harga naik/turun atau supplier baru, bisa langsung pakai shortcut -1rb/+1rb dan + Supplier Baru di dalam modal.'
          },
          {
            id: 'purch-table',
            topic: 'po',
            sectionLabel: 'Pembuatan PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'po-table',
            title: 'Proses PO Satu Jalur (1 Baris Rapi)',
            description: 'Klik Proses PO untuk ubah supplier/harga lalu pesan ke supplier. Saat barang tiba, klik Terima Barang. Detail, Chat WA, dan PDF tersedia langsung tanpa bikin bingung.',
            tip: 'Tombol Proses PO dan Edit PO membuka form yang sama agar data tetap sinkron.'
          },
          {
            id: 'purch-dashboard',
            topic: 'rekap',
            sectionLabel: 'Total PO Bulanan',
            route: basePath,
            target: 'main-workspace',
            title: 'Pantau Total PO Bulanan',
            description: 'Lihat ringkasan nilai belanja PO bulan berjalan, jumlah dokumen yang masih perlu diproses, dan status penerimaan barang.',
            tip: 'Gunakan pemilih cabang di pojok kanan atas untuk mengecek cabang tertentu.'
          },
          {
            id: 'purch-komparasi',
            topic: 'komparasi',
            sectionLabel: 'Komparasi Harga',
            route: `${basePath}/procurement?tab=marketlist`,
            target: 'main-workspace',
            title: 'Bandingkan Harga & Kualitas Supplier',
            description: 'Catat dan bandingkan harga dari beberapa supplier sekaligus untuk menemukan vendor paling hemat dengan kualitas setara.',
            tip: 'Setiap perubahan harga hanya berlaku ke depan (forward-only) supaya histori lama aman.'
          },
          {
            id: 'purch-supplier',
            topic: 'supplier',
            sectionLabel: 'Supplier & Matriks',
            route: `${basePath}/procurement?tab=pembelian`,
            target: 'main-workspace',
            title: 'Master Supplier, Matriks Tgl 1–31 & Petty Cash',
            description: 'Kelola daftar supplier (termasuk Pasar Umum), cek Matriks Rekap Belanja per bulan & tahun lengkap dengan export Excel/PDF, serta catat Petty Cash dan Tempo.',
            tip: 'Pilih bulan dan tahun di tab Matriks untuk mengunduh total QTY dan Total Belanja keseluruhan.'
          }
        ]
      };

    case 'HEAD_BAR':
      return {
        topics: [
          { id: 'daily', label: 'Daily Inventory', subtitle: 'Stok harian bahan & beer dalam 1 menu' },
          { id: 'opname', label: 'Stock Opname', subtitle: 'SO Resto, Central, & SO Glass/Tool' },
          { id: 'produksi', label: 'Produksi & PO', subtitle: 'Olah bahan, Split 0% Waste & PO Bar' },
          { id: 'audit', label: 'Cost Control & BA', subtitle: 'Komparasi Harian vs SO & Berita Acara' }
        ],
        steps: [
          {
            id: 'hb-daily',
            topic: 'daily',
            sectionLabel: 'Daily Inventory',
            route: `${basePath}/daily-inventory`,
            target: 'main-workspace',
            title: 'Daily Inventory (Bahan & Beer Jadi Satu)',
            description: 'Catat stok awal, masuk, dan sisa akhir shift untuk bahan racikan maupun beer dari satu halaman tanpa perlu pindah-pindah menu.',
            tip: 'Pastikan closing harian diisi rutin agar laporan pemakaian harian di Cost Control akurat.'
          },
          {
            id: 'hb-opname',
            topic: 'opname',
            sectionLabel: 'Stock Opname',
            route: `${basePath}/opname-assets`,
            target: 'main-workspace',
            title: 'Stock Opname Resto, Central & SO Glass',
            description: 'Pilih area opname langsung di halaman ini: stok fisik meja/chiller Resto, gudang Central, atau audit aset Gelas & Tool.',
            tip: 'Data gelas pecah dari SO Glass otomatis bisa ditarik ke Berita Acara bulanan.'
          },
          {
            id: 'hb-produksi',
            topic: 'produksi',
            sectionLabel: 'Proses Produksi',
            route: `${basePath}/olah-bahan`,
            target: 'main-workspace',
            title: 'Olah Bahan & Split Bahan 0% Waste',
            description: 'Catat produksi sirup/base, trimming buah, atau pecah 1 bahan induk (misalnya Kelapa Urgent) menjadi 2 stok turunan tanpa terhitung waste.',
            tip: 'Gunakan fitur Split Bahan saat memecah bahan utuh agar stok turunan langsung bertambah.'
          },
          {
            id: 'hb-po',
            topic: 'produksi',
            sectionLabel: 'Permintaan PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'main-workspace',
            title: 'Permintaan PO & ACC Order Central',
            description: 'Ajukan PO bahan bar, verifikasi order dari Central (ACC Head Bar), dan unggah foto barang + surat jalan saat menerima pengiriman.',
            tip: 'Jika stok tersedia di Central, gunakan Mutasi Gudang (Rp 0) agar tidak dobel belanja.'
          },
          {
            id: 'hb-cc',
            topic: 'audit',
            sectionLabel: 'Cost Control',
            route: `${basePath}/excel-cost-control`,
            target: 'main-workspace',
            title: 'Cost Control Dual-Mode & Event/Buffet',
            description: 'Bandingkan pemakaian berdasarkan input harian dengan hasil Stock Opname, serta masukkan catatan Buffet/Event/Compliment (Rp 0) agar rasio HPP adil.',
            tip: 'Semua penyesuaian Buffet/Event tersimpan langsung ke database.'
          },
          {
            id: 'hb-ba',
            topic: 'audit',
            sectionLabel: 'Berita Acara',
            route: `${basePath}/excel-berita-acara`,
            target: 'main-workspace',
            title: 'Berita Acara Waste & Gelas Pecah Bulanan',
            description: 'Tarik langsung data waste dan gelas pecah dari database, pantau riwayat 6 bulan per karyawan, lalu cetak mode hemat 1 lembar atau PDF lengkap dengan foto.',
            tip: 'Klik Simpan ke Database sebelum mencetak supaya histori 6 bulan selalu terupdate.'
          }
        ]
      };

    case 'REKAN_BAR':
      return {
        topics: [
          { id: 'daily', label: 'Daily Inventory', subtitle: 'Catat stok harian bahan & beer' },
          { id: 'produksi', label: 'Proses Produksi', subtitle: 'Produksi sirup, trimming & split bahan' },
          { id: 'po', label: 'Permintaan PO', subtitle: 'Ajukan PO bar & foto terima barang' },
          { id: 'transfer', label: 'Minta ke Central', subtitle: 'Request mutasi stok Rp 0 dari Central' }
        ],
        steps: [
          {
            id: 'rb-daily',
            topic: 'daily',
            sectionLabel: 'Daily Inventory',
            route: `${basePath}/daily-inventory`,
            target: 'main-workspace',
            title: 'Catat Stok Harian Bahan & Beer',
            description: 'Isi sisa stok bahan racikan dan beer setiap akhir shift di satu menu Daily Inventory.',
            tip: 'Cek kembali satuan (gr/ml/botol) sebelum klik simpan.'
          },
          {
            id: 'rb-produksi',
            topic: 'produksi',
            sectionLabel: 'Proses Produksi',
            route: `${basePath}/olah-bahan`,
            target: 'main-workspace',
            title: 'Catat Produksi & Split Bahan',
            description: 'Input hasil batching sirup, teh base, trimming buah, atau split bahan agar kartu stok tetap sinkron dengan pemakaian aktual.',
            tip: 'Laporkan bahan yang rusak atau kadaluarsa di tab Waste agar tercatat rapi.'
          },
          {
            id: 'rb-po',
            topic: 'po',
            sectionLabel: 'Permintaan PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'main-workspace',
            title: 'Ajukan PO & Terima Barang',
            description: 'Buat permintaan PO ketika stok menipis. Saat kurir datang, klik Terima Barang dan lampirkan foto fisik barang serta surat jalan.',
            tip: 'Kalau barang tersedia di gudang Central, cukup minta lewat Mutasi Gudang.'
          },
          {
            id: 'rb-transfer',
            topic: 'transfer',
            sectionLabel: 'Minta Barang Central',
            route: `${basePath}/transfer`,
            target: 'main-workspace',
            title: 'Request Mutasi dari Central (Rp 0)',
            description: 'Ajukan permintaan transfer barang dari gudang Central ke Bar. Saat barang sampai di Bar, klik Terima Barang agar stok otomatis berpindah.',
            tip: 'Mutasi internal dicatat Rp 0 agar tidak terhitung belanja ganda.'
          }
        ]
      };

    case 'CENTRAL':
      return {
        topics: [
          { id: 'dashboard', label: 'Dashboard Central', subtitle: 'Ringkasan stok masuk & keluar' },
          { id: 'transfer', label: 'Mutasi ke Cabang', subtitle: 'Kirim stok ke Resto BSD / Kasuna' },
          { id: 'po', label: 'PO Central', subtitle: 'Ajukan PO grosir & terima barang' },
          { id: 'stok', label: 'Pantau Stok', subtitle: 'Cek lot, barcode & sisa gudang' }
        ],
        steps: [
          {
            id: 'ct-dash',
            topic: 'dashboard',
            sectionLabel: 'Dashboard Central',
            route: basePath,
            target: 'main-workspace',
            title: 'Pantau Arus Gudang Central',
            description: 'Lihat barang yang baru masuk dari supplier, permintaan mutasi dari cabang, dan stok yang mendekati batas minimum.',
            tip: 'Prioritaskan permintaan cabang yang berstatus menunggu kirim.'
          },
          {
            id: 'ct-transfer',
            topic: 'transfer',
            sectionLabel: 'Mutasi ke Cabang',
            route: `${basePath}/transfer`,
            target: 'main-workspace',
            title: 'Kirim Stok ke Cabang Tujuan (Rp 0)',
            description: 'Proses pengiriman barang dari Central ke Resto BSD atau Kasuna. Stok cabang otomatis bertambah begitu penerima mengonfirmasi penerimaan.',
            tip: 'Cek barcode lot barang sebelum dikirim agar pelacakan FIFO akurat.'
          },
          {
            id: 'ct-po',
            topic: 'po',
            sectionLabel: 'PO Central',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'main-workspace',
            title: 'Ajukan PO Central & Goods Receipt',
            description: 'Buat permintaan PO untuk pengisian ulang gudang Central (akan diverifikasi Head Bar sebelum diproses Purchasing), lalu konfirmasi terima barang dengan foto.',
            tip: 'Jika harga bon fisik berbeda dari PO, penyesuaian bisa dicatat saat Terima Barang.'
          },
          {
            id: 'ct-stok',
            topic: 'stok',
            sectionLabel: 'Buku Stok',
            route: `${basePath}/sistem?tab=stock-ledger`,
            target: 'main-workspace',
            title: 'Cek Kartu Stok & Cetak Barcode Lot',
            description: 'Pantau histori keluar-masuk setiap bahan di gudang Central dan seluruh cabang secara real-time.',
            tip: 'Gunakan kolom pencarian untuk mengecek saldo bahan tertentu dengan cepat.'
          }
        ]
      };

    case 'KITCHEN':
      return {
        topics: [
          { id: 'daily', label: 'Inventaris Kitchen', subtitle: 'Pemakaian harian bahan dapur' },
          { id: 'prep', label: 'Trimming & Prep', subtitle: 'Olah daging, ikan & sayur' },
          { id: 'po', label: 'PO & Mutasi', subtitle: 'Ajukan PO dapur & minta ke Central' },
          { id: 'opname', label: 'Stock Opname', subtitle: 'Audit fisik stok area dapur' }
        ],
        steps: [
          {
            id: 'kt-daily',
            topic: 'daily',
            sectionLabel: 'Inventaris Kitchen',
            route: `${basePath}/daily-inventory`,
            target: 'main-workspace',
            title: 'Catat Pemakaian Harian Dapur',
            description: 'Input sisa stok bahan dapur setiap closing shift agar pemakaian harian dan bahan yang hampir habis langsung terpantau.',
            tip: 'Catat juga bahan susut/rusak di tab Waste.'
          },
          {
            id: 'kt-prep',
            topic: 'prep',
            sectionLabel: 'Trimming & Prep',
            route: `${basePath}/olah-bahan`,
            target: 'main-workspace',
            title: 'Catat Trimming & Olahan Dapur',
            description: 'Rekam proses pemotongan daging, ikan, sayur, atau saus base agar berat bersih (yield) tercatat akurat di stok.',
            tip: 'Pastikan berat hasil bersih diisi sesuai timbangan aktual.'
          },
          {
            id: 'kt-po',
            topic: 'po',
            sectionLabel: 'PO & Mutasi',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'main-workspace',
            title: 'Ajukan PO Dapur & Terima Barang',
            description: 'Buat permintaan PO bahan dapur ke Purchasing dan konfirmasi penerimaan barang lengkap dengan foto fisik.',
            tip: 'Untuk barang yang tersedia di gudang pusat, minta lewat menu Mutasi Gudang.'
          },
          {
            id: 'kt-opname',
            topic: 'opname',
            sectionLabel: 'Stock Opname',
            route: `${basePath}/opname-assets`,
            target: 'main-workspace',
            title: 'Stock Opname Area Dapur',
            description: 'Lakukan sensus fisik berkala di chiller dan dry store dapur untuk mencocokkan stok sistem dengan kondisi lapangan.',
            tip: 'Selisih stok otomatis muncul sebagai bahan evaluasi Cost Control.'
          }
        ]
      };

    case 'SERVICE':
      return {
        topics: [
          { id: 'aset', label: 'Alat & Glassware', subtitle: 'Inventaris gelas, alat makan & mesin' },
          { id: 'pecah', label: 'Lapor Barang Pecah', subtitle: 'Catat gelas pecah / alat rusak' },
          { id: 'daily', label: 'Inventaris Service', subtitle: 'Catat pemakaian amenities & floor' },
          { id: 'po', label: 'Permintaan PO', subtitle: 'Ajukan pengadaan alat & packaging' }
        ],
        steps: [
          {
            id: 'sv-aset',
            topic: 'aset',
            sectionLabel: 'Alat & Glassware',
            route: `${basePath}/opname-assets`,
            target: 'main-workspace',
            title: 'Pantau Daftar Gelas, Alat Makan & Aset',
            description: 'Cek jumlah aset aktif dan lakukan opname berkala untuk gelas, piring, cutleries, dan perlengkapan floor.',
            tip: 'Data barang rusak dari sini otomatis bisa masuk ke Berita Acara bulanan.'
          },
          {
            id: 'sv-pecah',
            topic: 'pecah',
            sectionLabel: 'Lapor Barang Pecah',
            route: `${basePath}/daily-inventory?tab=waste`,
            target: 'main-workspace',
            title: 'Lapor Gelas Pecah / Alat Rusak',
            description: 'Catat setiap insiden gelas pecah atau perlengkapan rusak beserta nama penanggung jawab dan tanggal kejadian.',
            tip: 'Pencatatan cepat memudahkan rekap Berita Acara akhir bulan.'
          },
          {
            id: 'sv-daily',
            topic: 'daily',
            sectionLabel: 'Inventaris Service',
            route: `${basePath}/daily-inventory`,
            target: 'main-workspace',
            title: 'Catat Stok Amenities & Packaging',
            description: 'Pantau pemakaian harian tisu, sedotan, kemasan takeaway, dan perlengkapan layanan lainnya.',
            tip: 'Update stok di akhir shift supaya tidak kehabisan mendadak.'
          },
          {
            id: 'sv-po',
            topic: 'po',
            sectionLabel: 'Permintaan PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'main-workspace',
            title: 'Ajukan PO Perlengkapan Service',
            description: 'Kirim permintaan pembelian alat/packaging baru ke Purchasing dan lakukan konfirmasi terima barang saat paket tiba.',
            tip: 'Lampirkan foto kondisi barang saat diterima.'
          }
        ]
      };

    case 'KASIR':
      return {
        topics: [
          { id: 'dash', label: 'Dashboard Layanan', subtitle: 'Ringkasan operasional harian' },
          { id: 'limbah', label: 'Lapor Limbah', subtitle: 'Catat barang pecah atau rusak' }
        ],
        steps: [
          {
            id: 'ks-dash',
            topic: 'dash',
            sectionLabel: 'Dashboard Layanan',
            route: basePath,
            target: 'main-workspace',
            title: 'Ringkasan Operasional Layanan',
            description: 'Pantau status operasional harian cabang aktif dari halaman Dashboard utama.',
            tip: 'Pastikan cabang aktif di pojok kanan atas sudah sesuai lokasi kerjamu.'
          },
          {
            id: 'ks-limbah',
            topic: 'limbah',
            sectionLabel: 'Lapor Limbah',
            route: `${basePath}/daily-inventory?tab=waste`,
            target: 'main-workspace',
            title: 'Catat Barang Pecah atau Rusak',
            description: 'Laporkan insiden barang pecah/rusak di area kasir atau floor agar langsung tercatat di log database.',
            tip: 'Isi keterangan singkat penyebab kerusakan supaya mudah diaudit.'
          }
        ]
      };

    case 'OWNER':
    default:
      return {
        topics: [
          { id: 'dashboard', label: 'Dashboard & Cabang', subtitle: 'Ringkasan HPP & pindah cabang BSD/Kasuna' },
          { id: 'pengadaan', label: 'Pengadaan & PO', subtitle: 'Pantau PO, komparasi supplier & rekap' },
          { id: 'cost', label: 'Cost Control & SO', subtitle: 'Audit variansi HPP, rasio biaya & opname' },
          { id: 'setelan', label: 'Setelan Owner & PDF', subtitle: 'Kelola user, cabang & Foto Validasi Umatis' }
        ],
        steps: [
          {
            id: 'ow-dash',
            topic: 'dashboard',
            sectionLabel: 'Dashboard Owner',
            route: basePath,
            target: 'main-workspace',
            title: 'Ringkasan HPP & Inventaris Cabang',
            description: 'Pantau performa biaya bahan (COGS), nilai stok berjalan, dan status PO seluruh operasional dari satu layar.',
            tip: 'Gunakan pemilih cabang di kanan atas untuk berganti antara Resto BSD, Kasuna, atau Central.'
          },
          {
            id: 'ow-po',
            topic: 'pengadaan',
            sectionLabel: 'Pengadaan & PO',
            route: `${basePath}/procurement?tab=invoicing`,
            target: 'main-workspace',
            title: 'Pantau PO & Efisiensi Supplier',
            description: 'Cek seluruh PO aktif, unduh PDF resmi, pantau perbandingan harga supplier, hingga rekap belanja bulanan Tgl 1–31 dan Petty Cash.',
            tip: 'Semua tombol aksi PO kini dirapikan 1 baris sesuai tahapan statusnya.'
          },
          {
            id: 'ow-cost',
            topic: 'cost',
            sectionLabel: 'Cost Control & SO',
            route: `${basePath}/cost-report`,
            target: 'main-workspace',
            title: 'Audit Cost Control & Stock Opname',
            description: 'Tinjau rasio HPP aktual vs teoritis POS ESB, perbandingan pemakaian harian vs opname, serta catatan Buffet/Event.',
            tip: 'Cek juga menu Berita Acara untuk persetujuan barang waste dan rekap gelas pecah.'
          },
          {
            id: 'ow-settings',
            topic: 'setelan',
            sectionLabel: 'Setelan Owner',
            route: `${basePath}/sistem?tab=admin`,
            target: 'main-workspace',
            title: 'Pengaturan Resto & Foto Validasi PDF Umatis',
            description: 'Kelola akun staf, cabang, kunci periode pembukuan, dan upload Foto/Logo Resmi Umatis di tab Profil Resto agar otomatis tercetak di setiap Export PDF.',
            tip: 'Foto Validasi Umatis otomatis muncul di kop, footer, dan stempel validasi setiap PDF.'
          }
        ]
      };
  }
}

export function getSpotlightGuideForRole(role = '', isHeadBarUser = false, basePath = '/dashboard') {
  const roleKey = resolveSpotlightRoleKey(role, isHeadBarUser);
  const config = buildStepsForRole(roleKey, basePath);
  const sectionCards = config.topics.map((t) => ({
    ...t,
    stepCount: config.steps.filter((s) => s.topic === t.id).length
  }));
  return {
    roleKey,
    roleLabel: getRoleDisplayName(roleKey),
    sectionCards,
    allSteps: config.steps
  };
}
