import { useState } from 'react';
import { Download } from 'lucide-react';

export default function ExportButton({ onExportExcel, onExportPDF, disabled, allowedRoles = ['SuperAdmin', 'Admin / Owner', 'Manager'], currentRole }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!allowedRoles.includes(currentRole)) return null;

  const handleExport = async (type) => {
    try {
      setLoading(true);
      if (type === 'excel') await onExportExcel();
      else if (type === 'pdf') await onExportPDF();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button 
        onClick={() => setOpen(o => !o)} 
        disabled={disabled || loading}
        className="btn-secondary"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: (disabled || loading) ? 0.7 : 1 }}
      >
        <Download size={16}/> {loading ? 'Mengekspor...' : 'Export'}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
          zIndex: 50,
          minWidth: '150px',
          overflow: 'hidden'
        }}>
          {onExportExcel && (
            <button 
              onClick={() => handleExport('excel')}
              style={{
                width: '100%', padding: '10px 16px', textAlign: 'left',
                background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                color: 'var(--text)', cursor: 'pointer', fontSize: '0.875rem'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              Excel (.xlsx)
            </button>
          )}
          {onExportPDF && (
            <button 
              onClick={() => handleExport('pdf')}
              style={{
                width: '100%', padding: '10px 16px', textAlign: 'left',
                background: 'transparent', border: 'none',
                color: 'var(--text)', cursor: 'pointer', fontSize: '0.875rem'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--surface-hover)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              PDF Document
            </button>
          )}
        </div>
      )}
    </div>
  );
}
