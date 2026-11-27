/**
 * Generator PDF "LAPORAN KUNJUNGAN" — Membedakan secara otomatis antara:
 *   1. LAPORAN PEKERJAAN & KONTROL ANTI RAYAP (Termite Control / AR)
 *   2. LAPORAN KUNJUNGAN PEST CONTROL (Pest & Rodent Control / PCO)
 *
 * Struktur 2 Halaman Padat:
 *   Hal. 1: Kop perusahaan, judul spesifik (Anti Rayap vs Pest Control), identitas 2 kolom
 *           (termasuk Waktu Kerja & Status Garansi khusus Anti Rayap), tabel pemeriksaan 5 kolom
 *           (disesuaikan kolomnya antara Anti Rayap vs Pest Control & hanya menampilkan temuan > 0),
 *           ringkasan Bahan Kimia/Termitisida + Titik Bor/Luas Area, Catatan, Saran & Rekomendasi,
 *           serta tanda tangan Petugas & Customer.
 *   Hal. 2: Dokumentasi foto grid 2x3 ("Foto - 1" s/d "Foto - 6").
 */
import jsPDF from 'jspdf';
import type { Letterhead } from './quotationLetterPdf';
import { GUCI_LETTERHEAD } from './quotationLetterPdf';
import { DOC_TIMEZONE } from './quotationConfig';
import type { WorkReport } from '@/entities/types';
import {
    parsePestFindingsFromNotes,
    resolveReportCategoryMode,
    type ReportCategoryMode,
} from './permenkesRecapEngine';

export interface VisitFinding {
    hama: string;
    quantity: number | string;
    penanganan: string;
    lokasi: string;
    notes: string;
}

export interface VisitReportData {
    letterhead?: Letterhead;
    reportMode?: ReportCategoryMode; // 'AR' (Anti Rayap) | 'PCO' (Pest Control)
    judul?: string;
    tampilkanFooter?: boolean;
    idCustomer?: string;
    customerName: string;
    kategori?: string;
    alamat: string;
    tanggal: Date;
    waktuKerja?: string;
    petugas: string;
    jenisPekerjaan: string;
    chemicalSummary?: string;
    /** Khusus Laporan Anti Rayap: informasi titik bor, luas area m2, & masa garansi */
    termiteTechnicalSummary?: string;
    warrantyStatusLabel?: string;
    findings: VisitFinding[];
    catatan?: string;
    saran?: string;
    petugasSignature?: string;
    customerNama?: string;
    customerSignature?: string;
    photos: { dataUrl?: string; caption?: string }[];
    createdBy: string;
    createdAt?: Date;
}

const PW = 210, ML = 12, MR = 12, TW = PW - ML - MR;
const FOOT_Y = 288;
const BOTTOM = 281;

