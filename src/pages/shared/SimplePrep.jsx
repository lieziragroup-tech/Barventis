import React, { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { Scissors, Upload, CheckCircle2, ArrowRight, Package, AlertTriangle, Scale, Camera } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

const COMMON_UNITS = ['gr', 'kg', 'ml', 'L', 'pck', 'pcs', 'btl', 'can'];

export default function SimplePrep() {
  const { stock: rawStock, refreshData } = useData();
  const materials = rawStock || [];
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    source_mat_id: '',
    source_qty: '',
    source_unit: 'kg',
    target_mat_id: '',
    target_qty: '',
    target_unit: 'ml',
    waste_qty: '',
    waste_unit: 'kg',
    photo_before: null,
    photo_after: null,
    notes: ''
  });

  const [photoBeforePreview, setPhotoBeforePreview] = useState(null);
  const [photoAfterPreview, setPhotoAfterPreview] = useState(null);

  // Filter bahan asal (bahan mentah/segar)
  const sourceMaterials = useMemo(() => {
    return materials.filter(m => {
      const cat = (m.category || '').toLowerCase();
      return cat.includes('fruit') || cat.includes('buah') || cat.includes('vegetable') ||
             cat.includes('sayur') || cat.includes('meat') || cat.includes('daging') ||
             cat.includes('mentah') || cat.includes('dasar') || cat.includes('dry goods') ||
             cat.includes('coffee') || cat.includes('milk');
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [materials]);

  // Filter bahan hasil jadi
  const targetMaterials = useMemo(() => {
    return materials.filter(m => {
      const cat = (m.category || '').toLowerCase();
      return cat.includes('syrup') || cat.includes('juice') || cat.includes('frozen') ||
             cat.includes('racikan') || cat.includes('semi') || cat.includes('other') ||
             cat.includes('lainnya') || cat.includes('powder') || cat.includes('fruit');
    }).sort((a,b) => a.name.localeCompare(b.name));
  }, [materials]);

  const selSource = sourceMaterials.find(m => m.id === parseInt(form.source_mat_id));
  const selTarget = targetMaterials.find(m => m.id === parseInt(form.target_mat_id));

  // Auto-set default unit from material master
  const handleSelectSource = (id) => {
    const mat = materials.find(m => m.id === parseInt(id));
    setForm(prev => ({
      ...prev,
      source_mat_id: id,
      source_unit: mat?.unit || prev.source_unit
    }));
  };

  const handleSelectTarget = (id) => {
    const mat = materials.find(m => m.id === parseInt(id));
    setForm(prev => ({
      ...prev,
      target_mat_id: id,
      target_unit: mat?.unit || prev.target_unit
    }));
  };

  const handleReset = () => {
    setForm({
      source_mat_id: '',
      source_qty: '',
      source_unit: 'kg',
      target_mat_id: '',
      target_qty: '',
      target_unit: 'ml',
      waste_qty: '',
      waste_unit: 'kg',
      photo_before: null,
      photo_after: null,
      notes: ''
    });
    setPhotoBeforePreview(null);
    setPhotoAfterPreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.source_mat_id || !form.target_mat_id || !form.source_qty || !form.target_qty) {
      return toast.showError("Lengkapi pilihan bahan asal dan hasil olahan.");
    }
    if (!form.photo_before) {
      return toast.showError("Wajib lampirkan Foto 1: Bahan sebelum diolah (di timbangan).");
    }
    if (!form.photo_after) {
      return toast.showError("Wajib lampirkan Foto 2: Hasil olahan dan ampas.");
    }

    setLoading(true);
    try {
      await api.recordOlahBahan({
        location: 'RESTO',
        source_mat_id: form.source_mat_id,
        source_qty: form.source_qty,
        target_mat_id: form.target_mat_id,
        target_qty: form.target_qty,
        waste_qty: form.waste_qty || 0,
        photo_before: form.photo_before,
        photo_waste: form.photo_after,
        notes: form.notes
      });
      triggerHaptic('success');
      toast.showSuccess("Bahan berhasil diolah dan HPP otomatis diperbarui!");
      handleReset();
      refreshData();
    } catch (err) {
      triggerHaptic('error');
      toast.showError(err.message || 'Gagal menyimpan olahan bahan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Header Elegan Berpola Standar Barventis */}
      <div className="glass-card p-6 rounded-2xl border border-[var(--border)]" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <Scissors size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Olah Bahan Mentah (Prep)</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Ubah bahan mentah utuh menjadi bahan siap racik. Biaya modal (HPP) otomatis berpindah secara proporsional.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step 1: Bahan Sebelum Diolah (Before) */}
        <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px]">1</span>
              Bahan Sebelum Diolah (Before)
            </span>
            <span className="text-[11px] text-[var(--text-secondary)]">Wajib Foto Timbangan</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Pilih Bahan Mentah Utuh *</label>
              <select
                className="form-control w-full text-sm py-2.5"
                value={form.source_mat_id}
                onChange={(e) => handleSelectSource(e.target.value)}
                required
              >
                <option value="">-- Pilih Bahan ({sourceMaterials.length} tersedia) --</option>
                {sourceMaterials.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.unit}) • {m.category}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Banyaknya Diambil *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="0.00"
                    className="form-control flex-1 text-sm py-2 font-bold font-mono text-blue-600"
                    value={form.source_qty}
                    onChange={(e) => setForm({...form, source_qty: e.target.value})}
                  />
                  <select
                    className="form-control w-24 text-xs font-semibold"
                    value={form.source_unit}
                    onChange={(e) => setForm({...form, source_unit: e.target.value})}
                  >
                    {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Foto 1: Before Trimming */}
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">📸 Foto 1: Sebelum Diolah *</label>
                <div className="relative border-2 border-dashed border-[var(--border)] rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors">
                  {photoBeforePreview ? (
                    <img src={photoBeforePreview} alt="Before" className="h-full object-cover" />
                  ) : (
                    <span className="text-xs font-medium text-[var(--text-secondary)] flex items-center gap-1.5">
                      <Camera size={14} className="text-blue-600" /> Ambil Foto Bahan
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.files[0]) {
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

        <div className="flex justify-center -my-2 text-[var(--text-muted)]">
          <ArrowRight size={20} className="rotate-90" />
        </div>

        {/* Step 2: Hasil Olahan Bersih (After: Ready Product) */}
        <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[11px]">2</span>
              Hasil Jadi Siap Racik (After)
            </span>
            <span className="text-[11px] text-green-600 font-semibold">Masuk ke Stok Siap Jual</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Menjadi Barang Hasil Apa? *</label>
              <select
                className="form-control w-full text-sm py-2.5"
                value={form.target_mat_id}
                onChange={(e) => handleSelectTarget(e.target.value)}
                required
              >
                <option value="">-- Pilih Barang Jadi ({targetMaterials.length} tersedia) --</option>
                {targetMaterials.map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.unit}) • {m.category}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Dapat Berapa Banyak Hasil Bersih? *</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className="form-control flex-1 text-sm py-2 font-bold font-mono text-green-600"
                  value={form.target_qty}
                  onChange={(e) => setForm({...form, target_qty: e.target.value})}
                />
                <select
                  className="form-control w-24 text-xs font-semibold"
                  value={form.target_unit}
                  onChange={(e) => setForm({...form, target_unit: e.target.value})}
                >
                  {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Ampas / Kulit Terbuang (After: Waste) + Foto 2 */}
        <div className="glass-card p-5 rounded-2xl border border-red-200/60 bg-red-50/20 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-red-200/40 pb-3">
            <span className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[11px]">3</span>
              Ampas & Kulit Dibuang (Waste)
            </span>
            <span className="text-[11px] text-red-600">Otomatis Dicatat ke Biaya Limbah</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">Berat Ampas (Isi jika ada)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.00"
                  className="form-control flex-1 text-sm py-2 font-bold font-mono text-red-600"
                  value={form.waste_qty}
                  onChange={(e) => setForm({...form, waste_qty: e.target.value})}
                />
                <select
                  className="form-control w-24 text-xs font-semibold"
                  value={form.waste_unit}
                  onChange={(e) => setForm({...form, waste_unit: e.target.value})}
                >
                  {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* Foto 2: After Trimming (Hasil Bersih & Ampas) */}
            <div>
              <label className="text-xs font-semibold text-red-600 block mb-1">📸 Foto 2: Hasil & Ampas *</label>
              <div className="relative border-2 border-dashed border-red-300 rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-white hover:bg-red-50/50 transition-colors">
                {photoAfterPreview ? (
                  <img src={photoAfterPreview} alt="After" className="h-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-red-500 flex items-center gap-1.5">
                    <Camera size={14} /> Ambil Foto Hasil & Kulit
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files[0]) {
                      setForm({...form, photo_after: e.target.files[0]});
                      setPhotoAfterPreview(URL.createObjectURL(e.target.files[0]));
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full btn btn-primary py-3.5 justify-center font-bold text-sm rounded-xl shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {loading ? 'Menyimpan & Menghitung Modal...' : 'Simpan Hasil Olahan Bahan'}
        </button>
      </form>
    </div>
  );
}
