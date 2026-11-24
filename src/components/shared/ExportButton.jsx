import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

export default function ExportButton({
  onExportExcel,
  onExportPDF,
  disabled,
  allowedRoles,
  currentRole,
  label = 'Export',
  className = ''
}) {
  const [open, setOpen] = useState(false);
  const [loadingType, setLoadingType] = useState(null); // 'excel' | 'pdf' | null
  const containerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Role check only if allowedRoles is explicitly provided and currentRole exists
  if (allowedRoles && currentRole && !allowedRoles.includes(currentRole)) {
    return null;
  }

  const handleExport = async (type) => {
    try {
      setLoadingType(type);
      if (type === 'excel' && onExportExcel) {
        await onExportExcel();
      } else if (type === 'pdf' && onExportPDF) {
        await onExportPDF();
      }
    } finally {
      setLoadingType(null);
      setOpen(false);
    }
  };

  const isBusy = !!loadingType;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }} className={`no-print ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled || isBusy}
        className="btn btn-secondary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '7px',
          padding: '8px 14px',
          fontSize: '0.85rem',
          opacity: (disabled || isBusy) ? 0.7 : 1,
          cursor: (disabled || isBusy) ? 'not-allowed' : 'pointer'
        }}
        aria-haspopup="true"
        aria-expanded={open}
        title="Download data tabel sebagai Excel atau PDF"
      >
        {isBusy ? (
          <Loader2 size={15} className="spin text-[var(--accent)]" />
        ) : (
          <Download size={15} />
        )}
        <span>{isBusy ? 'Mengekspor...' : label}</span>
        <ChevronDown size={13} style={{ opacity: 0.7, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg, 10px)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
            zIndex: 60,
            minWidth: '180px',
            overflow: 'hidden',
            padding: '4px'
          }}
          role="menu"
        >
          <div style={{ padding: '6px 10px 4px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Format Unduhan
          </div>

          {onExportExcel && (
            <button
              type="button"
              onClick={() => handleExport('excel')}
              disabled={isBusy}
              role="menuitem"
              style={{
                width: '100%',
                padding: '9px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md, 6px)',
                color: 'var(--text-primary)',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                transition: 'background 0.15s ease'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <FileSpreadsheet size={16} style={{ color: '#10b981', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>Excel (.xlsx)</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Spreadsheet & Formula</span>
              </div>
            </button>
          )}

          {onExportPDF && (
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={isBusy}
              role="menuitem"
              style={{
                width: '100%',
                padding: '9px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md, 6px)',
                color: 'var(--text-primary)',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                transition: 'background 0.15s ease'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              <FileText size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>PDF Document</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Dokumen Siap Cetak</span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
