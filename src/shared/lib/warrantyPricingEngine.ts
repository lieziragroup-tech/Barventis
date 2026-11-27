/**
 * Engine Otomasi Satuan & Harga Berbasis Garansi (Bulan & Tahun) — PT Guci Emas Pratama
 *
 * Fitur:
 *  1. Katalog Preset Pekerjaan (AR & PCO) dengan Satuan Otomatis (m², m¹, Titik, Kali, Lot, Kunjungan, Periode)
 *     sehingga Surveyor cukup memilih jenis pekerjaan dan mengisi volume/rumus volume.
 *  2. Dukungan Garansi Fleksibel:
 *     - Preset Cepat (Tanpa Garansi, 6 Bulan, 1 Tahun, 2 Tahun, 3 Tahun, 5 Tahun)
 *     - Input Custom dalam BULAN (mis. 3 Bulan, 6 Bulan, 9 Bulan, 18 Bulan) maupun TAHUN (mis. 2 Tahun, 4 Tahun)
 *  3. Perhitungan Harga Satuan Otomatis berdasarkan durasi garansi (dengan interpolasi halus ke kelipatan Rp 500
 *     untuk durasi custom dalam bulan/tahun), memudahkan negosiasi saat customer minta turun harga/garansi.
 *  4. Generator Klausa Garansi Resmi (SNI 03-2404-2000) dengan teks terbilang otomatis dalam bulan maupun tahun.
 */

import type { JenisLayanan, KategoriSurat } from '@/entities/types';
import { terbilang } from './terbilang';

export type GaransiUnit = 'tahun' | 'bulan';

export interface GaransiSpec {
    nilai: number;          // 0 = tanpa garansi; mis. 3 (tahun) atau 6 (bulan)
    unit: GaransiUnit;      // 'tahun' | 'bulan'
    isCustom?: boolean;
}

export interface PresetWorkItem {
    code: string;
    kategori: KategoriSurat;
    layanan: JenisLayanan[];
    label: string;          // Teks deskripsi yang masuk ke kolom Pekerjaan/Uraian di PDF
    unit: string;           // Satuan otomatis: "m²", "m¹", "Titik", "Kali", "Lot", "Kunjungan", "Periode"
    /**
     * Harga referensi berdasarkan durasi garansi dalam BULAN:
     *   0  = Tanpa Garansi
     *   6  = 6 Bulan
     *   12 = 1 Tahun
     *   24 = 2 Tahun
     *   36 = 3 Tahun (Standar Pasca-Konstruksi)
     *   60 = 5 Tahun (Standar Pra-Konstruksi)
     */
    priceByWarrantyMonths: Record<number, number>;
    hint?: string;
}

/**
 * Katalog Preset Pekerjaan PT Guci Emas Pratama (diambil langsung dari 5 PDF contoh resmi).
 */
