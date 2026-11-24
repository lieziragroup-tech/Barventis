import React, { useState, useEffect } from 'react';
import { ShieldCheck, Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import {
  hydrateBrandingFromTenantRecord,
  savePdfBranding,
  compressBrandImageFile
} from '../../services/pdfBrandingService';

/**
 * Shared settings card for managing the official Umatis PDF validation photo / watermark.
 * Accessible by BOTH Owner (in Pengaturan Resto) and Head Bar (in Berita Acara)
 * so Head Bar can update the document watermark without bothering the Owner.
 */
export default function PdfBrandingSettingsCard({ currentTenant, onToast, onUpdated }) {
  const [enabled, setEnabled] = useState(true);
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [validationLabel, setValidationLabel] = useState('Umatis Resto & Venue');
  const [meta, setMeta] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const hydrated = hydrateBrandingFromTenantRecord(currentTenant || { id: 'active' });
    setEnabled(hydrated.enabled !== false);
    setLogoDataUrl(hydrated.logoDataUrl || '');
    setValidationLabel(hydrated.validationLabel || currentTenant?.company_name || 'Umatis Resto & Venue');
    setMeta({ width: hydrated.logoWidth || 0, height: hydrated.logoHeight || 0 });
  }, [currentTenant]);

  const notify = (msg, type = 'success') => {
    if (typeof onToast === 'function') {
      onToast(msg, type);
    } else {
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: msg, type } }));
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSaving(true);
      const { dataUrl, width, height } = await compressBrandImageFile(file, 480);
      setLogoDataUrl(dataUrl);
      setMeta({ width, height });
      setEnabled(true);
      const res = await savePdfBranding(currentTenant?.id, {
        enabled: true,
        logoDataUrl: dataUrl,
        logoWidth: width,
        logoHeight: height,
        validationLabel: validationLabel || currentTenant?.company_name || 'Umatis Resto & Venue'
      });
      onUpdated?.(res.branding);
      notify('Watermark & foto validasi PDF Umatis tersimpan dan langsung aktif.', 'success');
    } catch (err) {
      notify(err.message || 'Gagal memproses foto validasi.', 'error');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleToggle = async (e) => {
    const nextVal = e.target.checked;
    setEnabled(nextVal);
    const res = await savePdfBranding(currentTenant?.id, {
      enabled: nextVal,
      logoDataUrl,
      logoWidth: meta.width,
      logoHeight: meta.height,
      validationLabel
    });
    onUpdated?.(res.branding);
    notify(`Watermark PDF ${nextVal ? 'diaktifkan' : 'dimatikan'}.`, 'info');
  };

  const handleSaveLabel = async () => {
    try {
      setSaving(true);
      const res = await savePdfBranding(currentTenant?.id, {
        enabled,
        logoDataUrl,
        logoWidth: meta.width,
        logoHeight: meta.height,
        validationLabel: validationLabel || currentTenant?.company_name || 'Umatis Resto & Venue'
      });
      onUpdated?.(res.branding);
      notify('Label validasi dokumen PDF berhasil disimpan.', 'success');
    } catch (err) {
      notify('Gagal menyimpan setelan PDF: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    try {
      setSaving(true);
      setLogoDataUrl('');
      setMeta({ width: 0, height: 0 });
      setEnabled(false);
      const res = await savePdfBranding(currentTenant?.id, {
        enabled: false,
        logoDataUrl: '',
        logoWidth: 0,
        logoHeight: 0,
        validationLabel
      });
      onUpdated?.(res.branding);
      notify('Foto watermark PDF dihapus.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '16px', background: 'rgba(13, 148, 136, 0.05)', border: '1px solid rgba(13, 148, 136, 0.25)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} style={{ color: '#0d9488' }} /> Watermark & Foto Validasi Dokumen PDF
          </h4>
          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Logo atau foto resmi Umatis yang dipasang di sini otomatis tampil di kop, stempel, dan watermark semua Export PDF (PO, Berita Acara, Gelas & Alat, dan Laporan).
          </p>
        </div>
        <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
          <input type="checkbox" checked={enabled} onChange={handleToggle} style={{ opacity: 0, width: 0, height: 0 }} />
          <span style={{
            position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: enabled ? '#0d9488' : 'var(--surface-active)',
            border: '1px solid ' + (enabled ? '#0d9488' : 'var(--border)'),
            transition: '.3s', borderRadius: '34px'
          }}>
            <span style={{
              position: 'absolute', height: '18px', width: '18px', left: '2px', bottom: '2px',
              backgroundColor: enabled ? '#ffffff' : 'var(--text-muted)',
              transition: '.3s', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              transform: enabled ? 'translateX(20px)' : 'translateX(0)'
            }} />
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '10px',
          border: '1px dashed var(--border)', background: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
        }}>
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="Watermark Umatis" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '4px' }} />
          ) : (
            <ImageIcon size={22} style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <label className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Upload size={13} /> {logoDataUrl ? 'Ganti Foto Watermark' : 'Upload Foto Umatis'}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} disabled={saving} style={{ display: 'none' }} />
            </label>
            {logoDataUrl && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRemove}
                disabled={saving}
                style={{ padding: '6px 10px', fontSize: '0.76rem', color: 'var(--danger-text)', borderColor: 'var(--danger)' }}
              >
                <Trash2 size={12} style={{ marginRight: '4px' }} /> Hapus
              </button>
            )}
          </div>
          <small style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
            Format PNG/JPG/WebP (maks 5 MB). Perubahan dari Head Bar langsung aktif tanpa perlu merepotkan Owner.
          </small>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="form-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
            Nama Validasi di Stempel PDF
          </label>
          <input
            type="text"
            className="form-control"
            value={validationLabel}
            onChange={(e) => setValidationLabel(e.target.value)}
            placeholder="Contoh: Umatis Resto & Venue"
            style={{ width: '100%', padding: '7px 10px', fontSize: '0.8rem' }}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleSaveLabel}
          disabled={saving}
          style={{ padding: '7px 12px', fontSize: '0.78rem', fontWeight: 600 }}
        >
          {saving ? 'Menyimpan...' : 'Simpan Label'}
        </button>
      </div>
    </div>
  );
}
