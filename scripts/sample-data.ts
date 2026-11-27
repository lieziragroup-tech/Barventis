/**
 * Data contoh yang diambil dari surat penawaran asli PT Guci Emas Pratama (PDF) —
 * dipakai untuk regresi visual generator PDF (mencakup 5 PDF baru yang dilampirkan pengguna + custom garansi bulan/tahun).
 * Jalankan: npm run pdf:samples  → hasil di ./out/pdf-samples
 */
import type { QuotationPDFData } from '../src/shared/lib/pdfGenerator';
import { programPest, programRodentKontrak } from '../src/shared/lib/quotationTemplates';
import { generateDefaultFoggingSchedule } from '../src/shared/lib/warrantyPricingEngine';

const CO = 'PT Guci Emas Pratama';

const METODE_BARRIER = [
  'Melakukan pengeboran disetiap sisi pondasi luar dan dalam bangunan dengan jarak 10-15 cm dari dinding bangunan. Jarak antar lubang bor sebesar 30-40 cm dengan kedalaman lubang 30-40 cm.',
  'Melakukan Injeksi larutan termitisida pada lubang bor sebanyak 2,5 Liter – 3 Liter.',
  'Menutup lubang bor dengan bahan yang warnanya sama dengan warna lantai.',
  'Pengeboran dan penginjeksian larutan pestisida pada sisi-sisi kusen pintu dan jendela dengan kedalaman sampai menembus dinding tembok dibalik kusen dan menutup kembali lubang bekas bor dengan bahan yang warnanya disesuaikan dengan warna kayu/kusen.',
  'Melakukan penyemprotan larutan termitisida pada seluruh plafon dan partisi.',
  'Membersihkan bekas pekerjaan anti rayap.',
];

