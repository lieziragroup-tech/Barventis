/* Waste / Barang Rusak Daily Report — Cart-Based Input */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, Trash2, Edit2, Calendar, User, AlertTriangle, Plus, PackageX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { calculateIngredientCost } from '../../services/costUtils';
import Pagination from '../../components/shared/Pagination';

const WASTE_CATEGORIES = ['Spoilage (Basi)', 'Broken (Rusak Fisik)', 'Expired (Kadaluarsa)', 'Contaminated', 'Over-portion', 'Lainnya'];
const PAGE_SIZE = 30;

export default function DailyInventory() {
  const { activeUser } = useAuth();

  // Masters
  const [materials, setMaterials] = useState([]);
  const [unitConversionMap, setUnitConversionMap] = useState(new Map());

  // Cart
  const [cart, setCart] = useState([]);
  const [wasteDate, setWasteDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // New Material Modal
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [newMaterialData, setNewMaterialData] = useState({ name: '', category: 'Bahan Baku Dasar', unit: 'pcs', price: '', min_stock: 15 });

  // History (waste transactions)
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');

  // Period Filter
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const periodOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  // UI State
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target)) {
        setTimeout(() => setShowSearchDropdown(false), 150);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchMasters = async () => {
    try {
      const tenantId = await api.getActiveTenantId();
      const [{ data: mats }, ucMap] = await Promise.all([
        supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
        api._loadUnitConversionMap(tenantId)
      ]);
      setMaterials(mats || []);
      setUnitConversionMap(ucMap);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  const fetchHistory = useCallback(async (page = 1, periodFilter = period, searchQuery = search) => {
    setHistoryLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
      const from = (page - 1) * PAGE_SIZE;

      let query = supabase
        .from('transactions')
        .select('*, materials!inner(name, unit)', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('type', 'WASTE');

      if (periodFilter) {
        const year = periodFilter.substring(0, 4);
        const month = periodFilter.substring(5, 7);
        const nextMonth = parseInt(month, 10) === 12 ? 1 : parseInt(month, 10) + 1;
        const nextYear = parseInt(month, 10) === 12 ? parseInt(year, 10) + 1 : year;

        const startDate = `${periodFilter}-01`;
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        query = query.gte('date', startDate).lt('date', endDate);
      }

      if (searchQuery) {
         query = query.ilike('materials.name', `%${searchQuery}%`);
      }

      const { data, count, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      setHistory(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setHistoryLoading(false);
    }
  }, [period]);

  // Search debounce for history table
  useEffect(() => {
    const t = setTimeout(() => {
      fetchHistory(1, period, search);
    }, 500);
    return () => clearTimeout(t);
  }, [search, period, fetchHistory]);

  useEffect(() => {
    fetchMasters();
  }, []);

  useEffect(() => {
    fetchHistory(historyPage, period, search);
  }, [historyPage, period, search, fetchHistory]);

  const filteredSearch = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return materials.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [debouncedQuery, materials]);

  const addToCart = (material) => {
    setCart(prev => [...prev, {
      cart_id: Date.now() + Math.random(),
      material_id: material.id,
      name: material.name,
      unit: material.unit,
      category: material.category,
      price: material.new_price || material.price || 0,
      full_pack: material.full_pack,
      qty: 1,
      waste_category: 'Spoilage (Basi)',
      notes: ''
    }]);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const updateCartItem = (cartId, field, value) => {
    setCart(prev => prev.map(item => item.cart_id === cartId ? { ...item, [field]: value } : item));
  };

  const updateCart = (cartId, field, value) => {
    setCart(prev => prev.map(item => item.cart_id === cartId ? { ...item, [field]: value } : item));
  };

  const removeFromCart = (cartId) => {
    setCart(prev => prev.filter(item => item.cart_id !== cartId));
  };

  const handleDeleteWasteHistory = async (txId, itemName) => {
    if (!window.confirm(`Hapus dan batalkan data waste "${itemName}"? Stok akan dikembalikan secara otomatis.`)) return;
    setLoading(true);
    try {
      await api.deleteTransactionAndReverseStock(txId);
      setNotification({ type: 'success', text: `Data waste "${itemName}" berhasil dibatalkan.` });
      fetchHistory(historyPage);
      fetchMasters(); // Refresh stock
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEditWasteHistory = async (h) => {
    const newQtyRaw = prompt(`Edit Qty untuk waste "${h.materials?.name}":\nFormat: Angka (Contoh: 5)`, Math.abs(h.qty));
    if (newQtyRaw === null) return;
    const newQtyFloat = parseFloat(newQtyRaw);
    if (isNaN(newQtyFloat) || newQtyFloat <= 0) return alert('Quantity harus angka > 0');

    const newNotes = prompt(`Edit Catatan untuk waste "${h.materials?.name}":`, h.notes || '');
    if (newNotes === null) return;

    const newDate = prompt(`Edit Tanggal untuk waste "${h.materials?.name}":\nFormat: YYYY-MM-DD`, h.date);
    if (newDate === null) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return alert('Format tanggal tidak valid. Harus YYYY-MM-DD');

    setLoading(true);
    try {
      await api.editTransactionAndAdjustStock(h.id, {
        qty: -newQtyFloat, // waste is negative qty
        notes: newNotes,
        date: newDate
      });
      setNotification({ type: 'success', text: `Data waste "${h.materials?.name}" berhasil diperbarui.` });
      fetchHistory(historyPage);
      fetchMasters(); // Refresh stock
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const created = await api.createMaterial({
        name: newMaterialData.name,
        category: newMaterialData.category,
        unit: newMaterialData.unit,
        price: parseFloat(newMaterialData.price) || 0,
        min_stock: parseFloat(newMaterialData.min_stock) || 15
      });
      addToCart(created);
      setShowNewMaterialModal(false);
      setNotification({ type: 'success', text: `Bahan "${created.name}" berhasil ditambahkan.` });
      fetchMasters();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePrepareSaveWaste = () => {
    if (cart.length === 0) return setNotification({ type: 'error', text: 'Daftar barang rusak kosong.' });
    for (const item of cart) {
      if (!item.qty || parseFloat(item.qty) <= 0) return setNotification({ type: 'error', text: `Qty untuk "${item.name}" harus lebih dari 0.` });
    }
    setShowConfirmModal(true);
  };

  const handleFinalSaveWaste = async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
      const userId = await api.getActiveUserId();

      const rows = cart.map(item => {
        const qty = parseFloat(item.qty);
        const matSnap = { ...item, price: item.price };
        const amount = calculateIngredientCost(matSnap, qty, item.unit, unitConversionMap);
        return {
          tenant_id: tenantId,
          date: wasteDate,
          material_id: item.material_id,
          type: 'WASTE',
          location: 'RESTO',
          qty: -qty,
          amount: -amount,
          notes: `[${item.waste_category}] ${item.notes || ''}`.trim() + ` — Dicatat oleh: ${activeUser?.name || 'Sistem'}`,
          created_by: userId
        };
      });

      const { error } = await supabase.from('transactions').insert(rows);
      if (error) throw error;

      setCart([]);
      setNotification({ type: 'success', text: `${rows.length} item waste berhasil disimpan.` });
      setHistoryPage(1);
      fetchHistory(1);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Daily Waste & Barang Rusak
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Catat barang basi, rusak, kadaluarsa, atau waste harian. Data ini masuk ke kalkulasi Cost Control.
        </p>
      </div>

      {notification && (
        <div style={{
          padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px',
          background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
        }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      {/* Input Card */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Keranjang Waste Harian</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cari bahan, pilih tipe kerusakan, masukkan qty, lalu simpan.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <User size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Oleh: <strong style={{ color: 'var(--text-primary)' }}>{activeUser?.name || '-'}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <Calendar size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tanggal:</span>
              <input
                type="date"
                className="form-control"
                style={{ padding: '2px 6px', height: 'auto', background: 'transparent', border: 'none', width: '130px', fontWeight: 600 }}
                value={wasteDate}
                onChange={e => setWasteDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '24px', zIndex: 10 }} ref={searchInputRef}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              style={{ padding: '14px 16px 14px 44px', fontSize: '1rem', background: 'var(--bg-tertiary)', borderColor: showSearchDropdown ? 'var(--accent)' : 'var(--border)' }}
              placeholder="Ketik nama bahan rusak/waste untuk ditambahkan..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setShowSearchDropdown(true); }}
              onFocus={() => setShowSearchDropdown(true)}
            />
          </div>
          {showSearchDropdown && searchQuery.trim() !== '' && (
            <div className="glass-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', padding: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '1px solid var(--border-focus)' }}>
              {filteredSearch.length > 0 ? filteredSearch.map(m => (
                <div
                  key={m.id}
                  style={{ padding: '10px 12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => addToCart(m)}
                >
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{m.category} · {m.unit}</span>
                </div>
              )) : (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Bahan "{searchQuery}" tidak ditemukan.
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', color: 'var(--accent)', border: 'none', background: 'transparent' }}
                  onClick={() => { setNewMaterialData({ ...newMaterialData, name: searchQuery }); setShowSearchDropdown(false); setShowNewMaterialModal(true); }}
                >
                  <Plus size={16} style={{ marginRight: '6px' }} /> Tambah "{searchQuery}" ke Master Data
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cart Table */}
        <div className="table-container" style={{ minHeight: '150px' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Nama Bahan</th>
                <th style={{ width: '180px' }}>Tipe Kerusakan</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Qty</th>
                <th style={{ width: '60px' }}>Unit</th>
                <th>Catatan Tambahan</th>
                <th style={{ width: '40px', textAlign: 'center' }}>Hapus</th>
              </tr>
            </thead>
            <tbody>
              {cart.map(item => (
                <tr key={item.cart_id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td>
                    <select
                      className="form-control"
                      style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                      value={item.waste_category}
                      onChange={e => updateCart(item.cart_id, 'waste_category', e.target.value)}
                    >
                      {WASTE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem' }}
                      value={item.qty}
                      onChange={e => updateCart(item.cart_id, 'qty', e.target.value)}
                    />
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{item.unit}</td>
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                      placeholder="Opsional..."
                      value={item.notes}
                      onChange={e => updateCart(item.cart_id, 'notes', e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn" style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }} onClick={() => removeFromCart(item.cart_id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                    <PackageX size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <div>Belum ada item. Cari bahan di atas.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            className="btn btn-warning"
            style={{ display: 'flex', gap: '8px', padding: '12px 24px', fontSize: '0.95rem', alignItems: 'center' }}
            onClick={handlePrepareSaveWaste}
            disabled={loading || cart.length === 0}
          >
            <AlertTriangle size={18} /> {loading ? 'Menyimpan...' : `Simpan ${cart.length} Item Waste`}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="paged-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Log Riwayat Waste / Barang Rusak</h3>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Periode:</span>
              <select
                className="form-control"
                style={{ padding: '6px 12px', fontSize: '0.85rem', width: '150px' }}
                value={period}
                onChange={e => { setPeriod(e.target.value); setHistoryPage(1); }}
              >
                <option value="">Semua Waktu</option>
                {periodOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative', width: '250px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Cari histori waste..."
                style={{ paddingLeft: '36px' }}
                value={search}
                onChange={e => { setSearch(e.target.value); setHistoryPage(1); }}
              />
            </div>
          </div>
        </div>

        <div className="table-container" style={{ opacity: historyLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Bahan</th>
                <th>Tipe Kerusakan</th>
                <th style={{ textAlign: 'right' }}>Qty Rusak</th>
                <th>Catatan</th>
                <th style={{ textAlign: 'center', width: '60px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => {
                const notesRaw = h.notes || '';
                const typeMatch = notesRaw.match(/\[([^\]]+)\]/);
                const wasteType = typeMatch ? typeMatch[1] : '-';
                const notesClean = notesRaw.replace(/\[[^\]]+\]\s?/, '').replace(/— Dicatat oleh:.*$/, '').trim();
                return (
                  <tr key={h.id}>
                    <td>{h.date}</td>
                    <td style={{ fontWeight: 600 }}>{h.materials?.name || 'Bahan Terhapus'}</td>
                    <td><span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>{wasteType}</span></td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{Math.abs(h.qty).toFixed(2)} {h.materials?.unit}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{notesClean || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn" style={{ padding: '4px', color: 'var(--accent)', background: 'transparent', marginRight: '4px' }} onClick={() => handleEditWasteHistory(h)}>
                        <Edit2 size={16} />
                      </button>
                      <button className="btn" style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }} onClick={() => handleDeleteWasteHistory(h.id, h.materials?.name)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && !historyLoading && (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>Belum ada riwayat waste tercatat.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={historyPage}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={setHistoryPage}
          itemLabel="catatan rusak"
          loading={historyLoading}
        />
      </div>

      {/* New Material Modal */}
      {showNewMaterialModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '400px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>Tambah Material Baru</h3>
            <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Nama Material</label>
                <input type="text" required className="form-control" value={newMaterialData.name} onChange={e => setNewMaterialData({ ...newMaterialData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select className="form-control" value={newMaterialData.category} onChange={e => setNewMaterialData({ ...newMaterialData, category: e.target.value })}>
                  <option>Bahan Baku Dasar</option>
                  <option>Packaging</option>
                  <option>Syrup & Flavor</option>
                  <option>Dairy & Milk</option>
                  <option>Coffee Beans</option>
                  <option>Lainnya</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <input type="text" required className="form-control" placeholder="pcs, kg, ltr" value={newMaterialData.unit} onChange={e => setNewMaterialData({ ...newMaterialData, unit: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Stok</label>
                  <input type="number" required className="form-control" value={newMaterialData.min_stock} onChange={e => setNewMaterialData({ ...newMaterialData, min_stock: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Harga Estimasi (Opsional)</label>
                <input type="number" className="form-control" value={newMaterialData.price} onChange={e => setNewMaterialData({ ...newMaterialData, price: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewMaterialModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan & Tambah'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Review Finalisasi Waste</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Tinjau kembali daftar barang rusak sebelum menyimpan. Anda dapat mengubah jumlahnya di bawah ini.
            </p>
            
            <div className="table-container" style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
              <table className="custom-table" style={{ fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Bahan Baku</th>
                    <th style={{ width: '200px' }}>Jumlah Waste</th>
                    <th>Penyebab/Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.cart_id}>
                      <td style={{ fontWeight: 600 }}>{item.name}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input type="number" step="any" min="0" className="form-control" style={{ width: '80px', padding: '4px' }} value={item.qty} onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.unit}</span>
                        </div>
                      </td>
                      <td>
                        <input type="text" className="form-control" style={{ padding: '4px' }} placeholder="Opsional" value={item.cause} onChange={(e) => updateCartItem(item.cart_id, 'cause', e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)} disabled={loading}>Batal</button>
              <button type="button" className="btn btn-warning" onClick={handleFinalSaveWaste} disabled={loading}>
                {loading ? 'Memproses...' : 'Finalisasi Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
