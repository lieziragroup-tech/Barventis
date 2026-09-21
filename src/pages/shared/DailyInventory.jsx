import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, FileText, PlusCircle, Save, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function DailyInventory() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('REKAP');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  // REKAP state
  const [records, setRecords] = useState([]);

  // EOD state
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('daily_inventory')
        .select(`*, items (name, hpp, type, item_code)`)
        .eq('date', date)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setRecords(data || []);
      setIsLocked(data?.some(d => d.is_locked) || false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const fetchEodData = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .order('name');
      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      const { data: todayInv, error: invError } = await supabase
        .from('daily_inventory')
        .select('*')
        .eq('date', date);
      if (invError) throw invError;

      const invMap = {};
      let locked = false;
      (todayInv || []).forEach(row => {
        if (row.is_locked) locked = true;
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
      setIsLocked(locked);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (activeTab === 'REKAP') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRecords();
    } else {
       
      fetchEodData();
    }
  }, [activeTab, fetchRecords, fetchEodData]);

  
  const handleChange = (itemId, field, value) => {
    if (isLocked) return;
    setInventory(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { stok_awal: 0, qty_in: 0, qty_out: 0, waste: 0, broken: 0, full_qty: 0 }),
        [field]: value === '' ? '' : parseInt(value, 10) || 0
      }
    }));
  };

  const handleKeyDown = (e, rowIndex, colIndex, fieldName) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = document.querySelector(`input[data-row="${rowIndex + 1}"][data-col="${colIndex}"]`);
      if (nextInput) nextInput.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = document.querySelector(`input[data-row="${rowIndex - 1}"][data-col="${colIndex}"]`);
      if (prevInput) prevInput.focus();
    }
  };

  const performSave = async () => {
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
  };

  const handleSave = async () => {
    if (isLocked) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await performSave();
      setSuccess('Berhasil menyimpan stok harian.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const submitEODSettlement = async () => {
    if (isLocked) return;
    const confirm = window.confirm(
      "Apakah Anda yakin ingin melakukan Closing EOD? Data per 23:59:59 akan dikunci dan disalin ke saldo esok hari."
    );
    if (!confirm) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await performSave();

      const { error } = await supabase.rpc('close_daily_inventory_eod', {
        p_date: date,
        p_user_id: user?.id
      });

      if (error) throw error;

      alert(`Sukses! Data EOD berhasil dikunci.`);
      setIsLocked(true);
      setSuccess('Closing EOD berhasil.');
    } catch (err) {
      setError("Gagal closing EOD: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in space-y-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            Daily Inventory
            {isLocked && <span style={{ marginLeft: '12px', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>TERKUNCI (EOD CLOSED)</span>}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '4px' }}>Rekapitulasi stok akhir hari dan nilai terpakai</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'REKAP' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setActiveTab('REKAP')}
          >
            <FileText size={16} />
            Rekap Harian
          </button>
          <button
            className={`btn ${activeTab === 'EOD' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setActiveTab('EOD')}
          >
            <PlusCircle size={16} />
            Form Input EOD
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <label style={{ fontWeight: 600 }}>Filter Tanggal:</label>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto' }}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {activeTab === 'EOD' && !isLocked && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={handleSave}
                disabled={saving || loading}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Simpan Draft
              </button>
              <button
                className="btn"
                style={{ background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={submitEODSettlement}
                disabled={saving || loading}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                Kunci & Closing EOD
              </button>
            </div>
          )}
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
            {activeTab === 'REKAP' ? (
              <>
                <table className="custom-table hidden md:table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Barang</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Stok Awal</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>IN</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>OUT</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>WASTE</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>FULL</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>BROKEN</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Stok Akhir</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>Terpakai</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Nilai (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(row => (
                      <tr key={row.id}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600 }}>{row.items?.name || 'Item Terhapus'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            HPP: Rp {(row.items?.hpp || 0).toLocaleString('id-ID')}
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{row.stok_awal}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{row.qty_in}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{row.qty_out}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{row.waste}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{row.full_qty}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{row.broken}</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>{row.stok_akhir}</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: row.qty_terpakai < 0 ? '#ef4444' : 'inherit' }}>
                          {row.qty_terpakai}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                          Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    ))}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                          <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                          <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada data rekap untuk tanggal ini</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* MOBILE CARD LIST REKAP */}
                <div className="md:hidden flex flex-col gap-3 p-2">
                  {records.map(row => (
                    <div key={row.id} className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border)] shadow-sm flex flex-col gap-3 relative overflow-hidden">
                      <div className="flex justify-between items-start border-b border-[var(--border)] pb-2">
                        <div>
                          <div className="font-bold text-[var(--text-primary)] text-base">{row.items?.name || 'Item Terhapus'}</div>
                          <div className="text-xs text-[var(--text-secondary)] mt-0.5">HPP: Rp {(row.items?.hpp || 0).toLocaleString('id-ID')}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-[var(--text-secondary)] mb-1">Nilai Terpakai</div>
                          <div className="font-bold text-[var(--accent)]">Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="bg-blue-500/10 p-2 rounded-lg">
                          <div className="text-blue-500 font-bold">{row.stok_awal}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-1">AWAL</div>
                        </div>
                        <div className="bg-emerald-500/10 p-2 rounded-lg">
                          <div className="text-emerald-500 font-bold">+{row.qty_in}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-1">IN</div>
                        </div>
                        <div className="bg-orange-500/10 p-2 rounded-lg">
                          <div className="text-orange-500 font-bold">-{row.qty_out}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-1">OUT</div>
                        </div>
                        <div className="bg-red-500/10 p-2 rounded-lg">
                          <div className="text-red-500 font-bold">-{row.waste}</div>
                          <div className="text-[10px] text-[var(--text-muted)] mt-1">WASTE</div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center mt-1 bg-[var(--bg-secondary)] p-2 rounded-lg">
                        <div className="flex gap-4">
                          <div><span className="text-[10px] text-[var(--text-muted)]">FULL:</span> <span className="font-semibold text-sm">{row.full_qty}</span></div>
                          <div><span className="text-[10px] text-[var(--text-muted)]">BRK:</span> <span className="font-semibold text-sm">{row.broken}</span></div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-[var(--text-muted)]">Terpakai</div>
                          <div className={`font-bold text-sm ${row.qty_terpakai < 0 ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{row.qty_terpakai}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {records.length === 0 && (
                    <div className="text-center p-6 text-[var(--text-muted)] text-sm flex flex-col items-center">
                      <Calendar size={36} className="mb-2 opacity-30" />
                      Belum ada catatan hari ini
                    </div>
                  )}
                </div>
              </>
            ) : (
              <table className="custom-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Barang</th>
                    <th style={{ padding: '12px', width: '90px' }}>Stok Awal</th>
                    <th style={{ padding: '12px', width: '90px' }}>IN</th>
                    <th style={{ padding: '12px', width: '90px' }}>OUT</th>
                    <th style={{ padding: '12px', width: '90px', background: 'rgba(239,68,68,0.05)' }}>WASTE</th>
                    <th style={{ padding: '12px', width: '90px', background: 'rgba(245,158,11,0.05)' }}>FULL</th>
                    <th style={{ padding: '12px', width: '90px', background: 'rgba(245,158,11,0.05)' }}>BROKEN</th>
                    <th style={{ padding: '12px', width: '90px', background: 'rgba(16,185,129,0.05)' }}>Stok Akhir</th>
                    <th style={{ padding: '12px', width: '90px', background: 'rgba(139,92,246,0.05)' }}>Terpakai</th>
                    <th style={{ padding: '12px', width: '120px', textAlign: 'right' }}>Nilai (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const row = inventory[item.id] || {};
                    const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? row.stok_awal : (item.stock || 0);
                    const qtyIn = row.qty_in || 0;
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
                        <td style={{ padding: '8px' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center' }} value={row.stok_awal ?? item.stock ?? ''} onChange={e => handleChange(item.id, 'stok_awal', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 1, 'stok_awal')} data-row={idx} data-col={1} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center' }} value={row.qty_in ?? ''} onChange={e => handleChange(item.id, 'qty_in', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 2, 'qty_in')} data-row={idx} data-col={2} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center' }} value={row.qty_out ?? ''} onChange={e => handleChange(item.id, 'qty_out', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 3, 'qty_out')} data-row={idx} data-col={3} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(239,68,68,0.05)' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center', color: '#dc2626' }} value={row.waste ?? ''} onChange={e => handleChange(item.id, 'waste', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 4, 'waste')} data-row={idx} data-col={4} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center', fontWeight: 600 }} value={row.full_qty ?? ''} onChange={e => handleChange(item.id, 'full_qty', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 5, 'full_qty')} data-row={idx} data-col={5} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center', fontWeight: 600 }} value={row.broken ?? ''} onChange={e => handleChange(item.id, 'broken', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 6, 'broken')} data-row={idx} data-col={6} />
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, background: 'rgba(16,185,129,0.05)', color: '#047857' }}>
                          {stokAkhir}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, background: 'rgba(139,92,246,0.05)', color: qtyTerpakai < 0 ? '#ef4444' : '#6d28d9' }}>
                          {qtyTerpakai}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                          Rp {nilaiRupiah.toLocaleString('id-ID')}
                        </td>
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
