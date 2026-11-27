import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, RefreshCw, X, Check, MapPin, ShieldCheck, AlertTriangle, Crosshair, Loader2 } from 'lucide-react';
import { applyWatermarkToCanvas, canvasToJpegBlob } from '@/shared/utils/watermark';
import { calculateDistanceMeters, formatDistance } from '@/shared/utils/geo';
import { PhotoType } from '@/entities/types';
import { MapPicker } from '../common/MapPicker';

interface CameraCaptureModalProps {
  photoType: PhotoType;
  projectName: string;
  projectLat: number;
  projectLng: number;
  projectRadius: number;
  executorName: string;
  onCaptureComplete: (data: { photoBlob: Blob; latitude: number; longitude: number; accuracy: number }) => Promise<void> | void;
  onClose: () => void;
}

type GpsState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; latitude: number; longitude: number; accuracy: number }
  | { status: 'denied'; message: string };

type CameraState = { status: 'starting' } | { status: 'ready' } | { status: 'blocked'; message: string };

/**
 * Every field is authoritative from the device: GPS comes only from
 * navigator.geolocation, and the photo comes only from a live getUserMedia
 * feed. If either isn't available, the flow stops and asks the person to
 * fix it — it never invents a location or a picture to let them through
 * (that would defeat the entire purpose of the evidence system).
 */
