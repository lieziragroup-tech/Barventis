import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, AlertCircle } from 'lucide-react';
import {
  buildLiveDictationPreview,
  extractSpeechEventTranscripts,
  getSpeechRecognitionConstructor,
  mapSpeechErrorToIndonesian,
  mergeDictationText,
  type SpeechRecognitionLike,
} from './voiceDictationUtils';

interface VoiceDictationButtonProps {
  /** Current textarea value so dictated chunks append cleanly without overwriting manual edits. */
  value: string;
  /** Callback invoked whenever finalized speech text is appended to the textarea. */
  onChange: (nextValue: string) => void;
  /** BCP-47 speech recognition language code (defaults to Indonesian 'id-ID'). */
  lang?: string;
  /** Optional accessible label describing the target field. */
  fieldLabel?: string;
  /** Visual style preset matching TechnicianWorksheet ('lite') or modal forms ('compact'). */
  variant?: 'lite' | 'compact';
  disabled?: boolean;
}

export const VoiceDictationButton: React.FC<VoiceDictationButtonProps> = ({
  value,
  onChange,
  lang = 'id-ID',
  fieldLabel = 'catatan observasi',
  variant = 'lite',
  disabled = false,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const latestValueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
      try {
        rec.stop();
      } catch {
        // Ignore stop errors when recognizer is already idle
      }
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const startListening = useCallback(() => {
    if (disabled) return;
    setErrorMessage(null);

    const SpeechCtor = getSpeechRecognitionConstructor();
    if (!SpeechCtor) {
      setErrorMessage(
        'Perangkat atau browser ini belum mendukung dikte suara. Gunakan Chrome/Safari terbaru atau ketik manual.'
      );
      return;
    }

    try {
      const recognition = new SpeechCtor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMessage(null);
      };

      recognition.onresult = event => {
        const { finalText, interimText: liveInterim } = extractSpeechEventTranscripts(event);

        if (finalText) {
          const merged = mergeDictationText(latestValueRef.current, finalText);
          latestValueRef.current = merged;
          onChangeRef.current(merged);
        }

        setInterimText(buildLiveDictationPreview(latestValueRef.current, liveInterim));
      };

      recognition.onerror = event => {
        const msg = mapSpeechErrorToIndonesian(event?.error);
        if (msg) {
          setErrorMessage(msg);
        }
        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
      setErrorMessage('Gagal mengaktifkan mikrofon. Pastikan izin mikrofon tersedia lalu coba lagi.');
    }
  }, [disabled, lang]);

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const buttonClasses =
    variant === 'lite'
      ? isListening
        ? 'inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full bg-rose-600 text-white text-[11px] font-semibold shadow-sm active:scale-[0.98] transition-colors cursor-pointer'
        : 'inline-flex items-center gap-1.5 min-h-[34px] px-3 rounded-full bg-[var(--tl-primary)] text-[var(--tl-on-primary)] text-[11px] font-semibold active:scale-[0.98] transition-colors cursor-pointer disabled:opacity-45'
      : isListening
        ? 'inline-flex items-center gap-1.5 min-h-[30px] px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-semibold active:scale-[0.98] transition-colors cursor-pointer'
        : 'inline-flex items-center gap-1.5 min-h-[30px] px-2.5 rounded-lg bg-[#1B4332] text-white text-[11px] font-semibold active:scale-[0.98] transition-colors cursor-pointer disabled:opacity-45';

  return (
    <div className="space-y-1.5" data-testid="voice-dictation-control">
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            variant === 'lite'
              ? 'text-[11px] font-semibold text-[var(--tl-text)]'
              : 'text-[11px] font-semibold text-slate-700'
          }
        >
          Catatan Observasi &amp; Saran
        </span>
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-pressed={isListening}
          aria-label={
            isListening
              ? `Hentikan dikte suara untuk ${fieldLabel}`
              : `Mulai dikte suara untuk ${fieldLabel}`
          }
          data-testid="voice-dictation-btn"
          className={buttonClasses}
        >
          {isListening ? (
            <>
              <Square size={11} className="fill-current shrink-0" />
              <span>Berhenti Rekam</span>
            </>
          ) : (
            <>
              <Mic size={13} className="shrink-0" />
              <span>Dikte Suara</span>
            </>
          )}
        </button>
      </div>

      {isListening && (
        <div
          role="status"
          aria-live="polite"
          data-testid="voice-dictation-status"
          className={
            variant === 'lite'
              ? 'rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] text-rose-900 flex items-start gap-2'
              : 'rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-900 flex items-start gap-2'
          }
        >
          <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse mt-1 shrink-0" />
          <div className="min-w-0 leading-snug">
            <strong className="font-semibold block">
              Mendengarkan suara Anda (Bahasa Indonesia)…
            </strong>
            <span className="text-rose-800/90 break-words">
              {interimText
                ? `“${interimText}”`
                : 'Ucapkan temuan lapangan, teks akan otomatis masuk ke kotak catatan.'}
            </span>
          </div>
        </div>
      )}

      {errorMessage && !isListening && (
        <div
          role="alert"
          data-testid="voice-dictation-error"
          className={
            variant === 'lite'
              ? 'rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-2'
              : 'rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-900 flex items-start gap-2'
          }
        >
          <AlertCircle size={14} className="text-amber-700 shrink-0 mt-0.5" />
          <span className="leading-snug">{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
