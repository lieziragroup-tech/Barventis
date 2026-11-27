import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { DocumentationPhoto } from '@/entities/types';
import { X, MapPin, Calendar, User, ShieldCheck, AlertTriangle, Download, Loader2 } from 'lucide-react';
import { formatWIBDate } from '@/shared/utils/watermark';
import { fetchAuthedBlobUrl } from '@/shared/api/client';
import { MODAL_BACKDROP_VARIANTS, MODAL_PANEL_VARIANTS } from '@/shared/lib/motion';
import { AuthedImage } from './AuthedImage';

interface PhotoViewerModalProps {
  photo: DocumentationPhoto | null;
  onClose: () => void;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ photo, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  if (!photo) return null;

  const { dateStr, timeStr } = formatWIBDate(new Date(photo.capturedAt));
  const isWithin = photo.isWithinRadius;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await fetchAuthedBlobUrl(photo.url);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FIELDWORK_${(photo.metadata.projectName || 'evidence').replace(/\s+/g, '_')}_${photo.photoType}_${Date.now()}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      variants={MODAL_BACKDROP_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        variants={MODAL_PANEL_VARIANTS}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative flex flex-col max-h-[92vh] w-full max-w-4xl bg-[var(--accent)] border border-slate-700 rounded-xl overflow-hidden shadow-2xl text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[var(--accent)]/90">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`text-xs px-2.5 py-1 rounded font-bold uppercase shrink-0 ${
                photo.photoType === 'CHECK_IN'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : photo.photoType === 'CHECK_OUT'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              ● {photo.photoType.replace('_', ' ')}
            </span>
            <h3 className="text-sm font-semibold text-white truncate">{photo.metadata.projectName}</h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              title="Unduh Evidence"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-white hover:bg-[var(--accent-hover)] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-black flex items-center justify-center overflow-auto min-h-[300px] max-h-[60vh] p-2">
          <AuthedImage path={photo.url} alt="Dokumentasi Pekerjaan Lapangan" purged={!!photo.purgedAt} className="max-h-full max-w-full object-contain rounded shadow-lg" />
        </div>

        <div className="p-4 bg-[var(--accent)] border-t border-slate-800 text-xs sm:text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <Calendar size={16} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
              <div>
                <span className="block text-[var(--text-muted)] text-[11px] font-medium">WAKTU SERVER (WIB)</span>
                <span className="font-semibold text-slate-200">{dateStr}</span>
                <span className="block font-mono text-[var(--text-muted)] text-xs">{timeStr}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <MapPin size={16} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
              <div>
                <span className="block text-[var(--text-muted)] text-[11px] font-medium">KOORDINAT & JARAK</span>
                <span className="font-mono font-semibold text-slate-200">
                  {photo.latitude.toFixed(6)}, {photo.longitude.toFixed(6)}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isWithin ? (
                    <span className="inline-flex items-center text-[11px] font-semibold text-emerald-400">
                      <ShieldCheck size={12} className="mr-0.5" /> Valid ({photo.distanceToProject}m)
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[11px] font-semibold text-red-400">
                      <AlertTriangle size={12} className="mr-0.5" /> Di luar radius ({photo.distanceToProject}m)
                    </span>
                  )}
                  <span className="text-[var(--text-muted)] text-[11px]">• ±{Math.round(photo.accuracy)}m</span>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <User size={16} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
              <div>
                <span className="block text-[var(--text-muted)] text-[11px] font-medium">PELAKSANA LAPANGAN</span>
                <span className="font-semibold text-sky-400">{photo.metadata.executorName}</span>
                <span className="block text-[10px] text-[var(--text-muted)] font-mono mt-0.5">ID: {photo.id.substring(0, 16)}...</span>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-2 border-t border-slate-800/80">
            <span>Bukti dan metadata disimpan terpisah di server (PRD Section 15, 51) — watermark ini bukan satu-satunya sumber kebenaran.</span>
            <span className="font-mono text-emerald-400/90 font-semibold">SERVER-VERIFIED</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
