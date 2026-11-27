/**
 * Renderer surat penawaran bergaya template resmi PT Guci Emas Pratama.
 * Mendukung 5 varian template resmi:
 *   1. ar_pra_profile_8p    : Pra-Konstruksi + Pipa + Company Profile & Edukasi (PDF 0005 - PT Oreka Solusi Kreatif)
 *   2. ar_pasca_standar_4p  : Pasca-Konstruksi / Retreatment + Tabel Rumus Volume + Upah 25% & Diskon Upah 15% (PDF 0022 - Bank Victoria)
 *   3. pco_rodent_survey_4p : Proposal Rodent Control Survey + Program Kerja A-E + Tabel Biaya Oranye (PDF 0009 - Puskesmas Pisangan)
 *   4. pco_korporat_boq_3p  : Penawaran Pest & Rodent Korporat + Total di Cover + DPP 11/12 & PPN 12% (PDF 0003 - PLN Bulungan)
 *   5. pco_jadwal_fogging_1p: Surat Jadwal Kerja Pest Control (Fogging) 12 Bulan 1 Halaman (PDF 0015 - Ibu Dita)
 *
 * Murni jsPDF + teks vektor (tanpa html2canvas) sehingga hasilnya tajam, ringan, dan dapat diuji otomatis.
 */
import jsPDF from 'jspdf';
import type { QuotationPDFData } from './pdfGenerator';
import { COMPANY, LAYANAN_CONFIG, isAntiRayap, calcTotals, fmtDateID, DOC_TIMEZONE } from './quotationConfig';
import { DEFAULT_CHEMICALS_AR, METODE_BY_LAYANAN } from '@/entities/types';
import { terbilang } from './terbilang';
import { formatWarrantyDurationText, generateDefaultFoggingSchedule } from './warrantyPricingEngine';
import { normalizeVolumeFormulaDisplay } from '@/shared/utils/volumeCalculator';
import {
    PdfBlock, programPest, programRodentKontrak, programRodentStandalone,
    edukasiDanProfilPraKonstruksi, PENGONTROLAN_AR, PEMBAYARAN_AR_DUA_TAHAP, JASA_LABEL,
} from './quotationTemplates';
import { GUCI_HEADER_LOGO, GUCI_LOGO_APMA, GUCI_LOGO_ASPPHAMI } from './brandAssets.guci';

// ─── Letterhead (multi-tenant) ───────────────────────────────────────────────

export interface Letterhead {
    companyName: string;
    kota: string;
    headerLogo?: string;
    headerLogoWidthMm?: number;
    headerLogoRatio?: number;
    brandName?: string;
    tagline?: string;
    brandColor?: string;
    footerLines: string[];
    footerLogos?: { src: string; widthMm: number; heightMm?: number }[];
}

export const GUCI_LETTERHEAD: Letterhead = {
    companyName: COMPANY.name,
    kota: 'Tangerang Selatan',
    headerLogo: GUCI_HEADER_LOGO,
    headerLogoWidthMm: 92,
    headerLogoRatio: 64 / 434,
    footerLines: [
        `Head Office    : ${COMPANY.head.replace(/ - /g, ' – ')}`,
        `Telp : ${COMPANY.telp}, Whatsapp : ${COMPANY.wa}`,
        `E-Mail : ${COMPANY.email} - ${COMPANY.web}`,
        `Branch Office : ${COMPANY.branch.replace(/ - /g, ' – ')}`,
    ],
    footerLogos: [
        { src: GUCI_LOGO_ASPPHAMI, widthMm: 17, heightMm: (17 * 74) / 104 },
        { src: GUCI_LOGO_APMA, widthMm: 22, heightMm: (22 * 57) / 104 },
    ],
};

export function letterheadFromSettings(
    s: {
        companyName: string; companyTagline?: string; headOffice: string; branchOffice?: string;
        telp: string; wa: string; email: string; website: string;
        template?: { logoBase64?: string; logoWidthMm?: number; logoHeightMm?: number; primaryColor?: string };
    },
    kota = '',
): Letterhead {
    const t = s.template;
    const hasLogo = Boolean(t?.logoBase64);
    const lines = [
        `Head Office : ${s.headOffice}`,
        `Telp : ${s.telp}${s.wa ? `, Whatsapp : ${s.wa}` : ''}`,
        `E-Mail : ${s.email}${s.website ? ` - ${s.website}` : ''}`,
    ];
    if (s.branchOffice) lines.push(`Branch Office : ${s.branchOffice}`);
    return {
        companyName: s.companyName,
        kota,
        headerLogo: hasLogo ? t!.logoBase64 : undefined,
        headerLogoWidthMm: t?.logoWidthMm || 60,
        headerLogoRatio: t?.logoWidthMm && t?.logoHeightMm ? t.logoHeightMm / t.logoWidthMm : 0.25,
        brandName: s.companyName,
        tagline: s.companyTagline,
        brandColor: t?.primaryColor,
        footerLines: lines,
    };
}

// ─── Konstanta tata letak (mm) ───────────────────────────────────────────────

const PW = 210, PH = 297;
const ML = 24, MR = 22, TW = PW - ML - MR; // lebar teks 164
const TOP = 36;
const BOTTOM = 262;
const BODY = 10;
const LH = 5;

type FontStyle = 'normal' | 'bold' | 'italic' | 'bolditalic';
interface Tok { w: string; st: FontStyle; u: boolean; sp: boolean; br?: boolean }

function stripRichTags(src: string): string {
    return src.replace(/<\/?[biu]>/g, '');
}

function cleanPersonDisplayName(raw?: string): string {
    if (!raw) return '';
    return raw
        .replace(/\s*[—–-]\s*Master All-Role.*$/i, '')
        .replace(/\s*\((?:Guci Emas|Superadmin|Admin|Marketing|Teknisi).*?\)$/i, '')
        .trim();
}

function tokenize(src: string): Tok[] {
    const out: Tok[] = [];
    let b = false, i = false, u = false, space = true;
    for (const part of src.split(/(<\/?[biu]>)/)) {
        if (part === '<b>') b = true; else if (part === '</b>') b = false;
        else if (part === '<i>') i = true; else if (part === '</i>') i = false;
        else if (part === '<u>') u = true; else if (part === '</u>') u = false;
        else if (part) {
            for (const piece of part.split(/(\r?\n|[ \t]+)/)) {
                if (!piece) continue;
                if (/^\r?\n$/.test(piece)) {
                    out.push({ w: '', st: 'normal', u: false, sp: false, br: true });
                    space = false;
                    continue;
                }
                if (/^[ \t]+$/.test(piece)) { space = true; continue; }
                out.push({ w: piece, st: b && i ? 'bolditalic' : b ? 'bold' : i ? 'italic' : 'normal', u, sp: space });
                space = false;
            }
        }
    }
    return out;
}

