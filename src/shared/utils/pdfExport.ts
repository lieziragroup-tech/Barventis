import type { WorkReport, Project } from '@/entities/types';
import { generateVisitReportPDF, visitReportFromWorkReport } from '@/shared/lib/visitReportPdf';
import type { VisitFinding } from '@/shared/lib/visitReportPdf';
import type { Letterhead } from '@/shared/lib/quotationLetterPdf';
import { generateMonthlyRecapPDF, type MonthlyRecapReportData } from '@/shared/lib/monthlyRecapPdf';
import { fetchPhotoDataUrl, rasterizeImageUrlToDataUrl } from '@/shared/utils/photoData';
import { resolveDocumentConfig, reportOptionsFromTemplates } from '@/shared/api/documentConfig';
import { GUCI_LETTERHEAD } from '@/shared/lib/quotationLetterPdf';
import { guciTemplates } from '@/shared/lib/documentPresets';
import {
  buildPdfPhotoCaption,
  buildReportPdfFilename,
  needsRasterizationForPdf,
} from '@/shared/utils/pdfReportHelpers';

export interface ExportReportOptions {
  /** Perusahaan pemilik dokumen: kop & template (judul, jenis pekerjaan, saran, footer) diambil dari pengaturannya. */
  companyId?: string | null;
  /** Menimpa kop dari pengaturan (opsional). */
  letterhead?: Letterhead;
  /** Nama pembuat dokumen untuk footer "created by". */
  createdBy?: string;
  /** Data URL tanda tangan teknisi (jika tersimpan lokal/offline di perangkat). */
  petugasSignature?: string;
  findings?: VisitFinding[];
  saran?: string;
  idCustomer?: string;
}

export interface ExportPdfResult {
  filename: string;
  sizeBytes: number;
}

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');

async function resolveConfigOfflineSafe(companyId?: string | null) {
  const fallback = { letterhead: GUCI_LETTERHEAD, templates: guciTemplates() };
  if (!companyId || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return fallback;
  }
  try {
    const cfg = await Promise.race([
      resolveDocumentConfig(companyId),
      new Promise<typeof fallback>(resolve => setTimeout(() => resolve(fallback), 2200)),
    ]);
    return cfg;
  } catch {
    return fallback;
  }
}

async function prepareSignatureForPdf(raw?: string | null): Promise<string | undefined> {
  if (!raw) return undefined;
  if (!needsRasterizationForPdf(raw)) return raw;
  return (await rasterizeImageUrlToDataUrl(raw, 'image/png', 640)) ?? undefined;
}

/**
 * Unduh PDF Laporan Kunjungan secara langsung ke perangkat (bekerja penuh secara offline).
 * Otomatis membedakan format & nama file antara:
 * - Laporan_Anti_Rayap_<Klien>_<WO>_<Tanggal>.pdf (untuk TERMITE_CONTROL)
 * - Laporan_Pest_Control_<Klien>_<WO>_<Tanggal>.pdf (untuk layanan Pest Control / PCO)
 */
export async function exportReportToPdf(
  report: WorkReport,
  _project?: Project,
  opts: ExportReportOptions = {}
): Promise<ExportPdfResult> {
  const order = { CHECK_IN: 0, PROGRESS: 1, CHECK_OUT: 2 } as const;
  const sorted = [...(report.photos ?? [])].sort(
    (a, b) => order[a.photoType] - order[b.photoType] || +new Date(a.capturedAt) - +new Date(b.capturedAt),
  );
  const photos = await Promise.all(
    sorted.map(async (p, index) => {
      const caption = buildPdfPhotoCaption(p, index);
      const snapshot = p.pdfSnapshotUrl || p.metadata?.pdfSnapshotUrl;
      if (snapshot && snapshot.startsWith('data:')) {
        const prepared = needsRasterizationForPdf(snapshot)
          ? await rasterizeImageUrlToDataUrl(snapshot, 'image/jpeg')
          : snapshot;
        return { dataUrl: prepared, caption };
      }
      if (p.purgedAt) {
        return { dataUrl: undefined, caption };
      }
      return { dataUrl: await fetchPhotoDataUrl(p.url), caption };
    }),
  );

  // Prepare both technician and customer signatures (rasterizing SVG data URLs so jsPDF embeds them)
  let rawTechSig = opts.petugasSignature || report.technicianSignature || undefined;
  if (!rawTechSig && typeof localStorage !== 'undefined') {
    try {
      rawTechSig = localStorage.getItem(`gep_tech_sig_${report.id}`) || undefined;
    } catch {
      // ignore storage access issues
    }
  }
  const [petugasSignature, customerSignature, cfg] = await Promise.all([
    prepareSignatureForPdf(rawTechSig),
    prepareSignatureForPdf(report.customerSignature),
    resolveConfigOfflineSafe(opts.companyId),
  ]);

  const ro = reportOptionsFromTemplates(cfg.templates);
  const data = visitReportFromWorkReport(report, {
    letterhead: opts.letterhead ?? cfg.letterhead,
    judul: ro.judul,
    jenisPekerjaan: ro.jenisPekerjaan,
    tampilkanFooter: ro.tampilkanFooter,
    createdBy: opts.createdBy ?? report.executorName ?? '-',
    photos,
    findings: opts.findings,
    saran: opts.saran ?? ro.saran,
    idCustomer: opts.idCustomer,
    petugasSignature,
    customerSignature,
  });

  const filename = buildReportPdfFilename(report);
  const blob = generateVisitReportPDF(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);

  return { filename, sizeBytes: blob.size };
}

/**
 * Unduh PDF Laporan Rekapitulasi Bulanan (Membedakan Mode Pest Control vs Mode Anti Rayap)
 * Khusus Admin (`userRole === 'ADMIN'`).
 */
export async function exportMonthlyRecapToPdf(
  payload: Omit<MonthlyRecapReportData, 'letterhead'> & { companyId?: string | null }
) {
  const cfg = await resolveDocumentConfig(payload.companyId);
  const blob = generateMonthlyRecapPDF({
    ...payload,
    letterhead: cfg.letterhead,
  });
  const isTermite = payload.categoryMode === 'AR';
  const prefix = isTermite ? 'Laporan_Rekapitulasi_Anti_Rayap' : 'Laporan_Rekapitulasi_Pest_Control';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}_${safeName(payload.customerName)}_${safeName(payload.periodLabel)}.pdf`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
