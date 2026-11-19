import { supabase } from '../lib/supabase';

const ACTIVE_BRANDING_KEY = 'barventis_pdf_branding_active_v1';
const TENANT_BRANDING_PREFIX = 'barventis_pdf_branding_v1_';

const DEFAULT_BRANDING = {
  enabled: true,
  logoDataUrl: '',
  logoWidth: 0,
  logoHeight: 0,
  validationLabel: 'Umatis Resto & Venue',
  updatedAt: null
};

function safeReadJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeWriteJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota / private mode issues gracefully
  }
}

export function getPdfBranding(tenantId) {
  const tenantKey = tenantId ? `${TENANT_BRANDING_PREFIX}${tenantId}` : null;
  const fromTenant = tenantKey ? safeReadJson(tenantKey) : null;
  const fromActive = safeReadJson(ACTIVE_BRANDING_KEY);
  const merged = {
    ...DEFAULT_BRANDING,
    ...(fromActive || {}),
    ...(fromTenant || {})
  };
  return merged;
}

export function getActivePdfBranding() {
  const active = safeReadJson(ACTIVE_BRANDING_KEY);
  return {
    ...DEFAULT_BRANDING,
    ...(active || {})
  };
}

export function hydrateBrandingFromTenantRecord(tenant) {
  if (!tenant?.id) return getPdfBranding(null);
  const local = getPdfBranding(tenant.id);
  const next = {
    ...local,
    logoDataUrl: tenant.pdf_logo_url || local.logoDataUrl || '',
    validationLabel:
      tenant.pdf_validation_label ||
      local.validationLabel ||
      tenant.company_name ||
      DEFAULT_BRANDING.validationLabel
  };
  if (tenant.pdf_logo_url && !local.logoDataUrl) {
    safeWriteJson(`${TENANT_BRANDING_PREFIX}${tenant.id}`, next);
    safeWriteJson(ACTIVE_BRANDING_KEY, next);
  }
  return next;
}

export async function savePdfBranding(tenantId, payload) {
  const current = getPdfBranding(tenantId);
  const next = {
    ...current,
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled,
    logoDataUrl: payload.logoDataUrl !== undefined ? String(payload.logoDataUrl || '') : current.logoDataUrl,
    logoWidth: payload.logoWidth !== undefined ? Number(payload.logoWidth || 0) : current.logoWidth,
    logoHeight: payload.logoHeight !== undefined ? Number(payload.logoHeight || 0) : current.logoHeight,
    validationLabel:
      payload.validationLabel !== undefined
        ? String(payload.validationLabel || '').trim() || DEFAULT_BRANDING.validationLabel
        : current.validationLabel,
    updatedAt: new Date().toISOString()
  };

  if (tenantId) {
    safeWriteJson(`${TENANT_BRANDING_PREFIX}${tenantId}`, next);
  }
  safeWriteJson(ACTIVE_BRANDING_KEY, next);

  // Best-effort cloud sync to Supabase `tenants` table if columns exist.
  // Fails silently if optional columns have not been migrated yet.
  let syncedCloud = false;
  if (tenantId) {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({
          pdf_logo_url: next.enabled ? (next.logoDataUrl || null) : null,
          pdf_validation_label: next.validationLabel,
          updated_at: next.updatedAt
        })
        .eq('id', tenantId);
      if (!error) syncedCloud = true;
    } catch {
      syncedCloud = false;
    }
  }

  return { branding: next, syncedCloud };
}

/**
 * Resize and compress an uploaded image file to a crisp, lightweight Data URL
 * suitable for jsPDF headers/stamps and fast browser storage.
 */
