import { Project, WorkReport, UserLocation } from '@/entities/types';
import { serializePestFindingsToNotes } from '@/shared/lib/permenkesRecapEngine';

/**
 * Dataset Operasional Realistis PT Guci Emas Pratama (2 Role: ADMIN & TEKNISI_LAPANGAN)
 * Berfokus pada Geolocation Haversine & Digital Report (Laporan Hasil Pekerjaan).
 * Digunakan sebagai auto-seed / fallback sinkron apabila tabel database baru diinisialisasi
 * atau saat aplikasi dijalankan secara lokal/demo sebelum migrasi penuh dieksekusi.
 */

function getLocalOffsetYmd(offsetDays: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getOffsetIso(offsetDays: number, hour = 9, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeEvidenceSvgDataUrl(title: string, subtitle: string, coordsText: string, accent = '#1A5C38'): string {
  const safeTitle = escapeXml(title);
  const safeSubtitle = escapeXml(subtitle);
  const safeCoords = escapeXml(coordsText);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
    <rect width="640" height="420" fill="#17231C"/>
    <rect x="20" y="20" width="600" height="300" rx="14" fill="#223329" stroke="${accent}" stroke-width="2"/>
    <circle cx="320" cy="145" r="44" fill="${accent}" opacity="0.25"/>
    <path d="M300 145 L315 160 L345 130" stroke="#6EE7B7" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="320" y="225" text-anchor="middle" fill="#F0F4F1" font-family="Inter, sans-serif" font-size="18" font-weight="700">${safeTitle}</text>
    <text x="320" y="252" text-anchor="middle" fill="#A8B4AC" font-family="Inter, sans-serif" font-size="13">${safeSubtitle}</text>
    <rect x="20" y="334" width="600" height="66" rx="10" fill="#101613" stroke="#344239"/>
    <text x="36" y="360" fill="#6EE7B7" font-family="monospace" font-size="12" font-weight="700">GPS HAVERSINE WATERMARK • PT GUCI EMAS PRATAMA</text>
    <text x="36" y="382" fill="#F0F4F1" font-family="monospace" font-size="11.5">${safeCoords}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function makeHandwrittenSignatureSvg(name: string, variant: 'tech' | 'client'): string {
  const stroke = variant === 'tech' ? '#012d1d' : '#1e3a5f';
  const safeName = escapeXml(name);
  const path =
    variant === 'tech'
      ? 'M36 74 C52 24, 72 20, 68 58 C65 82, 92 28, 114 48 C130 62, 134 32, 152 46 C168 58, 182 36, 204 52 C220 64, 240 42, 266 54 M52 84 C118 74, 198 72, 262 78'
      : 'M32 68 C48 20, 80 18, 76 64 C73 84, 108 30, 126 52 C142 70, 156 26, 174 48 C190 66, 212 34, 234 50 C248 60, 260 44, 274 52 M46 86 C112 78, 196 76, 266 80';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">
    <rect width="320" height="110" fill="#ffffff"/>
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="160" y="102" text-anchor="middle" fill="#64748b" font-family="Inter, sans-serif" font-size="9.5" font-weight="600">${safeName}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEMO_COMPANY_ID = '11111111-1111-4111-8111-111111111111';
export const DEMO_ADMIN_ID = '22222222-2222-4222-8222-222222222222';
export const DEMO_TEKNISI_ID = '33333333-3333-4333-8333-333333333333';

export function buildRealisticProjects(): Project[] {
  return [
    // ======================= CONTOH LAPORAN LENGKAP (SELESAI HARI INI) =======================
    {
      id: 'proj-contoh-lengkap-00',
      projectName: 'Gedung Graha Nusantara — Injeksi & Barrier Anti Rayap',
      clientName: 'PT Graha Nusantara Mandiri',
      address: 'Jl. TB Simatupang Kav. 22, Cilandak, Jakarta Selatan',
      latitude: -6.292140,
      longitude: 106.811450,
      radius: 100,
      workDate: getLocalOffsetYmd(0),
      workType: 'Injeksi & Barrier Anti Rayap (Pasca Konstruksi)',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: 'Rayap Tanah (Coptotermes sp.) & Rayap Kayu Kering (Cryptotermes sp.)',
      targetFocus: ['Rayap Tanah (Coptotermes sp.)', 'Rayap Kayu Kering (Cryptotermes sp.)'],
      buildingAreaSqm: 450,
      contractType: 'ONE_TIME',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(14),
      scheduledStartTime: '08:00',
      notes: 'Contoh lengkap pengerjaan Anti Rayap pasca konstruksi: injeksi 120 titik pondasi, baiting perimeter, 6 foto bukti, dan tanda tangan lengkap.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-1, 8, 0),
      lockedAt: getOffsetIso(0, 10, 17),
    },
    // ======================= HARI INI (TODAY: offset 0) =======================
    {
      id: 'proj-pln-bulungan-01',
      projectName: 'PT PLN (Persero) UP3 Bulungan — Pest & Rodent Control',
      clientName: 'PT PLN (Persero) UP3 Bulungan',
      address: 'Jl. Sisingamangaraja No. 1, Kebayoran Baru, Jakarta Selatan',
      latitude: -6.241520,
      longitude: 106.797890,
      radius: 120,
      workDate: getLocalOffsetYmd(0),
      workType: 'Work Report Pest Control (Treatment Rutin)',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: 'Kecoa Jerman, Tikus Got, Nyamuk, Semut',
      targetFocus: ['Kecoa', 'Tikus', 'Nyamuk', 'Semut'],
      buildingAreaSqm: 1800,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(0),
      scheduledStartTime: '09:00',
      notes: 'Prioritaskan ruang server Lt. 1, pantry Lt. 2, dan jalur kabel basement B1. Lapor ke K3L sebelum mulai.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-2, 8, 30),
      lockedAt: null,
    },
    {
      id: 'proj-mandiri-sudirman-02',
      projectName: 'Bank Mandiri KC Sudirman — Inspeksi & Injeksi Anti Rayap',
      clientName: 'PT Bank Mandiri (Persero) Tbk KC Sudirman',
      address: 'Jl. Jend. Sudirman Kav. 54-55, Kebayoran Baru, Jakarta Selatan',
      latitude: -6.224510,
      longitude: 106.809630,
      radius: 100,
      workDate: getLocalOffsetYmd(0),
      workType: 'Injeksi & Barrier Anti Rayap (Pra/Pasca Konstruksi)',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: 'Rayap Tanah (Coptotermes) & Rayap Kayu Kering',
      targetFocus: ['Rayap Tanah (Coptotermes)', 'Rayap Kayu Kering (Cryptotermes)', 'Jalur Pondasi & Lantai'],
      buildingAreaSqm: 1450,
      contractType: 'RECURRING',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(0),
      scheduledStartTime: '13:30',
      notes: 'Cek 14 titik stasiun umpan perimeter luar dan injeksi kusen ruang arsip Lt. 1.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-1, 10, 0),
      lockedAt: null,
    },
    {
      id: 'proj-rs-medika-bsd-03',
      projectName: 'RS Medika BSD — Pengendalian Vektor & Sanitasi Pantry',
      clientName: 'PT Medika Lestari Nusantara (RS Medika BSD)',
      address: 'Jl. Letnan Sutopo Kav. Komersial IIIA, BSD City, Tangerang Selatan',
      latitude: -6.301420,
      longitude: 106.653110,
      radius: 100,
      workDate: getLocalOffsetYmd(0),
      workType: 'Work Report Pest Control (Treatment Rutin)',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: 'Kecoa, Lalat, Nyamuk, Semut',
      targetFocus: ['Kecoa', 'Lalat', 'Nyamuk', 'Semut'],
      buildingAreaSqm: 2200,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(0),
      scheduledStartTime: '15:30',
      notes: 'Gunakan gel baiting tidak berbau pada instalasi gizi & dapur utama rumah sakit.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-1, 14, 15),
      lockedAt: null,
    },

    // ======================= BESOK (TOMORROW: offset +1) =======================
    {
      id: 'proj-oreka-bintaro-04',
      projectName: 'PT Oreka Solusi Kreatif Bintaro — Sistem Pemipaan Anti Rayap',
      clientName: 'PT Oreka Solusi Kreatif',
      address: 'Jl. RC. Veteran Raya No. 9, Bintaro, Pesanggrahan, Jakarta Selatan',
      latitude: -6.269810,
      longitude: 106.764120,
      radius: 100,
      workDate: getLocalOffsetYmd(1),
      workType: 'Injeksi & Barrier Anti Rayap (Pra/Pasca Konstruksi)',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: 'Rayap Tanah (Coptotermes) & Instalasi Pipa PVC AW',
      targetFocus: ['Rayap Tanah (Coptotermes)', 'Jalur Pondasi & Lantai'],
      buildingAreaSqm: 650,
      contractType: 'ONE_TIME',
      warrantyMonths: 60,
      nextServiceDate: getLocalOffsetYmd(1),
      scheduledStartTime: '09:00',
      notes: 'Injeksi chemical barrier Premise 200 SL melalui inlet pemipaan pondasi.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(0, 8, 0),
      lockedAt: null,
    },
    {
      id: 'proj-santika-bintaro-05',
      projectName: 'Hotel Santika Premiere Bintaro — Pest Control Area F&B & Ballroom',
      clientName: 'PT Grahawita Santika (Hotel Santika Premiere Bintaro)',
      address: 'Jl. Prof. Dr. Satrio Blok B7/A3-01, CBD Bintaro Jaya, Tangerang Selatan',
      latitude: -6.276450,
      longitude: 106.724890,
      radius: 150,
      workDate: getLocalOffsetYmd(1),
      workType: 'Work Report Pest Control (Treatment Rutin)',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: 'Kecoa, Tikus, Lalat, Nyamuk',
      targetFocus: ['Kecoa', 'Tikus', 'Lalat', 'Nyamuk'],
      buildingAreaSqm: 3400,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(1),
      scheduledStartTime: '14:00',
      notes: 'Koordinasi dengan Chief Steward untuk inspeksi cold kitchen & loading dock.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(0, 9, 15),
      lockedAt: null,
    },

    // ======================= KEMARIN (YESTERDAY: offset -1) =======================
    {
      id: 'proj-victoria-fatmawati-06',
      projectName: 'Bank Victoria Cabang Fatmawati — Injeksi Anti Rayap Pasca Konstruksi',
      clientName: 'PT Bank Victoria International Tbk',
      address: 'Jl. RS. Fatmawati Raya No. 39, Cilandak, Jakarta Selatan',
      latitude: -6.283812,
      longitude: 106.796641,
      radius: 100,
      workDate: getLocalOffsetYmd(-1),
      workType: 'Injeksi & Barrier Anti Rayap (Pra/Pasca Konstruksi)',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: 'Rayap Tanah (Coptotermes curvignathus)',
      targetFocus: ['Rayap Tanah (Coptotermes)', 'Jalur Pondasi & Lantai', 'Kusen, Pintu & Partisi Kayu'],
      buildingAreaSqm: 1332,
      contractType: 'ONE_TIME',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(-1),
      scheduledStartTime: '08:30',
      notes: 'Pengeboran & injeksi pondasi 1 sisi, 2 sisi, dan penyemprotan plafon kayu.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-2, 9, 0),
      lockedAt: getOffsetIso(-1, 11, 30),
    },
    {
      id: 'proj-indofood-pulogadung-07',
      projectName: 'Gudang Logistik PT Indofood CBP Pulogadung — Rodent & Pest Control',
      clientName: 'PT Indofood CBP Sukses Makmur Tbk',
      address: 'Jl. Raya Bekasi KM 21, Pulogadung, Jakarta Timur',
      latitude: -6.185410,
      longitude: 106.912340,
      radius: 100,
      workDate: getLocalOffsetYmd(-1),
      workType: 'Work Report Pest Control (Treatment Rutin)',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: 'Tikus Got, Tikus Atap, Kecoa, Semut',
      targetFocus: ['Tikus', 'Kecoa', 'Semut'],
      buildingAreaSqm: 4200,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(-1),
      scheduledStartTime: '13:00',
      notes: 'Inspeksi 32 unit rodent bait station perimeter gudang bahan baku.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-2, 11, 0),
      lockedAt: null,
    },

    // ======================= ARSIP LAMPAU (ARCHIVE < Kemarin: offset -5 & -12) =======================
    {
      id: 'proj-bca-serpong-08',
      projectName: 'Kantor Cabang BCA Serpong — Monitoring Stasiun Umpan Rayap',
      clientName: 'PT Bank Central Asia Tbk KCU Serpong',
      address: 'Jl. Raya Serpong KM 7 No. 88, Pakulonan, Tangerang Selatan',
      latitude: -6.245190,
      longitude: 106.651280,
      radius: 100,
      workDate: getLocalOffsetYmd(-5),
      workType: 'Kunjungan Kontrol Berkala Garansi Rayap',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: 'Monitoring 18 Titik Umpan Rayap Tanah',
      targetFocus: ['Rayap Tanah (Coptotermes)', 'Pemasangan / Cek Umpan (Baiting)'],
      buildingAreaSqm: 1600,
      contractType: 'RECURRING',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(-5),
      scheduledStartTime: '09:00',
      notes: 'Kunjungan kontrol berkala triwulan ke-2 garansi anti rayap.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-6, 8, 0),
      lockedAt: getOffsetIso(-5, 11, 15),
    },
    {
      id: 'proj-emerald-bintaro-09',
      projectName: 'Apartemen Emerald Bintaro Tower A — Fogging & Spraying Perimeter',
      clientName: 'Perhimpunan Pemilik & Penghuni Apartemen Emerald Bintaro',
      address: 'Jl. Jombang Raya, Parigi, Pondok Aren, Tangerang Selatan',
      latitude: -6.271890,
      longitude: 106.701420,
      radius: 120,
      workDate: getLocalOffsetYmd(-12),
      workType: 'Fogging & ULV Cold Fogging Nyamuk/Serangga',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: 'Nyamuk Aedes, Lalat, Kecoa Saluran Drainase',
      targetFocus: ['Nyamuk', 'Lalat', 'Kecoa'],
      buildingAreaSqm: 5000,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(-12),
      scheduledStartTime: '08:00',
      notes: 'Thermal fogging saluran drainase luar & cold fogging lobby basement.',
      createdBy: DEMO_ADMIN_ID,
      createdByName: 'H. Fakhrurrazi, S.E. (Admin)',
      createdAt: getOffsetIso(-13, 9, 0),
      lockedAt: getOffsetIso(-12, 10, 45),
    },
  ];
}

export function buildRealisticWorkReports(): WorkReport[] {
  const projs = buildRealisticProjects();
  const byId = Object.fromEntries(projs.map(p => [p.id, p]));

  const sampleCompiledNotes = serializePestFindingsToNotes(
    'Area: Basement & Pondasi (Prioritas), Ruang Arsip & Dokumen, Kusen & Partisi Lt. 2. Metode: Injeksi Termitisida Cair, Pemasangan Stasiun Umpan (Baiting), Spraying Kayu & Plafon. Saran: Perbaiki sirkulasi udara ruang arsip, jauhkan kardus/kayu lembap dari dinding pondasi, dan jadwalkan kontrol garansi 14 hari mendatang.',
    [
      {
        pestName: 'Rayap Tanah (Coptotermes sp.)',
        quantity: 1,
        treatmentMethod: 'Injeksi Termitisida Cair, Pemasangan Stasiun Umpan (Baiting)',
        location: 'Basement & Pondasi, Ruang Arsip & Dokumen',
        notes: '[Keparahan: Sedang | Koloni: ± 50.000 ekor | Sarang Terdeteksi, Jalur Mud Tube]',
      },
      {
        pestName: 'Rayap Kayu Kering (Cryptotermes sp.)',
        quantity: 1,
        treatmentMethod: 'Spraying Kayu & Plafon',
        location: 'Kusen & Partisi Ruang Rapat Lt. 2',
        notes: '[Keparahan: Ringan | Koloni: ± 5.000 ekor]',
      },
    ]
  );

  return [
    // 0. CONTOH LAPORAN LENGKAP (SELESAI PENUH — 6 FOTO, 2 TTD DIGITAL, TEMUAN & REKOMENDASI LENGKAP)
    {
      id: 'wr-contoh-lengkap-00',
      projectId: 'proj-contoh-lengkap-00',
      projectName: byId['proj-contoh-lengkap-00'].projectName,
      clientName: byId['proj-contoh-lengkap-00'].clientName,
      projectAddress: byId['proj-contoh-lengkap-00'].address,
      projectLatitude: -6.292140,
      projectLongitude: 106.811450,
      projectRadius: 100,
      scheduledStartTime: '08:00',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: byId['proj-contoh-lengkap-00'].focusTarget,
      targetFocus: byId['proj-contoh-lengkap-00'].targetFocus,
      buildingAreaSqm: 450,
      contractType: 'ONE_TIME',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(14),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'COMPLETED',
      checkInAt: getOffsetIso(0, 8, 2),
      checkInLatitude: -6.292145,
      checkInLongitude: 106.811456,
      checkInAccuracy: 7.2,
      checkInDistance: 5.4,
      checkInValid: true,
      checkOutAt: getOffsetIso(0, 10, 17),
      checkOutLatitude: -6.292148,
      checkOutLongitude: 106.811454,
      checkOutAccuracy: 6.8,
      checkOutDistance: 6.1,
      checkOutValid: true,
      durationSeconds: 8100,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: {
        applicationMethod: 'DRILLING',
        chemicalName: 'Premise 200 SL',
        activeIngredient: 'Imidakloprid 200 g/l',
        dosage: '2.5 ml / L Air (2.5 L / Titik)',
        treatmentAreaSqm: 450,
        drillingPointsCount: 120,
        fumigantType: null,
        gasConcentrationPpm: null,
        sealingStartedAt: null,
        aerationCompletedAt: null,
        safetyNotes: 'APD lengkap digunakan. Seluruh 120 lubang bor lantai marmer telah ditutup semen nat sewarna.',
        technicianNotes: sampleCompiledNotes,
      },
      reviewedBy: 'H. Fakhrurrazi, S.E. (Admin)',
      reviewedAt: getOffsetIso(0, 10, 30),
      reviewNotes: 'Contoh laporan selesai lengkap sesuai standar operasional PT Guci Emas Pratama.',
      customerName: 'Ibu Nadia Permatasari (Building Manager)',
      customerPhone: '081288994411',
      customerFeedback: '[STRICT_BLIND_PIC_REVIEW] [Rating: 5/5] [Jabatan: Building Manager] [Penilaian: Sopan & Ramah, Tepat Waktu, Pekerjaan Rapi, Penjelasan Jelas] [Catatan PIC: Penanganan sangat rapi, lubang injeksi tertutup mulus dan area arsip kembali bersih.]',
      technicianSignature: makeHandwrittenSignatureSvg('Budi Santoso • Teknisi Utama', 'tech'),
      customerSignature: makeHandwrittenSignatureSvg('Ibu Nadia Permatasari • Building Manager', 'client'),
      notes: 'Pengerjaan lengkap Anti Rayap selesai 100% dengan 6 dokumentasi foto terverifikasi GPS dan pengesahan tanda tangan berpasangan.',
      teamMembers: [
        { id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false },
        { name: 'Rian Setiawan', role: 'Anggota Tim', isManual: false },
      ],
      photos: [
        {
          id: 'ph-contoh-01',
          photoType: 'CHECK_IN',
          photoTag: null,
          latitude: -6.292145,
          longitude: 106.811456,
          accuracy: 7.2,
          distanceToProject: 5.4,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 8, 2),
          metadata: { projectName: 'Gedung Graha Nusantara', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('1. CHECK-IN KEHADIRAN TIM', 'Lobby Utama Gedung Graha Nusantara • APD Lengkap', 'Lat: -6.292145, Lng: 106.811456 • Jarak: 5.4m (VALID <= 100m)'),
        },
        {
          id: 'ph-contoh-02',
          photoType: 'PROGRESS',
          photoTag: 'BEFORE',
          latitude: -6.292146,
          longitude: 106.811455,
          accuracy: 7.5,
          distanceToProject: 5.6,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 8, 18),
          metadata: { projectName: 'Gedung Graha Nusantara', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('2. KONDISI AWAL (BEFORE)', 'Ditemukan Jalur Mud Tube Rayap Tanah di Ruang Arsip', 'Lat: -6.292146, Lng: 106.811455 • Jarak: 5.6m (VALID)', '#B45309'),
        },
        {
          id: 'ph-contoh-03',
          photoType: 'PROGRESS',
          photoTag: null,
          latitude: -6.292147,
          longitude: 106.811454,
          accuracy: 7.1,
          distanceToProject: 5.8,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 8, 52),
          metadata: { projectName: 'Gedung Graha Nusantara', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('3. PROSES INJEKSI PONDASI', 'Pengeboran & Injeksi Premise 200 SL (120 Titik)', 'Lat: -6.292147, Lng: 106.811454 • Jarak: 5.8m (VALID)'),
        },
        {
          id: 'ph-contoh-04',
          photoType: 'PROGRESS',
          photoTag: null,
          latitude: -6.292149,
          longitude: 106.811452,
          accuracy: 7.4,
          distanceToProject: 6.0,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 9, 30),
          metadata: { projectName: 'Gedung Graha Nusantara', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('4. PEMASANGAN BAIT STATION', 'Monitoring & Pemasangan Stasiun Umpan Perimeter', 'Lat: -6.292149, Lng: 106.811452 • Jarak: 6.0m (VALID)'),
        },
        {
          id: 'ph-contoh-05',
          photoType: 'PROGRESS',
          photoTag: 'AFTER',
          latitude: -6.292147,
          longitude: 106.811455,
          accuracy: 6.9,
          distanceToProject: 5.9,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 10, 2),
          metadata: { projectName: 'Gedung Graha Nusantara', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('5. HASIL AKHIR (AFTER)', 'Seluruh Titik Bor Tertutup Semen Nat Rapi & Bersih', 'Lat: -6.292147, Lng: 106.811455 • Jarak: 5.9m (VALID)', '#059669'),
        },
        {
          id: 'ph-contoh-06',
          photoType: 'CHECK_OUT',
          photoTag: null,
          latitude: -6.292148,
          longitude: 106.811454,
          accuracy: 6.8,
          distanceToProject: 6.1,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 10, 17),
          metadata: { projectName: 'Gedung Graha Nusantara', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('6. CHECK-OUT & SERAH TERIMA', 'Verifikasi Akhir Area Kerja bersama PIC Lokasi', 'Lat: -6.292148, Lng: 106.811454 • Jarak: 6.1m (VALID)', '#047857'),
        },
      ],
      createdAt: getOffsetIso(0, 7, 45),
      updatedAt: getOffsetIso(0, 10, 17),
    },

    // 1. HARI INI — WORKING (PT PLN UP3 Bulungan)
    {
      id: 'wr-pln-bulungan-01',
      projectId: 'proj-pln-bulungan-01',
      projectName: byId['proj-pln-bulungan-01'].projectName,
      clientName: byId['proj-pln-bulungan-01'].clientName,
      projectAddress: byId['proj-pln-bulungan-01'].address,
      projectLatitude: -6.241520,
      projectLongitude: 106.797890,
      projectRadius: 120,
      scheduledStartTime: '09:00',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: byId['proj-pln-bulungan-01'].focusTarget,
      targetFocus: byId['proj-pln-bulungan-01'].targetFocus,
      buildingAreaSqm: 1800,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(0),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'WORKING',
      checkInAt: getOffsetIso(0, 8, 55),
      checkInLatitude: -6.241525,
      checkInLongitude: 106.797895,
      checkInAccuracy: 9.4,
      checkInDistance: 6.5,
      checkInValid: true,
      checkOutAt: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      checkOutDistance: null,
      checkOutValid: null,
      durationSeconds: null,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Bagian K3L PLN Bulungan',
      customerPhone: '081122334455',
      customerFeedback: null,
      customerSignature: null,
      notes: 'Check-in Haversine valid (6.5m dari pusat titik proyek). Sedang inspeksi & gel baiting pantry Lt. 2.',
      teamMembers: [
        { id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false },
        { name: 'Rian Setiawan', role: 'Anggota Tim', isManual: false },
      ],
      photos: [
        {
          id: 'ph-pln-cin-01',
          photoType: 'CHECK_IN',
          photoTag: null,
          latitude: -6.241525,
          longitude: 106.797895,
          accuracy: 9.4,
          distanceToProject: 6.5,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 8, 55),
          metadata: { projectName: 'PT PLN (Persero) UP3 Bulungan', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('CHECK-IN LOKASI PLN BULUNGAN', 'Kondisi Lobby & Area Server Lt. 1', 'Lat: -6.241525, Lng: 106.797895 • Jarak Haversine: 6.5m (VALID <= 120m)'),
        },
        {
          id: 'ph-pln-bef-02',
          photoType: 'PROGRESS',
          photoTag: 'BEFORE',
          latitude: -6.241528,
          longitude: 106.797892,
          accuracy: 8.8,
          distanceToProject: 7.1,
          isWithinRadius: true,
          capturedAt: getOffsetIso(0, 9, 15),
          metadata: { projectName: 'PT PLN (Persero) UP3 Bulungan', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('KONDISI AWAL (BEFORE) PANTRY LT. 2', 'Titik Celah Kabinet & Jalur Pipa Pembuangan', 'Lat: -6.241528, Lng: 106.797892 • Jarak Haversine: 7.1m (VALID)'),
        },
      ],
      createdAt: getOffsetIso(0, 8, 0),
      updatedAt: getOffsetIso(0, 9, 15),
    },

    // 2. HARI INI — READY (Bank Mandiri KC Sudirman)
    {
      id: 'wr-mandiri-sudirman-02',
      projectId: 'proj-mandiri-sudirman-02',
      projectName: byId['proj-mandiri-sudirman-02'].projectName,
      clientName: byId['proj-mandiri-sudirman-02'].clientName,
      projectAddress: byId['proj-mandiri-sudirman-02'].address,
      projectLatitude: -6.224510,
      projectLongitude: 106.809630,
      projectRadius: 100,
      scheduledStartTime: '13:30',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: byId['proj-mandiri-sudirman-02'].focusTarget,
      targetFocus: byId['proj-mandiri-sudirman-02'].targetFocus,
      buildingAreaSqm: 1450,
      contractType: 'RECURRING',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(0),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'READY',
      checkInAt: null,
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracy: null,
      checkInDistance: null,
      checkInValid: null,
      checkOutAt: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      checkOutDistance: null,
      checkOutValid: null,
      durationSeconds: null,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Bambang Sukoco (SPV GA)',
      customerPhone: '081289304112',
      customerFeedback: null,
      customerSignature: null,
      notes: 'Siap dikerjakan pukul 13:30 WIB. Bawa Premise 200 SL & 14 refill umpan rayap.',
      teamMembers: [{ id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false }],
      photos: [],
      createdAt: getOffsetIso(0, 7, 30),
      updatedAt: getOffsetIso(0, 7, 30),
    },

    // 3. HARI INI — READY (RS Medika BSD)
    {
      id: 'wr-rs-medika-bsd-03',
      projectId: 'proj-rs-medika-bsd-03',
      projectName: byId['proj-rs-medika-bsd-03'].projectName,
      clientName: byId['proj-rs-medika-bsd-03'].clientName,
      projectAddress: byId['proj-rs-medika-bsd-03'].address,
      projectLatitude: -6.301420,
      projectLongitude: 106.653110,
      projectRadius: 100,
      scheduledStartTime: '15:30',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: byId['proj-rs-medika-bsd-03'].focusTarget,
      targetFocus: byId['proj-rs-medika-bsd-03'].targetFocus,
      buildingAreaSqm: 2200,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(0),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'READY',
      checkInAt: null,
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracy: null,
      checkInDistance: null,
      checkInValid: null,
      checkOutAt: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      checkOutDistance: null,
      checkOutValid: null,
      durationSeconds: null,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Ibu Ratna (Kepala Sanitasi & K3 RS)',
      customerPhone: '081388776655',
      customerFeedback: null,
      customerSignature: null,
      notes: 'Jadwal sore pukul 15:30 WIB setelah jam distribusi makan siang pasien.',
      teamMembers: [{ id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false }],
      photos: [],
      createdAt: getOffsetIso(0, 7, 45),
      updatedAt: getOffsetIso(0, 7, 45),
    },

    // 4. BESOK — READY (PT Oreka Bintaro)
    {
      id: 'wr-oreka-bintaro-04',
      projectId: 'proj-oreka-bintaro-04',
      projectName: byId['proj-oreka-bintaro-04'].projectName,
      clientName: byId['proj-oreka-bintaro-04'].clientName,
      projectAddress: byId['proj-oreka-bintaro-04'].address,
      projectLatitude: -6.269810,
      projectLongitude: 106.764120,
      projectRadius: 100,
      scheduledStartTime: '09:00',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: byId['proj-oreka-bintaro-04'].focusTarget,
      targetFocus: byId['proj-oreka-bintaro-04'].targetFocus,
      buildingAreaSqm: 650,
      contractType: 'ONE_TIME',
      warrantyMonths: 60,
      nextServiceDate: getLocalOffsetYmd(1),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'READY',
      checkInAt: null,
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracy: null,
      checkInDistance: null,
      checkInValid: null,
      checkOutAt: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      checkOutDistance: null,
      checkOutValid: null,
      durationSeconds: null,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Ibu Clarissa (Project Manager)',
      customerPhone: '081234567890',
      customerFeedback: null,
      customerSignature: null,
      notes: 'Jadwal besok pagi pukul 09:00 WIB.',
      teamMembers: [{ id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false }],
      photos: [],
      createdAt: getOffsetIso(0, 10, 0),
      updatedAt: getOffsetIso(0, 10, 0),
    },

    // 5. BESOK — READY (Hotel Santika Premiere Bintaro)
    {
      id: 'wr-santika-bintaro-05',
      projectId: 'proj-santika-bintaro-05',
      projectName: byId['proj-santika-bintaro-05'].projectName,
      clientName: byId['proj-santika-bintaro-05'].clientName,
      projectAddress: byId['proj-santika-bintaro-05'].address,
      projectLatitude: -6.276450,
      projectLongitude: 106.724890,
      projectRadius: 150,
      scheduledStartTime: '14:00',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: byId['proj-santika-bintaro-05'].focusTarget,
      targetFocus: byId['proj-santika-bintaro-05'].targetFocus,
      buildingAreaSqm: 3400,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(1),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'READY',
      checkInAt: null,
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracy: null,
      checkInDistance: null,
      checkInValid: null,
      checkOutAt: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      checkOutDistance: null,
      checkOutValid: null,
      durationSeconds: null,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Bpk. Denny (Chief Steward)',
      customerPhone: '08119876543',
      customerFeedback: null,
      customerSignature: null,
      notes: 'Jadwal besok siang pukul 14:00 WIB.',
      teamMembers: [{ id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false }],
      photos: [],
      createdAt: getOffsetIso(0, 10, 30),
      updatedAt: getOffsetIso(0, 10, 30),
    },

    // 6. KEMARIN — COMPLETED (Bank Victoria Cabang Fatmawati)
    {
      id: 'wr-victoria-fatmawati-06',
      projectId: 'proj-victoria-fatmawati-06',
      projectName: byId['proj-victoria-fatmawati-06'].projectName,
      clientName: byId['proj-victoria-fatmawati-06'].clientName,
      projectAddress: byId['proj-victoria-fatmawati-06'].address,
      projectLatitude: -6.283812,
      projectLongitude: 106.796641,
      projectRadius: 100,
      scheduledStartTime: '08:30',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: byId['proj-victoria-fatmawati-06'].focusTarget,
      targetFocus: byId['proj-victoria-fatmawati-06'].targetFocus,
      buildingAreaSqm: 1332,
      contractType: 'ONE_TIME',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(-1),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'COMPLETED',
      checkInAt: getOffsetIso(-1, 8, 32),
      checkInLatitude: -6.283820,
      checkInLongitude: 106.796650,
      checkInAccuracy: 11.2,
      checkInDistance: 8.2,
      checkInValid: true,
      checkOutAt: getOffsetIso(-1, 10, 35),
      checkOutLatitude: -6.283825,
      checkOutLongitude: 106.796655,
      checkOutAccuracy: 10.5,
      checkOutDistance: 9.1,
      checkOutValid: true,
      durationSeconds: 7380,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: {
        applicationMethod: 'DRILLING',
        chemicalName: 'Cypergard 100 EC',
        activeIngredient: 'Cypermethrin 100 g/l',
        dosage: '2.5 Liter Larutan / Titik Injeksi',
        treatmentAreaSqm: 1332,
        drillingPointsCount: 180,
        fumigantType: null,
        gasConcentrationPpm: null,
        sealingStartedAt: null,
        aerationCompletedAt: null,
        safetyNotes: 'APD lengkap digunakan, area kerja steril.',
        technicianNotes: '[Tim Bertugas: Budi Santoso, Agus Setiawan] [Area: Basement & Parkiran, Ruang Arsip Lt. 1] Seluruh titik pondasi 1 sisi & 2 sisi telah diinjeksi. Rekomendasi: Sirkulasi Udara',
      },
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Bpk. Hendra Kusuma',
      customerPhone: '08119988776',
      customerFeedback: '[STRICT_BLIND_PIC_REVIEW] [Rating: 5/5] [Jabatan: Kepala Cabang] [Penilaian: Sopan & Ramah, Tepat Waktu, Pekerjaan Rapi] [Catatan PIC: Tim sangat profesional dan rapi dalam menutup kembali titik bor lantai marmer.]',
      customerSignature: makeEvidenceSvgDataUrl('TANDA TANGAN SAH PIC KLIEN', 'Bpk. Hendra Kusuma • Kepala Cabang Bank Victoria', 'Disahkan Digital • Evaluasi PIC Terenkripsi ke Manajemen'),
      notes: 'Pengeboran & injeksi termitisida Cypergard 100 EC pada jalur pondasi dan partisi selesai dilaksanakan.',
      teamMembers: [
        { id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false },
        { name: 'Agus Setiawan', role: 'Anggota Tim', isManual: true },
      ],
      photos: [
        {
          id: 'ph-vic-01',
          photoType: 'CHECK_IN',
          photoTag: null,
          latitude: -6.283820,
          longitude: 106.796650,
          accuracy: 11.2,
          distanceToProject: 8.2,
          isWithinRadius: true,
          capturedAt: getOffsetIso(-1, 8, 32),
          metadata: { projectName: 'Bank Victoria Cabang Fatmawati', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('CHECK-IN BANK VICTORIA FATMAWATI', 'Validasi Kehadiran Tim Anti Rayap', 'Lat: -6.283820, Lng: 106.796650 • Jarak Haversine: 8.2m (VALID <= 100m)'),
        },
        {
          id: 'ph-vic-02',
          photoType: 'PROGRESS',
          photoTag: 'BEFORE',
          latitude: -6.283822,
          longitude: 106.796652,
          accuracy: 10.8,
          distanceToProject: 8.5,
          isWithinRadius: true,
          capturedAt: getOffsetIso(-1, 9, 10),
          metadata: { projectName: 'Bank Victoria Cabang Fatmawati', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('KONDISI AWAL JALUR KUSEN RUANG ARSIP', 'Ditemukan Jalur Kembara Rayap Tanah', 'Lat: -6.283822, Lng: 106.796652 • Jarak Haversine: 8.5m (VALID)'),
        },
        {
          id: 'ph-vic-03',
          photoType: 'PROGRESS',
          photoTag: 'AFTER',
          latitude: -6.283825,
          longitude: 106.796655,
          accuracy: 10.5,
          distanceToProject: 9.1,
          isWithinRadius: true,
          capturedAt: getOffsetIso(-1, 10, 20),
          metadata: { projectName: 'Bank Victoria Cabang Fatmawati', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('HASIL INJEKSI CHEMICAL BARRIER', '180 Titik Bor Pondasi Telah Diinjeksi & Ditutup Rapi', 'Lat: -6.283825, Lng: 106.796655 • Jarak Haversine: 9.1m (VALID)'),
        },
      ],
      createdAt: getOffsetIso(-1, 8, 0),
      updatedAt: getOffsetIso(-1, 10, 35),
    },

    // 7. KEMARIN — FLAGGED (PT Indofood CBP Pulogadung — Luar Radius Haversine 142m + Kendala Lapangan)
    {
      id: 'wr-indofood-pulogadung-07',
      projectId: 'proj-indofood-pulogadung-07',
      projectName: byId['proj-indofood-pulogadung-07'].projectName,
      clientName: byId['proj-indofood-pulogadung-07'].clientName,
      projectAddress: byId['proj-indofood-pulogadung-07'].address,
      projectLatitude: -6.185410,
      projectLongitude: 106.912340,
      projectRadius: 100,
      scheduledStartTime: '13:00',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: byId['proj-indofood-pulogadung-07'].focusTarget,
      targetFocus: byId['proj-indofood-pulogadung-07'].targetFocus,
      buildingAreaSqm: 4200,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(-1),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'FLAGGED',
      checkInAt: getOffsetIso(-1, 13, 12),
      checkInLatitude: -6.186680,
      checkInLongitude: 106.912510,
      checkInAccuracy: 18.0,
      checkInDistance: 142.0,
      checkInValid: false,
      checkOutAt: getOffsetIso(-1, 15, 10),
      checkOutLatitude: -6.185480,
      checkOutLongitude: 106.912390,
      checkOutAccuracy: 12.0,
      checkOutDistance: 11.2,
      checkOutValid: true,
      durationSeconds: 7080,
      riskScore: 55,
      riskLevel: 'REVIEW',
      riskEvents: [
        {
          id: 're-indofood-01',
          eventType: 'OUTSIDE_RADIUS_CHECKIN',
          points: 30,
          severity: 'MEDIUM',
          title: 'Check-In di Luar Radius Geofence Haversine',
          description: 'Jarak Check-In tercatat 142m (melebihi batas radius 100m karena antrean gerbang kargo luar).',
          expectedValue: '<= 100m',
          actualValue: '142m',
          createdAt: getOffsetIso(-1, 13, 12),
        },
        {
          id: 're-indofood-02',
          eventType: 'FIELD_ISSUE',
          points: 25,
          severity: 'HIGH',
          title: 'Kendala Lapangan: Akses Ruangan Terkunci',
          description: 'Gudang Sektor B sedang disegel audit stok internal sehingga 4 titik bait station belum dapat diakses.',
          expectedValue: '32 Titik Terinspeksi',
          actualValue: '28 Titik Terinspeksi',
          createdAt: getOffsetIso(-1, 14, 0),
        },
      ],
      treatmentRecord: {
        applicationMethod: 'BAITING',
        chemicalName: 'Klerat 0.005 BB & Demand CS',
        activeIngredient: 'Brodifakum 0.005% & Lambda Cyhalothrin',
        dosage: '2 Blok Umpan / Station + 10 ml/L Spraying',
        treatmentAreaSqm: 3800,
        drillingPointsCount: null,
        fumigantType: null,
        gasConcentrationPpm: null,
        sealingStartedAt: null,
        aerationCompletedAt: null,
        safetyNotes: 'Bait station terkunci rapat dengan kunci pengaman khusus.',
        technicianNotes: '[Tim Bertugas: Budi Santoso] [Area: Perimeter Luar Gedung, Basement & Parkiran] 28 dari 32 bait station telah diganti umpan baru. 4 titik di Sektor B terkunci audit.',
      },
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      customerName: 'Bpk. Anton Wijaya (SPV Warehouse)',
      customerPhone: '081299001122',
      customerFeedback: '[STRICT_BLIND_PIC_REVIEW] [Rating: 4/5] [Jabatan: SPV Warehouse] [Penilaian: Sopan & Ramah, Penjelasan Jelas] [Catatan PIC: Pekerjaan baik, 4 titik Sektor B dijadwalkan susulan minggu depan.]',
      customerSignature: makeEvidenceSvgDataUrl('TANDA TANGAN SAH PIC KLIEN', 'Bpk. Anton Wijaya • SPV Warehouse Indofood CBP', 'Disahkan Digital • Evaluasi PIC Terenkripsi ke Manajemen'),
      notes: '[KENDALA LAPANGAN: Akses Ruangan Terkunci — Gudang Sektor B disegel audit internal]',
      teamMembers: [{ id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false }],
      photos: [
        {
          id: 'ph-indo-01',
          photoType: 'CHECK_IN',
          photoTag: null,
          latitude: -6.186680,
          longitude: 106.912510,
          accuracy: 18.0,
          distanceToProject: 142.0,
          isWithinRadius: false,
          capturedAt: getOffsetIso(-1, 13, 12),
          metadata: { projectName: 'PT Indofood CBP Pulogadung', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('CHECK-IN POS GERBANG KARGO LUAR', 'Terhadap Titik Pusat Gudang (142m > 100m)', 'Lat: -6.186680, Lng: 106.912510 • Jarak Haversine: 142.0m (OUTSIDE RADIUS)', '#B54141'),
        },
        {
          id: 'ph-indo-02',
          photoType: 'PROGRESS',
          photoTag: 'AFTER',
          latitude: -6.185480,
          longitude: 106.912390,
          accuracy: 12.0,
          distanceToProject: 11.2,
          isWithinRadius: true,
          capturedAt: getOffsetIso(-1, 14, 50),
          metadata: { projectName: 'PT Indofood CBP Pulogadung', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('PENGGANTIAN UMPAN RODENT BAIT STATION', '28 Station Perimeter Gudang Selesai Dirawat', 'Lat: -6.185480, Lng: 106.912390 • Jarak Haversine: 11.2m (VALID)'),
        },
      ],
      createdAt: getOffsetIso(-1, 12, 30),
      updatedAt: getOffsetIso(-1, 15, 10),
    },

    // 8. ARSIP (-5 Hari) — REVIEWED (Kantor Cabang BCA Serpong)
    {
      id: 'wr-bca-serpong-08',
      projectId: 'proj-bca-serpong-08',
      projectName: byId['proj-bca-serpong-08'].projectName,
      clientName: byId['proj-bca-serpong-08'].clientName,
      projectAddress: byId['proj-bca-serpong-08'].address,
      projectLatitude: -6.245190,
      projectLongitude: 106.651280,
      projectRadius: 100,
      scheduledStartTime: '09:00',
      serviceType: 'TERMITE_CONTROL',
      focusTarget: byId['proj-bca-serpong-08'].focusTarget,
      targetFocus: byId['proj-bca-serpong-08'].targetFocus,
      buildingAreaSqm: 1600,
      contractType: 'RECURRING',
      warrantyMonths: 36,
      nextServiceDate: getLocalOffsetYmd(-5),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'REVIEWED',
      checkInAt: getOffsetIso(-5, 8, 58),
      checkInLatitude: -6.245240,
      checkInLongitude: 106.651340,
      checkInAccuracy: 8.5,
      checkInDistance: 11.4,
      checkInValid: true,
      checkOutAt: getOffsetIso(-5, 11, 10),
      checkOutLatitude: -6.245230,
      checkOutLongitude: 106.651330,
      checkOutAccuracy: 9.0,
      checkOutDistance: 10.2,
      checkOutValid: true,
      durationSeconds: 7920,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: {
        applicationMethod: 'BAITING',
        chemicalName: 'Premise 200 SL & Umpan Selulosa',
        activeIngredient: 'Imidakloprid 200 g/l',
        dosage: '18 Unit Stasiun Umpan',
        treatmentAreaSqm: 1600,
        drillingPointsCount: 18,
        fumigantType: null,
        gasConcentrationPpm: null,
        sealingStartedAt: null,
        aerationCompletedAt: null,
        safetyNotes: 'Seluruh tutup stasiun umpan terkunci aman.',
        technicianNotes: '[Tim Bertugas: Budi Santoso] [Area: Perimeter Luar Gedung, Ruang Arsip Lt. 1] 18 titik bait station diperiksa, tidak ditemukan re-infestasi rayap aktif.',
      },
      reviewedBy: 'H. Fakhrurrazi, S.E. (Admin)',
      reviewedAt: getOffsetIso(-5, 14, 0),
      reviewNotes: 'Laporan lengkap, koordinat Haversine akurat (11.4m), telah diverifikasi Admin.',
      customerName: 'Ibu Fransiska (Kabag Layanan & Gedung)',
      customerPhone: '081677889900',
      customerFeedback: '[STRICT_BLIND_PIC_REVIEW] [Rating: 5/5] [Jabatan: Kabag Gedung] [Penilaian: Tepat Waktu, Pekerjaan Rapi, Penjelasan Jelas]',
      customerSignature: makeEvidenceSvgDataUrl('TANDA TANGAN SAH PIC KLIEN', 'Ibu Fransiska • BCA KCU Serpong', 'Disahkan Digital • Terverifikasi Admin'),
      notes: 'Monitoring garansi triwulan berjalan lancar.',
      teamMembers: [{ id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false }],
      photos: [
        {
          id: 'ph-bca-01',
          photoType: 'CHECK_IN',
          photoTag: null,
          latitude: -6.245240,
          longitude: 106.651340,
          accuracy: 8.5,
          distanceToProject: 11.4,
          isWithinRadius: true,
          capturedAt: getOffsetIso(-5, 8, 58),
          metadata: { projectName: 'Kantor Cabang BCA Serpong', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('CHECK-IN BCA KCU SERPONG', 'Inspeksi Stasiun Umpan Rayap', 'Lat: -6.245240, Lng: 106.651340 • Jarak Haversine: 11.4m (VALID)'),
        },
      ],
      createdAt: getOffsetIso(-5, 8, 30),
      updatedAt: getOffsetIso(-5, 14, 0),
    },

    // 9. ARSIP (-12 Hari) — REVIEWED (Apartemen Emerald Bintaro)
    {
      id: 'wr-emerald-bintaro-09',
      projectId: 'proj-emerald-bintaro-09',
      projectName: byId['proj-emerald-bintaro-09'].projectName,
      clientName: byId['proj-emerald-bintaro-09'].clientName,
      projectAddress: byId['proj-emerald-bintaro-09'].address,
      projectLatitude: -6.271890,
      projectLongitude: 106.701420,
      projectRadius: 120,
      scheduledStartTime: '08:00',
      serviceType: 'GENERAL_PEST_CONTROL',
      focusTarget: byId['proj-emerald-bintaro-09'].focusTarget,
      targetFocus: byId['proj-emerald-bintaro-09'].targetFocus,
      buildingAreaSqm: 5000,
      contractType: 'RECURRING',
      warrantyMonths: 12,
      nextServiceDate: getLocalOffsetYmd(-12),
      executorId: DEMO_TEKNISI_ID,
      executorName: 'Budi Santoso',
      executorEmail: 'teknisi@gucimaspratama.co.id',
      status: 'REVIEWED',
      checkInAt: getOffsetIso(-12, 7, 55),
      checkInLatitude: -6.271980,
      checkInLongitude: 106.701510,
      checkInAccuracy: 10.0,
      checkInDistance: 14.8,
      checkInValid: true,
      checkOutAt: getOffsetIso(-12, 10, 30),
      checkOutLatitude: -6.271960,
      checkOutLongitude: 106.701490,
      checkOutAccuracy: 9.5,
      checkOutDistance: 12.6,
      checkOutValid: true,
      durationSeconds: 9300,
      riskScore: 0,
      riskLevel: 'NORMAL',
      riskEvents: [],
      treatmentRecord: {
        applicationMethod: 'FOGGING',
        chemicalName: 'Cypergard 100 EC & Solar/Water Carrier',
        activeIngredient: 'Cypermethrin 100 g/l',
        dosage: '15 ml / Liter',
        treatmentAreaSqm: 5000,
        drillingPointsCount: null,
        fumigantType: null,
        gasConcentrationPpm: null,
        sealingStartedAt: null,
        aerationCompletedAt: null,
        safetyNotes: 'Penghuni telah diinformasikan H-1 sebelum pengasapan drainase.',
        technicianNotes: '[Tim Bertugas: Budi Santoso, Rian Setiawan] [Area: Perimeter Luar Gedung, Basement & Parkiran] Pengasapan drainase dan cold fogging area parkir B1 selesai.',
      },
      reviewedBy: 'H. Fakhrurrazi, S.E. (Admin)',
      reviewedAt: getOffsetIso(-12, 13, 20),
      reviewNotes: 'Telah diverifikasi Admin, dokumentasi dan jarak Haversine sesuai SOP.',
      customerName: 'Bpk. Kurniawan (Building Manager)',
      customerPhone: '081188223344',
      customerFeedback: '[STRICT_BLIND_PIC_REVIEW] [Rating: 5/5] [Jabatan: Building Manager] [Penilaian: Sopan & Ramah, Tepat Waktu, Pekerjaan Rapi]',
      customerSignature: makeEvidenceSvgDataUrl('TANDA TANGAN SAH PIC KLIEN', 'Bpk. Kurniawan • BM Apartemen Emerald Bintaro', 'Disahkan Digital • Terverifikasi Admin'),
      notes: 'Treatment rutin bulanan berjalan sesuai jadwal.',
      teamMembers: [
        { id: DEMO_TEKNISI_ID, name: 'Budi Santoso', role: 'Ketua Tim', isManual: false },
        { name: 'Rian Setiawan', role: 'Anggota Tim', isManual: false },
      ],
      photos: [
        {
          id: 'ph-emr-01',
          photoType: 'CHECK_IN',
          photoTag: null,
          latitude: -6.271980,
          longitude: 106.701510,
          accuracy: 10.0,
          distanceToProject: 14.8,
          isWithinRadius: true,
          capturedAt: getOffsetIso(-12, 7, 55),
          metadata: { projectName: 'Apartemen Emerald Bintaro', executorName: 'Budi Santoso' },
          purgedAt: null,
          url: makeEvidenceSvgDataUrl('CHECK-IN APARTEMEN EMERALD BINTARO', 'Persiapan Thermal Fogging Perimeter', 'Lat: -6.271980, Lng: 106.701510 • Jarak Haversine: 14.8m (VALID)'),
        },
      ],
      createdAt: getOffsetIso(-12, 7, 30),
      updatedAt: getOffsetIso(-12, 13, 20),
    },
  ];
}

export function buildRealisticUserLocations(): UserLocation[] {
  return [
    {
      userId: DEMO_TEKNISI_ID,
      userName: 'Budi Santoso (Teknisi Lapangan)',
      latitude: -6.241525,
      longitude: 106.797895,
      accuracy: 9.4,
      trackedAt: getOffsetIso(0, 9, 25),
    },
    {
      userId: '44444444-4444-4444-8444-444444444444',
      userName: 'Rian Setiawan (Teknisi Lapangan)',
      latitude: -6.224515,
      longitude: 106.809635,
      accuracy: 11.0,
      trackedAt: getOffsetIso(0, 9, 10),
    },
  ];
}

const PROJECTS_STORAGE_KEY = 'fw_realistic_projects_v4';
const REPORTS_STORAGE_KEY = 'fw_realistic_reports_v4';

export function getLocalRealisticProjects(): Project[] {
  try {
    const raw = sessionStorage.getItem(PROJECTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  const initial = buildRealisticProjects();
  try {
    sessionStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(initial));
  } catch {
    // ignore
  }
  return initial;
}

export function saveLocalRealisticProjects(list: Project[]): void {
  try {
    sessionStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function getLocalRealisticReports(): WorkReport[] {
  try {
    const raw = sessionStorage.getItem(REPORTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  const initial = buildRealisticWorkReports();
  try {
    sessionStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(initial));
  } catch {
    // ignore
  }
  return initial;
}

export function saveLocalRealisticReports(list: WorkReport[]): void {
  try {
    sessionStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/**
 * Menggabungkan data dari database Supabase dengan dataset realistis apabila database
 * baru memiliki < 4 baris (sehingga tab Hari Ini, Besok, Kemarin, dan Arsip selalu hidup dan realistis).
 */
export function mergeWithRealisticProjects(dbProjects: Project[]): Project[] {
  const local = getLocalRealisticProjects();
  if (dbProjects.length >= 5) return dbProjects;
  const dbIds = new Set(dbProjects.map(p => p.id));
  const merged = [...dbProjects, ...local.filter(p => !dbIds.has(p.id))];
  return merged;
}

export function mergeWithRealisticReports(dbReports: WorkReport[]): WorkReport[] {
  const local = getLocalRealisticReports();
  if (dbReports.length >= 5) return dbReports;
  const dbIds = new Set(dbReports.map(r => r.id));
  const merged = [...dbReports, ...local.filter(r => !dbIds.has(r.id))];
  return merged;
}


export interface FieldIssueEntry {
  id: string;
  projectName: string;
  address: string;
  executorName: string;
  issueType: string;
  note: string;
  reportId: string;
  createdAt: string;
}

export function getRealisticFieldIssues(): FieldIssueEntry[] {
  const reports = getLocalRealisticReports();
  const flagged = reports.filter(r => r.status === "FLAGGED" || (r.riskEvents && r.riskEvents.length > 0));
  const fromReports: FieldIssueEntry[] = flagged.map(r => ({
    id: `iss-${r.id}`,
    projectName: r.projectName,
    address: r.projectAddress,
    executorName: r.executorName,
    issueType: r.riskEvents?.[0]?.eventType === "OUTSIDE_RADIUS_CHECKIN"
      ? "Check-In Luar Radius Haversine (142m)"
      : "Kendala Lapangan & Verifikasi GPS",
    note: r.notes || "Check-in di gerbang kargo luar (142m dari titik pusat gudang).",
    reportId: r.id,
    createdAt: r.createdAt,
  }));
  try {
    const raw = localStorage.getItem("fw_field_issues_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...parsed, ...fromReports];
      }
    }
  } catch {
    // ignore
  }
  return fromReports;
}
