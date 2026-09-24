import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  X,
  Trash2,
  AlertTriangle,
  RotateCcw,
  FileSpreadsheet,
  Filter,
  Calendar,
  Building2,
  Package,
  Layers,
  Info,
  CheckCircle2,
  AlertCircle,
  Eye,
  TrendingDown
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import Pagination from '../../components/shared/Pagination';
import { formatIDR } from '../../services/costUtils';
import { exportToExcel } from '../../services/export/excelExporter';

const WASTE_TYPES = [
  { value: 'WASTE', label: 'Basi / Kualitas Drop / Spoilage', color: 'bg-red-500/15 text-red-600 border-red-500/20' },
  { value: 'BREAKAGE', label: 'Pecah / Rusak Fisik (Breakage)', color: 'bg-amber-500/15 text-amber-600 border-amber-500/20' },
  { value: 'EXPIRED', label: 'Kadaluarsa (Expired)', color: 'bg-rose-500/15 text-rose-600 border-rose-500/20' },
  { value: 'COMP', label: 'Complimentary / Tester', color: 'bg-purple-500/15 text-purple-600 border-purple-500/20' }
];

const QUICK_REASONS = [
  'Basi / Bau Asam',
  'Pecah Saat Handling',
  'Lewat Expired Date',
  'Tumpah / Salah Racik (Spoilage)',
  'Susut Trimming Kitchen',
  'Kualitas Drop dari Supplier',
  'Botol / Segel Bocor',
  'Sample / Tester Pelanggan',
  'Salah Simpan Suhu'
];

