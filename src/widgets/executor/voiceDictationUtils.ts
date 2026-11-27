/**
 * Pure helper utilities for hands-free voice-to-text dictation in technician report forms.
 * Kept framework-agnostic for deterministic unit testing with node:test.
 */

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string; message?: string }) => void) | null;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    length: number;
    [index: number]: { transcript: string };
  }>;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

/**
 * Returns the browser's SpeechRecognition constructor if supported, otherwise null.
 */
export function getSpeechRecognitionConstructor(
  win: Record<string, unknown> | undefined = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)
    : undefined
): SpeechRecognitionConstructor | null {
  if (!win) return null;
  const ctor = (win.SpeechRecognition || win.webkitSpeechRecognition) as
    | SpeechRecognitionConstructor
    | undefined;
  return typeof ctor === 'function' ? ctor : null;
}

export function isSpeechRecognitionSupported(
  win: Record<string, unknown> | undefined = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)
    : undefined
): boolean {
  return getSpeechRecognitionConstructor(win) !== null;
}

/**
 * Capitalizes the first alphabetic character of a dictated phrase.
 */
export function capitalizeFirstChar(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Merges a newly finalized dictated transcript chunk onto existing textarea content
 * with clean spacing and natural sentence capitalization.
 */
export function mergeDictationText(existingText: string, finalTranscript: string): string {
  const cleanChunk = finalTranscript.replace(/\s+/g, ' ').trim();
  if (!cleanChunk) return existingText;

  if (!existingText || !existingText.trim()) {
    return capitalizeFirstChar(cleanChunk);
  }

  const endsWithWhitespace = /\s$/.test(existingText);
  const trimmedEnd = existingText.trimEnd();
  const startsNewSentence = /[.!?\n]$/.test(trimmedEnd);

  const formattedChunk = startsNewSentence ? capitalizeFirstChar(cleanChunk) : cleanChunk;
  const separator = endsWithWhitespace ? '' : ' ';

  return `${existingText}${separator}${formattedChunk}`;
}

/**
 * Builds a clean preview string combining committed text and in-progress interim speech.
 */
export function buildLiveDictationPreview(baseText: string, interimTranscript: string): string {
  const cleanInterim = interimTranscript.replace(/\s+/g, ' ').trim();
  if (!cleanInterim) return '';
  if (!baseText.trim()) return capitalizeFirstChar(cleanInterim);
  return cleanInterim;
}

/**
 * Extracts finalized and interim transcript strings from a Web Speech API result event.
 */
export function extractSpeechEventTranscripts(event: SpeechRecognitionResultEventLike): {
  finalText: string;
  interimText: string;
} {
  const finalParts: string[] = [];
  const interimParts: string[] = [];

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const transcript = result?.[0]?.transcript ?? '';
    if (!transcript.trim()) continue;
    if (result.isFinal) {
      finalParts.push(transcript.trim());
    } else {
      interimParts.push(transcript.trim());
    }
  }

  return {
    finalText: finalParts.join(' ').trim(),
    interimText: interimParts.join(' ').trim(),
  };
}

/**
 * Maps Web Speech API error codes into friendly, everyday Indonesian messages for field technicians.
 */
export function mapSpeechErrorToIndonesian(errorCode?: string | null): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Izin mikrofon belum aktif. Izinkan akses mikrofon di browser lalu coba lagi.';
    case 'no-speech':
      return 'Suara belum terdengar. Coba bicara lebih dekat ke mikrofon perangkat.';
    case 'audio-capture':
      return 'Mikrofon tidak terdeteksi pada perangkat ini. Pastikan mikrofon terhubung.';
    case 'network':
      return 'Koneksi internet tidak stabil untuk mengenali suara. Cek sinyal lalu coba lagi.';
    case 'aborted':
      return '';
    default:
      return 'Dikte suara terhenti sementara. Ketuk tombol mikrofon untuk mencoba lagi.';
  }
}
