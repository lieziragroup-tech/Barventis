import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCircle2, ChevronRight, ClipboardList, CloudOff, X } from 'lucide-react';
import {
  MODAL_BACKDROP_VARIANTS,
  MOTION_EASE,
  MOTION_SPRING,
  SHEET_PANEL_VARIANTS,
  getStaggerDelay,
} from '@/shared/lib/motion';

export interface TechNotificationItem {
  id: string;
  category: 'task' | 'system';
  title: string;
  subtitle: string;
  timeLabel: string;
  unread?: boolean;
  onPress: () => void;
}

interface NotificationsSheetProps {
  items: TechNotificationItem[];
  onClose: () => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({ items, onClose }) => {
  const [tab, setTab] = useState<'all' | 'task' | 'system'>('all');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filtered = items.filter(item => {
    if (tab === 'task') return item.category === 'task';
    if (tab === 'system') return item.category === 'system';
    return true;
  });

  return (
    <motion.div
      variants={MODAL_BACKDROP_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#233144]/60 backdrop-blur-xs"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Pusat Notifikasi"
        variants={SHEET_PANEL_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={e => e.stopPropagation()}
        className="tech-lite-shell w-full max-w-[430px] max-h-[82dvh] rounded-t-2xl sm:rounded-2xl bg-[var(--tl-card)] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--tl-container)] mx-auto mt-3 mb-1 sm:hidden" />

        <div className="px-4 py-3 border-b border-[var(--tl-container)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--tl-low)] text-[var(--tl-primary)] flex items-center justify-center">
              <Bell size={15} />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[var(--tl-text)] leading-tight">Notifikasi</h2>
              <p className="text-[10.5px] text-[var(--tl-text-variant)]">Pembaruan tugas &amp; sinkronisasi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup notifikasi"
            className="w-9 h-9 rounded-full bg-[var(--tl-low)] flex items-center justify-center text-[var(--tl-text)] hover:bg-[var(--tl-container)] cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* 3 Filter Tabs */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-1.5">
          {([
            { id: 'all', label: 'Semua' },
            { id: 'task', label: 'Tugas' },
            { id: 'system', label: 'Sistem & Offline' },
          ] as const).map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative min-h-[34px] px-3 rounded-full text-[11.5px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'text-[var(--tl-on-primary)]'
                    : 'bg-[var(--tl-container)] text-[var(--tl-text-variant)] hover:text-[var(--tl-text)]'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="notif-sheet-active-tab"
                    transition={MOTION_SPRING.indicator}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[var(--tl-primary-container)] shadow-2xs pointer-events-none"
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Clean 2-Line List with Working Deep-Links */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-1 divide-y divide-[var(--tl-container)]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--tl-text-variant)]">
              Belum ada notifikasi pada kategori ini.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.16,
                  delay: getStaggerDelay(idx),
                  ease: MOTION_EASE.enter,
                }}
                onClick={() => {
                  onClose();
                  item.onPress();
                }}
                className="w-full py-3.5 text-left flex items-center gap-3 active:bg-[var(--tl-low)] transition-colors cursor-pointer"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    item.category === 'system'
                      ? 'bg-[var(--tl-container)] text-[var(--tl-primary)]'
                      : 'bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)]'
                  }`}
                >
                  {item.category === 'system' ? (
                    <CloudOff size={16} />
                  ) : item.unread ? (
                    <ClipboardList size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-xs font-semibold text-[var(--tl-text)] truncate">
                      {item.title}
                    </strong>
                    <span className="text-[10.5px] font-medium text-[var(--tl-secondary)] shrink-0">
                      {item.timeLabel}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[var(--tl-text-variant)] truncate mt-0.5">
                    {item.subtitle}
                  </p>
                </div>
                <ChevronRight size={15} className="text-[var(--tl-outline)] shrink-0" />
              </motion.button>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
