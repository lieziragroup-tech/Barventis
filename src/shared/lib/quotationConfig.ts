/**
 * Konfigurasi Quotation PT Guci Emas Pratama
 */

import type { JenisLayanan, KategoriSurat, NomorStage } from '@/entities/types';

export const COMPANY = {
    name: "PT GUCI EMAS PRATAMA",
    head: "Jln. Ganda Sasmita No.1 Serua, Ciputat - Tangerang Selatan 15414",
    telp: "(021) 74637054",
    wa: "0817 0795 959",
    email: "info@gucimaspratama.co.id",
    web: "www.gucimaspratama.co.id",
    branch: "Pondok Trosobo Indah Blok I No.3, Sidoarjo - Jawa Timur. Telp : (031) 70235866",
} as const;

export const BRAND = {
    green: "#1a5c38",
    greenLight: "#e8f4ed",
    greenMid: "#2d7a4f",
    dark: "#1a1a1a",
    gray: "#555555",
    grayLight: "#888888",
    border: "#cccccc",
    tableHeader: "#2d7a4f",
    tableAlt: "#f2f8f5",
    totalBg: "#1a5c38",
} as const;

export interface LayananConfig {
    label: string;
    kategori: KategoriSurat;
    perihal: string;
    isAR: boolean;
}

export const LAYANAN_CONFIG: Record<JenisLayanan, LayananConfig> = {
    // ── Anti Rayap (AR) ───────────────────────────────────────────────────────
    anti_rayap_injeksi:    { label: "Anti Rayap — Injeksi / Pasca Konstruksi", kategori: "AR",  perihal: "Penawaran Harga Anti Rayap",               isAR: true  },
    anti_rayap_pipanisasi: { label: "Anti Rayap — Pipanisasi",                 kategori: "AR",  perihal: "Penawaran Harga Anti Rayap (Injeksi Pipa)",isAR: true  },
    anti_rayap_baiting:    { label: "Anti Rayap — Baiting System",             kategori: "AR",  perihal: "Penawaran Harga Anti Rayap",               isAR: true  },
    anti_rayap_soil:       { label: "Anti Rayap — Soil / Pra Konstruksi",      kategori: "AR",  perihal: "Penawaran Harga Anti Rayap",               isAR: true  },
    anti_rayap_fumigasi:   { label: "Anti Rayap — Fumigasi",                   kategori: "AR",  perihal: "Penawaran Harga Fumigasi Anti Rayap",      isAR: true  },
    // ── Pest Control (PCO) ────────────────────────────────────────────────────
    pest_spraying:         { label: "Pest Control — Spraying",                 kategori: "PCO", perihal: "Penawaran Harga Pest Control",             isAR: false },
    pest_fogging:          { label: "Pest Control — Fogging / Jadwal Kerja",   kategori: "PCO", perihal: "Jadwal Kerja Pest Control (Fogging)",      isAR: false },
    pest_rodent:           { label: "Pest Control — Rodent Control (Tikus)",   kategori: "PCO", perihal: "Penawaran Harga Jasa Pengendalian Hama",   isAR: false },
    pest_baiting:          { label: "Pest Control — Baiting",                  kategori: "PCO", perihal: "Penawaran Harga Pest Control",             isAR: false },
    pest_umum:             { label: "Pest Control — General Pest & Rodent",    kategori: "PCO", perihal: "Penawaran Pest Control",                   isAR: false },
};

export const KONDISI_BANGUNAN_LABELS: Record<string, string> = {
    pasca_konstruksi: "Pasca-Konstruksi",
    pra_konstruksi:   "Pra-Konstruksi",
    renovasi:         "Renovasi",
};

export const TIPE_LABELS: Record<string, string> = {
    U: "Umum",
    K: "Kontrak",
    PH: "Penawaran Harga",
};

/**
 * Membangun nomor surat:
 *   - Stage DRF (Draft): GP-DRF/AR/PH/YYYY/MM/NNNN atau GP-DRF/PCO/PH/YYYY/MM/NNNN
 *   - Stage OFFICIAL / Resmi: GP/AR/PH/YYYY/MM/NNNN atau GP/PCO/PH/YYYY/MM/NNNN (langsung AR atau PCO tanpa kode APR)
 */
