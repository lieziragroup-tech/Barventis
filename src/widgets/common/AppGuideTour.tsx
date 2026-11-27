import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  AppGuideScope,
  getAppGuideModuleCards,
  getAppGuideStepsForScope,
  resolveGuideModuleId,
} from './appGuideSteps';

export type AppGuideMode = 'idle' | 'hub' | 'tour';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface AppGuideTourProps {
  mode: AppGuideMode;
  userRole?: string | null;
  activeTab: string;
  availableModuleIds: string[];
  onNavigateTab: (tabId: string) => void;
  onStartTour: (scope: AppGuideScope) => void;
  onOpenRoleGuidebook?: () => void;
  onClose: () => void;
  onComplete: () => void;
}

export const AppGuideTour: React.FC<AppGuideTourProps> = ({
  mode,
  userRole,
  activeTab,
  availableModuleIds,
  onNavigateTab,
  onStartTour,
  onOpenRoleGuidebook,
  onClose,
  onComplete,
}) => {
  const [selectedScope, setSelectedScope] = useState<AppGuideScope>('all');
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  const currentModuleId = useMemo(() => resolveGuideModuleId(activeTab), [activeTab]);

  const moduleCards = useMemo(
    () => getAppGuideModuleCards(userRole, availableModuleIds, activeTab),
    [userRole, availableModuleIds, activeTab]
  );

  const currentModuleCard = useMemo(
    () => moduleCards.find(c => c.id === currentModuleId) ?? moduleCards[0],
    [moduleCards, currentModuleId]
  );

  const fullTourTotalSteps = useMemo(
    () => getAppGuideStepsForScope('all', userRole, availableModuleIds, activeTab).length,
    [userRole, availableModuleIds, activeTab]
  );

  const activeSteps = useMemo(() => {
    const resolved = getAppGuideStepsForScope(selectedScope, userRole, availableModuleIds, activeTab);
    return resolved.length > 0 ? resolved : getAppGuideStepsForScope('navigation', userRole, availableModuleIds, activeTab);
  }, [selectedScope, userRole, availableModuleIds, activeTab]);

  const safeIndex = Math.min(stepIndex, Math.max(0, activeSteps.length - 1));
  const currentStep = activeSteps[safeIndex];

  useEffect(() => {
    if (mode === 'idle') {
      setTargetRect(null);
      setStepIndex(0);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'tour' || !currentStep?.tabId) return;
    const currentResolved = resolveGuideModuleId(activeTab);
    const stepResolved = resolveGuideModuleId(currentStep.tabId);
    if (currentResolved !== stepResolved && activeTab !== currentStep.tabId) {
      onNavigateTab(currentStep.tabId);
    }
  }, [mode, currentStep, activeTab, onNavigateTab]);

  const measureCurrentTarget = useCallback(() => {
    if (mode !== 'tour' || !currentStep) {
      setTargetRect(null);
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport({ width: vw, height: vh });

    const el = document.querySelector(`[data-app-tour="${currentStep.target}"]`) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }

    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.right <= 0 || r.left >= vw) {
      setTargetRect(null);
      return;
    }

    const pad = 8;
    const top = Math.max(6, r.top - pad);
    const left = Math.max(6, r.left - pad);
    const right = Math.min(vw - 6, r.right + pad);
    const bottom = Math.min(vh - 6, r.bottom + pad);

    setTargetRect({
      top,
      left,
      width: Math.max(28, right - left),
      height: Math.max(28, bottom - top),
    });
  }, [mode, currentStep]);

  useLayoutEffect(() => {
    if (mode !== 'tour' || !currentStep) return;

    const scrollAndMeasure = () => {
      const el = document.querySelector(`[data-app-tour="${currentStep.target}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const isFixedChrome =
          currentStep.target === 'sidebar-nav' || currentStep.target === 'header-actions';
        if (!isFixedChrome && rect.width > 0 && rect.height > 0) {
          const outOfView = rect.top < 76 || rect.bottom > window.innerHeight - 160;
          if (outOfView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
      measureCurrentTarget();
    };

    scrollAndMeasure();
    const t0 = window.setTimeout(scrollAndMeasure, 90);
    const t1 = window.setTimeout(measureCurrentTarget, 260);
    const t2 = window.setTimeout(measureCurrentTarget, 500);

    const handleReposition = () => measureCurrentTarget();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [mode, currentStep, activeTab, measureCurrentTarget]);

  const handleNext = useCallback(() => {
    if (safeIndex >= activeSteps.length - 1) {
      onComplete();
    } else {
      setStepIndex(i => i + 1);
    }
  }, [safeIndex, activeSteps.length, onComplete]);

  const handlePrev = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    if (mode === 'idle') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (mode === 'tour' && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (mode === 'tour' && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onClose, handleNext, handlePrev]);

  if (mode === 'idle') return null;

  const launchScope = (scope: AppGuideScope) => {
    setSelectedScope(scope);
    setStepIndex(0);
    onStartTour(scope);
  };

  // =========================================================================
  // PHASE 1: CLEAN HUB PANDUAN APLIKASI (NO DECORATIVE ICON CLUTTER)
  // =========================================================================
  if (mode === 'hub') {
    const canStartCurrentModule =
      currentModuleCard && currentModuleCard.id !== 'navigation' && currentModuleCard.stepCount > 0;

    return (
      <AnimatePresence>
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-guide-hub-title"
          data-testid="app-guide-hub"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#0d1c13]/60 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
          >
            {/* Header — Clean Title & Functional Close Button Only */}
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 shrink-0">
              <div className="space-y-0.5 min-w-0">
                <h2
                  id="app-guide-hub-title"
                  className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)] leading-snug"
                >
                  Panduan Aplikasi
                </h2>
                <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Pilih halaman yang ingin dipelajari, atau mulai panduan lengkap dari awal.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup Panduan Aplikasi"
                className="w-8 h-8 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Contextual Active Module Row */}
              {canStartCurrentModule && (
                <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Halaman yang sedang dibuka · {currentModuleCard.stepCount} langkah
                    </p>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {currentModuleCard.label}
                    </h3>
                  </div>
                  <button
                    type="button"
                    data-testid="app-guide-start-current"
                    onClick={() => launchScope(currentModuleCard.id)}
                    className="h-9 px-4 rounded-lg bg-[#173f30] hover:bg-[#123326] text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                  >
                    Panduan Halaman Ini
                  </button>
                </div>
              )}

              {/* Clean Divided Module Grid */}
              <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                <div className="px-3.5 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">Semua bagian</span>
                  <span className="text-[var(--text-secondary)] tabular-nums">
                    {fullTourTotalSteps} langkah
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 bg-[var(--border-subtle)] gap-px">
                  {moduleCards.map(card => {
                    const isCurrent = card.id === currentModuleId;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        data-testid={`app-guide-module-${card.id}`}
                        onClick={() => launchScope(card.id)}
                        className={`text-left p-3.5 transition-colors cursor-pointer flex flex-col justify-start gap-1 ${
                          isCurrent
                            ? 'bg-[var(--accent-glow)]/40 hover:bg-[var(--accent-glow)]/60'
                            : 'bg-[var(--bg-card)] hover:bg-[var(--bg-primary)]'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-2 w-full">
                          <span className="text-[13px] font-bold text-[var(--text-primary)] truncate">
                            {card.label}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] shrink-0 tabular-nums">
                            {card.stepCount} langkah
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-snug">
                          {card.subtitle}
                        </p>
                      </button>
                    );
                  })}
                  {moduleCards.length % 2 === 1 && (
                    <div aria-hidden="true" className="hidden sm:block bg-[var(--bg-card)]" />
                  )}
                </div>
              </div>

              {/* Quiet Inline Link to Role Guidebook */}
              {onOpenRoleGuidebook && userRole !== 'MASTER_SUPER_ADMIN' && (
                <p className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-2">
                  <span>Butuh ringkasan tugas dan hak akses akun Anda?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRoleGuidebook();
                    }}
                    className="font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
                  >
                    Lihat ringkasan peran
                  </button>
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
              >
                Tutup
              </button>

              <button
                type="button"
                data-testid="app-guide-start-all"
                onClick={() => launchScope('all')}
                className="h-10 px-5 rounded-xl bg-[#173f30] hover:bg-[#123326] text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Mulai dari Awal ({fullTourTotalSteps} Langkah)
              </button>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  // =========================================================================
  // PHASE 2: INTERACTIVE SPOTLIGHT WALKTHROUGH
  // =========================================================================
  if (!currentStep) return null;

  const isFirst = safeIndex === 0;
  const isLast = safeIndex === activeSteps.length - 1;
  const progressPct = Math.round(((safeIndex + 1) / activeSteps.length) * 100);

  const cardWidth = Math.min(372, viewport.width - 24);
  const estimatedCardHeight = currentStep.tip ? 250 : 210;

  let cardStyle: { width: number; left: number; top: number };
  if (!targetRect) {
    cardStyle = {
      width: cardWidth,
      left: Math.max(12, Math.round((viewport.width - cardWidth) / 2)),
      top: Math.max(16, Math.round((viewport.height - estimatedCardHeight) / 2)),
    };
  } else {
    const spaceBelow = viewport.height - (targetRect.top + targetRect.height);
    const spaceAbove = targetRect.top;
    const spaceRight = viewport.width - (targetRect.left + targetRect.width);
    const spaceLeft = targetRect.left;

    const preferred = currentStep.placement || 'bottom';
    let top: number;
    let left: number;

    if (preferred === 'right' && spaceRight >= cardWidth + 24) {
      left = targetRect.left + targetRect.width + 14;
      top = Math.min(
        Math.max(16, targetRect.top),
        Math.max(16, viewport.height - estimatedCardHeight - 16)
      );
    } else if (preferred === 'left' && spaceLeft >= cardWidth + 24) {
      left = targetRect.left - cardWidth - 14;
      top = Math.min(
        Math.max(16, targetRect.top),
        Math.max(16, viewport.height - estimatedCardHeight - 16)
      );
    } else if (preferred === 'top' && spaceAbove >= estimatedCardHeight + 18) {
      top = targetRect.top - estimatedCardHeight - 14;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    } else if (spaceBelow >= estimatedCardHeight + 18) {
      top = targetRect.top + targetRect.height + 14;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    } else if (spaceAbove >= estimatedCardHeight + 18) {
      top = targetRect.top - estimatedCardHeight - 14;
      left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    } else {
      top = Math.max(16, Math.round((viewport.height - estimatedCardHeight) / 2));
      left = Math.round((viewport.width - cardWidth) / 2);
    }

    const clampedLeft = Math.min(Math.max(12, Math.round(left)), Math.max(12, viewport.width - cardWidth - 12));
    const clampedTop = Math.min(
      Math.max(12, Math.round(top)),
      Math.max(12, viewport.height - estimatedCardHeight - 12)
    );

    cardStyle = {
      width: cardWidth,
      left: clampedLeft,
      top: clampedTop,
    };
  }

  return (
    <div
      className="fixed inset-0 z-[110]"
      role="dialog"
      aria-modal="true"
      aria-label={`Panduan Aplikasi — ${currentStep.title}`}
      data-testid="app-guide-spotlight"
    >
      {targetRect ? (
        <motion.div
          key="spotlight-ring"
          initial={false}
          animate={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="fixed rounded-xl pointer-events-none"
          style={{
            boxShadow: '0 0 0 9999px rgba(13, 28, 19, 0.68)',
            border: '2px solid rgba(169, 201, 180, 0.95)',
          }}
        />
      ) : (
        <div
          className="fixed inset-0 bg-[#0d1c13]/68 backdrop-blur-[1.5px]"
          onClick={onClose}
        />
      )}

      <div
        className="fixed inset-0"
        onClick={e => e.stopPropagation()}
        aria-hidden="true"
      />

      <motion.div
        key={currentStep.id}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={cardStyle}
        className="fixed rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
      >
        <div className="h-1 w-full bg-[var(--bg-tertiary)]">
          <div
            className="h-full bg-[#173f30] dark:bg-emerald-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-4 space-y-3">
          {/* Clean Unboxed Section Label + Counter + Close */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 min-w-0 text-xs">
              <span className="font-semibold text-[var(--accent-text)] truncate">
                {currentStep.sectionLabel}
              </span>
              <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
              <span className="text-[var(--text-muted)] tabular-nums shrink-0">
                {safeIndex + 1} dari {activeSteps.length}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Keluar dari panduan"
              className="w-7 h-7 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center cursor-pointer transition-colors shrink-0"
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-sm sm:text-[15px] font-bold text-[var(--text-primary)] leading-snug">
              {currentStep.title}
            </h3>
            <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
              {currentStep.description}
            </p>
            {currentStep.tip && (
              <p className="text-xs text-[var(--text-muted)] pt-1 leading-snug">
                Catatan: {currentStep.tip}
              </p>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] px-1.5 py-1 cursor-pointer transition-colors"
            >
              Tutup
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  data-testid="app-guide-prev"
                  onClick={handlePrev}
                  className="h-9 px-3.5 rounded-lg bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer transition-colors"
                >
                  Kembali
                </button>
              )}

              <button
                type="button"
                data-testid="app-guide-next"
                onClick={handleNext}
                className="h-9 px-4 rounded-lg bg-[#173f30] hover:bg-[#123326] text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                {isLast ? 'Selesai' : 'Lanjut'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
