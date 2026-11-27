/**
 * Template dokumen PER PERUSAHAAN — diatur oleh admin masing-masing perusahaan (Menu "Template & Pengaturan"),
 * disimpan di company_settings.settings.documents, dan dipakai semua generator PDF (penawaran, laporan kunjungan).
 *
 * Prinsip:
 *  - Data tersimpan adalah masukan TAK TEPERCAYA (bisa rusak / ditulis manual) → selalu lewat sanitizeTemplates().
 *  - Nilai yang dikirim eksplisit oleh pemanggil (mis. field penawaran) SELALU menang atas template.
 *  - Template tidak pernah memuat nama perusahaan lain: teks bawaan memakai placeholder {company} / {klien}.
 */
import type { QuotationPDFData } from './pdfGenerator';
import type { Letterhead } from './quotationLetterPdf';
import { isAntiRayap } from './quotationConfig';
import {
    PdfBlock, programPest, programRodentKontrak, programRodentStandalone,
    PENGONTROLAN_AR, PEMBAYARAN_AR_DUA_TAHAP,
} from './quotationTemplates';

// ─── Tipe ────────────────────────────────────────────────────────────────────

export interface FooterLogo { src: string; widthMm: number }

export interface LetterheadTemplate {
    /** 'image' = pakai gambar kop (logo/lockup) · 'text' = nama merek + tagline berupa teks. */
    mode: 'image' | 'text';
    headerLogo: string;          // data URL gambar kop
    headerLogoWidthMm: number;
    brandName: string;           // kosong → nama perusahaan
    tagline: string;
    brandColor: string;
    footerLogos: FooterLogo[];   // logo asosiasi/sertifikasi (maks. 3)
    footerLines: string[];       // kosong → disusun otomatis dari kontak perusahaan
}

export interface SuratTemplate {
    masaBerlakuHari: number;
    salamAntiRayap: string;
    salamPest: string;
    kontakKantor: string;        // kosong → telp perusahaan
    kontakWa: string;            // kosong → WA perusahaan
    signatureImage: string;      // tanda tangan + stempel bawaan (data URL, opsional)
}

export interface AntiRayapTemplate {
    skemaPembayaran: string[];
    pengontrolan: string[];
    tampilkanPengontrolan: boolean;
    garansiTahun: number;
    garansiCatatan: string;
    catatanPajak: string;        // kosong → kalimat bawaan
}

/** Program pest/rodent disimpan sebagai MARKUP TEKS (lihat markupToBlocks) agar mudah diedit di satu kotak teks. */
export interface PestTemplate {
    programPest: string;
    programRodentKontrak: string;
    programRodentStandalone: string;
    sistemPembayaran: string;
}

export interface LaporanTemplate {
    judul: string;               // "LAPORAN KUNJUNGAN"
    jenisPekerjaan: string;      // "Treatment"
    saranDefault: string;
    tampilkanFooter: boolean;    // baris "created by: ... datetime: ..."
}

export interface DocumentTemplates {
    version: 1;
    letterhead: LetterheadTemplate;
    surat: SuratTemplate;
    antiRayap: AntiRayapTemplate;
    pest: PestTemplate;
    laporan: LaporanTemplate;
}

/** Identitas perusahaan (dari company_settings) yang dipakai menyusun kop & isi dokumen. */
export interface CompanyIdentity {
    companyName: string;
    companyTagline?: string;
    headOffice: string;
    branchOffice?: string;
    telp: string;
    wa: string;
    email: string;
    website: string;
    kota?: string;
}

// ─── Markup program: teks ↔ PdfBlock ─────────────────────────────────────────
//   # Judul            judul program          #_ Judul     judul bergaris bawah
//   ## Sub-judul       sub-judul tebal        ### Teks     tebal-miring
//   - butir            daftar (berurutan digabung)
//   -2 a | b | c       daftar 2 kolom         -1 a | b     daftar 1 kolom
//   @Label | isi       baris label:isi (dengan "-")        @@Label | isi  (tanpa "-")
//   (baris kosong)     jarak                  ---          halaman baru
//   lainnya            paragraf. Tag <b> <i> <u> boleh dipakai. Placeholder: {company} {klien}

