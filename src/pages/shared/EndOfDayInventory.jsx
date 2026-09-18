import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

export default function EndOfDayInventory() {
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchData();
  }, [date]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Get items
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .order('name');

      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      // 2. Get today's existing inventory
      const { data: todayInv, error: invError } = await supabase
        .from('daily_inventory')
        .select('*')
        .eq('date', date);

      if (invError) throw invError;

      const invMap = {};
      (todayInv || []).forEach(row => {
        invMap[row.item_id] = {
          stok_awal: row.stok_awal,
          qty_in: row.qty_in,
          qty_out: row.qty_out,
          waste: row.waste,
          broken: row.broken,
          full_qty: row.full_qty
        };
      });
      setInventory(invMap);

    } catch (err) {
      console.error(err);
      setError('Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (itemId, field, value) => {
    setInventory(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { stok_awal: 0, qty_in: 0, qty_out: 0, waste: 0, broken: 0, full_qty: 0 }),
        [field]: value === '' ? '' : parseInt(value, 10) || 0
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const upserts = items.map(item => {
        const row = inventory[item.id] || {};
        const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? row.stok_awal : (item.stock || 0);
        const qtyIn = row.qty_in || 0;
        const qtyOut = row.qty_out || 0;
        const waste = row.waste || 0;
        const fullQty = row.full_qty || 0;
        const broken = row.broken || 0;

        const stokAkhir = fullQty + broken;
        const qtyTerpakai = (stokAwal + qtyIn) - (stokAkhir + waste);
        const hpp = item.hpp || 0;
        const nilaiRupiah = qtyTerpakai * hpp;

        return {
          item_id: item.id,
          date: date,
          stok_awal: stokAwal,
          qty_in: qtyIn,
          qty_out: qtyOut,
          waste: waste,
          broken: broken,
          full_qty: fullQty,
          stok_akhir: stokAkhir,
          qty_terpakai: qtyTerpakai,
          nilai_rupiah: nilaiRupiah
        };
      });

      if (upserts.length === 0) return;

      const { error } = await supabase
        .from('daily_inventory')
        .upsert(upserts, { onConflict: 'date, item_id' });

      if (error) throw error;
      setSuccess('Berhasil menyimpan stok harian.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <label style={{ fontWeight: 600 }}>Tanggal:</label>
          <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" style={{ marginRight: '6px' }} /> Menyimpan...
            </>
          ) : (
            <>
              <Save size={16} style={{ marginRight: '6px' }} /> Simpan Semua
            </>
          )}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
          {success}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Memuat...</div>
      ) : (
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px' }}>Barang</th>
                <th style={{ padding: '12px', width: '90px' }}>Stok Awal</th>
                <th style={{ padding: '12px', width: '90px' }}>IN</th>
                <th style={{ padding: '12px', width: '90px' }}>OUT</th>
                <th style={{ padding: '12px', width: '90px' }}>WASTE</th>
                <th style={{ padding: '12px', width: '90px' }}>FULL</th>
                <th style={{ padding: '12px', width: '90px' }}>BROKEN</th>
                <th style={{ padding: '12px', width: '90px' }}>Stok Akhir</th>
                <th style={{ padding: '12px', width: '90px' }}>Terpakai</th>
                <th style={{ padding: '12px', width: '120px' }}>Nilai (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const row = inventory[item.id] || {};
                const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? row.stok_awal : (item.stock || 0);
                const qtyIn = row.qty_in || 0;
                const qtyOut = row.qty_out || 0;
                const waste = row.waste || 0;
                const fullQty = row.full_qty || 0;
                const broken = row.broken || 0;

                const stokAkhir = fullQty + broken;
                const qtyTerpakai = (stokAwal + qtyIn) - (stokAkhir + waste);
                const hpp = item.hpp || 0;
                const nilaiRupiah = qtyTerpakai * hpp;

                return (
                  <tr key={item.id}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>HPP: Rp {hpp.toLocaleString('id-ID')}</div>
                    </td>
                    <td style={{ padding: '8px' }}><input type="number" min="0" className="form-control" style={{ width: '100%', padding: '6px' }} value={row.stok_awal ?? item.stock ?? ''} onChange={e => handleChange(item.id, 'stok_awal', e.target.value)} /></td>
                    <td style={{ padding: '8px' }}><input type="number" min="0" className="form-control" style={{ width: '100%', padding: '6px' }} value={row.qty_in ?? ''} onChange={e => handleChange(item.id, 'qty_in', e.target.value)} /></td>
                    <td style={{ padding: '8px' }}><input type="number" min="0" className="form-control" style={{ width: '100%', padding: '6px' }} value={row.qty_out ?? ''} onChange={e => handleChange(item.id, 'qty_out', e.target.value)} /></td>
                    <td style={{ padding: '8px' }}><input type="number" min="0" className="form-control" style={{ width: '100%', padding: '6px' }} value={row.waste ?? ''} onChange={e => handleChange(item.id, 'waste', e.target.value)} /></td>
                    <td style={{ padding: '8px' }}><input type="number" min="0" className="form-control" style={{ width: '100%', padding: '6px' }} value={row.full_qty ?? ''} onChange={e => handleChange(item.id, 'full_qty', e.target.value)} /></td>
                    <td style={{ padding: '8px' }}><input type="number" min="0" className="form-control" style={{ width: '100%', padding: '6px' }} value={row.broken ?? ''} onChange={e => handleChange(item.id, 'broken', e.target.value)} /></td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>{stokAkhir}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: qtyTerpakai < 0 ? '#ef4444' : 'inherit' }}>{qtyTerpakai}</td>
                    <td style={{ padding: '12px', fontWeight: 600 }}>Rp {nilaiRupiah.toLocaleString('id-ID')}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: '#6b7280' }}>
                    Tidak ada barang.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
