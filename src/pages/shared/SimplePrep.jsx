import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { Scissors, Upload, X, CheckCircle, ArrowRight, PackageOpen } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

export default function SimplePrep() {
  const { materials, refreshData } = useData();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    source_mat_id: '',
    source_qty: '',
    target_mat_id: '',
    target_qty: '',
    waste_qty: '',
    photo_before: null,
    photo_waste: null
  });

  const [photoBeforePreview, setPhotoBeforePreview] = useState(null);
  const [photoWastePreview, setPhotoWastePreview] = useState(null);

  // Filter: Bahan Asal harus "Bahan Baku Dasar" atau Mentah
  const sourceMaterials = useMemo(() => {
    return materials.filter(m => 
      m.category === 'Bahan Baku Dasar' || m.category === 'Meat' || m.category === 'Vegetables' || m.category === 'Sayur & Buah'
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [materials]);

  // Filter: Bahan Hasil harus "Bahan Racikan" atau Semi-Finished
  const targetMaterials = useMemo(() => {
    return materials.filter(m => 
      m.category === 'Bahan Racikan' || m.category === 'Semi-Finished' || m.category === 'Other' || m.category === 'Lainnya'
    ).sort((a,b) => a.name.localeCompare(b.name));
  }, [materials]);

  const selSource = sourceMaterials.find(m => m.id === parseInt(form.source_mat_id));
  const selTarget = targetMaterials.find(m => m.id === parseInt(form.target_mat_id));

  const handleReset = () => {
    setForm({
      source_mat_id: '', source_qty: '', target_mat_id: '', target_qty: '', waste_qty: '', photo_before: null, photo_waste: null
    });
    setPhotoBeforePreview(null);
    setPhotoWastePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.source_mat_id || !form.target_mat_id || !form.source_qty || !form.target_qty) {
      return toast.showError("Lengkapi data bahan mentah dan barang jadi!");
    }
    if (!form.photo_before) {
      return toast.showError("Wajib melampirkan foto bahan mentah utuh di timbangan.");
    }
    const wQty = parseFloat(form.waste_qty || 0);
    if (wQty > 0 && !form.photo_waste) {
      return toast.showError("Karena ada ampas yang dibuang, wajib lampirkan foto ampas di timbangan.");
    }

    setLoading(true);
    try {
      await api.recordOlahBahan({ ...form, location: 'RESTO' });
      triggerHaptic('success');
      toast.showSuccess("Bahan berhasil diolah!");
      handleReset();
      refreshData();
    } catch (err) {
      triggerHaptic('error');
      toast.showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-2xl font-extrabold flex items-center gap-3">
          <Scissors className="w-7 h-7" /> Olah Bahan Mentah
        </h1>
        <p className="mt-2 text-blue-100 text-sm">
          Ubah bahan utuh dari kulkas menjadi bahan racikan/potongan siap pakai. COGS akan dipindahkan secara otomatis.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* L1: BAHAN UTUH */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <PackageOpen className="w-4 h-4 text-blue-500" /> 1. Apa yang Anda ambil dari Kulkas?
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Pilih Bahan Mentah *</label>
              <select 
                className="w-full border-gray-200 rounded-xl bg-gray-50 p-3 text-sm focus:ring-2 focus:ring-blue-500"
                value={form.source_mat_id}
                onChange={(e) => setForm({...form, source_mat_id: e.target.value})}
                required
              >
                <option value="">-- Pilih Bahan Utuh --</option>
                {sourceMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Berapa Banyak? *</label>
                <div className="relative">
                  <input 
                    type="number" step="any" min="0.01" required
                    className="w-full border-gray-200 rounded-xl bg-gray-50 p-3 pr-12 text-sm font-bold focus:ring-2 focus:ring-blue-500"
                    value={form.source_qty}
                    onChange={(e) => setForm({...form, source_qty: e.target.value})}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{selSource?.unit || 'Unit'}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Foto di Timbangan (Wajib) *</label>
                <div className="relative border-2 border-dashed border-gray-300 rounded-xl h-11 flex items-center justify-center overflow-hidden bg-gray-50">
                  {photoBeforePreview ? (
                    <img src={photoBeforePreview} alt="Before" className="h-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-gray-400 flex items-center gap-1"><Upload size={14}/> Upload Foto</span>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={e => {
                      if(e.target.files[0]) {
                        setForm({...form, photo_before: e.target.files[0]});
                        setPhotoBeforePreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-2"><ArrowRight className="text-gray-300 w-8 h-8 rotate-90 md:rotate-0" /></div>

        {/* L2: HASIL OLAHAN */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" /> 2. Menjadi Barang Apa?
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Pilih Hasil Jadi *</label>
              <select 
                className="w-full border-gray-200 rounded-xl bg-gray-50 p-3 text-sm focus:ring-2 focus:ring-green-500"
                value={form.target_mat_id}
                onChange={(e) => setForm({...form, target_mat_id: e.target.value})}
                required
              >
                <option value="">-- Pilih Hasil Olahan --</option>
                {targetMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Dapat Berapa Banyak Hasil Bersihnya? *</label>
              <div className="relative">
                <input 
                  type="number" step="any" min="0.01" required
                  className="w-full border-gray-200 rounded-xl bg-gray-50 p-3 pr-12 text-sm font-bold focus:ring-2 focus:ring-green-500"
                  value={form.target_qty}
                  onChange={(e) => setForm({...form, target_qty: e.target.value})}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{selTarget?.unit || 'Unit'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* L3: AMPAS */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-red-100 bg-red-50/30">
          <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 text-red-700">
            3. Ada Ampas / Kulit yang Dibuang?
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Berat Ampas (Isi jika ada)</label>
              <div className="relative">
                <input 
                  type="number" step="any" min="0"
                  className="w-full border-red-200 rounded-xl bg-white p-3 pr-12 text-sm font-bold focus:ring-2 focus:ring-red-500"
                  value={form.waste_qty}
                  onChange={(e) => setForm({...form, waste_qty: e.target.value})}
                  placeholder="0"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">{selSource?.unit || 'Unit'}</span>
              </div>
            </div>

            {parseFloat(form.waste_qty) > 0 && (
              <div className="animate-in fade-in zoom-in duration-300">
                <label className="text-xs font-semibold text-red-600 block mb-1">Foto Ampas (Wajib) *</label>
                <div className="relative border-2 border-dashed border-red-300 rounded-xl h-11 flex items-center justify-center overflow-hidden bg-white">
                  {photoWastePreview ? (
                    <img src={photoWastePreview} alt="Waste" className="h-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-red-400 flex items-center gap-1"><Upload size={14}/> Foto Ampas</span>
                  )}
                  <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={e => {
                      if(e.target.files[0]) {
                        setForm({...form, photo_waste: e.target.files[0]});
                        setPhotoWastePreview(URL.createObjectURL(e.target.files[0]));
                      }
                    }} 
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 active:scale-95 transition-all disabled:opacity-50 flex justify-center"
        >
          {loading ? 'Menyimpan...' : 'Simpan Hasil Olahan'}
        </button>

      </form>
    </div>
  );
}