export const PRESET_WORK_ITEMS: PresetWorkItem[] = [
    // ── ANTI RAYAP: PRA-KONSTRUKSI & PEMIPAAN (Contoh PDF 0005 - Oreka & 0247 - KSP) ──
    {
        code: 'ar_luas_permukaan_soil',
        kategori: 'AR',
        layanan: ['anti_rayap_soil', 'anti_rayap_injeksi', 'anti_rayap_pipanisasi'],
        label: 'Luas Permukaan',
        unit: 'm²',
        priceByWarrantyMonths: {
            0: 18000,
            6: 20000,
            12: 22000,
            24: 26000,
            36: 30000,
            60: 30000, // Sesuai PDF 0005 Oreka: Luas Permukaan 220 m² @ Rp 30.000 (Garansi 5 Thn)
        },
        hint: 'Soil treatment / penyemprotan permukaan tanah atau bangunan (m²)',
    },
    {
        code: 'ar_pemipaan_instalasi',
        kategori: 'AR',
        layanan: ['anti_rayap_pipanisasi', 'anti_rayap_soil'],
        label: 'Pemipaan',
        unit: 'm¹',
        priceByWarrantyMonths: {
            0: 35000,  // Sesuai PDF 0005 Oreka: Pemipaan 232,5 m¹ @ Rp 35.000
            6: 35000,
            12: 35000,
            24: 35000,
            36: 35000,
            60: 35000,
        },
        hint: 'Pemasangan jalur pipa kiri & kanan tapak bangunan (m¹)',
    },
    {
        code: 'ar_injeksi_inlet_pipa',
        kategori: 'AR',
        layanan: ['anti_rayap_pipanisasi', 'anti_rayap_injeksi'],
        label: 'Injeksi pada Jalur Inlet Pipa',
        unit: 'm¹',
        priceByWarrantyMonths: {
            0: 12000,
            6: 13000,
            12: 14000,
            24: 15500,
            36: 17000, // Sesuai PDF 0247 KSP: Injeksi pada Jalur Inlet Pipa 750 m¹ @ Rp 17.000 (Garansi 3 Thn)
            60: 20000,
        },
        hint: 'Penginjeksian larutan termitisida pada jalur inlet pipa terpasang (m¹)',
    },

    // ── ANTI RAYAP: PASCA-KONSTRUKSI / RETREATMENT / BARRIER (Contoh PDF 0022 - Bank Victoria & 0019 - Topindo) ──
    {
        code: 'ar_pondasi_1_sisi',
        kategori: 'AR',
        layanan: ['anti_rayap_injeksi', 'anti_rayap_soil'],
        label: 'Pondasi 1 sisi',
        unit: 'm¹',
        priceByWarrantyMonths: {
            0: 13000,
            6: 14000,
            12: 15000,
            24: 17000,
            36: 19000, // Sesuai PDF 0022 Bank Victoria: Pondasi 1 sisi 99,5 m¹ @ Rp 19.000 (Garansi 3 Thn)
            60: 23000,
        },
        hint: 'Pengeboran & injeksi pondasi 1 sisi jarak 30-40 cm (m¹)',
    },
    {
        code: 'ar_pondasi_2_sisi',
        kategori: 'AR',
        layanan: ['anti_rayap_injeksi', 'anti_rayap_soil'],
        label: 'Pondasi 2 sisi',
        unit: 'm¹',
        priceByWarrantyMonths: {
            0: 26000,
            6: 28000,
            12: 30000,
            24: 34000,
            36: 38000, // Sesuai PDF 0022 Bank Victoria: Pondasi 2 sisi 34,5 m¹ @ Rp 38.000 (Garansi 3 Thn)
            60: 45000,
        },
        hint: 'Pengeboran & injeksi pondasi 2 sisi luar-dalam (m¹)',
    },
    {
        code: 'ar_plafon',
        kategori: 'AR',
        layanan: ['anti_rayap_injeksi', 'anti_rayap_soil'],
        label: 'Plafon Lt 1 s.d. 4',
        unit: 'm²',
        priceByWarrantyMonths: {
            0: 6000,
            6: 6500,
            12: 7200,
            24: 8200,
            36: 9100,  // Sesuai PDF 0022 Bank Victoria: Plafon 1.332 m² @ Rp 9.100 (Garansi 3 Thn)
            60: 11000,
        },
        hint: 'Penyemprotan larutan termitisida pada seluruh plafon (m²)',
    },
    {
        code: 'ar_partisi',
        kategori: 'AR',
        layanan: ['anti_rayap_injeksi', 'anti_rayap_soil'],
        label: 'Partisi',
        unit: 'm²',
        priceByWarrantyMonths: {
            0: 8500,
            6: 9500,
            12: 10500,
            24: 11800,
            36: 13000, // Sesuai PDF 0022 Bank Victoria: Partisi 627 m² @ Rp 13.000 (Garansi 3 Thn)
            60: 15500,
        },
        hint: 'Penyemprotan & injeksi pada partisi / kusen kayu (m²)',
    },
    {
        code: 'ar_bangunan_gedung_m2',
        kategori: 'AR',
        layanan: ['anti_rayap_injeksi', 'anti_rayap_soil'],
        label: 'Bangunan Gedung / Gudang (Barrier System)',
        unit: 'm²',
        priceByWarrantyMonths: {
            0: 20000,
            6: 22000,
            12: 24000,
            24: 27000,
            36: 30000, // Sesuai PDF 0019 Topindo: Gedung & Gudang @ Rp 30.000/m² (Garansi 3 Thn)
            60: 35000,
        },
        hint: 'Tarif paket per m² luas bangunan untuk Barrier System Pasca-Konstruksi',
    },
    {
        code: 'ar_baiting_station',
        kategori: 'AR',
        layanan: ['anti_rayap_baiting'],
        label: 'Pemasangan & Monitoring Baiting System Rayap',
        unit: 'Titik',
        priceByWarrantyMonths: {
            0: 250000,
            6: 300000,
            12: 350000,
            24: 425000,
            36: 500000,
            60: 650000,
        },
        hint: 'Stasiun umpan rayap (In-ground / Above-ground bait station)',
    },
    {
        code: 'ar_fumigasi_volume',
        kategori: 'AR',
        layanan: ['anti_rayap_fumigasi'],
        label: 'Pekerjaan Fumigasi Anti Rayap',
        unit: 'm³',
        priceByWarrantyMonths: {
            0: 45000,
            6: 50000,
            12: 55000,
            24: 65000,
            36: 75000,
            60: 90000,
        },
        hint: 'Fumigasi ruang/komoditas tertutup per m³',
    },

    // ── PEST CONTROL & RODENT CONTROL (Contoh PDF 0003 PLN Bulungan, 0009 Puskesmas, 0015 Ibu Dita) ──
    {
        code: 'pco_pest_control_kali',
        kategori: 'PCO',
        layanan: ['pest_umum', 'pest_spraying', 'pest_fogging'],
        label: 'Pest Control',
        unit: 'Kali',
        priceByWarrantyMonths: {
            0: 4900000, // Sesuai PDF 0003 PLN Bulungan: 3 Kali @ Rp 4.900.000
        },
        hint: 'Pelaksanaan General Pest Control (Fogging, Spraying B&G, Residual ULV)',
    },
    {
        code: 'pco_rodent_lot_8x',
        kategori: 'PCO',
        layanan: ['pest_umum', 'pest_rodent', 'pest_baiting'],
        label: 'Rodent Control (8x kunjungan)',
        unit: 'Lot',
        priceByWarrantyMonths: {
            0: 4500000, // Sesuai PDF 0003 PLN Bulungan: 1 Lot (8x kunjungan) @ Rp 4.500.000
        },
        hint: 'Paket Rodent Control 8 kali kunjungan per periode',
    },
    {
        code: 'pco_rodent_per_kunjungan',
        kategori: 'PCO',
        layanan: ['pest_rodent', 'pest_umum', 'pest_baiting'],
        label: 'Tikus (Ekslusi, Trapping, Baiting)',
        unit: 'Kunjungan',
        priceByWarrantyMonths: {
            0: 750000,  // Sesuai PDF 0009 Puskesmas Pisangan & 0248 PLN Pondok Gede: @ Rp 750.000 / kunjungan
        },
        hint: 'Biaya per kunjungan Rodent Control (Ekslusi, Trapping, Baiting)',
    },
    {
        code: 'pco_fogging_periode',
        kategori: 'PCO',
        layanan: ['pest_fogging', 'pest_umum'],
        label: 'Pest Control (Fogging) Rumah Tinggal',
        unit: 'Periode',
        priceByWarrantyMonths: {
            0: 550000,  // Sesuai PDF 0015 Ibu Dita: Rp 550.000 per periode (2x kunjungan/bulan)
        },
        hint: 'Jadwal kerja Pest Control Fogging berkala per bulan/periode',
    },
    {
        code: 'pco_kontrak_periode_gedung',
        kategori: 'PCO',
        layanan: ['pest_umum', 'pest_spraying'],
        label: 'Pest Control (In & Outdoor) + Racun Tikus',
        unit: 'Periode',
        priceByWarrantyMonths: {
            0: 999000,  // Sesuai PDF 0276 Wisma Murti: Rp 999.000 / periode
        },
        hint: 'Paket Pest Control Gedung + Pengontrolan Racun Tikus per periode',
    },
];