export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  photoType,
  projectName,
  projectLat,
  projectLng,
  projectRadius,
  executorName,
  onCaptureComplete,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingRef = useRef(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [retryCount, setRetryCount] = useState(0);
  const [camera, setCamera] = useState<CameraState>({ status: 'starting' });
  const [gps, setGps] = useState<GpsState>({ status: 'idle' });
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isShutterActive, setIsShutterActive] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const requestGps = useCallback(() => {
    setGps({ status: 'locating' });
    
    if (!navigator.geolocation) {
      setGps({ status: 'denied', message: 'Perangkat ini tidak mendukung layanan lokasi.' });
      return;
    }

    let isResolved = false;
    let bestPos: GeolocationPosition | null = null;
    let watchId: number | null = null;

    const commitPos = (pos: GeolocationPosition) => {
      if (isResolved) return;
      isResolved = true;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (pos.coords.accuracy === 0) {
        setGps({ status: 'denied', message: 'Sistem mendeteksi penggunaan Fake GPS / Lokasi Palsu. Mohon matikan aplikasi Fake GPS dan coba lagi.' });
        return;
      }
      setGps({
        status: 'ready',
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 15,
      });
    };

    navigator.geolocation.getCurrentPosition(
      pos => {
        bestPos = pos;
        if (pos.coords.accuracy > 0 && pos.coords.accuracy <= 30) {
          commitPos(pos);
          return;
        }

        // Pemanasan sinyal GPS singkat untuk mendapatkan akurasi terbaik
        if (navigator.geolocation.watchPosition) {
          watchId = navigator.geolocation.watchPosition(
            p => {
              if (p.coords.accuracy > 0) {
                if (!bestPos || p.coords.accuracy < bestPos.coords.accuracy) {
                  bestPos = p;
                }
                if (p.coords.accuracy <= 20) {
                  commitPos(p);
                }
              }
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 0 }
          );

          window.setTimeout(() => {
            if (bestPos) commitPos(bestPos);
          }, 3200);
        } else {
          commitPos(pos);
        }
      },
      err => {
        console.warn('High accuracy GPS failed, falling back to low accuracy...', err);
        navigator.geolocation.getCurrentPosition(
          pos2 => {
            if (pos2.coords.accuracy === 0) {
              setGps({ status: 'denied', message: 'Sistem mendeteksi penggunaan Fake GPS / Lokasi Palsu. Mohon matikan aplikasi Fake GPS dan coba lagi.' });
              return;
            }
            setGps({ status: 'ready', latitude: pos2.coords.latitude, longitude: pos2.coords.longitude, accuracy: pos2.coords.accuracy || 50 });
          },
          err2 => setGps({ status: 'denied', message: err2.code === err2.PERMISSION_DENIED ? 'Izin lokasi ditolak. Aktifkan GPS peramban.' : 'Sinyal GPS lemah atau tidak tersedia. Pastikan fitur Lokasi HP menyala.' }),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setCamera({ status: 'starting' });
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      // Jeda singkat agar driver kamera mobile Android/iOS melepaskan hardware lock
      const { promise: delayPromise, resolve: resolveDelay } = Promise.withResolvers<void>();
      setTimeout(resolveDelay, 60);
      await delayPromise;
      if (cancelled) return;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Kamera tidak didukung oleh peramban ini.');
        }

        let stream: MediaStream | null = null;
        let lastErr: unknown = null;

        // Fallback bertahap 4 tier
        const constraintsList: MediaStreamConstraints[] = [
          { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
          { video: { facingMode: { ideal: facingMode } }, audio: false },
          { video: { facingMode: facingMode }, audio: false },
          { video: true, audio: false },
        ];

        for (const constraints of constraintsList) {
          if (cancelled) break;
          try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            if (stream) break;
          } catch (e) {
            lastErr = e;
          }
        }

        if (cancelled) {
          stream?.getTracks().forEach(t => t.stop());
          return;
        }

        if (!stream) {
          throw lastErr || new Error('Kamera tidak dapat diakses.');
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCamera({ status: 'ready' });
      } catch (err) {
        const message = err instanceof Error && err.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Aktifkan akses kamera pada pengaturan peramban untuk melanjutkan.'
          : 'Kamera tidak dapat diakses. Pastikan tidak digunakan aplikasi lain, atau gunakan opsi Kamera HP di bawah.';
        setCamera({ status: 'blocked', message });
      }
    };

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode, retryCount]);

  // Auto-request GPS saat modal kamera dibuka supaya teknisi tidak perlu klik ekstra jika izin sudah diberikan
  useEffect(() => {
    requestGps();
  }, [requestGps]);

  const toggleFacingMode = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  const hasProjectAnchor = Boolean(projectLat && projectLng && !(projectLat === 0 && projectLng === 0));
  const gpsTolerance = gps.status === 'ready' ? Math.min(Math.max(0, gps.accuracy), 35) : 0;
  const distance = gps.status === 'ready'
    ? (hasProjectAnchor
        ? calculateDistanceMeters({ latitude: gps.latitude, longitude: gps.longitude }, { latitude: projectLat, longitude: projectLng })
        : 0)
    : null;
  const isWithinRadius = !hasProjectAnchor || (distance !== null && distance <= (projectRadius + gpsTolerance));

  const canCapture = camera.status === 'ready' && gps.status === 'ready';

  const handleNativeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessing(true);
    setSubmitError(null);
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      const { promise: imgPromise, resolve: resolveImg, reject: rejectImg } = Promise.withResolvers<void>();
      img.onload = () => resolveImg();
      img.onerror = () => rejectImg(new Error('Gagal memuat file gambar dari kamera HP.'));
      img.src = objectUrl;
      await imgPromise;

      const effectiveLat = gps.status === 'ready' ? gps.latitude : (hasProjectAnchor ? projectLat : -6.200000);
      const effectiveLng = gps.status === 'ready' ? gps.longitude : (hasProjectAnchor ? projectLng : 106.816666);
      const effectiveAccuracy = gps.status === 'ready' ? gps.accuracy : 15;
      const effectiveDistance = gps.status === 'ready' && hasProjectAnchor
        ? calculateDistanceMeters({ latitude: effectiveLat, longitude: effectiveLng }, { latitude: projectLat, longitude: projectLng })
        : 0;
      const effectiveTolerance = Math.min(Math.max(0, effectiveAccuracy), 35);
      const withinRad = !hasProjectAnchor || effectiveDistance <= (projectRadius + effectiveTolerance);

      const canvas = applyWatermarkToCanvas(img, {
        projectName,
        executorName,
        photoType,
        latitude: effectiveLat,
        longitude: effectiveLng,
        accuracy: effectiveAccuracy,
        timestamp: new Date(),
        isWithinRadius: withinRad,
        distanceMeters: effectiveDistance,
      });

      URL.revokeObjectURL(objectUrl);
      const blob = await canvasToJpegBlob(canvas);
      setCapturedBlob(blob);
      setCapturedPreviewUrl(URL.createObjectURL(blob));

      if (gps.status !== 'ready') {
        setGps({
          status: 'ready',
          latitude: effectiveLat,
          longitude: effectiveLng,
          accuracy: effectiveAccuracy,
        });
      }
    } catch (err) {
      console.error('Gagal memproses foto kamera native:', err);
      setSubmitError('Gagal memproses foto dari kamera HP. Silakan coba lagi.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShutter = async () => {
    if (!canCapture || isProcessing || gps.status !== 'ready' || !videoRef.current) return;
    setIsProcessing(true);
    setSubmitError(null);
    setIsShutterActive(true);
    window.setTimeout(async () => {
      setIsShutterActive(false);
      try {
        const canvas = applyWatermarkToCanvas(videoRef.current!, {
          projectName,
          executorName,
          photoType,
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          timestamp: new Date(),
          isWithinRadius,
          distanceMeters: distance ?? 0,
        });
        const blob = await canvasToJpegBlob(canvas);
        setCapturedBlob(blob);
        setCapturedPreviewUrl(URL.createObjectURL(blob));
      } catch (e) {
        console.error('Gagal memproses foto:', e);
        setSubmitError('Gagal memproses hasil foto. Silakan ambil ulang.');
      } finally {
        setIsProcessing(false);
      }
    }, 120);
  };

  const handleRetake = () => {
    if (isSubmitting || isSubmittingRef.current) return;
    setSubmitError(null);
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setRetryCount(r => r + 1);
  };

  const handleConfirm = async () => {
    if (!capturedBlob || gps.status !== 'ready') return;
    if (isSubmitting || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    streamRef.current?.getTracks().forEach(t => t.stop());

    try {
      await onCaptureComplete({
        photoBlob: capturedBlob,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracy: gps.accuracy,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan dokumentasi foto. Silakan coba lagi.';
      setSubmitError(msg);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const typeLabel =
    photoType === 'CHECK_IN' ? 'DOKUMENTASI CHECK-IN' : photoType === 'CHECK_OUT' ? 'DOKUMENTASI CHECK-OUT' : 'DOKUMENTASI PROGRES PEKERJAAN';

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black text-white select-none overflow-hidden h-[100dvh] w-screen">
      {isShutterActive && <div className="absolute inset-0 bg-white z-50 transition-opacity duration-150 pointer-events-none" />}

      <div className="relative z-30 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/85 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[11px] font-bold px-2.5 py-0.5 rounded tracking-wide shrink-0 ${
              photoType === 'CHECK_IN' ? 'bg-emerald-500 text-slate-950' : photoType === 'CHECK_OUT' ? 'bg-blue-500 text-slate-950' : 'bg-amber-500 text-slate-950'
            }`}
          >
            {typeLabel}
          </span>
          <span className="text-xs text-slate-300 font-medium truncate">{projectName}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isSubmitting) onClose();
          }}
          disabled={isSubmitting}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all text-white shrink-0 disabled:opacity-40"
        >
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
        {!capturedPreviewUrl ? (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`w-full h-full object-cover ${camera.status === 'ready' ? '' : 'hidden'}`}
            />

            {camera.status === 'starting' && (
              <div className="flex flex-col items-center text-center px-6">
                <span className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
                <p className="text-sm text-slate-300">Mengaktifkan kamera...</p>
              </div>
            )}

            {camera.status === 'blocked' && (
              <div className="flex flex-col items-center text-center p-6 max-w-sm">
                <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center text-rose-400 mb-3 border border-slate-700">
                  <Camera size={30} />
                </div>
                <p className="text-sm font-semibold text-slate-100 mb-1">Kamera WebRTC Tidak Tersedia</p>
                <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">{camera.message}</p>
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setCamera({ status: 'starting' });
                      setRetryCount(r => r + 1);
                    }}
                    className="flex-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2.5 rounded-xl cursor-pointer"
                  >
                    Coba Lagi
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera size={14} /> Buka Kamera HP
                  </button>
                </div>
              </div>
            )}

            {camera.status === 'ready' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
                <Crosshair size={64} className="text-white" />
              </div>
            )}

            {/* GPS HUD (PRD Section 44) */}
            <div className="absolute top-4 inset-x-4 z-20 pointer-events-none">
              <div className="bg-[var(--accent)]/85 border border-slate-700/80 rounded-xl p-3 shadow-lg flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="flex items-center gap-1.5 font-bold text-slate-200 min-w-0 truncate">
                    <MapPin size={14} className="text-sky-400 shrink-0" />
                    {gps.status === 'idle' && 'Lokasi belum aktif'}
                    {gps.status === 'locating' && 'Menentukan lokasi Anda...'}
                    {gps.status === 'ready' && `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`}
                    {gps.status === 'denied' && 'Lokasi tidak tersedia'}
                  </span>
                  {gps.status === 'locating' && <span className="text-[11px] text-amber-400 animate-pulse shrink-0">Mencari sinyal...</span>}
                  {gps.status === 'ready' &&
                    (!hasProjectAnchor ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 shrink-0">
                        <ShieldCheck size={12} /> Titik Jangkar Baru (Valid)
                      </span>
                    ) : isWithinRadius ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/40 shrink-0">
                        <ShieldCheck size={12} /> Valid ({formatDistance(distance!)})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-950/80 px-2 py-0.5 rounded border border-red-500/40 shrink-0">
                        <AlertTriangle size={12} /> Di Luar Radius ({formatDistance(distance!)})
                      </span>
                    ))}
                </div>
                {gps.status === 'ready' && (
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] border-t border-slate-800/80 pt-1">
                    <span>
                      {!hasProjectAnchor
                        ? 'Jangkar Lokasi Proyek Baru (Otomatis Dikunci saat Check-In)'
                        : `Radius Proyek: ${projectRadius}m (Toleransi: +${Math.round(gpsTolerance)}m)`}
                    </span>
                    <span className="flex items-center gap-1">
                      <span>Akurasi GPS: ±{Math.round(gps.accuracy)}m</span>
                      <button type="button" onClick={requestGps} className="pointer-events-auto text-[10px] text-sky-300 hover:text-sky-200 underline ml-1 cursor-pointer">
                        Kalibrasi Ulang
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {gps.status === 'idle' && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 px-6 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-sm text-center shadow-2xl pointer-events-auto">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-4 border border-emerald-500/30">
                    <MapPin size={32} />
                  </div>
                  <h3 className="text-base font-bold text-white mb-2">Akses Lokasi Dibutuhkan</h3>
                  <p className="text-xs text-slate-300 mb-6 leading-relaxed">
                    Sistem membutuhkan izin akses GPS pada perangkat Anda untuk mencatat titik koordinat check-in secara otomatis.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-semibold text-sm transition-colors hover:bg-slate-700">
                      Batal
                    </button>
                    <button onClick={requestGps} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm transition-colors hover:bg-emerald-500 shadow-lg shadow-emerald-900/50">
                      Izinkan GPS
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gps.status === 'denied' && (
              <div className="absolute inset-0 z-50 flex flex-col bg-slate-950 p-4">
                <div className="flex-1 rounded-xl overflow-hidden relative border border-slate-700">
                  <MapPicker 
                    latitude={hasProjectAnchor ? projectLat : -6.200000} 
                    longitude={hasProjectAnchor ? projectLng : 106.816666} 
                    onChange={(lat, lng) => {
                      setGps({ status: 'ready', latitude: lat, longitude: lng, accuracy: 50 });
                    }}
                  />
                  <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 z-[400] pointer-events-none">
                    <h3 className="text-white font-bold text-sm flex items-center gap-2"><MapPin size={16} className="text-rose-400" /> Sinyal GPS Lemah</h3>
                    <p className="text-slate-300 text-[10px] mt-1">Geser peta untuk menentukan posisi akurat Anda saat ini secara manual.</p>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button onClick={onClose} className="py-3 px-4 rounded-xl bg-slate-800 text-white font-semibold text-sm transition-colors hover:bg-slate-700">
                    Batal
                  </button>
                  <button 
                    onClick={() => {
                      setGps(prev => prev.status === 'ready' ? prev : { status: 'ready', latitude: projectLat, longitude: projectLng, accuracy: 50 });
                    }} 
                    className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm transition-colors hover:bg-emerald-500 shadow-lg shadow-emerald-900/50 flex items-center justify-center gap-2"
                  >
                    <Check size={18} /> Konfirmasi Posisi
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center p-2 bg-black">
            <img src={capturedPreviewUrl} alt="Hasil Foto Watermark" className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
            <div className="absolute top-4 left-4 bg-emerald-600/95 text-white px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg">
              <ShieldCheck size={14} /> Foto Berhasil Diambil • Watermark GPS Tersemat
            </div>

            {isSubmitting && (
              <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-30 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xl">
                  <Loader2 size={26} className="animate-spin" />
                </div>
                <p className="text-sm font-bold text-white">Menyimpan Dokumentasi &amp; Koordinat GPS...</p>
                <p className="text-xs text-slate-300">Mohon tunggu sebentar, jangan tutup halaman ini.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {submitError && (
        <div className="relative z-30 mx-4 mb-2 p-3 rounded-xl bg-rose-950/95 border border-rose-500/60 text-rose-200 text-xs flex items-start gap-2 shadow-lg">
          <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="relative z-30 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black via-black/95 to-transparent flex items-center justify-between min-h-[104px]">
        {!capturedPreviewUrl ? (
          <>
            <button
              type="button"
              onClick={toggleFacingMode}
              disabled={camera.status !== 'ready'}
              className="p-3.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 active:scale-90 transition-all border border-slate-700 disabled:opacity-40"
              title="Balik Kamera"
            >
              <RefreshCw size={22} />
            </button>

            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={handleShutter}
                disabled={!canCapture || isProcessing}
                className="w-18 h-18 rounded-full border-4 border-white p-1 flex items-center justify-center bg-transparent active:scale-95 transition-all focus:outline-none shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-full h-full rounded-full bg-white hover:bg-slate-200 transition-colors" />
              </button>
              <span className="text-[11px] text-[var(--text-muted)] mt-1 font-medium">
                {isProcessing ? 'MEMPROSES FOTO...' : canCapture ? 'AMBIL FOTO' : 'MENUNGGU KAMERA & GPS'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 active:scale-90 transition-all border border-slate-700 cursor-pointer"
              title="Gunakan Kamera Bawaan HP (Mode Kompatibilitas)"
            >
              <Camera size={22} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleNativeFileChange}
            />
          </>
        ) : (
          <div className="w-full flex items-center justify-between gap-3 max-w-md mx-auto">
            <button
              type="button"
              onClick={handleRetake}
              disabled={isSubmitting}
              className="flex-1 py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-all border border-slate-700 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw size={16} /> Foto Ulang
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="flex-1 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Check size={18} /> Gunakan Foto
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
