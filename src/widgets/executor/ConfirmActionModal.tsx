import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ShieldAlert, X } from 'lucide-react';
import { MODAL_BACKDROP_VARIANTS, MODAL_PANEL_VARIANTS } from '@/shared/lib/motion';

export type ConfirmActionTone = 'danger' | 'warning' | 'primary';

export interface ConfirmActionDetail {
  label: string;
  value: string;
}

export interface ConfirmActionRequest {
  title: string;
  description: string;
  details?: ConfirmActionDetail[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmActionTone;
  /** Optional external URL (e.g. WhatsApp wa.me link) rendered as a native anchor to stay iframe-safe without window.open */
  confirmHref?: string;
  onConfirm?: () => void | Promise<void>;
}

interface ConfirmActionModalProps {
  request: ConfirmActionRequest | null;
  onClose: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({ request, onClose }) => {
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!request) {
      setIsPending(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [request, isPending, onClose]);

  const handleConfirmClick = async () => {
    if (!request || isPending) return;
    if (!request.onConfirm) {
      onClose();
      return;
    }
    setIsPending(true);
    try {
      await request.onConfirm();
      onClose();
    } catch {
      // Errors are surfaced by upstream handlers; unlock modal cleanly
      setIsPending(false);
    }
  };

  const tone: ConfirmActionTone = request?.tone || 'primary';

  const iconContainerClass =
    tone === 'danger'
      ? 'bg-[var(--tl-error-container)] text-[var(--tl-on-error-container)]'
      : tone === 'warning'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
      : 'bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)]';

  const confirmBtnClass =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : tone === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700 text-white'
      : 'bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)]';

  const IconComp =
    tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : CheckCircle2;

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          variants={MODAL_BACKDROP_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#0d1c2e]/65 backdrop-blur-xs"
          onClick={() => {
            if (!isPending) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
            aria-describedby="confirm-action-desc"
            variants={MODAL_PANEL_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={e => e.stopPropagation()}
            className="tech-lite-shell bg-[var(--tl-card)] text-[var(--tl-text)] rounded-t-3xl sm:rounded-2xl w-full max-w-[400px] shadow-2xl overflow-hidden"
          >
            {/* Header & Close */}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${iconContainerClass}`}
                >
                  <IconComp size={22} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2
                    id="confirm-action-title"
                    className="text-[15.5px] font-extrabold text-[var(--tl-text)] leading-snug"
                  >
                    {request.title}
                  </h2>
                  <p
                    id="confirm-action-desc"
                    className="text-xs text-[var(--tl-text-variant)] leading-relaxed mt-1"
                  >
                    {request.description}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={onClose}
                aria-label="Tutup dialog konfirmasi"
                className="w-8 h-8 rounded-full bg-[var(--tl-low)] hover:bg-[var(--tl-container)] text-[var(--tl-text-variant)] flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            {/* Optional Summary Details Box */}
            {request.details && request.details.length > 0 && (
              <div className="px-5 pb-3">
                <div className="rounded-xl bg-[var(--tl-low)] p-3 space-y-1.5 text-xs">
                  {request.details.map(item => (
                    <div key={item.label} className="flex items-start justify-between gap-3">
                      <span className="text-[var(--tl-text-variant)] shrink-0">{item.label}</span>
                      <strong className="text-[var(--tl-text)] font-bold text-right break-words">
                        {item.value}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Action Buttons (Thumb-friendly min-h-[46px]) */}
            <div className="px-5 pt-2 pb-6 sm:pb-5 flex items-center gap-2.5">
              <button
                type="button"
                disabled={isPending}
                onClick={onClose}
                className="flex-1 min-h-[46px] px-3 rounded-xl bg-[var(--tl-low)] hover:bg-[var(--tl-container)] text-[var(--tl-text)] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {request.cancelLabel || 'Batal'}
              </button>

              {request.confirmHref ? (
                <a
                  href={request.confirmHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (request.onConfirm) {
                      void request.onConfirm();
                    }
                    onClose();
                  }}
                  className={`flex-[1.35] min-h-[46px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all ${confirmBtnClass}`}
                >
                  <span>{request.confirmLabel || 'Ya, Lanjutkan'}</span>
                  <ExternalLink size={14} />
                </a>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleConfirmClick}
                  className={`flex-[1.35] min-h-[46px] px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 ${confirmBtnClass}`}
                >
                  {isPending && <Loader2 size={15} className="animate-spin" />}
                  <span>{isPending ? 'Memproses...' : request.confirmLabel || 'Ya, Lanjutkan'}</span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Reusable declarative confirmation hook for Technician action buttons.
 * Keeps component state clean without duplicating modal markup.
 */
export function useConfirmAction() {
  const [request, setRequest] = useState<ConfirmActionRequest | null>(null);

  const confirmAction = useCallback((req: ConfirmActionRequest) => {
    setRequest(req);
  }, []);

  const closeConfirm = useCallback(() => {
    setRequest(null);
  }, []);

  return {
    confirmRequest: request,
    confirmAction,
    closeConfirm,
  };
}