export default function WasteLogs() {
  const { stock, refreshData } = useData();
  const { role } = useAuth();
  const toast = useToast();

  const [wasteLogs, setWasteLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Modals
  const [showInputModal, setShowInputModal] = useState(false);
  const [selectedDetailLog, setSelectedDetailLog] = useState(null);
  const [logToDelete, setLogToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState('ALL'); // ALL, THIS_MONTH, LAST_MONTH, TODAY
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Form State
  const [wasteForm, setWasteForm] = useState({
    item_id: '',
    quantity: '',
    type: 'WASTE',
    location: 'RESTO',
    date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: ''
  });
  const [materialSearch, setMaterialSearch] = useState('');

  // Fetch waste logs from backend
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getWasteLogs();
      setWasteLogs(data || []);
    } catch (err) {
      console.error('Failed to fetch waste logs:', err);
      toast.showError('Gagal memuat riwayat waste: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showInputModal && !submitting) setShowInputModal(false);
        if (selectedDetailLog) setSelectedDetailLog(null);
        if (logToDelete && !deleting) setLogToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showInputModal, submitting, selectedDetailLog, logToDelete, deleting]);

  // Selected item inside input modal
  const selectedMaterial = useMemo(() => {
    if (!wasteForm.item_id || !stock) return null;
    return stock.find((s) => String(s.id) === String(wasteForm.item_id)) || null;
  }, [wasteForm.item_id, stock]);

  // Filtered materials for modal dropdown search
  const filteredMaterials = useMemo(() => {
    if (!stock) return [];
    if (!materialSearch.trim()) return stock;
    const query = materialSearch.toLowerCase();
    return stock.filter(
      (m) =>
        m.name?.toLowerCase().includes(query) ||
        m.sku?.toLowerCase().includes(query) ||
        m.category?.toLowerCase().includes(query)
    );
  }, [stock, materialSearch]);

  // Estimated loss calculation in form
  const estimatedFormLoss = useMemo(() => {
    if (!selectedMaterial) return 0;
    const qty = parseFloat(wasteForm.quantity) || 0;
    const price = parseFloat(selectedMaterial.price) || 0;
    return qty * price;
  }, [selectedMaterial, wasteForm.quantity]);

  // Stock available at chosen location in form
  const availableStockAtLoc = useMemo(() => {
    if (!selectedMaterial) return 0;
    return wasteForm.location === 'CENTRAL'
      ? parseFloat(selectedMaterial.qty_central || 0)
      : parseFloat(selectedMaterial.qty_resto || 0);
  }, [selectedMaterial, wasteForm.location]);

  // Filtered logs based on search & selectors
  const filteredLogs = useMemo(() => {
    return wasteLogs.filter((log) => {
      // Type Filter
      if (typeFilter !== 'ALL' && log.type !== typeFilter) return false;

      // Location Filter
      if (locationFilter !== 'ALL' && log.location !== locationFilter) return false;

      // Period Filter
      if (periodFilter !== 'ALL' && log.date) {
        const logDate = new Date(log.date);
        const now = new Date();
        if (periodFilter === 'TODAY') {
          const todayStr = now.toISOString().split('T')[0];
          if (log.date !== todayStr) return false;
        } else if (periodFilter === 'THIS_MONTH') {
          if (logDate.getMonth() !== now.getMonth() || logDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        } else if (periodFilter === 'LAST_MONTH') {
          const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          if (
            logDate.getMonth() !== lastMonthDate.getMonth() ||
            logDate.getFullYear() !== lastMonthDate.getFullYear()
          ) {
            return false;
          }
        }
      }

      // Search Query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const str = `${log.id} ${log.item_name} ${log.sku || ''} ${log.category || ''} ${log.notes || ''} ${log.reason || ''} ${log.location || ''}`.toLowerCase();
        return str.includes(query);
      }

      return true;
    });
  }, [wasteLogs, typeFilter, locationFilter, periodFilter, searchTerm]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalCost = filteredLogs.reduce((sum, l) => sum + (parseFloat(l.cost_loss) || 0), 0);
    const totalUnits = filteredLogs.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0);
    const incidentCount = filteredLogs.length;

    // Determine top waste reason / type
    const typeCountMap = {};
    filteredLogs.forEach((l) => {
      const t = l.type || 'WASTE';
      typeCountMap[t] = (typeCountMap[t] || 0) + (parseFloat(l.cost_loss) || 1);
    });

    let topType = '-';
    let maxVal = 0;
    Object.entries(typeCountMap).forEach(([t, val]) => {
      if (val > maxVal) {
        maxVal = val;
        topType = t;
      }
    });

    const topTypeObj = WASTE_TYPES.find((wt) => wt.value === topType);

    return {
      totalCost,
      totalUnits,
      incidentCount,
      topTypeLabel: topTypeObj ? topTypeObj.label.split('/')[0].trim() : topType
    };
  }, [filteredLogs]);

  // Paginated logs
  const paginatedLogs = useMemo(() => {
    const from = (page - 1) * itemsPerPage;
    return filteredLogs.slice(from, from + itemsPerPage);
  }, [filteredLogs, page]);

  // Handle Submit Form
  const handleSubmitWaste = async (e) => {
    e?.preventDefault();
    setError('');

    if (!wasteForm.item_id) {
      setError('Pilih bahan baku yang mengalami waste.');
      return;
    }

    const qty = parseFloat(wasteForm.quantity);
    if (!qty || isNaN(qty) || qty <= 0) {
      setError('Masukkan kuantitas waste yang valid (lebih dari 0).');
      return;
    }

    if (!wasteForm.reason.trim()) {
      setError('Tentukan alasan atau penyebab terjadinya waste.');
      return;
    }

    setSubmitting(true);
    try {
      await api.recordWaste({
        material_id: wasteForm.item_id,
        quantity: qty,
        type: wasteForm.type,
        location: wasteForm.location,
        reason: wasteForm.reason.trim(),
        notes: wasteForm.notes.trim(),
        date: wasteForm.date
      });

      toast.showSuccess(
        `Waste berhasil dicatat! Stok ${selectedMaterial?.name || 'bahan'} telah dipotong otomatis.`
      );

      // Reset & close
      setShowInputModal(false);
      setWasteForm({
        item_id: '',
        quantity: '',
        type: 'WASTE',
        location: 'RESTO',
        date: new Date().toISOString().split('T')[0],
        reason: '',
        notes: ''
      });
      setMaterialSearch('');

      // Refresh data
      await fetchLogs();
      if (refreshData) refreshData();
    } catch (err) {
      console.error('Failed to record waste:', err);
      setError(err.message || 'Gagal mencatat waste.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete / Reversal
  const handleDeleteWaste = async () => {
    if (!logToDelete) return;
    setDeleting(true);
    try {
      await api.deleteTransactionAndReverseStock(logToDelete.raw_id || logToDelete.id);
      toast.showSuccess(
        `Catatan waste dibatalkan. Stok ${logToDelete.item_name} sebesar ${logToDelete.quantity} ${logToDelete.unit} telah dikembalikan ke ${logToDelete.location}.`
      );
      setLogToDelete(null);
      await fetchLogs();
      if (refreshData) refreshData();
    } catch (err) {
      console.error('Failed to reverse waste:', err);
      toast.showError('Gagal membatalkan catatan waste: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Export to Excel
  const handleExport = () => {
    if (filteredLogs.length === 0) {
      toast.showWarning('Tidak ada data waste untuk diexport.');
      return;
    }

    const rows = filteredLogs.map((log) => ({
      'ID Log': log.id,
      Tanggal: log.date,
      Tipe: log.type,
      'Nama Bahan': log.item_name,
      SKU: log.sku,
      Kategori: log.category,
      Lokasi: log.location === 'CENTRAL' ? 'Central Warehouse' : 'Resto Bar',
      'Qty Terbuang': log.quantity,
      Satuan: log.unit,
      'Harga Satuan (Rp)': log.price,
      'Estimasi Kerugian (Rp)': log.cost_loss,
      'Alasan / Keterangan': log.reason || log.notes || '-'
    }));

    exportToExcel({
      filename: 'Waste_Loss_Logs_Barventis',
      sheets: [{ name: 'Waste Logs', rows }]
    });

    toast.showSuccess('Data waste berhasil diexport ke Excel.');
  };

  const canManageWaste = role === 'Admin / Owner' || role === 'Owner' || role === 'Central' || role === 'SuperAdmin' || role === 'Super Admin';

  return (
    <div className="page-container p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <Trash2 size={24} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                Consolidated Waste Logs
              </h1>
              <p className="text-xs md:text-sm text-[var(--text-secondary)] mt-0.5">
                Pencatatan dan audit kerugian limbah bar, sisa trimming kitchen, pecah, dan expired.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            className="btn btn-secondary text-xs md:text-sm flex items-center gap-2 py-2 px-3.5"
            onClick={fetchLogs}
            disabled={loading}
            title="Refresh Data"
          >
            <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary text-xs md:text-sm flex items-center gap-2 py-2 px-3.5"
            onClick={handleExport}
            disabled={filteredLogs.length === 0}
            title="Export Excel"
          >
            <FileSpreadsheet size={15} />
            <span className="hidden sm:inline">Export Excel</span>
          </button>

          <button
            type="button"
            className="btn btn-primary text-xs md:text-sm flex items-center gap-2 py-2 px-4 shadow font-bold"
            onClick={() => {
              setError('');
              setShowInputModal(true);
            }}
          >
            <Plus size={17} />
            <span>Catat Limbah Baru</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Kerugian */}
        <div className="glass-card p-4 md:p-5 rounded-2xl border border-[var(--border)] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Total Kerugian (Cost Loss)
            </span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600">
              <TrendingDown size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold text-red-600 dark:text-red-400">
              {formatIDR(kpis.totalCost)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
            <span>Berdasarkan {filteredLogs.length} entri terfilter</span>
          </div>
        </div>

        {/* Card 2: Total Volume Terbuang */}
        <div className="glass-card p-4 md:p-5 rounded-2xl border border-[var(--border)] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Volume Terbuang
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)]">
              {kpis.totalUnits.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-[var(--text-secondary)] ml-1.5 font-medium">Unit / Pcs</span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Akumulasi fisik bahan yang dipotong dari stok
          </div>
        </div>

        {/* Card 3: Frekuensi Catatan */}
        <div className="glass-card p-4 md:p-5 rounded-2xl border border-[var(--border)] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Insiden Limbah
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)]">
              {kpis.incidentCount}
            </span>
            <span className="text-xs text-[var(--text-secondary)] ml-1.5 font-medium">Insiden</span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Terekam dalam buku besar inventory
          </div>
        </div>

        {/* Card 4: Penyebab Dominan */}
        <div className="glass-card p-4 md:p-5 rounded-2xl border border-[var(--border)] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Penyebab Dominan
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3 truncate">
            <span className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)] truncate">
              {kpis.topTypeLabel}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Pendorong nilai kerugian tertinggi
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="glass-card p-4 rounded-2xl border border-[var(--border)] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            type="text"
            className="form-control pl-9 pr-8 text-xs md:text-sm w-full py-2"
            placeholder="Cari ID, nama bahan baku, SKU, atau alasan..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
          {searchTerm && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={() => setSearchTerm('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tipe Waste Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter size={14} className="text-[var(--text-secondary)] hidden sm:inline" />
            <select
              className="form-control text-xs py-2 px-2.5 min-w-[130px]"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">Semua Tipe Waste</option>
              {WASTE_TYPES.map((wt) => (
                <option key={wt.value} value={wt.value}>
                  {wt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <select
              className="form-control text-xs py-2 px-2.5 min-w-[125px]"
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">Semua Lokasi</option>
              <option value="RESTO">Resto Bar / Outlet</option>
              <option value="CENTRAL">Central Warehouse</option>
            </select>
          </div>

          {/* Period Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <select
              className="form-control text-xs py-2 px-2.5 min-w-[120px]"
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">Semua Waktu</option>
              <option value="TODAY">Hari Ini</option>
              <option value="THIS_MONTH">Bulan Ini</option>
              <option value="LAST_MONTH">Bulan Lalu</option>
            </select>
          </div>

          {/* Reset button if active */}
          {(searchTerm || typeFilter !== 'ALL' || locationFilter !== 'ALL' || periodFilter !== 'ALL') && (
            <button
              type="button"
              className="btn btn-secondary text-xs py-2 px-2.5 text-red-500 hover:text-red-600"
              onClick={() => {
                setSearchTerm('');
                setTypeFilter('ALL');
                setLocationFilter('ALL');
                setPeriodFilter('ALL');
                setPage(1);
              }}
              title="Reset Semua Filter"
            >
              <X size={14} className="mr-1 inline" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* DATA TABLE / LIST CARD */}
      <div className="glass-card rounded-2xl border border-[var(--border)] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-secondary)]/30">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[var(--text-primary)]">Riwayat Catatan Waste</span>
            <span className="badge badge-info text-[11px] px-2 py-0.5 rounded-full font-bold">
              {filteredLogs.length} Record
            </span>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">
            Halaman {page} dari {Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage))}
          </span>
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden md:block overflow-x-auto">
          <table className="custom-table w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 text-[var(--text-secondary)] font-semibold">
                <th className="py-3 px-4">ID Log & Tanggal</th>
                <th className="py-3 px-4">Tipe Kerugian</th>
                <th className="py-3 px-4">Bahan Baku / Item</th>
                <th className="py-3 px-4 text-center">Lokasi</th>
                <th className="py-3 px-4 text-right">Qty Terbuang</th>
                <th className="py-3 px-4 text-right">Estimasi Kerugian</th>
                <th className="py-3 px-4">Alasan & Catatan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-[var(--text-secondary)]">
                    <RotateCcw size={24} className="animate-spin mx-auto mb-2 opacity-50" />
                    Memuat data waste logs...
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-14">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-[var(--text-secondary)]">
                      <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-600 mb-3">
                        <CheckCircle2 size={32} />
                      </div>
                      <p className="font-bold text-sm text-[var(--text-primary)]">Tidak Ada Catatan Limbah</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4 text-center">
                        {searchTerm || typeFilter !== 'ALL' || locationFilter !== 'ALL' || periodFilter !== 'ALL'
                          ? 'Tidak ada log yang sesuai dengan filter pencarian.'
                          : 'Belum ada limbah atau kerugian bahan baku yang dicatat.'}
                      </p>
                      <button
                        type="button"
                        className="btn btn-primary text-xs py-2 px-3.5"
                        onClick={() => {
                          setError('');
                          setShowInputModal(true);
                        }}
                      >
                        <Plus size={15} className="mr-1 inline" /> Catat Limbah Sekarang
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const typeObj = WASTE_TYPES.find((wt) => wt.value === log.type) || {
                    label: log.type,
                    color: 'bg-red-500/15 text-red-600 border-red-500/20'
                  };

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-[var(--bg-secondary)]/40 transition-colors cursor-pointer"
                      onClick={() => setSelectedDetailLog(log)}
                    >
                      {/* ID & Date */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-[var(--text-primary)]">{log.id}</div>
                        <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1 mt-0.5">
                          <Calendar size={11} />
                          {log.date
                            ? new Date(log.date).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })
                            : '-'}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${typeObj.color}`}
                        >
                          {typeObj.label}
                        </span>
                      </td>

                      {/* Item Details */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-sm text-[var(--text-primary)]">{log.item_name}</div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {log.sku && log.sku !== '-' && (
                            <span className="font-mono bg-[var(--bg-secondary)] px-1.5 py-0.2 rounded border border-[var(--border)]">
                              {log.sku}
                            </span>
                          )}
                          <span>{log.category}</span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            log.location === 'CENTRAL'
                              ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          }`}
                        >
                          <Building2 size={10} />
                          {log.location === 'CENTRAL' ? 'Central' : 'Resto Bar'}
                        </span>
                      </td>

                      {/* Qty Terbuang */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600 dark:text-red-400">
                        -{log.quantity.toLocaleString('id-ID', { maximumFractionDigits: 2 })} {log.unit}
                      </td>

                      {/* Estimasi Kerugian */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-red-600 dark:text-red-400">
                        {formatIDR(log.cost_loss)}
                      </td>

                      {/* Reason / Notes */}
                      <td className="py-3.5 px-4 max-w-[220px]">
                        <div className="font-medium text-[var(--text-primary)] truncate" title={log.reason}>
                          {log.reason || '-'}
                        </div>
                        {log.notes && log.notes !== log.reason && (
                          <div className="text-[11px] text-[var(--text-secondary)] truncate" title={log.notes}>
                            {log.notes}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            className="btn-icon p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-indigo-600 hover:bg-indigo-500/10 transition-colors"
                            onClick={() => setSelectedDetailLog(log)}
                            title="Lihat Detail"
                          >
                            <Eye size={15} />
                          </button>

                          {canManageWaste && (
                            <button
                              type="button"
                              className="btn-icon p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-500/10 transition-colors"
                              onClick={() => setLogToDelete(log)}
                              title="Batalkan & Kembalikan Stok"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE CARD VIEW */}
        <div className="md:hidden divide-y divide-[var(--border)]">
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
              <RotateCcw size={20} className="animate-spin mx-auto mb-2 opacity-50" />
              Memuat data waste logs...
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
              <p className="font-bold text-sm text-[var(--text-primary)] mb-1">Tidak Ada Catatan Limbah</p>
              <button
                type="button"
                className="btn btn-primary text-xs mt-3 py-1.5 px-3"
                onClick={() => {
                  setError('');
                  setShowInputModal(true);
                }}
              >
                + Catat Limbah
              </button>
            </div>
          ) : (
            paginatedLogs.map((log) => {
              const typeObj = WASTE_TYPES.find((wt) => wt.value === log.type) || {
                label: log.type,
                color: 'bg-red-500/15 text-red-600 border-red-500/20'
              };

              return (
                <div
                  key={log.id}
                  className="p-4 space-y-2.5 active:bg-[var(--bg-secondary)]/60"
                  onClick={() => setSelectedDetailLog(log)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--text-primary)]">{log.id}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${typeObj.color}`}
                      >
                        {typeObj.label}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">{log.date}</span>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-[var(--text-primary)]">{log.item_name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        Lokasi: {log.location === 'CENTRAL' ? 'Central Warehouse' : 'Resto Bar'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-red-600 dark:text-red-400">
                        -{log.quantity} {log.unit}
                      </div>
                      <div className="font-mono font-semibold text-xs text-red-600/80">
                        {formatIDR(log.cost_loss)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-secondary)]/50 p-2 rounded-lg">
                    <span className="font-medium text-[var(--text-primary)]">Alasan:</span> {log.reason || '-'}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs py-1 px-2.5 flex items-center gap-1"
                      onClick={() => setSelectedDetailLog(log)}
                    >
                      <Eye size={12} /> Detail
                    </button>
                    {canManageWaste && (
                      <button
                        type="button"
                        className="btn btn-secondary text-xs py-1 px-2.5 text-red-500 hover:text-red-600 flex items-center gap-1"
                        onClick={() => setLogToDelete(log)}
                      >
                        <Trash2 size={12} /> Batalkan
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* PAGINATION BAR */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/20">
          <Pagination
            page={page}
            pageSize={itemsPerPage}
            totalCount={filteredLogs.length}
            onPageChange={setPage}
            itemLabel="log waste"
          />
        </div>
      </div>

      {/* MODAL 1: INPUT MANUAL WASTE */}
      {showInputModal && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) setShowInputModal(false);
          }}
        >
          <div className="modal-card w-full max-w-xl max-h-[92vh] bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--bg-secondary)]/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h2 className="text-base md:text-lg font-bold text-[var(--text-primary)]">
                    Catat Limbah & Kerugian Bahan (Waste)
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Stok bahan baku akan terpotong otomatis dari sistem inventory.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                onClick={() => !submitting && setShowInputModal(false)}
                title="Tutup (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmitWaste} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs md:text-sm">
                {/* Alert error */}
                {error && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2.5">
                    <AlertCircle size={17} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Field 1: Pilih Bahan Baku */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                    <span>Bahan Baku / Item *</span>
                    {selectedMaterial && (
                      <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                        Harga: {formatIDR(selectedMaterial.price || 0)} / {selectedMaterial.unit}
                      </span>
                    )}
                  </label>

                  {/* Material Search & Select */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                      />
                      <input
                        type="text"
                        className="form-control pl-8 text-xs py-1.5 w-full"
                        placeholder="Ketik untuk memfilter bahan..."
                        value={materialSearch}
                        onChange={(e) => setMaterialSearch(e.target.value)}
                      />
                    </div>

                    <select
                      className="form-control text-xs md:text-sm py-2 w-full"
                      value={wasteForm.item_id}
                      onChange={(e) => {
                        setWasteForm({ ...wasteForm, item_id: e.target.value });
                        setError('');
                      }}
                      required
                    >
                      <option value="">-- Pilih Bahan Baku ({filteredMaterials.length} tersedia) --</option>
                      {filteredMaterials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit}) {m.category ? `• ${m.category}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Stock Availability Info */}
                  {selectedMaterial && (
                    <div className="grid grid-cols-2 gap-2 mt-2 p-2.5 rounded-xl bg-[var(--bg-secondary)]/70 border border-[var(--border)] text-xs">
                      <div
                        className={`p-2 rounded-lg border transition-all ${
                          wasteForm.location === 'RESTO'
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : 'bg-[var(--bg-card)] border-[var(--border)] opacity-70'
                        }`}
                      >
                        <div className="text-[11px] text-[var(--text-secondary)]">Stok Resto Bar</div>
                        <div className="font-bold text-sm text-[var(--text-primary)]">
                          {(selectedMaterial.qty_resto || 0).toLocaleString('id-ID')} {selectedMaterial.unit}
                        </div>
                      </div>

                      <div
                        className={`p-2 rounded-lg border transition-all ${
                          wasteForm.location === 'CENTRAL'
                            ? 'bg-blue-500/10 border-blue-500/30'
                            : 'bg-[var(--bg-card)] border-[var(--border)] opacity-70'
                        }`}
                      >
                        <div className="text-[11px] text-[var(--text-secondary)]">Stok Central</div>
                        <div className="font-bold text-sm text-[var(--text-primary)]">
                          {(selectedMaterial.qty_central || 0).toLocaleString('id-ID')} {selectedMaterial.unit}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Field 2: Lokasi Kejadian & Tanggal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-[var(--text-primary)]">Lokasi Kejadian *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                          wasteForm.location === 'RESTO'
                            ? 'bg-amber-500/15 text-amber-600 border-amber-500/30 shadow-sm'
                            : 'bg-[var(--bg-secondary)]/50 border-[var(--border)] text-[var(--text-secondary)]'
                        }`}
                        onClick={() => setWasteForm({ ...wasteForm, location: 'RESTO' })}
                      >
                        <Building2 size={13} /> Resto Bar
                      </button>
                      <button
                        type="button"
                        className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                          wasteForm.location === 'CENTRAL'
                            ? 'bg-blue-500/15 text-blue-600 border-blue-500/30 shadow-sm'
                            : 'bg-[var(--bg-secondary)]/50 border-[var(--border)] text-[var(--text-secondary)]'
                        }`}
                        onClick={() => setWasteForm({ ...wasteForm, location: 'CENTRAL' })}
                      >
                        <Building2 size={13} /> Central
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-[var(--text-primary)]">Tanggal Insiden *</label>
                    <input
                      type="date"
                      className="form-control text-xs md:text-sm py-2"
                      value={wasteForm.date}
                      onChange={(e) => setWasteForm({ ...wasteForm, date: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                </div>

                {/* Field 3: Tipe Kerugian */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-[var(--text-primary)]">Kategori / Tipe Kerugian *</label>
                  <select
                    className="form-control text-xs md:text-sm py-2"
                    value={wasteForm.type}
                    onChange={(e) => setWasteForm({ ...wasteForm, type: e.target.value })}
                  >
                    {WASTE_TYPES.map((wt) => (
                      <option key={wt.value} value={wt.value}>
                        {wt.label} ({wt.value})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Field 4: Kuantitas Terbuang & Estimasi Kerugian Real-time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-[var(--text-primary)]">Kuantitas Terbuang *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        className="form-control text-xs md:text-sm py-2 pr-14 font-mono font-bold"
                        value={wasteForm.quantity}
                        onChange={(e) => setWasteForm({ ...wasteForm, quantity: e.target.value })}
                        placeholder="0.00"
                        required
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-secondary)]">
                        {selectedMaterial?.unit || 'Unit'}
                      </span>
                    </div>
                  </div>

                  {/* Live Loss Preview */}
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs">
                    <div className="text-[10px] uppercase font-bold text-red-600/80">Estimasi Kerugian (Rp)</div>
                    <div className="font-mono font-extrabold text-base text-red-600 dark:text-red-400 mt-0.5">
                      {formatIDR(estimatedFormLoss)}
                    </div>
                  </div>
                </div>

                {/* Stock Warning if Qty > Available */}
                {selectedMaterial && parseFloat(wasteForm.quantity) > availableStockAtLoc && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs flex items-start gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Peringatan:</span> Kuantitas yang dimasukkan (
                      {wasteForm.quantity} {selectedMaterial.unit}) melebihi catatan stok di{' '}
                      {wasteForm.location === 'CENTRAL' ? 'Central' : 'Resto Bar'} ({availableStockAtLoc}{' '}
                      {selectedMaterial.unit}). Stok akan disesuaikan menjadi 0.
                    </div>
                  </div>
                )}

                {/* Field 5: Alasan Singkat & Quick Chips */}
                <div className="space-y-2">
                  <label className="font-semibold text-[var(--text-primary)]">Alasan / Penyebab *</label>
                  <input
                    type="text"
                    className="form-control text-xs md:text-sm py-2"
                    value={wasteForm.reason}
                    onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })}
                    placeholder="Contoh: Jatuh saat pembuatan pesanan, Bau basi dari chiller, dsb."
                    required
                  />

                  {/* Quick Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUICK_REASONS.map((qr) => (
                      <button
                        key={qr}
                        type="button"
                        className="text-[10px] px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] hover:border-red-500/40 transition-colors text-[var(--text-secondary)]"
                        onClick={() => setWasteForm({ ...wasteForm, reason: qr })}
                      >
                        + {qr}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Field 6: Catatan Tambahan */}
                <div className="space-y-1.5">
                  <label className="font-semibold text-[var(--text-primary)]">
                    Catatan Tambahan <span className="font-normal text-[var(--text-secondary)]">(Opsional)</span>
                  </label>
                  <textarea
                    className="form-control text-xs md:text-sm py-2"
                    rows="2"
                    value={wasteForm.notes}
                    onChange={(e) => setWasteForm({ ...wasteForm, notes: e.target.value })}
                    placeholder="Keterangan tindakan preventif atau nama operator/staf terkait..."
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-[var(--border)] shrink-0 flex items-center justify-between bg-[var(--bg-secondary)]/30">
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {selectedMaterial && (
                    <span>
                      Dampak: Potong <b>{wasteForm.quantity || '0'} {selectedMaterial.unit}</b>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs py-2 px-4"
                    onClick={() => setShowInputModal(false)}
                    disabled={submitting}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary text-xs py-2 px-4 flex items-center gap-1.5 font-bold"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <RotateCcw size={14} className="animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Trash2 size={15} />
                        Simpan & Potong Stok
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DETAIL WASTE LOG */}
      {selectedDetailLog && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDetailLog(null);
          }}
        >
          <div className="modal-card w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-500/10 text-red-600">
                  <Info size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--text-primary)]">Detail Log Kerugian (Waste)</h3>
                  <p className="font-mono text-xs text-[var(--text-secondary)]">{selectedDetailLog.id}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                onClick={() => setSelectedDetailLog(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs md:text-sm">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border)]">
                <div>
                  <span className="text-[11px] text-[var(--text-secondary)] block">Bahan Baku</span>
                  <span className="font-bold text-[var(--text-primary)]">{selectedDetailLog.item_name}</span>
                  {selectedDetailLog.sku && selectedDetailLog.sku !== '-' && (
                    <span className="text-[10px] block font-mono text-[var(--text-secondary)]">
                      SKU: {selectedDetailLog.sku}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-secondary)] block">Kategori</span>
                  <span className="font-semibold text-[var(--text-primary)]">{selectedDetailLog.category}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)]/30 border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-secondary)] block">Kuantitas</span>
                  <span className="font-mono font-bold text-red-600">
                    {selectedDetailLog.quantity} {selectedDetailLog.unit}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)]/30 border border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-secondary)] block">Harga Satuan</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {formatIDR(selectedDetailLog.price)}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                  <span className="text-[10px] text-red-600 block">Total Kerugian</span>
                  <span className="font-mono font-bold text-red-600">
                    {formatIDR(selectedDetailLog.cost_loss)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div>
                  <span className="text-xs font-semibold text-[var(--text-secondary)] block">Tanggal & Lokasi:</span>
                  <p className="text-xs text-[var(--text-primary)]">
                    {selectedDetailLog.date} • {selectedDetailLog.location === 'CENTRAL' ? 'Central Warehouse' : 'Resto Bar'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-[var(--text-secondary)] block">Tipe Waste:</span>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{selectedDetailLog.type}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-[var(--text-secondary)] block">Alasan & Catatan:</span>
                  <p className="text-xs text-[var(--text-primary)] bg-[var(--bg-secondary)] p-2.5 rounded-xl border border-[var(--border)] mt-1 whitespace-pre-wrap">
                    {selectedDetailLog.reason || selectedDetailLog.notes || 'Tidak ada catatan khusus.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
              {canManageWaste && (
                <button
                  type="button"
                  className="btn btn-secondary text-xs py-2 px-3 text-red-600 hover:bg-red-500/10 flex items-center gap-1.5"
                  onClick={() => {
                    const log = selectedDetailLog;
                    setSelectedDetailLog(null);
                    setLogToDelete(log);
                  }}
                >
                  <Trash2 size={14} /> Batalkan Catatan Ini
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary text-xs py-2 px-4 ml-auto"
                onClick={() => setSelectedDetailLog(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REVERSAL CONFIRMATION */}
      {logToDelete && (
        <div
          className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setLogToDelete(null);
          }}
        >
          <div className="modal-card w-full max-w-md bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-xl bg-red-500/15">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">Batalkan Catatan Waste?</h3>
                <p className="font-mono text-xs text-[var(--text-secondary)]">{logToDelete.id}</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/70 border border-[var(--border)] text-xs text-[var(--text-secondary)] space-y-2">
              <p>
                Apakah Anda yakin ingin membatalkan dan menghapus catatan waste untuk{' '}
                <strong className="text-[var(--text-primary)]">{logToDelete.item_name}</strong>?
              </p>
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium">
                ✓ Stok sebesar{' '}
                <strong>
                  {logToDelete.quantity} {logToDelete.unit}
                </strong>{' '}
                akan dikembalikan secara otomatis ke gudang{' '}
                <strong>{logToDelete.location === 'CENTRAL' ? 'Central' : 'Resto Bar'}</strong>.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-secondary text-xs py-2 px-4"
                onClick={() => setLogToDelete(null)}
                disabled={deleting}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary text-xs py-2 px-4 bg-red-600 hover:bg-red-700 font-bold flex items-center gap-1.5"
                onClick={handleDeleteWaste}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <RotateCcw size={14} className="animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    Ya, Batalkan & Kembalikan Stok
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
