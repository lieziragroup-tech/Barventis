import React, { useRef, useState, useEffect } from 'react';
import { X, RefreshCw, Star, Lock, ArrowRight, EyeOff, PenTool, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmActionModal, useConfirmAction } from './ConfirmActionModal';

interface CustomerReviewFormModalProps {
  initialName?: string;
  initialRole?: string;
  initialPhone?: string;
  projectName?: string;
  onClose: () => void;
  onSubmit: (data: {
    customerName: string;
    customerPhone: string;
    customerFeedback: string;
    customerSignature: string;
  }) => void;
}

const QUICK_REVIEW_TAGS = [
  'Petugas Ramah',
  'Pekerjaan Rapi',
  'Tepat Waktu',
  'Penjelasan Jelas',
];

const RATING_LABELS: Record<number, string> = {
  0: 'Ketuk bintang untuk menilai layanan hari ini',
  1: '1 Bintang: Perlu Banyak Perbaikan',
  2: '2 Bintang: Kurang Memuaskan',
  3: '3 Bintang: Cukup Baik',
  4: '4 Bintang: Sangat Baik & Tepat Waktu',
  5: '5 Bintang: Sangat Puas & Bersih',
};

export const CustomerReviewFormModal: React.FC<CustomerReviewFormModalProps> = ({
  initialName = '',
  initialRole = 'PIC Utama',
  initialPhone = '',
  projectName,
  onClose,
  onSubmit,
}) => {
  const [step, setStep] = useState<'SIGN_STAGE' | 'STRICT_BLIND_EVAL_STAGE'>('SIGN_STAGE');
  const [name, setName] = useState(initialName);
  const [roleTitle, setRoleTitle] = useState(initialRole);
  const [phone, setPhone] = useState(initialPhone);
  const [lockedSignatureBase64, setLockedSignatureBase64] = useState('');

  // Confidential evaluation state (starts at 0 — wiped immediately on submit)
  const [rating, setRating] = useState<number>(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [error, setError] = useState('');
  const { confirmRequest, confirmAction, closeConfirm } = useConfirmAction();

  useEffect(() => {
    if (step !== 'SIGN_STAGE') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#012d1d';
  }, [step]);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => (prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]));
  };

  const handleProceedToStrictEval = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama penandatangan / PIC wajib diisi.');
      return;
    }
    if (!hasSignature) {
      setError('Silakan bubuhkan tanda tangan customer terlebih dahulu.');
      return;
    }
    const sigData = canvasRef.current?.toDataURL('image/png') || '';
    setLockedSignatureBase64(sigData);
    setError('');
    setStep('STRICT_BLIND_EVAL_STAGE');
  };

  const handleRequestClose = () => {
    if (hasSignature) {
      confirmAction({
        tone: 'danger',
        title: 'Batalkan Tanda Tangan Customer?',
        description: 'Goresan tanda tangan yang sudah dibuat akan dibuang dan Anda kembali ke Form Laporan.',
        confirmLabel: 'Ya, Batalkan',
        cancelLabel: 'Tetap di Sini',
        onConfirm: () => onClose(),
      });
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (step !== 'SIGN_STAGE') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmRequest) {
        handleRequestClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, hasSignature, confirmRequest]);

  const handleRequestClearSignature = () => {
    confirmAction({
      tone: 'danger',
      title: 'Hapus Tanda Tangan Customer?',
      description: 'Bidang tanda tangan akan dikosongkan sehingga customer perlu menggoreskan ulang.',
      confirmLabel: 'Ya, Bersihkan',
      onConfirm: () => clearSignature(),
    });
  };

  const executeFinalStrictSubmit = () => {
    const compiledFeedback = [
      `[STRICT_BLIND_PIC_REVIEW]`,
      `[Rating: ${rating}/5]`,
      roleTitle.trim() ? `[Jabatan: ${roleTitle.trim()}]` : '',
      selectedTags.length > 0 ? `[Penilaian: ${selectedTags.join(', ')}]` : '',
      feedback.trim() ? `[Catatan PIC: ${feedback.trim()}]` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const finalPayload = {
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerFeedback: compiledFeedback,
      customerSignature: lockedSignatureBase64,
    };

    // Immediately wipe confidential rating state from technician device memory
    setRating(0);
    setSelectedTags([]);
    setFeedback('');

    onSubmit(finalPayload);
  };

  const handleFinalStrictSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1 || rating > 5) {
      setError('Silakan pilih 1 hingga 5 bintang kepuasan.');
      return;
    }

    confirmAction({
      tone: 'primary',
      title: 'Selesaikan & Kunci Pekerjaan?',
      description:
        'Laporan kerja dan tanda tangan pengesahan akan dikunci permanen. Penilaian kepuasan langsung terkirim rahasia ke manajemen.',
      details: [
        { label: 'Penandatangan', value: name.trim() },
        ...(projectName ? [{ label: 'Lokasi', value: projectName }] : []),
      ],
      confirmLabel: 'Ya, Selesaikan WO',
      cancelLabel: 'Periksa Lagi',
      onConfirm: executeFinalStrictSubmit,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#233144]/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="tech-lite-shell bg-[var(--tl-card)] rounded-t-2xl sm:rounded-2xl w-full max-w-[430px] overflow-hidden flex flex-col max-h-[92dvh] shadow-2xl"
      >
        {/* Reference-matched Bottom-Sheet Header */}
        <div className="px-4 pt-4 pb-3 border-b border-[var(--tl-container)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[var(--tl-secondary-container)] text-[var(--tl-on-secondary-container)] flex items-center justify-center shrink-0">
              {step === 'SIGN_STAGE' ? <PenTool size={16} /> : <Star size={16} />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[14.5px] font-bold text-[var(--tl-text)] leading-tight truncate">
                {step === 'SIGN_STAGE' ? 'Tanda Tangan Customer' : 'Feedback Kualitas Pelayanan'}
              </h2>
              <p className="text-[11px] text-[var(--tl-text-variant)] truncate mt-0.5">
                {name ? `${name}${projectName ? ` · ${projectName}` : ''}` : projectName || 'Pengesahan Berita Acara'}
              </p>
            </div>
          </div>
          {step === 'SIGN_STAGE' && (
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Tutup"
              className="w-9 h-9 rounded-full bg-[var(--tl-container)] flex items-center justify-center text-[var(--tl-text)] hover:bg-[var(--tl-high)] cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {step === 'SIGN_STAGE' ? (
            <motion.form
              key="sign-stage"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.16 }}
              onSubmit={handleProceedToStrictEval}
              className="overflow-y-auto p-5 space-y-4 pb-6"
            >
              {error && (
                <div className="px-3.5 py-2.5 bg-[var(--tl-error-container)] rounded-xl text-[var(--tl-on-error-container)] text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Compact Pre-filled Recipient Info */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                    Nama Penandatangan
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nama PIC"
                    className="w-full h-11 px-3 bg-[var(--tl-low)] rounded-lg text-xs font-medium text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--tl-text-variant)] mb-1">
                    Jabatan / Status
                  </label>
                  <input
                    type="text"
                    value={roleTitle}
                    onChange={e => setRoleTitle(e.target.value)}
                    placeholder="Supervisor GA / PIC"
                    className="w-full h-11 px-3 bg-[var(--tl-low)] rounded-lg text-xs font-medium text-[var(--tl-text)] focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
                  />
                </div>
              </div>

              {/* Touch Signature Canvas Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--tl-text-variant)]">
                    Goreskan tanda tangan pada bidang di bawah:
                  </span>
                  {hasSignature && (
                    <button
                      type="button"
                      onClick={handleRequestClearSignature}
                      className="text-[11px] font-semibold text-[var(--tl-error)] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={13} /> Bersihkan
                    </button>
                  )}
                </div>
                <div className="h-48 rounded-xl bg-white border border-[var(--tl-container)] shadow-inner relative overflow-hidden touch-none">
                  {!hasSignature && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-slate-400 pointer-events-none text-xs font-medium">
                      <PenTool size={15} />
                      <span>Tanda tangan di sini</span>
                    </div>
                  )}
                  <canvas
                    ref={canvasRef}
                    onPointerDown={startDrawing}
                    onPointerMove={draw}
                    onPointerUp={stopDrawing}
                    onPointerOut={stopDrawing}
                    className="w-full h-full cursor-crosshair relative z-10"
                    style={{ touchAction: 'none' }}
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="flex-1 min-h-[48px] bg-[var(--tl-container)] text-[var(--tl-text)] font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-[2] min-h-[48px] bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <span>Lanjut ke Penilaian</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.form
              key="strict-eval-stage"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.16 }}
              onSubmit={handleFinalStrictSubmit}
              className="overflow-y-auto p-5 space-y-4 pb-6"
            >
              {/* Calm Privacy Assurance */}
              <div className="px-3.5 py-2.5 rounded-xl bg-[var(--tl-low)] flex items-center gap-2.5 text-xs text-[var(--tl-text-variant)]">
                <EyeOff size={16} className="text-[var(--tl-secondary)] shrink-0" />
                <span>Penilaian bersifat rahasia dan tidak ditampilkan di HP teknisi.</span>
              </div>

              {error && (
                <div className="px-3.5 py-2.5 bg-[var(--tl-error-container)] rounded-xl text-[var(--tl-on-error-container)] text-xs font-semibold">
                  {error}
                </div>
              )}

              {/* Confidential Customer Feedback Box */}
              <div className="bg-[var(--tl-low)] p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--tl-text)]">Kepuasan Layanan (Rahasia)</span>
                  <span className="text-[11px] font-semibold text-[var(--tl-secondary)]">1 Tap</span>
                </div>
                <p className="text-xs text-[var(--tl-text-variant)] leading-relaxed">
                  Bagaimana kepuasan Anda terhadap ketepatan waktu &amp; kerapihan kerja teknisi hari ini?
                </p>

                {/* Star Rating */}
                <div className="flex items-center justify-center gap-2.5 py-1.5">
                  {[1, 2, 3, 4, 5].map(star => {
                    const filled = star <= rating;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          setError('');
                          setRating(star);
                        }}
                        aria-label={`${star} bintang`}
                        className="w-11 h-11 rounded-xl bg-[var(--tl-card)] flex items-center justify-center shadow-xs active:scale-90 transition-transform cursor-pointer"
                      >
                        <Star
                          size={24}
                          className={
                            filled
                              ? 'fill-[var(--tl-secondary)] text-[var(--tl-secondary)]'
                              : 'text-[var(--tl-outline-variant)]'
                          }
                        />
                      </button>
                    );
                  })}
                </div>

                <p className="text-center text-xs font-bold text-[var(--tl-secondary)]">
                  {RATING_LABELS[rating]}
                </p>
              </div>

              {/* 4 Quick Positive Tags */}
              <div className="flex flex-wrap justify-center gap-1.5">
                {QUICK_REVIEW_TAGS.map(tag => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`min-h-[38px] px-3 rounded-full text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                        active
                          ? 'bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] shadow-xs'
                          : 'bg-[var(--tl-container)] text-[var(--tl-text-variant)] hover:text-[var(--tl-text)]'
                      }`}
                    >
                      {active ? '✓ ' : ''}{tag}
                    </button>
                  );
                })}
              </div>

              {/* Optional Short Note */}
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={2}
                placeholder="Tulis masukan singkat untuk manajemen (opsional)..."
                className="w-full p-3 bg-[var(--tl-low)] rounded-xl text-xs text-[var(--tl-text)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--tl-primary)]"
              />

              <button
                type="submit"
                className="w-full min-h-[48px] bg-[var(--tl-primary)] hover:bg-[var(--tl-primary-container)] text-[var(--tl-on-primary)] font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-transform cursor-pointer"
              >
                <CheckCircle2 size={17} />
                <span>Konfirmasi &amp; Selesaikan WO</span>
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--tl-text-variant)]">
                <Lock size={13} />
                <span>Data terenkripsi &amp; langsung terkirim ke koordinator.</span>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
      <ConfirmActionModal request={confirmRequest} onClose={closeConfirm} />
    </div>
  );
};
