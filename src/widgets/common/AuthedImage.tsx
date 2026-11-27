import React, { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2, Trash2 } from 'lucide-react';
import { fetchAuthedBlobUrl } from '@/shared/api/client';

interface AuthedImageProps {
  path: string; // e.g. "/photos/{id}/file"
  alt: string;
  className?: string;
  onClick?: () => void;
  /** Pass `photo.purgedAt` truthiness here — skips the doomed fetch entirely and shows a clear reason instead of a generic broken-image icon. */
  purged?: boolean;
}

/**
 * Evidence photos are served from an authenticated endpoint, never a public
 * URL (PRD Section 50). A plain <img src> can't carry an Authorization
 * header, so this fetches the bytes once and hands the browser a local
 * blob: URL instead.
 */
export const AuthedImage: React.FC<AuthedImageProps> = ({ path, alt, className, onClick, purged }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (purged) return; // don't bother fetching — the file is gone by design (retention), not an error
    let cancelled = false;
    setFailed(false);
    setSrc(null);

    fetchAuthedBlobUrl(path)
      .then(url => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [path, purged]);

  if (purged) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 bg-slate-900/90 text-slate-300 text-center p-2 ${className}`}
        title="Foto raw telah diunduh ke arsip & dihapus dari database. Salinan dokumen PDF tetap tersimpan."
      >
        <Trash2 size={16} className="text-emerald-400" />
        <span className="text-[10px] font-semibold leading-tight px-1 text-emerald-300">
          Foto Raw Diarsipkan
        </span>
        <span className="text-[9px] leading-tight px-1 text-slate-400">
          Dihapus dari DB • Tetap ada di PDF
        </span>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
        <ImageOff size={20} />
      </div>
    );
  }

  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 animate-pulse ${className}`}>
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} onClick={onClick} />;
};
