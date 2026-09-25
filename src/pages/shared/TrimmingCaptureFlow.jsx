import React, { useState, useRef, useMemo } from 'react';
import { Scissors, Camera, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { compressAndWatermark } from '../../utils/imageCompressor';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

const TrimmingCaptureFlow = ({ rawMaterials = [], onComplete, onCancel }) => {
  const { activeUser } = useAuth();
  const toast = useToast();
  
  // Hanya ambil bahan dengan kategori 'Bahan Mentah'
  const filteredMaterials = useMemo(() => {
    return rawMaterials.filter(m => m.category === 'Bahan Mentah');
  }, [rawMaterials]);

  // State
  const [step, setStep] = useState(1);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  
  // Tahap 1
  const [grossWeight, setGrossWeight] = useState('');
  const [grossPhoto, setGrossPhoto] = useState(null);
  
  // Tahap 2
  const [cleanWeight, setCleanWeight] = useState('');
  const [wasteWeight, setWasteWeight] = useState('');
  const [cleanPhoto, setCleanPhoto] = useState(null);
  const [wastePhoto, setWastePhoto] = useState(null);

  // Loading state
  const [isProcessing, setIsProcessing] = useState(false);

  // Refs for hidden inputs
  const grossInputRef = useRef(null);
  const cleanInputRef = useRef(null);
  const wasteInputRef = useRef(null);

  const selectedMaterial = filteredMaterials.find(m => m.id === selectedMaterialId || m.id === parseInt(selectedMaterialId));

  const handleCapture = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    
    try {
      const options = {
        picName: activeUser?.name || 'PIC',
        branchName: activeUser?.branch_name || 'BAR'
      };
      
      const blob = await compressAndWatermark(file, options);
      const photoObj = { blob, previewUrl: URL.createObjectURL(blob) };
      
      if (type === 'gross') setGrossPhoto(photoObj);
      else if (type === 'clean') setCleanPhoto(photoObj);
      else if (type === 'waste') setWastePhoto(photoObj);
      
      toast.showSuccess(`Foto berhasil diambil`);
      e.target.value = '';
    } catch (error) {
      toast.showError(`Error: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNextStep = () => {
    if (!selectedMaterialId) return toast.showError('Pilih bahan mentah terlebih dahulu');
    if (!grossWeight || parseFloat(grossWeight) <= 0) return toast.showError('Berat kotor tidak valid');
    if (!grossPhoto) return toast.showError('Foto bukti berat kotor wajib diambil');
    
    setStep(2);
  };

  const handleSubmit = () => {
    const wGross = parseFloat(grossWeight);
    const wClean = parseFloat(cleanWeight);
    const wWaste = parseFloat(wasteWeight);

    if (isNaN(wClean) || isNaN(wWaste)) return toast.showError('Input berat bersih/limbah tidak valid');
    if (!cleanPhoto || !wastePhoto) return toast.showError('Foto hasil bersih dan limbah wajib diambil');

    // Validasi toleransi matematika timbangan
    const diff = Math.abs(wGross - (wClean + wWaste));
    if (diff > 5) {
      return toast.showError(`Toleransi selisih maks 5g. Selisih Anda: ${diff}g. Harap ukur ulang!`);
    }

    const shrinkagePercent = ((wGross - wClean) / wGross) * 100;
    const yieldStatus = shrinkagePercent <= 30 ? 'GOOD_YIELD' : 'BAD_YIELD';

    const payload = {
      material_id: selectedMaterial.id,
      gross_weight: wGross,
      clean_weight: wClean,
      waste_weight: wWaste,
      shrinkage_percent: shrinkagePercent,
      yield_status: yieldStatus,
      photos: {
        gross: grossPhoto.blob,
        clean: cleanPhoto.blob,
        waste: wastePhoto.blob
      }
    };

    if (onComplete) {
      onComplete(payload);
    }
  };

  // Kalkulasi realtime
  const currentShrinkage = () => {
    if (!grossWeight || !cleanWeight) return null;
    const wGross = parseFloat(grossWeight);
    const wClean = parseFloat(cleanWeight);
    if (wGross <= 0 || isNaN(wClean)) return null;
    return (((wGross - wClean) / wGross) * 100).toFixed(1);
  };

  const renderPhotoBox = (title, type, photoObj, inputRef) => (
    <div className="border rounded-lg p-3 bg-white flex flex-col items-center justify-center min-h-[160px]">
      <div className="font-medium text-sm text-gray-700 mb-2">{title}</div>
      {photoObj ? (
        <div className="flex flex-col items-center w-full">
          <img src={photoObj.previewUrl} alt={title} className="max-h-24 object-contain rounded border mb-2" />
          <button onClick={() => { URL.revokeObjectURL(photoObj.previewUrl); type === 'gross' ? setGrossPhoto(null) : type === 'clean' ? setCleanPhoto(null) : setWastePhoto(null) }} className="text-xs text-red-500 underline">Ganti Foto</button>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <Camera className="w-8 h-8 text-gray-300 mb-2" />
          <button onClick={() => inputRef.current?.click()} disabled={isProcessing} className="bg-blue-50 text-blue-600 text-xs px-3 py-1.5 rounded hover:bg-blue-100 font-medium">Ambil Foto</button>
        </div>
      )}
      <input type="file" ref={inputRef} onChange={(e) => handleCapture(e, type)} accept="image/*" capture="environment" className="hidden" />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-md border max-w-3xl mx-auto overflow-hidden">
      <div className="bg-gray-800 text-white p-4 flex justify-between items-center">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Scissors className="w-5 h-5" />
          Trimming Buah & Bahan Mentah
        </h2>
        <div className="text-sm font-medium px-2 py-1 bg-gray-700 rounded">
          Tahap {step} dari 2
        </div>
      </div>

      <div className="p-6">
        {step === 1 ? (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Tahap 1: Pengukuran Berat Kotor (Gross)</p>
                <p>Timbang buah secara utuh belum dikupas. Foto langsung di atas timbangan bar.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pilih Bahan Mentah</label>
              <select 
                value={selectedMaterialId} 
                onChange={(e) => setSelectedMaterialId(e.target.value)}
                className="w-full border-gray-300 rounded-lg p-2.5 border focus:ring-primary focus:border-primary"
              >
                <option value="">-- Pilih Bahan --</option>
                {filteredMaterials.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                ))}
              </select>
              {filteredMaterials.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Tidak ada bahan mentah dalam master data.</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Berat Kotor (Gram)</label>
                <input 
                  type="number" 
                  value={grossWeight} 
                  onChange={(e) => setGrossWeight(e.target.value)}
                  placeholder="Misal: 1200"
                  className="w-full text-2xl font-bold p-3 border rounded-lg text-center focus:ring-2 focus:ring-primary"
                />
              </div>
              {renderPhotoBox("Foto Berat Kotor", "gross", grossPhoto, grossInputRef)}
            </div>
            
            <div className="pt-4 flex justify-end gap-3 border-t">
              <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 font-medium">Batal</button>
              <button onClick={handleNextStep} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium flex items-center gap-2">Lanjut Tahap 2 <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-50 border p-4 rounded-lg flex justify-between items-center text-sm">
              <div>
                <span className="text-gray-500 block mb-1">Bahan Mentah:</span>
                <strong className="text-gray-900">{selectedMaterial?.name}</strong>
              </div>
              <div className="text-right">
                <span className="text-gray-500 block mb-1">Berat Kotor:</span>
                <strong className="text-gray-900 text-lg">{grossWeight}g</strong>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Berat Bersih (W_clean) - Gram</label>
                  <input type="number" value={cleanWeight} onChange={(e) => setCleanWeight(e.target.value)} className="w-full text-xl p-2 border rounded-lg focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Berat Limbah/Kulit (W_waste) - Gram</label>
                  <input type="number" value={wasteWeight} onChange={(e) => setWasteWeight(e.target.value)} className="w-full text-xl p-2 border rounded-lg focus:ring-2 focus:ring-primary" />
                </div>

                {currentShrinkage() !== null && (
                  <div className={`p-3 rounded-lg border flex justify-between items-center ${parseFloat(currentShrinkage()) <= 30 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div>
                      <div className="text-xs uppercase tracking-wider font-semibold mb-1 opacity-70">Persentase Susut</div>
                      <div className={`font-bold text-lg ${parseFloat(currentShrinkage()) <= 30 ? 'text-green-700' : 'text-red-700'}`}>
                        {currentShrinkage()}%
                      </div>
                    </div>
                    <div>
                      {parseFloat(currentShrinkage()) <= 30 ? (
                        <span className="bg-green-600 text-white text-xs px-2 py-1 rounded font-bold">GOOD YIELD</span>
                      ) : (
                        <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">BAD YIELD</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4 flex flex-col justify-between">
                {renderPhotoBox("Foto Hasil Bersih", "clean", cleanPhoto, cleanInputRef)}
                {renderPhotoBox("Foto Tumpukan Limbah", "waste", wastePhoto, wasteInputRef)}
              </div>
            </div>

            <div className="pt-4 flex justify-between border-t mt-6">
              <button onClick={() => setStep(1)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 font-medium">Koreksi Tahap 1</button>
              <button onClick={handleSubmit} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Simpan Hasil Trimming</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrimmingCaptureFlow;
