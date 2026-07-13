import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();
export const useToast = () => useContext(ToastContext);

let toastIdCounter = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showSuccess = useCallback((msg) => addToast(msg, 'success'), [addToast]);
  const showError   = useCallback((msg) => addToast(msg, 'error', 6000), [addToast]);
  const showWarning = useCallback((msg) => addToast(msg, 'warning'), [addToast]);
  const showInfo    = useCallback((msg) => addToast(msg, 'info'), [addToast]);

  const typeConfig = {
    success: { bg: 'var(--success-glow)', border: 'rgba(5, 150, 105, 0.35)', color: 'var(--success)', icon: '✓' },
    error:   { bg: 'var(--danger-glow)', border: 'rgba(220, 38, 38, 0.35)', color: 'var(--danger)', icon: '✕' },
    warning: { bg: 'var(--warning-glow)',  border: 'rgba(217, 119, 6, 0.35)',  color: 'var(--warning)', icon: '⚠' },
    info:    { bg: 'var(--accent-glow)',  border: 'rgba(59, 130, 246, 0.35)',  color: 'var(--accent)', icon: 'ℹ' },
  };

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showWarning, showInfo }}>
      {children}
      {/* Toast Container */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '10px',
        zIndex: 99999,
        pointerEvents: 'none',
        minWidth: '320px',
        maxWidth: '480px',
      }}>
        {toasts.map(toast => {
          const cfg = typeConfig[toast.type] || typeConfig.info;
          return (
            <div
              key={toast.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'var(--glass-bg)',
                border: `1px solid ${cfg.border}`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: '10px',
                padding: '13px 16px',
                boxShadow: 'var(--card-shadow)',
                backdropFilter: 'blur(12px)',
                pointerEvents: 'all',
                animation: 'toastSlideIn 0.3s ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{
                width: '24px', height: '24px', borderRadius: '50%',
                background: cfg.bg, color: cfg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '800', flexShrink: 0,
              }}>{cfg.icon}</span>
              <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.4', fontWeight: '500' }}>
                {toast.message}
              </span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: '18px', lineHeight: '1',
                  padding: '2px 4px', flexShrink: 0,
                }}
              >×</button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </ToastContext.Provider>
  );
};
