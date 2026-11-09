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
  Send,
  HelpCircle,
  ChevronDown,
  Trash2,
  Sparkles
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import Pagination from '../../components/shared/Pagination';
import MaterialAutocomplete from '../../components/shared/MaterialAutocomplete';
import useIsMobile from '../../hooks/useIsMobile';
import { locationService } from '../../services/locationService';

export default function InterBranchTransfer() {
  const { currentTenant, stock, refreshData, showToast } = useData();
  const { activeUser } = useAuth();
  const isMobile = useIsMobile(768);
  const [showTransferGuide, setShowTransferGuide] = useState(false);

  const [locations, setLocations] = useState(() => locationService.getLocations(currentTenant?.id));
  useEffect(() => {
    const updateLocs = () => {
      setLocations(locationService.getLocations(currentTenant?.id));
    };
    updateLocs();
    return locationService.subscribe(updateLocs);
  }, [currentTenant]);

  const [transfers, setTransfers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [targetFilter, setTargetFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Multi-Item Transfer Cart & Global Route Header
  const [routeHeader, setRouteHeader] = useState({
    source_branch: 'Central Warehouse',
    target_branch: 'Resto Bar',
    notes: ''
  });
  const [transferCart, setTransferCart] = useState([]);

  const fetchTransfers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, reqData] = await Promise.all([
        api.getTransfers(),
        api.getTransferRequests()
      ]);
      setTransfers(data || []);
      setRequests(reqData || []);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      setError(err.message || 'Gagal memuat data transfer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const isSourceCentral = useMemo(
    () => String(routeHeader.source_branch || '').toLowerCase().includes('central'),
    [routeHeader.source_branch]
  );

  const getAvailableStockForMaterial = useCallback(
    (mat) => {
      if (!mat) return 0;
      if (isSourceCentral) {
        return Number(mat.qty_central) || 0;
      }
      return Number(mat.qty_resto ?? mat.stock) || 0;
    },
    [isSourceCentral]
  );

  const handleSwapBranches = () => {
    setRouteHeader(prev => ({
      ...prev,
      source_branch: prev.target_branch,
      target_branch: prev.source_branch
    }));
  };

  const handleAddMaterialToCart = (material) => {
    if (!material) return;
    setError('');
    setTransferCart(prev => {
      const existingIdx = prev.findIndex(item => String(item.material_id) === String(material.id));
      if (existingIdx !== -1) {
        const updated = [...prev];
        const currentQty = parseFloat(updated[existingIdx].qty) || 0;
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: String(currentQty + 1)
        };
        return updated;
      }
      return [
        ...prev,
        {
          cart_id: `${material.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          material_id: material.id,
          name: material.name,
          sku: material.sku || '',
          unit: material.unit || 'unit',
          category: material.category || 'Umum',
          qty_central: Number(material.qty_central || 0),
          qty_resto: Number(material.qty_resto ?? material.stock ?? 0),
          price: Number(material.new_price || material.price || 0),
          qty: '1',
          item_notes: ''
        }
      ];
    });
  };

  const handleAutoFillLowRestoStock = () => {
    if (!stock || stock.length === 0) return;
    const candidates = stock.filter(m => {
      const restoQty = Number(m.qty_resto ?? m.stock ?? 0);
      const centralQty = Number(m.qty_central ?? 0);
      const minStock = Number(m.min_stock ?? 5);
      return restoQty <= minStock && centralQty > 0;
    });

    if (candidates.length === 0) {
      if (showToast) showToast('Semua stok Resto di atas batas minimum atau stok Central sedang kosong.', 'info');
      return;
    }

    setTransferCart(prev => {
      const existingIds = new Set(prev.map(i => String(i.material_id)));
      const additions = candidates
        .filter(m => !existingIds.has(String(m.id)))
        .map(m => {
          const restoQty = Number(m.qty_resto ?? m.stock ?? 0);
          const centralQty = Number(m.qty_central ?? 0);
          const minStock = Number(m.min_stock ?? 5);
          const suggestedQty = Math.min(centralQty, Math.max(1, minStock - restoQty));
          return {
            cart_id: `${m.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            material_id: m.id,
            name: m.name,
            sku: m.sku || '',
            unit: m.unit || 'unit',
            category: m.category || 'Umum',
            qty_central: centralQty,
            qty_resto: restoQty,
            price: Number(m.new_price || m.price || 0),
            qty: String(suggestedQty),
            item_notes: 'Auto-restock stok tipis'
          };
        });
      return [...prev, ...additions];
    });
  };

  const updateCartItem = (cartId, field, value) => {
    setTransferCart(prev =>
      prev.map(item => (item.cart_id === cartId ? { ...item, [field]: value } : item))
    );
  };

  const removeCartItem = (cartId) => {
    setTransferCart(prev => prev.filter(item => item.cart_id !== cartId));
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
    if (transferCart.length === 0) {
      setError('Keranjang mutasi masih kosong. Cari dan pilih minimal 1 bahan baku.');
      return;
    }

    if (routeHeader.source_branch === routeHeader.target_branch) {
      setError('Lokasi asal dan lokasi tujuan tidak boleh sama.');
      return;
    }

    for (const item of transferCart) {
      const qty = parseFloat(item.qty);
      if (isNaN(qty) || qty <= 0) {
        setError(`Kuantitas untuk "${item.name}" harus lebih dari 0.`);
        return;
      }
      const avail = isSourceCentral ? item.qty_central : item.qty_resto;
      if (avail > 0 && qty > avail) {
        const confirmExceed = window.confirm(
          `Perhatian: Kuantitas transfer "${item.name}" (${qty} ${item.unit}) melebihi stok tercatat di ${routeHeader.source_branch} (${avail} ${item.unit}). Tetap lanjutkan?`
        );
        if (!confirmExceed) return;
      }
    }

    setSubmitting(true);
    setError('');

    try {
      const isRequestMode = activeUser?.role === 'Bar';
      await Promise.all(
        transferCart.map(item => {
          const combinedNotes = [routeHeader.notes, item.item_notes].filter(Boolean).join(' | ');
          if (isRequestMode) {
            return api.createTransferRequest({
              material_id: item.material_id,
              qty: parseFloat(item.qty),
              source_branch: routeHeader.source_branch,
              target_branch: routeHeader.target_branch,
              notes: combinedNotes
            });
          }
          return api.createTransfer({
            material_id: item.material_id,
            quantity: parseFloat(item.qty),
            source_branch: routeHeader.source_branch,
            target_branch: routeHeader.target_branch,
            notes: combinedNotes
          });
        })
      );

      await fetchTransfers();
      if (refreshData) refreshData();

      const successMsg = isRequestMode
        ? `Berhasil mengajukan permintaan transfer ${transferCart.length} item dari ${routeHeader.source_branch} ke ${routeHeader.target_branch}.`
        : `Berhasil memindahkan ${transferCart.length} item dari ${routeHeader.source_branch} ke ${routeHeader.target_branch}.`;

      if (showToast) {
        showToast(successMsg, 'success');
      }

      setShowModal(false);
      setTransferCart([]);
      setRouteHeader({
        source_branch: 'Central Warehouse',
        target_branch: 'Resto Bar',
        notes: ''
      });
    } catch (err) {
      console.error('Error creating batch transfer:', err);
      setError(err.message || 'Gagal memproses transfer stok.');
      if (showToast) showToast(err.message || 'Gagal memproses transfer.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveRequest = async (txId) => {
    if (!window.confirm('Setujui permintaan transfer ini? Stok akan otomatis berpindah.')) return;
    setLoading(true);
    try {
      await api.approveTransferRequest(txId);
      if (showToast) showToast('Permintaan disetujui dan ditransfer.', 'success');
      await fetchTransfers();
      if (refreshData) refreshData();
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectRequest = async (txId) => {
    if (!window.confirm('Tolak dan hapus permintaan transfer ini?')) return;
    setLoading(true);
    try {
      await api.rejectTransferRequest(txId);
      if (showToast) showToast('Permintaan ditolak.', 'success');
      await fetchTransfers();
    } catch (err) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setLoading(false);
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
                Mutasi & Ambil Barang (Central ➔ Resto)
              </h1>
              <p className="text-xs md:text-sm mt-0.5 m-0" style={{ color: 'var(--text-secondary)' }}>
                Cari bahan baku dengan cepat dan pindahkan banyak barang sekaligus dalam satu surat jalan
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

          <button
            type="button"
            className="btn btn-secondary text-xs md:text-sm flex items-center gap-1.5"
            onClick={() => setShowTransferGuide(prev => !prev)}
            style={{
              color: showTransferGuide ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: showTransferGuide ? 'var(--accent)' : 'var(--border)'
            }}
          >
            <HelpCircle size={15} />
            <span>Panduan</span>
            <ChevronDown size={13} className={`transition-transform duration-200 ${showTransferGuide ? 'rotate-180' : ''}`} />
          </button>

          <button
            className="btn btn-primary text-xs md:text-sm flex items-center gap-2 shadow font-bold"
            onClick={() => {
              setError('');
              setShowModal(true);
            }}
          >
            <Plus size={17} />
            <span>{activeUser?.role === 'Bar' ? 'Minta Barang dari Central' : 'Buat Mutasi Multi-Item'}</span>
          </button>
        </div>
      </div>

      {showTransferGuide && (
        <div
          className="rounded-xl border p-3.5 text-xs transition-all animate-fadeIn"
          style={{
            background: 'rgba(99, 102, 241, 0.06)',
            borderColor: 'rgba(99, 102, 241, 0.25)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 flex-1">
              <div
                className="p-1.5 rounded-lg shrink-0 mt-0.5"
                style={{ background: 'rgba(99, 102, 241, 0.18)', color: '#4f46e5' }}
              >
                <Info size={16} />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-xs m-0 text-indigo-600 dark:text-indigo-400">
                  Panduan Mutasi Multi-Item (Central Warehouse ke Resto Bar)
                </h4>
                <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--text-secondary)' }}>
                  Ketik nama bahan baku di kotak pencarian (debounce 250ms), pilih semua barang yang akan diangkut ke keranjang mutasi, isi kuantitas per baris, lalu simpan sekaligus dalam satu klik.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTransferGuide(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="glass-card p-3.5 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
            <ArrowRightLeft size={18} />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Total Mutasi
            </span>
            <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)]">
              {stats.totalCount} <span className="text-xs font-normal text-[var(--text-secondary)]">item</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-3.5 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
            <Calendar size={18} />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Bulan Ini
            </span>
            <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)]">
              {stats.thisMonthCount} <span className="text-xs font-normal text-[var(--text-secondary)]">item</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-3.5 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
            <Package size={18} />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Total Unit Dimutasi
            </span>
            <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)]">
              {stats.totalQty.toLocaleString('id-ID')} <span className="text-xs font-normal text-[var(--text-secondary)]">unit</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-3.5 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 shrink-0">
            <TrendingUp size={18} />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
              Estimasi Valuasi
            </span>
            <div className="text-base md:text-lg font-extrabold text-[var(--text-primary)]">
              Rp {stats.totalValuation.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="glass-card p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
            <input
              type="text"
              placeholder="Cari riwayat transfer, nama bahan, atau catatan..."
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

        {requests.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm md:text-base font-bold text-amber-600 mb-3 flex items-center gap-2">
              <AlertCircle size={18} /> Permintaan Transfer Menunggu Persetujuan ({requests.length})
            </h3>
            <div className="space-y-2 md:hidden">
              {requests.map(r => {
                const match = r.notes ? r.notes.match(/Request Transfer \[([^\]]+) ➔ ([^\]]+)\](?: - (.*))?/) : null;
                const source = match ? match[1] : 'Central Warehouse';
                const target = match ? match[2] : 'Resto Bar';
                const notes = match ? match[3] : r.notes;
                return (
                  <div key={r.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">{r.materials?.name || '-'}</span>
                      <span className="font-bold text-indigo-600 text-sm">{r.qty} {r.materials?.unit || ''}</span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] flex items-center justify-between">
                      <span>{source} ➔ <strong>{target}</strong></span>
                      <span>{new Date(r.date).toLocaleDateString('id-ID')}</span>
                    </div>
                    {notes && <div className="text-xs italic text-[var(--text-secondary)]">"{notes}"</div>}
                    {activeUser?.role !== 'Bar' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => handleApproveRequest(r.id)} disabled={loading} className="btn btn-primary py-1.5 px-3 text-xs flex-1 justify-center"><Check size={14}/> Setujui</button>
                        <button onClick={() => handleRejectRequest(r.id)} disabled={loading} className="btn btn-secondary py-1.5 px-3 text-xs flex-1 justify-center text-rose-500"><X size={14}/> Tolak</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="table-responsive hidden md:block border border-amber-200 rounded-xl overflow-hidden shadow-sm">
              <table className="table w-full">
                <thead className="bg-amber-50 border-b border-amber-200 text-xs uppercase font-bold text-amber-800">
                  <tr>
                    <th className="py-3 px-4 text-left">Tanggal</th>
                    <th className="py-3 px-4 text-left">Item / Bahan Baku</th>
                    <th className="py-3 px-4 text-left">Rute Perpindahan</th>
                    <th className="py-3 px-4 text-right">Kuantitas</th>
                    <th className="py-3 px-4 text-left">Catatan</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100 text-sm">
                  {requests.map(r => {
                    const match = r.notes ? r.notes.match(/Request Transfer \[([^\]]+) ➔ ([^\]]+)\](?: - (.*))?/) : null;
                    const source = match ? match[1] : 'Central Warehouse';
                    const target = match ? match[2] : 'Resto Bar';
                    const notes = match ? match[3] : r.notes;
                    return (
                      <tr key={r.id} className="bg-white hover:bg-amber-50/50">
                        <td className="py-3 px-4 text-xs">{new Date(r.date).toLocaleDateString('id-ID')}</td>
                        <td className="py-3 px-4 font-semibold">{r.materials?.name || '-'}</td>
                        <td className="py-3 px-4 text-xs font-mono text-[var(--text-secondary)]">
                          {source} ➔ <strong className="text-[var(--text-primary)]">{target}</strong>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-indigo-600">
                          {r.qty} <span className="text-xs font-normal text-indigo-400">{r.materials?.unit || ''}</span>
                        </td>
                        <td className="py-3 px-4 text-xs italic text-[var(--text-secondary)]">{notes || '-'}</td>
                        <td className="py-3 px-4 text-center">
                          {activeUser?.role !== 'Bar' ? (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => handleApproveRequest(r.id)} disabled={loading} className="btn btn-primary py-1 px-2 text-xs bg-emerald-500 hover:bg-emerald-600 border-none text-white font-bold"><Check size={14}/> Setuju</button>
                              <button onClick={() => handleRejectRequest(r.id)} disabled={loading} className="btn btn-secondary py-1 px-2 text-xs text-rose-500 hover:bg-rose-50 border-rose-200"><X size={14}/> Tolak</button>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-amber-500 px-2 py-1 rounded bg-amber-100">Menunggu</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
                        Klik tombol di bawah untuk memindahkan banyak bahan baku sekaligus dari Central ke Resto.
                      </p>
                      <button
                        className="btn btn-primary text-xs flex items-center gap-1.5"
                        onClick={() => {
                          setError('');
                          setShowModal(true);
                        }}
                      >
                        <Plus size={16} /> Buat Mutasi Pertama
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
                Buat Mutasi Pertama
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

      {/* MODAL KERANJANG MUTASI MULTI-ITEM (DEBOUNCED SEARCH) */}
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
            padding: isMobile ? '10px' : '16px'
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
              background: 'var(--bg-card, var(--bg-primary))',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              maxWidth: '780px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0 bg-[var(--bg-secondary)]/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <Send size={20} />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold m-0 text-[var(--text-primary)]">
                    {activeUser?.role === 'Bar' ? 'Keranjang Permintaan Barang Central' : 'Keranjang Mutasi Stok Multi-Item'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0">
                    Cari bahan baku dengan cepat dan pilih semua barang yang akan dipindahkan sekaligus
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg"
                onClick={() => !submitting && setShowModal(false)}
                title="Tutup (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleTransferSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 md:p-5 space-y-4 overflow-y-auto flex-1">
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Step 1: Rute Asal -> Tujuan */}
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="font-bold text-xs text-[var(--text-primary)]">
                      1. Rute Perpindahan Gudang *
                    </label>
                    {isSourceCentral && (
                      <button
                        type="button"
                        onClick={handleAutoFillLowRestoStock}
                        className="btn btn-secondary py-1 px-2.5 text-[11px] flex items-center gap-1.5 text-indigo-600 border-indigo-500/30"
                      >
                        <Sparkles size={13} /> + Isi Otomatis Stok Tipis Resto
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-[var(--text-secondary)] font-medium mb-1 block">
                        Dari Lokasi (Asal)
                      </label>
                      <select
                        className="form-control text-xs font-semibold py-2 w-full"
                        value={routeHeader.source_branch}
                        onChange={(e) => setRouteHeader({ ...routeHeader, source_branch: e.target.value })}
                      >
                        {locations.filter(l => l.code !== 'ALL').map(l => (
                          <option key={l.code} value={l.name}>{l.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-center pt-1 sm:pt-4">
                      <button
                        type="button"
                        className="p-2 rounded-full border border-[var(--border)] hover:bg-[var(--bg-secondary)] text-indigo-600 transition-all"
                        onClick={handleSwapBranches}
                        title="Tukar Arah Rute"
                      >
                        <ArrowRightLeft size={15} />
                      </button>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-[var(--text-secondary)] font-medium mb-1 block">
                        Ke Lokasi (Tujuan)
                      </label>
                      <select
                        className="form-control text-xs font-semibold py-2 w-full"
                        value={routeHeader.target_branch}
                        onChange={(e) => setRouteHeader({ ...routeHeader, target_branch: e.target.value })}
                      >
                        {locations.filter(l => l.code !== 'ALL').map(l => (
                          <option key={l.code} value={l.name}>{l.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Step 2: Debounced Search Bar (Setara Pembelian Harian) */}
                <div className="space-y-1.5">
                  <label className="font-bold text-xs text-[var(--text-primary)] block">
                    2. Cari & Pilih Bahan Baku (Bisa Pilih Banyak Barang) *
                  </label>
                  <MaterialAutocomplete
                    materials={stock || []}
                    onSelect={handleAddMaterialToCart}
                    clearOnSelect={true}
                    sourceLocation={routeHeader.source_branch}
                    placeholder="Ketik nama bahan atau SKU untuk menambah ke keranjang mutasi..."
                  />
                </div>

                {/* Step 3: Daftar Keranjang Mutasi */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      3. Daftar Barang yang Dipindahkan ({transferCart.length} item)
                    </span>
                    {transferCart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTransferCart([])}
                        className="text-xs text-rose-500 hover:underline font-semibold"
                      >
                        Kosongkan Keranjang
                      </button>
                    )}
                  </div>

                  {transferCart.length === 0 ? (
                    <div className="border border-dashed border-[var(--border)] rounded-xl p-6 text-center text-xs text-[var(--text-secondary)]">
                      <Package size={28} className="mx-auto mb-2 opacity-40" />
                      Keranjang mutasi masih kosong. Ketik nama bahan di kotak pencarian di atas untuk memilih barang.
                    </div>
                  ) : !isMobile ? (
                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                      <table className="custom-table w-full text-xs">
                        <thead>
                          <tr>
                            <th>Nama Bahan Baku</th>
                            <th style={{ textAlign: 'right' }}>Stok Central</th>
                            <th style={{ textAlign: 'right' }}>Stok Resto</th>
                            <th style={{ width: '130px', textAlign: 'right' }}>Qty Transfer *</th>
                            <th style={{ width: '65px' }}>Satuan</th>
                            <th style={{ width: '50px', textAlign: 'center' }}>Hapus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transferCart.map(item => {
                            const avail = isSourceCentral ? item.qty_central : item.qty_resto;
                            const isOver = parseFloat(item.qty) > avail && avail > 0;
                            return (
                              <tr key={item.cart_id}>
                                <td>
                                  <div className="font-semibold text-[var(--text-primary)]">{item.name}</div>
                                  <div className="text-[10px] text-[var(--text-secondary)]">{item.category}</div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: isSourceCentral ? 700 : 400 }}>
                                  {item.qty_central.toLocaleString('id-ID')}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: !isSourceCentral ? 700 : 400 }}>
                                  {item.qty_resto.toLocaleString('id-ID')}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.01"
                                    required
                                    className="form-control text-right py-1 px-2 text-xs"
                                    style={{
                                      borderColor: isOver ? 'var(--danger)' : 'var(--border)'
                                    }}
                                    value={item.qty}
                                    onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)}
                                  />
                                </td>
                                <td>{item.unit}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => removeCartItem(item.cart_id)}
                                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {transferCart.map(item => {
                        const avail = isSourceCentral ? item.qty_central : item.qty_resto;
                        const isOver = parseFloat(item.qty) > avail && avail > 0;
                        return (
                          <div
                            key={item.cart_id}
                            className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/30 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-sm text-[var(--text-primary)]">{item.name}</div>
                                <div className="text-[11px] text-[var(--text-secondary)]">
                                  Central: <strong>{item.qty_central}</strong> • Resto: <strong>{item.qty_resto}</strong> {item.unit}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCartItem(item.cart_id)}
                                className="p-1 text-rose-500"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">
                                  Kuantitas Transfer ({item.unit}) *
                                </label>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  required
                                  className="form-control py-1.5 px-2.5 text-sm w-full"
                                  style={{ borderColor: isOver ? 'var(--danger)' : 'var(--border)' }}
                                  value={item.qty}
                                  onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Step 4: Catatan Umum */}
                <div className="space-y-1">
                  <label className="font-bold text-xs text-[var(--text-primary)] block">
                    4. Catatan Surat Jalan / Alasan Mutasi (Opsional)
                  </label>
                  <input
                    type="text"
                    className="form-control text-xs py-2 w-full"
                    placeholder="Contoh: Restock pagi Bar, persiapan weekend, dll..."
                    value={routeHeader.notes}
                    onChange={(e) => setRouteHeader({ ...routeHeader, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t bg-[var(--bg-secondary)]/40 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-secondary text-xs py-2 px-4"
                  onClick={() => !submitting && setShowModal(false)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs py-2 px-5 font-bold flex items-center gap-1.5"
                  disabled={submitting || transferCart.length === 0}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Memproses...
                    </>
                  ) : (
                    <>
                      <Check size={15} /> Konfirmasi & Simpan ({transferCart.length} Item)
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
