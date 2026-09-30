import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X, Search, Loader2, Package } from 'lucide-react';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';

export const OFFICIAL_CATEGORIES = [
  'Drink & Beer',
  'Syrup & Flavor',
  'Dairy & Milk',
  'Coffee & Tea',
  'Fruit & Produce',
  'Liquor & Spirit',
  'Bahan Mentah / Raw Material',
  'Consumable (Packaging)',
  'Glass & Tool (Asset)'
];

export default function Marketlist() {
  const { showToast, refreshData } = useData();
  const { activeUser } = useAuth();
  
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  
  // Inline edit states
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  
  // Modal for Create
  const [showModal, setShowModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState({
    name: '',
    category: OFFICIAL_CATEGORIES[0],
    unit: 'pcs',
    price: 0,
    supplier: '',
    min_stock: 15
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [matData, supData] = await Promise.all([
        api.getMaterials(),
        api.getSuppliers()
      ]);
      setMaterials(matData || []);
      setSuppliers(supData || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (m.sku && m.sku.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchCat = categoryFilter === 'ALL' || m.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [materials, searchTerm, categoryFilter]);

  const startEdit = (mat) => {
    setEditingId(mat.id);
    setEditForm({
      name: mat.name,
      category: mat.category || OFFICIAL_CATEGORIES[0],
      unit: mat.unit,
      price: mat.price || mat.new_price || 0,
      supplier: mat.supplier || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await api.updateMaterial(id, {
        name: editForm.name,
        category: editForm.category,
        unit: editForm.unit,
        price: parseFloat(editForm.price) || 0,
        supplier: editForm.supplier
      });
      showToast('Bahan berhasil diupdate', 'success');
      setEditingId(null);
      fetchData();
      refreshData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Hapus bahan baku "${name}"? Data yang terhapus tidak bisa dikembalikan.`)) return;
    setSaving(true);
    try {
      await api.deleteMaterial(id);
      showToast('Bahan berhasil dihapus', 'success');
      fetchData();
      refreshData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createMaterial({
        ...newMaterial,
        price: parseFloat(newMaterial.price) || 0
      });
      showToast('Bahan baku baru berhasil ditambahkan', 'success');
      setShowModal(false);
      setNewMaterial({ name: '', category: OFFICIAL_CATEGORIES[0], unit: 'pcs', price: 0, supplier: '', min_stock: 15 });
      fetchData();
      refreshData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[var(--text-primary)]">Big Master DB (Katalog Bahan)</h2>
          <p className="text-sm text-[var(--text-secondary)]">Kelola 128 bahan baku & 9 kategori resmi SO Barista. (Fast-Input CRUD)</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} className="mr-2" /> Tambah Bahan Baru
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input 
            type="text" 
            placeholder="Cari nama bahan atau SKU..." 
            className="form-control pl-9 w-full"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <select className="form-control sm:w-64" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="ALL">Semua Kategori</option>
          {OFFICIAL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="custom-table w-full">
            <thead>
              <tr>
                <th className="w-12 text-center">No</th>
                <th className="w-64">Nama Bahan</th>
                <th className="w-48">Kategori</th>
                <th className="w-32">Satuan</th>
                <th className="w-48">Supplier (Inline Edit)</th>
                <th className="w-48 text-right">Harga (Inline Edit)</th>
                <th className="w-32 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center py-8"><Loader2 className="animate-spin mx-auto text-[var(--text-muted)]" /></td></tr>
              ) : filteredMaterials.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-12 text-[var(--text-muted)]"><Package size={48} className="mx-auto mb-3 opacity-20"/>Tidak ada bahan baku ditemukan</td></tr>
              ) : (
                filteredMaterials.map((mat, idx) => {
                  const isEditing = editingId === mat.id;
                  return (
                    <tr key={mat.id} className="hover:bg-[var(--bg-secondary)]/50">
                      <td className="text-center text-[var(--text-muted)]">{idx + 1}</td>
                      
                      <td>
                        {isEditing ? (
                          <input type="text" className="form-control w-full py-1 text-sm" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                        ) : (
                          <div className="font-semibold">{mat.name}</div>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <select className="form-control w-full py-1 text-sm" value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})}>
                            {OFFICIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <span className="badge badge-secondary text-xs">{mat.category || 'Belum Kategori'}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input type="text" className="form-control w-full py-1 text-sm" value={editForm.unit} onChange={e => setEditForm({...editForm, unit: e.target.value})} />
                        ) : (
                          <span>{mat.unit}</span>
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input type="text" placeholder="Nama Supplier" className="form-control w-full py-1 text-sm border-[var(--accent)]" value={editForm.supplier} onChange={e => setEditForm({...editForm, supplier: e.target.value})} />
                        ) : (
                          <span className="text-[var(--text-secondary)] text-sm">{mat.supplier || '-'}</span>
                        )}
                      </td>

                      <td className="text-right font-mono">
                        {isEditing ? (
                          <input type="number" min="0" className="form-control w-full py-1 text-sm text-right border-[var(--accent)]" value={editForm.price} onChange={e => setEditForm({...editForm, price: e.target.value})} />
                        ) : (
                          <span>Rp {(mat.price || 0).toLocaleString('id-ID')}</span>
                        )}
                      </td>

                      <td>
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(mat.id)} disabled={saving} className="p-1.5 text-emerald-600 bg-emerald-50 rounded hover:bg-emerald-100"><Save size={16}/></button>
                              <button onClick={cancelEdit} disabled={saving} className="p-1.5 text-rose-600 bg-rose-50 rounded hover:bg-rose-100"><X size={16}/></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(mat)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100"><Edit2 size={16}/></button>
                              <button onClick={() => handleDelete(mat.id, mat.name)} className="p-1.5 text-rose-600 bg-rose-50 rounded hover:bg-rose-100"><Trash2 size={16}/></button>
                            </>
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
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-[var(--bg-primary)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
              <h3 className="font-bold text-lg">Tambah Bahan Baku Baru</h3>
              <button type="button" onClick={() => setShowModal(false)}><X size={20}/></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="form-label">Nama Bahan</label>
                <input required type="text" className="form-control w-full" value={newMaterial.name} onChange={e => setNewMaterial({...newMaterial, name: e.target.value})} />
              </div>
              <div>
                <label className="form-label">Kategori Baku</label>
                <select className="form-control w-full" value={newMaterial.category} onChange={e => setNewMaterial({...newMaterial, category: e.target.value})}>
                  {OFFICIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Satuan</label>
                  <input required type="text" className="form-control w-full" value={newMaterial.unit} onChange={e => setNewMaterial({...newMaterial, unit: e.target.value})} />
                </div>
                <div>
                  <label className="form-label">Harga Beli (Rp)</label>
                  <input required type="number" min="0" className="form-control w-full" value={newMaterial.price} onChange={e => setNewMaterial({...newMaterial, price: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="form-label">Nama Supplier</label>
                <input type="text" className="form-control w-full" value={newMaterial.supplier} onChange={e => setNewMaterial({...newMaterial, supplier: e.target.value})} />
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2 bg-[var(--bg-secondary)]">
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
              <button type="submit" disabled={saving} className="btn btn-primary">{saving ? 'Menyimpan...' : 'Simpan Bahan'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
