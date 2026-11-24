import React from 'react';
import { getActivePdfBranding } from '../../services/pdfBrandingService';

/**
 * Standardized print footer for multi-page inventory reports.
 * Visible ONLY when printed (@media print).
 * Renders system metadata, optional Owner Umatis validation photo/badge, and page numbering.
 */
export default function PrintReportFooter({
  title = 'Laporan Inventaris',
  subtitle = '',
  tenantName = ''
}) {
  const branding = getActivePdfBranding();
  const showBrand = branding.enabled && Boolean(branding.logoDataUrl);

  return (
    <div className="print-only print-footer-fixed" aria-hidden="true">
      <div className="print-footer-container">
        <div className="print-footer-left" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {showBrand && (
            <img
              src={branding.logoDataUrl}
              alt={branding.validationLabel || 'Umatis'}
              style={{ width: '18px', height: '18px', objectFit: 'contain', borderRadius: '3px' }}
            />
          )}
          <span className="print-footer-brand">
            {showBrand ? (branding.validationLabel || 'Umatis Resto & Venue') : 'BARVENTIS'}
          </span>
          {tenantName && <span> • {tenantName}</span>}
          <span> • {title}</span>
          {subtitle && <span> ({subtitle})</span>}
          {showBrand && <span> • Dokumen Resmi Tervalidasi</span>}
        </div>
        <div className="print-footer-right">
          <span className="page-x-of-y" />
        </div>
      </div>
    </div>
  );
}
