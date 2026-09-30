/* Trimming Production 1-Flow Architecture — Barventis V2 Module */
import { useState, useEffect, useId, useCallback, Fragment } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Package,
  Scale,
  Copy,
  Check,
  Eye,
  Clock,
  ArrowRight,
  Sparkles,
  X,
  RefreshCw,
  Search,
  Filter,
  Layers,
  FileCheck2,
  Info,
  ShieldCheck,
  ChevronDown,
  Maximize2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { parsePackSize, getUnitPrice } from '../../services/costUtils';

function generateBatchNumber() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRM-${today}-${rand}`;
}

function computeTrimmingBreakdown(batch, materials) {
  const rawMaterial = batch?.materials || materials?.find((m) => m.id === batch?.material_id) || {};
  const gross = parseFloat(batch?.gross_weight || 0);
  const clean = parseFloat(batch?.clean_weight || 0);
  const waste = parseFloat(batch?.waste_weight || 0);
  const portionPacks = parseInt(batch?.portion_pack_output || 0, 10);
  const packs = portionPacks > 0 ? portionPacks : 0;

  // Unit price per gram
  let pricePerGram = 0;
  try {
    const unitInfo = getUnitPrice(rawMaterial);
    if (unitInfo && unitInfo.resolved && unitInfo.unitPrice > 0) {
      pricePerGram = unitInfo.unitPrice;
    } else if (rawMaterial.price) {
      const packSize = parsePackSize(rawMaterial.full_pack) || 1000;
      pricePerGram = Number(rawMaterial.price) / (packSize > 0 ? packSize : 1000);
    }
  } catch {
    const packSize = parsePackSize(rawMaterial.full_pack) || 1000;
    pricePerGram = Number(rawMaterial.price || 0) / (packSize > 0 ? packSize : 1000);
  }

  const rawTotalCost = gross * pricePerGram;
  const wasteCostLoss = waste * pricePerGram;

  // Realized cost per gram and per kg of clean product
  const realizedCostPerGram = clean > 0 ? rawTotalCost / clean : 0;
  const realizedCostPerKg = realizedCostPerGram * 1000;
  const realizedCostPerPack = packs > 0 ? rawTotalCost / packs : 0;

  // Proportions
  const cleanPct = gross > 0 ? (clean / gross) * 100 : 0;
  const wastePct = gross > 0 ? (waste / gross) * 100 : 0;
  const totalAccounted = clean + waste;
  const moistureLoss = Math.max(0, gross - totalAccounted);
  const moistureLossPct = gross > 0 ? (moistureLoss / gross) * 100 : 0;

  // Target material (if any)
  const targetMaterial = batch?.target_material_id
    ? materials?.find((m) => m.id === batch.target_material_id)
    : null;

  // Duration
  let durationMinutes = null;
  if (batch?.gross_timestamp && batch?.clean_timestamp) {
    const start = new Date(batch.gross_timestamp);
    const end = new Date(batch.clean_timestamp);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs > 0) {
      durationMinutes = Math.round(diffMs / 60000);
    }
  }

  return {
    rawMaterial,
    targetMaterial,
    gross,
    clean,
    waste,
    packs,
    pricePerGram,
    rawTotalCost,
    wasteCostLoss,
    realizedCostPerGram,
    realizedCostPerKg,
    realizedCostPerPack,
    cleanPct,
    wastePct,
    totalAccounted,
    moistureLoss,
    moistureLossPct,
    durationMinutes
  };
}

export default function TrimmingProduction() {
  const { profile } = useAuth();
  const rawMaterialSelectId = useId();
  const grossWeightInputId = useId();
  const targetMaterialSelectId = useId();
  const cleanWeightInputId = useId();
  const wasteWeightInputId = useId();
  const portionSizeInputId = useId();
  const toleranceInputId = useId();

  const [materials, setMaterials] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, STEP1, STEP2

  // Expanded Row Toggle state for finished trimming operations breakdown
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());
  const [lightboxImage, setLightboxImage] = useState(null);

  const toggleExpandRow = (batchId) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  // --- TAHAP 1 FORM (Unified Main Form) ---
  const [step1Form, setStep1Form] = useState({
    batch_number: '',
    material_id: '',
    gross_weight: '',
    gross_photo: null
  });

  // --- TAHAP 2 MODAL STATE (Triggered via button next to Tahap 1 batch) ---
  const [stage2ModalBatch, setStage2ModalBatch] = useState(null);
  const [step2Form, setStep2Form] = useState({
    target_material_id: '',
    clean_weight: '',
    waste_weight: '',
    portion_size: 100,
    portion_unit: 'gr',
    max_shrinkage_pct: 30,
    clean_photo: null,
    waste_photo: null
  });

  // --- DETAIL MODAL STATE ---
  const [detailModalBatch, setDetailModalBatch] = useState(null);

  // Load materials & batches
  const reloadData = useCallback(() => {
    Promise.resolve()
      .then(() => {
        setBatchesLoading(true);
        return api.getActiveTenantId();
      })
      .then((tenantId) =>
        Promise.all([
          supabase
            .from('materials')
            .select('id, name, unit, sku, category, price, full_pack, qty_resto, qty_central')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('name'),
          api.getTrimmingBatches()
        ])
      )
      .then(([matsRes, batchesRes]) => {
        if (matsRes.data) {
          setMaterials(matsRes.data);
        }
        setBatches(batchesRes || []);
      })
      .catch((err) => {
        console.warn("Error fetching trimming data:", err);
      })
      .finally(() => {
        setBatchesLoading(false);
      });
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Watermark photo helper
  const applyWatermark = (file, coords, callback) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Dark banner for metadata
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(20, img.height - 120, img.width - 40, 100);

      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#ffffff';
      const timestamp = new Date().toLocaleString('id-ID');
      ctx.fillText(`TIMESTAMP: ${timestamp}`, 40, img.height - 75);
      const userName = profile?.full_name || profile?.email || 'Operator';
      const gpsText = coords.lat ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'GPS: N/A';
      ctx.fillText(`${gpsText} | OPERATOR: ${userName}`, 40, img.height - 35);

      const watermarkedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      callback(watermarkedDataUrl);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleCameraCapture = (e, callback) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => applyWatermark(file, { lat: pos.coords.latitude, lng: pos.coords.longitude }, callback),
        () => applyWatermark(file, { lat: 0, lng: 0 }, callback),
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      applyWatermark(file, { lat: 0, lng: 0 }, callback);
    }
  };

  // Copy ID to clipboard
  const handleCopyId = (idStr) => {
    if (!idStr) return;
    navigator.clipboard.writeText(idStr);
    setCopiedId(idStr);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- SUBMIT TAHAP 1 (Registrasi Bahan Mentah) ---
  const handleSubmitStage1 = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    try {
      const grossW = parseFloat(step1Form.gross_weight);
      if (!step1Form.material_id) throw new Error('Bahan Baku mentah wajib dipilih.');
      if (isNaN(grossW) || grossW <= 0) throw new Error('Berat mentah harus lebih dari 0 gram.');

      const currentBatchNumber = step1Form.batch_number || generateBatchNumber();

      const newBatch = await api.createTrimmingBatchStep1({
        material_id: step1Form.material_id,
        gross_weight: grossW,
        gross_photo_url: step1Form.gross_photo,
        batch_number: currentBatchNumber
      });

      setNotification({
        type: 'success',
        text: `Tahap 1 Berhasil! Batch #${newBatch.batch_number || currentBatchNumber} terdaftar (${grossW.toLocaleString('id-ID')} g). Tombol "⚡ Proses Tahap 2" siap digunakan di tabel di bawah.`
      });

      // Reset form with a fresh batch number
      setStep1Form({
        batch_number: generateBatchNumber(),
        material_id: '',
        gross_weight: '',
        gross_photo: null
      });

      reloadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Gagal menyimpan Tahap 1' });
    } finally {
      setLoading(false);
    }
  };

  // --- TRIGGER TAHAP 2 (Open Modal from row button) ---
  const handleTriggerStage2 = (batch) => {
    setStage2ModalBatch(batch);
    setStep2Form({
      target_material_id: '',
      clean_weight: '',
      waste_weight: '',
      portion_size: 100,
      portion_unit: 'gr',
      max_shrinkage_pct: 30,
      clean_photo: null,
      waste_photo: null
    });
  };

  // --- SUBMIT TAHAP 2 (Input Hasil Bersih & Limbah) ---
  const handleSubmitStage2 = async (e) => {
    e.preventDefault();
    if (!stage2ModalBatch) return;

    setLoading(true);
    setNotification(null);

    try {
      const grossW = parseFloat(stage2ModalBatch.gross_weight) || 0;
      const cleanW = parseFloat(step2Form.clean_weight);
      const wasteW = parseFloat(step2Form.waste_weight) || 0;
      const portionSize = parseFloat(step2Form.portion_size) || 100;
      const maxShrinkage = parseFloat(step2Form.max_shrinkage_pct) || 30;

      if (isNaN(cleanW) || cleanW <= 0) throw new Error('Berat bersih hasil trimming harus lebih dari 0 gram.');
      if (cleanW > grossW) {
        throw new Error(`Berat bersih (${cleanW}g) tidak boleh melebihi berat mentah (${grossW}g).`);
      }
      if (cleanW + wasteW > grossW * 1.05) {
        throw new Error(`Total berat bersih (${cleanW}g) + limbah (${wasteW}g) melebihi berat mentah (${grossW}g). Periksa kembali timbangan.`);
      }

      // Shrinkage & status
      const shrinkagePct = grossW > 0 ? ((grossW - cleanW) / grossW) * 100 : 0;
      const yieldStatus = shrinkagePct <= maxShrinkage ? 'GOOD' : 'BAD';
      const resultPacks = portionSize > 0 ? Math.floor(cleanW / portionSize) : 0;

      await api.completeTrimmingBatchStep2(stage2ModalBatch.id, {
        clean_weight: cleanW,
        waste_weight: wasteW,
        clean_photo_url: step2Form.clean_photo,
        waste_photo_url: step2Form.waste_photo,
        target_material_id: step2Form.target_material_id || null,
        portion_pack_output: resultPacks,
        yield_status: yieldStatus
      });

      setNotification({
        type: yieldStatus === 'GOOD' ? 'success' : 'warning',
        text: `Tahap 2 Selesai! Batch #${stage2ModalBatch.batch_number} berhasil diproses. Susut: ${shrinkagePct.toFixed(1)}% (${yieldStatus === 'GOOD' ? 'Hasil Bagus' : 'Susut Tinggi'}), Output: ${resultPacks} pack.`
      });

      setStage2ModalBatch(null);
      reloadData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message || 'Gagal memproses Tahap 2' });
    } finally {
      setLoading(false);
    }
  };

  // Filtered batches
  const filteredBatches = batches.filter((b) => {
    const matchesSearch =
      !searchQuery ||
      b.batch_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.materials?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.materials?.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id?.toLowerCase().includes(searchQuery.toLowerCase());

    const isStep1 = b.status === 'STEP1_GROSS_COMPLETED' || !b.clean_weight;
    const isStep2 = b.status === 'STEP2_COMPLETED' || !!b.clean_weight;

    if (statusFilter === 'STEP1') return matchesSearch && isStep1;
    if (statusFilter === 'STEP2') return matchesSearch && isStep2;
    return matchesSearch;
  });

  // Metrics summary
  const totalBatches = batches.length;
  const pendingStage2Count = batches.filter((b) => b.status === 'STEP1_GROSS_COMPLETED' || !b.clean_weight).length;
  const completedCount = batches.filter((b) => b.status === 'STEP2_COMPLETED' || !!b.clean_weight).length;
  const avgShrinkage =
    completedCount > 0
      ? (
          batches
            .filter((b) => b.shrinkage_percent != null)
            .reduce((sum, b) => sum + parseFloat(b.shrinkage_percent || 0), 0) /
          Math.max(1, batches.filter((b) => b.shrinkage_percent != null).length)
        ).toFixed(1)
      : '0.0';

  // Live calculation for Tahap 2 modal
  const modalGross = stage2ModalBatch ? parseFloat(stage2ModalBatch.gross_weight) || 0 : 0;
  const modalClean = parseFloat(step2Form.clean_weight) || 0;
  const modalShrinkage = modalGross > 0 && modalClean > 0 ? ((modalGross - modalClean) / modalGross) * 100 : 0;
  const modalPacks = parseFloat(step2Form.portion_size) > 0 ? Math.floor(modalClean / parseFloat(step2Form.portion_size)) : 0;
  const modalYieldStatus = modalShrinkage <= parseFloat(step2Form.max_shrinkage_pct || 30) ? 'GOOD' : 'BAD';

  const selectedMaterialObj = materials.find((m) => m.id === step1Form.material_id);

  return (
    <div className="fade-in space-y-6 max-w-7xl mx-auto pb-12">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[var(--text-primary)]">
              Trimming & Produksi Terintegrasi
            </h1>
            <span className="badge badge-primary text-xs font-mono font-bold px-2 py-0.5">
              1-FLOW SYSTEM
            </span>
          </div>
          <p className="text-xs md:text-sm text-[var(--text-muted)] mt-1">
            Alur tunggal: Daftarkan bahan mentah (Tahap 1), lalu klik tombol pemicu langsung untuk mencatat hasil bersih & limbah (Tahap 2).
          </p>
        </div>
        <button
          type="button"
          onClick={reloadData}
          disabled={batchesLoading}
          className="btn btn-secondary text-xs flex items-center gap-2 self-start md:self-auto"
        >
          <RefreshCw size={14} className={batchesLoading ? 'animate-spin' : ''} />
          Segarkan Data
        </button>
      </div>

      {/* NOTIFICATION BANNER */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            notification.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/25 text-rose-600'
              : notification.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'error' && <AlertTriangle size={16} />}
            {notification.type === 'warning' && <AlertTriangle size={16} />}
            {notification.type === 'success' && <CheckCircle2 size={16} />}
            <span className="font-semibold">{notification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI / SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="glass-card p-4 rounded-xl border border-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={13} className="text-[var(--accent)]" /> Total Batch
          </div>
          <div className="text-xl font-black text-[var(--text-primary)] mt-1.5">
            {totalBatches} <span className="text-xs font-normal text-[var(--text-muted)]">batch</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-[var(--border)] bg-amber-500/5">
          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={13} /> Menunggu Tahap 2
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1.5">
            {pendingStage2Count} <span className="text-xs font-normal text-[var(--text-muted)]">antrean</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-[var(--border)] bg-emerald-500/5">
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileCheck2 size={13} /> Selesai (Tahap 2)
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5">
            {completedCount} <span className="text-xs font-normal text-[var(--text-muted)]">batch</span>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-[var(--border)]">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Scale size={13} className="text-blue-500" /> Rata-Rata Susut
          </div>
          <div className="text-xl font-black text-[var(--text-primary)] mt-1.5">
            {avgShrinkage}%
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAHAP 1: FORM INPUT UTAMA (ENTRY POINT TUNGGAL) */}
      {/* ========================================================================= */}
      <div className="glass-card p-5 md:p-6 rounded-2xl border border-[var(--border)] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5 border-b border-[var(--border)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-black flex items-center justify-center">
                1
              </span>
              <h2 className="font-bold text-base text-[var(--text-primary)]">
                Tahap 1: Registrasi Bahan Mentah (Gross Weight)
              </h2>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 ml-8">
              Timbang bahan mentah, foto bukti timbangan, dan sistem akan mengalokasikan ID Batch unik secara otomatis.
            </p>
          </div>

          {/* Generated Batch ID Badge */}
          <div className="flex items-center gap-1.5 ml-8 sm:ml-0 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
            <span className="text-[11px] text-[var(--text-muted)] font-medium">Auto Batch ID:</span>
            <span className="font-mono font-bold text-xs text-[var(--accent)]">
              #{step1Form.batch_number || 'TRM-NEW'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmitStage1} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bahan Mentah Selection */}
            <div className="form-group md:col-span-1">
              <label htmlFor={rawMaterialSelectId} className="form-label text-xs font-semibold">
                Pilih Bahan Mentah Baku *
              </label>
              <select
                id={rawMaterialSelectId}
                className="form-control text-xs"
                required
                value={step1Form.material_id}
                onChange={(e) => setStep1Form({ ...step1Form, material_id: e.target.value })}
              >
                <option value="">-- Pilih Bahan Mentah --</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.sku ? `[${m.sku}]` : ''} ({m.unit || 'gr'})
                  </option>
                ))}
              </select>
              {selectedMaterialObj && (
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[var(--text-secondary)] font-mono">
                  <span className="badge badge-secondary px-1.5 py-0.5 text-[10px]">
                    ID: #{selectedMaterialObj.sku || selectedMaterialObj.id?.slice(0, 8)}
                  </span>
                  <span>
                    Stok Resto: {(selectedMaterialObj.qty_resto || 0).toLocaleString('id-ID')} {selectedMaterialObj.unit}
                  </span>
                </div>
              )}
            </div>

            {/* Berat Mentah */}
            <div className="form-group md:col-span-1">
              <label htmlFor={grossWeightInputId} className="form-label text-xs font-semibold">
                Berat Mentah / Gross Weight (gram) *
              </label>
              <div className="relative">
                <input
                  id={grossWeightInputId}
                  type="number"
                  step="any"
                  min="0.1"
                  className="form-control text-xs pr-12 font-mono font-bold text-sm"
                  required
                  placeholder="Contoh: 5000"
                  value={step1Form.gross_weight}
                  onChange={(e) => setStep1Form({ ...step1Form, gross_weight: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-medium">
                  gram
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                Berat total sebelum dipotong, dikuliti, atau diracik.
              </span>
            </div>

            {/* Foto Bukti Live Camera */}
            <div className="form-group md:col-span-1">
              <label className="form-label text-xs font-semibold flex items-center justify-between">
                <span>Foto Bukti Timbangan Mentah</span>
                <span className="text-[10px] text-[var(--text-muted)]">Watermark GPS & Jam</span>
              </label>
              <div className="relative group cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  onChange={(e) =>
                    handleCameraCapture(e, (dataUrl) =>
                      setStep1Form((prev) => ({ ...prev, gross_photo: dataUrl }))
                    )
                  }
                />
                <div
                  className={`flex items-center justify-between px-3.5 py-2.5 border-2 border-dashed rounded-xl transition-all ${
                    step1Form.gross_photo
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-[var(--bg-secondary)] border-[var(--border)] group-hover:border-[var(--accent)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {step1Form.gross_photo ? (
                      <CheckCircle2 size={18} className="text-emerald-500" />
                    ) : (
                      <Camera size={18} className="text-[var(--text-muted)]" />
                    )}
                    <div className="text-left">
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {step1Form.gross_photo ? 'Foto Terverifikasi' : 'Jepret Kamera / Upload'}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {step1Form.gross_photo ? 'Watermark waktu & GPS tersimpan' : 'Klik untuk mengambil foto'}
                      </div>
                    </div>
                  </div>
                  {step1Form.gross_photo && (
                    <img
                      src={step1Form.gross_photo}
                      alt="Thumbnail Mentah"
                      className="w-10 h-10 object-cover rounded-lg border border-emerald-500/40"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 self-start sm:self-auto">
              <Info size={14} className="text-[var(--accent)]" />
              <span>
                Setelah Tahap 1 disimpan, tombol pemicu <strong>⚡ Proses Tahap 2</strong> akan muncul tepat di baris tabel batch di bawah.
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary text-xs font-bold py-2.5 px-6 rounded-xl w-full sm:w-auto flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              <span>Simpan & Buat Batch Tahap 1</span>
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* TABEL BATCH TRIMMING DENGAN TOMBOL TAHAP 2 LANGSUNG DI BARIS TAHAP 1 */}
      {/* ========================================================================= */}
      <div className="glass-card rounded-2xl border border-[var(--border)] overflow-hidden shadow-sm">
        {/* Table Header Controls */}
        <div className="p-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-secondary)]/30">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[var(--text-primary)]">
              Daftar Batch Trimming & Alur 2-Tahap
            </span>
            <span className="badge badge-info text-[11px] px-2 py-0.5 rounded-full font-bold">
              {filteredBatches.length} Batch
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                className="form-control text-xs pl-8 pr-3 py-1.5 w-44 sm:w-56"
                placeholder="Cari Batch ID / Bahan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Status */}
            <div className="flex items-center gap-1">
              <Filter size={13} className="text-[var(--text-muted)] hidden sm:inline" />
              <select
                className="form-control text-xs py-1.5 px-2"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Semua Status</option>
                <option value="STEP1">⏳ Menunggu Tahap 2</option>
                <option value="STEP2">✓ Selesai (Tahap 2)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="overflow-x-auto">
          <table className="custom-table w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 text-[var(--text-secondary)] font-semibold">
                <th className="py-3 px-4">Batch ID</th>
                <th className="py-3 px-4">Waktu & Tanggal</th>
                <th className="py-3 px-4">Bahan Baku (ID / SKU)</th>
                <th className="py-3 px-4 text-right">Tahap 1: Mentah (g)</th>
                <th className="py-3 px-4 text-right">Tahap 2: Bersih / Limbah</th>
                <th className="py-3 px-4 text-center">Susut % & Yield</th>
                <th className="py-3 px-4 text-center">Status Alur</th>
                <th className="py-3 px-4 text-center">Aksi & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {batchesLoading ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-[var(--text-muted)]">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2 opacity-60" />
                    Memuat data batch trimming...
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-[var(--text-muted)]">
                    <Package size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-xs">Belum ada data batch trimming.</p>
                    <p className="text-[11px] mt-0.5">
                      Gunakan formulir Tahap 1 di atas untuk mendaftarkan batch mentah baru.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBatches.map((b) => {
                  const isStep1Only = b.status === 'STEP1_GROSS_COMPLETED' || !b.clean_weight;
                  const displayBatchId = b.batch_number || `TRM-${b.id?.slice(0, 8).toUpperCase()}`;
                  const isExpanded = expandedRowIds.has(b.id);
                  const breakdown = computeTrimmingBreakdown(b, materials);

                  return (
                    <Fragment key={b.id}>
                      <tr
                        className={`hover:bg-[var(--bg-secondary)]/30 transition-colors ${
                          isExpanded
                            ? 'bg-[var(--bg-secondary)]/40 border-l-4 border-l-[var(--accent)] shadow-xs'
                            : ''
                        }`}
                      >
                        {/* 1. BATCH ID with Copy button & Expand indicator */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono font-bold text-xs text-[var(--accent)] bg-[var(--bg-secondary)] px-2 py-0.5 rounded border border-[var(--border)] inline-block"
                              title={`Internal UUID: ${b.id}`}
                            >
                              #{displayBatchId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyId(displayBatchId)}
                              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                              title="Salin Batch ID"
                            >
                              {copiedId === displayBatchId ? (
                                <Check size={12} className="text-emerald-500" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 flex items-center gap-1">
                            <span>UUID: {b.id?.slice(0, 8)}...</span>
                            {!isStep1Only && (
                              <button
                                type="button"
                                onClick={() => toggleExpandRow(b.id)}
                                className="text-[10px] text-[var(--accent)] hover:underline ml-1 inline-flex items-center gap-0.5 font-sans"
                              >
                                {isExpanded ? 'Tutup Rincian' : 'Lihat Rincian'}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* 2. DATE & TIME */}
                        <td className="py-3 px-4">
                          <div className="text-[var(--text-primary)] font-medium">
                            {b.created_at
                              ? new Date(b.created_at).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })
                              : '-'}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {b.created_at
                              ? new Date(b.created_at).toLocaleTimeString('id-ID', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : ''}
                          </div>
                        </td>

                        {/* 3. MATERIAL with SKU / ID */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[var(--text-primary)]">
                            {b.materials?.name || 'Bahan Mentah'}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="font-mono text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-1.5 py-0.2 rounded border border-[var(--border)]">
                              {b.materials?.sku || `MAT-${b.material_id?.slice(0, 6).toUpperCase()}`}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {b.materials?.unit || 'gr'}
                            </span>
                          </div>
                        </td>

                        {/* 4. TAHAP 1: GROSS WEIGHT */}
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-sm text-[var(--text-primary)]">
                            {parseFloat(b.gross_weight || 0).toLocaleString('id-ID')} g
                          </div>
                          {b.gross_photo_url && (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxImage({
                                  url: b.gross_photo_url,
                                  title: `Foto Timbangan Mentah: #${displayBatchId}`,
                                  subtitle: `Gross: ${parseFloat(b.gross_weight || 0).toLocaleString('id-ID')} g`
                                })
                              }
                              className="text-[10px] text-[var(--accent)] hover:underline inline-flex items-center gap-0.5 mt-0.5"
                            >
                              <Camera size={10} /> Foto Mentah
                            </button>
                          )}
                        </td>

                        {/* 5. TAHAP 2: CLEAN / WASTE */}
                        <td className="py-3 px-4 text-right">
                          {isStep1Only ? (
                            <span className="text-[var(--text-muted)] italic text-[11px]">
                              — Belum diproses —
                            </span>
                          ) : (
                            <div>
                              <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                Bersih: {parseFloat(b.clean_weight || 0).toLocaleString('id-ID')} g
                              </div>
                              <div className="font-mono text-[10px] text-rose-500">
                                Limbah: {parseFloat(b.waste_weight || 0).toLocaleString('id-ID')} g
                              </div>
                              {b.portion_pack_output > 0 && (
                                <div className="text-[10px] text-[var(--accent)] font-bold">
                                  {b.portion_pack_output} Pack Hasil
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 6. SHRINKAGE & YIELD */}
                        <td className="py-3 px-4 text-center">
                          {isStep1Only ? (
                            <span className="badge badge-secondary text-[10px] px-2 py-0.5">
                              Menunggu Tahap 2
                            </span>
                          ) : (
                            <div>
                              <div className="font-mono font-bold text-xs">
                                {b.shrinkage_percent != null
                                  ? `${parseFloat(b.shrinkage_percent).toFixed(1)}%`
                                  : '-'}
                              </div>
                              <span
                                className={`badge text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block ${
                                  b.yield_status === 'GOOD'
                                    ? 'badge-success'
                                    : 'badge-danger'
                                }`}
                              >
                                {b.yield_status === 'GOOD' ? '✓ GOOD YIELD' : '⚠️ BAD YIELD'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 7. STATUS ALUR */}
                        <td className="py-3 px-4 text-center">
                          {isStep1Only ? (
                            <span className="badge badge-warning text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Clock size={10} /> Tahap 1 Selesai
                            </span>
                          ) : (
                            <span className="badge badge-success text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <CheckCircle2 size={10} /> Tahap 2 Selesai
                            </span>
                          )}
                        </td>

                        {/* 8. AKSI & DETAILS TOGGLE */}
                        <td className="py-3 px-4 text-center">
                          {isStep1Only ? (
                            <button
                              type="button"
                              onClick={() => handleTriggerStage2(b)}
                              className="btn btn-primary text-xs font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 mx-auto shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-transform"
                              title="Lanjutkan dan input hasil trimming Tahap 2"
                            >
                              <Sparkles size={13} className="text-amber-300" />
                              <span>⚡ Proses Tahap 2</span>
                            </button>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Details Toggle Button */}
                              <button
                                type="button"
                                onClick={() => toggleExpandRow(b.id)}
                                className={`btn text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                                  isExpanded
                                    ? 'bg-[var(--accent)] text-white ring-2 ring-[var(--accent)]/30'
                                    : 'btn-secondary hover:border-[var(--accent)]'
                                }`}
                                title={
                                  isExpanded
                                    ? 'Tutup rincian breakdown'
                                    : 'Buka rincian spesifik komponen dan breakdown hasil trimming'
                                }
                              >
                                <ChevronDown
                                  size={13}
                                  className={`transition-transform duration-200 ${
                                    isExpanded ? 'rotate-180 text-white' : 'text-[var(--text-muted)]'
                                  }`}
                                />
                                <span>{isExpanded ? 'Tutup Details' : 'Details'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailModalBatch(b)}
                                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                                title="Lihat modal pop-up lengkap"
                              >
                                <Eye size={13} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* INLINE EXPANDED ROW: SPECIFIC COMPONENTS & BREAKDOWN OF FINISHED TRIMMING OPERATION */}
                      {isExpanded && !isStep1Only && (
                        <tr
                          key={`${b.id}-breakdown`}
                          className="bg-[var(--bg-secondary)]/35 border-b-2 border-[var(--border)] transition-all animate-in fade-in duration-200"
                        >
                          <td colSpan="8" className="p-4 sm:p-6">
                            <div className="space-y-4 text-xs">
                              {/* 1. TOP HEADER BANNER */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                    <Layers size={16} />
                                  </div>
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h4 className="font-bold text-sm text-[var(--text-primary)]">
                                        Rincian Spesifik Komponen & Breakdown Trimming
                                      </h4>
                                      <span className="font-mono text-xs font-bold text-[var(--accent)] bg-[var(--bg-primary)] px-2 py-0.5 rounded border border-[var(--border)]">
                                        #{displayBatchId}
                                      </span>
                                      <span
                                        className={`badge text-[10px] font-bold px-2 py-0.5 rounded ${
                                          b.yield_status === 'GOOD'
                                            ? 'badge-success'
                                            : 'badge-danger'
                                        }`}
                                      >
                                        {b.yield_status === 'GOOD' ? '✓ GOOD YIELD' : '⚠️ BAD YIELD'}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] mt-0.5">
                                      <span>
                                        Mulai:{' '}
                                        {b.gross_timestamp
                                          ? new Date(b.gross_timestamp).toLocaleTimeString('id-ID', {
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            })
                                          : '-'}
                                      </span>
                                      <span>•</span>
                                      <span>
                                        Selesai:{' '}
                                        {b.clean_timestamp
                                          ? new Date(b.clean_timestamp).toLocaleTimeString('id-ID', {
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            })
                                          : '-'}
                                      </span>
                                      {breakdown.durationMinutes != null && (
                                        <>
                                          <span>•</span>
                                          <span className="font-medium text-[var(--text-primary)]">
                                            Durasi Pengerjaan: {breakdown.durationMinutes} menit
                                          </span>
                                        </>
                                      )}
                                      <span>•</span>
                                      <span className="font-mono">UUID: {b.id?.slice(0, 8)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyId(displayBatchId)}
                                    className="btn btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5"
                                    title="Salin Batch ID"
                                  >
                                    <Copy size={12} />
                                    <span>{copiedId === displayBatchId ? 'Tersalin' : 'Salin ID'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDetailModalBatch(b)}
                                    className="btn btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5"
                                    title="Buka modal pop-up penuh"
                                  >
                                    <Maximize2 size={12} />
                                    <span>Modal Pop-up</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandRow(b.id)}
                                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)]"
                                    title="Tutup breakdown"
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              </div>

                              {/* 2. NERACA MASSA REKONSILIASI (Mass Balance Bar & Physical Accounting) */}
                              <div className="p-3.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] space-y-2.5 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2">
                                    <Scale size={14} className="text-[var(--accent)]" />
                                    <span className="font-bold text-[var(--text-primary)]">
                                      Neraca Rekonsiliasi Massa (Mass Balance)
                                    </span>
                                    <span className="text-[11px] text-[var(--text-muted)]">
                                      (Input: {breakdown.gross.toLocaleString('id-ID')}g ➔ Output:{' '}
                                      {breakdown.totalAccounted.toLocaleString('id-ID')}g)
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-mono">
                                    {breakdown.moistureLoss === 0 ? (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                                        <CheckCircle2 size={12} /> Neraca 100% Seimbang
                                      </span>
                                    ) : (
                                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                                        Selisih Penguapan / Cairan:{' '}
                                        {breakdown.moistureLoss.toLocaleString('id-ID')}g (
                                        {breakdown.moistureLossPct.toFixed(1)}%)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Proportional visual bar */}
                                <div className="w-full h-3 rounded-full bg-[var(--bg-tertiary)] overflow-hidden flex shadow-inner">
                                  <div
                                    className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${Math.min(100, breakdown.cleanPct)}%` }}
                                    title={`Daging Bersih: ${breakdown.cleanPct.toFixed(1)}%`}
                                  />
                                  <div
                                    className="h-full bg-rose-500 transition-all"
                                    style={{ width: `${Math.min(100, breakdown.wastePct)}%` }}
                                    title={`Limbah/Kulit: ${breakdown.wastePct.toFixed(1)}%`}
                                  />
                                  {breakdown.moistureLossPct > 0 && (
                                    <div
                                      className="h-full bg-amber-400 transition-all"
                                      style={{ width: `${Math.min(100, breakdown.moistureLossPct)}%` }}
                                      title={`Penguapan: ${breakdown.moistureLossPct.toFixed(1)}%`}
                                    />
                                  )}
                                </div>

                                {/* Legend Pills */}
                                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                                    <span className="text-[var(--text-secondary)]">
                                      Daging Bersih Siap Pakai:
                                    </span>
                                    <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                                      {breakdown.clean.toLocaleString('id-ID')} g (
                                      {breakdown.cleanPct.toFixed(1)}%)
                                    </strong>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                                    <span className="text-[var(--text-secondary)]">
                                      Limbah Trimming (Kulit/Lemak):
                                    </span>
                                    <strong className="font-mono text-rose-500">
                                      {breakdown.waste.toLocaleString('id-ID')} g (
                                      {breakdown.wastePct.toFixed(1)}%)
                                    </strong>
                                  </div>
                                  {breakdown.moistureLoss > 0 && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                                      <span className="text-[var(--text-secondary)]">
                                        Susut Penguapan / Cairan:
                                      </span>
                                      <strong className="font-mono text-amber-500">
                                        {breakdown.moistureLoss.toLocaleString('id-ID')} g (
                                        {breakdown.moistureLossPct.toFixed(1)}%)
                                      </strong>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 3. TIGA KARTU SPESIFIK KOMPONEN HASIL TRIMMING */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                {/* KOMPONEN 1: BAHAN MENTAH (RAW INPUT) */}
                                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] flex flex-col justify-between space-y-3">
                                  <div>
                                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                                      <span className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
                                          1
                                        </span>
                                        Komponen Input Mentah
                                      </span>
                                      <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                                        Basis 100%
                                      </span>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                      <div>
                                        <div className="text-[10px] text-[var(--text-muted)]">
                                          Bahan Baku Asal:
                                        </div>
                                        <div className="font-bold text-xs text-[var(--text-primary)]">
                                          {breakdown.rawMaterial.name || 'Bahan Mentah'}
                                        </div>
                                        <div className="font-mono text-[10px] text-[var(--text-muted)]">
                                          SKU: #
                                          {breakdown.rawMaterial.sku ||
                                            `MAT-${b.material_id?.slice(0, 6).toUpperCase()}`}
                                        </div>
                                      </div>

                                      <div className="p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] text-[var(--text-muted)]">
                                            Berat Kotor (Gross):
                                          </span>
                                          <strong className="font-mono text-xs text-[var(--text-primary)]">
                                            {breakdown.gross.toLocaleString('id-ID')} g
                                          </strong>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] text-[var(--text-muted)]">
                                            HPP Beli Dasar:
                                          </span>
                                          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                                            {breakdown.pricePerGram > 0
                                              ? `Rp ${breakdown.pricePerGram.toLocaleString('id-ID', {
                                                  maximumFractionDigits: 1
                                                })}/g`
                                              : '-'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]">
                                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                                            Total Nilai Modal:
                                          </span>
                                          <strong className="font-mono text-xs text-[var(--accent)]">
                                            {breakdown.rawTotalCost > 0
                                              ? `Rp ${Math.round(breakdown.rawTotalCost).toLocaleString('id-ID')}`
                                              : '-'}
                                          </strong>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Gross Photo Preview */}
                                  <div>
                                    {b.gross_photo_url ? (
                                      <div
                                        onClick={() =>
                                          setLightboxImage({
                                            url: b.gross_photo_url,
                                            title: `Foto Timbangan Mentah: #${displayBatchId}`,
                                            subtitle: `Berat Mentah: ${breakdown.gross.toLocaleString('id-ID')}g • ${
                                              b.gross_timestamp
                                                ? new Date(b.gross_timestamp).toLocaleString('id-ID')
                                                : ''
                                            }`
                                          })
                                        }
                                        className="relative group cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]"
                                      >
                                        <img
                                          src={b.gross_photo_url}
                                          alt="Bukti Timbangan Mentah"
                                          className="w-full h-24 object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-semibold transition-opacity gap-1">
                                          <Maximize2 size={12} /> Perbesar Foto
                                        </div>
                                        <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 text-white px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                                          Timbangan Mentah
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="h-24 rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                                        Tidak ada foto mentah
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* KOMPONEN 2: HASIL BERSIH SIAP OLAH (CLEAN YIELD) */}
                                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10 flex flex-col justify-between space-y-3">
                                  <div>
                                    <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                                      <span className="font-bold text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                                          2
                                        </span>
                                        Komponen Bersih Siap Olah
                                      </span>
                                      <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                        Yield: {breakdown.cleanPct.toFixed(1)}%
                                      </span>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                      <div>
                                        <div className="text-[10px] text-[var(--text-muted)]">
                                          Bahan Olahan Hasil:
                                        </div>
                                        <div className="font-bold text-xs text-[var(--text-primary)]">
                                          {breakdown.targetMaterial?.name || 'Daging Bersih Siap Masak'}
                                        </div>
                                        <div className="font-mono text-[10px] text-[var(--text-muted)]">
                                          SKU: #
                                          {breakdown.targetMaterial?.sku ||
                                            `${breakdown.rawMaterial?.sku || 'MAT'}-CLN`}
                                        </div>
                                      </div>

                                      <div className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-emerald-500/20 space-y-1">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] text-[var(--text-muted)]">
                                            Berat Bersih:
                                          </span>
                                          <strong className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                                            {breakdown.clean.toLocaleString('id-ID')} g
                                          </strong>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] text-[var(--text-muted)]">
                                            Output Pack / Porsi:
                                          </span>
                                          <strong className="font-mono text-xs text-[var(--accent)]">
                                            {breakdown.packs > 0 ? `${breakdown.packs} Pack` : 'Curah'}
                                            {breakdown.packs > 0 &&
                                              ` (@${(breakdown.clean / breakdown.packs).toFixed(0)}g)`}
                                          </strong>
                                        </div>
                                        <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]">
                                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                                            Realized HPP Daging:
                                          </span>
                                          <strong className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                                            {breakdown.realizedCostPerKg > 0
                                              ? `Rp ${Math.round(breakdown.realizedCostPerKg).toLocaleString('id-ID')}/kg`
                                              : '-'}
                                          </strong>
                                        </div>
                                        {breakdown.packs > 0 && breakdown.realizedCostPerPack > 0 && (
                                          <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                                            <span>HPP per Pack:</span>
                                            <span className="font-mono font-medium text-[var(--text-primary)]">
                                              Rp{' '}
                                              {Math.round(breakdown.realizedCostPerPack).toLocaleString('id-ID')}
                                              /pack
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Clean Photo Preview */}
                                  <div>
                                    {b.clean_photo_url ? (
                                      <div
                                        onClick={() =>
                                          setLightboxImage({
                                            url: b.clean_photo_url,
                                            title: `Foto Timbangan Bersih: #${displayBatchId}`,
                                            subtitle: `Berat Bersih: ${breakdown.clean.toLocaleString('id-ID')}g • ${
                                              b.clean_timestamp
                                                ? new Date(b.clean_timestamp).toLocaleString('id-ID')
                                                : ''
                                            }`
                                          })
                                        }
                                        className="relative group cursor-pointer overflow-hidden rounded-lg border border-emerald-500/30 bg-[var(--bg-secondary)]"
                                      >
                                        <img
                                          src={b.clean_photo_url}
                                          alt="Bukti Timbangan Bersih"
                                          className="w-full h-24 object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-semibold transition-opacity gap-1">
                                          <Maximize2 size={12} /> Perbesar Foto
                                        </div>
                                        <span className="absolute bottom-1 left-1 text-[9px] bg-emerald-950/80 text-emerald-200 px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                                          Timbangan Bersih
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="h-24 rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                                        Tidak ada foto bersih
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* KOMPONEN 3: LIMBAH & BY-PRODUCT (WASTE / SCRAP) */}
                                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/10 flex flex-col justify-between space-y-3">
                                  <div>
                                    <div className="flex items-center justify-between pb-2 border-b border-rose-500/20">
                                      <span className="font-bold text-xs text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                                        <span className="w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                                          3
                                        </span>
                                        Komponen Limbah & Kulit/Lemak
                                      </span>
                                      <span className="text-[10px] font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-500/15 px-1.5 py-0.5 rounded border border-rose-500/30">
                                        Susut:{' '}
                                        {b.shrinkage_percent != null
                                          ? `${b.shrinkage_percent}%`
                                          : `${breakdown.wastePct.toFixed(1)}%`}
                                      </span>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                      <div>
                                        <div className="text-[10px] text-[var(--text-muted)]">
                                          Komponen Limbah Terpisah:
                                        </div>
                                        <div className="font-bold text-xs text-rose-600 dark:text-rose-400">
                                          Kulit, Lemak Berlebih, Urat & Serpihan
                                        </div>
                                        <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                                          <CheckCircle2 size={11} className="text-emerald-500" />
                                          <span>Tersinkron ke Audit Waste Logs</span>
                                        </div>
                                      </div>

                                      <div className="p-2.5 rounded-lg bg-[var(--bg-primary)] border border-rose-500/20 space-y-1">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] text-[var(--text-muted)]">
                                            Berat Limbah:
                                          </span>
                                          <strong className="font-mono text-xs text-rose-500">
                                            {breakdown.waste.toLocaleString('id-ID')} g
                                          </strong>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] text-[var(--text-muted)]">
                                            Rasio Terhadap Gross:
                                          </span>
                                          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                                            {breakdown.wastePct.toFixed(1)}%
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]">
                                          <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                                            Biaya Kerugian Limbah:
                                          </span>
                                          <strong className="font-mono text-xs text-rose-500">
                                            {breakdown.wasteCostLoss > 0
                                              ? `Rp ${Math.round(breakdown.wasteCostLoss).toLocaleString('id-ID')}`
                                              : 'Rp 0'}
                                          </strong>
                                        </div>
                                        <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                                          <span>Evaluasi Toleransi SOP:</span>
                                          <span
                                            className={`font-bold ${
                                              b.yield_status === 'GOOD'
                                                ? 'text-emerald-600'
                                                : 'text-rose-500'
                                            }`}
                                          >
                                            {b.yield_status === 'GOOD'
                                              ? '≤ 30% (Sesuai SOP)'
                                              : '> 30% (Tinggi)'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Waste Photo Preview */}
                                  <div>
                                    {b.waste_photo_url ? (
                                      <div
                                        onClick={() =>
                                          setLightboxImage({
                                            url: b.waste_photo_url,
                                            title: `Foto Timbangan Limbah: #${displayBatchId}`,
                                            subtitle: `Berat Limbah: ${breakdown.waste.toLocaleString('id-ID')}g • ${
                                              b.clean_timestamp
                                                ? new Date(b.clean_timestamp).toLocaleString('id-ID')
                                                : ''
                                            }`
                                          })
                                        }
                                        className="relative group cursor-pointer overflow-hidden rounded-lg border border-rose-500/30 bg-[var(--bg-secondary)]"
                                      >
                                        <img
                                          src={b.waste_photo_url}
                                          alt="Bukti Timbangan Limbah"
                                          className="w-full h-24 object-cover group-hover:scale-105 transition-transform"
                                        />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-semibold transition-opacity gap-1">
                                          <Maximize2 size={12} /> Perbesar Foto
                                        </div>
                                        <span className="absolute bottom-1 left-1 text-[9px] bg-rose-950/80 text-rose-200 px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                                          Timbangan Limbah
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="h-24 rounded-lg border border-dashed border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                                        Tidak ada foto limbah
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 4. QUALITY INSIGHT & AUDIT FOOTER */}
                              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                  <Info size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
                                  <div className="text-[11px] text-[var(--text-secondary)]">
                                    {b.yield_status === 'GOOD' ? (
                                      <span>
                                        <strong>Efisiensi Trimming Prima:</strong> Rendemen daging
                                        bersih sebesar{' '}
                                        <strong>{breakdown.cleanPct.toFixed(1)}%</strong> memenuhi target
                                        standar kitchen (susut ≤ 30%). Stok bahan mentah telah otomatis
                                        dipotong ({breakdown.gross}g) dan stok bahan hasil olahan telah
                                        ditambahkan ke inventori.
                                      </span>
                                    ) : (
                                      <span>
                                        <strong>Peringatan Susut Tinggi:</strong> Persentase limbah (
                                        {b.shrinkage_percent}%) melampaui batas standar toleransi kitchen
                                        (30%). Evaluasi kualitas potongan lemak supplier atau teknik pisau
                                        butcher kitchen disarankan.
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleExpandRow(b.id)}
                                  className="btn btn-secondary text-xs py-1.5 px-3 rounded-lg shrink-0 self-end sm:self-auto"
                                >
                                  Tutup Details
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL TRIGGER TAHAP 2 (HASIL BERSIH & LIMBAH TRIMMING) */}
      {/* ========================================================================= */}
      {stage2ModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="glass-card bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-secondary)]/50">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">
                  2
                </span>
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    Proses Tahap 2: Input Hasil Bersih & Limbah
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs font-bold text-[var(--accent)]">
                      #{stage2ModalBatch.batch_number}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      (Tahap 1 selesai, siap diproses)
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStage2ModalBatch(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmitStage2} className="p-5 space-y-4 overflow-y-auto">
              {/* Context Summary from Tahap 1 */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                    Data Tahap 1 Terdaftar
                  </div>
                  <div className="font-bold text-sm text-[var(--text-primary)] mt-0.5">
                    {stage2ModalBatch.materials?.name}
                  </div>
                  <div className="font-mono text-xs text-[var(--text-secondary)]">
                    SKU: #{stage2ModalBatch.materials?.sku || stage2ModalBatch.material_id?.slice(0, 8)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                    Berat Mentah Awal
                  </div>
                  <div className="font-mono font-black text-base text-[var(--accent)]">
                    {parseFloat(stage2ModalBatch.gross_weight || 0).toLocaleString('id-ID')} g
                  </div>
                </div>
              </div>

              {/* Input Target Material (Optional Pack Jadi) */}
              <div className="form-group">
                <label htmlFor={targetMaterialSelectId} className="form-label text-xs font-semibold">
                  Bahan Hasil (Pack Jadi / Olahan Siap Pakai)
                </label>
                <select
                  id={targetMaterialSelectId}
                  className="form-control text-xs"
                  value={step2Form.target_material_id}
                  onChange={(e) => setStep2Form({ ...step2Form, target_material_id: e.target.value })}
                >
                  <option value="">-- Pilih Bahan Hasil (Opsional jika menambah stok pack) --</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.sku ? `[${m.sku}]` : ''} ({m.unit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Berat Bersih & Berat Limbah */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="form-group">
                  <label htmlFor={cleanWeightInputId} className="form-label text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Berat Bersih (gram) *
                  </label>
                  <input
                    id={cleanWeightInputId}
                    type="number"
                    step="any"
                    min="0.1"
                    className="form-control text-xs font-mono font-bold text-emerald-600"
                    required
                    placeholder="Contoh: 3500"
                    value={step2Form.clean_weight}
                    onChange={(e) => setStep2Form({ ...step2Form, clean_weight: e.target.value })}
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Hasil daging/bagian siap olah
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor={wasteWeightInputId} className="form-label text-xs font-semibold text-rose-500">
                    Berat Limbah / Kulit (gram)
                  </label>
                  <input
                    id={wasteWeightInputId}
                    type="number"
                    step="any"
                    min="0"
                    className="form-control text-xs font-mono font-bold text-rose-500"
                    placeholder="Contoh: 1500"
                    value={step2Form.waste_weight}
                    onChange={(e) => setStep2Form({ ...step2Form, waste_weight: e.target.value })}
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Akan otomatis tercatat ke Audit Waste
                  </span>
                </div>
              </div>

              {/* Ukuran Porsi & Toleransi */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="form-group">
                  <label htmlFor={portionSizeInputId} className="form-label text-xs font-semibold">
                    Ukuran Porsi (gram/pack)
                  </label>
                  <input
                    id={portionSizeInputId}
                    type="number"
                    step="any"
                    min="1"
                    className="form-control text-xs font-mono"
                    value={step2Form.portion_size}
                    onChange={(e) => setStep2Form({ ...step2Form, portion_size: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={toleranceInputId} className="form-label text-xs font-semibold">
                    Toleransi Susut Maksimal (%)
                  </label>
                  <input
                    id={toleranceInputId}
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    className="form-control text-xs font-mono"
                    value={step2Form.max_shrinkage_pct}
                    onChange={(e) => setStep2Form({ ...step2Form, max_shrinkage_pct: e.target.value })}
                  />
                </div>
              </div>

              {/* Foto Hasil Bersih & Foto Limbah */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="form-group">
                  <label className="form-label text-[11px] font-semibold">Foto Hasil Bersih</label>
                  <div className="relative group cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={(e) =>
                        handleCameraCapture(e, (dataUrl) =>
                          setStep2Form((prev) => ({ ...prev, clean_photo: dataUrl }))
                        )
                      }
                    />
                    <div
                      className={`flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-xl transition-all ${
                        step2Form.clean_photo
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)]'
                      }`}
                    >
                      {step2Form.clean_photo ? (
                        <CheckCircle2 size={20} className="text-emerald-500 mb-1" />
                      ) : (
                        <Camera size={20} className="text-[var(--text-muted)] mb-1" />
                      )}
                      <span className="text-[10px] font-bold">
                        {step2Form.clean_photo ? 'Foto Bersih Tersimpan' : 'Jepret Foto Bersih'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label text-[11px] font-semibold">Foto Limbah / Kulit</label>
                  <div className="relative group cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      onChange={(e) =>
                        handleCameraCapture(e, (dataUrl) =>
                          setStep2Form((prev) => ({ ...prev, waste_photo: dataUrl }))
                        )
                      }
                    />
                    <div
                      className={`flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-xl transition-all ${
                        step2Form.waste_photo
                          ? 'bg-rose-500/10 border-rose-500/30'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)]'
                      }`}
                    >
                      {step2Form.waste_photo ? (
                        <CheckCircle2 size={20} className="text-rose-500 mb-1" />
                      ) : (
                        <Camera size={20} className="text-[var(--text-muted)] mb-1" />
                      )}
                      <span className="text-[10px] font-bold">
                        {step2Form.waste_photo ? 'Foto Limbah Tersimpan' : 'Jepret Foto Limbah'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* LIVE CALCULATION PREVIEW */}
              {modalClean > 0 && (
                <div
                  className={`p-3.5 rounded-xl border grid grid-cols-3 gap-2 text-center ${
                    modalYieldStatus === 'GOOD'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}
                >
                  <div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                      Susut Real
                    </div>
                    <div
                      className={`font-mono font-black text-sm mt-0.5 ${
                        modalYieldStatus === 'GOOD' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {modalShrinkage.toFixed(1)}%
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                      Kualitas Yield
                    </div>
                    <div
                      className={`font-bold text-xs mt-0.5 ${
                        modalYieldStatus === 'GOOD' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {modalYieldStatus === 'GOOD' ? '✓ NORMAL' : '⚠️ MELEBIHI SUSUT'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">
                      Hasil Porsi
                    </div>
                    <div className="font-mono font-black text-sm text-[var(--accent)] mt-0.5">
                      {modalPacks} pack
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setStage2ModalBatch(null)}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary text-xs font-bold px-5 py-2 flex items-center gap-2 rounded-xl"
                >
                  {loading ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  <span>Selesaikan & Simpan Tahap 2</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DETAIL LENGKAP BATCH TRIMMING */}
      {/* ========================================================================= */}
      {detailModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="glass-card bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-secondary)]/50">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[var(--accent)]" />
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    Rincian Batch Trimming
                  </h3>
                  <div className="font-mono text-xs font-bold text-[var(--accent)]">
                    #{detailModalBatch.batch_number}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalBatch(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Batch ID Banner */}
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-[var(--text-muted)]">ID Batch:</span>
                  <div className="font-mono font-black text-sm text-[var(--accent)]">
                    #{detailModalBatch.batch_number}
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono">
                    UUID: {detailModalBatch.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyId(detailModalBatch.batch_number)}
                  className="btn btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5"
                >
                  <Copy size={12} /> Salin ID
                </button>
              </div>

              {/* Tahap 1 Card */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">1</span>
                    Tahap 1: Bahan Mentah
                  </span>
                  <span className="font-mono font-bold text-[var(--accent)]">
                    {parseFloat(detailModalBatch.gross_weight || 0).toLocaleString('id-ID')} g
                  </span>
                </div>
                <div className="text-[var(--text-secondary)]">
                  Bahan: <strong>{detailModalBatch.materials?.name}</strong> (SKU: #{detailModalBatch.materials?.sku || detailModalBatch.material_id?.slice(0, 6)})
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Dicatat: {detailModalBatch.gross_timestamp ? new Date(detailModalBatch.gross_timestamp).toLocaleString('id-ID') : '-'}
                </div>
                {detailModalBatch.gross_photo_url && (
                  <div className="mt-2">
                    <img
                      src={detailModalBatch.gross_photo_url}
                      alt="Foto Mentah"
                      className="w-full max-h-48 object-cover rounded-xl border border-[var(--border)]"
                    />
                  </div>
                )}
              </div>

              {/* Tahap 2 Card */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">2</span>
                    Tahap 2: Hasil & Limbah
                  </span>
                  <span
                    className={`badge text-[10px] font-bold px-2 py-0.5 ${
                      detailModalBatch.yield_status === 'GOOD' ? 'badge-success' : 'badge-danger'
                    }`}
                  >
                    {detailModalBatch.yield_status || 'SELESAI'}
                  </span>
                </div>

                {detailModalBatch.clean_weight ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-center p-2 rounded-lg bg-[var(--bg-secondary)]">
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)]">Berat Bersih</div>
                        <div className="font-mono font-bold text-emerald-600 text-xs">
                          {parseFloat(detailModalBatch.clean_weight).toLocaleString('id-ID')} g
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)]">Berat Limbah</div>
                        <div className="font-mono font-bold text-rose-500 text-xs">
                          {parseFloat(detailModalBatch.waste_weight || 0).toLocaleString('id-ID')} g
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span>Persentase Susut:</span>
                      <strong className="font-mono">
                        {detailModalBatch.shrinkage_percent != null ? `${detailModalBatch.shrinkage_percent}%` : '-'}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span>Output Porsi Pack:</span>
                      <strong className="font-mono text-[var(--accent)]">
                        {detailModalBatch.portion_pack_output || 0} Pack
                      </strong>
                    </div>

                    {/* Clean & Waste Photos */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {detailModalBatch.clean_photo_url && (
                        <div>
                          <span className="text-[10px] text-[var(--text-muted)] block mb-1">Foto Bersih</span>
                          <img
                            src={detailModalBatch.clean_photo_url}
                            alt="Foto Bersih"
                            className="w-full h-28 object-cover rounded-lg border border-[var(--border)]"
                          />
                        </div>
                      )}
                      {detailModalBatch.waste_photo_url && (
                        <div>
                          <span className="text-[10px] text-[var(--text-muted)] block mb-1">Foto Limbah</span>
                          <img
                            src={detailModalBatch.waste_photo_url}
                            alt="Foto Limbah"
                            className="w-full h-28 object-cover rounded-lg border border-[var(--border)]"
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[11px] flex items-center gap-2 mt-2">
                      <CheckCircle2 size={15} />
                      <span>
                        Limbah sebesar {parseFloat(detailModalBatch.waste_weight || 0)} g otomatis tersinkronisasi ke modul Audit Waste Logs.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-[var(--text-muted)] text-center py-4">
                    Batch ini masih menunggu input Tahap 2.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] flex justify-end">
              <button
                type="button"
                onClick={() => setDetailModalBatch(null)}
                className="btn btn-secondary text-xs px-4 py-2"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX PHOTO MODAL */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-secondary)]/70">
              <div className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-2">
                <Camera size={14} className="text-[var(--accent)]" />
                <span>{lightboxImage.title || 'Foto Bukti Timbangan'}</span>
              </div>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex flex-col items-center">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.title || 'Bukti'}
                className="max-h-[70vh] w-auto object-contain rounded-xl border border-[var(--border)] shadow-md"
              />
              {lightboxImage.subtitle && (
                <p className="text-[11px] text-[var(--text-muted)] mt-2.5 text-center font-mono">
                  {lightboxImage.subtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
