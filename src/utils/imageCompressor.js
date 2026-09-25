/**
 * Utilitas Kompresi Citra dan Watermarking (WebP)
 * Sesuai WBS 2.1 & 2.2
 */

/**
 * Mengambil koordinat GPS saat ini
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
export const getCurrentGPS = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      { timeout: 5000 }
    );
  });
};

/**
 * Memformat waktu ke standar WIB (YYYY-MM-DD HH:mm:ss)
 */
export const formatWIB = () => {
  const formatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Format menghasilkan: DD/MM/YYYY, HH.mm.ss
  // Kita ubah ke YYYY-MM-DD HH:mm:ss
  const parts = formatter.formatToParts(new Date());
  const hash = {};
  parts.forEach(p => hash[p.type] = p.value);
  
  return `${hash.year}-${hash.month}-${hash.day} ${hash.hour}:${hash.minute}:${hash.second} WIB`;
};

/**
 * Kompresi dan Burn-In Watermark ke WebP Blob
 * @param {File} file File gambar asli
 * @param {Object} options Opsi { picName: string, branchName: string }
 * @returns {Promise<Blob>}
 */
export const compressAndWatermark = async (file, options = {}) => {
  const { picName = 'Unknown', branchName = 'Unknown' } = options;
  
  // 1. Ambil GPS secara asinkron
  const gps = await getCurrentGPS();
  const gpsStr = gps 
    ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}`
    : 'GPS OFF';
  
  const timeStr = formatWIB();
  const watermarkText = `${timeStr} | ${picName} | ${branchName} | ${gpsStr}`;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 2. Skala ke maks 1280px pada sisi terpanjang
        const MAX_SIZE = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height *= MAX_SIZE / width));
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width *= MAX_SIZE / height));
            height = MAX_SIZE;
          }
        }

        // 3. Render ke Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // 4. Burn-in Watermark
        const barHeight = Math.max(40, Math.round(height * 0.05));
        
        // Bar hitam semi-transparan
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, height - barHeight, width, barHeight);

        // Teks putih anti-alias
        const fontSize = Math.max(12, Math.round(barHeight * 0.4));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkText, width / 2, height - (barHeight / 2));

        // 5. Ekspor WebP & Validasi Bobot
        const attemptCompression = (quality) => {
          return new Promise((res) => {
            canvas.toBlob((blob) => res(blob), 'image/webp', quality);
          });
        };

        const processBlob = async () => {
          let blob = await attemptCompression(0.80);
          
          // Jika size > 300KB (307200 bytes), turunkan kualitas
          if (blob.size > 307200) {
            blob = await attemptCompression(0.65);
          }
          resolve(blob);
        };

        processBlob().catch(reject);
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
};
