import React from 'react';

/**
 * Standardized print footer for multi-page inventory reports.
 * Visible ONLY when printed (@media print).
 * Renders system metadata and dynamic "Page X of Y" pagination indicator.
 */
export default function PrintReportFooter({
  title = 'Laporan Inventaris',
  subtitle = '',
  tenantName = ''
}) {
  return (
    <div className="print-only print-footer-fixed" aria-hidden="true">
      <div className="print-footer-container">
        <div className="print-footer-left">
          <span className="print-footer-brand">BARVENTIS</span>
          {tenantName && <span> • {tenantName}</span>}
          <span> • {title}</span>
          {subtitle && <span> ({subtitle})</span>}
        </div>
        <div className="print-footer-right">
          <span className="page-x-of-y" />
        </div>
      </div>
    </div>
  );
}
