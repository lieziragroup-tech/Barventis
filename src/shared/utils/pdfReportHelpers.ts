import type { DocumentationPhoto, WorkReport } from '@/entities/types';
import { resolveReportCategoryMode } from '@/shared/lib/permenkesRecapEngine';

const SAFE_FILENAME_CHARS = /[^\p{L}\p{N}]+/gu;

export function sanitizePdfSegment(raw: string): string {
  const cleaned = raw.replace(SAFE_FILENAME_CHARS, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'Laporan';
}

export function formatShortWoTag(reportId: string): string {
  let hash = 0;
  for (let i = 0; i < reportId.length; i += 1) {
    hash = (hash * 31 + reportId.charCodeAt(i)) % 10000;
  }
  return `WO-${String(Math.abs(hash)).padStart(4, '0')}`;
}

/**
 * Builds a deterministic, filesystem-safe offline PDF filename distinguishing
 * Anti Rayap vs Pest Control reports.
 */
export function buildReportPdfFilename(
  report: Pick<WorkReport, 'id' | 'serviceType' | 'clientName' | 'projectName' | 'checkOutAt' | 'checkInAt' | 'createdAt'>
): string {
  const isTermite = resolveReportCategoryMode(report.serviceType) === 'AR';
  const prefix = isTermite ? 'Laporan_Anti_Rayap' : 'Laporan_Pest_Control';
  const clientSegment = sanitizePdfSegment(report.clientName || report.projectName || 'Klien').slice(0, 42);
  const woTag = formatShortWoTag(report.id);

  const rawDate = report.checkOutAt || report.checkInAt || report.createdAt;
  const parsed = rawDate ? new Date(rawDate) : new Date();
  const dateSegment = Number.isNaN(parsed.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsed.toISOString().slice(0, 10);

  return `${prefix}_${clientSegment}_${woTag}_${dateSegment}.pdf`;
}

/**
 * Formats a descriptive Indonesian caption for each photo slot in the PDF document.
 */
export function buildPdfPhotoCaption(
  photo: Pick<DocumentationPhoto, 'photoType' | 'photoTag' | 'capturedAt'>,
  index: number
): string {
  let label = `Proses Pekerjaan ${index + 1}`;
  if (photo.photoType === 'CHECK_IN') {
    label = 'Kehadiran (Check-In)';
  } else if (photo.photoType === 'CHECK_OUT') {
    label = 'Penyelesaian (Check-Out)';
  } else if (photo.photoTag === 'BEFORE') {
    label = 'Kondisi Awal (Before)';
  } else if (photo.photoTag === 'AFTER') {
    label = 'Hasil Akhir (After)';
  }

  let timeSuffix = '';
  if (photo.capturedAt) {
    const d = new Date(photo.capturedAt);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      timeSuffix = ` (${hh}.${mm} WIB)`;
    }
  }

  return `Foto ${index + 1} - ${label}${timeSuffix}`;
}

/**
 * Returns true if a data URL cannot be passed directly to jsPDF.addImage
 * (for example SVG data URLs) and must be rasterized to PNG/JPEG first.
 */
export function needsRasterizationForPdf(dataUrl?: string | null): boolean {
  if (!dataUrl) return false;
  if (!dataUrl.startsWith('data:')) return true;
  return !/^data:image\/(jpeg|jpg|png);base64,/i.test(dataUrl);
}

/**
 * Formats byte size into a compact Indonesian-friendly string (KB / MB).
 */
export function formatFileSizeKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