export function compressBrandImageFile(file, maxEdge = 480) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('File foto belum dipilih.'));
      return;
    }
    if (!file.type || !file.type.startsWith('image/')) {
      reject(new Error('Format file harus berupa gambar (PNG, JPG, atau WebP).'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Ukuran file maksimal 5 MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gambar tidak valid atau rusak.'));
      img.onload = () => {
        let targetW = img.naturalWidth || img.width;
        let targetH = img.naturalHeight || img.height;
        if (targetW > maxEdge || targetH > maxEdge) {
          const ratio = Math.min(maxEdge / targetW, maxEdge / targetH);
          targetW = Math.max(1, Math.round(targetW * ratio));
          targetH = Math.max(1, Math.round(targetH * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const isPng = file.type === 'image/png' || file.type === 'image/webp';
        let dataUrl = isPng
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.86);

        // If PNG payload is still large (> 180 KB), fallback to crisp JPEG on white bg
        if (dataUrl.length > 240000) {
          const jpgCanvas = document.createElement('canvas');
          jpgCanvas.width = targetW;
          jpgCanvas.height = targetH;
          const jctx = jpgCanvas.getContext('2d');
          jctx.fillStyle = '#ffffff';
          jctx.fillRect(0, 0, targetW, targetH);
          jctx.drawImage(img, 0, 0, targetW, targetH);
          dataUrl = jpgCanvas.toDataURL('image/jpeg', 0.82);
        }

        resolve({
          dataUrl,
          width: targetW,
          height: targetH
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function detectImageFormat(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

/**
 * Draws the Owner's official Umatis logo/photo into a jsPDF document header
 * without overlapping adjacent title text.
 * Returns { logoRendered, textOffsetX, headerBottomY, validationLabel }.
 */
export function drawPdfBrandHeaderLogo(doc, { marginX = 14, topY = 8, maxWidthMm = 18, maxHeightMm = 13 } = {}) {
  const branding = getActivePdfBranding();
  if (!branding.enabled || !branding.logoDataUrl) {
    return {
      logoRendered: false,
      textOffsetX: marginX,
      headerBottomY: 20.5,
      validationLabel: branding.validationLabel || ''
    };
  }

  try {
    const format = detectImageFormat(branding.logoDataUrl);
    const props = doc.getImageProperties(branding.logoDataUrl);
    const imgW = props?.width || branding.logoWidth || 100;
    const imgH = props?.height || branding.logoHeight || 100;
    const ratio = Math.min(maxWidthMm / imgW, maxHeightMm / imgH);
    const drawW = Math.max(6, imgW * ratio);
    const drawH = Math.max(6, imgH * ratio);
    const drawY = topY + (maxHeightMm - drawH) / 2;

    doc.addImage(branding.logoDataUrl, format, marginX, drawY, drawW, drawH, undefined, 'FAST');

    return {
      logoRendered: true,
      textOffsetX: marginX + drawW + 4,
      headerBottomY: Math.max(22.5, topY + maxHeightMm + 2),
      validationLabel: branding.validationLabel || 'Umatis Resto & Venue'
    };
  } catch {
    return {
      logoRendered: false,
      textOffsetX: marginX,
      headerBottomY: 20.5,
      validationLabel: branding.validationLabel || ''
    };
  }
}

/**
 * Draws the official Umatis validation stamp & footer line at the bottom of a jsPDF page.
 */
export function drawPdfValidationFooter(doc, marginX = 14) {
  const branding = getActivePdfBranding();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 9.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Halaman ${doc.internal.getNumberOfPages()}`, marginX, footerY);

  if (branding.enabled && branding.logoDataUrl) {
    const label = branding.validationLabel || 'Umatis Resto & Venue';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110);
    doc.text(`Dokumen Resmi Tervalidasi • ${label}`, pageWidth - marginX, footerY, { align: 'right' });
  }
}

/**
 * Draws a compact official validation seal block (mini photo + verified text)
 * right below the main table on the final page of a PDF document.
 */
export function drawPdfValidationSealBlock(doc, { marginX = 14, startY = null } = {}) {
  const branding = getActivePdfBranding();
  if (!branding.enabled || !branding.logoDataUrl) return;

  try {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const boxW = 68;
    const boxH = 19;
    let y = (startY ?? doc.lastAutoTable?.finalY ?? 120) + 8;

    if (y + boxH + 14 > pageHeight) {
      doc.addPage();
      y = 20;
    }

    const boxX = pageWidth - marginX - boxW;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.setLineWidth(0.3);
    doc.roundedRect(boxX, y, boxW, boxH, 2, 2, 'FD');

    const format = detectImageFormat(branding.logoDataUrl);
    const props = doc.getImageProperties(branding.logoDataUrl);
    const imgW = props?.width || 100;
    const imgH = props?.height || 100;
    const ratio = Math.min(13 / imgW, 13 / imgH);
    const drawW = Math.max(5, imgW * ratio);
    const drawH = Math.max(5, imgH * ratio);

    doc.addImage(
      branding.logoDataUrl,
      format,
      boxX + 3,
      y + (boxH - drawH) / 2,
      drawW,
      drawH,
      undefined,
      'FAST'
    );

    const textX = boxX + 3 + drawW + 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 118, 110);
    doc.text('TERVALIDASI RESMI', textX, y + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const label = String(branding.validationLabel || 'Umatis Resto & Venue').slice(0, 28);
    doc.text(label, textX, y + 11.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Dibuat via Barventis • ${new Date().toLocaleDateString('id-ID')}`, textX, y + 15.8);
  } catch {
    // Never fail PDF generation due to optional seal rendering
  }
}
