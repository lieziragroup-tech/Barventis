/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Edit2, Search, Trash2, Calendar, ShoppingCart, User, UploadCloud } from 'lucide-react';
import { api } from '../../services/api';
import Pagination from '../../components/shared/Pagination';
import BulkImport from '../../components/BulkImport';
import { useAuth } from '../../contexts/AuthContext';

const PAGE_SIZE = 15;

export default function Purchasing() {
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('PURCHASES'); // 'PURCHASES' or 'SUPPLIERS'

  // Supplier State
  const [suppliers, setSuppliers] = useState([]);
  const [editingSupplier, setEditSupplier] = useState(null);

  // Materials Master
  const [materials, setMaterials] = useState([]);

  // Purchase Entry history
  const [purchases, setPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [totalNominal, setTotalNominal] = useState(0);
  const [allMatchingIds, setAllMatchingIds] = useState([]);
  const [notification, setNotification] = useState(null);

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

  // --- CART STATES ---
  const [cart, setCart] = useState([]);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Search Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);

  // Debounce effects
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) setDebouncedQuery(searchQuery);
    }, 250); // 250ms debounce
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) {
        setSearch(historySearchInput);
        setPage(1);
      }
    }, 500); // 500ms debounce for API call
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [historySearchInput]);

  // Bulk Import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showBulkImportPurchases, setShowBulkImportPurchases] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // New Material Modal
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [newMaterialData, setNewMaterialData] = useState({ name: '', category: 'Bahan Baku Dasar', unit: 'pcs', price: '', min_stock: 15 });

  const fetchHistory = useCallback(async (targetPage, targetSearch, targetPeriod) => {
    setHistoryLoading(true);
    try {
      const { data, totalCount: count, totalNominal: nominal, allMatchingIds: allIds } = await api.getPurchaseEntriesPaged({ page: targetPage, pageSize: PAGE_SIZE, search: targetSearch, period: targetPeriod });
      setPurchases(data);
      setTotalCount(count);
      setTotalNominal(nominal);
      setAllMatchingIds(allIds || []);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchMasterData = async () => {
    setLoading(true);
    try {
      const [supData, matData] = await Promise.all([
        api.getSuppliers(),
        api.getMaterials()
      ]);
      setSuppliers(supData || []);
      setMaterials((matData || []).map(m => ({ id: m.id, name: m.name, unit: m.unit, price: m.new_price || 0 })));
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  useEffect(() => {
    fetchHistory(page, search, period);
  }, [page, search, period, fetchHistory]);

  // Click outside to close dropdown — use mousedown on the wrapper so the
  // dropdown is still alive when any child receives a click event
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        // Delay so click handlers inside the dropdown fire first
        setTimeout(() => setShowSearchDropdown(false), 150);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Handlers ---
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Konfirmasi simpan data supplier ${editingSupplier.name}?`)) return;
    try {
      await api.saveSupplier(editingSupplier);
      setEditSupplier(null);
      setNotification({ type: 'success', text: 'Supplier tersimpan.' });
      fetchMasterData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  const addToCart = (material) => {
    setCart(prev => [...prev, {
      cart_id: Date.now() + Math.random(),
      material_id: material.id,
      name: material.name,
      unit: material.unit,
      qty: 1,
      unit_price: material.price,
      supplier_id: '',
      date: purchaseDate
    }]);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const updateCartItem = (cartId, field, value) => {
    setCart(prev => prev.map(item => item.cart_id === cartId ? { ...item, [field]: value } : item));
  };

  const removeCartItem = (cartId) => {
    setCart(prev => prev.filter(item => item.cart_id !== cartId));
  };

  const handlePrepareSavePurchases = () => {
    if (cart.length === 0) return setNotification({ type: 'error', text: 'Keranjang pembelian kosong.' });

    // Validation
    for (const item of cart) {
      if (!item.qty || parseFloat(item.qty) <= 0) return setNotification({ type: 'error', text: `Kuantitas untuk ${item.name} harus lebih dari 0.` });
      if (item.unit_price === '' || parseFloat(item.unit_price) < 0) return setNotification({ type: 'error', text: `Harga untuk ${item.name} tidak valid.` });
      if (!item.date && !purchaseDate) return setNotification({ type: 'error', text: `Tanggal pembelian untuk ${item.name} tidak valid.` });
    }

    setShowConfirmModal(true);
  };

  const handleFinalSavePurchases = async () => {
    setLoading(true);
    try {
      await Promise.all(cart.map(item => api.createPurchaseEntry({
        date: item.date || purchaseDate,
        material_id: item.material_id,
        supplier_id: item.supplier_id || null,
        qty: parseFloat(item.qty),
        unit: item.unit,
        unit_price: parseFloat(item.unit_price),
        notes: `Pembelian Multi-Cart by ${activeUser?.name || 'Sistem'}`
      })));

      setCart([]);
      setShowConfirmModal(false);
      setNotification({ type: 'success', text: `${cart.length} item berhasil disimpan ke gudang.` });
      setPage(1);
      fetchHistory(1, search);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = async (purchaseId, itemName) => {
    if (!window.confirm(`Hapus dan batalkan data pembelian harian "${itemName}"? Stok akan ditarik kembali secara otomatis.`)) return;
    setLoading(true);
    try {
      await api.deletePurchaseEntry(purchaseId);
      setNotification({ type: 'success', text: `Pembelian "${itemName}" berhasil dibatalkan.` });
      fetchHistory(page, search);
      fetchMasterData(); // Refresh current stock levels globally
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteHistory = async () => {
    if (selectedPurchases.length === 0) return;
    if (!window.confirm(`Hapus dan batalkan ${selectedPurchases.length} data pembelian harian terpilih? Stok akan ditarik kembali secara otomatis.`)) return;

    setLoading(true);
    let successCount = 0;
    try {
      // Menjalankan semua penghapusan secara berurutan agar aman di Supabase (menghindari deadlock)
      for (const purchaseId of selectedPurchases) {
        // Find the transaction record associated with this purchase entry
        // The api.deleteTransactionAndReverseStock function expects a transaction ID, not a purchase entry ID
        // But in Purchasing.jsx, `selectedPurchases` contains `purchase_entries.id`.
        // We need to fetch the transaction ID first or create a dedicated API method.
        // Easiest is to just call a new method in api to delete the purchase entry itself.
        await api.deletePurchaseEntry(purchaseId);
        successCount++;
      }
      setNotification({ type: 'success', text: `${successCount} data pembelian berhasil dibatalkan.` });
      setSelectedPurchases([]);
      fetchHistory(page, search);
      fetchMasterData();
    } catch (err) {
      setNotification({ type: 'error', text: `Berhasil menghapus ${successCount} item. Terjadi kesalahan pada item berikutnya: ${err.message}` });
      fetchHistory(page, search); // refresh whatever succeeded
      fetchMasterData();
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllHistory = (e) => {
    if (e.target.checked) {
      // Pilih HANYA yang ada di halaman saat ini (Current Page)
      setSelectedPurchases(purchases.map(p => p.id));
    } else {
      setSelectedPurchases([]);
    }
  };

  const handleSelectAllMatchedHistory = () => {
    if (window.confirm(`Pilih semua ${allMatchingIds.length} data pembelian yang cocok dengan filter saat ini (termasuk yang tidak tampil di halaman ini)?`)) {
      setSelectedPurchases(allMatchingIds);
    }
  };

  const handleSelectHistory = (id) => {
    setSelectedPurchases(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleEditHistory = async (p) => {
    const newQty = prompt(`Edit QTY untuk pembelian harian "${p.materials?.name}":\nFormat: Angka. (Contoh: 10)`, p.qty);
    if (newQty === null) return;
    const qtyFloat = parseFloat(newQty);
    if (isNaN(qtyFloat) || qtyFloat <= 0) return alert('Quantity harus angka valid > 0');

    const newPrice = prompt(`Edit Harga Satuan (Rp) untuk pembelian harian "${p.materials?.name}":\nFormat: Angka bulat tanpa titik/koma. (Contoh: 15000)`, p.unit_price);
    if (newPrice === null) return;
    const priceFloat = parseFloat(newPrice);
    if (isNaN(priceFloat) || priceFloat <= 0) return alert('Harga harus angka valid > 0');

    const newNotes = prompt(`Edit Catatan untuk pembelian harian "${p.materials?.name}":`, p.notes || '');
    if (newNotes === null) return;

    // Optional date edit
    const newDate = prompt(`Edit Tanggal untuk pembelian harian "${p.materials?.name}":\nFormat: YYYY-MM-DD. (Contoh: 2026-08-30)`, p.date);
    if (newDate === null) return;
    // basic date validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return alert('Format tanggal tidak valid. Harus YYYY-MM-DD');

    setLoading(true);
    try {
      await api.editTransactionAndAdjustStock(p.id, {
        qty: qtyFloat,
        unit_price: priceFloat,
        notes: newNotes,
        date: newDate
      });
      setNotification({ type: 'success', text: `Data pembelian "${p.materials?.name}" berhasil diperbarui.` });
      fetchHistory(page, search);
      fetchMasterData(); // Refresh current stock levels globally
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
      const payload = {
        name: newMaterialData.name,
        category: newMaterialData.category,
        unit: newMaterialData.unit,
        price: parseFloat(newMaterialData.price) || 0,
        min_stock: parseFloat(newMaterialData.min_stock) || 15
      };
      const created = await api.createMaterial(payload);

      // Auto add to cart
      addToCart({
        id: created.id,
        name: created.name,
        unit: created.unit,
        price: created.price
      });

      setShowNewMaterialModal(false);
      setNotification({ type: 'success', text: `Bahan ${created.name} berhasil dibuat & dimasukkan ke keranjang.` });
      fetchMasterData(); // Refresh the list in the background
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
      setLoading(false); // Reset loading if error, otherwise it resets when fetching
    }
  };

  const filteredSearch = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q === '') return [];
    return materials.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [debouncedQuery, materials]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + ((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0)), 0);
  }, [cart]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Purchasing & Suppliers</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Catat pembelian harian dan kelola master data supplier.</p>
        </div>
      </div>

      {notification && (
        <div style={{ padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content', marginBottom: '20px' }}>
        <button className={`btn ${tab === 'PURCHASES' ? 'btn-primary' : ''}`} style={{ background: tab === 'PURCHASES' ? '' : 'transparent', color: tab === 'PURCHASES' ? '' : 'var(--text-secondary)' }} onClick={() => setTab('PURCHASES')}>Daily Purchases</button>
        <button className={`btn ${tab === 'SUPPLIERS' ? 'btn-primary' : ''}`} style={{ background: tab === 'SUPPLIERS' ? '' : 'transparent', color: tab === 'SUPPLIERS' ? '' : 'var(--text-secondary)' }} onClick={() => setTab('SUPPLIERS')}>Supplier Master</button>
      </div>

      {tab === 'SUPPLIERS' && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Daftar Supplier</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>
                <UploadCloud size={16} style={{ marginRight: '8px' }}/> Import Excel
              </button>
              <button className="btn btn-primary" onClick={() => setEditSupplier({ name: '', phone: '', address: '', contact_person: '' })}>
                <Plus size={16} style={{ marginRight: '8px' }}/> Tambah Supplier
              </button>
            </div>
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr><th>Nama</th><th>Kontak</th><th>No HP</th><th>Alamat</th><th style={{ width: '80px' }}>Aksi</th></tr>
              </thead>
              <tbody>
                {suppliers.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td>{s.contact_person || '-'}</td>
                    <td>{s.phone || '-'}</td>
                    <td>{s.address || '-'}</td>
                    <td>
                      <button className="btn" style={{ padding: '4px', color: 'var(--accent)' }} onClick={() => setEditSupplier(s)}><Edit2 size={16}/></button>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center' }}>Belum ada data supplier.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'PURCHASES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Top Form: Cart & Search */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Keranjang Pembelian Harian</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cari bahan baku, atur jumlah dan harga, lalu simpan semua dalam satu klik.</p>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setShowBulkImportPurchases(true)}>
                  <UploadCloud size={16} style={{ marginRight: '8px' }}/> Bulk Import Pembelian
                </button>
              </div>

              {/* Global Cart Info (Date & Recorder) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <User size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Oleh: <strong style={{ color: 'var(--text-primary)' }}>{activeUser?.name || '-'}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <Calendar size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tanggal Pembelian Default:</span>
                  <input
                    type="date"
                    className="form-control"
                    style={{ padding: '2px 6px', height: 'auto', background: 'transparent', border: 'none', width: '130px', fontWeight: 600 }}
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Smart Search Bar */}
            <div style={{ position: 'relative', marginBottom: '24px', zIndex: 10 }}>
              <div style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="form-control"
                  style={{ padding: '14px 16px 14px 44px', fontSize: '1rem', background: 'var(--bg-tertiary)', borderColor: showSearchDropdown ? 'var(--accent)' : 'var(--border)' }}
                  placeholder="Ketik nama bahan baku untuk menambah ke keranjang..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                />
              </div>

              {/* Dropdown Results */}
              {showSearchDropdown && searchQuery.trim() !== '' && (
                <div className="glass-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', padding: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '1px solid var(--border-focus)' }}>
                  {filteredSearch.length > 0 ? (
                    filteredSearch.map(m => (
                      <div
                        key={m.id}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => addToCart(m)}
                      >
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tap untuk tambah</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Bahan "{searchQuery}" tidak ditemukan.
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', color: 'var(--accent)', border: 'none', background: 'transparent' }}
                      onClick={() => {
                        setNewMaterialData({ ...newMaterialData, name: searchQuery });
                        setShowSearchDropdown(false);
                        setShowNewMaterialModal(true);
                      }}
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
                    <th>Bahan Baku</th>
                    <th style={{ width: '120px' }}>Supplier</th>
                    <th style={{ width: '130px' }}>Tanggal</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Qty</th>
                    <th style={{ width: '60px' }}>Unit</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Harga Satuan</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Total Harga</th>
                    <th style={{ width: '50px', textAlign: 'center' }}>Hapus</th>
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
                          value={item.supplier_id}
                          onChange={(e) => updateCartItem(item.cart_id, 'supplier_id', e.target.value)}
                        >
                          <option value="">(Tunai / Tidak ada)</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="date" className="form-control" style={{ padding: '4px', fontSize: '0.85rem', width: '110px' }} value={item.date || purchaseDate} onChange={(e) => updateCartItem(item.cart_id, 'date', e.target.value)} />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          className="form-control"
                          style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem' }}
                          value={item.qty}
                          onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)}
                        />
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{item.unit}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          className="form-control"
                          style={{ padding: '6px 8px', textAlign: 'right', fontSize: '0.85rem' }}
                          value={item.unit_price}
                          onChange={(e) => updateCartItem(item.cart_id, 'unit_price', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                        Rp {((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0)).toLocaleString('id-ID')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn" style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }} onClick={() => removeCartItem(item.cart_id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {cart.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                        <ShoppingCart size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <div>Keranjang kosong. Cari bahan baku di atas.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {cart.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 700 }}>Total Estimasi Pembelian:</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)', fontSize: '1.1rem' }}>
                        Rp {cartTotal.toLocaleString('id-ID')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn btn-primary"
                style={{ display: 'flex', gap: '8px', padding: '12px 24px', fontSize: '0.95rem' }}
                onClick={handlePrepareSavePurchases}
                disabled={loading || cart.length === 0}
              >
                <ShoppingCart size={18} /> {loading ? 'Menyimpan...' : `Simpan ${cart.length} Item ke Database`}
              </button>
            </div>
          </div>

          {/* History Panel */}
          <div className="glass-card purchasing-history-panel" style={{ padding: '24px' }}>
            <div className="paged-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Log Riwayat Pembelian</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Periode:</span>
                  <select
                    className="form-control"
                    style={{ padding: '6px 12px', fontSize: '0.85rem', width: '150px' }}
                    value={period}
                    onChange={e => { setPeriod(e.target.value); setPage(1); }}
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
                    placeholder="Cari histori (bahan/supplier)..."
                    style={{ paddingLeft: '36px' }}
                    value={historySearchInput}
                    onChange={e => setHistorySearchInput(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="table-container" style={{ opacity: historyLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              {selectedPurchases.length > 0 && (
                <div style={{ padding: '8px 12px', background: 'var(--danger)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedPurchases.length} item terpilih</span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {allMatchingIds.length > purchases.length && selectedPurchases.length > 0 && selectedPurchases.length < allMatchingIds.length && (
                      <button className="btn" style={{ background: 'transparent', color: 'white', padding: '4px 12px', fontSize: '0.8rem', border: 'none', textDecoration: 'underline' }} onClick={handleSelectAllMatchedHistory}>
                        Pilih semua {allMatchingIds.length} item di filter ini
                      </button>
                    )}
                    <button className="btn" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '4px 12px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.3)' }} onClick={handleBulkDeleteHistory} disabled={loading}>
                      <Trash2 size={14} style={{ marginRight: '6px' }}/> Hapus Terpilih
                    </button>
                  </div>
                </div>
              )}
              <table className="custom-table" style={selectedPurchases.length > 0 ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}}>
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={purchases.length > 0 && purchases.every(p => selectedPurchases.includes(p.id))}
                        onChange={handleSelectAllHistory}
                      />
                    </th>
                    <th>Tanggal Input</th>
                    <th>Nama Bahan Baku</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center', width: '60px' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} style={{ background: selectedPurchases.includes(p.id) ? 'var(--bg-tertiary)' : 'transparent' }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedPurchases.includes(p.id)}
                          onChange={() => handleSelectHistory(p.id)}
                        />
                      </td>
                      <td>{p.date}</td>
                      <td style={{ fontWeight: 600 }}>{p.materials?.name}</td>
                      <td style={{ fontSize: '0.85rem' }}>{p.suppliers?.name || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{p.qty} {p.unit}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {(p.qty * p.unit_price).toLocaleString('id-ID')}</td>
                      <td style={{ textAlign: 'center' }}>
                        {p.materials ? (
                          <>
                            <button className="btn" style={{ padding: '4px', color: 'var(--accent)', background: 'transparent', marginRight: '4px' }} onClick={() => handleEditHistory(p)}>
                              <Edit2 size={16} />
                            </button>
                            <button className="btn" style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }} onClick={() => handleDeleteHistory(p.id, p.materials?.name)}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No Action</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {purchases.length === 0 && !historyLoading && <tr><td colSpan="7" style={{ textAlign: 'center' }}>{search ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada data pembelian harian.'}</td></tr>}
                </tbody>
                {purchases.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 700 }}>Total Nominal Keseluruhan:</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                        Rp {totalNominal.toLocaleString('id-ID')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              onPageChange={setPage}
              itemLabel="pembelian"
              loading={historyLoading}
            />
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {editingSupplier && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '400px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>{editingSupplier.id ? 'Edit' : 'Tambah'} Supplier</h3>
            <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group"><label className="form-label">Nama Supplier</label><input type="text" required className="form-control" value={editingSupplier.name} onChange={e => setEditSupplier({...editingSupplier, name: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Contact Person</label><input type="text" className="form-control" value={editingSupplier.contact_person} onChange={e => setEditSupplier({...editingSupplier, contact_person: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">No. Telepon / WA</label><input type="text" className="form-control" value={editingSupplier.phone} onChange={e => setEditSupplier({...editingSupplier, phone: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Alamat</label><textarea className="form-control" rows="2" value={editingSupplier.address} onChange={e => setEditSupplier({...editingSupplier, address: e.target.value})} /></div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditSupplier(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Material Modal */}
      {showNewMaterialModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '400px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>Tambah Material Baru</h3>
            <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Nama Material</label>
                <input type="text" required className="form-control" value={newMaterialData.name} onChange={e => setNewMaterialData({...newMaterialData, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select className="form-control" required value={newMaterialData.category} onChange={e => setNewMaterialData({...newMaterialData, category: e.target.value})}>
                  <option value="Bahan Baku Dasar">Bahan Baku Dasar</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Syrup & Flavor">Syrup & Flavor</option>
                  <option value="Dairy & Milk">Dairy & Milk</option>
                  <option value="Coffee Beans">Coffee Beans</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Satuan (Unit)</label>
                  <input type="text" required className="form-control" placeholder="Contoh: pcs, kg, ltr" value={newMaterialData.unit} onChange={e => setNewMaterialData({...newMaterialData, unit: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Minimal Stok</label>
                  <input type="number" required className="form-control" value={newMaterialData.min_stock} onChange={e => setNewMaterialData({...newMaterialData, min_stock: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Harga Estimasi (Opsional)</label>
                <input type="number" className="form-control" value={newMaterialData.price} onChange={e => setNewMaterialData({...newMaterialData, price: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewMaterialModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan & Tambah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="suppliers"
        title="Bulk Import Data Supplier"
        description="Upload data supplier dari file Excel. Kolom nama wajib diisi."
        currentData={[]}
        expectedColumns={[
          { key: 'name', label: 'NAMA SUPPLIER', required: true, type: 'string', sample: 'PT. Supplier Abadi', description: 'Nama supplier (wajib)' },
          { key: 'contact_person', label: 'KONTAK', required: false, type: 'string', sample: 'Budi Santoso', description: 'Nama PIC/Kontak person' },
          { key: 'phone', label: 'NO HP', required: false, type: 'string', sample: '08123456789', description: 'Nomor telepon/WA' },
          { key: 'address', label: 'ALAMAT', required: false, type: 'string', sample: 'Jl. Sudirman No.123, Jakarta', description: 'Alamat lengkap supplier' }
        ]}
        onCommit={async (rows) => {
          let success = 0;
          let failed = 0;
          const errors = [];

          for (const row of rows) {
            const name = row.name || row['NAMA SUPPLIER'];
            if (!name) {
              failed++;
              errors.push({ row: 'Baris Kosong', error: 'Nama supplier tidak boleh kosong' });
              continue;
            }
            try {
              await api.saveSupplier({
                name: name,
                contact_person: row.contact_person || row['KONTAK'] || '',
                phone: row.phone || row['NO HP'] || '',
                address: row.address || row['ALAMAT'] || ''
              });
              success++;
            } catch (err) {
              console.warn("Failed to import supplier:", err);
              failed++;
              errors.push({ row: name, error: err.message || 'Gagal menyimpan ke database' });
            }
          }

          fetchMasterData();
          return { success, failed, errors };
        }}
      />

      {/* Bulk Import Purchases Modal */}
      <BulkImport
        isOpen={showBulkImportPurchases}
        onClose={() => setShowBulkImportPurchases(false)}
        type="materials"
        title="Bulk Import Data Pembelian Harian"
        description="Upload data pembelian dari file Excel. Pastikan nama bahan sesuai."
        currentData={[]}
        onRegisterMissing={async (missingItems) => {
          // Layer 2: Daftarkan semua missing items ke master data secara batch.
          // Item akan dibuat dengan data minimal dari Excel (name, unit, price).
          // Owner bisa update detail (kategori, min_stock, dll) nanti di Stock Ledger.
          const created = [];
          for (const item of missingItems) {
            const newMat = await api.createMaterial({
              name: item.name,
              unit: item.unit || 'pcs',
              price: item.price || 0,
              category: 'Bahan Baku',
              supplier: '',
              full_pack: 1,
              min_stock: 15
            });
            created.push(newMat);
          }
          // Refresh materials state agar fuzzy match pada retry bisa menemukan item baru.
          // Format sama dengan load awal di useEffect (map ke { id, name, unit, price })
          const freshMaterials = await api.getMaterials();
          setMaterials((freshMaterials || []).map(m => ({ id: m.id, name: m.name, unit: m.unit, price: m.new_price || 0 })));
          return created;
        }}
        expectedColumns={[
          { key: 'tanggal', label: 'TANGGAL', required: false, type: 'string', sample: '2026-08-30', description: 'Tanggal pembelian' },
          { key: 'material_name', label: 'NAMA ITEM', labels: ['NAMA ITEM', 'NAMA BAHAN'], required: true, type: 'string', sample: 'Kopi Arabica', description: 'Nama bahan baku (harus persis sama)' },
          { key: 'qty', label: 'QTY', required: true, type: 'number', sample: 5, description: 'Jumlah yang dibeli' },
          { key: 'unit', label: 'Unit', required: false, type: 'string', sample: 'kg', description: 'Satuan barang' },
          { key: 'unit_price', label: 'HARGA/KG', labels: ['HARGA/KG', 'HARGA/UNIT', 'HARGA SATUAN'], required: true, type: 'number', sample: 150000, description: 'Harga per satuan (tanpa titik/koma)' },
          { key: 'supplier_name', label: 'SUPPLIER', labels: ['SUPPLIER', 'NAMA SUPPLIER'], required: false, type: 'string', sample: 'Supplier A', description: 'Nama supplier (opsional)' },
        ]}
        onCommit={async (rows) => {
          let success = 0;
          let failed = 0;
          const errors = [];
          const warnings = [];

          // ─── LAYER 1: Fuzzy Match Helper ─────────────────────────────────────────
          // Hitung similarity antara dua string (0-1).
          // Menggunakan bigram overlap agar tahan terhadap typo minor,
          // perbedaan spasi, dan variasi kapitalisasi.
          const getBigrams = (str) => {
            const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
            const bigrams = new Set();
            for (let i = 0; i < s.length - 1; i++) bigrams.add(s.slice(i, i + 2));
            return bigrams;
          };
          const similarity = (a, b) => {
            const ba = getBigrams(a);
            const bb = getBigrams(b);
            if (ba.size === 0 || bb.size === 0) return 0;
            let intersection = 0;
            ba.forEach(g => { if (bb.has(g)) intersection++; });
            return (2 * intersection) / (ba.size + bb.size);
          };

          // Cari material: exact first, lalu fuzzy (≥0.70 = auto-map, ≥0.50 = auto-map + warning)
          const findMaterial = (name) => {
            const exact = materials.find(m => m.name.toLowerCase() === name.toLowerCase());
            if (exact) return { material: exact, matched: 'exact' };

            let best = null, bestScore = 0;
            materials.forEach(m => {
              const s = similarity(m.name, name);
              if (s > bestScore) { bestScore = s; best = m; }
            });
            if (best && bestScore >= 0.70) return { material: best, matched: 'fuzzy-high', score: bestScore };
            if (best && bestScore >= 0.50) return { material: best, matched: 'fuzzy-low', score: bestScore };
            return { material: null, matched: 'none' };
          };
          // ─────────────────────────────────────────────────────────────────────────

          // Parse tanggal helper (reused for firstValidDate + per-row)
          const parseExcelDate = (d) => {
            if (!d) return null;
            if (!isNaN(d) && typeof d === 'number')
              return new Date(Math.round((d - 25569) * 86400 * 1000)).toISOString().split('T')[0];
            if (typeof d === 'string' && (d.includes('/') || d.includes('-'))) {
              const parts = d.split(/[/-]/);
              if (parts.length === 3) {
                if (parts[2].length === 4) // DD/MM/YYYY
                  return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString().split('T')[0];
                return new Date(d).toISOString().split('T')[0];
              }
            }
            if (typeof d === 'string' && !isNaN(Date.parse(d)))
              return new Date(d).toISOString().split('T')[0];
            return null;
          };

          let firstValidDate = null;
          for (const row of rows) {
            firstValidDate = parseExcelDate(row.tanggal || row['TANGGAL']);
            if (firstValidDate && !isNaN(new Date(firstValidDate).getTime())) break;
          }
          if (firstValidDate && !isNaN(new Date(firstValidDate).getTime()))
            setPurchaseDate(firstValidDate);

          // ─── LAYER 2: Kumpulkan item yang belum di master data ────────────────────
          // Jika tidak ada match sama sekali (bahkan fuzzy), kumpulkan untuk
          // ditawarkan ke user via "Register & Retry" di BulkImport modal.
          const missingItems = new Map(); // key: lowerCaseName, val: { name, unit, price }
          // ─────────────────────────────────────────────────────────────────────────

          for (const row of rows) {
            const rawDate = row.tanggal || row['TANGGAL'];
            const rowDate = (() => {
              const parsed = parseExcelDate(rawDate);
              return parsed && !isNaN(new Date(parsed).getTime()) ? parsed : purchaseDate;
            })();

            const materialName = row.material_name || row['NAMA ITEM'] || row['NAMA BAHAN'];
            const qty = parseFloat(row.qty || row['QTY'] || 0);
            const unitPrice = parseFloat(row.unit_price || row['HARGA/KG'] || row['HARGA/UNIT'] || row['HARGA SATUAN'] || 0);
            const supplierName = row.supplier_name || row['SUPPLIER'] || row['NAMA SUPPLIER'] || '';
            const unitLabel = row.unit || row['Unit'] || '';

            if (!materialName) {
              failed++;
              errors.push({ row: 'Baris Kosong', error: 'Nama bahan kosong/tidak ditemukan di excel' });
              continue;
            }
            if (qty <= 0) {
              failed++;
              errors.push({ row: materialName, error: 'Qty harus lebih dari 0' });
              continue;
            }
            if (unitPrice < 0) {
              failed++;
              errors.push({ row: materialName, error: 'Harga satuan tidak valid' });
              continue;
            }

            // LAYER 1: Coba exact + fuzzy match
            const { material, matched, score } = findMaterial(materialName);

            if (!material) {
              // LAYER 2: Tidak ada match → kumpulkan untuk Register & Retry
              failed++;
              errors.push({ row: materialName, error: 'Bahan baku belum terdaftar di Master Data' });
              const key = materialName.toLowerCase();
              if (!missingItems.has(key)) {
                missingItems.set(key, {
                  name: materialName,
                  unit: unitLabel || 'pcs',
                  price: unitPrice,
                  category: 'Bahan Baku'
                });
              }
              continue;
            }

            // Fuzzy match dengan confidence rendah → tetap lolos tapi beri warning
            if (matched === 'fuzzy-high') {
              warnings.push(`"${materialName}" dicocokkan otomatis ke "${material.name}" (kemiripan: ${Math.round(score * 100)}%)`);
            } else if (matched === 'fuzzy-low') {
              warnings.push(`"${materialName}" dicocokkan ke "${material.name}" (kemiripan: ${Math.round(score * 100)}%) — harap verifikasi`);
            }

            let supplier_id = '';
            if (supplierName) {
              const supplier = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
              if (supplier) supplier_id = supplier.id;
            }

            setCart(prev => [...prev, {
              cart_id: Date.now() + Math.random(),
              material_id: material.id,
              name: material.name,
              unit: unitLabel || material.unit,
              qty,
              unit_price: unitPrice,
              supplier_id,
              date: rowDate
            }]);
            success++;
          }

          // Kirim missingItems ke BulkImport untuk flow Register & Retry
          return {
            success, failed, errors, warnings,
            missingItems: missingItems.size > 0 ? Array.from(missingItems.values()) : []
          };
        }}
      />

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Review Finalisasi Pembelian Harian</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Tinjau kembali daftar pembelian yang akan disimpan ke database gudang. Anda dapat menyesuaikan harga dan qty di sini.
            </p>
            
            <div className="table-container" style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
              <table className="custom-table" style={{ fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Bahan Baku</th>
                    <th style={{ width: '130px' }}>Tanggal</th>
                    <th style={{ width: '150px' }}>Kuantitas</th>
                    <th style={{ width: '200px' }}>Harga Satuan</th>
                    <th style={{ textAlign: 'right' }}>Total (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.cart_id}>
                      <td style={{ fontWeight: 600 }}>{item.name} <br/><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{suppliers.find(s => s.id === item.supplier_id)?.name || 'Tanpa Supplier'}</span></td>
                      <td>
                        <input type="date" className="form-control" style={{ padding: '4px', fontSize: '0.85rem', width: '110px' }} value={item.date || purchaseDate} onChange={(e) => updateCartItem(item.cart_id, 'date', e.target.value)} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input type="number" step="any" min="0" className="form-control" style={{ width: '80px', padding: '4px' }} value={item.qty} onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.unit}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Rp</span>
                          <input type="number" step="any" min="0" className="form-control" style={{ paddingLeft: '32px', paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px' }} value={item.unit_price} onChange={(e) => updateCartItem(item.cart_id, 'unit_price', e.target.value)} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0)).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                Total Estimasi: <span style={{ color: 'var(--primary)' }}>Rp {cart.reduce((acc, curr) => acc + (parseFloat(curr.qty || 0) * parseFloat(curr.unit_price || 0)), 0).toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)} disabled={loading}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={handleFinalSavePurchases} disabled={loading}>
                  {loading ? 'Memproses...' : 'Finalisasi Sekarang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
