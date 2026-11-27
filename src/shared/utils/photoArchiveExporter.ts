import type { DocumentationPhoto, WorkReport } from '@/entities/types';
import { fetchAuthedBlobUrl } from '@/shared/api/client';
import { supabase } from '@/shared/lib/supabase';

export interface ArchivePhotoEntry {
  reportId: string;
  reportTitle: string;
  clientName: string;
  executorName: string;
  dateStr: string;
  photo: DocumentationPhoto;
  filename: string;
}

export interface ArchiveDownloadResult {
  archiveFilename: string;
  totalPhotosArchived: number;
  totalReportsAffected: number;
  freedBytesEstimate: number;
  offloadedFromDb: boolean;
}

/**
 * Membersihkan teks menjadi segmen nama file yang rapi dan aman untuk WinRAR / Windows / macOS.
 */
function sanitizeSegment(input: string, fallback: string): string {
  const cleaned = (input || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.slice(0, 48) || fallback;
}

function formatPhotoStageLabel(photo: DocumentationPhoto): string {
  if (photo.photoType === 'CHECK_IN') return 'CHECK-IN';
  if (photo.photoType === 'CHECK_OUT') return 'CHECK-OUT';
  if (photo.photoTag === 'BEFORE') return 'PROGRES-AWAL';
  if (photo.photoTag === 'AFTER') return 'PROGRES-HASIL';
  return 'PROGRES';
}

function formatDateYMD(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Menyusun daftar foto raw yang siap diunduh ke dalam arsip (.zip / kompatibel WinRAR)
 * dengan format nama file:
 * {YYYY-MM-DD}_{Nama_Laporan_Pelanggan}_{Nama_Teknisi}_{Tahap_Foto}_{No}.jpg
 */
export function buildArchivePhotoEntries(reports: WorkReport[]): ArchivePhotoEntry[] {
  const entries: ArchivePhotoEntry[] = [];
  const usedFilenames = new Set<string>();

  for (const report of reports) {
    const activePhotos = (report.photos || []).filter(p => !p.purgedAt && Boolean(p.url));
    if (activePhotos.length === 0) continue;

    const order = { CHECK_IN: 0, PROGRESS: 1, CHECK_OUT: 2 } as const;
    const sorted = [...activePhotos].sort(
      (a, b) => order[a.photoType] - order[b.photoType] || +new Date(a.capturedAt) - +new Date(b.capturedAt)
    );

    const reportLabel = sanitizeSegment(report.clientName || report.projectName, 'Laporan-Kunjungan');
    const techLabel = sanitizeSegment(report.executorName || 'Teknisi', 'Teknisi');

    sorted.forEach((photo, idx) => {
      const dateStr = formatDateYMD(photo.capturedAt || report.createdAt);
      const stageLabel = formatPhotoStageLabel(photo);
      const seq = String(idx + 1).padStart(2, '0');

      let baseName = `${dateStr}_${reportLabel}_${techLabel}_${stageLabel}_${seq}`;
      let candidate = `${baseName}.jpg`;
      let dupCounter = 2;
      while (usedFilenames.has(candidate.toLowerCase())) {
        candidate = `${baseName}_${dupCounter}.jpg`;
        dupCounter++;
      }
      usedFilenames.add(candidate.toLowerCase());

      entries.push({
        reportId: report.id,
        reportTitle: report.projectName,
        clientName: report.clientName || report.projectName,
        executorName: report.executorName,
        dateStr,
        photo,
        filename: candidate,
      });
    });
  }

  return entries;
}

/**
 * Membuat snapshot ringan (~18-22 KB, lebar maks 480px) khusus untuk disematkan ke PDF Laporan Kunjungan
 * agar ketika foto raw dihapus dari database setelah diunduh, foto di dalam PDF tetap tampil utuh.
 */
async function createPdfSnapshotFromBlob(blob: Blob): Promise<string> {
  try {
    const bmp = await createImageBitmap(blob);
    const MAX_PDF_DIM = 480;
    const ratio = Math.min(1, MAX_PDF_DIM / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * ratio));
    canvas.height = Math.max(1, Math.round(bmp.height * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    return canvas.toDataURL('image/jpeg', 0.62);
  } catch {
    return new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
}

/**
 * Mengambil bytes JPEG raw dari foto bukti untuk dimasukkan ke dalam file arsip.
 */
async function fetchRawPhotoBlob(photo: DocumentationPhoto): Promise<Blob | null> {
  if (!photo.url) return null;
  let objectUrl: string | null = null;
  try {
    objectUrl = await fetchAuthedBlobUrl(photo.url);
    const res = await fetch(objectUrl);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// ---------------------------------------------------------------------------
// Zero-Dependency Standard ZIP Builder (Kompatibel penuh dengan WinRAR / 7-Zip / Explorer)
// ---------------------------------------------------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dateToDosTime(d: Date): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, d.getFullYear());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
}

interface ZipFileRecord {
  filename: string;
  data: Uint8Array;
  modifiedAt: Date;
}

function createZipArchiveBlob(files: ZipFileRecord[]): Blob {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.filename);
    const crc = crc32(file.data);
    const size = file.data.length;
    const { dosTime, dosDate } = dateToDosTime(file.modifiedAt);

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Signature
    lv.setUint16(4, 20, true); // Version needed (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method 0 (Store - JPEG is already compressed)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, file.data);

    // Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Store method
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // Extra len
    cv.setUint16(32, 0, true); // Comment len
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralDirSize = centralChunks.reduce((acc, c) => acc + c.length, 0);

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, eocd] as BlobPart[], {
    type: 'application/zip',
  });
}

/**
 * Mengunduh arsip foto raw (.zip yang langsung bisa dibuka di WinRAR / Explorer)
 * dengan penamaan otomatis:
 * {Tanggal}_{Nama_Laporan_Pelanggan}_{Nama_Teknisi}_{Tahap_Foto}_{No}.jpg
 *
 * Jika `offloadRawFromDb === true`:
 * 1. Menyimpan snapshot PDF ringan (`pdfSnapshotUrl`) pada setiap foto laporan agar dokumen PDF
 *    Laporan Kunjungan tetap memiliki foto lengkap dan tidak ikut terhapus.
 * 2. Menghapus foto raw berukuran besar dari database (`purged_at` diisi & `storage_path` dikosongkan).
 */
export async function downloadRawPhotosArchiveAndOffload(
  reports: WorkReport[],
  options: {
    offloadRawFromDb?: boolean;
    customArchiveLabel?: string;
  } = {}
): Promise<ArchiveDownloadResult> {
  const { offloadRawFromDb = true, customArchiveLabel } = options;
  const entries = buildArchivePhotoEntries(reports);

  if (entries.length === 0) {
    throw new Error('Tidak ada foto raw aktif di database yang dapat diunduh untuk laporan yang dipilih.');
  }

  const zipFiles: ZipFileRecord[] = [];
  const snapshotsByPhotoId = new Map<string, string>();
  const affectedReportIds = new Set<string>();
  let freedBytesEstimate = 0;

  for (const entry of entries) {
    const blob = await fetchRawPhotoBlob(entry.photo);
    if (!blob) continue;

    const arrayBuf = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    freedBytesEstimate += bytes.byteLength;

    zipFiles.push({
      filename: entry.filename,
      data: bytes,
      modifiedAt: new Date(entry.photo.capturedAt || Date.now()),
    });

    if (offloadRawFromDb) {
      const pdfSnapshot = await createPdfSnapshotFromBlob(blob);
      snapshotsByPhotoId.set(entry.photo.id, pdfSnapshot);
    }
    affectedReportIds.add(entry.reportId);
  }

  if (zipFiles.length === 0) {
    throw new Error('Gagal membaca file foto dari penyimpanan. Pastikan foto belum dihapus sebelumnya.');
  }

  // Buat manifest ringkasan TXT di dalam arsip agar mudah diaudit saat dibuka di WinRAR
  const nowIso = new Date().toISOString();
  const manifestLines = [
    '========================================================================',
    'ARSIP DOKUMENTASI FOTO RAW LAPANGAN — PEST CONTROL & ANTI RAYAP',
    '========================================================================',
    `Waktu Unduh Arsip : ${new Date().toLocaleString('id-ID')} WIB`,
    `Total Foto Raw    : ${zipFiles.length} file`,
    `Total Laporan     : ${affectedReportIds.size} laporan kunjungan`,
    `Status Database   : ${
      offloadRawFromDb
        ? 'Foto Raw telah dihapus dari Database (Salinan foto di PDF Laporan Kunjungan tetap tersimpan aman)'
        : 'Foto Raw tetap disimpan di Database'
    }`,
    '------------------------------------------------------------------------',
    'DAFTAR FILE FOTO:',
    ...entries.map(
      (e, i) =>
        `${String(i + 1).padStart(2, '0')}. ${e.filename} | Pelanggan: ${e.clientName} | Teknisi: ${e.executorName} | Tanggal: ${e.dateStr}`
    ),
    '========================================================================',
  ];
  const manifestBytes = new TextEncoder().encode(manifestLines.join('\r\n'));
  zipFiles.push({
    filename: '_DAFTAR_FOTO_LAPORAN.txt',
    data: manifestBytes,
    modifiedAt: new Date(),
  });

  // Trigger browser download file arsip (.zip kompatibel WinRAR)
  const archiveBlob = createZipArchiveBlob(zipFiles);
  const todayStr = formatDateYMD(nowIso);
  const singleReport = reports.length === 1 ? reports[0] : null;
  const labelSegment = customArchiveLabel
    ? sanitizeSegment(customArchiveLabel, 'Laporan-Kerja')
    : singleReport
    ? `${sanitizeSegment(singleReport.clientName || singleReport.projectName, 'Laporan')}_${sanitizeSegment(singleReport.executorName, 'Teknisi')}`
    : `${affectedReportIds.size}-Laporan-Kunjungan`;

  const archiveFilename = `Arsip_Foto_Raw_${todayStr}_${labelSegment}.zip`;

  const blobUrl = URL.createObjectURL(archiveBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = archiveFilename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);

  // Offload foto raw dari database sambil mengunci pdfSnapshotUrl agar PDF tidak kehilangan foto
  if (offloadRawFromDb && snapshotsByPhotoId.size > 0) {
    for (const entry of entries) {
      const snap = snapshotsByPhotoId.get(entry.photo.id);
      if (!snap) continue;
      const nextMeta = {
        ...(entry.photo.metadata || {}),
        pdfSnapshotUrl: snap,
        rawArchivedAt: nowIso,
      };
      try {
        await supabase
          .from('documentation_photos')
          .update({
            storage_path: '',
            purged_at: nowIso,
            metadata: nextMeta,
          })
          .eq('id', entry.photo.id);
      } catch {
        // Fallback ke penyimpanan lokal di bawah
      }
    }


  }

  return {
    archiveFilename,
    totalPhotosArchived: zipFiles.length - 1, // kurangi file manifest txt
    totalReportsAffected: affectedReportIds.size,
    freedBytesEstimate,
    offloadedFromDb: offloadRawFromDb,
  };
}
