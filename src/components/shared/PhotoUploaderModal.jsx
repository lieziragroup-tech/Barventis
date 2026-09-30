import React, { useState, useRef } from 'react';
import { Camera, X, Loader2, CheckCircle } from 'lucide-react';
import { compressAndWatermark } from '../../utils/imageCompressor';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function PhotoUploaderModal({ isOpen, onClose, bucket, contextName }) {
  const { activeUser } = useAuth();
  const { showToast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    setSuccess(false);

    try {
      const blob = await compressAndWatermark(file, { userName: activeUser?.name || 'Barista' });
      const ext = 'webp';
      const filename = `${contextName}_${Date.now()}.${ext}`;
      
      await api.uploadPhoto(blob, bucket, filename);
      setSuccess(true);
      showToast('Foto berhasil diunggah', 'success');
      
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      console.error(err);
      showToast('Gagal memproses foto: ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-primary)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden border border-[var(--border)]">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="font-bold text-lg text-[var(--text-primary)]">Upload Foto Bukti</h3>
          <button onClick={onClose} disabled={isProcessing} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 text-center">
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Ambil foto untuk <strong>{contextName}</strong>. Sistem akan memberikan stempel waktu dan lokasi (jika aktif).
          </p>

          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
          />

          {success ? (
            <div className="flex flex-col items-center justify-center p-6 text-emerald-500">
              <CheckCircle size={48} className="mb-4" />
              <p className="font-bold">Berhasil</p>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="w-full flex flex-col items-center justify-center gap-3 py-12 border-2 border-dashed border-[var(--border)] rounded-xl hover:bg-[var(--bg-secondary)] hover:border-[var(--accent)] transition-colors text-[var(--text-secondary)] hover:text-[var(--accent)]"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={36} className="animate-spin" />
                  <span className="font-medium text-sm">Memproses & Kompresi WebP...</span>
                </>
              ) : (
                <>
                  <Camera size={36} />
                  <span className="font-medium text-sm">Buka Kamera / Pilih Foto</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}