export const SAMPLES: Record<string, QuotationPDFData> = {
  // 1. Contoh PDF 0005: PT Oreka Solusi Kreatif — Pra Konstruksi & Pipa (8 Halaman Lengkap + Garansi 5 Tahun)
  '0005_Oreka_PraKonstruksi_Pipa_8Hal': {
    noSurat: 'GP/AR/PH/2026/01/0005',
    pdfVariant: 'ar_pra_profile_8p',
    tanggal: new Date('2026-01-05T00:00:00+07:00'),
    kepadaNama: 'PT Oreka Solusi Kreatif',
    kepadaAlamatLines: [
      '18 Office Park Lt. 10 Unit A, Jl. TB Simatupang No. 18',
      'Kebagusan, Pasar Minggu - Jakarta Selatan',
    ],
    kepadaUp: 'Bapak Chairi',
    jenisLayanan: 'anti_rayap_soil',
    perihal: 'Penawaran Harga Anti Rayap',
    objekPekerjaan: 'bangunan rumah tinggal pra konstruksi',
    lokasiPekerjaan: 'Jl. RC. Veteran Raya No. 9, RT.001 / RW.003, Bintaro, Kec. Pesanggrahan, Jakarta Selatan',
    surveyor: 'Bagas',
    tanggalSurvey: new Date('2026-01-05T00:00:00+07:00'),
    items: [
      { desc: 'Luas Permukaan', qty: 220, unit: 'm²', harga: 30000 },
      { desc: 'Pemipaan', qty: 232.5, unit: 'm¹', harga: 35000 },
    ],
    ppn: false,
    garansiNilai: 5,
    garansiUnit: 'tahun',
    garansiTahun: 5,
    tampilkanPengontrolan: true,
    chemicals: [{ bahanAktif: 'Cypermethrin', merkDagang: 'Cypergard 100 EC' }],
    marketingNama: 'Bagas',
    marketingWa: '0878-8400-2700',
  },

  // 2. Contoh PDF 0022: Bank Victoria Cabang Fatmawati — Retreatment + Tabel Rumus Volume + Upah 25% & Diskon Upah 15%
  '0022_BankVictoria_Retreatment_RumusVolume': {
    noSurat: 'GP/AR/PH/2026/01/0022',
    pdfVariant: 'ar_pasca_standar_4p',
    isRevisi: true,
    tanggal: new Date('2026-01-12T00:00:00+07:00'),
    kepadaNama: 'Bank Victoria',
    kepadaAlamatLines: [
      'Graha BIP Lantai Lt. 10,',
      'Jl. Gatot Subroto Kav 23,',
      'Jakarta Selatan',
    ],
    kepadaUp: 'Ibu Hetin',
    jenisLayanan: 'anti_rayap_injeksi',
    perihal: 'Revisi Penawaran Harga Anti Rayap Ulang (Retreatment)',
    objekPekerjaan: 'Bank Victoria Cabang Fatmawati',
    lokasiPekerjaan: 'Jl. RS. Fatmawati Raya No.85A, RT.8/RW.5, Cipete Utara, Kec. Kebayoran Baru, Jakarta Selatan, 12140',
    surveyor: 'Jono',
    tanggalSurvey: new Date('2025-11-24T00:00:00+07:00'),
    hasilSurvey: 'Kami menemukan bekas serangan rayap pada kusen dan plafon kamar mandi lantai 1.',
    items: [
      { desc: 'Pondasi 1 sisi', volumeFormula: '37+37+5,5+9+6+5', qty: 99.5, unit: 'm¹', harga: 19000 },
      { desc: 'Pondasi 2 sisi', volumeFormula: '1,5+1,5+2,5+3,5+9+3+3+3+3,5+4', qty: 34.5, unit: 'm¹', harga: 38000 },
      { desc: 'Plafon Lt 1 s.d. 4', volumeFormula: '37 x 9 x 4', qty: 1332, unit: 'm²', harga: 9100 },
      { desc: 'Partisi', volumeFormula: '(7+7+5+3+13+6+3+3+30+5+5+5+5+2+4+4+37+5+5+5+3+3+22+22) x 3', qty: 627, unit: 'm²', harga: 13000 },
    ],
    upahPeralatanPct: 25,
    diskonUpahPct: 15,
    ppn: true,
    garansiNilai: 3,
    garansiUnit: 'tahun',
    garansiTahun: 3,
    tampilkanPengontrolan: true,
    chemicals: [
      { bahanAktif: 'Cypermethrin', merkDagang: 'Cypergard 100 EC' },
      { bahanAktif: 'Imidakloprid', merkDagang: 'Safe 1 200 SL' },
    ],
    metode: METODE_BARRIER,
  },

  // 3. Contoh PDF 0009: Proposal Rodent Control UPTD Puskesmas Pisangan (Program Kerja A-E + Tabel Biaya Oranye)
  '0009_PuskesmasPisangan_RodentProposal': {
    noSurat: 'GP/PCO/PH/2026/01/0009',
    pdfVariant: 'pco_rodent_survey_4p',
    tanggal: new Date('2026-01-06T00:00:00+07:00'),
    kepadaNama: 'UPTD PUSKESMAS PISANGAN',
    kepadaAlamatLines: [
      'Jl. Hijau Lestari VII, Pisangan, Kec. Ciputat Timur',
      'Tangerang Selatan',
    ],
    jenisLayanan: 'pest_rodent',
    perihal: 'Penawaran Harga Jasa Pengendalian Hama',
    objekPekerjaan: 'UPTD Puskesmas Pisangan',
    lokasiPekerjaan: 'Jl. Hijau Lestari VII, Pisangan, Kec. Ciputat Timur, Tangerang Selatan',
    surveyor: 'Jono',
    tanggalSurvey: new Date('2025-12-29T00:00:00+07:00'),
    hasilSurvey: 'Kami menemukan indikasi kendala tikus.',
    kunjunganPerBulan: 3,
    items: [
      { desc: 'Tikus (Ekslusi, Trapping, Baiting)', qty: 3, unit: 'Kunjungan', harga: 750000 },
    ],
    ppn: false,
  },

  // 4. Contoh PDF 0003: Penawaran Pest Control PLN UP3 Bulungan (Total di Cover + DPP Nilai Lain 11/12 + PPN 12%)
  '0003_PLNBulungan_PestRodent_DPP': {
    noSurat: 'GP/PCO/PH/2026/01/0003',
    pdfVariant: 'pco_korporat_boq_3p',
    tanggal: new Date('2026-01-05T00:00:00+07:00'),
    kepadaNama: 'PT PLN (Persero) UP3 Bulungan',
    kepadaAlamatLines: [
      'Jl. Sisingamangaraja No.1, Kebayoran Baru',
      'Jakarta Selatan',
    ],
    jenisLayanan: 'pest_umum',
    perihal: 'Penawaran Pest Control',
    objekPekerjaan: 'PT PLN (Persero) UP3 Bulungan',
    lokasiPekerjaan: 'Jl. Sisingamangaraja No.1, Kebayoran Baru, Jakarta Selatan',
    programs: [programPest(CO), programRodentKontrak(CO)],
    items: [
      { desc: 'Pest Control', qty: 3, unit: 'Kali', harga: 4900000 },
      { desc: 'Rodent Control (8x kunjungan)', qty: 1, unit: 'Lot', harga: 4500000 },
    ],
    ppn: true,
    ppnDppFaktor: 11 / 12,
    marketingNama: 'G. Harianto',
  },

  // 5. Contoh PDF 0015: Surat Jadwal Kerja Pest Control (Fogging) Ibu Dita 12 Bulan (1 Halaman)
  '0015_IbuDita_JadwalFogging12Bulan': {
    noSurat: 'GP/PCO/PH/2026/01/0015',
    pdfVariant: 'pco_jadwal_fogging_1p',
    tipeSurat: 'jadwal_fogging',
    tanggal: new Date('2026-01-07T00:00:00+07:00'),
    kepadaNama: 'Ibu Dita',
    kepadaAlamatLines: [
      'Jl. Dharmawangsa Raya No. 25,',
      'Jakarta Selatan',
    ],
    jenisLayanan: 'pest_fogging',
    perihal: 'Jadwal Kerja Pest Control (Fogging) Periode Januari 2026 – Desember 2026',
    objekPekerjaan: 'rumah tinggal',
    lokasiPekerjaan: 'Jl. Dharmawangsa Raya No. 25, Jakarta Selatan',
    jadwalFoggingTahun: 2026,
    jadwalFoggingRows: generateDefaultFoggingSchedule(2026),
    items: [
      { desc: 'Pest Control (Fogging)', qty: 1, unit: 'Periode', harga: 550000 },
    ],
    ppn: false,
    marketingNama: 'Kemal Ashiddiq',
  },

  // 6. Contoh Custom Garansi dalam Bulan (mis. 6 Bulan) & Tahun (mis. 2 Tahun) hasil Negosiasi Admin
  '0099_Contoh_Custom_Garansi_6_Bulan': {
    noSurat: 'GP-DRF/AR/PH/2026/10/0099',
    pdfVariant: 'ar_pasca_standar_4p',
    tanggal: new Date('2026-10-21T00:00:00+07:00'),
    kepadaNama: 'PT Mitra Properti Nusantara',
    kepadaAlamatLines: ['Jl. Sudirman Kav. 52, Jakarta Selatan'],
    jenisLayanan: 'anti_rayap_injeksi',
    perihal: 'Penawaran Harga Anti Rayap',
    objekPekerjaan: 'Gedung Operasional',
    surveyor: 'Bagas',
    tanggalSurvey: new Date('2026-10-20T00:00:00+07:00'),
    items: [
      { desc: 'Pondasi 1 sisi', volumeFormula: '20+20+15+15', qty: 70, unit: 'm¹', harga: 14000 },
    ],
    ppn: false,
    garansiNilai: 6,
    garansiUnit: 'bulan',
    garansiTahun: 0.5,
    tampilkanPengontrolan: true,
    metode: METODE_BARRIER,
  },
};
