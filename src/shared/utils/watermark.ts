/**
 * Watermark & Camera Image Processing
 * Implements PRD Section 14 & 15: Automatic Photo Watermark & Evidence Integrity
 *
 * The watermark drawn here is cosmetic/human-readable only — the actual
 * evidence of record is the raw GPS + timestamp + accuracy the backend
 * stores in `documentation_photos` (PRD Section 15). This file never
 * fabricates a photo when a camera isn't available; see CameraCaptureModal
 * for how that case is handled instead (a blocking error, not a fake image).
 */

export interface WatermarkPayload {
  projectName: string;
  clientName?: string;
  executorName: string;
  photoType: 'CHECK_IN' | 'PROGRESS' | 'CHECK_OUT';
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
  isWithinRadius: boolean;
  distanceMeters: number;
}

export function formatWIBDate(date: Date): { dateStr: string; timeStr: string } {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return { dateStr: `${day} ${month} ${year}`, timeStr: `${hours}:${minutes}:${seconds} WIB` };
}

/** Draws the base frame + tamper-evident overlay onto a fresh canvas sized to the source. */
export function applyWatermarkToCanvas(
  imageSource: HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  payload: WatermarkPayload
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  // [OPTIMASI RAM] Batasi resolusi max 1024px
  let width = 1280;
  let height = 720;
  if ('videoWidth' in imageSource && imageSource.videoWidth > 0) {
    width = imageSource.videoWidth;
    height = imageSource.videoHeight;
  } else if ('naturalWidth' in imageSource && imageSource.naturalWidth > 0) {
    width = imageSource.naturalWidth;
    height = imageSource.naturalHeight;
  } else if ('width' in imageSource && typeof imageSource.width === 'number' && imageSource.width > 0) {
    width = imageSource.width;
    height = imageSource.height;
  }
  const MAX_DIM = 800;
  if (width > MAX_DIM || height > MAX_DIM) {
    const ratio = width / height;
    if (ratio > 1) { width = Math.round(MAX_DIM); height = Math.round(MAX_DIM / ratio); }
    else { height = Math.round(MAX_DIM); width = Math.round(MAX_DIM * ratio); }
  }
  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(imageSource, 0, 0, width, height);

  const scale = Math.max(width / 1000, 0.72);

  // Top type tag banner
  const tagHeight = 36 * scale;
  ctx.fillStyle =
    payload.photoType === 'CHECK_IN'
      ? 'rgba(16, 185, 129, 0.9)'
      : payload.photoType === 'CHECK_OUT'
      ? 'rgba(59, 130, 246, 0.9)'
      : 'rgba(245, 158, 11, 0.9)';
  ctx.fillRect(20 * scale, 20 * scale, 220 * scale, tagHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${14 * scale}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const typeText =
    payload.photoType === 'CHECK_IN'
      ? '● DOKUMENTASI CHECK-IN'
      : payload.photoType === 'CHECK_OUT'
      ? '● DOKUMENTASI CHECK-OUT'
      : '● DOKUMENTASI PROGRES';
  ctx.fillText(typeText, (20 + 110) * scale, (20 + tagHeight / 2) * scale);

  // Bottom watermark box (PRD Section 14)
  const boxHeight = 175 * scale;
  const boxY = height - boxHeight - 20 * scale;
  const boxX = 20 * scale;
  const boxWidth = width - 40 * scale;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  ctx.strokeStyle = payload.isWithinRadius ? 'rgba(52, 211, 153, 0.7)' : 'rgba(248, 113, 113, 0.8)';
  ctx.lineWidth = 3 * scale;
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

  const headerHeight = 44 * scale;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(boxX, boxY, boxWidth, headerHeight);

  const { dateStr, timeStr } = formatWIBDate(payload.timestamp);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${18 * scale}px sans-serif`;
  ctx.fillText(payload.projectName.toUpperCase(), boxX + 16 * scale, boxY + 26 * scale);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `600 ${14 * scale}px monospace`;
  ctx.fillText(`${dateStr} • ${timeStr}`, boxX + boxWidth - 16 * scale, boxY + 26 * scale);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${13 * scale}px sans-serif`;
  ctx.fillText('LOKASI GPS', boxX + 16 * scale, boxY + 72 * scale);

  ctx.fillStyle = '#f8fafc';
  ctx.font = `bold ${14 * scale}px monospace`;
  ctx.fillText(`📍 ${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}`, boxX + 16 * scale, boxY + 94 * scale);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${13 * scale}px sans-serif`;
  ctx.fillText('JARAK & AKURASI', boxX + boxWidth - 16 * scale, boxY + 72 * scale);

  const statusColor = payload.isWithinRadius ? '#34d399' : '#f87171';
  ctx.fillStyle = statusColor;
  ctx.font = `bold ${14 * scale}px sans-serif`;
  const statusLabel = payload.isWithinRadius
    ? `✓ SESUAI RADIUS (${payload.distanceMeters}m) • AKURASI: ±${Math.round(payload.accuracy)}M`
    : `⚠ DILUAR RADIUS (${payload.distanceMeters}m) • AKURASI: ±${Math.round(payload.accuracy)}M`;
  ctx.fillText(statusLabel, boxX + boxWidth - 16 * scale, boxY + 94 * scale);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${13 * scale}px sans-serif`;
  ctx.fillText('PELAKSANA LAPANGAN', boxX + 16 * scale, boxY + 130 * scale);

  ctx.fillStyle = '#38bdf8';
  ctx.font = `bold ${15 * scale}px sans-serif`;
  ctx.fillText(`👤 ${payload.executorName.toUpperCase()}`, boxX + 16 * scale, boxY + 152 * scale);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `500 ${11 * scale}px monospace`;
  ctx.fillText('FIELDWORK SECURE TAMPER-EVIDENT EVIDENCE', boxX + boxWidth - 16 * scale, boxY + 152 * scale);

  return canvas;
}

function encodeJpegBlob(canvas: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Gagal memproses foto.'))), 'image/jpeg', q);
  });
}

/**
 * Konversi canvas ke JPEG Blob dengan kompresi adaptif otomatis (target 40–60 KB per foto)
 * untuk menghemat kuota database hingga ~80% tanpa mengorbankan keterbacaan watermark.
 */
export async function canvasToJpegBlob(canvas: HTMLCanvasElement, initialQuality = 0.68): Promise<Blob> {
  const TARGET_MAX_BYTES = 62_000; // ~60 KB
  const qualitySteps = [initialQuality, 0.58, 0.48, 0.42];
  let resultBlob = await encodeJpegBlob(canvas, qualitySteps[0]);

  for (let i = 1; i < qualitySteps.length; i++) {
    if (resultBlob.size <= TARGET_MAX_BYTES) break;
    resultBlob = await encodeJpegBlob(canvas, qualitySteps[i]);
  }
  return resultBlob;
}
