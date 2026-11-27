import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  getMainGuideSectionCards,
  getSpotlightStepsForTopic,
  GuidePageId,
  GuideTopicId,
  isContextualSubpage,
  resolveDefaultTopicForPage,
  SpotlightStep,
  TECH_FULL_TOUR_STEPS,
} from './spotlightGuideSteps';

export const TECH_GUIDE_STORAGE_KEY = 'fw_tech_guide_done_v1';
export { TECH_FULL_TOUR_STEPS as TECH_TOUR_STEPS };
export type { SpotlightStep, GuidePageId, GuideTopicId };

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TechnicianSpotlightGuideProps {
  mode: 'idle' | 'prompt' | 'tour';
  currentPage: string;
  onNavigatePage: (page: GuidePageId) => void;
  onAcceptTour: (topic?: GuideTopicId) => void;
  onDismiss: () => void;
  onComplete: () => void;
}

export const TechnicianSpotlightGuide: React.FC<TechnicianSpotlightGuideProps> = ({
  mode,
  currentPage,
  onNavigatePage,
  onAcceptTour,
  onDismiss,
  onComplete,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<GuideTopicId>('all');
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));

  const isSubpage = isContextualSubpage(currentPage);
  const mainSectionCards = useMemo(() => getMainGuideSectionCards(), []);

  useEffect(() => {
    if (mode === 'prompt') {
      setSelectedTopic(resolveDefaultTopicForPage(currentPage));
      setStepIndex(0);
    } else if (mode === 'idle') {
      setTargetRect(null);
    }
  }, [mode, currentPage]);

  const activeSteps = useMemo(() => {
    const resolved = getSpotlightStepsForTopic(selectedTopic);
    return resolved.length > 0 ? resolved : TECH_FULL_TOUR_STEPS;
  }, [selectedTopic]);

  const safeIndex = Math.min(stepIndex, Math.max(0, activeSteps.length - 1));
  const currentStep = activeSteps[safeIndex];

  useEffect(() => {
    if (mode !== 'tour' || !currentStep) return;
    const mainTabs: GuidePageId[] = ['home', 'jobs', 'history', 'profile'];
    if (mainTabs.includes(currentStep.page) && currentPage !== currentStep.page) {
      onNavigatePage(currentStep.page);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [mode, currentStep, currentPage, onNavigatePage]);

  const measureCurrentTarget = useCallback(() => {
    if (mode !== 'tour' || !currentStep) {
      setTargetRect(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport({ width: vw, height: vh });

    const el = document.querySelector(`[data-tour="${currentStep.target}"]`) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setTargetRect(null);
      return;
    }

    const pad = 6;
    const top = Math.max(4, r.top - pad);
    const left = Math.max(4, r.left - pad);
    const right = Math.min(vw - 4, r.right + pad);
    const bottom = Math.min(vh - 4, r.bottom + pad);

    setTargetRect({
      top,
      left,
      width: Math.max(24, right - left),
      height: Math.max(24, bottom - top),
    });
  }, [mode, currentStep]);

  useLayoutEffect(() => {
    if (mode !== 'tour' || !currentStep) return;

    const scrollAndMeasure = () => {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        const isStickyBottom =
          currentStep.target.startsWith('nav-') || currentStep.target === 'summary-actions';
        const isTopHeader = currentStep.target === 'header-status';

        if (!isStickyBottom && !isTopHeader) {
          const outOfView = rect.top < 72 || rect.bottom > window.innerHeight - 185;
          if (outOfView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (isTopHeader && window.scrollY > 20) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      measureCurrentTarget();
    };

    scrollAndMeasure();
    const t0 = window.setTimeout(scrollAndMeasure, 70);
    const t1 = window.setTimeout(measureCurrentTarget, 220);
    const t2 = window.setTimeout(measureCurrentTarget, 440);

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
  }, [mode, currentStep, currentPage, measureCurrentTarget]);

  useEffect(() => {
    if (mode === 'idle') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, onDismiss]);

  if (mode === 'idle') return null;

  const startTopicTour = (topic: GuideTopicId) => {
    setSelectedTopic(topic);
    setStepIndex(0);
    onAcceptTour(topic);
  };

  // =========================================================================
  // PHASE 1: CLEAN MINIMAL GUIDE SHEET (NO DECORATIVE ICON CLUTTER)
  // =========================================================================
  if (mode === 'prompt') {
    const contextualSteps = isSubpage ? getSpotlightStepsForTopic(currentPage) : [];
    const contextualHeading =
      currentPage === 'worksheet' ? 'Panduan Isi Laporan' : 'Panduan Hasil Laporan & PDF';
    const contextualDesc =
      currentPage === 'worksheet'
        ? 'Langkah singkat cara simpan lokasi GPS, isi temuan, rekam suara, sampai tanda tangan.'
        : 'Cara cek peta lokasi, foto bukti, simpan PDF ke HP, dan kirim lewat WhatsApp.';

    return (
      <AnimatePresence>
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#070c12]/70 backdrop-blur-xs"
          onClick={onDismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-prompt-title"
            data-testid="spotlight-guide-prompt"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            className="tech-lite-shell bg-[var(--tl-card)] text-[var(--tl-text)] border border-[var(--tl-border)] rounded-t-2xl sm:rounded-2xl w-full max-w-[390px] shadow-2xl overflow-hidden"
          >
            {/* Header — Plain Typography + Functional Close Button Only */}
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2
                    id="guide-prompt-title"
                    className="text-[17px] font-bold text-[var(--tl-text)] leading-snug"
                  >
                    {isSubpage ? contextualHeading : 'Panduan Aplikasi'}
                  </h2>
                  <p className="text-[13px] text-[var(--tl-text-variant)] leading-relaxed">
                    {isSubpage
                      ? contextualDesc
                      : 'Pilih menu yang ingin dipelajari, atau mulai dari awal.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Tutup panduan"
                  className="w-8 h-8 rounded-lg hover:bg-[var(--tl-low)] text-[var(--tl-text-variant)] hover:text-[var(--tl-text)] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {isSubpage ? (
                <ol className="rounded-xl border border-[var(--tl-border)] divide-y divide-[var(--tl-border)] overflow-hidden">
                  {contextualSteps.map((step, idx) => (
                    <li
                      key={step.id}
                      className="px-3.5 py-2.5 flex items-baseline gap-2.5 text-[13px] bg-[var(--tl-card)]"
                    >
                      <span className="font-mono text-[11.5px] font-semibold text-[var(--tl-text-variant)] tabular-nums shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="font-medium text-[var(--tl-text)]">
                        {step.title}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="space-y-3">
                  {/* Single Divided Grid Container — Zero Nested Card Clutter */}
                  <div className="rounded-xl border border-[var(--tl-border)] overflow-hidden">
                    <div className="px-3.5 py-2 bg-[var(--tl-low)] border-b border-[var(--tl-border)] flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[var(--tl-text)]">Pilih bagian</span>
                      <span className="text-[var(--tl-text-variant)] tabular-nums">
                        {TECH_FULL_TOUR_STEPS.length} langkah
                      </span>
                    </div>
                    <div className="grid grid-cols-2 bg-[var(--tl-border)] gap-px">
                      {mainSectionCards.map(sec => (
                        <button
                          key={sec.id}
                          type="button"
                          data-testid={`guide-topic-${sec.id}`}
                          onClick={() => startTopicTour(sec.id)}
                          className="p-3.5 bg-[var(--tl-card)] hover:bg-[var(--tl-low)] text-left transition-colors cursor-pointer flex flex-col justify-start gap-1"
                        >
                          <div className="w-full flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-bold text-[var(--tl-text)]">
                              {sec.label}
                            </span>
                            <span className="text-[11px] text-[var(--tl-text-variant)] tabular-nums shrink-0">
                              {sec.stepCount}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-[var(--tl-text-variant)] leading-snug">
                            {sec.subtitle}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Plain Quiet Footnote — No Sparkle Icon, No Extra Box */}
                  <p className="text-[12px] text-[var(--tl-text-variant)] leading-relaxed">
                    Untuk panduan isi laporan dan simpan PDF, tekan tombol{' '}
                    <strong className="text-[var(--tl-text)]">?</strong> saat membuka tugas.
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 pb-6 sm:pb-4 border-t border-[var(--tl-border)] bg-[var(--tl-low)]/60 flex items-center gap-2.5">
              <button
                type="button"
                onClick={onDismiss}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-[var(--tl-card)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[var(--tl-text)] text-[13px] font-semibold cursor-pointer transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                data-testid="guide-start-all-btn"
                onClick={() => startTopicTour(isSubpage ? currentPage : 'all')}
                className="flex-[1.45] min-h-[42px] px-4 rounded-xl bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] text-[13px] font-bold active:scale-[0.98] cursor-pointer transition-colors"
              >
                {isSubpage ? 'Mulai Panduan' : 'Mulai dari Awal'}
              </button>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  }

  // =========================================================================
  // PHASE 2: INTERACTIVE SPOTLIGHT OVERLAY
  // =========================================================================
  const totalSteps = activeSteps.length;
  const isFirst = safeIndex === 0;
  const isLast = safeIndex >= totalSteps - 1;
  const progressPct = Math.round(((safeIndex + 1) / totalSteps) * 100);

  const tooltipStyle: { left: number; width: number; top?: number; bottom?: number } = (() => {
    const horizontalMargin = 12;
    const cardWidth = Math.min(366, viewport.width - horizontalMargin * 2);
    const left = Math.max(horizontalMargin, Math.round((viewport.width - cardWidth) / 2));

    if (!targetRect) {
      return { left, width: cardWidth, bottom: 24 };
    }

    const spaceBelow = viewport.height - (targetRect.top + targetRect.height);
    const spaceAbove = targetRect.top;

    if (spaceBelow >= 230 || (spaceBelow >= spaceAbove && spaceBelow >= 185)) {
      return {
        left,
        width: cardWidth,
        top: Math.min(viewport.height - 220, targetRect.top + targetRect.height + 14),
      };
    }

    if (spaceAbove >= 210) {
      return {
        left,
        width: cardWidth,
        bottom: Math.max(16, viewport.height - targetRect.top + 14),
      };
    }

    return {
      left,
      width: cardWidth,
      bottom: 16,
    };
  })();

  return (
    <div
      className="fixed inset-0 z-[150] pointer-events-auto"
      role="dialog"
      aria-modal="true"
      data-testid="spotlight-guide-overlay"
      aria-label={`Panduan Aplikasi: ${currentStep.title}`}
    >
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto"
        width={viewport.width}
        height={viewport.height}
        aria-hidden="true"
      >
        <defs>
          <mask id="tech-spotlight-cutout-mask">
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="16"
                ry="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width={viewport.width}
          height={viewport.height}
          fill="rgba(5, 9, 15, 0.84)"
          mask="url(#tech-spotlight-cutout-mask)"
        />
      </svg>

      {targetRect && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none rounded-2xl transition-all duration-200 ease-out"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            border: '2.5px solid #ffffff',
            boxShadow: '0 0 0 4px rgba(255, 255, 255, 0.22), 0 12px 32px rgba(0, 0, 0, 0.5)',
          }}
        />
      )}

      <motion.div
        key={currentStep.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        style={tooltipStyle}
        data-testid="spotlight-guide-card"
        className="fixed z-[151] tech-lite-shell bg-[var(--tl-card)] text-[var(--tl-text)] rounded-2xl shadow-2xl border border-[var(--tl-border-strong)] overflow-hidden"
      >
        <div className="h-1 w-full bg-[var(--tl-low)]">
          <div
            className="h-full bg-[var(--tl-secondary)] transition-all duration-200"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-[var(--tl-border)]">
            <div className="flex items-center gap-1.5 min-w-0 text-[12px]">
              <span
                data-testid="spotlight-section-label"
                className="font-semibold text-[var(--tl-primary)] dark:text-[var(--tl-secondary)] truncate"
              >
                {currentStep.sectionLabel}
              </span>
              <span className="text-[var(--tl-outline)]" aria-hidden="true">·</span>
              <span
                data-testid="spotlight-step-counter"
                className="text-[var(--tl-text-variant)] tabular-nums shrink-0"
              >
                {safeIndex + 1} dari {totalSteps}
              </span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Tutup panduan"
              className="w-7 h-7 rounded-lg hover:bg-[var(--tl-low)] text-[var(--tl-text-variant)] hover:text-[var(--tl-text)] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-[15px] font-bold leading-snug text-[var(--tl-text)]">
              {currentStep.title}
            </h3>
            <p className="text-[13px] leading-relaxed text-[var(--tl-text-variant)]">
              {currentStep.description}
            </p>
            {currentStep.tip && (
              <p className="text-[12px] leading-snug text-[var(--tl-text-variant)] pt-1">
                Catatan: {currentStep.tip}
              </p>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            {isFirst ? (
              <button
                type="button"
                onClick={onDismiss}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--tl-border)] text-[12.5px] font-semibold text-[var(--tl-text-variant)] hover:bg-[var(--tl-low)] cursor-pointer transition-colors"
              >
                Tutup
              </button>
            ) : (
              <button
                type="button"
                data-testid="spotlight-prev-btn"
                onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                className="min-h-[40px] px-3.5 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] border border-[var(--tl-border)] text-[12.5px] font-semibold text-[var(--tl-text)] cursor-pointer transition-colors"
              >
                Kembali
              </button>
            )}

            <button
              type="button"
              data-testid="spotlight-next-btn"
              onClick={() => {
                if (isLast) {
                  onComplete();
                } else {
                  setStepIndex(i => Math.min(totalSteps - 1, i + 1));
                }
              }}
              className="min-h-[40px] px-4 rounded-xl bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] text-[12.5px] font-bold active:scale-[0.98] cursor-pointer transition-colors"
            >
              {isLast ? 'Selesai' : 'Lanjut'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
