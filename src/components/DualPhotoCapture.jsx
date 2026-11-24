import React, { useState, useRef } from 'react';
import { Camera, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { compressAndWatermark } from '../utils/imageCompressor';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

/**
 * DualPhotoCapture - Komponen Pengambilan Gambar Ganda
 * Digunakan untuk menangkap Nota Surat Jalan (Slot 1) dan Fisik Barang (Slot 2)
 */
const DualPhotoCapture = ({ onComplete }) => {
  const { activeUser } = useAuth();
  const toast = useToast();
  
  const [photo1, setPhoto1] = useState(null); // { blob, sizeKB, previewUrl }
  const [photo2, setPhoto2] = useState(null);
  const [isProcessing1, setIsProcessing1] = useState(false);
  const [isProcessing2, setIsProcessing2] = useState(false);
  
  const fileInput1 = useRef(null);
  const fileInput2 = useRef(null);

  const handleCapture = async (e, slotNumber) => {
    const file = e.target.files[0];
    if (!file) return;

    const setIsProcessing = slotNumber === 1 ? setIsProcessing1 : setIsProcessing2;
    const setPhoto = slotNumber === 1 ? setPhoto1 : setPhoto2;
    
    setIsProcessing(true);
    
    try {
      const options = {
        picName: activeUser?.name || activeUser?.email || 'Unknown',
        branchName: activeUser?.branch_name || 'Main Branch'
      };
      
      const compressedBlob = await compressAndWatermark(file, options);
      const sizeKB = Math.round(compressedBlob.size / 1024);
      const previewUrl = URL.createObjectURL(compressedBlob);
      
      setPhoto({ blob: compressedBlob, sizeKB, previewUrl });
      
      toast.showSuccess(`Foto ${slotNumber} berhasil diproses (WebP, ${sizeKB}KB)`);
      
      // Reset input value so same file can be selected again if deleted
      e.target.value = '';
    } catch (error) {
      console.error("Camera Error:", error);
      toast.showError(`Gagal memproses foto: ${error.message}. Pastikan izin kamera aktif.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const removePhoto = (slotNumber) => {
    if (slotNumber === 1) {
      if (photo1?.previewUrl) URL.revokeObjectURL(photo1.previewUrl);
      setPhoto1(null);
    } else {
      if (photo2?.previewUrl) URL.revokeObjectURL(photo2.previewUrl);
      setPhoto2(null);
    }
  };
  
  // Submit only active if both photos present
  const isComplete = !!photo1 && !!photo2;
  
  // Notify parent component when ready
  const handleSubmit = () => {
    if (isComplete && onComplete) {
      onComplete({ photo1: photo1.blob, photo2: photo2.blob });
    }
  };

  const renderSlot = (slotNumber, title, photoState, isProcessing, fileInputRef) => {
    return (
      <div className="flex-1 bg-white border rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="p-3 border-b bg-gray-50 font-medium text-sm text-gray-700 flex justify-between items-center">
          <span>{title}</span>
          {photoState && <CheckCircle className="text-green-500 w-4 h-4" />}
        </div>
        
        <div className="p-4 flex-1 flex flex-col items-center justify-center relative min-h-[200px]">
          {photoState ? (
            <div className="w-full h-full flex flex-col items-center">
              <img 
                src={photoState.previewUrl} 
                alt={title} 
                className="max-h-[160px] object-contain rounded-md border"
              />
              <div className="mt-3 flex items-center justify-between w-full">
                <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> WebP, {photoState.sizeKB}KB
                </span>
                <button 
                  onClick={() => removePhoto(slotNumber)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : isProcessing ? (
            <div className="flex flex-col items-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
              <span className="text-sm">Memproses...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center text-gray-400">
              <Camera className="w-12 h-12 mb-2 text-gray-300" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                Ambil Foto
              </button>
            </div>
          )}
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={(e) => handleCapture(e, slotNumber)}
            accept="image/*" 
            capture="environment"
            className="hidden" 
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        {renderSlot(1, "1. Nota / Surat Jalan", photo1, isProcessing1, fileInput1)}
        {renderSlot(2, "2. Fisik Barang Datang", photo2, isProcessing2, fileInput2)}
      </div>
      
      <div className="pt-2">
        <button
          onClick={handleSubmit}
          disabled={!isComplete}
          className={`w-full py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2
            ${isComplete 
              ? 'bg-primary hover:bg-primary/90 shadow-md' 
              : 'bg-gray-300 cursor-not-allowed'}`}
        >
          {isComplete ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          Lanjutkan Proses
        </button>
      </div>
    </div>
  );
};

export default DualPhotoCapture;
