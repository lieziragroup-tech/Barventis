import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { CONFIRM_EVENT } from '../../utils/confirmDialog';

/**
 * Clean, minimalist, accessible global confirmation modal host.
 * Mounted once in App.jsx to replace all native window.confirm() popups.
 */
export default function ConfirmDialogHost() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e?.detail) setReq(e.detail);
    };
    window.__bvConfirmHostMounted = true;
    window.addEventListener(CONFIRM_EVENT, handler);
    return () => { window.__bvConfirmHostMounted = false; window.removeEventListener(CONFIRM_EVENT, handler); };
  }, []);

  useEffect(() => {
    if (!req) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        req.resolve(false);
        setReq(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [req]);

  if (!req) return null;

  const isDanger = req.tone === 'danger' || /hapus|delete|reset|batalkan/i.test(req.message || '');

  const closeWith = (result) => {
    req.resolve(result);
    setReq(null);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bv-confirm-title"
      onClick={() => closeWith(false)}
    >
      <div
        className="glass-card w-full max-w-md p-5 sm:p-6 shadow-xl"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: isDanger ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.14)',
                color: isDanger ? '#b91c1c' : '#b45309',
              }}
              aria-hidden="true"
            >
              <AlertTriangle size={18} />
            </div>
            <h3 id="bv-confirm-title" className="text-base font-bold text-[var(--text-primary)] m-0">
              {req.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => closeWith(false)}
            aria-label="Tutup dialog"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed m-0 mb-5 whitespace-pre-line">
          {req.message}
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={() => closeWith(false)}
            className="btn btn-secondary px-4 py-2.5 text-sm font-semibold min-h-[44px]"
          >
            {req.cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => closeWith(true)}
            className="btn px-4 py-2.5 text-sm font-bold min-h-[44px]"
            style={{
              background: isDanger ? '#dc2626' : 'var(--accent)',
              color: '#ffffff',
              border: 'none',
            }}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
