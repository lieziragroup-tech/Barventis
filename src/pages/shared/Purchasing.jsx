import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Search } from 'lucide-react';
import { api } from '../../services/api';
import Pagination from '../../components/shared/Pagination';

const PAGE_SIZE = 15;

export default function Purchasing() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('PURCHASES'); // 'PURCHASES' or 'SUPPLIERS'

  // Supplier State (small list, loaded in full)
  const [suppliers, setSuppliers] = useState([]);
  const [editingSupplier, setEditSupplier] = useState(null);

  // Materials (for the form dropdown, small list, loaded in full)
  const [materials, setMaterials] = useState([]);

  // Purchase Entry history — paginated + searchable
  const [purchases, setPurchases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const debounceRef = useRef(null);

  const [newPurchase, setNewPurchase] = useState({ date: new Date().toISOString().split('T')[0], material_id: '', supplier_id: '', qty: '', unit: 'pck', unit_price: '', notes: '' });
  const [notification, setNotification] = useState(null);

  // Debounce search input -> actual search query (400ms), reset to page 1
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const fetchHistory = useCallback(async (targetPage, targetSearch) => {
    setHistoryLoading(true);
    try {
      const { data, totalCount: count } = await api.getPurchaseEntriesPaged({ page: targetPage, pageSize: PAGE_SIZE, search: targetSearch });
      setPurchases(data);
      setTotalCount(count);
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
      setMaterials((matData || []).map(m => ({ id: m.id, name: m.name, unit: m.unit, new_price: m.new_price })));
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMasterData();
  }, []);

  useEffect(() => {
    fetchHistory(page, search);
  }, [page, search, fetchHistory]);

  // --- Supplier Handlers ---
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    try {
      await api.saveSupplier(editingSupplier);
      setEditSupplier(null);
      setNotification({ type: 'success', text: 'Supplier tersimpan.' });
      fetchMasterData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  // --- Purchase Entry Handlers ---
  const handleMaterialSelect = (e) => {
    const matId = e.target.value;
    const mat = materials.find(m => m.id.toString() === matId);
    setNewPurchase({
      ...newPurchase,
      material_id: matId,
      unit: mat ? mat.unit : 'pck',
      unit_price: mat ? mat.new_price : ''
    });
  };

  const handleSavePurchase = async (e) => {
    e.preventDefault();
    try {
      await api.createPurchaseEntry(newPurchase);
      setNewPurchase({ date: new Date().toISOString().split('T')[0], material_id: '', supplier_id: '', qty: '', unit: 'pck', unit_price: '', notes: '' });
      setNotification({ type: 'success', text: 'Pembelian tersimpan dan stok ter-update.' });
      setPage(1);
      fetchHistory(1, search);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

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
            <button className="btn btn-primary" onClick={() => setEditSupplier({ name: '', phone: '', address: '', contact_person: '' })}><Plus size={16} style={{ marginRight: '8px' }}/> Tambah Supplier</button>
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
        <div className="purchasing-layout" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Form */}
          <div className="glass-card purchasing-form-panel" style={{ flex: '1', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '20px' }}>Input Pembelian Harian</h3>
            <form onSubmit={handleSavePurchase} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Tanggal</label>
                <input type="date" required className="form-control" value={newPurchase.date} onChange={e => setNewPurchase({...newPurchase, date: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Bahan Baku</label>
                <select required className="form-control" value={newPurchase.material_id} onChange={handleMaterialSelect}>
                  <option value="">Pilih Bahan...</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Supplier</label>
                <select className="form-control" value={newPurchase.supplier_id} onChange={e => setNewPurchase({...newPurchase, supplier_id: e.target.value})}>
                  <option value="">Tanpa Supplier / Tunai</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Qty ({newPurchase.unit})</label>
                  <input type="number" step="any" required className="form-control" value={newPurchase.qty} onChange={e => setNewPurchase({...newPurchase, qty: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga per Unit</label>
                  <input type="number" step="any" required className="form-control" value={newPurchase.unit_price} onChange={e => setNewPurchase({...newPurchase, unit_price: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Total Harga</label>
                <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontWeight: 700 }}>
                  Rp {((parseFloat(newPurchase.qty) || 0) * (parseFloat(newPurchase.unit_price) || 0)).toLocaleString('id-ID')}
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={loading}>Simpan Pembelian</button>
            </form>
          </div>

          {/* History */}
          <div className="glass-card purchasing-history-panel" style={{ flex: '2', padding: '24px' }}>
            <div className="paged-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Riwayat Pembelian Harian</h3>
              <div style={{ position: 'relative', minWidth: '220px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  placeholder="Cari bahan / catatan..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                />
              </div>
            </div>
            <div className="table-container" style={{ opacity: historyLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Nama Item</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id}>
                      <td>{p.date}</td>
                      <td style={{ fontWeight: 600 }}>{p.materials?.name}</td>
                      <td style={{ fontSize: '0.85rem' }}>{p.suppliers?.name || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{p.qty} {p.unit}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {(p.qty * p.unit_price).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                  {purchases.length === 0 && !historyLoading && <tr><td colSpan="5" style={{ textAlign: 'center' }}>{search ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada data pembelian harian.'}</td></tr>}
                </tbody>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '400px', maxWidth: 'calc(100vw - 32px)', padding: '24px' }}>
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
    </div>
  );
}
