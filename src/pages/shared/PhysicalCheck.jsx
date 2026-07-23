import { useState, useEffect } from 'react';
import { RefreshCw, Search, ShieldAlert, CheckCircle, Database } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';

export default function PhysicalCheck() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expectedUsages, setExpectedUsages] = useState([]);
  const [physicalCounts, setPhysicalCounts] = useState({});
  const [wasteCauses, setWasteCauses] = useState({});
  const [period, setPeriod] = useState(null);
  const [search, setSearch] = useState('');
  const [notification, setNotification] = useState(null);

  const fetchExpectedUsage = async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
      
      // Get the latest week_start from expected_usage
      const { data: latestWeeks } = await supabase
        .from('expected_usage')
        .select('week_start, week_end')
        .eq('tenant_id', tenantId)
        .order('week_start', { ascending: false })
        .limit(1);

      if (!latestWeeks || latestWeeks.length === 0) {
        setExpectedUsages([]);
        setLoading(false);
        return;
      }

      const latestStart = latestWeeks[0].week_start;
      const latestEnd = latestWeeks[0].week_end;
      setPeriod({ start: latestStart, end: latestEnd });

      // Check if a physical check already exists for this week
      const { data: existingCheck } = await supabase
        .from('physical_checks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('week_start', latestStart)
        .maybeSingle();

      if (existingCheck) {
        setNotification({ type: 'warning', text: 'Cek fisik untuk periode ini sudah diselesaikan sebelumnya.' });
      }

      // Fetch materials and their expected usage for the latest week
      const { data: usages, error } = await supabase
        .from('expected_usage')
        .select('id, expected_qty, total_sold, material_id, materials(name, qty_resto, unit, price, new_price)')
        .eq('tenant_id', tenantId)
        .eq('week_start', latestStart);

      if (error) throw error;

      // Initialize state for physical counts
      const counts = {};
      const causes = {};
      usages.forEach(u => {
        counts[u.material_id] = u.materials ? parseFloat(u.materials.qty_resto || 0) : 0; // Default to current stock
        causes[u.material_id] = '';
      });

      setExpectedUsages(usages || []);
      setPhysicalCounts(counts);
      setWasteCauses(causes);
      
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: 'Gagal memuat data expected usage: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchExpectedUsage();
  }, []);

  const handleCountChange = (materialId, value) => {
    setPhysicalCounts(prev => ({
      ...prev,
      [materialId]: parseFloat(value) || 0
    }));
  };

  const handleCauseChange = (materialId, cause) => {
    setWasteCauses(prev => ({
      ...prev,
      [materialId]: cause
    }));
  };

  const calculateVariance = (materialId) => {
    const usage = expectedUsages.find(u => u.material_id === materialId);
    if (!usage || !usage.materials) return 0;
    
    const currentSystem = parseFloat(usage.materials.qty_resto || 0); // Already deducted by POS sync
    const physical = physicalCounts[materialId] || 0;
    
    // Variance = physical - system
    return physical - currentSystem;
  };

  const handleSubmit = async () => {
    if (!period) return;
    setSubmitting(true);
    setNotification(null);
    try {
      const tenantId = await api.getActiveTenantId();
      const userId = await api.getActiveUserId();

      // Check existing again just in case
      const { data: existingCheck } = await supabase
        .from('physical_checks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('week_start', period.start)
        .maybeSingle();

      if (existingCheck) {
        throw new Error('Cek fisik untuk periode ini sudah pernah disubmit.');
      }

      // 1. Create physical check record
      const { data: checkRecord, error: checkErr } = await supabase
        .from('physical_checks')
        .insert({
          tenant_id: tenantId,
          week_start: period.start,
          week_end: period.end,
          input_by: userId
        })
        .select()
        .single();

      if (checkErr) throw checkErr;

      // 2. Prepare items & adjustments
      const itemsToInsert = [];
      const txRows = [];
      
      for (const usage of expectedUsages) {
        if (!usage.materials) continue;
        const matId = usage.material_id;
        const physical = physicalCounts[matId];
        const variance = calculateVariance(matId);
        const cause = wasteCauses[matId] || '';
          const systemQty = parseFloat(usage.materials.qty_resto || 0);
          
          itemsToInsert.push({
            check_id: checkRecord.id,
            material_id: matId,
            opening_qty: systemQty + parseFloat(usage.expected_qty),
            purchase_qty: 0, // Simplified for MVP
            expected_usage: usage.expected_qty,
            physical_qty: physical,
            variance: variance,
            waste_cause: variance < 0 ? cause : null
          });

        // If there's a variance, create an adjustment
        if (Math.abs(variance) > 0.001) {
          // Adjust material stock
          await supabase.rpc('deduct_stock_atomic', {
            p_material_id: matId,
            p_deduct_qty: -variance // negative deduct = add stock
          });

          // Create transaction
          const price = parseFloat(usage.materials.new_price ?? usage.materials.price ?? 0);
          
          let txType = 'OPNAME_ADJ';
          if (variance < 0) {
            txType = cause === 'BREAKAGE' ? 'BREAKAGE' : 
                     cause === 'EXPIRED' ? 'EXPIRED' : 
                     cause === 'COMP' ? 'COMP' : 'WASTE';
          }

          txRows.push({
            tenant_id: tenantId,
            date: new Date().toISOString().split('T')[0],
            material_id: matId,
            type: txType,
            location: 'RESTO',
            qty: variance, // Negative means stock went down
            amount: variance * price,
            notes: `Cek Fisik Mingguan (${period.start}): Variance ${variance}`,
            created_by: userId
          });
        }
      }

      if (itemsToInsert.length > 0) {
        await supabase.from('physical_check_items').insert(itemsToInsert);
      }

      if (txRows.length > 0) {
        // Insert chunks
        for (let i = 0; i < txRows.length; i += 500) {
          await supabase.from('transactions').insert(txRows.slice(i, i + 500));
        }
      }

      setNotification({ type: 'success', text: 'Cek fisik berhasil disubmit dan stok telah disesuaikan.' });
      
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsages = expectedUsages.filter(u => 
    (u.materials?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Cek Fisik & Waste</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Bandingkan pemakaian sistem (POS) dengan stok fisik aktual.</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchExpectedUsage} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {notification && (
        <div style={{
          padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px',
          background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : notification.type === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : notification.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`
        }}>
          {notification.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--success)' }} />}
          {notification.type === 'warning' && <ShieldAlert size={18} style={{ color: 'var(--warning)' }} />}
          {notification.type === 'error' && <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />}
          <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      {period ? (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Database size={20} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600 }}>Periode POS Terakhir: {period.start} s.d {period.end}</span>
          </div>

          <div style={{ marginBottom: '16px', position: 'relative', maxWidth: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="form-control" 
              placeholder="Cari bahan..." 
              style={{ paddingLeft: '36px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="table-container" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Nama Bahan</th>
                  <th style={{ textAlign: 'center' }}>Expected (Sistem)</th>
                  <th style={{ textAlign: 'center' }}>Pemakaian POS</th>
                  <th style={{ textAlign: 'center' }}>Stok Fisik Aktual</th>
                  <th style={{ textAlign: 'center' }}>Variance</th>
                  <th>Keterangan Waste (Jika Minus)</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsages.length > 0 ? filteredUsages.map(u => {
                  const variance = calculateVariance(u.material_id);
                  const isNegative = variance < -0.001;
                  return (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.materials?.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        {(parseFloat(u.materials?.qty_resto || 0)).toFixed(2)} {u.materials?.unit}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--warning)' }}>
                        -{parseFloat(u.expected_qty).toFixed(2)} {u.materials?.unit}
                      </td>
                      <td style={{ textAlign: 'center', width: '150px' }}>
                        <input 
                          type="number" 
                          step="any"
                          className="form-control" 
                          style={{ textAlign: 'center', padding: '6px' }}
                          value={physicalCounts[u.material_id] === 0 ? '' : physicalCounts[u.material_id]}
                          onChange={(e) => handleCountChange(u.material_id, e.target.value)}
                        />
                      </td>
                      <td style={{ 
                        textAlign: 'center', 
                        fontWeight: 700, 
                        color: isNegative ? 'var(--danger)' : variance > 0.001 ? 'var(--success)' : 'var(--text-muted)'
                      }}>
                        {variance > 0 ? '+' : ''}{variance.toFixed(2)}
                      </td>
                      <td>
                        {isNegative && (
                          <select 
                            className="form-control" 
                            style={{ padding: '6px', fontSize: '0.8rem' }}
                            value={wasteCauses[u.material_id]}
                            onChange={(e) => handleCauseChange(u.material_id, e.target.value)}
                          >
                            <option value="">Pilih Alasan...</option>
                            <option value="WASTE">Basi / Buang</option>
                            <option value="BREAKAGE">Pecah / Tumpah</option>
                            <option value="EXPIRED">Kedaluwarsa</option>
                            <option value="COMP">Staff Meal / Tester</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Tidak ada data expected usage untuk periode ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSubmit} 
              disabled={submitting || expectedUsages.length === 0}
            >
              {submitting ? 'Menyimpan...' : 'Submit Physical Check'}
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {loading ? 'Memuat data...' : 'Silakan upload data POS terlebih dahulu untuk menghasilkan expected usage.'}
        </div>
      )}
    </div>
  );
}