/**
 * Daftar pilihan cepat Garansi (Preset + Custom dalam Bulan atau Tahun).
 */
export interface WarrantyPresetOption {
    id: string;
    label: string;
    sublabel: string;
    nilai: number;
    unit: GaransiUnit;
    isCustom?: boolean;
}

export const WARRANTY_PRESET_OPTIONS: WarrantyPresetOption[] = [
    { id: '1_tahun',  label: '1 Tahun - Garansi',   sublabel: 'Garansi 1 Tahun (12 Bln)', nilai: 1, unit: 'tahun' },
    { id: '3_tahun',  label: '3 Tahun - Garansi',   sublabel: 'Standar Pasca-Konstruksi', nilai: 3, unit: 'tahun' },
    { id: '5_tahun',  label: '5 Tahun - Garansi',   sublabel: 'Standar Pra-Konstruksi',   nilai: 5, unit: 'tahun' },
    { id: 'custom',   label: 'Customize - Garansi', sublabel: 'Atur Tahun / Bulan Bebas', nilai: 2, unit: 'tahun', isCustom: true },
];

/**
 * Mengonversi nilai + satuan garansi ('tahun' | 'bulan') ke total bulan.
 */
export function warrantyToTotalMonths(nilai: number, unit: GaransiUnit = 'tahun'): number {
    if (!Number.isFinite(nilai) || nilai <= 0) return 0;
    return unit === 'tahun' ? Math.round(nilai * 12) : Math.round(nilai);
}

/**
 * Menghitung harga satuan otomatis untuk sebuah item preset berdasarkan durasi garansi (Tahun atau Bulan).
 * Jika durasi garansi berupa angka custom (misal: 18 bulan, 9 bulan, atau 4 tahun = 48 bulan),
 * sistem melakukan interpolasi linier di antara titik referensi terdekat dan membulatkan ke Rp 500 terdekat.
 */
