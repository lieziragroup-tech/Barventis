const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

/**
 * Membaca gambar yang diunggah admin (logo, kop, tanda tangan) → data URL yang sudah diperkecil & dikompres.
 * - Hanya PNG/JPEG/WEBP (SVG ditolak: bisa memuat skrip dan tidak didukung PDF).
 * - PNG tetap PNG (transparansi logo/stempel dipertahankan) selama muat di batas; bila terlalu besar → JPEG.
 * - Hasil dijamin ≤ maxChars (≈ batas sanitasi di documentTemplates), sehingga pengaturan tidak membengkak.
 */
export async function fileToImageDataUrl(
    file: File,
    o: { maxWidth: number; maxHeight: number; maxChars?: number },
): Promise<string> {
    if (!ALLOWED.includes(file.type)) throw new Error('Format gambar harus PNG, JPG, atau WEBP.');
    if (file.size > MAX_INPUT_BYTES) throw new Error('Ukuran file terlalu besar (maksimal 8 MB).');
    const maxChars = o.maxChars ?? 560_000;

    const bmp = await createImageBitmap(file);
    let scale = Math.min(1, o.maxWidth / bmp.width, o.maxHeight / bmp.height);
    const keepPng = file.type === 'image/png';
    try {
        for (let attempt = 0; attempt < 8; attempt++) {
            const w = Math.max(16, Math.round(bmp.width * scale)), h = Math.max(16, Math.round(bmp.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Browser tidak mendukung pemrosesan gambar.');
            const asPng = keepPng && attempt < 3;
            if (!asPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
            ctx.drawImage(bmp, 0, 0, w, h);
            const url = asPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
            if (url.length <= maxChars) return url;
            scale *= 0.8;
        }
    } finally {
        bmp.close?.();
    }
    throw new Error('Gambar terlalu detail untuk disimpan. Gunakan gambar yang lebih sederhana atau beresolusi lebih kecil.');
}
