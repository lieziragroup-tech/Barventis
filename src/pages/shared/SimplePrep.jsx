import { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { Search, Camera, RefreshCw, X, Eye, Plus } from 'lucide-react';
import { OFFICIAL_CATEGORIES } from './Marketlist';
import { triggerHaptic } from '../../utils/haptics';
import { formatIDR } from '../../services/costUtils';
import { getExpiryColor } from '../../utils/expiryColor';

const COMMON_UNITS = ['gr', 'kg', 'ml', 'L', 'pck', 'pcs', 'btl', 'can'];

export default function SimplePrep() {
  const { stock: rawStock, refreshData } = useData();
  const materials = useMemo(() => rawStock || [], [rawStock]);
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);

  // Form Fields
  const [sourceSearch, setSourceSearch] = useState('');
  const [debouncedSourceSearch, setDebouncedSourceSearch] = useState('');
  const [selectedSourceMat, setSelectedSourceMat] = useState(null);
  const [sourceQty, setSourceQty] = useState('');
  const [sourceUnit, setSourceUnit] = useState('kg');
  const [photoBefore, setPhotoBefore] = useState(null);
  const [photoBeforePreview, setPhotoBeforePreview] = useState(null);

  const [targetSearch, setTargetSearch] = useState('');
  const [debouncedTargetSearch, setDebouncedTargetSearch] = useState('');
  const [selectedTargetMat, setSelectedTargetMat] = useState(null);
  const [targetQty, setTargetQty] = useState('');
  const [targetUnit, setTargetUnit] = useState('ml');
  const [expiryDate, setExpiryDate] = useState('');

  const [wasteQty, setWasteQty] = useState('');
  const [wasteUnit, setWasteUnit] = useState('kg');
  const [photoAfter, setPhotoAfter] = useState(null);
  const [photoAfterPreview, setPhotoAfterPreview] = useState(null);

  const [notes, setNotes] = useState('');

  // Quick Setup Modal for Missing Raw Materials
  const [showCreateRawModal, setShowCreateRawModal] = useState(false);
  const [creatingRawMat, setCreatingRawMat] = useState(false);
  const [newRawMat, setNewRawMat] = useState({
    name: '',
    category: 'Bahan Mentah / Raw Material',
    unit: 'kg',
    price: '',
    qty_resto: '',
    shelf_life_days: '',
    min_stock: '5'
  });

  const openCreateRawModal = (initialName = '') => {
    setNewRawMat({
      name: initialName || sourceSearch || '',
      category: 'Bahan Mentah / Raw Material',
      unit: 'kg',
      price: '',
      qty_resto: '',
      shelf_life_days: '',
      min_stock: '5'
    });
    setShowCreateRawModal(true);
  };

  const handleCreateRawMaterial = async (e) => {
    e.preventDefault();
    if (!newRawMat.name.trim()) {
      return toast.showError('Nama bahan mentah wajib diisi.');
    }
    setCreatingRawMat(true);
    try {
      const created = await api.createMaterial({
        name: newRawMat.name.trim(),
        category: newRawMat.category || 'Bahan Mentah / Raw Material',
        unit: newRawMat.unit || 'kg',
        price: parseFloat(newRawMat.price) || 0,
        qty_resto: parseFloat(newRawMat.qty_resto) || 0,
        shelf_life_days: newRawMat.shelf_life_days ? parseInt(newRawMat.shelf_life_days, 10) : null,
        min_stock: parseFloat(newRawMat.min_stock) || 5
      });
      await refreshData();
      handleSelectSource(created);
      setShowCreateRawModal(false);
      toast.showSuccess(`Bahan mentah "${created.name}" berhasil didaftarkan ke database dan dipilih!`);
    } catch (err) {
      toast.showError(err.message || 'Gagal mendaftarkan bahan mentah baru.');
    } finally {
      setCreatingRawMat(false);
    }
  };

  const expiryFefo = useMemo(() => {
    return expiryDate ? getExpiryColor(expiryDate) : null;
  }, [expiryDate]);


  // Debounced search for source and target
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSourceSearch(sourceSearch);
    }, 250);
    return () => clearTimeout(handler);
  }, [sourceSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTargetSearch(targetSearch);
    }, 250);
    return () => clearTimeout(handler);
  }, [targetSearch]);

  // Autocomplete Suggestions for Source Materials (raw/fresh/prep)
  const sourceSuggestions = useMemo(() => {
    if (!debouncedSourceSearch.trim() || selectedSourceMat) return [];
    return materials
      .filter(m => m.name.toLowerCase().includes(debouncedSourceSearch.toLowerCase()))
      .slice(0, 7);
  }, [materials, debouncedSourceSearch, selectedSourceMat]);

  // Autocomplete Suggestions for Target Materials (prepped/syrup/portions)
  const targetSuggestions = useMemo(() => {
    if (!debouncedTargetSearch.trim() || selectedTargetMat) return [];
    return materials
      .filter(m => m.name.toLowerCase().includes(debouncedTargetSearch.toLowerCase()))
      .slice(0, 7);
  }, [materials, debouncedTargetSearch, selectedTargetMat]);

  // Fetch History
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await api.getOlahBahanHistory();
      setHistory(data || []);
    } catch (err) {
      console.warn('Error fetching olah bahan history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Set default units when material selected
  const handleSelectSource = (mat) => {
    setSelectedSourceMat(mat);
    setSourceSearch(mat.name);
    if (mat.unit) setSourceUnit(mat.unit);
  };

  const handleSelectTarget = (mat) => {
    setSelectedTargetMat(mat);
    setTargetSearch(mat.name);
    if (mat.unit) setTargetUnit(mat.unit);
    if (mat.shelf_life_days && Number(mat.shelf_life_days) > 0) {
      const d = new Date();
      d.setDate(d.getDate() + Number(mat.shelf_life_days));
      setExpiryDate(d.toISOString().split('T')[0]);
    }
  };

  // Real-time Yield & HPP calculations
  const analytics = useMemo(() => {
    const sQty = parseFloat(sourceQty) || 0;
    const tQty = parseFloat(targetQty) || 0;
    const wQty = parseFloat(wasteQty) || 0;

    let yieldPct = 0;
    if (sQty > 0 && tQty > 0) {
      // Normalisasi jika kg <-> gr atau L <-> ml
      let normSource = sQty;
      let normTarget = tQty;
      if (sourceUnit === 'kg' && targetUnit === 'gr') normTarget = tQty / 1000;
      else if (sourceUnit === 'gr' && targetUnit === 'kg') normSource = sQty / 1000;
      else if (sourceUnit === 'L' && targetUnit === 'ml') normTarget = tQty / 1000;
      else if (sourceUnit === 'ml' && targetUnit === 'L') normSource = sQty / 1000;

      yieldPct = normSource > 0 ? (normTarget / normSource) * 100 : 0;
    }

    const sourcePricePerUnit = selectedSourceMat?.price || selectedSourceMat?.cost_per_base_unit || 0;
    const totalSourceCost = sQty * sourcePricePerUnit;
    const newTargetHppPerUnit = tQty > 0 ? totalSourceCost / tQty : 0;
    const estimatedWasteLoss = wQty * sourcePricePerUnit;

    let yieldStatus = 'NORMAL';
    if (yieldPct >= 75) yieldStatus = 'EXCELLENT';
    else if (yieldPct < 50 && yieldPct > 0) yieldStatus = 'LOW';

    return {
      yieldPct: Math.min(100, Math.round(yieldPct * 10) / 10),
      rawYieldPct: yieldPct,
      totalSourceCost,
      newTargetHppPerUnit,
      estimatedWasteLoss,
      yieldStatus
    };
  }, [sourceQty, targetQty, wasteQty, sourceUnit, targetUnit, selectedSourceMat]);

  // Overall Today Summary from History
  const summary = useMemo(() => {
    const totalBatches = history.length;
    const totalWasteKg = history.reduce((acc, h) => acc + (parseFloat(h.waste_weight) || 0), 0);
    const avgYield = totalBatches > 0
      ? history.reduce((acc, h) => {
          const gross = parseFloat(h.gross_weight) || 0;
          const clean = parseFloat(h.clean_weight) || 0;
          return acc + (gross > 0 ? (clean / gross) * 100 : 0);
        }, 0) / totalBatches
      : 0;

    return {
      totalBatches,
      totalWasteKg: Math.round(totalWasteKg * 10) / 10,
      avgYield: Math.round(avgYield * 10) / 10
    };
  }, [history]);

  const handleReset = () => {
    setSelectedSourceMat(null);
    setSourceSearch('');
    setSourceQty('');
    setPhotoBefore(null);
    setPhotoBeforePreview(null);

    setSelectedTargetMat(null);
    setTargetSearch('');
    setTargetQty('');

    setWasteQty('');
    setPhotoAfter(null);
    setPhotoAfterPreview(null);
    setNotes('');
    setExpiryDate('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSourceMat || !selectedTargetMat) {
      return toast.showError('Pilih bahan mentah asal dan bahan hasil olahan terlebih dahulu.');
    }
    if (!sourceQty || parseFloat(sourceQty) <= 0) {
      return toast.showError('Masukkan jumlah bahan asal yang diambil.');
    }
    if (!targetQty || parseFloat(targetQty) <= 0) {
      return toast.showError('Masukkan jumlah hasil bersih olahan.');
    }
    if (!photoBefore) {
      return toast.showError('Wajib lampirkan Foto 1: Bahan asal di timbangan.');
    }
    if (!photoAfter) {
      return toast.showError('Wajib lampirkan Foto 2: Hasil olahan dan ampas.');
    }

    setLoading(true);
    try {
      await api.recordOlahBahan({
        location: 'RESTO',
        source_mat_id: selectedSourceMat.id,
        source_qty: sourceQty,
        target_mat_id: selectedTargetMat.id,
        target_qty: targetQty,
        waste_qty: wasteQty || 0,
        photo_before: photoBefore,
        photo_waste: photoAfter,
        notes: notes,
        expiry_date: expiryDate || null
      });

      triggerHaptic('success');
      toast.showSuccess(`Batch olahan berhasil dicatat! HPP ${selectedTargetMat.name} otomatis diperbarui.`);
      handleReset();
      refreshData();
      fetchHistory();
    } catch (err) {
      triggerHaptic('error');
      toast.showError(err.message || 'Gagal menyimpan olahan bahan.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-6 pb-24" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Header Elegan Barventis */}
      <div className="glass-card p-5 md:p-6 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-emerald-50/40 via-teal-50/20 to-blue-50/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)]">Olah Bahan Mentah & Batching Prep</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Konversi bahan mentah menjadi bahan siap racik dengan pelacakan rendemen (Yield) dan pergeseran HPP otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchHistory}
              disabled={historyLoading}
              className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
              title="Perbarui data riwayat"
            >
              <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} />
              <span>Sinkron Riwayat</span>
            </button>
          </div>
        </div>

        {/* Top 3 Summary Cards - Clean Minimalist */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="p-3.5 bg-white/80 border border-emerald-100 rounded-xl shadow-xs">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Batch Hari Ini</div>
            <div className="text-lg font-extrabold text-[var(--text-primary)] mt-1">{summary.totalBatches} Batch</div>
          </div>

          <div className="p-3.5 bg-white/80 border border-teal-100 rounded-xl shadow-xs">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Rata-rata Yield</div>
            <div className="text-lg font-extrabold text-teal-700 mt-1">{summary.avgYield}%</div>
          </div>

          <div className="p-3.5 bg-white/80 border border-amber-100 rounded-xl shadow-xs">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Ampas (Waste)</div>
            <div className="text-lg font-extrabold text-amber-700 mt-1">{summary.totalWasteKg} Unit</div>
          </div>
        </div>
      </div>

      {/* Main Dual-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Kolom Kiri: Formulir Prep Interaktif (7 Kolom) */}
        <div className="lg:col-span-7 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Step 1: Bahan Asal (Input) */}
            <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <span className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold">1</span>
                  Bahan Mentah Asal (Input)
                </span>
                <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Stok Dipotong
                </span>
              </div>

              {/* Searchable Bahan Mentah */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-700">Pilih Bahan Mentah (Cari Nama) *</label>
                  <button
                    type="button"
                    onClick={() => openCreateRawModal(sourceSearch)}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} />
                    <span>+ Daftarkan Bahan Baru</span>
                  </button>
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Ketik nama bahan mentah (cth: Lemon, Daging, Apel)..."
                    className="form-control pl-9 w-full text-sm py-2.5"
                    value={sourceSearch}
                    onChange={(e) => {
                      setSelectedSourceMat(null);
                      setSourceSearch(e.target.value);
                    }}
                  />
                  {selectedSourceMat && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSourceMat(null);
                        setSourceSearch('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {debouncedSourceSearch.trim().length > 0 && !selectedSourceMat && (
                  <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-[var(--border)] rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-gray-100">
                    {sourceSuggestions.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectSource(m)}
                        className="p-3 text-xs hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-gray-800">{m.name}</div>
                          <div className="text-[10px] text-gray-400">Modal: {formatIDR(m.price || m.cost_per_base_unit || 0)} / {m.unit}</div>
                        </div>
                        <span className="text-gray-500 font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded">
                          Stok: {m.qty_resto || 0} {m.unit}
                        </span>
                      </div>
                    ))}

                    {/* Jika bahan belum ada di DB atau ingin daftarkan bahan mentah baru */}
                    <div className="p-3 bg-gray-50 flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-600 truncate">
                        {sourceSuggestions.length === 0 ? (
                          <span>Bahan <strong>"{debouncedSourceSearch}"</strong> belum ada di database.</span>
                        ) : (
                          <span>Bahan yang dicari belum ada?</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openCreateRawModal(debouncedSourceSearch)}
                        className="btn btn-sm btn-primary text-xs py-1.5 px-3 flex items-center gap-1 font-bold whitespace-nowrap shrink-0"
                      >
                        <Plus size={12} />
                        <span>Daftarkan ke DB</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Qty & Unit + Photo 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-7">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Banyaknya Diambil *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="0.00"
                      className="form-control flex-1 text-sm py-2 font-bold font-mono text-blue-700"
                      value={sourceQty}
                      onChange={(e) => setSourceQty(e.target.value)}
                    />
                    <select
                      className="form-control w-24 text-xs font-bold"
                      value={sourceUnit}
                      onChange={(e) => setSourceUnit(e.target.value)}
                    >
                      {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Foto 1 Before */}
                <div className="sm:col-span-5">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Foto 1: Di Timbangan *</label>
                  <div className="relative border-2 border-dashed border-[var(--border)] rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors">
                    {photoBeforePreview ? (
                      <div className="relative w-full h-full flex items-center justify-between px-3 bg-blue-50/50">
                        <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5 truncate">
                          <span className="text-blue-600 font-bold shrink-0">✓</span> Foto Terlampir
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoBefore(null);
                            setPhotoBeforePreview(null);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 cursor-pointer">
                        <Camera size={14} className="text-blue-600" /> Ambil Foto
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          setPhotoBefore(e.target.files[0]);
                          setPhotoBeforePreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Separator Arrow */}
            <div className="flex items-center justify-center -my-2 text-[var(--text-muted)] gap-2">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Diolah Menjadi
              </span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            {/* Step 2: Hasil Olahan Bersih (Output) */}
            <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <span className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">2</span>
                  Hasil Bersih Siap Racik (Output)
                </span>
                <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Stok Bertambah
                </span>
              </div>

              {/* Searchable Target Material */}
              <div className="relative">
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Pilih Bahan Jadi Hasil Olahan *</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Ketik nama bahan jadi (cth: Jus Lemon Murni, Daging Marinasi)..."
                    className="form-control pl-9 w-full text-sm py-2.5"
                    value={targetSearch}
                    onChange={(e) => {
                      setSelectedTargetMat(null);
                      setTargetSearch(e.target.value);
                    }}
                  />
                  {selectedTargetMat && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTargetMat(null);
                        setTargetSearch('');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Suggestions Dropdown */}
                {targetSuggestions.length > 0 && !selectedTargetMat && (
                  <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-[var(--border)] rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {targetSuggestions.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectTarget(m)}
                        className="p-3 text-xs hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition-colors"
                      >
                        <div>
                          <div className="font-semibold text-gray-800">{m.name}</div>
                          <div className="text-[10px] text-gray-400">{m.category} • Satuan: {m.unit}</div>
                        </div>
                        <span className="text-gray-500 font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded">
                          Stok: {m.qty_resto || 0} {m.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Target Qty & Unit */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Dapat Berapa Banyak Hasil Bersih? *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="0.00"
                    className="form-control flex-1 text-sm py-2 font-bold font-mono text-emerald-700"
                    value={targetQty}
                    onChange={(e) => setTargetQty(e.target.value)}
                  />
                  <select
                    className="form-control w-24 text-xs font-bold"
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value)}
                  >
                    {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Setup Tanggal Kedaluwarsa Olahan (FEFO) */}
              <div className="pt-3 border-t border-[var(--border)]/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    Setup Tanggal Kedaluwarsa Olahan (FEFO)
                  </label>
                  {selectedTargetMat?.shelf_life_days && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Standar simpan: {selectedTargetMat.shelf_life_days} hari
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <div className="sm:col-span-5">
                    <input
                      type="date"
                      className="form-control w-full text-xs py-1.5 font-medium font-mono"
                      value={expiryDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setExpiryDate(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-7 flex flex-wrap gap-1">
                    {[
                      { label: '+1 Hari', days: 1 },
                      { label: '+3 Hari', days: 3 },
                      { label: '+7 Hari', days: 7 },
                      { label: '+14 Hari', days: 14 },
                      { label: '+30 Hari', days: 30 }
                    ].map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + preset.days);
                          setExpiryDate(d.toISOString().split('T')[0]);
                        }}
                        className="text-[11px] px-2 py-1 rounded-md bg-gray-100 hover:bg-emerald-50 hover:text-emerald-700 text-gray-600 font-medium transition-colors border border-gray-200"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {expiryFefo && (
                  <div className="text-[11px] flex items-center gap-2 pt-0.5">
                    <span className="text-gray-500">Status Masa Simpan:</span>
                    {expiryFefo.color === 'red' && (
                      <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        {expiryFefo.label} ({expiryFefo.days} hari lagi)
                      </span>
                    )}
                    {expiryFefo.color === 'yellow' && (
                      <span className="font-bold text-yellow-800 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">
                        {expiryFefo.label} ({expiryFefo.days} hari lagi)
                      </span>
                    )}
                    {expiryFefo.color === 'green' && (
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {expiryFefo.label} ({expiryFefo.days} hari lagi)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>


            {/* Step 3: Ampas / Waste & Foto 2 */}
            <div className="glass-card p-5 rounded-2xl border border-red-200/60 bg-red-50/20 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-red-200/40 pb-3">
                <span className="text-xs font-extrabold text-red-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[11px] font-bold">3</span>
                  Ampas, Kulit & Tulang Terbuang (Waste)
                </span>
                <span className="text-[11px] font-medium text-red-600 bg-red-100/60 px-2 py-0.5 rounded-full">
                  Otomatis Audit Limbah
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-7">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Berat Ampas Dibuang</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      className="form-control flex-1 text-sm py-2 font-bold font-mono text-red-600"
                      value={wasteQty}
                      onChange={(e) => setWasteQty(e.target.value)}
                    />
                    <select
                      className="form-control w-24 text-xs font-bold"
                      value={wasteUnit}
                      onChange={(e) => setWasteUnit(e.target.value)}
                    >
                      {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Foto 2 After */}
                <div className="sm:col-span-5">
                  <label className="text-xs font-bold text-red-700 block mb-1.5">Foto 2: Hasil & Ampas *</label>
                  <div className="relative border-2 border-dashed border-red-300 rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-white hover:bg-red-50/50 transition-colors">
                    {photoAfterPreview ? (
                      <div className="relative w-full h-full flex items-center justify-between px-3 bg-red-50/50">
                        <span className="text-xs font-semibold text-red-700 flex items-center gap-1.5 truncate">
                          <span className="text-red-600 font-bold shrink-0">✓</span> Foto Terlampir
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoAfter(null);
                            setPhotoAfterPreview(null);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-red-600 flex items-center gap-1.5 cursor-pointer">
                        <Camera size={14} /> Ambil Foto
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          setPhotoAfter(e.target.files[0]);
                          setPhotoAfterPreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="cth: Kualitas jeruk manis, ampas tipis..."
                  className="form-control w-full text-xs py-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3.5 justify-center font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-all disabled:opacity-50 h-[48px]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <RefreshCw size={16} className="animate-spin" /> Menyimpan & Memperbarui HPP...
                </span>
              ) : (
                <span>Simpan Hasil Olahan & Perbarui Stok</span>
              )}
            </button>
          </form>
        </div>

        {/* Kolom Kanan: Live Yield & Cost Analytics (5 Kolom) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-xs space-y-5 sticky top-20">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="font-extrabold text-sm text-[var(--text-primary)]">
                Analisis Rendemen & HPP
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Real-time</span>
            </div>

            {/* Yield Percentage Display */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 text-center space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estimasi Rendemen (Yield)</div>
              <div className="flex items-baseline justify-center gap-1">
                <span className={`text-4xl font-black font-mono ${
                  analytics.yieldStatus === 'EXCELLENT' ? 'text-emerald-600' :
                  analytics.yieldStatus === 'LOW' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {analytics.yieldPct}%
                </span>
              </div>

              {/* Status Badge */}
              <div className="flex justify-center">
                {analytics.yieldStatus === 'EXCELLENT' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    Rendemen Sangat Baik
                  </span>
                )}
                {analytics.yieldStatus === 'NORMAL' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    Rendemen Standar
                  </span>
                )}
                {analytics.yieldStatus === 'LOW' && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                    Susut Tinggi / Boros
                  </span>
                )}
              </div>

              {/* Visual Progress Bar (Clean vs Waste) */}
              <div className="pt-2">
                <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${Math.min(100, analytics.yieldPct)}%` }}
                    className="bg-emerald-500 transition-all duration-300"
                    title={`Hasil Bersih: ${analytics.yieldPct}%`}
                  />
                  <div
                    style={{ width: `${Math.max(0, 100 - analytics.yieldPct)}%` }}
                    className="bg-red-400 transition-all duration-300"
                    title="Ampas & Susut"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 font-semibold mt-1">
                  <span className="text-emerald-700">Hasil Bersih: {analytics.yieldPct}%</span>
                  <span className="text-red-600">Ampas: {(100 - analytics.yieldPct).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Cost & HPP Transfer Preview */}
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40">
                <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  1. Modal Bahan Mentah Dipakai
                </div>
                <div className="text-base font-extrabold text-blue-800">
                  {formatIDR(analytics.totalSourceCost)}
                </div>
                <div className="text-[10px] text-blue-600 mt-0.5">
                  {sourceQty || 0} {sourceUnit} × {formatIDR(selectedSourceMat?.price || selectedSourceMat?.cost_per_base_unit || 0)}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/50">
                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>2. HPP Bahan Jadi Otomatis</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-mono">Real-time</span>
                </div>
                <div className="text-lg font-black text-emerald-800">
                  {formatIDR(Math.round(analytics.newTargetHppPerUnit))} <span className="text-xs font-semibold text-emerald-600">/ {targetUnit}</span>
                </div>
                <div className="text-[10px] text-emerald-700 mt-0.5">
                  Beban modal terdistribusi proporsional ke hasil bersih
                </div>
              </div>

              {parseFloat(wasteQty) > 0 && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50/40 flex justify-between items-center">
                  <div>
                    <div className="text-[11px] font-bold text-red-800">Estimasi Nilai Kerugian Ampas</div>
                    <div className="text-xs text-red-600 font-mono mt-0.5">{wasteQty} {wasteUnit} terbuang</div>
                  </div>
                  <div className="text-sm font-extrabold text-red-700">
                    {formatIDR(Math.round(analytics.estimatedWasteLoss))}
                  </div>
                </div>
              )}
            </div>

            {/* Practical Advice */}
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-[11px] text-gray-600 space-y-1">
              <div className="font-bold text-gray-800">
                Standar Operasional:
              </div>
              <p>Pastikan buah/daging dikupas bersih dan difoto di atas timbangan digital untuk memenuhi kepatuhan audit HPP resto.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Riwayat Olahan Hari Ini */}
      <div className="glass-card rounded-2xl border border-[var(--border)] overflow-hidden bg-white shadow-xs">
        <div className="p-4 md:p-5 border-b border-[var(--border)] bg-gray-50/60 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-extrabold text-base text-[var(--text-primary)]">
              Riwayat Olah Bahan Hari Ini
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Rekaman batch olahan bahan mentah yang telah diverifikasi dan masuk ke inventaris siap jual.
            </p>
          </div>
          <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
            {history.length} Batch Tercatat
          </span>
        </div>

        {historyLoading ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
            <RefreshCw size={24} className="animate-spin text-emerald-600" />
            <span>Memuat riwayat olahan bahan...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--text-muted)]">
            <p className="font-semibold text-gray-600">Belum ada bahan diolah hari ini</p>
            <p className="text-xs text-gray-400 mt-1">Gunakan formulir di atas untuk mencatat batch pertama.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">No & Batch</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Bahan Mentah</th>
                  <th className="py-3 px-4">Kuantitas Input</th>
                  <th className="py-3 px-4">Hasil Jadi (Bersih)</th>
                  <th className="py-3 px-4">Ampas</th>
                  <th className="py-3 px-4">Rendemen (Yield)</th>
                  <th className="py-3 px-4 text-center">Foto Bukti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {history.map((h, idx) => {
                  const gross = parseFloat(h.gross_weight) || 0;
                  const clean = parseFloat(h.clean_weight) || 0;
                  const waste = parseFloat(h.waste_weight) || 0;
                  const yieldRate = gross > 0 ? (clean / gross) * 100 : 0;
                  const dateStr = h.created_at ? new Date(h.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';

                  return (
                    <tr key={h.id || idx} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                        <span className="text-gray-400 mr-2">#{idx + 1}</span>
                        {h.batch_number || `BATCH-${h.id}`}
                      </td>
                      <td className="py-3.5 px-4 text-gray-500">
                        {dateStr}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-900">
                        {h.materials?.name || `Material #${h.material_id}`}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                        {gross} {h.materials?.unit || 'Unit'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {clean} Unit
                      </td>
                      <td className="py-3.5 px-4 font-mono text-red-600">
                        {waste > 0 ? `${waste} Unit` : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          yieldRate >= 75 ? 'bg-emerald-100 text-emerald-800' :
                          yieldRate < 50 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {yieldRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {h.gross_photo_url && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({ title: 'Foto Bahan Sebelum Diolah', url: h.gross_photo_url })}
                              className="p-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                              title="Lihat Foto Before"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                          {h.clean_photo_url && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({ title: 'Foto Hasil Jadi & Ampas', url: h.clean_photo_url })}
                              className="p-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-700"
                              title="Lihat Foto After"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                          {!h.gross_photo_url && !h.clean_photo_url && (
                            <span className="text-gray-300">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal View Photo */}
      {selectedPhotoModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl space-y-3 p-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h4 className="font-bold text-sm text-gray-800">{selectedPhotoModal.title}</h4>
              <button
                type="button"
                onClick={() => setSelectedPhotoModal(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden bg-gray-100 aspect-video flex items-center justify-center">
              <img
                src={selectedPhotoModal.url}
                alt="Bukti Foto"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Setup Bahan Mentah Baru ke Database */}
      {showCreateRawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-[var(--border)] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 md:p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h4 className="font-bold text-base text-gray-900">Setup Bahan Mentah Baru</h4>
                <p className="text-xs text-gray-500 mt-0.5">Daftarkan langsung ke Big Master DB sebagai bahan mentah asal.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRawModal(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRawMaterial} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nama Bahan Mentah *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jeruk Peras Segar, Daging Sapi Brisket..."
                  className="form-control w-full text-sm py-2"
                  value={newRawMat.name}
                  onChange={(e) => setNewRawMat({ ...newRawMat, name: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Kategori</label>
                  <select
                    className="form-control w-full text-xs py-2"
                    value={newRawMat.category}
                    onChange={(e) => setNewRawMat({ ...newRawMat, category: e.target.value })}
                  >
                    {OFFICIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Satuan Dasar *</label>
                  <select
                    className="form-control w-full text-xs py-2 font-bold"
                    value={newRawMat.unit}
                    onChange={(e) => setNewRawMat({ ...newRawMat, unit: e.target.value })}
                  >
                    {COMMON_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Harga Beli / Modal (Rp) *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Contoh: 25000"
                    className="form-control w-full text-xs py-2 font-mono"
                    value={newRawMat.price}
                    onChange={(e) => setNewRawMat({ ...newRawMat, price: e.target.value })}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Modal per {newRawMat.unit}</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Stok Awal di Resto</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0"
                    className="form-control w-full text-xs py-2 font-mono"
                    value={newRawMat.qty_resto}
                    onChange={(e) => setNewRawMat({ ...newRawMat, qty_resto: e.target.value })}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Satuan {newRawMat.unit}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Standar Masa Simpan (Hari)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Opsional, cth: 7"
                    className="form-control w-full text-xs py-2 font-mono"
                    value={newRawMat.shelf_life_days}
                    onChange={(e) => setNewRawMat({ ...newRawMat, shelf_life_days: e.target.value })}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Ketahanan simpan bahan mentah</span>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Batas Minimum Stok</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="5"
                    className="form-control w-full text-xs py-2 font-mono"
                    value={newRawMat.min_stock}
                    onChange={(e) => setNewRawMat({ ...newRawMat, min_stock: e.target.value })}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Alert jika stok menipis</span>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateRawModal(false)}
                  disabled={creatingRawMat}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creatingRawMat}
                  className="btn btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5"
                >
                  {creatingRawMat ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan ke Database & Pilih</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
