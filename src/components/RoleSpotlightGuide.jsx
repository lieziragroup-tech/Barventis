import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getSpotlightGuideForRole } from '../config/roleSpotlightSteps';

/**
 * Interactive Role-Based Spotlight Guide for Barventis.
 * Adapted directly from TechnicianSpotlightGuide.tsx:
 * - Phase 1 (prompt): Clean minimal guide sheet with 2-column divided topic grid & "Mulai dari Awal"
 * - Phase 2 (tour): SVG cutout spotlight overlay targeting [data-tour="..."] + auto-navigation + floating tooltip card
 */
export default function RoleSpotlightGuide({
  mode = 'idle', // 'idle' | 'prompt' | 'tour'
  role = '',
  isHeadBarUser = false,
  basePath = '/dashboard',
  currentLocation = '',
  onNavigateRoute,
  onAcceptTour,
  onDismiss,
  onComplete
}) {
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720
  }));

  const roleGuide = useMemo(
    () => getSpotlightGuideForRole(role, isHeadBarUser, basePath),
    [role, isHeadBarUser, basePath]
  );

  useEffect(() => {
    if (mode === 'prompt') {
      setSelectedTopic('all');
      setStepIndex(0);
    } else if (mode === 'idle') {
      setTargetRect(null);
    }
  }, [mode]);

  const activeSteps = useMemo(() => {
    if (selectedTopic === 'all') return roleGuide.allSteps;
    const filtered = roleGuide.allSteps.filter((s) => s.topic === selectedTopic);
    return filtered.length > 0 ? filtered : roleGuide.allSteps;
  }, [roleGuide.allSteps, selectedTopic]);

  const safeIndex = Math.min(stepIndex, Math.max(0, activeSteps.length - 1));
  const currentStep = activeSteps[safeIndex];

  // Auto-navigate to the step's target route when touring across modules
  useEffect(() => {
    if (mode !== 'tour' || !currentStep?.route || typeof onNavigateRoute !== 'function') return;
    if (currentLocation !== currentStep.route) {
      onNavigateRoute(currentStep.route);
    }
  }, [mode, currentStep, currentLocation, onNavigateRoute]);

  const measureCurrentTarget = useCallback(() => {
    if (mode !== 'tour' || !currentStep) {
      setTargetRect(null);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport({ width: vw, height: vh });

    const isMobile = vw < 768;
    const navSlug = currentStep.navTarget || (currentStep.target ? currentStep.target.replace(/^nav-/, '') : '');
    const candidates = isMobile
      ? [
          navSlug ? `[data-tour="mob-${navSlug}"]` : null,
          currentStep.target ? `[data-tour="${currentStep.target}"]` : null,
          '[data-tour="main-workspace"]'
        ]
      : [
          navSlug ? `[data-tour="nav-${navSlug}"]` : null,
          currentStep.target ? `[data-tour="${currentStep.target}"]` : null,
          '[data-tour="sidebar-nav"]',
          '[data-tour="main-workspace"]'
        ];
    let el = null;
    for (const sel of candidates.filter(Boolean)) {
      const found = document.querySelector(sel);
      if (found) {
        const rect = found.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) { el = found; break; }
      }
    }
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (!el) {
      setTargetRect(null);
      return;
    }

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      setTargetRect(null);
      return;
    }

    // Clamp spotlight height so huge main-workspace containers spotlight cleanly at the top fold
    const maxSpotlightH = Math.min(r.height, vh - 190);
    const pad = 6;
    const top = Math.max(6, r.top - pad);
    const left = Math.max(6, r.left - pad);
    const right = Math.min(vw - 6, r.right + pad);
    const bottom = Math.min(vh - 6, r.top + maxSpotlightH + pad);

    setTargetRect({
      top,
      left,
      width: Math.max(32, right - left),
      height: Math.max(32, bottom - top)
    });
  }, [mode, currentStep]);

  useLayoutEffect(() => {
    if (mode !== 'tour' || !currentStep) return;

    const scrollAndMeasure = () => {
      const el = currentStep.target ? document.querySelector(`[data-tour="${currentStep.target}"]`) : null;
      if (el && currentStep.target !== 'main-workspace' && currentStep.target !== 'header-bar') {
        const rect = el.getBoundingClientRect();
        if (rect.top < 72 || rect.bottom > window.innerHeight - 190) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      measureCurrentTarget();
    };

    scrollAndMeasure();
    const t0 = window.setTimeout(scrollAndMeasure, 90);
    const t1 = window.setTimeout(measureCurrentTarget, 260);
    const t2 = window.setTimeout(measureCurrentTarget, 520);

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
  }, [mode, currentStep, currentLocation, measureCurrentTarget]);

  useEffect(() => {
    if (mode === 'idle') return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onDismiss?.();
      } else if (mode === 'tour' && e.key === 'ArrowRight') {
        if (safeIndex < activeSteps.length - 1) setStepIndex((i) => i + 1);
      } else if (mode === 'tour' && e.key === 'ArrowLeft') {
        if (safeIndex > 0) setStepIndex((i) => i - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, safeIndex, activeSteps.length, onDismiss]);

  if (mode === 'idle') return null;

  const startTopicTour = (topicId) => {
    setSelectedTopic(topicId);
    setStepIndex(0);
    onAcceptTour?.(topicId);
  };

  // =========================================================================
  // PHASE 1: CLEAN MINIMAL GUIDE SHEET (Adapted from TechnicianSpotlightGuide)
  // =========================================================================
  if (mode === 'prompt') {
    return (
      <AnimatePresence>
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(7, 12, 18, 0.7)', backdropFilter: 'blur(3px)' }}
          onClick={onDismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-prompt-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)'
            }}
          >
            <div className="px-5 pt-5 pb-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Role: {roleGuide.roleLabel}
                  </div>
                  <h2 id="guide-prompt-title" className="text-[17px] font-bold leading-snug" style={{ margin: 0, color: 'var(--text-primary)' }}>
                    Panduan Barventis
                  </h2>
                  <p className="text-[13px] leading-relaxed" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                    Pilih bagian yang ingin kamu pelajari, atau mulai panduan langkah demi langkah dari awal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Tutup panduan"
                  className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Single Divided Grid Container — Zero Nested Card Clutter */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <div
                  className="px-3.5 py-2 flex items-center justify-between text-[12px]"
                  style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}
                >
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Pilih bagian</span>
                  <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {roleGuide.allSteps.length} langkah
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
                  {roleGuide.sectionCards.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => startTopicTour(sec.id)}
                      className="p-3.5 text-left transition-colors cursor-pointer flex flex-col justify-start gap-1"
                      style={{ background: 'var(--bg-secondary)', border: 'none' }}
                    >
                      <div className="w-full flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                          {sec.label}
                        </span>
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {sec.stepCount}
                        </span>
                      </div>
                      <p className="text-[11.5px] leading-snug" style={{ margin: 0, color: 'var(--text-secondary)' }}>
                        {sec.subtitle}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[12px] leading-relaxed" style={{ margin: 0, color: 'var(--text-muted)' }}>
                Panduan ini bisa dibuka kapan saja lewat tombol <strong style={{ color: 'var(--text-primary)' }}>Panduan</strong> di pojok kanan atas.
              </p>
            </div>

            <div
              className="px-5 py-3.5 pb-5 sm:pb-4 flex items-center gap-2.5"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}
            >
              <button
                type="button"
                onClick={onDismiss}
                className="flex-1 min-h-[42px] px-3 rounded-xl text-[13px] font-semibold cursor-pointer"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)'
                }}
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => startTopicTour('all')}
                className="flex-[1.45] min-h-[42px] px-4 rounded-xl text-[13px] font-bold cursor-pointer"
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#ffffff'
                }}
              >
                Mulai dari Awal
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
  if (!currentStep) return null;

  const totalSteps = activeSteps.length;
  const isFirst = safeIndex === 0;
  const isLast = safeIndex >= totalSteps - 1;
  const progressPct = Math.round(((safeIndex + 1) / totalSteps) * 100);

  const horizontalMargin = 16;
  const cardWidth = Math.min(380, viewport.width - horizontalMargin * 2);
  const tooltipStyle = (() => {
    const left = Math.max(horizontalMargin, Math.round((viewport.width - cardWidth) / 2));
    if (!targetRect) return { left, width: cardWidth, bottom: 24 };

    const spaceBelow = viewport.height - (targetRect.top + targetRect.height);
    if (spaceBelow >= 210) {
      return { left, width: cardWidth, top: Math.min(viewport.height - 220, targetRect.top + targetRect.height + 14) };
    }
    if (targetRect.top >= 210) {
      return { left, width: cardWidth, bottom: Math.max(16, viewport.height - targetRect.top + 14) };
    }
    return { left, width: cardWidth, bottom: 20 };
  })();

  return (
    <div
      className="fixed inset-0 z-[150] pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Panduan Barventis: ${currentStep.title}`}
    >
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto"
        width={viewport.width}
        height={viewport.height}
        aria-hidden="true"
      >
        <defs>
          <mask id="barventis-spotlight-cutout-mask">
            <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="14"
                ry="14"
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
          fill="rgba(5, 9, 15, 0.78)"
          mask="url(#barventis-spotlight-cutout-mask)"
        />
      </svg>

      {targetRect && (
        <motion.div
          aria-hidden="true"
          className="fixed pointer-events-none rounded-2xl"
          initial={{ opacity: 0.7, scale: 0.99 }}
          animate={{
            opacity: [0.85, 1, 0.85],
            scale: [1, 1.006, 1],
            boxShadow: [
              '0 0 0 3px rgba(16, 185, 129, 0.35), 0 12px 32px rgba(0, 0, 0, 0.45)',
              '0 0 0 7px rgba(16, 185, 129, 0.55), 0 14px 36px rgba(0, 0, 0, 0.5)',
              '0 0 0 3px rgba(16, 185, 129, 0.35), 0 12px 32px rgba(0, 0, 0, 0.45)'
            ]
          }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            border: '2px solid #ffffff'
          }}
        />
      )}

      <motion.div
        key={currentStep.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        style={{
          ...tooltipStyle,
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)'
        }}
        className="fixed z-[151] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="h-1 w-full" style={{ background: 'var(--bg-tertiary)' }}>
          <div className="h-full transition-all duration-200" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
        </div>

        <div className="p-4 space-y-3">
          <div
            className="flex items-center justify-between gap-2 pb-2"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="flex items-center gap-1.5 min-w-0 text-[12px]">
              <span className="font-semibold truncate" style={{ color: 'var(--accent)' }}>
                {currentStep.sectionLabel}
              </span>
              <span style={{ color: 'var(--text-muted)' }} aria-hidden="true">·</span>
              <span className="shrink-0" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {safeIndex + 1} dari {totalSteps}
              </span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Tutup panduan"
              className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer shrink-0"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {activeSteps.map((s, idx) => (
              <motion.span
                key={s.id}
                animate={{ width: idx === safeIndex ? 20 : 6, opacity: idx <= safeIndex ? 1 : 0.35 }}
                transition={{ duration: 0.2 }}
                style={{
                  height: '5px',
                  borderRadius: '999px',
                  background: idx <= safeIndex ? 'var(--accent)' : 'var(--text-muted)',
                  display: 'inline-block'
                }}
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-[15px] font-bold leading-snug" style={{ margin: 0, color: 'var(--text-primary)' }}>
              {currentStep.title}
            </h3>
            <p className="text-[13px] leading-relaxed" style={{ margin: 0, color: 'var(--text-secondary)' }}>
              {currentStep.description}
            </p>
            {currentStep.tip && (
              <p className="text-[12px] leading-snug pt-1" style={{ margin: 0, color: 'var(--text-muted)' }}>
                Catatan: {currentStep.tip}
              </p>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            {isFirst ? (
              <button
                type="button"
                onClick={onDismiss}
                className="min-h-[38px] px-3 rounded-xl text-[12.5px] font-semibold cursor-pointer"
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Tutup
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="min-h-[38px] px-3.5 rounded-xl text-[12.5px] font-semibold cursor-pointer"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              >
                Kembali
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLast) {
                  onComplete?.();
                } else {
                  setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
                }
              }}
              className="min-h-[38px] px-4 rounded-xl text-[12.5px] font-bold cursor-pointer"
              style={{ background: 'var(--accent)', border: 'none', color: '#ffffff' }}
            >
              {isLast ? 'Selesai' : 'Lanjut'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
