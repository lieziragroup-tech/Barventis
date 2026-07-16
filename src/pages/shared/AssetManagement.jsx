import React, { useState, useEffect } from 'react';
import { Plus, Edit2, CheckCircle, Database, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';

export default function AssetManagement() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [editingAsset, setEditAsset] = useState(null);
  const [showOpnameModal, setShowOpnameModal] = useState(false);
  const [opnameItems, setOpnameItems] = useState({});
  const [notification, setNotification] = useState(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
      // Use materials table but categorized as ASSET
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('category', 'ASSET')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAssets(data || []);
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const handleSaveAsset = async (e) => {
    e.preventDefault();
    try {
      const tenantId = await api.getActiveTenantId();
      const payload = {
        tenant_id: tenantId,
        name: editingAsset.name,
        category: 'ASSET',
        supplier: editingAsset.supplier || '-',
        unit: 'pcs',
        full_pack: editingAsset.full_pack || '1 pcs',
        price: parseFloat(editingAsset.price) || 0,
        new_price: parseFloat(editingAsset.price) || 0,
        qty_resto: parseFloat(editingAsset.qty_resto) || 0,
        qty_central: parseFloat(editingAsset.qty_central) || 0,
        min_stock: parseFloat(editingAsset.min_stock) || 0,
        is_active: true
      };

      if (editingAsset.id) {
        await supabase.from('materials').update(payload).eq('id', editingAsset.id);
      } else {
        await supabase.from('materials').insert(payload);
      }
      setEditAsset(null);
      setNotification({ type: 'success', text: 'Aset berhasil disimpan.' });
      fetchAssets();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  const handleDeleteAsset = async (id) => {
    if (!confirm('Apakah Anda yakin ingin menghapus aset ini?')) return;
    try {
      await supabase.from('materials').update({ is_active: false }).eq('id', id);
      setNotification({ type: 'success', text: 'Aset berhasil dihapus.' });
      fetchAssets();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  const openOpnameModal = () => {
    const initialCounts = {};
    assets.forEach(a => {
      initialCounts[a.id] = { physical_qty: a.qty_resto + a.qty_central, notes: '' };
    });
    setOpnameItems(initialCounts);
    setShowOpnameModal(true);
  };

  const handleSaveOpname = async () => {
    try {
      const tenantId = await api.getActiveTenantId();
      const userId = await api.getActiveUserId();

      const txRows = [];
      const opnameRecords = [];
      
      // We will perform a simplified stock adjustment for assets
      for (const asset of assets) {
        const physical = parseFloat(opnameItems[asset.id].physical_qty || 0);
        const system = parseFloat(asset.qty_resto || 0) + parseFloat(asset.qty_central || 0);
        const variance = physical - system;

        if (Math.abs(variance) > 0) {
          // Adjust stock (we'll just use resto to represent global asset count for simplicity in MVP)
          await supabase.rpc('deduct_stock_atomic', {
            p_material_id: asset.id,
            p_deduct_qty: -variance
          });

          txRows.push({
            tenant_id: tenantId,
            date: new Date().toISOString().split('T')[0],
            material_id: asset.id,
            type: variance < 0 ? 'BREAKAGE' : 'IN',
            location: 'RESTO',
            qty: variance,
            amount: variance * parseFloat(asset.new_price || 0),
            notes: 'Asset Opname: ' + opnameItems[asset.id].notes,
            created_by: userId
          });
        }
      }

      if (txRows.length > 0) {
        await supabase.from('transactions').insert(txRows);
      }

      setShowOpnameModal(false);
      setNotification({ type: 'success', text: 'Opname aset berhasil diselesaikan.' });
      fetchAssets();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Asset Management</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Kelola aset restoran (mesin, gelas, tools) dan opname kerusakan.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={openOpnameModal} disabled={loading || assets.length === 0}>
            <Database size={16} style={{ marginRight: '8px' }}/> Stock Opname Aset
          </button>
          <button className="btn btn-primary" onClick={() => setEditAsset({ name: '', supplier: '', full_pack: '1 pcs', price: 0, qty_resto: 0, qty_central: 0, min_stock: 0 })}>
            <Plus size={16} style={{ marginRight: '8px' }}/> Tambah Aset
          </button>
        </div>
      </div>

      {notification && (
        <div style={{ padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          {notification.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--success)', display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />}
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th>Nama Aset</th>
              <th>Kategori (Sub)</th>
              <th style={{ textAlign: 'right' }}>Nilai Satuan</th>
              <th style={{ textAlign: 'right' }}>Stok Fisik</th>
              <th style={{ textAlign: 'right' }}>Total Valuasi</th>
              <th style={{ textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {assets.map(a => {
              const totalQty = parseFloat(a.qty_resto || 0) + parseFloat(a.qty_central || 0);
              const val = totalQty * parseFloat(a.new_price || 0);
              return (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>{a.supplier}</td> {/* using supplier field for sub-category/group */}
                  <td style={{ textAlign: 'right' }}>Rp {parseFloat(a.new_price || 0).toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: totalQty < a.min_stock ? 'var(--warning)' : '' }}>{totalQty} {a.unit}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {val.toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn" style={{ padding: '4px', color: 'var(--accent)' }} onClick={() => setEditAsset(a)}><Edit2 size={16}/></button>
                    <button className="btn" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => handleDeleteAsset(a.id)}><Trash2 size={16}/></button>
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Belum ada data aset.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Asset Form Modal */}
      {editingAsset && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '400px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>{editingAsset.id ? 'Edit' : 'Tambah'} Aset</h3>
            <form onSubmit={handleSaveAsset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group"><label className="form-label">Nama Aset / Peralatan</label><input type="text" required className="form-control" value={editingAsset.name} onChange={e => setEditAsset({...editingAsset, name: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Grup (Gelas, Tool, Mesin)</label><input type="text" className="form-control" value={editingAsset.supplier} onChange={e => setEditAsset({...editingAsset, supplier: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Harga Pembelian (IDR)</label><input type="number" required className="form-control" value={editingAsset.price} onChange={e => setEditAsset({...editingAsset, price: e.target.value})} /></div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="form-group"><label className="form-label">Stok Resto</label><input type="number" className="form-control" value={editingAsset.qty_resto} onChange={e => setEditAsset({...editingAsset, qty_resto: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Stok Central</label><input type="number" className="form-control" value={editingAsset.qty_central} onChange={e => setEditAsset({...editingAsset, qty_central: e.target.value})} /></div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditAsset(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Opname Modal */}
      {showOpnameModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '800px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Stock Opname Aset</h3>
              <button className="btn" onClick={() => setShowOpnameModal(false)}><X size={20} /></button>
            </div>
            <table className="custom-table" style={{ marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th>Nama Aset</th>
                  <th style={{ textAlign: 'center' }}>Sistem Qty</th>
                  <th style={{ textAlign: 'center' }}>Fisik Qty</th>
                  <th>Keterangan Rusak/Hilang</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => {
                  const systemQty = parseFloat(a.qty_resto || 0) + parseFloat(a.qty_central || 0);
                  const physQty = opnameItems[a.id]?.physical_qty || 0;
                  const isDiff = physQty !== systemQty;
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td style={{ textAlign: 'center' }}>{systemQty}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="number" className="form-control" style={{ textAlign: 'center', width: '80px', color: isDiff ? 'var(--warning)' : 'inherit', fontWeight: isDiff ? 700 : 400 }} value={physQty} onChange={e => setOpnameItems(prev => ({ ...prev, [a.id]: { ...prev[a.id], physical_qty: e.target.value } }))} />
                      </td>
                      <td>
                        <input type="text" className="form-control" placeholder="Opsional..." value={opnameItems[a.id]?.notes || ''} onChange={e => setOpnameItems(prev => ({ ...prev, [a.id]: { ...prev[a.id], notes: e.target.value } }))} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowOpnameModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveOpname}>Submit Opname Aset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
