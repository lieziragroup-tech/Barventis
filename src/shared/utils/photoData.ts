import { fetchAuthedBlobUrl } from '@/shared/api/client';

const MAX_DIM = 1280;      // sisi terpanjang foto di PDF (cukup tajam untuk cetak A4, ukuran file wajar)
const JPEG_QUALITY = 0.82;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Kecilkan & kompres ke JPEG. Tanpa ini, foto kamera 12 MP × 10 foto membuat PDF puluhan MB. */
async function downscaleToJpeg(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const r = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * r);
  canvas.height = Math.round(bmp.height * r);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas tidak tersedia');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/**
 * Merasterisasi sumber gambar (termasuk data:image/svg+xml atau PNG/JPEG) melalui HTMLCanvas
 * menjadi data URL JPEG/PNG yang pasti kompatibel dengan jsPDF.addImage — bekerja 100% offline.
 */
export async function rasterizeImageUrlToDataUrl(
  sourceUrl: string,
  mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  maxDim = MAX_DIM
): Promise<string | undefined> {
  if (!sourceUrl || typeof document === 'undefined' || typeof Image === 'undefined') {
    return undefined;
  }
  if (mimeType === 'image/jpeg' && /^data:image\/(jpeg|jpg);base64,/i.test(sourceUrl)) {
    return sourceUrl;
  }
  if (mimeType === 'image/png' && /^data:image\/png;base64,/i.test(sourceUrl)) {
    return sourceUrl;
  }

  return new Promise<string | undefined>(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeoutId = window.setTimeout(() => resolve(undefined), 6000);

    img.onload = () => {
      window.clearTimeout(timeoutId);
      try {
        const naturalW = img.naturalWidth || img.width || 640;
        const naturalH = img.naturalHeight || img.height || 420;
        const ratio = Math.min(1, maxDim / Math.max(naturalW, naturalH));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(naturalW * ratio));
        canvas.height = Math.max(1, Math.round(naturalH * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(
          mimeType === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        );
      } catch {
        resolve(undefined);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timeoutId);
      resolve(undefined);
    };

    img.src = sourceUrl;
  });
}

/**
 * Mengambil foto bukti (baik data URL lokal/offline maupun endpoint terautentikasi) dan mengembalikannya
 * sebagai data URL JPEG/PNG siap semat ke PDF. Satu foto bermasalah tidak menggagalkan seluruh PDF.
 */
export async function fetchPhotoDataUrl(path: string): Promise<string | undefined> {
  if (!path) return undefined;

  // Fast offline path for already-embedded data URLs (including SVG watermarks & JPEG/PNG captures)
  if (path.startsWith('data:')) {
    if (/^data:image\/(jpeg|jpg|png);base64,/i.test(path)) {
      return path;
    }
    return rasterizeImageUrlToDataUrl(path, 'image/jpeg', MAX_DIM);
  }

  // Skip network fetch immediately when browser is offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return undefined;
  }

  let objectUrl: string | undefined;
  try {
    objectUrl = await fetchAuthedBlobUrl(path);
    const blob = await (await fetch(objectUrl)).blob();
    if (blob.type === 'image/svg+xml') {
      const svgDataUrl = await blobToDataUrl(blob);
      return await rasterizeImageUrlToDataUrl(svgDataUrl, 'image/jpeg', MAX_DIM);
    }
    try {
      return await downscaleToJpeg(blob);
    } catch {
      const fallbackUrl = await blobToDataUrl(blob);
      return (await rasterizeImageUrlToDataUrl(fallbackUrl, 'image/jpeg', MAX_DIM)) ?? fallbackUrl;
    }
  } catch {
    return undefined;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