const fmtLongDate = (d: Date) =>
    d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: DOC_TIMEZONE }).replace(/\//g, '-');

function fmtStamp(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: DOC_TIMEZONE, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d);
    const g = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${g('day')} ${g('month')} ${g('year')} - ${g('hour')}:${g('minute')}:${g('second')} (GMT +07:00)`;
}

class VisitRenderer {
    private doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    private y = 0;
    private lh: Letterhead;
    private stamp: string;
    private isTermite: boolean;

    constructor(private d: VisitReportData) {
        this.lh = d.letterhead ?? GUCI_LETTERHEAD;
        this.stamp = `created by: ${d.createdBy} datetime: ${fmtStamp(d.createdAt ?? new Date())}`;
        this.isTermite = (d.reportMode ?? resolveReportCategoryMode(d.kategori)) === 'AR';
    }

    private chrome() {
        const doc = this.doc, lh = this.lh;
        let y = 10;
        if (lh.headerLogo) {
            try {
                const props = doc.getImageProperties(lh.headerLogo);
                const w = Math.min(lh.headerLogoWidthMm ?? 52, 60), h = w * (lh.headerLogoRatio ?? props.height / props.width);
                doc.addImage(lh.headerLogo, props.fileType, ML, y, w, h);
                y += h + 2;
            } catch { /* logo rusak: lewati */ }
        }
        doc.setTextColor('#000000');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text(lh.companyName.toUpperCase(), ML, y + 3);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2);
        const office = lh.footerLines.find(l => /head office/i.test(l)) ?? lh.footerLines[0];
        if (office) doc.text(office.replace(/\s{2,}/g, ' '), ML, y + 6.5);
        doc.setFontSize(8.5);
        if (this.d.tampilkanFooter !== false) doc.text(this.stamp, ML + 3, FOOT_Y);
        this.y = Math.max(y + 14, 42);
    }

    private newPage() { this.doc.addPage(); this.chrome(); }
    private ensure(h: number) { if (this.y + h > BOTTOM) { this.newPage(); } }

    private header() {
        const doc = this.doc, d = this.d;
        const defaultTitle = this.isTermite
            ? 'LAPORAN PEKERJAAN & KONTROL ANTI RAYAP'
            : 'LAPORAN KUNJUNGAN PEST CONTROL';
        const effectiveTitle = (d.judul && d.judul !== 'LAPORAN KUNJUNGAN')
            ? d.judul
            : defaultTitle;

        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text(`${effectiveTitle.toUpperCase()} - ${d.customerName.toUpperCase()}`, ML + 3, this.y + 3);
        this.y += 10;

        const row = (l1: string, v1: string, l2?: string, v2?: string, boldVals = true) => {
            doc.setFontSize(8.8);
            doc.setFont('helvetica', 'bold'); doc.text(l1, ML + 3, this.y);
            doc.text(':', ML + 28, this.y);
            doc.setFont('helvetica', boldVals ? 'bold' : 'normal');
            doc.text(v1, ML + 31, this.y);
            if (l2) {
                doc.setFont('helvetica', 'bold'); doc.text(l2, 122, this.y);
                doc.text(':', 148, this.y);
                doc.setFont('helvetica', 'normal'); doc.text(v2 ?? '', 151, this.y);
            }
            this.y += 5;
        };
        row('ID Customer', d.idCustomer ?? '-', 'Tanggal', fmtLongDate(d.tanggal));
        row('Customer', d.customerName.length > 34 ? d.customerName.slice(0, 33) + '…' : d.customerName, 'Petugas', d.petugas);
        row(
            'Kategori',
            d.kategori || (this.isTermite ? 'Anti Rayap (Termite Control)' : 'Pest & Rodent Control'),
            'Waktu Kerja',
            d.waktuKerja || '-'
        );
        if (this.isTermite && d.warrantyStatusLabel) {
            row('Status Garansi', d.warrantyStatusLabel, 'Metode Utama', d.jenisPekerjaan);
        }

        doc.setFontSize(8.8); doc.setFont('helvetica', 'bold'); doc.text('Alamat', ML + 3, this.y);
        doc.text(':', ML + 28, this.y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.2);
        const lines = doc.splitTextToSize(d.alamat || '-', TW - 34) as string[];
        lines.forEach((l, i) => doc.text(l, ML + 31, this.y + i * 3.8));
        this.y += Math.max(1, lines.length) * 3.8 + 2.5;

        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text('Jenis Pekerjaan :', ML + 3, this.y);
        doc.setFont('helvetica', 'normal'); doc.text(d.jenisPekerjaan, ML + 3 + doc.getTextWidth('Jenis Pekerjaan : ') + 1, this.y);
        this.y += 3;
    }

    private findingsTable() {
        const doc = this.doc;
        const cols = [36, 20, 36, 42, 52]; // = 186
        const xs = cols.reduce<number[]>((a, _w, i) => { a.push(i === 0 ? ML : a[i - 1] + cols[i - 1]); return a; }, []);
        const draw = (cells: string[], head: boolean) => {
            const size = head ? 8.8 : 8.2, lh = size * 0.3528 * 1.25;
            doc.setFont('helvetica', head ? 'bold' : 'normal'); doc.setFontSize(size);
            const wrapped = cells.map((c, i) => doc.splitTextToSize(c, cols[i] - 3) as string[]);
            const h = Math.max(head ? 6.5 : 7.5, Math.max(...wrapped.map(w => w.length)) * lh + 3);
            this.ensure(h);
            cells.forEach((_c, i) => {
                doc.setDrawColor('#000000'); doc.setLineWidth(0.28); doc.rect(xs[i], this.y, cols[i], h);
                const blockH = wrapped[i].length * lh;
                wrapped[i].forEach((ln, k) => doc.text(ln, xs[i] + cols[i] / 2, this.y + (h - blockH) / 2 + lh * 0.78 + k * lh, { align: 'center' }));
            });
            this.y += h;
        };

        const activeFindings = this.d.findings.filter(f => {
            const n = Number(f.quantity);
            return !isNaN(n) ? n > 0 : Boolean(f.hama);
        });
        const rowsToRender = activeFindings.length > 0 ? activeFindings : this.d.findings;

        // Kolom tabel menyesuaikan antara Laporan Anti Rayap vs Laporan Pest Control
        const headers = this.isTermite
            ? ['Indikasi / Objek Rayap', 'Jml Titik', 'Metode Injeksi/Umpan', 'Struktur / Area', 'Keterangan Hasil']
            : ['Hama Temuan', 'Quantity', 'Penanganan', 'Lokasi', 'Notes'];

        draw(headers, true);
        for (const f of rowsToRender) draw([f.hama, String(f.quantity), f.penanganan, f.lokasi, f.notes], false);

        if (this.d.chemicalSummary) {
            this.y += 2;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2);
            doc.text(this.isTermite ? 'Termitisida & Dosis: ' : 'Bahan Kimia & Dosis: ', ML + 3, this.y + 3);
            doc.setFont('helvetica', 'normal');
            doc.text(this.d.chemicalSummary, ML + 36, this.y + 3);
            this.y += 4;
        }
        if (this.isTermite && this.d.termiteTechnicalSummary) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.2);
            doc.text('Parameter Teknis AR: ', ML + 3, this.y + 3);
            doc.setFont('helvetica', 'normal');
            doc.text(this.d.termiteTechnicalSummary, ML + 36, this.y + 3);
            this.y += 4;
        }
        this.y += 4;
    }

    private section(title: string, body?: string) {
        this.ensure(18);
        const doc = this.doc;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.text(title, ML + 3, this.y);
        this.y += 2.2;
        doc.setDrawColor('#d0d0d0'); doc.setLineWidth(0.8); doc.line(ML + 3, this.y, PW - MR, this.y);
        this.y += 4.5;
        if (body?.trim()) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
            for (const ln of doc.splitTextToSize(body, TW - 6) as string[]) { this.ensure(4.5); doc.text(ln, ML + 3, this.y); this.y += 4.2; }
            this.y += 2.5;
        } else {
            this.y += 10;
        }
    }

    private signatures() {
        this.ensure(40);
        const doc = this.doc, d = this.d;
        const bw = 50, bh = 24, gap = 3, x2 = PW - MR - bw, x1 = x2 - bw - gap, top = this.y + 6;
        doc.setFont('times', 'bold'); doc.setFontSize(9.5);
        doc.text('Petugas', x1 + bw / 2, this.y + 3, { align: 'center' });
        doc.text('Customer', x2 + bw / 2, this.y + 3, { align: 'center' });
        const box = (x: number, sig: string | undefined, name: string) => {
            doc.setDrawColor('#000000'); doc.setLineWidth(0.6); doc.rect(x, top, bw, bh + 7);
            doc.setLineWidth(0.25); doc.line(x, top + bh, x + bw, top + bh);
            if (sig) { try { const p = doc.getImageProperties(sig); const r = Math.min((bw - 6) / p.width, (bh - 4) / p.height); doc.addImage(sig, p.fileType, x + (bw - p.width * r) / 2, top + 2 + ((bh - 4) - p.height * r) / 2, p.width * r, p.height * r); } catch { /* lewati */ } }
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
            doc.text(name || '', x + bw / 2, top + bh + 4.8, { align: 'center', maxWidth: bw - 3 });
        };
        box(x1, d.petugasSignature, d.petugas);
        box(x2, d.customerSignature, d.customerNama ?? '');
        this.y = top + bh + 10;
    }

    private photos() {
        const list = this.d.photos;
        if (!list.length) return;
        const doc = this.doc;
        this.newPage();
        const bw = 91.5, bh = 52, gx = 3;
        for (let i = 0; i < list.length; i += 2) {
            this.ensure(bh + 9);
            [list[i], list[i + 1]].forEach((p, k) => {
                if (!p) return;
                const n = i + k + 1, x = ML + k * (bw + gx);
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor('#000000');
                doc.text(p.caption ?? `Foto - ${n}`, x + 1, this.y + 3);
                doc.setDrawColor('#000000'); doc.setLineWidth(0.5); doc.rect(x, this.y + 5, bw, bh);
                if (p.dataUrl) {
                    try {
                        const props = doc.getImageProperties(p.dataUrl);
                        const r = Math.min((bw - 4) / props.width, (bh - 4) / props.height);
                        const w = props.width * r, h = props.height * r;
                        doc.addImage(p.dataUrl, props.fileType, x + (bw - w) / 2, this.y + 5 + (bh - h) / 2, w, h);
                    } catch { doc.setFontSize(8); doc.text('(foto tidak dapat dimuat)', x + bw / 2, this.y + 5 + bh / 2, { align: 'center' }); }
                } else {
                    doc.setFontSize(8); doc.setTextColor('#888888');
                    doc.text('(foto tidak tersedia / sudah dihapus sesuai retensi)', x + bw / 2, this.y + 5 + bh / 2, { align: 'center' });
                    doc.setTextColor('#000000');
                }
            });
            this.y += bh + 10;
        }
    }

    render(): Blob {
        this.chrome();
        this.header();
        this.findingsTable();
        this.section(this.isTermite ? 'Catatan Pemeriksaan Struktur & Barier Rayap' : 'Catatan', this.d.catatan);
        this.section('Saran dan Rekomendasi', this.d.saran);
        this.signatures();
        this.photos();
        return this.doc.output('blob');
    }
}

export function generateVisitReportPDF(data: VisitReportData): Blob {
    return new VisitRenderer(data).render();
}

const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());

export function findingsFromReport(report: WorkReport): VisitFinding[] {
    const t = report.treatmentRecord;
    const isTermite = resolveReportCategoryMode(report.serviceType) === 'AR';
    const parsed = parsePestFindingsFromNotes(t?.technicianNotes || report.notes);
    if (parsed.findings.length > 0) {
        return parsed.findings
            .filter(f => Number(f.quantity) > 0)
            .map(f => ({
                hama: f.pestName,
                quantity: f.quantity,
                penanganan: f.treatmentMethod,
                lokasi: f.location,
                notes: f.notes,
            }));
    }

    const penanganan = t
        ? `${humanize(t.applicationMethod)}${t.chemicalName ? ` (${t.chemicalName}${t.dosage ? `, ${t.dosage}` : ''})` : ''}`
        : isTermite ? 'Drilling / Injeksi & Monitoring Rayap' : '-';

    if (isTermite) {
        const pts = t?.drillingPointsCount && t.drillingPointsCount > 0 ? t.drillingPointsCount : '-';
        const loc = t?.areaPlafon || report.focusTarget || 'Pondasi, Kusen & Plafon Bangunan';
        return [
            {
                hama: report.targetFocus?.length ? report.targetFocus.join(', ') : 'Rayap Tanah & Kayu (Termite)',
                quantity: pts,
                penanganan,
                lokasi: loc,
                notes: parsed.cleanNotes || report.notes || 'Telah dilakukan aplikasi barier termitisida & pemeriksaan struktur kayu/pondasi',
            },
        ];
    }

    const targets = report.targetFocus?.length ? report.targetFocus : report.focusTarget ? [report.focusTarget] : [humanize(report.serviceType)];
    const notes = parsed.cleanNotes || report.notes || '-';
    const lokasi = report.targetFocus?.length && report.focusTarget ? report.focusTarget : '-';
    return targets.map(h => ({ hama: h, quantity: '-', penanganan, lokasi, notes }));
}

export function visitReportFromWorkReport(
    report: WorkReport,
    o: {
        letterhead?: Letterhead;
        createdBy: string;
        photos?: VisitReportData['photos'];
        findings?: VisitFinding[];
        saran?: string;
        idCustomer?: string;
        judul?: string;
        jenisPekerjaan?: string;
        tampilkanFooter?: boolean;
        petugasSignature?: string;
        customerSignature?: string;
    },
): VisitReportData {
    const t = report.treatmentRecord;
    const reportMode = resolveReportCategoryMode(report.serviceType);
    const isTermite = reportMode === 'AR';
    const parsed = parsePestFindingsFromNotes(t?.technicianNotes || report.notes);
    const fmtTime = (iso?: string | null) =>
        iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: DOC_TIMEZONE }) : '';
    const waktuKerja = report.checkInAt
        ? `${fmtTime(report.checkInAt)}${report.checkOutAt ? ` - ${fmtTime(report.checkOutAt)}` : ''} WIB`
        : undefined;
    const chemicalSummary = t?.chemicalName
        ? `${t.chemicalName}${t.activeIngredient ? ` (${t.activeIngredient})` : ''} — Dosis: ${t.dosage || '-'}`
        : undefined;

    const termiteParts: string[] = [];
    if (t?.drillingPointsCount) termiteParts.push(`Titik Bor/Injeksi: ${t.drillingPointsCount} titik`);
    if (t?.treatmentAreaSqm || report.buildingAreaSqm) {
        termiteParts.push(`Luas Area Perlakuan: ${t?.treatmentAreaSqm ?? report.buildingAreaSqm} m²`);
    }
    const termiteTechnicalSummary = termiteParts.length > 0 ? termiteParts.join(' | ') : undefined;
    const warrantyStatusLabel = isTermite
        ? report.warrantyMonths > 0
            ? `Bergaransi (${report.warrantyMonths} Bulan)`
            : 'Perlakuan Anti Rayap Terjadwal'
        : undefined;

    const teamNames = Array.isArray(report.teamMembers) && report.teamMembers.length > 0
        ? Array.from(new Set(report.teamMembers.map(m => m.name?.trim()).filter(Boolean)))
        : [];
    const petugasLabel = teamNames.length > 0 ? teamNames.join(', ') : report.executorName;

    return {
        letterhead: o.letterhead,
        reportMode,
        judul: o.judul,
        tampilkanFooter: o.tampilkanFooter,
        idCustomer: o.idCustomer ?? '-',
        customerName: report.clientName || report.projectName,
        kategori: isTermite ? 'Anti Rayap (Termite Control)' : `Pest Control (${humanize(report.serviceType)})`,
        alamat: report.projectAddress,
        tanggal: new Date(report.checkInAt ?? report.createdAt),
        waktuKerja,
        petugas: petugasLabel,
        jenisPekerjaan: o.jenisPekerjaan ?? (isTermite ? 'Injeksi / Monitoring Anti Rayap' : humanize(report.serviceType) === 'General Pest Control' ? 'Treatment Pest Control' : humanize(report.serviceType)),
        chemicalSummary,
        termiteTechnicalSummary,
        warrantyStatusLabel,
        findings: o.findings ?? findingsFromReport(report),
        catatan: [parsed.cleanNotes || report.notes, t?.safetyNotes && `Catatan keselamatan: ${t.safetyNotes}`].filter(Boolean).join('\n'),
        saran: o.saran,
        petugasSignature: o.petugasSignature ?? report.technicianSignature ?? undefined,
        customerNama: report.customerName ?? undefined,
        customerSignature: o.customerSignature ?? report.customerSignature ?? undefined,
        photos: o.photos ?? [],
        createdBy: o.createdBy,
    };
}
