import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, ArrowLeft, ArrowRight, Loader2, ListPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';

export default function Marketlist() {
  const { showToast, stock } = useData();
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);

  // Views: 'list', 'edit-header', 'edit-items'
  const [view, setView] = useState('list');
  const [currentList, setCurrentList] = useState(null);

  // Form state
  const [formData, setFormData] = useState({ name: '', description: '', is_active: true });
  const [itemsData, setItemsData] = useState([]);

  const getTenantId = () => activeUser?.tenant_id || 'UNKNOWN';

  const fetchLists = async () => {
    setLoading(true);
    try {
      const tenantId = getTenantId();
      const { data, error } = await supabase
        .from('market_lists')
        .select('*, market_list_items(*)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLists(data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLists();
  }, []);

  
  const handleSaveHeader = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast('Nama Market List wajib diisi', 'error');

    try {
      setLoading(true);
      const tenantId = getTenantId();
      let saved;

      if (currentList?.id) {
        const { data, error } = await supabase
          .from('market_lists')
          .update(formData)
          .eq('id', currentList.id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        saved = data;
        showToast('Market List diperbarui', 'success');
      } else {
        const { data, error } = await supabase
          .from('market_lists')
          .insert({ ...formData, tenant_id: tenantId })
          .select()
          .single();
        if (error) throw error;
        saved = data;
        showToast('Market List dibuat', 'success');
      }

      setCurrentList(saved);
      // Pre-fill items if editing
      if (saved.id && view === 'edit-header') {
        const fullList = lists.find(l => l.id === saved.id);
        setItemsData(fullList?.market_list_items?.map(item => ({
          material_id: item.material_id,
          par_stock: item.par_stock || 0,
          min_stock: item.min_stock || 0,
          quantity: item.quantity || 0,
          approved_qty: item.approved_qty || 0,
          vendor: item.vendor || '',
          unit: item.unit
        })) || []);
        setView('edit-items');
      }
      await fetchLists();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus Market List ini?')) return;
    try {
      const { error } = await supabase.from('market_lists').delete().eq('id', id);
      if (error) throw error;
      showToast('Market List dihapus', 'success');
      fetchLists();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveItems = async () => {
    try {
      setLoading(true);
      const validItems = itemsData.filter(i => i.material_id).map(i => ({
        market_list_id: currentList.id,
        material_id: i.material_id,
        par_stock: i.par_stock || 0,
        min_stock: i.min_stock || 0,
        quantity: i.quantity || 0,
        approved_qty: i.approved_qty || 0,
        vendor: i.vendor || '',
        unit: i.unit
      }));

      // Delete existing
      await supabase.from('market_list_items').delete().eq('market_list_id', currentList.id);

      // Insert new
      if (validItems.length > 0) {
        const { error } = await supabase.from('market_list_items').insert(validItems);
        if (error) throw error;
      }

      showToast('Item berhasil disimpan', 'success');
      setView('list');
      fetchLists();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItemRow = () => {
    setItemsData([...itemsData, { material_id: '', par_stock: 0, min_stock: 0, quantity: 0, approved_qty: 0, vendor: '', unit: '' }]);
  };

  const updateItemRow = (index, field, value) => {
    const updated = [...itemsData];
    updated[index][field] = value;
    if (field === 'material_id') {
      const mat = stock.find(s => s.id === value);
      if (mat) {
        updated[index].unit = mat.unit || '';
        const parStock = updated[index].par_stock || 0;
        updated[index].quantity = Math.max(0, parStock - (mat.stock || 0));
      }
    }
    setItemsData(updated);
  };

  const removeItemRow = (index) => {
    setItemsData(itemsData.filter((_, i) => i !== index));
  };

  if (loading && view === 'list' && lists.length === 0) {
    return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>;
  }

  return (
    <div className="fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Market Lists</h2>
          <p className="text-muted-foreground text-sm">Kelola daftar belanja rutin untuk outlet/cabang.</p>
        </div>
        {view === 'list' && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setCurrentList(null);
              setFormData({ name: '', description: '', is_active: true });
              setView('edit-header');
            }}
          >
            <Plus size={16} /> Market List Baru
          </button>
        )}
      </div>

      {view === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map(list => (
            <div key={list.id} className="glass-card p-5 relative group">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-lg">{list.name}</h3>
                <div className="flex gap-2">
                  <button onClick={() => {
                    setCurrentList(list);
                    setFormData({ name: list.name, description: list.description || '', is_active: list.is_active });
                    setView('edit-header');
                  }} className="text-muted-foreground hover:text-primary transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(list.id)} className="text-muted-foreground hover:text-danger transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{list.description || 'Tidak ada deskripsi'}</p>
              <div className="flex justify-between items-center text-sm border-t border-border pt-4 mt-2">
                <span className="text-muted-foreground">{list.market_list_items?.length || 0} items</span>
                <button
                  className="text-primary font-medium flex items-center gap-1 hover:underline"
                  onClick={() => {
                    setCurrentList(list);
                    setItemsData(list.market_list_items?.map(item => ({
                      material_id: item.material_id,
                      par_stock: item.par_stock || 0,
                      min_stock: item.min_stock || 0,
                      quantity: item.quantity || 0,
                      approved_qty: item.approved_qty || 0,
                      vendor: item.vendor || '',
                      unit: item.unit
                    })) || []);
                    setView('edit-items');
                  }}
                >
                  Edit Items <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
          {lists.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <ListPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Belum ada Market List</p>
            </div>
          )}
        </div>
      )}

      {view === 'edit-header' && (
        <div className="glass-card p-6 max-w-xl">
          <form onSubmit={handleSaveHeader} className="space-y-4">
            <div className="form-group">
              <label className="form-label">Nama Market List</label>
              <input
                type="text"
                className="form-control"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Deskripsi</label>
              <textarea
                className="form-control"
                rows="3"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setView('list')}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Menyimpan...' : (currentList ? 'Update & Lanjut ke Item' : 'Simpan & Lanjut ke Item')}
              </button>
            </div>
          </form>
        </div>
      )}

      {view === 'edit-items' && (
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-6 border-b border-border pb-4">
            <div>
              <h3 className="text-xl font-bold">{currentList?.name}</h3>
              <p className="text-sm text-muted-foreground">Pilih bahan baku untuk list ini</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setView('list')}><ArrowLeft size={16} /> Kembali</button>
          </div>

          <div className="mb-6 max-h-[500px] overflow-y-auto">
            <table className="custom-table" style={{ width: '100%', minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Bahan Baku</th>
                  <th style={{ padding: '12px', width: '100px' }}>Satuan</th>
                  <th style={{ padding: '12px', width: '100px', textAlign: 'center' }}>Min Stock</th>
                  <th style={{ padding: '12px', width: '100px', textAlign: 'center' }}>Par Stock</th>
                  <th style={{ padding: '12px', width: '100px', textAlign: 'center' }}>Req Qty</th>
                  <th style={{ padding: '12px', width: '100px', textAlign: 'center' }}>Apprv Qty</th>
                  <th style={{ padding: '12px', width: '150px' }}>Vendor</th>
                  <th style={{ padding: '12px', width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {itemsData.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '8px' }}>
                      <select
                        className="form-control"
                        style={{ width: '100%', padding: '6px' }}
                        value={item.material_id}
                        onChange={e => updateItemRow(idx, 'material_id', e.target.value)}
                      >
                        <option value="">-- Pilih Bahan --</option>
                        {stock.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input type="text" className="form-control" style={{ width: '100%', padding: '6px', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }} value={item.unit} readOnly />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ width: '100%', padding: '6px', textAlign: 'center' }}
                        value={item.min_stock || ''}
                        onChange={e => updateItemRow(idx, 'min_stock', parseFloat(e.target.value) || 0)}
                        min="0" step="any"
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ width: '100%', padding: '6px', textAlign: 'center' }}
                        value={item.par_stock || ''}
                        onChange={e => {
                          const parStock = parseFloat(e.target.value) || 0;
                          const currentStock = stock.find(s => s.id === item.material_id)?.stock || 0;
                          const reqQty = Math.max(0, parStock - currentStock);
                          updateItemRow(idx, 'par_stock', parStock);
                          updateItemRow(idx, 'quantity', reqQty);
                        }}
                        min="0" step="any"
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ width: '100%', padding: '6px', textAlign: 'center', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                        value={item.quantity}
                        onChange={e => updateItemRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        min="0" step="any"
                        readOnly
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ width: '100%', padding: '6px', textAlign: 'center' }}
                        value={item.approved_qty || ''}
                        onChange={e => updateItemRow(idx, 'approved_qty', parseFloat(e.target.value) || 0)}
                        min="0" step="any"
                      />
                    </td>
                    <td style={{ padding: '8px' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ width: '100%', padding: '6px' }}
                        value={item.vendor || ''}
                        onChange={e => updateItemRow(idx, 'vendor', e.target.value)}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary h-8 w-8 p-0 flex items-center justify-center hover:bg-danger/10 hover:text-danger hover:border-danger/30 mx-auto"
                        onClick={() => removeItemRow(idx)}
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan="8" style={{ padding: '8px' }}>
                    <button
                      className="w-full py-3 border border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors flex justify-center items-center gap-2 text-sm"
                      onClick={handleAddItemRow}
                    >
                      <Plus size={14} /> Tambah Item Baru
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button className="btn btn-secondary" onClick={() => setView('list')}>Batal</button>
            <button className="btn btn-primary" onClick={handleSaveItems} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
              Simpan {itemsData.length} Items
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