export function resolvePresetPriceByWarranty(
    preset: PresetWorkItem,
    garansiNilai: number,
    garansiUnit: GaransiUnit = 'tahun',
): number {
    const months = warrantyToTotalMonths(garansiNilai, garansiUnit);
    const map = preset.priceByWarrantyMonths;
    if (map[months] !== undefined) return map[months];

    const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return 0;
    if (months <= keys[0]) return map[keys[0]];
    if (months >= keys[keys.length - 1]) {
        // Jika di atas titik tertinggi (mis. > 60 bulan), naik proporsional 5% per 12 bulan
        const maxKey = keys[keys.length - 1];
        const maxVal = map[maxKey];
        if (maxKey === 0) return maxVal;
        const extraMonths = months - maxKey;
        const extraFactor = 1 + (extraMonths / 12) * 0.05;
        return Math.round((maxVal * extraFactor) / 500) * 500;
    }

    // Interpolasi di antara dua titik terdekat
    for (let i = 0; i < keys.length - 1; i++) {
        const k1 = keys[i], k2 = keys[i + 1];
        if (months >= k1 && months <= k2) {
            const v1 = map[k1], v2 = map[k2];
            const ratio = (months - k1) / (k2 - k1);
            const raw = v1 + (v2 - v1) * ratio;
            return Math.round(raw / 500) * 500;
        }
    }
    return map[keys[0]];
}

/**
 * Mengambil daftar preset item yang relevan untuk kategori ('AR' | 'PCO') atau jenis layanan tertentu.
 */
export function getPresetsForService(jenisLayanan: JenisLayanan, kategori?: KategoriSurat): PresetWorkItem[] {
    const kat = kategori ?? (jenisLayanan.startsWith('anti_rayap') ? 'AR' : 'PCO');
    const exact = PRESET_WORK_ITEMS.filter(p => p.layanan.includes(jenisLayanan));
    const sameKat = PRESET_WORK_ITEMS.filter(p => p.kategori === kat && !p.layanan.includes(jenisLayanan));
    return [...exact, ...sameKat];
}

/**
 * Memformat durasi garansi menjadi teks resmi surat penawaran:
 *   - (5, 'tahun') -> "5 (Lima) tahun"
 *   - (2, 'tahun') -> "2 (Dua) tahun"
 *   - (6, 'bulan') -> "6 (Enam) bulan"
 *   - (18, 'bulan') -> "18 (Delapan Belas) bulan"
 */
export function formatWarrantyDurationText(
    nilai?: number,
    unit: GaransiUnit = 'tahun',
    lowercaseWords = false,
): string {
    const n = Math.max(0, Math.round((nilai ?? 0) * 10) / 10);
    if (n <= 0) return 'Tanpa Garansi';
    const wordRaw = Number.isInteger(n) ? terbilang(n) : String(n).replace('.', ',');
    const word = lowercaseWords ? wordRaw.toLowerCase() : wordRaw;
    const unitLabel = unit === 'bulan' ? 'bulan' : 'tahun';
    const nDisplay = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
    return `${nDisplay} (${word}) ${unitLabel}`;
}

/**
 * Menghasilkan jadwal 12 bulan otomatis untuk Surat Jadwal Kerja Pest Control (Fogging)
 * seperti pada PDF 0015 (Ibu Dita - Jl. Dharmawangsa Raya No. 25).
 * Default: Selasa minggu ke-2 dan minggu ke-4 setiap bulan sepanjang tahun target.
 */
export interface MonthlyScheduleRow {
    no: number;
    bulan: string;
    tgl1: string;
    tgl2: string;
}

const BULAN_NAMES = [
    'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
    'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
];

export function generateDefaultFoggingSchedule(
    year: number = new Date().getFullYear(),
    dayOfWeek: number = 2, // 2 = Selasa (sesuai PDF 0015: 13 & 27 Jan 2026 adalah hari Selasa!)
): MonthlyScheduleRow[] {
    return BULAN_NAMES.map((name, monthIdx) => {
        const matchingDays: number[] = [];
        const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const dt = new Date(year, monthIdx, d);
            if (dt.getDay() === dayOfWeek) {
                matchingDays.push(d);
            }
        }
        // Ambil kemunculan ke-2 dan ke-4 (atau ke-1 dan ke-3 sesuai pola dwi-mingguan)
        const t1 = matchingDays[1] ?? matchingDays[0] ?? 7;
        const t2 = matchingDays[3] ?? matchingDays[2] ?? 21;
        return {
            no: monthIdx + 1,
            bulan: `${name} ${year}`,
            tgl1: String(t1).padStart(2, '0'),
            tgl2: String(t2).padStart(2, '0'),
        };
    });
}
