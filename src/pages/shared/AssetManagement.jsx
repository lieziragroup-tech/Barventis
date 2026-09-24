import { UploadCloud, ClipboardCheck, Plus, CheckCircle, Edit2, Trash2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import BulkImport from '../../components/BulkImport';

export default function AssetManagement() {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState([]);
  const [editingAsset, setEditAsset] = useState(null);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [checklistItems, setChecklistItems] = useState({});
  const [notification, setNotification] = useState(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
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
     
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        supplier: editingAsset.supplier || '-', // using supplier for maintenance notes
        brand: editingAsset.brand || 'Baik', // using brand for condition
        unit: 'pcs',
        full_pack: '1 pcs',
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

  const openChecklistModal = () => {
    const initialChecks = {};
    assets.forEach(a => {
      initialChecks[a.id] = { condition: a.brand || 'Baik', notes: '' };
    });
    setChecklistItems(initialChecks);
    setShowChecklistModal(true);
  };

  const handleSaveChecklist = async () => {
    try {
      for (const assetId in checklistItems) {
        const item = checklistItems[assetId];
        await supabase.from('materials').update({ brand: item.condition }).eq('id', assetId);
      }
      setNotification({ type: 'success', text: 'Checklist kondisi berhasil disimpan.' });
      setShowChecklistModal(false);
       
     
    fetchAssets();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>SO Glass & Tool (Peralatan Bar)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Daftar inventaris & cek fisik kondisi peralatan operasional bar.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>
            <UploadCloud size={16} style={{ marginRight: '8px' }}/> Import Excel
          </button>
          <button className="btn btn-secondary" onClick={openChecklistModal} disabled={loading || assets.length === 0}>
            <ClipboardCheck size={16} style={{ marginRight: '8px' }}/> Checklist Kondisi
          </button>
          <button className="btn btn-primary" onClick={() => setEditAsset({ name: '', supplier: '', brand: 'Baik', price: 0, qty_resto: 0 })}>
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
              <th>Kondisi Saat Ini</th>
              <th>Jadwal Maintenance</th>
              <th style={{ textAlign: 'right' }}>Nilai / Harga</th>
              <th style={{ textAlign: 'center' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>Belum ada data aset.</td></tr>
            ) : (
              assets.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>
                    <span className="badge" style={{
                      backgroundColor: a.brand === 'Baik' ? 'rgba(16, 185, 129, 0.1)' : a.brand === 'Rusak Ringan' ? 'rgba(245, 158, 11, 0.1)' : a.brand === 'Hilang' ? 'rgba(107, 114, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: a.brand === 'Baik' ? 'rgb(16, 185, 129)' : a.brand === 'Rusak Ringan' ? 'rgb(245, 158, 11)' : a.brand === 'Hilang' ? 'rgb(107, 114, 128)' : 'rgb(239, 68, 68)'
                    }}>
                      {a.brand || 'Baik'}
                    </span>
                  </td>
                  <td>{a.supplier || '-'}</td>
                  <td style={{ textAlign: 'right' }}>Rp {(parseFloat(a.new_price) || parseFloat(a.price) || 0).toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn" style={{ padding: '4px', color: 'var(--accent)' }} onClick={() => setEditAsset(a)} title="Edit"><Edit2 size={16}/></button>
                    <button className="btn" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => handleDeleteAsset(a.id)} title="Hapus"><Trash2 size={16}/></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingAsset && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditAsset(null)}>
          <div className="glass-card modal-card" style={{ width: '400px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>{editingAsset.id ? 'Edit' : 'Tambah'} Aset</h3>
            <form onSubmit={handleSaveAsset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group"><label className="form-label">Nama Aset / Peralatan</label><input type="text" required className="form-control" value={editingAsset.name} onChange={e => setEditAsset({...editingAsset, name: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Kondisi</label>
                  <select className="form-control" value={editingAsset.brand || 'Baik'} onChange={e => setEditAsset({...editingAsset, brand: e.target.value})}>
                    <option value="Baik">Baik</option>
                    <option value="Rusak Ringan">Rusak Ringan</option>
                    <option value="Rusak Berat">Rusak Berat</option>
                    <option value="Hilang">Hilang</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Nilai Aset (Rp)</label>
                  <input type="number" required className="form-control" value={editingAsset.price} onChange={e => setEditAsset({...editingAsset, price: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Jadwal / Catatan Maintenance</label>
                <textarea className="form-control" rows="2" placeholder="Cth: Cek filter tiap 3 bulan" value={editingAsset.supplier || ''} onChange={e => setEditAsset({...editingAsset, supplier: e.target.value})}></textarea>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditAsset(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Simpan Aset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChecklistModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Checklist Kondisi Berkala</h3>
              <button className="btn" onClick={() => setShowChecklistModal(false)}><X size={20} /></button>
            </div>
            <table className="custom-table" style={{ marginBottom: '20px' }}>
              <thead>
                <tr>
                  <th>Nama Aset</th>
                  <th style={{ width: '200px' }}>Update Kondisi</th>
                  <th>Catatan (Opsional)</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td>
                      <select
                        className="form-control"
                        value={checklistItems[a.id]?.condition || 'Baik'}
                        onChange={e => setChecklistItems({...checklistItems, [a.id]: {...checklistItems[a.id], condition: e.target.value}})}
                      >
                        <option value="Baik">Baik</option>
                        <option value="Rusak Ringan">Rusak Ringan</option>
                        <option value="Rusak Berat">Rusak Berat</option>
                        <option value="Hilang">Hilang</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Catatan kerusakan..."
                        value={checklistItems[a.id]?.notes || ''}
                        onChange={e => setChecklistItems({...checklistItems, [a.id]: {...checklistItems[a.id], notes: e.target.value}})}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setShowChecklistModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSaveChecklist}>Simpan Checklist</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="assets"
        title="Bulk Import Data Aset"
        description="Upload data aset dari Excel."
        currentData={[]}
        onCommit={async (rows) => {
          const tenantId = await api.getActiveTenantId();
          let success = 0;
          let failed = 0;
          const errors = [];

          const payloads = rows.map(row => {
            const name = row.name || row['NAMA ASET'];
            if (!name) {
              failed++;
              errors.push({ row: 'Baris Kosong', error: 'Nama aset tidak boleh kosong' });
              return null;
            }
            success++;
            return {
              tenant_id: tenantId,
              name: name,
              category: 'ASSET',
              supplier: row['JADWAL MAINTENANCE'] || '-',
              brand: row['KONDISI'] || 'Baik',
              unit: 'pcs',
              full_pack: '1 pcs',
              price: parseFloat(row['NILAI SATUAN']) || 0,
              new_price: parseFloat(row['NILAI SATUAN']) || 0,
              is_active: true
            };
          }).filter(p => p !== null);

          if (payloads.length > 0) {
            try {
              const { error } = await supabase.from('materials').insert(payloads);
              if (error) throw error;
               
     
    fetchAssets();
            } catch (err) {
               failed += payloads.length;
               success -= payloads.length;
               errors.push({ row: 'System', error: err.message });
            }
          }
          return { success, failed, errors };
        }}
        expectedColumns={[
          { key: 'NAMA ASET', label: 'NAMA ASET', required: true, type: 'string', description: 'Nama Aset', sample: 'Mesin Espresso' },
          { key: 'KONDISI', label: 'KONDISI', required: false, type: 'string', description: 'Baik/Rusak Ringan/Rusak Berat', sample: 'Baik' },
          { key: 'NILAI SATUAN', label: 'NILAI SATUAN', required: false, type: 'number', description: 'Harga Aset', sample: 15000000 },
          { key: 'JADWAL MAINTENANCE', label: 'JADWAL MAINTENANCE', required: false, type: 'string', description: 'Catatan jadwal', sample: 'Cek 3 bulan' }
        ]}
      />
    </div>
  );
}
