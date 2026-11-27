/**
 * PDF Generator — PT Guci Emas Pratama
 * Menggunakan jsPDF untuk generate quotation PDF
 * Mereplikasi seluruh 5 arketipe template surat penawaran resmi PT Guci Emas Pratama
 */

import jsPDF from "jspdf";
import type {
    QuotationItem, BiayaTambahan, JenisLayanan, SurveyPhoto, ChemicalItem,
    GaransiUnit, PdfTemplateVariant, FoggingScheduleItem,
} from '@/entities/types';
import {
    DEFAULT_CHEMICALS_AR, DEFAULT_CHEMICALS_PCO,
    DEFAULT_FOCUS_TARGET, DEFAULT_TEKNIK_PCO, METODE_BY_LAYANAN,
} from '@/entities/types';
import {
    COMPANY, BRAND, LAYANAN_CONFIG,
    fmtIDR, fmtDateID, calcTotals, buildParagrafPembuka, angkaKeKata, isAntiRayap,
} from "./quotationConfig";
import type { TemplateConfig } from '@/shared/api/settingsService';
import { renderQuotationLetter, GUCI_LETTERHEAD, letterheadFromSettings } from './quotationLetterPdf';
import type { Letterhead } from './quotationLetterPdf';
import type { PdfBlock } from './quotationTemplates';

export { GUCI_LETTERHEAD, letterheadFromSettings };
export type { Letterhead, PdfBlock };
import { TEMPLATE_DEFAULTS } from '@/shared/api/settingsService';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface QuotationPDFData {
    noSurat: string;
    draftNoSurat?: string;
    tanggal: Date;
    kepadaNama: string;
    kepadaAlamatLines: string[];
    kepadaUp?: string;
    kepadaWa?: string;
    jenisLayanan: JenisLayanan;
    pdfVariant?: PdfTemplateVariant;
    isRevisi?: boolean;
    isDraft?: boolean;
    isApproved?: boolean;
    perihal?: string;
    paragrafPembuka?: string;
    items: QuotationItem[];
    biayaTambahan?: BiayaTambahan[];
    upahPeralatanPct?: number; // mis. 25 (Upah & Peralatan Kerja 25%)
    diskonUpahPct?: number;    // mis. 15 ((Diskon Upah & Peralatan Kerja 15%))
    diskonPct?: number;
    ppn?: boolean;
    ppnDppFaktor?: number;
    // Dukungan Garansi Tahun maupun Bulan (Custom / Preset)
    garansiTahun?: number;
    garansiNilai?: number;
    garansiUnit?: GaransiUnit; // 'tahun' | 'bulan'
    jenisGaransi?: string;
    marketingNama?: string;
    marketingWa?: string;
    // Survey & Technical
    surveyor?: string;
    tanggalSurvey?: Date;
    hasilSurvey?: string;      // Temuan lapangan: "Kami menemukan bekas serangan rayap pada kusen..."
    kunjunganPerBulan?: number;// Mis. 3 kali kunjungan per bulan (PDF 0009)
    jadwalFoggingTahun?: number;
    jadwalFoggingRows?: FoggingScheduleItem[];
    surveyPhotos?: SurveyPhoto[];
    chemicals?: ChemicalItem[];
    metode?: string[];
    focusTarget?: string;
    teknikPelaksanaan?: string[];
    signatureBase64?: string;
    templateConfig?: TemplateConfig;

    // ── Template surat resmi (lihat quotationLetterPdf.ts) ───────────────────
    layout?: 'template' | 'legacy';
    letterhead?: Letterhead;
    tipeSurat?: 'penawaran' | 'perpanjangan' | 'jadwal_fogging';
    suratSaja?: boolean;
    suratBlocks?: PdfBlock[];
    salam?: string;
    objekPekerjaan?: string;          // "bangunan rumah tinggal pra konstruksi" / "Bank Victoria Cabang Fatmawati"
    lokasiPekerjaan?: string;         // alamat lokasi kerja bila berbeda dari alamat surat
    masaBerlakuHari?: number;         // default 30
    jasaLabel?: string;               // "Jasa Anti Rayap" / "Jasa Anti Rayap Ulang (Retreatment)"
    metodeIntro?: string;
    skemaPembayaran?: string[];
    garansiCatatan?: string;
    catatanPajak?: string;
    tampilkanPengontrolan?: boolean;
    pengontrolan?: string[];
    programs?: PdfBlock[][];
    biayaFormat?: 'boq' | 'rincian' | 'rodent_bulanan';
    boqSubjudul?: string;
    sistemPembayaran?: string;
    lampiranPages?: SurveyPhoto[];
    biayaHeaders?: [string, string, string, string];
    kontakKantor?: string;
    kontakWa?: string;
}

/**
 * Generate PDF quotation dan return sebagai Blob.
 */
export function generateQuotationPDF(data: QuotationPDFData): Blob {
    return renderQuotationLetter(data);
}

/**
 * Shortcut: generate dan langsung download ke browser
 */
export function downloadQuotationPDF(data: QuotationPDFData, filename?: string): void {
    const blob = generateQuotationPDF(data);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename ?? `${data.noSurat.replace(/\//g, "-")}.pdf`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}