export function buildNomorSurat(
    kategori: KategoriSurat,
    tipe: string,
    yyyy: string,
    mm: string,
    seq: number,
    stage?: NomorStage,
    prefix: string = "GP",
): string {
    const seqPad = String(seq).padStart(4, "0");
    if (stage === "DRF") {
        return `${prefix}-DRF/${kategori}/${tipe}/${yyyy}/${mm}/${seqPad}`;
    }
    // Nomor Resmi: langsung tanpa DRF/APR (contoh: GP/AR/PH/2026/10/0001)
    return `${prefix}/${kategori}/${tipe}/${yyyy}/${mm}/${seqPad}`;
}

export const KATEGORI_LABELS: Record<string, string> = {
    AR: "Anti Rayap",
    PCO: "Pest Control",
};

export function fmtIDR(amount: number): string {
    return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

/** Zona waktu bisnis untuk seluruh tanggal pada dokumen (bukan zona waktu perangkat/server). */
export const DOC_TIMEZONE = "Asia/Jakarta";

export function fmtDateID(d?: Date | string | null): string {
    if (!d) return "-";
    const dateObj = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dateObj.getTime())) return "-";
    return dateObj.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: DOC_TIMEZONE,
    });
}

export function isAntiRayap(jenisLayanan: JenisLayanan): boolean {
    return LAYANAN_CONFIG[jenisLayanan]?.isAR ?? false;
}

export function buildParagrafPembuka(
    jenisLayanan: JenisLayanan,
    kepadaNama: string,
    alamat: string,
    namaPerusahaan: string = COMPANY.name,
): string {
    if (isAntiRayap(jenisLayanan)) {
        return alamat
            ? `Kami ucapkan terima kasih telah memberikan kesempatan kepada kami ${namaPerusahaan} untuk melakukan survey dan memberikan penawaran untuk pekerjaan Jasa Anti Rayap pada bangunan yang berlokasi di ${alamat}.`
            : `Kami ucapkan terima kasih telah memberikan kesempatan kepada kami ${namaPerusahaan} untuk melakukan survey dan memberikan penawaran untuk pekerjaan Jasa Anti Rayap.`;
    } else {
        return `Terima kasih atas kesempatan yang diberikan kepada kami ${namaPerusahaan} untuk mengajukan surat penawaran harga Jasa Pengendalian Hama (Pest Control) untuk ${kepadaNama}` +
            (alamat ? ` yang beralamat di ${alamat}.` : `.`);
    }
}

export function calcTotals(params: {
    items: { qty: number; harga: number }[];
    biayaTambahan?: { amount: number }[];
    upahPeralatanPct?: number;
    diskonUpahPct?: number;
    diskonPct?: number;
    ppn?: boolean;
    ppnDppFaktor?: number;
}) {
    const {
        items,
        biayaTambahan = [],
        upahPeralatanPct = 0,
        diskonUpahPct = 0,
        diskonPct = 0,
        ppn = false,
        ppnDppFaktor,
    } = params;

    const subtotal = items.reduce((s, i) => s + i.qty * i.harga, 0);
    const upahPeralatanRp = upahPeralatanPct > 0 ? Math.round(subtotal * (upahPeralatanPct / 100)) : 0;
    const diskonUpahRp = diskonUpahPct > 0 ? Math.round(subtotal * (diskonUpahPct / 100)) : 0;
    const biayaExtra = biayaTambahan.reduce((s, b) => s + b.amount, 0) + upahPeralatanRp - diskonUpahRp;
    const subtotalGross = subtotal + biayaExtra;
    const diskonRp = Math.round(subtotalGross * (diskonPct / 100));
    const setelahDiskon = subtotalGross - diskonRp;

    let dpp: number | null = null;
    let ppnRp = 0;

    if (ppn) {
        if (ppnDppFaktor) {
            dpp = Math.round(setelahDiskon * ppnDppFaktor);
            ppnRp = Math.round(dpp * 0.12);
        } else {
            ppnRp = Math.round(setelahDiskon * 0.11);
        }
    }

    return {
        subtotal,
        upahPeralatanPct,
        upahPeralatanRp,
        diskonUpahPct,
        diskonUpahRp,
        biayaExtra,
        subtotalGross,
        diskonPct,
        diskonRp,
        setelahDiskon,
        dpp,
        ppnRp,
        total: Math.round(setelahDiskon + ppnRp),
    };
}

export function angkaKeKata(n: number): string {
    const m: Record<number, string> = {
        1: "satu", 2: "dua", 3: "tiga", 4: "empat", 5: "lima",
        6: "enam", 7: "tujuh", 8: "delapan", 9: "sembilan", 10: "sepuluh",
        11: "sebelas", 12: "dua belas", 18: "delapan belas", 24: "dua puluh empat", 36: "tiga puluh enam",
    };
    return m[n] ?? String(n);
}