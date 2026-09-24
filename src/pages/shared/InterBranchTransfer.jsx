import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  X,
  Check,
  ArrowRightLeft,
  ArrowRight,
  Info,
  Package,
  TrendingUp,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Loader2,
  Calendar,
  Building,
  Store,
  Send
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { api } from '../../services/api';
import Pagination from '../../components/shared/Pagination';
import { locationService } from '../../services/locationService';

export default function InterBranchTransfer() {
  const { currentTenant, stock, refreshData, showToast } = useData();

  const [locations, setLocations] = useState(() => locationService.getLocations(currentTenant?.id));
  useEffect(() => {
    const updateLocs = () => {
      setLocations(locationService.getLocations(currentTenant?.id));
    };
    updateLocs();
    return locationService.subscribe(updateLocs);
  }, [currentTenant]);

  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [targetFilter, setTargetFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const [transferForm, setTransferForm] = useState({
    item_id: '',
    quantity: '',
    source_branch: 'Central Warehouse',
    target_branch: 'Resto Bar',
    notes: ''
  });

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getTransfers();
      setTransfers(data || []);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      setError(err.message || 'Gagal memuat data transfer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTransfers();
  }, [fetchTransfers]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showModal && !submitting) {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, submitting]);

  // Selected item for transfer form
  const selectedMaterial = useMemo(() => {
    if (!transferForm.item_id || !stock) return null;
    return stock.find(s => String(s.id) === String(transferForm.item_id)) || null;
  }, [transferForm.item_id, stock]);

  // Source stock available
  const availableSourceStock = useMemo(() => {
    if (!selectedMaterial) return 0;
    if (transferForm.source_branch.toLowerCase().includes('central')) {
      return Number(selectedMaterial.qty_central) || 0;
    }
    return Number(selectedMaterial.qty_resto ?? selectedMaterial.stock) || 0;
  }, [selectedMaterial, transferForm.source_branch]);

  // Target stock available (for destination reference)
  const availableTargetStock = useMemo(() => {
    if (!selectedMaterial) return 0;
    if (transferForm.target_branch.toLowerCase().includes('central')) {
      return Number(selectedMaterial.qty_central) || 0;
    }
    return Number(selectedMaterial.qty_resto ?? selectedMaterial.stock) || 0;
  }, [selectedMaterial, transferForm.target_branch]);

  // Swap locations helper
  const handleSwapBranches = () => {
    setTransferForm(prev => ({
      ...prev,
      source_branch: prev.target_branch,
      target_branch: prev.source_branch
    }));
  };

  // Filtered transfers
  const filteredTransfers = useMemo(() => {
    return (transfers || []).filter(t => {
      const matchesSearch =
        `${t.id} ${t.item_name} ${t.source_branch} ${t.target_branch} ${t.notes || ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesSource =
        sourceFilter === 'ALL' ||
        t.source_branch.toLowerCase().includes(sourceFilter.toLowerCase());

      const matchesTarget =
        targetFilter === 'ALL' ||
        t.target_branch.toLowerCase().includes(targetFilter.toLowerCase());

      return matchesSearch && matchesSource && matchesTarget;
    });
  }, [transfers, searchTerm, sourceFilter, targetFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredTransfers.length / itemsPerPage) || 1;
  const paginatedTransfers = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredTransfers.slice(start, start + itemsPerPage);
  }, [filteredTransfers, page, itemsPerPage]);

  // Stat metrics
  const stats = useMemo(() => {
    const totalCount = transfers.length;
    const totalQty = transfers.reduce((sum, t) => sum + (Number(t.qty) || 0), 0);
    const totalValuation = transfers.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const now = new Date();
    const thisMonth = transfers.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    return {
      totalCount,
      thisMonthCount: thisMonth.length,
      totalQty,
      totalValuation
    };
  }, [transfers]);

  const handleTransferSubmit = async (e) => {
    e?.preventDefault();
    if (!transferForm.item_id) {
      alert('Silakan pilih bahan baku yang akan ditransfer.');
      return;
    }

    const qty = parseFloat(transferForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Masukkan jumlah kuantitas transfer yang valid (lebih dari 0).');
      return;
    }

    if (transferForm.source_branch === transferForm.target_branch) {
      alert('Lokasi asal dan lokasi tujuan tidak boleh sama.');
      return;
    }

    if (availableSourceStock > 0 && qty > availableSourceStock) {
      const confirmExceed = window.confirm(
        `Perhatian: Kuantitas transfer (${qty}) melebihi stok tersedia di lokasi asal (${availableSourceStock} ${selectedMaterial?.unit || ''}). Apakah Anda ingin tetap melanjutkan?`
      );
      if (!confirmExceed) return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.createTransfer({
        material_id: transferForm.item_id,
        quantity: qty,
        source_branch: transferForm.source_branch,
        target_branch: transferForm.target_branch,
        notes: transferForm.notes
      });

      // Refresh both local transfer log & main data context (Stock Ledger, etc.)
      await fetchTransfers();
      if (refreshData) refreshData();

      const successMsg = `Berhasil mentransfer ${qty} ${selectedMaterial?.unit || ''} "${selectedMaterial?.name || ''}" dari ${transferForm.source_branch} ke ${transferForm.target_branch}.`;
      
      if (showToast) {
        showToast(successMsg, 'success');
      }

      setShowModal(false);
      setTransferForm({
        item_id: '',
        quantity: '',
        source_branch: 'Central Warehouse',
        target_branch: 'Resto Bar',
        notes: ''
      });
    } catch (err) {
      console.error('Error creating transfer:', err);
      setError(err.message || 'Gagal memproses transfer stok.');
      if (showToast) showToast(err.message || 'Gagal memproses transfer.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container fade-in space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <ArrowRightLeft size={22} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black m-0" style={{ color: 'var(--text-primary)' }}>
                Inter-Branch Transfer
              </h1>
              <p className="text-xs md:text-sm mt-0.5 m-0" style={{ color: 'var(--text-secondary)' }}>
                Mutasi & serah-terima fisik bahan baku antar lokasi internal (Central Warehouse & Outlet)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-secondary text-xs md:text-sm flex items-center gap-1.5"
            onClick={fetchTransfers}
            disabled={loading}
            title="Muat Ulang Data"
          >
            <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Trigger Button to Open Modal */}
          <button
            className="btn btn-primary text-xs md:text-sm flex items-center gap-2 shadow font-bold"
            onClick={() => {
              setError('');
              setShowModal(true);
            }}
          >
            <Plus size={17} />
            <span>Buat Transfer Baru</span>
          </button>
        </div>
      </div>

      {/* Info Banner: Panduan Fungsi & Alur Transfer */}
      <div
        className="rounded-xl border p-4 text-sm transition-all"
        style={{
          background: 'rgba(99, 102, 241, 0.08)',
          borderColor: 'rgba(99, 102, 241, 0.25)',
          color: 'var(--text-primary)'
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="p-2 rounded-lg shrink-0 mt-0.5"
            style={{
              background: 'rgba(99, 102, 241, 0.18)',
              color: '#4f46e5'
            }}
          >
            <Info size={20} />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-bold text-sm m-0 text-indigo-600 dark:text-indigo-400">
                📦 Panduan: Fungsi & Alur Kerja Inter-Branch Transfer
              </h4>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                Mutasi Internal Aset
              </span>
            </div>

            <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--text-secondary)' }}>
              Fitur <strong>Transfer Antar Lokasi</strong> digunakan untuk mencatat pergerakan fisik bahan baku dari <strong>Gudang Utama (Central Warehouse)</strong> ke <strong>Outlet (Resto Bar / Kitchen)</strong>, atau antar cabang. Mutasi ini <strong>tidak mempengaruhi HPP / laba-rugi</strong> karena merupakan pergerakan internal aset, melainkan menjaga buku stok (<em>Stock Ledger</em>) tetap akurat dan terhindar dari selisih semu (<em>ghost inventory</em>).
            </p>

            <div className="pt-2 mt-2 border-t border-[var(--border)] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <strong className="block text-[var(--text-primary)]">Tentukan Rute & Bahan</strong>
                  <span className="text-[var(--text-secondary)]">Pilih item dan tentukan gudang asal serta gudang tujuan.</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <strong className="block text-[var(--text-primary)]">Cek Ketersediaan Stok</strong>
                  <span className="text-[var(--text-secondary)]">Sistem mengecek sisa stok di lokasi pengirim secara langsung agar tidak minus.</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <strong className="block text-[var(--text-primary)]">Sinkronisasi Otomatis</strong>
                  <span className="text-[var(--text-secondary)]">Stok asal berkurang dan stok tujuan bertambah, tercatat lengkap dengan ID audit.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
            <ArrowRightLeft size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Total Mutasi
            </span>
            <div className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)]">
              {stats.totalCount} <span className="text-xs font-normal text-[var(--text-secondary)]">transaksi</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Bulan Ini
            </span>
            <div className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)]">
              {stats.thisMonthCount} <span className="text-xs font-normal text-[var(--text-secondary)]">transaksi</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
            <Package size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Total Unit Dimutasi
            </span>
            <div className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)]">
              {stats.totalQty.toLocaleString('id-ID')} <span className="text-xs font-normal text-[var(--text-secondary)]">unit</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Estimasi Valuasi
            </span>
            <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)]">
              Rp {stats.totalValuation.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="glass-card p-4 md:p-6 space-y-4">
        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
            <input
              type="text"
              placeholder="Cari transfer, nama bahan, atau catatan..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="form-control pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-secondary)] font-medium">Asal:</span>
              <select
                className="form-control py-1 px-2.5 text-xs font-medium"
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Semua Asal</option>
                {locations.filter(l => l.code !== 'ALL').map(l => (
                  <option key={l.code} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[var(--text-secondary)] font-medium">Tujuan:</span>
              <select
                className="form-control py-1 px-2.5 text-xs font-medium"
                value={targetFilter}
                onChange={(e) => {
                  setTargetFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">Semua Tujuan</option>
                {locations.filter(l => l.code !== 'ALL').map(l => (
                  <option key={l.code} value={l.name}>{l.name}</option>
                ))}
              </select>
            </div>

            {(searchTerm || sourceFilter !== 'ALL' || targetFilter !== 'ALL') && (
              <button
                className="btn btn-secondary py-1 px-2 text-xs flex items-center gap-1 text-[var(--text-secondary)] hover:text-red-500"
                onClick={() => {
                  setSearchTerm('');
                  setSourceFilter('ALL');
                  setTargetFilter('ALL');
                  setPage(1);
                }}
              >
                <X size={14} /> Reset
              </button>
            )}
          </div>
        </div>

        {/* Table / Desktop */}
        <div className="table-responsive hidden md:block border rounded-xl overflow-hidden">
          <table className="table w-full">
            <thead className="bg-[var(--bg-secondary)] border-b text-xs uppercase font-bold text-[var(--text-secondary)]">
              <tr>
                <th className="py-3 px-4 text-left">No. Ref</th>
                <th className="py-3 px-4 text-left">Tanggal</th>
                <th className="py-3 px-4 text-left">Item / Bahan Baku</th>
                <th className="py-3 px-4 text-left">Rute Perpindahan</th>
                <th className="py-3 px-4 text-right">Kuantitas</th>
                <th className="py-3 px-4 text-right">Valuasi (Rp)</th>
                <th className="py-3 px-4 text-left">Catatan</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm">
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-[var(--text-secondary)]">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>Memuat riwayat transfer...</span>
                  </td>
                </tr>
              ) : paginatedTransfers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-12 text-[var(--text-secondary)]">
                    <div className="max-w-md mx-auto flex flex-col items-center">
                      <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-500 mb-3">
                        <ArrowRightLeft size={28} />
                      </div>
                      <p className="font-semibold text-base text-[var(--text-primary)] mb-1">
                        Belum Ada Catatan Transfer
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mb-4">
                        Klik tombol "Buat Transfer Baru" di atas untuk memindahkan stok bahan baku antar lokasi.
                      </p>
                      <button
                        className="btn btn-primary text-xs flex items-center gap-1.5"
                        onClick={() => {
                          setError('');
                          setShowModal(true);
                        }}
                      >
                        <Plus size={16} /> Buat Transfer Pertama
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-semibold">
                      <span className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border)]">
                        {t.id}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap text-[var(--text-secondary)]">
                      {t.date
                        ? new Date(t.date).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })
                        : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{t.item_name}</div>
                      <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
                        {t.materials?.sku && <span>SKU: {t.materials.sku}</span>}
                        {t.materials?.category && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-500/10 text-[10px]">
                            {t.materials.category}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <span className="px-2 py-0.5 rounded-md bg-slate-500/10 text-[var(--text-primary)] border border-slate-500/20">
                          {t.source_branch}
                        </span>
                        <ArrowRight size={13} className="text-indigo-500 shrink-0" />
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                          {t.target_branch}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-[var(--text-primary)]">
                      {Number(t.qty).toLocaleString('id-ID')} <span className="text-xs font-normal text-[var(--text-secondary)]">{t.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-xs font-medium text-[var(--text-secondary)]">
                      Rp {Number(t.amount).toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--text-secondary)] max-w-[200px] truncate" title={t.notes}>
                      {t.notes || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={12} /> Selesai
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="text-center py-8 text-[var(--text-secondary)]">
              <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
              <span>Memuat riwayat transfer...</span>
            </div>
          ) : paginatedTransfers.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-secondary)] border rounded-xl p-4">
              <ArrowRightLeft size={28} className="mx-auto mb-2 text-indigo-500" />
              <p className="font-semibold text-sm">Belum Ada Catatan Transfer</p>
              <button
                className="btn btn-primary text-xs mt-2"
                onClick={() => {
                  setError('');
                  setShowModal(true);
                }}
              >
                Buat Transfer Pertama
              </button>
            </div>
          ) : (
            paginatedTransfers.map((t) => (
              <div key={t.id} className="border rounded-xl p-3.5 bg-[var(--bg-secondary)]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--bg-secondary)] border">
                    {t.id}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {t.date ? new Date(t.date).toLocaleDateString('id-ID') : '-'}
                  </span>
                </div>
                <div>
                  <div className="font-bold text-sm text-[var(--text-primary)]">{t.item_name}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Jumlah: <strong className="text-[var(--text-primary)]">{t.qty} {t.unit}</strong> (Rp {Number(t.amount).toLocaleString('id-ID')})
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs pt-1 border-t">
                  <span className="px-1.5 py-0.5 rounded bg-slate-500/10 font-medium">{t.source_branch}</span>
                  <ArrowRight size={12} className="text-indigo-500" />
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 font-medium">{t.target_branch}</span>
                </div>
                {t.notes && (
                  <p className="text-xs text-[var(--text-secondary)] italic m-0 pt-1">
                    "{t.notes}"
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {filteredTransfers.length > 0 && (
          <div className="pt-2 border-t">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              itemsPerPage={itemsPerPage}
              totalItems={filteredTransfers.length}
            />
          </div>
        )}
      </div>

      {/* FORM MODAL: BUAT TRANSFER BARU */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setShowModal(false);
            }
          }}
        >
          <div
            className="modal-card"
            style={{
              background: 'var(--bg-card)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              maxWidth: '620px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div className="p-5 border-b flex items-center justify-between shrink-0 bg-[var(--bg-secondary)]/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold m-0 text-[var(--text-primary)]">
                    Buat Transfer Stok Baru
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0">
                    Mutasi & serah-terima bahan baku fisik antar lokasi internal
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] p-1.5 rounded-lg transition-colors"
                onClick={() => !submitting && setShowModal(false)}
                title="Tutup (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleTransferSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {error && (
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2.5">
                    <AlertCircle size={17} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Step 1: Pilih Bahan Baku */}
                <div className="form-group space-y-1">
                  <label className="form-label font-bold text-xs flex items-center justify-between">
                    <span>1. Pilih Item / Bahan Baku *</span>
                    {selectedMaterial && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold text-xs">
                        Satuan: {selectedMaterial.unit}
                      </span>
                    )}
                  </label>
                  <select
                    className="form-control text-sm py-2.5"
                    required
                    value={transferForm.item_id}
                    onChange={(e) => setTransferForm({ ...transferForm, item_id: e.target.value })}
                  >
                    <option value="">-- Pilih Bahan Baku dari Master Data --</option>
                    {(stock || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.sku ? `(${m.sku})` : ''} - Satuan: {m.unit} | Kategori: {m.category || 'Umum'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Real-Time Stock Status */}
                {selectedMaterial && (
                  <div className="p-3.5 rounded-xl bg-slate-500/5 border border-[var(--border)] text-xs space-y-2">
                    <div className="flex items-center justify-between text-[var(--text-secondary)] font-semibold text-[11px] uppercase tracking-wider">
                      <span>Ketersediaan Stok Terkini ({selectedMaterial.name})</span>
                      <span>Satuan: {selectedMaterial.unit}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          transferForm.source_branch.includes('Central')
                            ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                            : 'bg-[var(--bg-secondary)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Building size={16} className="text-slate-500 shrink-0" />
                          <div>
                            <span className="font-semibold block text-[var(--text-primary)] text-xs">Central Warehouse</span>
                            <span className="text-[10px] text-[var(--text-secondary)]">Gudang Utama</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-[var(--text-primary)] block">
                            {Number(selectedMaterial.qty_central || 0).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{selectedMaterial.unit}</span>
                        </div>
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border flex items-center justify-between ${
                          !transferForm.source_branch.includes('Central')
                            ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                            : 'bg-[var(--bg-secondary)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Store size={16} className="text-slate-500 shrink-0" />
                          <div>
                            <span className="font-semibold block text-[var(--text-primary)] text-xs">Resto Bar</span>
                            <span className="text-[10px] text-[var(--text-secondary)]">Outlet Floor</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-black text-[var(--text-primary)] block">
                            {Number(selectedMaterial.qty_resto ?? selectedMaterial.stock ?? 0).toLocaleString('id-ID')}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{selectedMaterial.unit}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Rute Asal -> Tujuan with Swap */}
                <div className="form-group space-y-1">
                  <label className="form-label font-bold text-xs">2. Tentukan Rute Perpindahan *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-[var(--text-secondary)] font-medium mb-1 block">
                        Dari Lokasi (Asal)
                      </label>
                      <select
                        className="form-control text-xs font-semibold py-2"
                        value={transferForm.source_branch}
                        onChange={(e) => setTransferForm({ ...transferForm, source_branch: e.target.value })}
                      >
                        {locations.filter(l => l.code !== 'ALL').map(l => (
                          <option key={l.code} value={l.name}>{l.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-center pt-1 sm:pt-4">
                      <button
                        type="button"
                        className="p-2 rounded-full border border-[var(--border)] hover:bg-[var(--bg-secondary)] text-indigo-600 transition-all hover:scale-105"
                        onClick={handleSwapBranches}
                        title="Tukar Arah Rute (Swap)"
                      >
                        <ArrowRightLeft size={16} />
                      </button>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-[var(--text-secondary)] font-medium mb-1 block">
                        Ke Lokasi (Tujuan)
                      </label>
                      <select
                        className="form-control text-xs font-semibold py-2"
                        value={transferForm.target_branch}
                        onChange={(e) => setTransferForm({ ...transferForm, target_branch: e.target.value })}
                      >
                        {locations.filter(l => l.code !== 'ALL').map(l => (
                          <option key={l.code} value={l.name}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {transferForm.source_branch === transferForm.target_branch && (
                    <p className="text-xs text-red-500 font-semibold mt-1">
                      ⚠️ Lokasi asal dan lokasi tujuan tidak boleh sama.
                    </p>
                  )}
                </div>

                {/* Step 3: Kuantitas Pengiriman */}
                <div className="form-group space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="form-label font-bold text-xs m-0">
                      3. Kuantitas Transfer *
                    </label>
                    {selectedMaterial && (
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Tersedia di Asal: <strong className="text-[var(--text-primary)]">{availableSourceStock}</strong> | Tujuan: <strong className="text-[var(--text-primary)]">{availableTargetStock}</strong> {selectedMaterial.unit}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      placeholder="0.00"
                      className="form-control pr-20 text-base font-bold py-2"
                      value={transferForm.quantity}
                      onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-secondary)] uppercase px-2 py-0.5 rounded bg-[var(--bg-secondary)] border">
                      {selectedMaterial ? selectedMaterial.unit : 'UNIT'}
                    </span>
                  </div>

                  {selectedMaterial && parseFloat(transferForm.quantity) > availableSourceStock && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2 mt-1">
                      <AlertCircle size={15} className="shrink-0 text-amber-600" />
                      <span>
                        Kuantitas transfer ({transferForm.quantity} {selectedMaterial.unit}) melebihi saldo di{' '}
                        {transferForm.source_branch} ({availableSourceStock} {selectedMaterial.unit}).
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 4: Catatan */}
                <div className="form-group space-y-1">
                  <label className="form-label font-bold text-xs">
                    4. Catatan / Alasan Transfer (Opsional)
                  </label>
                  <textarea
                    className="form-control text-xs"
                    rows="2"
                    value={transferForm.notes}
                    onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                    placeholder="Contoh: Restock mingguan Bar, Pinjam darurat kitchen, dll..."
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t shrink-0 flex items-center justify-end gap-2.5 bg-[var(--bg-secondary)]/30">
                <button
                  type="button"
                  className="btn btn-secondary text-xs py-2 px-4"
                  onClick={() => setShowModal(false)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs py-2 px-5 font-bold flex items-center gap-2 shadow"
                  disabled={
                    submitting ||
                    !transferForm.item_id ||
                    !transferForm.quantity ||
                    transferForm.source_branch === transferForm.target_branch
                  }
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>Konfirmasi & Simpan Transfer</span>
                    </>
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
