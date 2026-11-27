import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Accessible native <dialog> wrapper following Modern Web Guidance 1.0
 * Provides top-layer rendering, built-in Escape handling, focus trapping,
 * and minimum 44px touch targets on mobile without unearned glassmorphism.
 */
export default function AppDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  maxWidth = '520px'
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open && typeof el.showModal === 'function') {
        el.showModal();
      }
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (onClose) onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current && onClose) onClose();
      }}
      style={{
        width: 'min(calc(100vw - 24px), ' + maxWidth + ')',
        maxHeight: '90vh',
        padding: 0,
        border: '1px solid var(--border-strong)',
        borderRadius: '14px',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        boxShadow: '0 20px 40px -12px rgba(0, 0, 0, 0.28)',
        margin: 'auto',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)'
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            {description && (
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {description}
              </p>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog"
              style={{
                minWidth: '44px',
                minHeight: '44px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              flexWrap: 'wrap'
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