const idr = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dec = (n: number) => {
    if (Number.isInteger(n)) return idr(n);
    const [intP, decP] = String(Math.round(n * 100) / 100).split('.');
    return `${intP.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decP}`;
};
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ENTITY = new Set(['PT', 'CV', 'UD', 'PD', 'TBK', 'KSP', 'PERSERO']);
const titleCompany = (n: string) => n.split(/\s+/).map(w => (ENTITY.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');

type Align = 'left' | 'justify' | 'center' | 'right';

type Cell =
    | string
    | {
        text?: string; span?: number; align?: Align; bold?: boolean; italic?: boolean; fill?: string;
        money?: string; prefix?: string; suffix?: string; vol?: [string, string];
    };

type CellObj = Exclude<Cell, string>;

class Renderer {
    private doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    private y = TOP;
    private lh: Letterhead;
    private co: string;

    constructor(private d: QuotationPDFData) {
        this.lh = d.letterhead ?? GUCI_LETTERHEAD;
        this.co = titleCompany(this.lh.companyName);
    }

    // ─── Chrome (Kop & Footer) ───────────────────────────────────────────────

    private chrome(skipKopAndFooter = false) {
        if (skipKopAndFooter) return;
        const doc = this.doc, lh = this.lh;
        if (lh.headerLogo) {
            try {
                const props = doc.getImageProperties(lh.headerLogo);
                const w = lh.headerLogoWidthMm ?? 92, h = w * (lh.headerLogoRatio ?? props.height / props.width);
                doc.addImage(lh.headerLogo, props.fileType, 13, 8, w, h);
            } catch { /* logo rusak: lewati */ }
        } else {
            const col = lh.brandColor ?? '#1a5c38';
            doc.setFont('times', 'bold'); doc.setFontSize(17); doc.setTextColor(col);
            doc.text(lh.brandName ?? lh.companyName, 14, 16);
            if (lh.tagline) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor('#777777'); doc.text(lh.tagline, 14, 21.5); }
        }
        const fy = 268;
        doc.setTextColor('#000000');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(lh.companyName.toUpperCase(), 12, fy);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        lh.footerLines.forEach((l, k) => doc.text(l, 12, fy + 4 + k * 3.7));
        let x = PW - 12;
        for (const lg of [...(lh.footerLogos ?? [])].reverse()) {
            x -= lg.widthMm;
            try {
                const props = doc.getImageProperties(lg.src);
                doc.addImage(lg.src, props.fileType, x, fy - 3, lg.widthMm, lg.heightMm ?? (lg.widthMm * props.height) / props.width);
            } catch { /* lewati */ }
            x -= 6;
        }
        doc.setTextColor('#000000');
    }

    private newPage() { this.doc.addPage(); this.chrome(); this.y = TOP; }
    private ensure(h: number) { if (this.y + h > BOTTOM) this.newPage(); }
    private font(st: FontStyle = 'normal', size = BODY) { this.doc.setFont('helvetica', st); this.doc.setFontSize(size); }
    private gap(mm = 3) { this.y += mm; }

    // ─── Teks Kaya ───────────────────────────────────────────────────────────

    private rich(text: string, o: { x?: number; w?: number; size?: number; lh?: number; align?: Align; base?: FontStyle; measureOnly?: boolean } = {}): number {
        const x0 = o.x ?? ML, W = o.w ?? TW, size = o.size ?? BODY, lh = o.lh ?? LH, align = o.align ?? 'left';
        const doc = this.doc;
        const toks = tokenize(text).map(t => (o.base === 'bold' && t.st === 'normal' ? { ...t, st: 'bold' as FontStyle } : o.base === 'bold' && t.st === 'italic' ? { ...t, st: 'bolditalic' as FontStyle } : t));
        const wOf = (t: Tok) => { doc.setFont('helvetica', t.st); doc.setFontSize(size); return doc.getTextWidth(t.w); };
        doc.setFont('helvetica', 'normal'); doc.setFontSize(size);
        const sw = doc.getTextWidth(' ');

        const lines: { toks: Tok[]; ws: number[]; width: number }[] = [];
        let cur: { toks: Tok[]; ws: number[]; width: number } = { toks: [], ws: [], width: 0 };
        for (const t of toks) {
            if (t.br) {
                lines.push(cur);
                cur = { toks: [], ws: [], width: 0 };
                continue;
            }
            const w = wOf(t);
            const add = (cur.toks.length && t.sp ? sw : 0) + w;
            if (cur.toks.length && cur.width + add > W) { lines.push(cur); cur = { toks: [], ws: [], width: 0 }; }
            cur.width += (cur.toks.length && t.sp ? sw : 0) + w;
            cur.toks.push(t); cur.ws.push(w);
        }
        if (cur.toks.length || lines.length === 0) lines.push(cur);
        if (o.measureOnly) return lines.length;

        lines.forEach((ln, li) => {
            this.ensure(lh);
            const last = li === lines.length - 1;
            const gaps = ln.toks.filter((t, k) => k > 0 && t.sp).length;
            const extra = align === 'justify' && !last && gaps > 0 ? (W - ln.width) / gaps : 0;
            let x = x0;
            if (align === 'center') x = x0 + (W - ln.width) / 2;
            if (align === 'right') x = x0 + W - ln.width;
            const baseline = this.y + lh * 0.72;
            ln.toks.forEach((t, k) => {
                if (k > 0 && t.sp) x += sw + extra;
                doc.setFont('helvetica', t.st); doc.setFontSize(size);
                doc.text(t.w, x, baseline);
                if (t.u) {
                    doc.setLineWidth(0.2);
                    const nextU = ln.toks[k + 1]?.u && ln.toks[k + 1].sp;
                    doc.line(x, baseline + 0.7, x + ln.ws[k] + (nextU ? sw + extra : 0), baseline + 0.7);
                }
                x += ln.ws[k];
                // Kompensasi italic overhang kerning (+0.65mm) saat transisi ke teks normal/tegak
                const prevWasItalic = t.st === 'italic' || t.st === 'bolditalic';
                const nextIsNormal = ln.toks[k + 1] && (ln.toks[k + 1].st === 'normal' || ln.toks[k + 1].st === 'bold');
                if (prevWasItalic && nextIsNormal) {
                    x += 0.65;
                }
            });
            this.y += lh;
        });
        return lines.length;
    }

    private para(text: string, o: { size?: number; lh?: number; justify?: boolean; indent?: number; after?: number; base?: FontStyle; align?: Align } = {}) {
        for (const chunk of text.split('\n')) {
            this.rich(chunk, { x: ML + (o.indent ?? 0), w: TW - (o.indent ?? 0), size: o.size, lh: o.lh, base: o.base, align: o.align ?? (o.justify === false ? 'left' : 'justify') });
        }
        this.gap(o.after ?? 2);
    }

    private heading(text: string, o: { size?: number; underline?: boolean; align?: Align } = {}) {
        this.ensure(LH * 3);
        const t = o.underline ? `<u>${text}</u>` : text;
        this.rich(t, { base: 'bold', size: o.size ?? BODY, align: o.align ?? 'left' });
        this.gap(1);
    }

    private bullets(items: string[], o: { marker?: string; indent?: number; hang?: number; lh?: number; justify?: boolean } = {}) {
        const marker = o.marker ?? '•', indent = o.indent ?? 6, hang = o.hang ?? 5;
        for (const it of items) {
            const n = this.rich(it, { x: ML + indent + hang, w: TW - indent - hang, align: o.justify === false ? 'left' : 'justify', lh: o.lh, measureOnly: true });
            this.ensure(n * (o.lh ?? LH));
            if (marker) { this.font(); this.doc.text(marker, ML + indent, this.y + (o.lh ?? LH) * 0.72); }
            this.rich(it, { x: ML + indent + hang, w: TW - indent - hang, align: o.justify === false ? 'left' : 'justify', lh: o.lh });
        }
        this.gap(1.5);
    }

    private kv(rows: [string, string][], o: { labelW?: number; marker?: string; indent?: number; boldAll?: boolean } = {}) {
        const indent = o.indent ?? 6, mk = o.marker ?? '-';
        const doc = this.doc;
        doc.setFont('helvetica', o.boldAll ? 'bold' : 'normal');
        doc.setFontSize(BODY);
        const maxMeasuredKeyW = rows.length > 0
            ? Math.max(...rows.map(([k]) => doc.getTextWidth(stripRichTags(k))))
            : 24;
        const lw = Math.max(o.labelW ?? 24, Math.min(78, Math.ceil(maxMeasuredKeyW) + 4));

        for (const [k, v] of rows) {
            const vx = ML + indent + 5 + lw + 4;
            const nV = this.rich(v, { x: vx, w: PW - MR - vx, measureOnly: true });
            const nK = this.rich(k, { x: ML + indent + 5, w: lw - 1, base: o.boldAll ? 'bold' : 'normal', measureOnly: true });
            const n = Math.max(nV, nK);
            this.ensure(n * LH);
            const base = this.y + LH * 0.72;
            this.font(o.boldAll ? 'bold' : 'normal');
            if (mk) this.doc.text(mk, ML + indent, base);

            // Render label kiri menggunakan rich text agar tag <i>, <b>, <u> terurai
            const savedY = this.y;
            this.rich(k, { x: ML + indent + 5, w: lw - 1, base: o.boldAll ? 'bold' : 'normal', align: 'left' });
            const afterKeyY = this.y;
            this.y = savedY;

            this.font(o.boldAll ? 'bold' : 'normal');
            this.doc.text(':', ML + indent + 5 + lw, base);
            this.rich(v, { x: vx, w: PW - MR - vx, base: o.boldAll ? 'bold' : 'normal', align: 'left' });
            this.y = Math.max(this.y, afterKeyY);
        }
        this.gap(1.5);
    }

    // ─── Tabel ───────────────────────────────────────────────────────────────

    private table(cols: number[], rows: Cell[][], o: { head?: Cell[]; headFill?: string; headTextWhite?: boolean; size?: number; pad?: number; minH?: number } = {}) {
        const doc = this.doc, size = o.size ?? 9.5, pad = o.pad ?? 1.6, minH = o.minH ?? 6.4, th = size * 0.3528 * 1.25;
        const xs = cols.reduce<number[]>((a, w, i) => { a.push(i === 0 ? ML : a[i - 1] + cols[i - 1]); return a; }, []);
        const all: { cells: Cell[]; head: boolean }[] = [];
        if (o.head) all.push({ cells: o.head, head: true });
        rows.forEach(r => all.push({ cells: r, head: false }));

        for (const row of all) {
            let h = minH, ci = 0;
            const placed: { x: number; w: number; c: Exclude<Cell, string> }[] = [];
            for (const raw of row.cells) {
                const c = typeof raw === 'string' ? { text: raw } : raw;
                const span = c.span ?? 1;
                const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0);
                placed.push({ x: xs[ci], w, c });
                if (c.text && !c.money && !c.vol) {
                    const n = this.rich(c.text, { x: xs[ci] + pad, w: w - 2 * pad, size, base: row.head || c.bold ? 'bold' : 'normal', measureOnly: true });
                    h = Math.max(h, n * th + 2 * pad);
                }
                ci += span;
            }
            this.ensure(h);
            for (const { x, w, c } of placed) {
                const fill = row.head ? o.headFill : c.fill;
                if (fill) { doc.setFillColor(fill); doc.rect(x, this.y, w, h, 'F'); }
                doc.setDrawColor('#000000'); doc.setLineWidth(0.25); doc.rect(x, this.y, w, h);
                const bold = row.head || c.bold;
                const st: FontStyle = bold && c.italic ? 'bolditalic' : bold ? 'bold' : c.italic ? 'italic' : 'normal';
                doc.setFont('helvetica', st); doc.setFontSize(size);
                doc.setTextColor(row.head && o.headTextWhite ? '#FFFFFF' : '#000000');
                const base = this.y + h / 2 + size * 0.3528 * 0.34;
                if (c.money !== undefined) {
                    doc.text(c.prefix ?? 'Rp', x + pad, base);
                    doc.text(`${c.money}${c.suffix ?? ''}`, x + w - pad, base, { align: 'right' });
                } else if (c.vol) {
                    doc.text(c.vol[0], x + w * 0.62, base, { align: 'right' });
                    doc.text(c.vol[1], x + w * 0.68, base);
                } else if (c.text) {
                    const align = c.align ?? (row.head ? 'center' : 'left');
                    const n = this.rich(c.text, { x: x + pad, w: w - 2 * pad, size, base: bold ? 'bold' : 'normal', measureOnly: true });
                    const startY = this.y + (h - n * th) / 2;
                    const saved = this.y;
                    this.y = startY;
                    this.rich(c.text, { x: x + pad, w: w - 2 * pad, size, lh: th, base: bold ? 'bold' : 'normal', align: align === 'justify' ? 'left' : align });
                    this.y = saved;
                }
                doc.setTextColor('#000000');
            }
            this.y += h;
        }
        this.gap(3);
    }

    private blocks(list: PdfBlock[]) {
        for (const b of list) {
            switch (b.t) {
                case 'title': this.heading(b.text, { underline: b.underline }); this.gap(1); break;
                case 'h': this.heading(b.text); break;
                case 'sub': this.rich(b.text, { base: 'bold' }); this.gap(0.5); break;
                case 'p': this.para(b.text.replace('{klien}', this.d.kepadaNama).replace('{company}', this.co), { justify: b.justify !== false }); break;
                case 'bullets': this.bullets(b.items.map(s => s.replace('{company}', this.co).replace('{klien}', this.d.kepadaNama)), { marker: b.marker ?? '-' }); break;
                case 'bulletCols': {
                    const colW = (TW - 12) / b.cols;
                    const rowsN = Math.ceil(b.items.length / b.cols);
                    this.ensure(rowsN * LH);
                    for (let r = 0; r < rowsN; r++) {
                        for (let c = 0; c < b.cols; c++) {
                            const it = b.items[r * b.cols + c]; if (!it) continue;
                            const x = ML + 12 + c * colW; this.font();
                            this.doc.text('•', x, this.y + LH * 0.72);
                            this.rich(it.replace('{company}', this.co), { x: x + 5, w: colW - 5, align: 'left', measureOnly: false });
                            this.y -= LH;
                        }
                        this.y += LH;
                    }
                    this.gap(1.5); break;
                }
                case 'kv': this.kv(b.rows, { labelW: b.labelW, marker: b.marker, indent: 6 }); break;
                case 'gap': this.gap(b.mm ?? 3); break;
                case 'pageBreak': this.newPage(); break;
            }
        }
    }

    // ─── TIPE 5: Surat Jadwal Kerja Fogging 12 Bulan (1 Halaman — PDF 0015 Ibu Dita) ──

    private renderFoggingScheduleLetter(totals: ReturnType<typeof calcTotals>) {
        const d = this.d, lh = this.lh;
        const tahun = d.jadwalFoggingTahun ?? d.tanggal.getFullYear();
        const rows = d.jadwalFoggingRows?.length ? d.jadwalFoggingRows : generateDefaultFoggingSchedule(tahun);
        const hargaPeriode = d.items[0]?.harga || totals.total || 550000;
        const lokasi = d.lokasiPekerjaan || d.kepadaAlamatLines.join(', ');

        this.font();
        this.doc.text(`No: ${d.noSurat}`, ML, this.y);
        this.doc.text(`${lh.kota ? lh.kota + ', ' : ''}${fmtDateID(d.tanggal)}`, PW - MR, this.y, { align: 'right' });
        this.gap(9);

        this.para('Kepada Yth.', { after: 0, justify: false });
        this.rich(`<b>${d.kepadaNama}</b>`, { align: 'left' });
        d.kepadaAlamatLines.forEach((l, i) => {
            const last = i === d.kepadaAlamatLines.length - 1;
            this.rich(last ? `<u>${l}</u>` : l, { align: 'left' });
        });
        if (d.kepadaUp) this.rich(`<b>Up: ${d.kepadaUp}</b>`, { align: 'left' });
        this.gap(5);

        const perihal = d.perihal || `Jadwal Kerja Pest Control (Fogging) Periode Januari ${tahun} – Desember ${tahun}`;
        this.rich(`<b>Perihal: ${perihal}</b>`, { align: 'left' });
        this.gap(5);

        this.para('Dengan hormat,', { after: 2, justify: false });
        this.para(
            d.paragrafPembuka ||
            `Dengan ini kami kirimkan jadwal kerja pest control untuk ${d.objekPekerjaan || 'rumah tinggal'} di <b>${lokasi}</b>, untuk <b>periode Januari s.d. Desember ${tahun}</b>. Biaya yang kami ajukan sebesar <b>Rp. ${idr(hargaPeriode)},- per periode.</b>`,
            { lh: 5.2, after: 4 }
        );

        // Tabel Jadwal 12 Bulan (NO | BULAN | TGL I | TGL II)
        const doc = this.doc;
        const x0 = ML;
        const cNo = 12, cBulan = 52, cT1 = 22, cT2 = 22;
        const totW = cNo + cBulan + cT1 + cT2;
        const hHead = 5.5, hRow = 5.2;

        // Header 2 tingkat: NO | BULAN | TGL (span I & II)
        doc.setLineWidth(0.35);
        doc.rect(x0, this.y, cNo, hHead * 2);
        doc.rect(x0 + cNo, this.y, cBulan, hHead * 2);
        doc.rect(x0 + cNo + cBulan, this.y, cT1 + cT2, hHead);
        doc.rect(x0 + cNo + cBulan, this.y + hHead, cT1, hHead);
        doc.rect(x0 + cNo + cBulan + cT1, this.y + hHead, cT2, hHead);

        this.font('bold', 9);
        doc.text('NO', x0 + cNo / 2, this.y + hHead + 1, { align: 'center' });
        doc.text('BULAN', x0 + cNo + cBulan / 2, this.y + hHead + 1, { align: 'center' });
        doc.text('TGL', x0 + cNo + cBulan + (cT1 + cT2) / 2, this.y + 3.8, { align: 'center' });
        doc.text('I', x0 + cNo + cBulan + cT1 / 2, this.y + hHead + 3.8, { align: 'center' });
        doc.text('II', x0 + cNo + cBulan + cT1 + cT2 / 2, this.y + hHead + 3.8, { align: 'center' });
        this.y += hHead * 2;

        this.font('normal', 9);
        for (const r of rows) {
            doc.rect(x0, this.y, cNo, hRow);
            doc.rect(x0 + cNo, this.y, cBulan, hRow);
            doc.rect(x0 + cNo + cBulan, this.y, cT1, hRow);
            doc.rect(x0 + cNo + cBulan + cT1, this.y, cT2, hRow);
            const by = this.y + 3.6;
            doc.text(String(r.no), x0 + cNo / 2, by, { align: 'center' });
            doc.text(r.bulan, x0 + cNo + 2, by);
            doc.text(r.tgl1, x0 + cNo + cBulan + cT1 / 2, by, { align: 'center' });
            doc.text(r.tgl2, x0 + cNo + cBulan + cT1 + cT2 / 2, by, { align: 'center' });
            this.y += hRow;
        }
        doc.setLineWidth(0.5);
        doc.rect(x0, this.y - (hHead * 2 + rows.length * hRow), totW, hHead * 2 + rows.length * hRow);
        this.gap(5);

        this.para('Khusus untuk jadwal kerja yang bertepatan dengan hari libur nasional akan kami jadwal ulang dengan pemberitahuan/konfirmasi melalui whatsapp atau surat.', { lh: 5, after: 3 });
        this.para('Demikian surat kami, atas perhatian dan kepercayaan yang diberikan, kami ucapkan terima kasih.', { lh: 5, after: 5, justify: false });

        this.para('Hormat kami,', { after: 0, justify: false });
        this.rich(`<b>${this.lh.companyName.toUpperCase()}</b>`, { align: 'left' });
        const sigH = 22;
        if (d.signatureBase64) {
            try {
                const sp = this.doc.getImageProperties(d.signatureBase64);
                const sw = 48, sh = Math.min(sigH - 2, (sw * sp.height) / sp.width);
                this.doc.addImage(d.signatureBase64, sp.fileType, ML, this.y + 1, sw, sh);
            } catch { /* lewati */ }
        }
        this.y += sigH;
        if (d.marketingNama) this.rich(`<b><u>${cleanPersonDisplayName(d.marketingNama)}</u></b>`, { align: 'left' });
    }

    // ─── Cover Letter Standar ────────────────────────────────────────────────

    private coverLetter(totals: ReturnType<typeof calcTotals>, isAR: boolean) {
        const d = this.d, lh = this.lh;
        this.font(); this.doc.text(`No: ${d.noSurat}`, ML, this.y);
        this.doc.text(`${lh.kota ? lh.kota + ', ' : ''}${fmtDateID(d.tanggal)}`, PW - MR, this.y, { align: 'right' });
        this.gap(11);

        this.para(d.kepadaUp && !d.kepadaNama ? '' : (isAR || d.tipeSurat !== 'perpanjangan' ? 'Kepada Yth.' : 'Kepada Yth,'), { after: 0, justify: false });
        this.rich(d.kepadaNama, { base: 'bold', align: 'left' });
        d.kepadaAlamatLines.forEach((l, i) => {
            const last = i === d.kepadaAlamatLines.length - 1 && d.kepadaAlamatLines.length > 1;
            this.rich(last ? `<u>${l}</u>` : l, { align: 'left' });
        });
        if (d.kepadaUp) {
            this.gap(2);
            this.rich(`Up : ${d.kepadaUp}`, { base: 'bold', align: 'left' });
        }
        this.gap(6);

        const basePerihal = d.perihal ?? LAYANAN_CONFIG[d.jenisLayanan]?.perihal ?? 'Penawaran Harga';
        const perihal = d.isRevisi && !basePerihal.toLowerCase().startsWith('revisi')
            ? `Revisi ${basePerihal}`
            : basePerihal;
        this.rich(`Perihal: <b><u>${perihal}</u></b>`, { align: 'left' });
        this.gap(7);

        const alamat = d.lokasiPekerjaan || d.kepadaAlamatLines.join(', ');
        const objek = d.objekPekerjaan;
        const LHB = 6.2;

        if (d.suratBlocks?.length) {
            this.blocks(d.suratBlocks);
        } else if (isAR) {
            const isRetreat = d.isRevisi || perihal.toLowerCase().includes('retreatment') || perihal.toLowerCase().includes('ulang');
            const jasa = d.jasaLabel ?? (isRetreat ? 'Jasa Anti Rayap Ulang (<i>Retreatment</i>)' : (JASA_LABEL[d.jenisLayanan] ?? 'Jasa Anti Rayap'));
            const surveyVerb = isRetreat ? 'melakukan survey ulang' : 'melakukan survey';
            this.para(
                d.paragrafPembuka ??
                `Kami ucapkan terima kasih telah memberikan kesempatan kepada kami <b>${this.co}</b> untuk ${surveyVerb} dan memberikan penawaran untuk pekerjaan <b>${jasa}</b>` +
                (objek ? ` pada bangunan <b>${objek}</b>` : '') +
                (alamat ? ` yang berlokasi di <b>${alamat}.</b>` : '.'),
                { lh: LHB, after: 4 }
            );
            const hari = d.masaBerlakuHari ?? 30;
            this.para(`<b>Surat penawaran ini berlaku selama ${hari} (${terbilang(hari).toLowerCase()}) hari sejak tanggal surat dibuat.</b>`, { lh: LHB, after: 4 });
            this.para('Mohon proposal ini dipelajari dan kami dengan senang hati membantu apabila masih ada hal-hal yang kurang jelas. Demikian proposal penawaran ini kami sampaikan, atas perhatian dan kerjasama Anda, kami ucapkan terima kasih.', { lh: LHB, after: 6 });
        } else if (d.pdfVariant === 'pco_rodent_survey_4p' || d.jenisLayanan === 'pest_rodent') {
            // Gaya Proposal Rodent Control (Contoh PDF 0009 UPTD Puskesmas Pisangan)
            this.para('Dengan hormat,', { after: 3, justify: false });
            this.para(
                d.paragrafPembuka ??
                `Terima kasih atas kesempatan yang diberikan kepada kami ${this.co} untuk mengajukan surat penawaran harga <b><i>Rodent Control</i> (Pengendalian Tikus)</b> di lingkungan <b>${objek || d.kepadaNama}</b> beralamat di <b>${alamat}.</b>`,
                { lh: LHB, after: 4 }
            );
            const hari = d.masaBerlakuHari ?? 30;
            this.para(`<b>Surat penawaran ini berlaku selama ${hari} (${terbilang(hari).toLowerCase()}) hari sejak tanggal surat dibuat.</b>`, { lh: LHB, after: 4 });
            this.para('Mohon proposal ini dipelajari dan kami dengan senang hati membantu apabila masih ada hal-hal yang kurang jelas. Demikian proposal penawaran ini kami sampaikan, atas perhatian dan kerjasama anda, kami ucapkan terima kasih.', { lh: LHB, after: 6 });
        } else {
            // Gaya Penawaran Pest & Rodent Korporat / PLN (Contoh PDF 0003 PLN UP3 Bulungan)
            this.para('Dengan hormat,', { after: 3, justify: false });
            const label = d.jasaLabel ?? '<i>pest</i> dan <i>rodent control</i>';
            const harga = d.ppn ? totals.total : totals.setelahDiskon;
            this.para(
                d.paragrafPembuka ??
                `Terima kasih atas kesempatan yang diberikan kepada kami ${this.co} untuk mengajukan surat penawaran harga <b>${label}</b> untuk lingkungan ${objek || d.kepadaNama}${alamat ? ` yang beralamat di ${alamat}` : ''}, berikut penawaran kami :`,
                { lh: 5.6, after: 3 }
            );
            this.para(`Berikut kami ajukan <b>penawaran harga pest dan rodent control adalah sebesar Rp ${idr(harga)},-</b>`, { lh: 5.6, after: 2, justify: false });
            this.para('<b>Rincian harga terlampir.</b>', { lh: 5.6, after: 2, justify: false });
            if (d.ppn) {
                this.para('<b>Harga tersebut di atas sudah termasuk PPN (sesuai peraturan yang berlaku).</b>', { after: 4, lh: 5.6, justify: false });
            }
            const hari = d.masaBerlakuHari ?? 30;
            this.para(`<b>Surat penawaran ini berlaku selama ${hari} (${terbilang(hari).toLowerCase()}) hari sejak tanggal surat dibuat.</b>`, { lh: 5.6, after: 5, justify: false });
            this.para('Demikian surat penawaran kami, atas perhatian dan persetujuan yang akan diberikan, kami ucapkan terima kasih.', { lh: 5.6, after: 6 });
        }

        // Salam & Tanda Tangan
        this.ensure(48);
        const defaultSalam = (isAR || d.pdfVariant === 'pco_rodent_survey_4p') ? 'Jabat Erat,' : 'Hormat kami,';
        this.para(d.salam ?? defaultSalam, { after: 0, justify: false });
        this.rich(this.co, { base: 'bold', align: 'left' });
        const sigH = 26;
        if (d.signatureBase64) {
            try {
                const sp = this.doc.getImageProperties(d.signatureBase64);
                const sw = 52, sh = Math.min(sigH - 2, (sw * sp.height) / sp.width);
                this.doc.addImage(d.signatureBase64, sp.fileType, ML, this.y + 1, sh < (sw * sp.height) / sp.width ? (sh * sp.width) / sp.height : sw, sh);
            } catch { /* lewati */ }
        }
        if (!isAR && d.pdfVariant !== 'pco_rodent_survey_4p' && d.marketingNama) {
            this.y += sigH;
            this.rich(`<b><u>${cleanPersonDisplayName(d.marketingNama)}</u></b>`, { align: 'left' });
        }
    }

    // ─── Anti Rayap Detail (Mendukung Tipe 1: 8 Hal & Tipe 2: Pasca/Retreatment + Rumus Volume) ──

    private arDetail(totals: ReturnType<typeof calcTotals>) {
        const d = this.d;
        const isPra8Page = d.pdfVariant === 'ar_pra_profile_8p' || d.jenisLayanan === 'anti_rayap_soil';

        // Jika Tipe 1 (Pra-Konstruksi + Pipa 8 Halaman seperti PDF 0005 Oreka), sisipkan halaman Edukasi, Company Profile & Metode Pra-Konstruksi terlebih dahulu
        if (isPra8Page) {
            this.newPage();
            this.blocks(edukasiDanProfilPraKonstruksi(this.co));

            // Halaman Sistem Pemipaan + Termitisida (Halaman 6 pada PDF 0005)
            this.newPage();
            const hasPipa = d.items.some(it => it.desc.toLowerCase().includes('pipa'));
            if (hasPipa || d.jenisLayanan === 'anti_rayap_pipanisasi') {
                this.heading('Sistem Pemipaan (Tanpa Garansi) :');
                this.bullets(['Melakukan pemasangan jalur pipa pada kiri dan kanan tapak bangunan sebelum pemasangan lantai kerja.'], { marker: '-' });
                this.gap(3);
            }

            this.heading('TERMITISIDA/PESTISIDA');
            this.para('Setelah melakukan inspeksi lapangan, maka berikut adalah termitisida yang akan kami gunakan:', { justify: false, after: 1.5 });
            const chemsPra = d.chemicals?.length ? d.chemicals : [{ bahanAktif: 'Cypermethrin', merkDagang: 'Cypergard 100 EC' }];
            this.table([TW * 0.5, TW * 0.5], chemsPra.map(c => [{ text: c.bahanAktif, italic: true }, c.merkDagang] as Cell[]), {
                head: ['Bahan Aktif', 'Merk Dagang'], headFill: '#8EAADB', size: 9.5, minH: 5.8,
            });
        }

        // Halaman Hasil Survey
        this.newPage();
        if (d.surveyor || d.tanggalSurvey || d.hasilSurvey) {
            this.heading('HASIL SURVEY');
            const rows: [string, string][] = [];
            if (d.tanggalSurvey) rows.push(['Tanggal Survey', fmtDateID(d.tanggalSurvey)]);
            if (d.surveyor) rows.push(['Surveyor', cleanPersonDisplayName(d.surveyor)]);
            if (d.tanggalSurvey) {
                rows.push(['Hari/Tanggal', `${title(d.tanggalSurvey.toLocaleDateString('id-ID', { weekday: 'long', timeZone: DOC_TIMEZONE }))} / ${fmtDateID(d.tanggalSurvey)}`]);
            }
            if (d.hasilSurvey) rows.push(['Hasil Survey', d.hasilSurvey]);
            this.kv(rows, { labelW: 26, marker: '', indent: 0 });
            this.gap(1);
        }
        if (d.surveyPhotos?.length) this.surveyPhotos(d.surveyPhotos);

        // Jika bukan mode 8 halaman Pra-Konstruksi, cetak Metode / Solusi & Termitisida setelah Hasil Survey (sesuai PDF 0022 Bank Victoria)
        if (!isPra8Page) {
            const metode = (d.metode?.length ? d.metode : METODE_BY_LAYANAN[d.jenisLayanan]) ?? [];
            this.heading(d.isRevisi ? 'Solusi' : 'Metode Pelaksanaan');
            this.para(
                d.metodeIntro ??
                'Dari survey yang dilakukan, kami menyimpulkan bahwa metode pengendalian yang perlu dilakukan adalah dengan menerapkan <b>BARIER SYSTEM – Paska Konstruksi</b>. Berikut adalah rinciannya :'
            );
            this.bullets(metode, { marker: '-' });
            this.gap(2);

            this.heading('TERMITISIDA/PESTISIDA');
            this.para('Termitisida yang akan kami gunakan adalah:', { justify: false, after: 1 });
            const chems = d.chemicals?.length ? d.chemicals : DEFAULT_CHEMICALS_AR;
            this.table([TW * 0.5, TW * 0.5], chems.map(c => [{ text: c.bahanAktif, italic: true }, c.merkDagang] as Cell[]), {
                head: ['Bahan Aktif', 'Merk Dagang'], headFill: '#8EAADB', size: 9.5, minH: 5.6,
            });
        }

        // Bagian BIAYA PELAKSANAAN
        this.ensure(55);
        this.heading('BIAYA PELAKSANAAN');

        // Tabel Rincian Perhitungan Volume (jika ada item yang memiliki volumeFormula seperti PDF 0022 Bank Victoria)
        const formulaItems = d.items.filter(it => it.volumeFormula && it.volumeFormula.trim() !== '');
        if (formulaItems.length > 0) {
            this.para('Berdasarkan hasil survey dan setelah dilakukan perhitungan volume, dengan rincian sebagai berikut:', { justify: false, after: 1.5 });
            const fCols = [TW * 0.25, TW * 0.04, TW * 0.50, TW * 0.04, TW * 0.17];
            const fRows: Cell[][] = formulaItems.map(it => [
                it.desc,
                { text: '=', align: 'center' },
                normalizeVolumeFormulaDisplay(it.volumeFormula!),
                { text: '=', align: 'center' },
                { vol: [dec(it.qty), it.unit] },
            ]);
            this.table(fCols, fRows, { size: 9, minH: 5.8 });
            this.para('Berikut penawaran harga yang kami ajukan:', { justify: false, after: 1.5 });
        } else {
            this.para(`Berdasarkan hasil survey, berikut penawaran harga yang kami ajukan:`, { justify: false, after: 1.5 });
        }

        const colsW = [TW * 0.42, TW * 0.16, TW * 0.19, TW * 0.23];
        const money = (n: number, prefix = 'Rp.'): CellObj => ({ money: idr(n), prefix });
        const rows: Cell[][] = d.items.map(it => [
            it.desc,
            { vol: [dec(it.qty), it.unit] },
            { money: idr(it.harga), prefix: 'Rp.' },
            money(it.qty * it.harga),
        ] as Cell[]);

        const lab = (t: string): Cell => ({ text: t, span: 3, align: 'right', bold: true });
        const hasUpahPct = (d.upahPeralatanPct ?? 0) > 0;
        const hasDiskonUpah = (d.diskonUpahPct ?? 0) > 0;
        const hasExtra = (d.biayaTambahan?.length ?? 0) > 0 || hasUpahPct || totals.diskonRp > 0;

        if (hasExtra) {
            rows.push([lab('Total'), { ...money(totals.subtotal), bold: true } as Cell]);
            if (hasUpahPct) {
                rows.push([lab(`Upah & Peralatan Kerja ${d.upahPeralatanPct}%`), { ...money(totals.upahPeralatanRp), bold: true } as Cell]);
            }
            if (hasDiskonUpah) {
                rows.push([
                    lab(`(Diskon Upah & Peralatan Kerja ${d.diskonUpahPct}%)`),
                    { money: idr(totals.diskonUpahRp), prefix: '(Rp.', suffix: ')', bold: true } as Cell,
                ]);
            }
            (d.biayaTambahan ?? []).forEach(b => rows.push([lab(b.label), { ...money(b.amount), bold: true } as Cell]));
            if (totals.diskonRp > 0) {
                rows.push([lab('Diskon'), { ...money(totals.diskonRp), bold: true } as Cell]);
            }
            rows.push([lab('Total Biaya'), { ...money(totals.setelahDiskon), bold: true } as Cell]);
        } else {
            rows.push([lab('Total Biaya'), { ...money(totals.subtotal), bold: true } as Cell]);
        }

        if (d.ppn) {
            if (totals.dpp != null) rows.push([lab('DPP Nilai Lain x 11/12'), { ...money(totals.dpp), bold: true } as Cell]);
            rows.push([lab('PPN'), { ...money(totals.ppnRp), bold: true } as Cell]);
            rows.push([lab('Total Biaya'), { ...money(totals.total), bold: true } as Cell]);
        }

        this.table(colsW, rows, {
            head: d.biayaHeaders ?? ['Pekerjaan', 'Volume Kerja', 'Harga', 'Biaya'],
            headFill: '#A9D08E',
            size: 9.5,
            minH: 6.2,
        });

        const defaultTaxNote = d.ppn
            ? '<b>*Harga tersebut di atas sudah termasuk PPN (sesuai ketentuan yang berlaku).</b>'
            : '<b>*Biaya tersebut di atas belum termasuk PPN.</b>';
        this.rich(d.catatanPajak ?? defaultTaxNote, { align: 'left', size: 9.5 });
        this.gap(4);

        this.heading('PEMBAYARAN');
        this.para('Pembayaran dilakukan 2 (dua) tahap, yaitu:', { justify: false, after: 1 });
        this.bullets(d.skemaPembayaran ?? PEMBAYARAN_AR_DUA_TAHAP, { marker: '•' });
        this.gap(2);

        // GARANSI (Mendukung Custom Tahun maupun Bulan, misal 2 Tahun, 6 Bulan, 18 Bulan, 5 Tahun)
        const gNilai = d.garansiNilai ?? d.garansiTahun ?? (isPra8Page ? 5 : 3);
        const gUnit = d.garansiUnit ?? 'tahun';
        if (gNilai > 0) {
            const durasiTxt = formatWarrantyDurationText(gNilai, gUnit, isPra8Page);
            this.heading('GARANSI');
            if (isPra8Page) {
                this.para(
                    `Untuk pekerjaan anti rayap ini, kami memberikan garansi bebas rayap yang dinyatakan dalam Sertifikat jaminan sesuai standard Dep.PU.SK. SNI 03-2404-2000, yaitu: <b>Selama ${durasiTxt} untuk area tanah yang dianti rayap, terhitung selambat-lambatnya 1 tahun sejak pekerjaan dimulai.</b>`,
                    { after: 2 }
                );
            } else {
                this.para(
                    `Untuk pekerjaan Anti Rayap ini, kami memberikan garansi bebas rayap yang dinyatakan dalam sertifikat jaminan sesuai standard Dep.PU.SK. SNI 03-2404-2000, yaitu: Selama <b>${durasiTxt},</b> terhitung sejak pekerjaan anti rayap selesai secara keseluruhan.`,
                    { after: 2 }
                );
            }
            this.para(`<b>${d.garansiCatatan ?? 'Garansi tidak termasuk penggantian barang/material yang dirusak oleh serangan rayap.'}</b>`, { after: 3, justify: false });
        }

        if (d.tampilkanPengontrolan !== false && gNilai > 0) {
            this.heading('PENGONTROLAN');
            this.bullets(d.pengontrolan ?? PENGONTROLAN_AR, { marker: '•' });
            this.gap(2);
        }
        this.penutup();
    }

    private surveyPhotos(photos: { base64: string; caption?: string }[], perRow = 2) {
        const cw = TW / perRow, ph = perRow === 4 ? 36 : 48;
        this.ensure(10);
        this.table([TW], [], { head: ['Dokumentasi Survey'], size: 9.5, minH: 6 });
        this.y -= 3;
        for (let i = 0; i < photos.length; i += perRow) {
            const group = photos.slice(i, i + perRow);
            const h = ph + 7;
            this.ensure(h);
            for (let k = 0; k < perRow; k++) {
                const p = group[k];
                const x = ML + k * cw;
                this.doc.setDrawColor('#000000'); this.doc.setLineWidth(0.25); this.doc.rect(x, this.y, cw, h);
                if (p?.base64) {
                    try {
                        const props = this.doc.getImageProperties(p.base64);
                        const r = Math.min((cw - 4) / props.width, ph / props.height);
                        const w = props.width * r, hh = props.height * r;
                        this.doc.addImage(p.base64, props.fileType, x + (cw - w) / 2, this.y + 1.5 + (ph - hh) / 2, w, hh);
                    } catch { /* lewati */ }
                    if (p.caption) { this.font('normal', 8); this.doc.text(p.caption, x + cw / 2, this.y + h - 1.8, { align: 'center' }); }
                }
            }
            this.y += h;
        }
        this.gap(4);
    }

    private penutup() {
        const d = this.d;
        this.ensure(34);
        this.heading('PENUTUP');
        this.para('Demikian proposal penawaran harga dan lampiran ini kami sampaikan. Apabila informasi yang kami berikan belum memuaskan, kami siap memberikan presentasi di hadapan Bapak/Ibu. Untuk selanjutnya dapat menghubungi kami :');
        const rawName = d.surveyor || d.marketingNama || '';
        const cleanedName = cleanPersonDisplayName(rawName);
        const contactName = cleanedName || 'Whatsapp Kantor';
        const contactPhone = d.marketingWa || d.kontakWa || COMPANY.wa.replace(/ /g, '-');
        const rows: [string, string][] = [
            ['Kantor', d.kontakKantor ?? COMPANY.telp],
            [d.marketingWa && (d.surveyor || d.marketingNama) ? contactName : 'Whatsapp Kantor', contactPhone],
        ];
        this.kv(rows, { marker: '•', boldAll: true });
        this.para('Atas perhatian dan kerja sama yang diberikan kami ucapkan terima kasih.', { justify: false });
    }

    // ─── TIPE 3: Proposal Rodent Control Berbasis Survey (PDF 0009 Puskesmas Pisangan) ──

    private renderRodentSurveyProposal(totals: ReturnType<typeof calcTotals>) {
        const d = this.d;
        this.newPage();

        // HASIL SURVEY
        this.heading('HASIL SURVEY');
        const sRows: [string, string][] = [];
        if (d.tanggalSurvey) {
            sRows.push(['Hari/Tanggal', `${title(d.tanggalSurvey.toLocaleDateString('id-ID', { weekday: 'long', timeZone: DOC_TIMEZONE }))} / ${fmtDateID(d.tanggalSurvey)}`]);
        }
        if (d.surveyor) sRows.push(['Surveyor', cleanPersonDisplayName(d.surveyor)]);
        sRows.push(['Hasil Survey', d.hasilSurvey || 'Kami menemukan indikasi kendala tikus.']);
        this.kv(sRows, { labelW: 26, marker: '', indent: 0 });

        if (d.surveyPhotos?.length) {
            this.surveyPhotos(d.surveyPhotos, Math.min(4, Math.max(2, d.surveyPhotos.length)));
        }

        // A. Area Pekerjaan
        this.heading('A.  Area Pekerjaan');
        this.para('1.  Area <i>Indoor</i> dan <i>Outdoor</i>', { indent: 6, justify: false, after: 2 });

        // B. Tujuan Pengendalian Hama
        this.heading('B.  Tujuan Pengendalian Hama');
        this.bullets([
            '1. Menekan populasi hama hingga pada titik tidak mengganggu untuk di area <i>indoor</i> dan <i>outdoor</i>.',
            '2. Mengupayakan <i>Zero Pest</i> pada area krusial seperti Area Dapur dan Bangunan Kantor.',
            '3. Memproteksi area dari serangan hama dan vektor dengan segala dampak negatifnya.',
        ], { marker: '', indent: 6, hang: 0 });

        // C. Hama yang dikendalikan
        this.heading('C.  Hama yang dikendalikan');
        this.table([TW * 0.18, TW * 0.82], [
            ['Tikus', { text: '<i>Mus musculus, Rattus rattus, Bandicotaindica, Rattus norvegicus, Rattus diardei, Rattus tiomanicus</i>' }],
        ], { size: 9.5, minH: 6 });

        // D. Program Kerja
        this.heading('D.  Program Kerja');
        this.rich('<b>1.  Inspeksi</b>', { x: ML + 6 });
        this.para('Metode paling awal yang dilaksanakan secara rutin guna mendapatkan data untuk laporan dan analisa terkait hasil upaya manajemen hama yang dilakukan. Hasil analisa akan menjadi rekomendasi untuk melakukan tindakan lanjutan atau menjadi rekomendasi yang dapat dilakukan oleh pemilik area atau gedung.', { indent: 12, after: 3 });

        this.rich('<b>2.  Planning</b>', { x: ML + 6 });
        this.gap(1);
        this.table([10, 52, 68, TW - 130], [
            [{ text: 'Area Outdoor', span: 4, bold: true, align: 'left' }],
            [{ text: '1', align: 'center' }, 'Ekslusi/Menutup Akses', 'Area luar bangunan', 'Tikus'],
            [{ text: '2', align: 'center' }, '<i>Baiting/Trapping</i>', 'Area luar bangunan', 'Tikus'],
            [{ text: 'Area Indoor', span: 4, bold: true, align: 'left' }],
            [{ text: '1', align: 'center' }, 'Ekslusi/Menutup Akses', 'Area dalam bangunan', 'Tikus'],
            [{ text: '2', align: 'center' }, '<i>Baiting/Trapping</i>', 'Plafon dan area rawan tikus', 'Tikus'],
        ], { size: 9, minH: 5.5 });

        this.rich('<b>3.  Keterangan Jenis Pekerjaan</b>', { x: ML + 6 });
        this.kv([
            ['Ekslusi', 'Penutupan celah atau lubang yang berpotensi menjadi akses masuk hama seperti Tikus.'],
            ['<i>Trapping</i>', 'Pemasangan alat perangkap pada area yang berpotensi menjadi target infestasi hama. <i>Glue Trapping</i> untuk tikus.'],
            ['<i>Baiting</i>', 'Melaksanakan pengumpanan dengan rodentisida untuk mengendalikan tikus di area luar.'],
        ], { labelW: 26, marker: '', indent: 12 });

        this.rich('<b>4.  Teknis Kerja</b>', { x: ML + 6 });
        this.kv([
            ['Inspeksi', 'Inspeksi alat kerja dan ceklis inspeksi'],
            ['Pengendalian Fisik', '<i>Trapping</i> untuk perlakuan pengendalian hama secara fisik tanpa menggunakan bahan kimia'],
            ['Pengendalian Kimiawi', 'Penggunaan <i>rodentisida</i> di area luar'],
        ], { labelW: 36, marker: '•', indent: 12 });

        this.rich('<b>5.  Jenis Pekerjaan</b>', { x: ML + 6 });
        this.bullets(['Rodent Control dengan metode <i>trapping</i> dan <i>baiting</i> menggunakan lem dan rodentisida dengan pengecekan rutin.'], { marker: '•', indent: 12 });

        const jmlKunjungan = d.kunjunganPerBulan ?? d.items[0]?.qty ?? 3;
        this.rich('<b>6.  Sistem Operasional</b>', { x: ML + 6 });
        this.kv([
            ['a. Sistem Kerja', `Visit, ${jmlKunjungan} (${terbilang(jmlKunjungan).toLowerCase()}) kali kunjungan per bulan (per 1 minggu sekali)`],
            ['b. Hari dan Jam Kerja', 'Akan diatur bersama agar tidak mengganggu kenyamanan.'],
        ], { labelW: 36, marker: '', indent: 12 });

        // E. Biaya Pekerjaan
        this.ensure(65);
        this.heading('E.  Biaya Pekerjaan');
        this.para('<b>Program General Pest Control yang kami tawarkan adalah program dengan kontrak 12 bulan (Satu Tahun) dengan pembayaran dilakukan setiap bulannya,</b> berikut adalah biaya pekerjaannya :');

        const hargaVisit = d.items[0]?.harga ?? 750000;
        const totalBulan = totals.subtotal || jmlKunjungan * hargaVisit;
        this.table([TW * 0.18, TW * 0.34, TW * 0.25, TW * 0.23], [
            [
                { text: 'Tikus', align: 'center', fill: '#FCE4D6' },
                { text: 'Disesuaikan kondisi lapangan :\n•  Ekslusi\n•  <i>Trapping</i>\n•  <i>Baiting</i>', fill: '#FCE4D6' },
                { text: `${jmlKunjungan} kali kunjungan per bulan\n\n@Rp ${idr(hargaVisit)} per kunjungan`, align: 'center', fill: '#FCE4D6' },
                { text: `Rp   ${idr(totalBulan)},-`, align: 'right', fill: '#FCE4D6' },
            ],
            [
                { text: 'Total per bulan', span: 3, align: 'right', bold: true, fill: '#FCE4D6' },
                { text: `Rp   ${idr(totalBulan)},-`, align: 'right', bold: true, fill: '#FCE4D6' },
            ],
        ], {
            head: ['Hama Sasaran', 'Metode', 'Kunjungan', 'Biaya per bulan'],
            headFill: '#ED7D31',
            headTextWhite: true,
            size: 9.5,
            minH: 7,
        });

        this.para('Keterangan :', { justify: false, after: 1 });
        this.bullets([
            '1. Harga belum termasuk PPN sesuai peraturan yang berlaku.',
            '2. Pembayaran dilakukan setiap bulannya maksimal 14 hari kerja setelah invoice diterima.',
            `3. Pada dasarnya ${this.co} tidak dapat memberikan garansi hama akan habis atau hilang di area tersebut, tapi akan terus diupayakan untuk menekan tingkat populasi hama hingga ambang batas optimal.`,
        ], { marker: '', indent: 6, hang: 0 });
        this.gap(3);
        this.penutup();
    }

    // ─── TIPE 4: Pest & Rodent Control Korporat / BOQ (PDF 0003 PLN Bulungan & 0333 PLN Jatinegara) ──

    private pcoDetail(totals: ReturnType<typeof calcTotals>) {
        const d = this.d;
        if (d.pdfVariant === 'pco_rodent_survey_4p') {
            this.renderRodentSurveyProposal(totals);
            return;
        }

        const programs: PdfBlock[][] = d.programs ??
            (d.jenisLayanan === 'pest_rodent'
                ? [programRodentStandalone()]
                : [[...programPest(this.co), { t: 'gap', mm: 4 }, ...programRodentKontrak(this.co)]]);

        this.newPage();
        this.heading('Metode Pelaksanaan');
        this.para('Berikut metode pelaksanaan dan perincian biaya yang kami ajukan:', { justify: false, after: 2 });
        programs.forEach((p, i) => {
            if (i > 0) this.gap(3);
            this.blocks(p);
        });

        // Tabel Biaya Pengendalian (gaya PDF 0003 PLN Bulungan: No | Uraian | Volume | Satuan | Harga Satuan | Jumlah)
        this.ensure(55);
        this.heading('Biaya pengendalian');
        this.para('Berikut kami ajukan penawaran harga untuk <b>Pekerjaan <i>Pest</i> dan <i>Rodent Control</i></b> :', { justify: false, after: 1.5 });

        const cols = [10, 56, 20, 20, 28, 30];
        const rows: Cell[][] = d.items.map((it, i) => [
            { text: String(i + 1), align: 'center' },
            it.desc,
            { text: dec(it.qty), align: 'center' },
            { text: it.unit, align: 'center' },
            { money: idr(it.harga), prefix: 'Rp' },
            { money: idr(it.qty * it.harga), prefix: 'Rp' },
        ] as Cell[]);

        const lab = (t: string): Cell => ({ text: t, span: 5, align: 'right', bold: true });
        const val = (n: number): Cell => ({ money: idr(n), prefix: 'Rp', bold: true } as Cell);

        rows.push([lab('Jumlah'), val(totals.subtotalGross)] as Cell[]);
        if (totals.diskonRp > 0) {
            rows.push([lab(`Diskon (${d.diskonPct}%)`), val(totals.diskonRp)] as Cell[]);
        }
        if (d.ppn) {
            if (totals.dpp != null) {
                rows.push([lab('DPP Nilai Lain x 11/12'), val(totals.dpp)] as Cell[]);
                rows.push([lab('PPN 12%'), val(totals.ppnRp)] as Cell[]);
            } else {
                rows.push([lab('PPN 11%'), val(totals.ppnRp)] as Cell[]);
            }
        }
        rows.push([lab('Total'), val(totals.total)] as Cell[]);

        this.table(cols, rows, {
            head: ['No', 'Uraian', 'Volume', 'Satuan', 'Harga Satuan', 'Jumlah'],
            headFill: '#E2EFDA',
            size: 9.5,
            minH: 6,
        });

        this.gap(3);
        this.heading('Sistem pembayaran:');
        this.para(
            d.sistemPembayaran ??
            `Untuk sistem pembayaran pengendalian tersebut di atas dilakukan per periode setelah pekerjaan selesai dilakukan disertai kwitansi tagihan atau mengikuti ketentuan ${d.kepadaNama}.`
        );
    }

    // ─── Lampiran ────────────────────────────────────────────────────────────

    private lampiran() {
        for (const [i, p] of (this.d.lampiranPages ?? []).entries()) {
            this.newPage();
            this.heading(`LAMPIRAN ${i + 1}${p.caption ? ` — ${p.caption}` : ''}`);
            try {
                const props = this.doc.getImageProperties(p.base64);
                const maxW = TW, maxH = BOTTOM - this.y - 4;
                const r = Math.min(maxW / props.width, maxH / props.height);
                const w = props.width * r, h = props.height * r;
                this.doc.addImage(p.base64, props.fileType, ML + (maxW - w) / 2, this.y, w, h);
            } catch { this.para('(gambar lampiran tidak dapat dimuat)'); }
        }
    }

    render(): Blob {
        const d = this.d;
        const isAR = isAntiRayap(d.jenisLayanan);
        const totals = calcTotals({
            items: d.items,
            biayaTambahan: d.biayaTambahan,
            upahPeralatanPct: d.upahPeralatanPct,
            diskonUpahPct: d.diskonUpahPct,
            diskonPct: d.diskonPct,
            ppn: d.ppn,
            ppnDppFaktor: d.ppnDppFaktor,
        });

        // Mode Tipe 5: Surat Jadwal Kerja Fogging 12 Bulan (1 Halaman - PDF 0015 Ibu Dita)
        if (d.pdfVariant === 'pco_jadwal_fogging_1p' || d.tipeSurat === 'jadwal_fogging') {
            this.chrome();
            this.renderFoggingScheduleLetter(totals);
        } else {
            this.chrome();
            this.coverLetter(totals, isAR);
            if (!d.suratSaja) {
                if (isAR) this.arDetail(totals); else this.pcoDetail(totals);
                this.lampiran();
            }
        }

        // Watermark Tanda Air untuk Surat Draft (Belum di-ACC)
        const isDraftDoc = d.isDraft || d.noSurat.includes('-DRF');
        if (isDraftDoc) {
            const pageCount = (this.doc as any).internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                this.doc.setPage(i);
                this.doc.setFont('helvetica', 'bold');
                this.doc.setFontSize(28);
                this.doc.setTextColor(203, 213, 225);
                this.doc.text('DRAFT - BELUM DI-ACC', 105, 148, { align: 'center', angle: 45 });
            }
        }

        return this.doc.output('blob');
    }
}

export function renderQuotationLetter(data: QuotationPDFData): Blob {
    return new Renderer(data).render();
}

export { programPest, programRodentKontrak, programRodentStandalone, edukasiDanProfilPraKonstruksi };
