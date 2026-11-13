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
  Sparkles,
  Truck,
  ClipboardCheck
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import Pagination from '../../components/shared/Pagination';
import MaterialAutocomplete from '../../components/shared/MaterialAutocomplete';
import useIsMobile from '../../hooks/useIsMobile';
import { locationService } from '../../services/locationService';

export default function InterBranchTransfer() {
  const {
    currentTenant,
    stock,
    refreshData,
    showToast,
    branches,
    activeBranch,
    activeBranchId
  } = useData();
  const { activeUser } = useAuth();
  const isMobile = useIsMobile(768);
  const [showTransferGuide, setShowTransferGuide] = useState(false);

  const activeBranches = useMemo(
    () => (branches || []).filter(b => b.is_active !== false),
    [branches]
  );
  const branchById = useMemo(
    () => new Map((branches || []).map(b => [b.id, b])),
    [branches]
  );
  const otherBranches = useMemo(
    () => activeBranches.filter(b => b.id !== activeBranchId),
    [activeBranches, activeBranchId]
  );

  const [selectedMode, setSelectedMode] = useState(null);
  const transferMode = selectedMode || (activeBranches.length > 1 ? 'INTER_BRANCH' : 'INTERNAL');

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
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Inter-Branch Dispatch & Receive Modals
  const [showInterBranchModal, setShowInterBranchModal] = useState(false);
  const [interBranchTargetId, setInterBranchTargetId] = useState('');
  const [interBranchNotes, setInterBranchNotes] = useState('');
  const [interBranchCart, setInterBranchCart] = useState([]);
  const [directionFilter, setDirectionFilter] = useState('ALL');
  const [receiveModalShipment, setReceiveModalShipment] = useState(null);
  const [receiveQtys, setReceiveQtys] = useState({});
  const [receivingSaving, setReceivingSaving] = useState(false);

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
      const [data, reqData, shipmentData] = await Promise.all([
        api.getTransfers(),
        api.getTransferRequests(),
        api.getInterBranchShipments().catch(() => [])
      ]);
      setTransfers(data || []);
      setRequests(reqData || []);
      setShipments(shipmentData || []);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      setError(err.message || 'Gagal memuat data transfer.');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

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

  const incomingPendingShipments = useMemo(
    () => (shipments || []).filter(s => s.status === 'DISPATCHED' && s.to_branch_id === activeBranchId),
    [shipments, activeBranchId]
  );

  const branchShipments = useMemo(() => {
    return (shipments || []).filter(s => {
      if (activeBranchId && s.from_branch_id !== activeBranchId && s.to_branch_id !== activeBranchId) {
        // Show all tenant shipments if activeBranchId matches neither, or restrict to active branch:
        return false;
      }
      if (directionFilter === 'INCOMING' && s.to_branch_id !== activeBranchId) return false;
      if (directionFilter === 'OUTGOING' && s.from_branch_id !== activeBranchId) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const fromName = branchById.get(s.from_branch_id)?.name || '';
      const toName = branchById.get(s.to_branch_id)?.name || '';
      const itemNames = (s.inter_branch_transfer_items || []).map(i => i.materials?.name || '').join(' ');
      return `${s.transfer_number} ${fromName} ${toName} ${s.notes || ''} ${itemNames}`.toLowerCase().includes(q);
    });
  }, [shipments, activeBranchId, directionFilter, searchTerm, branchById]);

  const interBranchStats = useMemo(() => {
    const incomingWait = incomingPendingShipments.length;
    const outgoingTransit = (shipments || []).filter(s => s.status === 'DISPATCHED' && s.from_branch_id === activeBranchId).length;
    const receivedCount = (shipments || []).filter(s => s.status === 'RECEIVED' && (s.from_branch_id === activeBranchId || s.to_branch_id === activeBranchId)).length;
    const varianceCount = (shipments || []).filter(s => s.status === 'VARIANCE_FLAGGED' && (s.from_branch_id === activeBranchId || s.to_branch_id === activeBranchId)).length;
    return { incomingWait, outgoingTransit, receivedCount, varianceCount };
  }, [shipments, incomingPendingShipments, activeBranchId]);

  const handleAddInterBranchMaterial = (material) => {
    if (!material) return;
    setError('');
    setInterBranchCart(prev => {
      const idx = prev.findIndex(i => String(i.material_id) === String(material.id));
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: String((parseFloat(next[idx].qty) || 0) + 1) };
        return next;
      }
      const avail = activeBranch?.is_central
        ? Number(material.qty_central || 0)
        : Number(material.qty_resto || material.qty_central || 0);
      return [
        ...prev,
        {
          cart_id: `${material.id}-${Date.now()}`,
          material_id: material.id,
          name: material.name,
          unit: material.unit || 'pck',
          category: material.category || 'Umum',
          available: avail,
          qty: '1',
          notes: ''
        }
      ];
    });
  };

  const handleOpenInterBranchModal = () => {
    setError('');
    setInterBranchTargetId(otherBranches[0]?.id || '');
    setInterBranchNotes('');
    setInterBranchCart([]);
    setShowInterBranchModal(true);
  };

  const handleDispatchInterBranch = async (e) => {
    e?.preventDefault();
    if (!activeBranchId || !interBranchTargetId) {
      setError('Pilih cabang tujuan pengiriman.');
      return;
    }
    if (interBranchCart.length === 0) {
      setError('Tambahkan minimal 1 bahan baku.');
      return;
    }
    for (const item of interBranchCart) {
      const q = parseFloat(item.qty);
      if (!Number.isFinite(q) || q <= 0) {
        setError(`Kuantitas "${item.name}" harus lebih dari 0.`);
        return;
      }
    }
    setSubmitting(true);
    setError('');
    try {
      await api.dispatchInterBranchShipment({
        fromBranchId: activeBranchId,
        toBranchId: interBranchTargetId,
        items: interBranchCart.map(i => ({ material_id: i.material_id, qty: parseFloat(i.qty), notes: i.notes })),
        notes: interBranchNotes
      });
      if (showToast) {
        const destName = branchById.get(interBranchTargetId)?.name || 'cabang tujuan';
        showToast(`Pengiriman ke ${destName} berhasil dibuat.`, 'success');
      }
      setShowInterBranchModal(false);
      setInterBranchCart([]);
      await fetchTransfers();
      if (refreshData) refreshData();
    } catch (err) {
      setError(err.message || 'Gagal mengirim stok ke cabang.');
      if (showToast) showToast(err.message || 'Gagal mengirim stok ke cabang.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenReceiveModal = (shipment) => {
    const initial = {};
    (shipment.inter_branch_transfer_items || []).forEach(it => {
      initial[it.id] = String(it.qty_dispatched ?? 0);
    });
    setReceiveQtys(initial);
    setReceiveModalShipment(shipment);
  };

  const handleConfirmReceiveShipment = async (e) => {
    e?.preventDefault();
    if (!receiveModalShipment) return;
    setReceivingSaving(true);
    try {
      const receivedItems = (receiveModalShipment.inter_branch_transfer_items || []).map(it => ({
        id: it.id,
        qty_received: Math.max(0, parseFloat(receiveQtys[it.id] ?? it.qty_dispatched) || 0)
      }));
      const completed = await api.receiveInterBranchShipment({
        transferId: receiveModalShipment.id,
        receivedItems
      });
      if (showToast) {
        showToast(
          completed?.status === 'VARIANCE_FLAGGED'
            ? 'Barang diterima dengan catatan selisih kuantitas.'
            : 'Barang diterima & stok cabang diperbarui.',
          'success'
        );
      }
      setReceiveModalShipment(null);
      await fetchTransfers();
      if (refreshData) refreshData();
    } catch (err) {
      if (showToast) showToast(err.message || 'Gagal memproses penerimaan barang.', 'error');
    } finally {
      setReceivingSaving(false);
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
                Mutasi Gudang
              </h1>
              <p className="text-xs md:text-sm mt-0.5 m-0" style={{ color: 'var(--text-secondary)' }}>
                Distribusi stok antar cabang dan area.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-secondary text-xs md:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0"
            onClick={fetchTransfers}
            disabled={loading}
            title="Muat Ulang Data"
          >
            <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary text-xs md:text-sm flex items-center gap-1.5 whitespace-nowrap shrink-0"
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

          {transferMode === 'INTER_BRANCH' && otherBranches.length > 0 ? (
            <button
              className="btn btn-primary text-xs md:text-sm flex items-center gap-2 shadow font-bold whitespace-nowrap shrink-0"
              onClick={handleOpenInterBranchModal}
            >
              <Truck size={16} />
              <span>Kirim ke Cabang</span>
            </button>
          ) : (
            <button
              className="btn btn-primary text-xs md:text-sm flex items-center gap-2 shadow font-bold whitespace-nowrap shrink-0"
              onClick={() => {
                setError('');
                setShowModal(true);
              }}
            >
              <Plus size={17} />
              <span>{activeUser?.role === 'Bar' ? 'Minta Barang' : 'Buat Mutasi'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher Tabs (Antar Cabang vs Internal Area) */}
      {activeBranches.length > 1 && (
        <div className="flex items-center gap-1.5 p-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] w-fit">
          <button
            type="button"
            onClick={() => setSelectedMode('INTER_BRANCH')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
              transferMode === 'INTER_BRANCH'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Truck size={14} />
            <span>Antar Cabang</span>
            {incomingPendingShipments.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white tabular-nums">
                {incomingPendingShipments.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedMode('INTERNAL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
              transferMode === 'INTERNAL'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ArrowRightLeft size={14} />
            <span>Internal Area (Gudang ↔ Bar)</span>
          </button>
        </div>
      )}

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
                  Panduan Mutasi
                </h4>
                <p className="text-xs leading-relaxed m-0" style={{ color: 'var(--text-secondary)' }}>
                  Pilih rute asal/tujuan, cari bahan, isi jumlah, lalu simpan.
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

      {transferMode === 'INTER_BRANCH' ? (
        <>
          {/* KPI Antar Cabang */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <div className="glass-card p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                <Package size={18} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                  Menunggu Diterima
                </span>
                <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  {interBranchStats.incomingWait} <span className="text-xs font-normal text-[var(--text-secondary)]">kiriman</span>
                </div>
              </div>
            </div>
            <div className="glass-card p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
                <Truck size={18} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                  Dikirim Cabang Ini
                </span>
                <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  {interBranchStats.outgoingTransit} <span className="text-xs font-normal text-[var(--text-secondary)]">kiriman</span>
                </div>
              </div>
            </div>
            <div className="glass-card p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                  Selesai Diterima
                </span>
                <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  {interBranchStats.receivedCount} <span className="text-xs font-normal text-[var(--text-secondary)]">kiriman</span>
                </div>
              </div>
            </div>
            <div className="glass-card p-3.5 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <AlertCircle size={18} />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">
                  Selisih Terima
                </span>
                <div className="text-lg md:text-xl font-extrabold text-[var(--text-primary)] tabular-nums">
                  {interBranchStats.varianceCount} <span className="text-xs font-normal text-[var(--text-secondary)]">kiriman</span>
                </div>
              </div>
            </div>
          </div>

          {/* Pengiriman Masuk Menunggu Konfirmasi */}
          {incomingPendingShipments.length > 0 && (
            <div className="glass-card p-4 md:p-5 space-y-3 border border-amber-500/30">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={18} className="text-amber-500 shrink-0" />
                  <div>
                    <h3 className="text-sm font-bold m-0 text-[var(--text-primary)]">
                      Barang Masuk ke {activeBranch?.name} ({incomingPendingShipments.length})
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] m-0">
                      Periksa fisik barang sebelum diterima.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {incomingPendingShipments.map(s => {
                  const senderName = branchById.get(s.from_branch_id)?.name || 'Cabang Asal';
                  const itemsList = s.inter_branch_transfer_items || [];
                  return (
                    <div key={s.id} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/50 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border)]">
                            {s.transfer_number}
                          </span>
                          <span className="text-[11px] text-[var(--text-secondary)]">
                            {s.dispatched_at ? new Date(s.dispatched_at).toLocaleDateString('id-ID') : '-'}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                          <Store size={13} className="text-[var(--accent)]" />
                          <span>Dari {senderName}</span>
                          <span className="text-[var(--text-secondary)]">• {itemsList.length} item</span>
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] line-clamp-2">
                          {itemsList.map(i => `${i.materials?.name || 'Item'} (${i.qty_dispatched} ${i.materials?.unit || ''})`).join(', ')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenReceiveModal(s)}
                        className="btn btn-primary py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <CheckCircle2 size={14} /> Terima Barang
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabel Riwayat Pengiriman Antar Cabang */}
          <div className="glass-card p-4 md:p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                <input
                  type="text"
                  placeholder="Cari no. pengiriman, cabang, atau bahan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-control pl-9 text-sm"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                {[
                  { id: 'ALL', label: 'Semua' },
                  { id: 'INCOMING', label: 'Masuk' },
                  { id: 'OUTGOING', label: 'Keluar' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDirectionFilter(opt.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap shrink-0 ${
                      directionFilter === opt.id
                        ? 'bg-[var(--accent)] text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-responsive hidden md:block border rounded-xl overflow-hidden">
              <table className="table w-full">
                <thead className="bg-[var(--bg-secondary)] border-b text-xs uppercase font-bold text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-3 px-4 text-left">No. Surat Jalan</th>
                    <th className="py-3 px-4 text-left">Tanggal</th>
                    <th className="py-3 px-4 text-left">Rute Cabang</th>
                    <th className="py-3 px-4 text-left">Daftar Bahan</th>
                    <th className="py-3 px-4 text-left">Catatan</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-[var(--text-secondary)]">
                        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
                        <span>Memuat pengiriman antar cabang...</span>
                      </td>
                    </tr>
                  ) : branchShipments.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-12 text-[var(--text-secondary)]">
                        <Truck size={28} className="mx-auto mb-2 text-indigo-500 opacity-60" />
                        <p className="font-semibold text-sm text-[var(--text-primary)] mb-1">Belum Ada Pengiriman Cabang</p>
                        <p className="text-xs mb-3">Kirim stok dari {activeBranch?.name} ke cabang lain.</p>
                        {otherBranches.length > 0 && (
                          <button type="button" onClick={handleOpenInterBranchModal} className="btn btn-primary text-xs">
                            <Truck size={14} /> Kirim ke Cabang
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    branchShipments.map(s => {
                      const fromName = branchById.get(s.from_branch_id)?.name || '-';
                      const toName = branchById.get(s.to_branch_id)?.name || '-';
                      const items = s.inter_branch_transfer_items || [];
                      const canReceive = s.status === 'DISPATCHED' && s.to_branch_id === activeBranchId;
                      return (
                        <tr key={s.id} className="hover:bg-[var(--bg-secondary)]/50">
                          <td className="py-3 px-4 font-mono text-xs font-semibold whitespace-nowrap">{s.transfer_number}</td>
                          <td className="py-3 px-4 text-xs whitespace-nowrap text-[var(--text-secondary)]">
                            {s.created_at ? new Date(s.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-slate-500/10 border border-slate-500/20">{fromName}</span>
                              <ArrowRight size={13} className="text-indigo-500 shrink-0" />
                              <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">{toName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--text-primary)]">
                            <div className="font-semibold tabular-nums">{items.length} bahan</div>
                            <div className="text-[11px] text-[var(--text-secondary)] truncate max-w-[260px]">
                              {items.map(i => `${i.materials?.name || 'Bahan'} (${i.qty_dispatched})`).join(', ')}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--text-secondary)] max-w-[160px] truncate">{s.notes || '-'}</td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {s.status === 'RECEIVED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 size={12} /> Diterima
                              </span>
                            )}
                            {s.status === 'DISPATCHED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                                <Truck size={12} /> Dalam Perjalanan
                              </span>
                            )}
                            {s.status === 'VARIANCE_FLAGGED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-400">
                                <AlertCircle size={12} /> Selisih Qty
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {canReceive ? (
                              <button
                                type="button"
                                onClick={() => handleOpenReceiveModal(s)}
                                className="btn btn-primary py-1 px-2.5 text-xs font-bold whitespace-nowrap"
                              >
                                Terima Barang
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--text-secondary)]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards for Inter-Branch Shipments */}
            <div className="md:hidden space-y-3">
              {loading ? (
                <div className="text-center py-8 text-[var(--text-secondary)]">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-500" />
                  <span>Memuat pengiriman...</span>
                </div>
              ) : branchShipments.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-secondary)] border rounded-xl p-4">
                  <Truck size={28} className="mx-auto mb-2 text-indigo-500" />
                  <p className="font-semibold text-sm">Belum Ada Pengiriman Cabang</p>
                </div>
              ) : (
                branchShipments.map(s => {
                  const fromName = branchById.get(s.from_branch_id)?.name || '-';
                  const toName = branchById.get(s.to_branch_id)?.name || '-';
                  const items = s.inter_branch_transfer_items || [];
                  const canReceive = s.status === 'DISPATCHED' && s.to_branch_id === activeBranchId;
                  return (
                    <div key={s.id} className="border rounded-xl p-3.5 bg-[var(--bg-secondary)]/30 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--bg-secondary)] border">{s.transfer_number}</span>
                        <span className="text-[11px] font-semibold">
                          {s.status === 'RECEIVED' ? 'Diterima' : s.status === 'VARIANCE_FLAGGED' ? 'Selisih' : 'Dikirim'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <span className="px-1.5 py-0.5 rounded bg-slate-500/10">{fromName}</span>
                        <ArrowRight size={12} className="text-indigo-500" />
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600">{toName}</span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">
                        {items.map(i => `${i.materials?.name || 'Bahan'} (${i.qty_dispatched})`).join(', ')}
                      </div>
                      {canReceive && (
                        <button
                          type="button"
                          onClick={() => handleOpenReceiveModal(s)}
                          className="btn btn-primary w-full py-2 text-xs font-bold justify-center"
                        >
                          <CheckCircle2 size={14} /> Terima Barang
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : (
        <>
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
                    {activeUser?.role === 'Bar' ? 'Permintaan Barang' : 'Buat Mutasi Stok'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0">
                    Pilih rute dan daftar bahan transfer.
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
                      1. Rute Gudang *
                    </label>
                    {isSourceCentral && (
                      <button
                        type="button"
                        onClick={handleAutoFillLowRestoStock}
                        className="btn btn-secondary py-1 px-2.5 text-[11px] flex items-center gap-1.5 text-indigo-600 border-indigo-500/30"
                      >
                        <Sparkles size={13} /> Isi Stok Tipis
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
                    2. Pilih Bahan *
                  </label>
                  <MaterialAutocomplete
                    materials={stock || []}
                    onSelect={handleAddMaterialToCart}
                    clearOnSelect={true}
                    sourceLocation={routeHeader.source_branch}
                    placeholder="Cari bahan atau SKU..."
                  />
                </div>

                {/* Step 3: Daftar Keranjang Mutasi */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      3. Daftar Bahan ({transferCart.length} item)
                    </span>
                    {transferCart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTransferCart([])}
                        className="text-xs text-rose-500 hover:underline font-semibold"
                      >
                        Kosongkan
                      </button>
                    )}
                  </div>

                  {transferCart.length === 0 ? (
                    <div className="border border-dashed border-[var(--border)] rounded-xl p-6 text-center text-xs text-[var(--text-secondary)]">
                      <Package size={28} className="mx-auto mb-2 opacity-40" />
                      Keranjang masih kosong.
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
                    4. Catatan (Opsional)
                  </label>
                  <input
                    type="text"
                    className="form-control text-xs py-2 w-full"
                    placeholder="Catatan mutasi..."
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
                      <Check size={15} /> Simpan ({transferCart.length} Item)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}

      {/* MODAL KIRIM STOK ANTAR CABANG */}
      {showInterBranchModal && (
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
            if (e.target === e.currentTarget && !submitting) setShowInterBranchModal(false);
          }}
        >
          <div
            className="modal-card"
            style={{
              background: 'var(--bg-card, var(--bg-primary))',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden'
            }}
          >
            <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0 bg-[var(--bg-secondary)]/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold m-0 text-[var(--text-primary)]">
                    Kirim Stok ke Cabang
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0">
                    Potong stok cabang ini lalu kirim.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon text-[var(--text-secondary)] p-1.5 rounded-lg"
                onClick={() => !submitting && setShowInterBranchModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDispatchInterBranch} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 md:p-5 space-y-4 overflow-y-auto flex-1">
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                      Dari Cabang (Pengirim)
                    </label>
                    <div className="form-control text-xs font-bold py-2 bg-[var(--bg-primary)] opacity-80 flex items-center gap-1.5">
                      <Building size={14} className="text-[var(--accent)]" />
                      <span>{activeBranch?.name || '-'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                      Ke Cabang (Penerima) *
                    </label>
                    <select
                      className="form-control text-xs font-semibold py-2 w-full"
                      value={interBranchTargetId}
                      onChange={(e) => setInterBranchTargetId(e.target.value)}
                      required
                    >
                      {otherBranches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}{b.is_central ? ' (Central)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-xs text-[var(--text-primary)] block">
                    Pilih Bahan dari {activeBranch?.name} *
                  </label>
                  <MaterialAutocomplete
                    materials={stock || []}
                    onSelect={handleAddInterBranchMaterial}
                    clearOnSelect={true}
                    sourceLocation={activeBranch?.is_central ? 'Central Warehouse' : 'Resto Bar'}
                    placeholder="Cari nama bahan atau SKU..."
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      Daftar Item Dikirim ({interBranchCart.length})
                    </span>
                    {interBranchCart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setInterBranchCart([])}
                        className="text-xs text-rose-500 hover:underline font-semibold"
                      >
                        Kosongkan
                      </button>
                    )}
                  </div>

                  {interBranchCart.length === 0 ? (
                    <div className="border border-dashed border-[var(--border)] rounded-xl p-5 text-center text-xs text-[var(--text-secondary)]">
                      Pilih bahan baku di atas untuk ditambahkan.
                    </div>
                  ) : (
                    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                      <table className="custom-table w-full text-xs">
                        <thead>
                          <tr>
                            <th>Bahan Baku</th>
                            <th style={{ textAlign: 'right' }}>Stok Tersedia</th>
                            <th style={{ width: '120px', textAlign: 'right' }}>Qty Kirim *</th>
                            <th style={{ width: '60px' }}>Satuan</th>
                            <th style={{ width: '48px', textAlign: 'center' }}>Hapus</th>
                          </tr>
                        </thead>
                        <tbody>
                          {interBranchCart.map(item => (
                            <tr key={item.cart_id}>
                              <td className="font-semibold text-[var(--text-primary)]">{item.name}</td>
                              <td className="text-right tabular-nums text-[var(--text-secondary)]">
                                {Number(item.available).toLocaleString('id-ID')}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  required
                                  className="form-control text-right py-1 px-2 text-xs tabular-nums"
                                  value={item.qty}
                                  onChange={(e) => setInterBranchCart(prev => prev.map(x => x.cart_id === item.cart_id ? { ...x, qty: e.target.value } : x))}
                                />
                              </td>
                              <td>{item.unit}</td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  onClick={() => setInterBranchCart(prev => prev.filter(x => x.cart_id !== item.cart_id))}
                                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-bold text-xs text-[var(--text-primary)] block mb-1">
                    Catatan Pengiriman (Opsional)
                  </label>
                  <input
                    type="text"
                    className="form-control text-xs py-2 w-full"
                    placeholder="Contoh: Kiriman mingguan, driver Budi..."
                    value={interBranchNotes}
                    onChange={(e) => setInterBranchNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-4 border-t bg-[var(--bg-secondary)]/40 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-secondary text-xs py-2 px-4"
                  onClick={() => !submitting && setShowInterBranchModal(false)}
                  disabled={submitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs py-2 px-5 font-bold flex items-center gap-1.5 whitespace-nowrap"
                  disabled={submitting || interBranchCart.length === 0}
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>{submitting ? 'Mengirim...' : `Kirim (${interBranchCart.length} Item)`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VERIFIKASI PENERIMAAN BARANG ANTAR CABANG */}
      {receiveModalShipment && (
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
            if (e.target === e.currentTarget && !receivingSaving) setReceiveModalShipment(null);
          }}
        >
          <div
            className="modal-card"
            style={{
              background: 'var(--bg-card, var(--bg-primary))',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden'
            }}
          >
            <div className="p-4 md:p-5 border-b flex items-center justify-between shrink-0 bg-[var(--bg-secondary)]/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold m-0 text-[var(--text-primary)]">
                    Terima Barang ({receiveModalShipment.transfer_number})
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0">
                    Cocokkan jumlah fisik sebelum masuk stok.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn-icon text-[var(--text-secondary)] p-1.5 rounded-lg"
                onClick={() => !receivingSaving && setReceiveModalShipment(null)}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmReceiveShipment} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 md:p-5 space-y-4 overflow-y-auto flex-1">
                <div className="flex items-center gap-2 text-xs font-medium p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40">
                  <span>{branchById.get(receiveModalShipment.from_branch_id)?.name || 'Pengirim'}</span>
                  <ArrowRight size={14} className="text-indigo-500" />
                  <strong className="text-[var(--text-primary)]">{branchById.get(receiveModalShipment.to_branch_id)?.name || 'Cabang Aktif'}</strong>
                </div>

                <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <table className="custom-table w-full text-xs">
                    <thead>
                      <tr>
                        <th>Bahan Baku</th>
                        <th style={{ textAlign: 'right' }}>Dikirim</th>
                        <th style={{ width: '130px', textAlign: 'right' }}>Diterima *</th>
                        <th style={{ width: '60px' }}>Satuan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(receiveModalShipment.inter_branch_transfer_items || []).map(it => {
                        const dispatched = Number(it.qty_dispatched || 0);
                        const receivedVal = parseFloat(receiveQtys[it.id] ?? dispatched) || 0;
                        const hasVariance = Math.abs(receivedVal - dispatched) > 0.001;
                        return (
                          <tr key={it.id}>
                            <td className="font-semibold text-[var(--text-primary)]">{it.materials?.name || 'Bahan'}</td>
                            <td className="text-right tabular-nums text-[var(--text-secondary)]">{dispatched.toLocaleString('id-ID')}</td>
                            <td>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                required
                                className="form-control text-right py-1 px-2 text-xs tabular-nums"
                                style={{ borderColor: hasVariance ? '#f59e0b' : 'var(--border)' }}
                                value={receiveQtys[it.id] ?? ''}
                                onChange={(e) => setReceiveQtys(prev => ({ ...prev, [it.id]: e.target.value }))}
                              />
                            </td>
                            <td>{it.materials?.unit || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 border-t bg-[var(--bg-secondary)]/40 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  className="btn btn-secondary text-xs py-2 px-4"
                  onClick={() => !receivingSaving && setReceiveModalShipment(null)}
                  disabled={receivingSaving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs py-2 px-5 font-bold flex items-center gap-1.5 whitespace-nowrap"
                  disabled={receivingSaving}
                >
                  {receivingSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>{receivingSaving ? 'Menyimpan...' : 'Konfirmasi Terima'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