export function markupToBlocks(text: string): PdfBlock[] {
    const blocks: PdfBlock[] = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const lastOf = <T extends PdfBlock['t']>(t: T) => {
        const l = blocks[blocks.length - 1];
        return l && l.t === t ? (l as Extract<PdfBlock, { t: T }>) : undefined;
    };
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.trim() === '') { if (blocks.length && lastOf('gap') === undefined) blocks.push({ t: 'gap' }); continue; }
        let m: RegExpMatchArray | null;
        if (line.trim() === '---') blocks.push({ t: 'pageBreak' });
        else if ((m = line.match(/^#_\s+(.*)$/))) blocks.push({ t: 'title', text: m[1], underline: true });
        else if ((m = line.match(/^###\s+(.*)$/))) blocks.push({ t: 'sub', text: m[1] });
        else if ((m = line.match(/^##\s+(.*)$/))) blocks.push({ t: 'h', text: m[1] });
        else if ((m = line.match(/^#\s+(.*)$/))) blocks.push({ t: 'title', text: m[1] });
        else if ((m = line.match(/^-([12])\s+(.*)$/))) {
            blocks.push({ t: 'bulletCols', cols: Number(m[1]), items: m[2].split('|').map(x => x.trim()).filter(Boolean) });
        } else if ((m = line.match(/^-\s+(.*)$/))) {
            const l = lastOf('bullets');
            if (l) l.items.push(m[1]); else blocks.push({ t: 'bullets', items: [m[1]], marker: '-' });
        } else if ((m = line.match(/^(@@?)\s*([^|]+)\|\s*(.*)$/))) {
            const marker = m[1] === '@@' ? '' : '-';
            const l = lastOf('kv');
            const row: [string, string] = [m[2].trim(), m[3].trim()];
            if (l && (l.marker ?? '-') === marker) l.rows.push(row);
            else blocks.push({ t: 'kv', rows: [row], marker });
        } else blocks.push({ t: 'p', text: line.trim() });
    }
    // lebar kolom label: sesuai label terpanjang (≈1.9 mm/huruf pada 10 pt), dibatasi 14–60 mm
    for (const b of blocks) if (b.t === 'kv') b.labelW = Math.min(60, Math.max(14, Math.max(...b.rows.map(r => r[0].length)) * 1.9 + 4));
    return blocks;
}

export function blocksToMarkup(blocks: PdfBlock[]): string {
    const out: string[] = [];
    for (const b of blocks) {
        switch (b.t) {
            case 'title': out.push(`${b.underline ? '#_' : '#'} ${b.text}`); break;
            case 'h': out.push(`## ${b.text}`); break;
            case 'sub': out.push(`### ${b.text}`); break;
            case 'p': out.push(b.text); break;
            case 'bullets': b.items.forEach(i => out.push(`- ${i}`)); break;
            case 'bulletCols': out.push(`-${b.cols === 2 ? 2 : 1} ${b.items.join(' | ')}`); break;
            case 'kv': b.rows.forEach(([k, v]) => out.push(`${(b.marker ?? '-') === '' ? '@@' : '@'}${k} | ${v}`)); break;
            case 'gap': out.push(''); break;
            case 'pageBreak': out.push('---'); break;
        }
    }
    return out.join('\n');
}

const fillBlock = (b: PdfBlock, company: string, klien: string): PdfBlock => {
    const f = (s: string) => s.replace(/\{company\}/g, company).replace(/\{klien\}/g, klien);
    switch (b.t) {
        case 'title': case 'h': case 'sub': case 'p': return { ...b, text: f(b.text) };
        case 'bullets': case 'bulletCols': return { ...b, items: b.items.map(f) };
        case 'kv': return { ...b, rows: b.rows.map(([k, v]) => [f(k), f(v)] as [string, string]) };
        default: return b;
    }
};

// ─── Default ─────────────────────────────────────────────────────────────────

/** Template bawaan NETRAL — tanpa nama/alamat perusahaan mana pun. */
export function defaultDocumentTemplates(): DocumentTemplates {
    return {
        version: 1,
        letterhead: {
            mode: 'text', headerLogo: '', headerLogoWidthMm: 70, brandName: '', tagline: '',
            brandColor: '#1a5c38', footerLogos: [], footerLines: [],
        },
        surat: {
            masaBerlakuHari: 30, salamAntiRayap: 'Jabat Erat,', salamPest: 'Hormat kami,',
            kontakKantor: '', kontakWa: '', signatureImage: '',
        },
        antiRayap: {
            skemaPembayaran: [...PEMBAYARAN_AR_DUA_TAHAP], pengontrolan: [...PENGONTROLAN_AR],
            tampilkanPengontrolan: false, garansiTahun: 3, garansiCatatan: '', catatanPajak: '',
        },
        pest: {
            programPest: blocksToMarkup(programPest('{company}')),
            programRodentKontrak: blocksToMarkup(programRodentKontrak('{company}')),
            programRodentStandalone: blocksToMarkup(programRodentStandalone()),
            sistemPembayaran: '',
        },
        laporan: { judul: 'LAPORAN KUNJUNGAN', jenisPekerjaan: 'Treatment', saranDefault: '', tampilkanFooter: true },
    };
}

// ─── Sanitasi (data tersimpan = tak tepercaya) ───────────────────────────────

const MAX_IMG_CHARS = 600_000;   // ≈ 450 KB per gambar
const DATA_IMG = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

const str = (v: unknown, max: number, fb: string) => (typeof v === 'string' ? v.slice(0, max) : fb);
const num = (v: unknown, min: number, max: number, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);
const img = (v: unknown, fb: string) => (typeof v === 'string' && (v === '' || (v.length <= MAX_IMG_CHARS && DATA_IMG.test(v))) ? v : fb);
const list = (v: unknown, fb: string[], maxItems = 20, maxLen = 1000) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, maxLen)).filter(x => x.trim() !== '').slice(0, maxItems) : fb;
const color = (v: unknown, fb: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Menggabungkan data tersimpan ke default dengan validasi tipe/rentang. Kunci tak dikenal dibuang. */
export function sanitizeTemplates(raw: unknown, base: DocumentTemplates = defaultDocumentTemplates()): DocumentTemplates {
    const r = obj(raw), lh = obj(r.letterhead), su = obj(r.surat), ar = obj(r.antiRayap), pe = obj(r.pest), la = obj(r.laporan);
    const footerLogos: FooterLogo[] = Array.isArray(lh.footerLogos)
        ? lh.footerLogos.map(x => obj(x)).map(x => ({ src: img(x.src, ''), widthMm: num(x.widthMm, 8, 50, 20) })).filter(x => x.src).slice(0, 3)
        : base.letterhead.footerLogos;
    return {
        version: 1,
        letterhead: {
            mode: lh.mode === 'image' ? 'image' : lh.mode === 'text' ? 'text' : base.letterhead.mode,
            headerLogo: img(lh.headerLogo, base.letterhead.headerLogo),
            headerLogoWidthMm: num(lh.headerLogoWidthMm, 20, 140, base.letterhead.headerLogoWidthMm),
            brandName: str(lh.brandName, 120, base.letterhead.brandName),
            tagline: str(lh.tagline, 160, base.letterhead.tagline),
            brandColor: color(lh.brandColor, base.letterhead.brandColor),
            footerLogos,
            footerLines: list(lh.footerLines, base.letterhead.footerLines, 6, 200),
        },
        surat: {
            masaBerlakuHari: Math.round(num(su.masaBerlakuHari, 1, 365, base.surat.masaBerlakuHari)),
            salamAntiRayap: str(su.salamAntiRayap, 60, base.surat.salamAntiRayap),
            salamPest: str(su.salamPest, 60, base.surat.salamPest),
            kontakKantor: str(su.kontakKantor, 60, base.surat.kontakKantor),
            kontakWa: str(su.kontakWa, 60, base.surat.kontakWa),
            signatureImage: img(su.signatureImage, base.surat.signatureImage),
        },
        antiRayap: {
            skemaPembayaran: list(ar.skemaPembayaran, base.antiRayap.skemaPembayaran),
            pengontrolan: list(ar.pengontrolan, base.antiRayap.pengontrolan),
            tampilkanPengontrolan: bool(ar.tampilkanPengontrolan, base.antiRayap.tampilkanPengontrolan),
            garansiTahun: Math.round(num(ar.garansiTahun, 0, 30, base.antiRayap.garansiTahun)),
            garansiCatatan: str(ar.garansiCatatan, 400, base.antiRayap.garansiCatatan),
            catatanPajak: str(ar.catatanPajak, 300, base.antiRayap.catatanPajak),
        },
        pest: {
            programPest: str(pe.programPest, 12000, base.pest.programPest),
            programRodentKontrak: str(pe.programRodentKontrak, 12000, base.pest.programRodentKontrak),
            programRodentStandalone: str(pe.programRodentStandalone, 12000, base.pest.programRodentStandalone),
            sistemPembayaran: str(pe.sistemPembayaran, 800, base.pest.sistemPembayaran),
        },
        laporan: {
            judul: str(la.judul, 80, base.laporan.judul) || base.laporan.judul,
            jenisPekerjaan: str(la.jenisPekerjaan, 60, base.laporan.jenisPekerjaan),
            saranDefault: str(la.saranDefault, 1500, base.laporan.saranDefault),
            tampilkanFooter: bool(la.tampilkanFooter, base.laporan.tampilkanFooter),
        },
    };
}

// ─── Penerapan ke generator PDF ──────────────────────────────────────────────

/** Baris footer otomatis dari kontak perusahaan. */
export function autoFooterLines(id: CompanyIdentity): string[] {
    const lines: string[] = [];
    if (id.headOffice) lines.push(`Head Office : ${id.headOffice}`);
    const kontak = [id.telp && `Telp : ${id.telp}`, id.wa && `Whatsapp : ${id.wa}`].filter(Boolean).join(', ');
    if (kontak) lines.push(kontak);
    const net = [id.email && `E-Mail : ${id.email}`, id.website && id.website].filter(Boolean).join(' - ');
    if (net) lines.push(net);
    if (id.branchOffice) lines.push(`Branch Office : ${id.branchOffice}`);
    return lines;
}

export function buildLetterhead(tpl: DocumentTemplates, id: CompanyIdentity): Letterhead {
    const lh = tpl.letterhead;
    return {
        companyName: id.companyName,
        kota: id.kota ?? '',
        headerLogo: lh.mode === 'image' && lh.headerLogo ? lh.headerLogo : undefined,
        headerLogoWidthMm: lh.headerLogoWidthMm,
        brandName: lh.brandName || id.companyName,
        tagline: lh.tagline || id.companyTagline || undefined,
        brandColor: lh.brandColor,
        footerLines: lh.footerLines.length ? lh.footerLines : autoFooterLines(id),
        footerLogos: lh.footerLogos.map(l => ({ src: l.src, widthMm: l.widthMm })),
    };
}

/**
 * Mengisi data penawaran dengan template perusahaan. Nilai yang SUDAH ada pada `data` (diisi pemanggil/form)
 * tidak ditimpa — template hanya mengisi yang kosong.
 */
export function applyTemplatesToQuotation(data: QuotationPDFData, tpl: DocumentTemplates, id: CompanyIdentity): QuotationPDFData {
    const out: QuotationPDFData = { ...data };
    const company = id.companyName;
    const isAR = isAntiRayap(data.jenisLayanan);
    const nonEmpty = (s: string) => (s.trim() ? s : undefined);

    out.letterhead ??= buildLetterhead(tpl, id);
    out.masaBerlakuHari ??= tpl.surat.masaBerlakuHari;
    out.salam ??= isAR ? tpl.surat.salamAntiRayap : tpl.surat.salamPest;
    out.kontakKantor ??= nonEmpty(tpl.surat.kontakKantor) ?? (id.telp || undefined);
    out.kontakWa ??= nonEmpty(tpl.surat.kontakWa) ?? (id.wa || undefined);
    out.signatureBase64 ??= tpl.surat.signatureImage || undefined;

    if (isAR) {
        out.skemaPembayaran ??= tpl.antiRayap.skemaPembayaran;
        out.pengontrolan ??= tpl.antiRayap.pengontrolan;
        out.tampilkanPengontrolan ??= tpl.antiRayap.tampilkanPengontrolan;
        out.garansiTahun ??= tpl.antiRayap.garansiTahun;
        out.garansiCatatan ??= nonEmpty(tpl.antiRayap.garansiCatatan);
        out.catatanPajak ??= nonEmpty(tpl.antiRayap.catatanPajak);
    } else {
        if (!out.programs) {
            const sources = data.jenisLayanan === 'pest_rodent' ? [tpl.pest.programRodentStandalone] : [tpl.pest.programPest];
            out.programs = sources.map(src => markupToBlocks(src).map(b => fillBlock(b, company, data.kepadaNama)));
        } else {
            out.programs = out.programs.map(p => p.map(b => fillBlock(b, company, data.kepadaNama)));
        }
        out.sistemPembayaran ??= nonEmpty(tpl.pest.sistemPembayaran);
    }
    return out;
}

/** Program tambahan "II. RODENT CONTROL" (paket kontrak) dari template perusahaan — untuk pemanggil yang menyusun `programs` sendiri. */
export function rodentKontrakBlocks(tpl: DocumentTemplates, id: CompanyIdentity, klien: string): PdfBlock[] {
    return markupToBlocks(tpl.pest.programRodentKontrak).map(b => fillBlock(b, id.companyName, klien));
}
export function pestBlocks(tpl: DocumentTemplates, id: CompanyIdentity, klien: string): PdfBlock[] {
    return markupToBlocks(tpl.pest.programPest).map(b => fillBlock(b, id.companyName, klien));
}

/** Pengaturan laporan kunjungan dari template. */
export function reportOptionsFromTemplates(tpl: DocumentTemplates) {
    return {
        judul: tpl.laporan.judul,
        jenisPekerjaan: tpl.laporan.jenisPekerjaan,
        saran: tpl.laporan.saranDefault || undefined,
        tampilkanFooter: tpl.laporan.tampilkanFooter,
    };
}
