import { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { Search, Camera, RefreshCw, X, Eye, Plus, Check } from 'lucide-react';
import { OFFICIAL_CATEGORIES } from './Marketlist';
import { triggerHaptic } from '../../utils/haptics';
import { formatIDR, calculateIngredientCost } from '../../services/costUtils';
import { getExpiryColor } from '../../utils/expiryColor';

const COMMON_UNITS = ['gr', 'kg', 'ml', 'L', 'pck', 'pcs', 'btl', 'can'];

const PROCESSING_TYPES = [
  { key: 'Kupas / Potong Bersih', label: 'Kupas / Potong Bersih', suffix: 'Bersih Siap Pakai', defaultUnit: null },
  { key: 'Peras / Sari Murni (Jus)', label: 'Peras / Sari Murni (Jus)', suffix: 'Sari / Jus Murni', defaultUnit: 'ml' },
  { key: 'Iris / Porsi Siap Masak', label: 'Iris / Porsi Siap Masak', suffix: 'Iris / Porsi', defaultUnit: null },
  { key: 'Marinasi / Bumbu', label: 'Marinasi / Bumbu', suffix: 'Marinasi', defaultUnit: null },
  { key: 'Rebus / Matang (Prep)', label: 'Rebus / Matang (Prep)', suffix: 'Matang / Prep', defaultUnit: null },
];

// Helper konversi antar satuan sejenis (kg <-> gr, L <-> ml)
function convertBetweenUnits(value, fromUnit, toUnit) {
  const val = parseFloat(value);
  if (!Number.isFinite(val)) return 0;
  const f = String(fromUnit || '').toLowerCase();
  const t = String(toUnit || '').toLowerCase();
  if (f === t) return val;

  // Konversi ke basis gram / ml (1 kg = 1000 gr, 1 L = 1000 ml)
  const toSmall = (v, u) => (u === 'kg' || u === 'l' ? v * 1000 : v);
  const fromSmall = (v, u) => (u === 'kg' || u === 'l' ? v / 1000 : v);

  const isMetricWeightOrVol = (u) => ['kg', 'gr', 'g', 'l', 'ml'].includes(u);
  if (isMetricWeightOrVol(f) && isMetricWeightOrVol(t)) {
    const baseSmall = toSmall(val, f);
    return fromSmall(baseSmall, t);
  }
  return val;
}

export default function SimplePrep() {
  const { stock: rawStock, refreshData } = useData();
  const materials = useMemo(() => rawStock || [], [rawStock]);
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedPhotoModal, setSelectedPhotoModal] = useState(null);

  // Step 1: Bahan Mentah Asal (Input)
  const [sourceSearch, setSourceSearch] = useState('');
  const [debouncedSourceSearch, setDebouncedSourceSearch] = useState('');
  const [selectedSourceMat, setSelectedSourceMat] = useState(null);
  const [sourceQty, setSourceQty] = useState('');
  const [sourceUnit, setSourceUnit] = useState('kg');
  const [photoBefore, setPhotoBefore] = useState(null);
  const [photoBeforePreview, setPhotoBeforePreview] = useState(null);

  // Step 2: Hasil Bersih & Diolah Menjadi Apa (Otomatis Terintegrasi dari Step 1)
  const [processedInto, setProcessedInto] = useState(PROCESSING_TYPES[0].key);
  const [customProcessedName, setCustomProcessedName] = useState('');
  const [manualTargetOverride, setManualTargetOverride] = useState(false);
  const [targetSearch, setTargetSearch] = useState('');
  const [debouncedTargetSearch, setDebouncedTargetSearch] = useState('');
  const [selectedTargetMat, setSelectedTargetMat] = useState(null);
  const [targetQty, setTargetQty] = useState('');
  const [targetUnit, setTargetUnit] = useState('kg');
  const [photoClean, setPhotoClean] = useState(null);
  const [photoCleanPreview, setPhotoCleanPreview] = useState(null);
  const [expiryDate, setExpiryDate] = useState('');

  // Step 3: Ampas / Waste (Otomatis Dihitung dari Berat Mentah - Berat Bersih)
  const [wasteQty, setWasteQty] = useState('');
  const [wasteUnit, setWasteUnit] = useState('kg');
  const [isWasteManual, setIsWasteManual] = useState(false);
  const [photoWaste, setPhotoWaste] = useState(null);
  const [photoWastePreview, setPhotoWastePreview] = useState(null);
  const [notes, setNotes] = useState('');

  // Quick Setup Modal for Missing Raw Materials
  const [showCreateRawModal, setShowCreateRawModal] = useState(false);
  const [creatingRawMat, setCreatingRawMat] = useState(false);
  const [newRawMat, setNewRawMat] = useState({
    name: '',
    trim_stage: 'RAW_UNTRIMMED',
    category: 'Bahan Mentah / Raw Material',
    unit: 'kg',
    price: '',
    qty_resto: '',
    shelf_life_days: '',
    min_stock: '5'
  });

  // Daftar Bahan Mentah dari Stok Raw untuk 1-Klik Pilih Cepat
  const rawMaterialsQuickList = useMemo(() => {
    const rawKeywords = ['mentah', 'raw', 'fresh', 'buah', 'sayur', 'daging', 'ayam', 'ikan', 'lemon', 'jeruk', 'apel', 'semangka', 'nanas', 'pisang', 'jahe', 'serai', 'daun'];
    const candidates = materials.filter((m) => {
      const cat = String(m.category || '').toLowerCase();
      const name = String(m.name || '').toLowerCase();
      const isAlreadyTrimmed = name.includes('(bersih') || name.includes('siap pakai') || name.includes('sari / jus');
      if (isAlreadyTrimmed) return false;
      return (
        m.is_preparable === true ||
        Number(m.qty_resto) > 0 ||
        rawKeywords.some((kw) => cat.includes(kw) || name.includes(kw))
      );
    });
    return candidates
      .sort((a, b) => (Number(b.qty_resto) || 0) - (Number(a.qty_resto) || 0))
      .slice(0, 10);
  }, [materials]);

  // Nama Hasil Olahan Otomatis berdasarkan Bahan Mentah + Diolah Menjadi Apa
  const autoTargetMaterialName = useMemo(() => {
    if (manualTargetOverride && selectedTargetMat) {
      return selectedTargetMat.name;
    }
    if (customProcessedName.trim()) {
      return customProcessedName.trim();
    }
    if (!selectedSourceMat) return '';
    const procObj = PROCESSING_TYPES.find((p) => p.key === processedInto) || PROCESSING_TYPES[0];
    return `${selectedSourceMat.name} (${procObj.suffix})`;
  }, [selectedSourceMat, processedInto, customProcessedName, manualTargetOverride, selectedTargetMat]);

  // Cari otomatis apakah bahan hasil olahan sudah pernah terdaftar di tabel materials
  useEffect(() => {
    if (!selectedSourceMat || manualTargetOverride) return;
    const expectedName = autoTargetMaterialName.toLowerCase();
    const baseName = selectedSourceMat.name.toLowerCase();
    const existingMatch = materials.find((m) => {
      if (Number(m.id) === Number(selectedSourceMat.id)) return false;
      const n = String(m.name || '').toLowerCase();
      return n === expectedName || (n.includes(baseName) && (n.includes('bersih') || n.includes('jus') || n.includes('sari') || n.includes('marinasi') || n.includes('prep')));
    });
    if (existingMatch) {
      setSelectedTargetMat(existingMatch);
    } else {
      setSelectedTargetMat(null);
    }
  }, [selectedSourceMat, autoTargetMaterialName, materials, manualTargetOverride]);

  // OTOMATIS HITUNG AMPAS (WASTE) begitu pengguna mengisi Berat Mentah (sourceQty) & Berat Bersih (targetQty)
  useEffect(() => {
    if (isWasteManual) return;
    const sQty = parseFloat(sourceQty);
    const tQty = parseFloat(targetQty);
    if (!Number.isFinite(sQty) || sQty <= 0 || !Number.isFinite(tQty) || tQty < 0) {
      setWasteQty('');
      return;
    }
    // Konversi berat bersih ke satuan wasteUnit (default mengikuti sourceUnit)
    const sourceInWasteUnit = convertBetweenUnits(sQty, sourceUnit, wasteUnit);
    const targetInWasteUnit = convertBetweenUnits(tQty, targetUnit, wasteUnit);
    const calculatedWaste = Math.max(0, +(sourceInWasteUnit - targetInWasteUnit).toFixed(3));
    setWasteQty(String(calculatedWaste));
  }, [sourceQty, sourceUnit, targetQty, targetUnit, wasteUnit, isWasteManual]);

  const openCreateRawModal = (initialName = '', stage = 'RAW_UNTRIMMED') => {
    const isPrepped = stage === 'PREPPED_TRIMMED';
    setNewRawMat({
      name: initialName || (isPrepped ? targetSearch : sourceSearch) || '',
      trim_stage: stage,
      category: isPrepped ? 'Bahan Olahan / Prep' : 'Bahan Mentah / Raw Material',
      unit: isPrepped ? 'gr' : 'kg',
      price: '',
      qty_resto: '0',
      shelf_life_days: isPrepped ? '3' : '',
      min_stock: '5'
    });
    setShowCreateRawModal(true);
  };

  const handleCreateRawMaterial = async (e) => {
    e.preventDefault();
    if (!newRawMat.name.trim()) {
      return toast.showError('Nama bahan wajib diisi.');
    }
    setCreatingRawMat(true);
    try {
      const isPrepped = newRawMat.trim_stage === 'PREPPED_TRIMMED';
      const defaultFullPack =
        newRawMat.unit === 'kg' ? '1000 gr' :
        newRawMat.unit === 'L' ? '1000 ml' :
        `1 ${newRawMat.unit || 'kg'}`;

      const created = await api.createMaterial({
        name: newRawMat.name.trim(),
        category: newRawMat.category || (isPrepped ? 'Bahan Olahan / Prep' : 'Bahan Mentah / Raw Material'),
        unit: newRawMat.unit || 'kg',
        full_pack: defaultFullPack,
        price: parseFloat(newRawMat.price) || 0,
        qty_resto: parseFloat(newRawMat.qty_resto) || 0,
        shelf_life_days: newRawMat.shelf_life_days ? parseInt(newRawMat.shelf_life_days, 10) : null,
        min_stock: parseFloat(newRawMat.min_stock) || 5,
        is_preparable: !isPrepped
      });
      await refreshData();
      if (isPrepped) {
        setManualTargetOverride(true);
        handleSelectTarget(created);
      } else {
        handleSelectSource(created);
      }
      setShowCreateRawModal(false);
      toast.showSuccess(`Bahan "${created.name}" berhasil didaftarkan dan dipilih.`);
    } catch (err) {
      toast.showError(err.message || 'Gagal mendaftarkan bahan baru.');
    } finally {
      setCreatingRawMat(false);
    }
  };

  const expiryFefo = useMemo(() => {
    return expiryDate ? getExpiryColor(expiryDate) : null;
  }, [expiryDate]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSourceSearch(sourceSearch), 200);
    return () => clearTimeout(handler);
  }, [sourceSearch]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedTargetSearch(targetSearch), 200);
    return () => clearTimeout(handler);
  }, [targetSearch]);

  const sourceSuggestions = useMemo(() => {
    if (!debouncedSourceSearch.trim() || selectedSourceMat) return [];
    return materials
      .filter((m) => m.name.toLowerCase().includes(debouncedSourceSearch.toLowerCase()))
      .slice(0, 8);
  }, [materials, debouncedSourceSearch, selectedSourceMat]);

  const targetSuggestions = useMemo(() => {
    if (!debouncedTargetSearch.trim()) return [];
    return materials
      .filter((m) => m.name.toLowerCase().includes(debouncedTargetSearch.toLowerCase()))
      .slice(0, 8);
  }, [materials, debouncedTargetSearch]);

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

  // Saat Bahan Mentah dipilih di Step 1 -> Otomatis isi satuan, stok, dan sambungkan ke Step 2 & Step 3
  const handleSelectSource = (mat) => {
    setSelectedSourceMat(mat);
    setSourceSearch(mat.name);
    const defaultUnit = mat.unit || 'kg';
    setSourceUnit(defaultUnit);
    setWasteUnit(defaultUnit);
    setIsWasteManual(false);

    // Otomatis sesuaikan satuan bersih (jika bahan mentah kg, hasil bersih bisa kg atau gr)
    const procObj = PROCESSING_TYPES.find((p) => p.key === processedInto);
    if (procObj?.defaultUnit) {
      setTargetUnit(procObj.defaultUnit);
    } else {
      setTargetUnit(defaultUnit);
    }

    // Jika di stok Resto sudah ada angkanya dari input raw/pembelian kemarin, langsung isikan sebagai default
    const availableResto = parseFloat(mat.qty_resto) || 0;
    if (availableResto > 0 && !sourceQty) {
      setSourceQty(String(availableResto));
    }

    // Set default tanggal simpan FEFO (+3 hari jika belum diisi)
    if (!expiryDate) {
      const d = new Date();
      d.setDate(d.getDate() + (Number(mat.shelf_life_days) > 0 ? Number(mat.shelf_life_days) : 3));
      setExpiryDate(d.toISOString().split('T')[0]);
    }
  };

  const handleSelectProcessingType = (proc) => {
    setProcessedInto(proc.key);
    setManualTargetOverride(false);
    if (proc.defaultUnit) {
      setTargetUnit(proc.defaultUnit);
    } else if (selectedSourceMat?.unit) {
      setTargetUnit(selectedSourceMat.unit);
    }
    setIsWasteManual(false);
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

  // Perhitungan Real-time: Hasil Bersih, Ampas (Waste), Persentase Rendemen, dan HPP Baru
  const analytics = useMemo(() => {
    const sQty = parseFloat(sourceQty) || 0;
    const tQty = parseFloat(targetQty) || 0;
    const wQty = parseFloat(wasteQty) || 0;

    let yieldPct = 0;
    if (sQty > 0 && tQty > 0) {
      const normTargetInSourceUnit = convertBetweenUnits(tQty, targetUnit, sourceUnit);
      yieldPct = sQty > 0 ? (normTargetInSourceUnit / sQty) * 100 : 0;
    }

    const totalSourceCost = selectedSourceMat ? calculateIngredientCost(selectedSourceMat, sQty, sourceUnit) : 0;
    const newTargetHppPerUnit = tQty > 0 ? totalSourceCost / tQty : 0;
    const estimatedWasteLoss = selectedSourceMat ? calculateIngredientCost(selectedSourceMat, wQty, wasteUnit) : 0;

    let yieldStatus = 'NORMAL';
    if (yieldPct >= 75) yieldStatus = 'EXCELLENT';
    else if (yieldPct < 50 && yieldPct > 0) yieldStatus = 'LOW';

    return {
      yieldPct: Math.min(100, Math.round(yieldPct * 10) / 10),
      wastePct: sQty > 0 && tQty > 0 ? Math.max(0, +(100 - Math.min(100, Math.round(yieldPct * 10) / 10)).toFixed(1)) : 0,
      totalSourceCost,
      newTargetHppPerUnit,
      estimatedWasteLoss,
      yieldStatus
    };
  }, [sourceQty, targetQty, wasteQty, sourceUnit, targetUnit, wasteUnit, selectedSourceMat]);

  const summary = useMemo(() => {
    const totalBatches = history.length;
    const totalWasteKg = history.reduce((acc, h) => acc + (parseFloat(h.display_waste_qty ?? h.waste_weight) || 0), 0);
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

    setProcessedInto(PROCESSING_TYPES[0].key);
    setCustomProcessedName('');
    setManualTargetOverride(false);
    setSelectedTargetMat(null);
    setTargetSearch('');
    setTargetQty('');
    setPhotoClean(null);
    setPhotoCleanPreview(null);

    setWasteQty('');
    setIsWasteManual(false);
    setPhotoWaste(null);
    setPhotoWastePreview(null);
    setNotes('');
    setExpiryDate('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSourceMat) {
      return toast.showError('Pilih bahan mentah asal terlebih dahulu.');
    }
    if (!sourceQty || parseFloat(sourceQty) <= 0) {
      return toast.showError('Masukkan berat/jumlah bahan mentah yang diambil.');
    }
    if (!targetQty || parseFloat(targetQty) <= 0) {
      return toast.showError('Masukkan jumlah hasil bersih yang didapat.');
    }
    if (!photoBefore) {
      return toast.showError('Wajib lampirkan Foto 1: Bahan mentah di timbangan.');
    }
    if (!photoClean) {
      return toast.showError('Wajib lampirkan Foto 2: Berat bersih hasil olahan di timbangan.');
    }
    if (!photoWaste && parseFloat(wasteQty) > 0) {
      return toast.showError('Wajib lampirkan Foto 3: Bukti ampas/waste (atau klik "Gunakan Foto 2" jika difoto bersamaan).');
    }

    setLoading(true);
    try {
      await api.recordOlahBahan({
        location: 'RESTO',
        source_mat_id: selectedSourceMat.id,
        source_qty: sourceQty,
        source_unit: sourceUnit,
        target_mat_id: selectedTargetMat?.id || null,
        target_mat_name: autoTargetMaterialName,
        processed_into: processedInto,
        target_qty: targetQty,
        target_unit: targetUnit,
        waste_qty: wasteQty || 0,
        waste_unit: wasteUnit,
        new_target_hpp: Math.round(analytics.newTargetHppPerUnit),
        photo_before: photoBefore,
        photo_clean: photoClean,
        photo_waste: photoWaste || photoClean,
        notes: notes,
        expiry_date: expiryDate || null
      });

      triggerHaptic('success');
      toast.showSuccess(`Olahan "${autoTargetMaterialName}" (${targetQty} ${targetUnit}) & ampas (${wasteQty || 0} ${wasteUnit}) berhasil disimpan!`);
      handleReset();
      refreshData();
      fetchHistory();
    } catch (err) {
      triggerHaptic('error');
      toast.showError(err.message || 'Gagal menyimpan data olah bahan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div className="glass-card p-5 md:p-6 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-emerald-50/40 via-teal-50/20 to-blue-50/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-[var(--text-primary)]">Olah Bahan Mentah (Trimming & Prep)</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Pilih bahan dari stok raw, masukkan berat bersih yang didapat, maka hasil olahan beserta ampas (waste) dan HPP baru langsung terhitung otomatis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={historyLoading ? 'animate-spin' : ''} />
              <span>Perbarui Riwayat</span>
            </button>
          </div>
        </div>

        {/* Top 3 Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="p-3.5 bg-white/80 border border-emerald-100 rounded-xl shadow-xs">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Batch Olahan Hari Ini</div>
            <div className="text-lg font-extrabold text-[var(--text-primary)] mt-1">{summary.totalBatches} Batch</div>
          </div>

          <div className="p-3.5 bg-white/80 border border-teal-100 rounded-xl shadow-xs">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Rata-rata Hasil Bersih</div>
            <div className="text-lg font-extrabold text-teal-700 mt-1">{summary.avgYield}%</div>
          </div>

          <div className="p-3.5 bg-white/80 border border-amber-100 rounded-xl shadow-xs">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Total Ampas Terbuang</div>
            <div className="text-lg font-extrabold text-amber-700 mt-1">{summary.totalWasteKg} Unit</div>
          </div>
        </div>
      </div>

      {/* Main Dual-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Formulir Terintegrasi (7 Kolom) */}
        <div className="lg:col-span-7 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* STEP 1: BAHAN MENTAH ASAL (TERINTEGRASI DARI DATA BARANG RAW) */}
            <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <span className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold">1</span>
                  Bahan Mentah Asal (Dari Data Barang Raw)
                </span>
                <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Stok Raw Dipotong
                </span>
              </div>

              {/* 1-Klik Pilih Cepat dari Data Barang Raw yang Tersedia */}
              {rawMaterialsQuickList.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-gray-500">
                    Pilih Cepat dari Data Barang Raw (Klik untuk langsung muat):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rawMaterialsQuickList.map((mat) => {
                      const isActive = selectedSourceMat?.id === mat.id;
                      return (
                        <button
                          key={mat.id}
                          type="button"
                          onClick={() => handleSelectSource(mat)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                              : 'bg-gray-50 hover:bg-blue-50 text-gray-700 border-gray-200 font-medium'
                          }`}
                        >
                          <span>{mat.name}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${isActive ? 'bg-blue-700 text-blue-100' : 'bg-white text-gray-500 border border-gray-200'}`}>
                            {mat.qty_resto || 0} {mat.unit}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pencarian Bahan Mentah */}
              <div className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-700">Cari Bahan Mentah *</label>
                  <button
                    type="button"
                    onClick={() => openCreateRawModal(sourceSearch, 'RAW_UNTRIMMED')}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} />
                    <span>Bahan Baru</span>
                  </button>
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Ketik nama bahan mentah (cth: Lemon, Jeruk, Ayam, Daging)..."
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
                          Stok Resto: {m.qty_resto || 0} {m.unit}
                        </span>
                      </div>
                    ))}

                    <div className="p-3 bg-gray-50 flex items-center justify-between gap-2">
                      <div className="text-xs text-gray-600 truncate">
                        {sourceSuggestions.length === 0 ? (
                          <span>Bahan <strong>"{debouncedSourceSearch}"</strong> belum ada di daftar.</span>
                        ) : (
                          <span>Bahan belum terdaftar?</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openCreateRawModal(debouncedSourceSearch, 'RAW_UNTRIMMED')}
                        className="btn btn-sm btn-primary text-xs py-1.5 px-3 flex items-center gap-1 font-bold whitespace-nowrap shrink-0"
                      >
                        <Plus size={12} />
                        <span>Tambah Bahan Raw</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Berat Mentah Diambil + Foto 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-7 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-700">Berat Kotor / Banyaknya Diambil *</label>
                    {selectedSourceMat && Number(selectedSourceMat.qty_resto) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSourceQty(String(selectedSourceMat.qty_resto));
                          setSourceUnit(selectedSourceMat.unit || 'kg');
                        }}
                        className="text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        Pakai Semua Stok ({selectedSourceMat.qty_resto} {selectedSourceMat.unit})
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="0.00"
                      className="form-control flex-1 text-sm py-2 font-bold font-mono text-blue-700"
                      style={{ flex: '1 1 0%', minWidth: '120px', width: 'auto' }}
                      value={sourceQty}
                      onChange={(e) => setSourceQty(e.target.value)}
                    />
                    <select
                      className="form-control w-24 text-xs font-bold"
                      style={{ width: '96px', flex: '0 0 96px' }}
                      value={sourceUnit}
                      onChange={(e) => {
                        setSourceUnit(e.target.value);
                        setWasteUnit(e.target.value);
                      }}
                    >
                      {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Foto 1: Bahan Mentah di Timbangan */}
                <div className="sm:col-span-5">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">Foto 1: Berat Kotor di Timbangan *</label>
                  <div className="relative border-2 border-dashed border-[var(--border)] rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-gray-50 hover:bg-gray-100 transition-colors">
                    {photoBeforePreview ? (
                      <div className="relative w-full h-full flex items-center justify-between px-3 bg-blue-50/50">
                        <span className="text-xs font-semibold text-blue-700 flex items-center gap-1.5 truncate">
                          <Check size={14} className="text-blue-600 shrink-0" /> Foto Mentah Siap
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoBefore(null);
                            setPhotoBeforePreview(null);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 z-10"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1.5 cursor-pointer">
                        <Camera size={14} className="text-blue-600" /> Ambil Foto Mentah
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

            {/* Separator */}
            <div className="flex items-center justify-center -my-2 text-[var(--text-muted)] gap-2">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Otomatis Diolah Menjadi
              </span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            {/* STEP 2: HASIL BERSIH, DIOLAH MENJADI APA, & FOTO BERAT BERSIH */}
            <div className="glass-card p-5 rounded-2xl border border-emerald-200/80 bg-white shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <span className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold">2</span>
                  Hasil Bersih & Diolah Menjadi Apa (Output)
                </span>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  Terhubung Otomatis dari Bahan Mentah
                </span>
              </div>

              {/* Pilihan Diolah Menjadi Apa (Tanpa Perlu Input Ulang Bahan Baru) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">Diolah Menjadi Apa? *</label>
                  <button
                    type="button"
                    onClick={() => setManualTargetOverride((prev) => !prev)}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline"
                  >
                    {manualTargetOverride ? 'Gunakan Nama Otomatis dari Bahan Raw' : 'Pilih Manual dari Daftar Bahan Lain'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {PROCESSING_TYPES.map((proc) => {
                    const isSelected = !manualTargetOverride && processedInto === proc.key;
                    return (
                      <button
                        key={proc.key}
                        type="button"
                        onClick={() => handleSelectProcessingType(proc)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                            : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 font-medium'
                        }`}
                      >
                        {proc.label}
                      </button>
                    );
                  })}
                </div>

                {/* Preview Hasil Olahan Otomatis (Bisa Diedit Langsung Jika Perlu) */}
                {!manualTargetOverride ? (
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] text-emerald-800 font-semibold">
                        Item Hasil Bersih yang Akan Masuk Stok (Otomatis):
                      </div>
                      <div className="text-sm font-extrabold text-emerald-950 mt-0.5">
                        {selectedSourceMat
                          ? autoTargetMaterialName
                          : 'Pilih bahan mentah di Langkah 1 terlebih dahulu...'}
                      </div>
                    </div>
                    {selectedSourceMat && (
                      <input
                        type="text"
                        placeholder="Ubah nama hasil olahan (opsional)..."
                        className="form-control text-xs py-1.5 px-2.5 bg-white sm:w-56"
                        value={customProcessedName}
                        onChange={(e) => setCustomProcessedName(e.target.value)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari bahan hasil olahan dari master data..."
                      className="form-control text-xs py-2 w-full"
                      value={targetSearch}
                      onChange={(e) => {
                        setSelectedTargetMat(null);
                        setTargetSearch(e.target.value);
                      }}
                    />
                    {targetSuggestions.length > 0 && !selectedTargetMat && (
                      <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white border border-[var(--border)] rounded-xl shadow-2xl max-h-52 overflow-y-auto divide-y divide-gray-100">
                        {targetSuggestions.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => handleSelectTarget(m)}
                            className="p-2.5 text-xs hover:bg-emerald-50 cursor-pointer flex justify-between items-center"
                          >
                            <span className="font-semibold text-gray-800">{m.name}</span>
                            <span className="text-[11px] font-mono text-gray-500">Stok: {m.qty_resto || 0} {m.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input Berat Bersih + Foto 2: Berat Bersih di Timbangan */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-7">
                  <label className="text-xs font-bold text-gray-700 block mb-1.5">
                    Dapat Berapa Banyak Hasil Bersih? *
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="Ketik berat bersih (ampas otomatis dihitung)..."
                      className="form-control flex-1 text-sm py-2 font-bold font-mono text-emerald-700"
                      style={{ flex: '1 1 0%', minWidth: '120px', width: 'auto' }}
                      value={targetQty}
                      onChange={(e) => {
                        setIsWasteManual(false);
                        setTargetQty(e.target.value);
                      }}
                    />
                    <select
                      className="form-control w-24 text-xs font-bold"
                      style={{ width: '96px', flex: '0 0 96px' }}
                      value={targetUnit}
                      onChange={(e) => {
                        setIsWasteManual(false);
                        setTargetUnit(e.target.value);
                      }}
                    >
                      {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Foto 2: Berat Bersih di Timbangan */}
                <div className="sm:col-span-5">
                  <label className="text-xs font-bold text-emerald-800 block mb-1.5">
                    Foto 2: Berat Bersih di Timbangan *
                  </label>
                  <div className="relative border-2 border-dashed border-emerald-300 rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-emerald-50/30 hover:bg-emerald-50/70 transition-colors">
                    {photoCleanPreview ? (
                      <div className="relative w-full h-full flex items-center justify-between px-3 bg-emerald-50">
                        <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 truncate">
                          <Check size={14} className="text-emerald-600 shrink-0" /> Foto Bersih Siap
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoClean(null);
                            setPhotoCleanPreview(null);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 z-10"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 cursor-pointer">
                        <Camera size={14} /> Ambil Foto Bersih
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          setPhotoClean(e.target.files[0]);
                          setPhotoCleanPreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Ringkasan Instan Hasil Bersih & Ampas Otomatis */}
              {parseFloat(sourceQty) > 0 && parseFloat(targetQty) > 0 && (
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase">Berat Mentah</div>
                    <div className="text-xs font-extrabold font-mono text-blue-700 mt-0.5">
                      {sourceQty} {sourceUnit}
                    </div>
                  </div>
                  <div className="border-x border-gray-200">
                    <div className="text-[10px] font-semibold text-emerald-700 uppercase">Dapat Bersih ({analytics.yieldPct}%)</div>
                    <div className="text-xs font-extrabold font-mono text-emerald-700 mt-0.5">
                      {targetQty} {targetUnit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-red-600 uppercase">Ampas Otomatis ({analytics.wastePct}%)</div>
                    <div className="text-xs font-extrabold font-mono text-red-600 mt-0.5">
                      {wasteQty || 0} {wasteUnit}
                    </div>
                  </div>
                </div>
              )}

              {/* Setup Tanggal Kedaluwarsa Olahan (FEFO) */}
              <div className="pt-3 border-t border-[var(--border)]/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700">
                    Tanggal Kedaluwarsa Hasil Olahan (FEFO)
                  </label>
                  {expiryFefo && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Masa simpan: {expiryFefo.days} hari lagi
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
              </div>
            </div>

            {/* STEP 3: AMPAS / WASTE OTOMATIS & TINGGAL BUKTI FOTO */}
            <div className="glass-card p-5 rounded-2xl border border-red-200/60 bg-red-50/20 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-red-200/40 pb-3">
                <span className="text-xs font-extrabold text-red-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[11px] font-bold">3</span>
                  Ampas, Kulit & Sisa Potongan (Otomatis Terhitung)
                </span>
                <span className="text-[11px] font-medium text-red-600 bg-red-100/60 px-2 py-0.5 rounded-full">
                  {isWasteManual ? 'Diedit Manual' : 'Otomatis: Mentah dikurangi Bersih'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-7">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-700">Berat Ampas Terbuang (Otomatis)</label>
                    {isWasteManual && (
                      <button
                        type="button"
                        onClick={() => setIsWasteManual(false)}
                        className="text-[11px] font-semibold text-red-600 hover:underline"
                      >
                        Kembalikan ke Hitung Otomatis
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Terisi otomatis..."
                      className="form-control flex-1 text-sm py-2 font-bold font-mono text-red-600 bg-white"
                      style={{ flex: '1 1 0%', minWidth: '120px', width: 'auto' }}
                      value={wasteQty}
                      onChange={(e) => {
                        setIsWasteManual(true);
                        setWasteQty(e.target.value);
                      }}
                    />
                    <select
                      className="form-control w-24 text-xs font-bold"
                      style={{ width: '96px', flex: '0 0 96px' }}
                      value={wasteUnit}
                      onChange={(e) => {
                        setIsWasteManual(false);
                        setWasteUnit(e.target.value);
                      }}
                    >
                      {COMMON_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Foto 3: Bukti Ampas */}
                <div className="sm:col-span-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-red-700">Foto 3: Bukti Ampas *</label>
                    {photoClean && !photoWaste && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoWaste(photoClean);
                          setPhotoWastePreview(photoCleanPreview);
                        }}
                        className="text-[10px] font-semibold text-red-600 hover:underline"
                      >
                        Pakai Foto 2
                      </button>
                    )}
                  </div>
                  <div className="relative border-2 border-dashed border-red-300 rounded-xl h-[42px] flex items-center justify-center overflow-hidden bg-white hover:bg-red-50/50 transition-colors">
                    {photoWastePreview ? (
                      <div className="relative w-full h-full flex items-center justify-between px-3 bg-red-50/50">
                        <span className="text-xs font-semibold text-red-700 flex items-center gap-1.5 truncate">
                          <Check size={14} className="text-red-600 shrink-0" /> Foto Ampas Siap
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoWaste(null);
                            setPhotoWastePreview(null);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 z-10"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-red-600 flex items-center gap-1.5 cursor-pointer">
                        <Camera size={14} /> Ambil Foto Ampas
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          setPhotoWaste(e.target.files[0]);
                          setPhotoWastePreview(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Catatan Tambahan (Opsional)</label>
                <input
                  type="text"
                  placeholder="cth: Kualitas jeruk manis, kulit tipis..."
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
                  <RefreshCw size={16} className="animate-spin" /> Menyimpan Hasil Bersih, Ampas & HPP...
                </span>
              ) : (
                <span>Simpan Hasil Olahan & Perbarui Stok Otomatis</span>
              )}
            </button>
          </form>
        </div>

        {/* Kolom Kanan: Ringkasan Rendemen, HPP & Pratinjau 3 Foto Bukti (5 Kolom) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-white shadow-xs space-y-5 sticky top-20">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="font-extrabold text-sm text-[var(--text-primary)]">
                Ringkasan Hasil Bersih, Ampas & HPP
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Otomatis
              </span>
            </div>

            {/* Yield Percentage Display */}
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200/80 text-center space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Persentase Hasil Bersih (Rendemen)</div>
              <div className="flex items-baseline justify-center gap-1">
                <span className={`text-4xl font-black font-mono ${
                  analytics.yieldStatus === 'EXCELLENT' ? 'text-emerald-600' :
                  analytics.yieldStatus === 'LOW' ? 'text-red-600' : 'text-amber-600'
                }`}>
                  {analytics.yieldPct}%
                </span>
              </div>

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
                <div className="flex justify-between text-[11px] text-gray-600 font-semibold mt-1.5">
                  <span className="text-emerald-700">Bersih: {targetQty || 0} {targetUnit} ({analytics.yieldPct}%)</span>
                  <span className="text-red-600">Ampas: {wasteQty || 0} {wasteUnit} ({analytics.wastePct}%)</span>
                </div>
              </div>
            </div>

            {/* Cost & HPP Transfer Preview */}
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40">
                <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider mb-1">
                  1. Modal Bahan Mentah Diambil
                </div>
                <div className="text-base font-extrabold text-blue-800">
                  {formatIDR(analytics.totalSourceCost)}
                </div>
                <div className="text-[11px] text-blue-700 mt-0.5">
                  {selectedSourceMat ? `${selectedSourceMat.name}: ${sourceQty || 0} ${sourceUnit}` : 'Belum memilih bahan mentah'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/50">
                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">
                  2. Diolah Menjadi & HPP Bersih Baru
                </div>
                <div className="text-xs font-bold text-emerald-900 mb-1">
                  {autoTargetMaterialName || 'Hasil Bersih Siap Pakai'} ({processedInto})
                </div>
                <div className="text-lg font-black text-emerald-800">
                  {formatIDR(Math.round(analytics.newTargetHppPerUnit))} <span className="text-xs font-semibold text-emerald-600">/ {targetUnit}</span>
                </div>
                <div className="text-[10px] text-emerald-700 mt-0.5">
                  Modal bahan mentah otomatis dibebankan ke berat bersih yang didapat
                </div>
              </div>

              {parseFloat(wasteQty) > 0 && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50/40 flex justify-between items-center">
                  <div>
                    <div className="text-[11px] font-bold text-red-800">3. Ampas Terhitung Otomatis</div>
                    <div className="text-xs text-red-600 font-mono mt-0.5">{wasteQty} {wasteUnit} terbuang</div>
                  </div>
                  <div className="text-sm font-extrabold text-red-700">
                    {formatIDR(Math.round(analytics.estimatedWasteLoss))}
                  </div>
                </div>
              )}
            </div>

            {/* Status 3 Bukti Foto */}
            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200/80 space-y-2">
              <div className="text-xs font-bold text-gray-800">Kelengkapan 3 Foto Bukti Timbangan:</div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className={`p-2 rounded-lg border ${photoBefore ? 'bg-blue-50 border-blue-200 text-blue-800 font-bold' : 'bg-white border-gray-200 text-gray-400'}`}>
                  1. Mentah {photoBefore ? '✓' : 'Belum'}
                </div>
                <div className={`p-2 rounded-lg border ${photoClean ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold' : 'bg-white border-gray-200 text-gray-400'}`}>
                  2. Bersih {photoClean ? '✓' : 'Belum'}
                </div>
                <div className={`p-2 rounded-lg border ${(photoWaste || photoClean) ? 'bg-red-50 border-red-200 text-red-800 font-bold' : 'bg-white border-gray-200 text-gray-400'}`}>
                  3. Ampas {photoWaste ? '✓' : photoClean ? 'Auto Foto 2' : 'Belum'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Riwayat Olahan Hari Ini */}
      <div className="glass-card rounded-2xl border border-[var(--border)] overflow-hidden bg-white shadow-xs">
        <div className="p-4 md:p-5 border-b border-[var(--border)] bg-gray-50/60 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-extrabold text-base text-[var(--text-primary)]">
              Riwayat Olah Bahan & Bukti Foto
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Catatan lengkap bahan mentah, diolah menjadi apa, berat bersih, ampas otomatis, dan 3 bukti foto.
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
            <p className="text-xs text-gray-400 mt-1">Pilih bahan mentah di atas, masukkan berat bersihnya, dan lampirkan foto timbangan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">No & Batch</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Bahan Mentah (Input)</th>
                  <th className="py-3 px-4">Diolah Menjadi Apa</th>
                  <th className="py-3 px-4">Berat Bersih</th>
                  <th className="py-3 px-4">Ampas (Waste)</th>
                  <th className="py-3 px-4">Rendemen</th>
                  <th className="py-3 px-4 text-center">Bukti Foto (Mentah / Bersih / Ampas)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {history.map((h, idx) => {
                  const gross = parseFloat(h.gross_weight) || 0;
                  const clean = parseFloat(h.clean_weight) || 0;
                  const yieldRate = gross > 0 ? Math.min(100, (clean / gross) * 100) : 0;
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
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900">{h.materials?.name || `Material #${h.material_id}`}</div>
                        <div className="font-mono text-[11px] text-blue-700 font-semibold">
                          {h.display_source_qty ?? gross} {h.display_source_unit || h.materials?.unit || 'kg'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-emerald-900">{h.target_mat_name || `${h.materials?.name || 'Bahan'} (Bersih)`}</div>
                        <div className="text-[10px] text-emerald-700 font-semibold">{h.processed_into || 'Kupas / Potong Bersih'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                        {h.display_target_qty ?? clean} {h.display_target_unit || h.materials?.unit || 'kg'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-red-600">
                        {(parseFloat(h.display_waste_qty ?? h.waste_weight) || 0) > 0
                          ? `${h.display_waste_qty ?? h.waste_weight} ${h.display_waste_unit || h.materials?.unit || 'kg'}`
                          : '0'}
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
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {h.gross_photo_url && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({ title: 'Foto 1: Bahan Mentah di Timbangan', url: h.gross_photo_url })}
                              className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Eye size={11} /> Mentah
                            </button>
                          )}
                          {h.clean_photo_url && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({ title: `Foto 2: Berat Bersih (${h.target_mat_name || 'Hasil Olahan'})`, url: h.clean_photo_url })}
                              className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Eye size={11} /> Bersih
                            </button>
                          )}
                          {h.waste_photo_url && (
                            <button
                              type="button"
                              onClick={() => setSelectedPhotoModal({ title: 'Foto 3: Bukti Ampas / Waste', url: h.waste_photo_url })}
                              className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-bold flex items-center gap-1"
                            >
                              <Eye size={11} /> Ampas
                            </button>
                          )}
                          {!h.gross_photo_url && !h.clean_photo_url && !h.waste_photo_url && (
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

      {/* Modal Tambah Bahan Baru (Opsional jika bahan belum pernah ada di Raw) */}
      {showCreateRawModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-[var(--border)]">
            <div className="p-4 md:p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h4 className="font-bold text-base text-gray-900">Tambah Bahan Mentah Baru</h4>
                <p className="text-xs text-gray-500 mt-0.5">
                  Daftarkan bahan mentah baru jika belum pernah diinput di Pembelian atau Master Data.
                </p>
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
                  className="btn btn-primary text-xs px-4 py-2 font-bold"
                >
                  {creatingRawMat ? 'Menyimpan...' : 'Simpan & Pilih'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
