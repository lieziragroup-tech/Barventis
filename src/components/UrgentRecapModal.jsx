import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, BellRing, Package, ArrowRight, CheckCircle2 } from 'lucide-react';

const SEVERITY_STYLES = {
  OVERDUE: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626' },
  TODAY: { bg: 'rgba(245, 158, 11, 0.12)', color: '#d97706' },
  SOON: { bg: 'rgba(16, 185, 129, 0.1)', color: '#059669' }
};

/**
 * Clean, minimalist, modern Urgent Notification Recap Modal.
 * Separates Urgent Action (PO H-2/overdue, Pending ACC, Transfers)
 * from Urgent Materials (Out-of-stock / Critical Low Stock).
 */
export default function UrgentRecapModal({
  isOpen = false,
  urgentActions = [],
  urgentMaterials = [],
  onNavigate,
  onClose
}) {
  const [activeTab, setActiveTab] = useState('ACTION');

  useEffect(() => {
    if (!isOpen) return;
    if (urgentActions.length > 0) setActiveTab('ACTION');
    else if (urgentMaterials.length > 0) setActiveTab('MATERIALS');
  }, [isOpen, urgentActions.length, urgentMaterials.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const items = activeTab === 'ACTION' ? urgentActions : urgentMaterials;
  const totalCount = urgentActions.length + urgentMaterials.length;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="urgent-recap-title"
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[480px] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            maxHeight: '82vh'
          }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3.5 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Pengingat Operasional ({totalCount})
              </div>
              <h2 id="urgent-recap-title" style={{ margin: '2px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Rekap Urgent Hari Ini
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup rekap urgent"
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Minimalist 2-Tab Pill Switcher */}
          <div className="px-5 pt-3.5 pb-2">
            <div
              className="grid grid-cols-2 gap-1 p-1 rounded-xl"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('ACTION')}
                className="py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                style={{
                  background: activeTab === 'ACTION' ? 'var(--bg-secondary)' : 'transparent',
                  color: activeTab === 'ACTION' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  boxShadow: activeTab === 'ACTION' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <BellRing size={14} />
                <span>Urgent Action</span>
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: urgentActions.length > 0 ? 'rgba(239,68,68,0.12)' : 'var(--bg-tertiary)',
                    color: urgentActions.length > 0 ? '#dc2626' : 'var(--text-muted)'
                  }}
                >
                  {urgentActions.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('MATERIALS')}
                className="py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                style={{
                  background: activeTab === 'MATERIALS' ? 'var(--bg-secondary)' : 'transparent',
                  color: activeTab === 'MATERIALS' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: 'none',
                  boxShadow: activeTab === 'MATERIALS' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <Package size={14} />
                <span>Urgent Materials</span>
                <span
                  className="px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: urgentMaterials.length > 0 ? 'rgba(245,158,11,0.14)' : 'var(--bg-tertiary)',
                    color: urgentMaterials.length > 0 ? '#d97706' : 'var(--text-muted)'
                  }}
                >
                  {urgentMaterials.length}
                </span>
              </button>
            </div>
          </div>

          {/* Item List */}
          <div className="px-5 py-3 overflow-y-auto flex-1 space-y-2">
            {items.length === 0 ? (
              <div className="py-10 text-center flex flex-col items-center gap-2">
                <CheckCircle2 size={28} style={{ color: 'var(--accent)' }} />
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Semua aman terkendali
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {activeTab === 'ACTION'
                    ? 'Tidak ada PO mendekati H-2 atau persetujuan yang tertunda.'
                    : 'Seluruh bahan baku masih di atas batas stok minimum.'}
                </p>
              </div>
            ) : (
              items.slice(0, 20).map((item) => {
                const badgeStyle = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.SOON;
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl flex items-center justify-between gap-3"
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0"
                          style={{ background: badgeStyle.bg, color: badgeStyle.color }}
                        >
                          {item.badge}
                        </span>
                        <span className="text-[13px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                          {item.title}
                        </span>
                      </div>
                      <div className="text-[11.5px] truncate" style={{ color: 'var(--text-secondary)' }}>
                        {item.subtitle}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.();
                        if (item.route) onNavigate?.(item.route);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        color: 'var(--accent)'
                      }}
                    >
                      <span>{item.actionLabel || 'Buka'}</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
              style={{ background: 'var(--accent)', color: '#ffffff', border: 'none' }}
            >
              Mengerti
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
