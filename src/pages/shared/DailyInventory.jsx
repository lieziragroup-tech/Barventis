import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, Calendar, ChevronLeft, ChevronRight, CheckCircle, Database } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function DailyInventory() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('RESTO');
  const [tab, setTab] = useState('BARANG'); // 'BARANG' or 'BEER'
  const [search, setSearch] = useState('');
  
  const [materials, setMaterials] = useState([]);
  const [inventoryId, setInventoryId] = useState(null);
  const [itemsData, setItemsData] = useState({});
  const [notification, setNotification] = useState(null);
  const { activeUser } = useAuth();

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();

      // 1. Fetch materials filtered by tab
      let query = supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true);
      
      const { data: allMats, error: matErr } = await query.order('category').order('name');
      if (matErr) throw matErr;

      let filteredMats = allMats || [];
      if (tab === 'BEER') {
        filteredMats = filteredMats.filter(m => (m.category || '').toLowerCase().includes('beer') || (m.name || '').toLowerCase().includes('bintang') || (m.name || '').toLowerCase().includes('bali hai'));
      } else {
        filteredMats = filteredMats.filter(m => !(m.category || '').toLowerCase().includes('beer') && !(m.name || '').toLowerCase().includes('bintang') && !(m.name || '').toLowerCase().includes('bali hai'));
      }
      setMaterials(filteredMats);

      // 2. Fetch or create inventory record
      const { data: invRecord, error: invErr } = await supabase
        .from('daily_inventories')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', date)
        .eq('location', location)
        .maybeSingle();

      if (invErr) throw invErr;

      let currentInvId = null;
      let existingItems = [];

      if (invRecord) {
        currentInvId = invRecord.id;
        // Fetch items
        const { data: items } = await supabase
          .from('daily_inventory_items')
          .select('*')
          .eq('inventory_id', currentInvId);
        existingItems = items || [];
      }

      // Populate state
      const newItemsData = {};
      
      for (const mat of filteredMats) {
        const existing = existingItems.find(i => i.material_id === mat.id);
        
        let prevFull = 0;
        // If not existing, try to find yesterday's full_qty
        if (!existing && !invRecord) {
          const yesterday = new Date(new Date(date).getTime() - 86400000).toISOString().split('T')[0];
          const { data: prevInv } = await supabase
            .from('daily_inventories')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('date', yesterday)
            .eq('location', location)
            .maybeSingle();

          if (prevInv) {
            const { data: prevItem } = await supabase
              .from('daily_inventory_items')
              .select('full_qty')
              .eq('inventory_id', prevInv.id)
              .eq('material_id', mat.id)
              .maybeSingle();
            if (prevItem) prevFull = prevItem.full_qty;
          } else {
             // Fallback to current system qty
             prevFull = location === 'RESTO' ? parseFloat(mat.qty_resto) : parseFloat(mat.qty_central);
          }
        } else if (existing) {
          prevFull = existing.prev_full_qty;
        } else {
          // Exists record but no item (new material added today)
          prevFull = location === 'RESTO' ? parseFloat(mat.qty_resto) : parseFloat(mat.qty_central);
        }

        newItemsData[mat.id] = {
          id: existing ? existing.id : null,
          prev_full_qty: prevFull,
          in_qty: existing ? existing.in_qty : 0,
          out_qty: existing ? existing.out_qty : 0,
          full_qty: existing ? existing.full_qty : prevFull, // default full to prev full
          broken_qty: existing ? existing.broken_qty : 0,
          waste_qty: existing ? existing.waste_qty : 0,
          notes: existing ? existing.notes : ''
        };
      }

      setInventoryId(currentInvId);
      setItemsData(newItemsData);

    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, location, tab]);

  const handleDateChange = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleInputChange = (matId, field, value) => {
    const num = parseFloat(value);
    setItemsData(prev => ({
      ...prev,
      [matId]: {
        ...prev[matId],
        [field]: isNaN(num) ? value : num // keep string for notes, num for others
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setNotification(null);
    try {
      const tenantId = await api.getActiveTenantId();
      const userId = await api.getActiveUserId();

      let targetInvId = inventoryId;

      // 1. Create inventory record if not exists
      if (!targetInvId) {
        const { data: newInv, error: newInvErr } = await supabase
          .from('daily_inventories')
          .insert({
            tenant_id: tenantId,
            date: date,
            location: location,
            checked_by: userId
          })
          .select()
          .single();

        if (newInvErr) throw newInvErr;
        targetInvId = newInv.id;
        setInventoryId(targetInvId);
      }

      // 2. Prepare items for upsert
      const upsertRows = materials.map(mat => {
        const d = itemsData[mat.id];
        return {
          inventory_id: targetInvId,
          material_id: mat.id,
          in_qty: parseFloat(d.in_qty) || 0,
          out_qty: parseFloat(d.out_qty) || 0,
          full_qty: parseFloat(d.full_qty) || 0,
          broken_qty: parseFloat(d.broken_qty) || 0,
          waste_qty: parseFloat(d.waste_qty) || 0,
          prev_full_qty: parseFloat(d.prev_full_qty) || 0,
          notes: d.notes || ''
        };
      });

      // 3. Upsert items
      for (let i = 0; i < upsertRows.length; i += 500) {
        const { error } = await supabase.from('daily_inventory_items').upsert(upsertRows.slice(i, i + 500), { onConflict: 'inventory_id, material_id' });
        if (error) throw error;
      }

      setNotification({ type: 'success', text: 'Daily inventory saved successfully!' });
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) || 
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = filteredMaterials.reduce((acc, mat) => {
    if (!acc[mat.category]) acc[mat.category] = [];
    acc[mat.category].push(mat);
    return acc;
  }, {});

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Daily Inventory Sheet</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Pencatatan stok harian (In/Out/Full/Waste).</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select className="form-control" style={{ width: '150px' }} value={location} onChange={e => setLocation(e.target.value)}>
            <option value="RESTO">Resto Bar</option>
            <option value="CENTRAL">Central</option>
          </select>
          <button className="btn btn-secondary" onClick={fetchInventory} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {notification && (
        <div style={{
          padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px',
          background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
        }}>
          {notification.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--success)' }} />}
          <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
            <button 
              className={`btn ${tab === 'BARANG' ? 'btn-primary' : ''}`} 
              style={{ padding: '6px 16px', background: tab === 'BARANG' ? '' : 'transparent', color: tab === 'BARANG' ? '' : 'var(--text-secondary)' }}
              onClick={() => setTab('BARANG')}
            >Bahan Baku</button>
            <button 
              className={`btn ${tab === 'BEER' ? 'btn-primary' : ''}`} 
              style={{ padding: '6px 16px', background: tab === 'BEER' ? '' : 'transparent', color: tab === 'BEER' ? '' : 'var(--text-secondary)' }}
              onClick={() => setTab('BEER')}
            >Grup Beer</button>
          </div>

          {/* Date Navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <button className="btn" style={{ padding: '4px' }} onClick={() => handleDateChange(-1)}><ChevronLeft size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Calendar size={16} style={{ color: 'var(--accent)' }}/>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontWeight: 600 }} />
            </div>
            <button className="btn" style={{ padding: '4px' }} onClick={() => handleDateChange(1)}><ChevronRight size={18} /></button>
          </div>

          <div style={{ position: 'relative', width: '250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
            <input 
              type="text" className="form-control" placeholder="Cari item..." 
              style={{ paddingLeft: '36px' }} value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat form inventory...</div>
        ) : (
          <div className="table-container" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="custom-table" style={{ minWidth: '1000px' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: '250px' }}>Nama Item</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Unit</th>
                  <th style={{ width: '100px', textAlign: 'center' }} title="Full (Awal/Kemarin)">FULL(Awl)</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>IN</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>OUT</th>
                  <th style={{ width: '100px', textAlign: 'center' }} title="Full (Sisa Hari Ini)">FULL(Akh)</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>BROKEN</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>WASTE</th>
                  <th style={{ width: '100px', textAlign: 'center' }} title="Terpakai = (FULL_AWAL + IN) - FULL_AKHIR">TERPAKAI</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([category, mats]) => (
                  <React.Fragment key={category}>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan="9" style={{ fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.8rem', padding: '12px' }}>
                        {category}
                      </td>
                    </tr>
                    {mats.map(mat => {
                      const d = itemsData[mat.id] || {};
                      const terpakai = (parseFloat(d.prev_full_qty || 0) + parseFloat(d.in_qty || 0)) - parseFloat(d.full_qty || 0);
                      const unitPrice = parseFloat(mat.new_price ?? mat.price ?? 0);
                      const rp = terpakai * unitPrice;

                      return (
                        <tr key={mat.id}>
                          <td style={{ fontWeight: 600 }}>{mat.name}</td>
                          <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{mat.unit}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                            {parseFloat(d.prev_full_qty || 0).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" step="any" className="form-control" style={{ textAlign: 'center', padding: '4px' }} 
                              value={d.in_qty === 0 ? '' : d.in_qty} onChange={e => handleInputChange(mat.id, 'in_qty', e.target.value)} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" step="any" className="form-control" style={{ textAlign: 'center', padding: '4px' }} 
                              value={d.out_qty === 0 ? '' : d.out_qty} onChange={e => handleInputChange(mat.id, 'out_qty', e.target.value)} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" step="any" className="form-control" style={{ textAlign: 'center', padding: '4px', border: '1px solid var(--accent)' }} 
                              value={d.full_qty === 0 && d.prev_full_qty === 0 ? '' : d.full_qty} onChange={e => handleInputChange(mat.id, 'full_qty', e.target.value)} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" step="any" className="form-control" style={{ textAlign: 'center', padding: '4px', color: 'var(--danger)' }} 
                              value={d.broken_qty === 0 ? '' : d.broken_qty} onChange={e => handleInputChange(mat.id, 'broken_qty', e.target.value)} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" step="any" className="form-control" style={{ textAlign: 'center', padding: '4px', color: 'var(--danger)' }} 
                              value={d.waste_qty === 0 ? '' : d.waste_qty} onChange={e => handleInputChange(mat.id, 'waste_qty', e.target.value)} />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: terpakai > 0 ? 'var(--warning)' : 'var(--text-primary)' }} title={`Rp ${rp.toLocaleString('id-ID')}`}>
                            {terpakai.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
                {filteredMaterials.length === 0 && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>Tidak ada item di kategori ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Checked by: <strong>{activeUser?.name}</strong>
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading || saving}>
            <Database size={16} style={{ marginRight: '8px' }}/> {saving ? 'Menyimpan...' : 'Simpan Pencatatan Harian'}
          </button>
        </div>
      </div>
    </div>
  );
}
