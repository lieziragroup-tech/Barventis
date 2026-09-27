import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Coffee, PlusCircle, CheckCircle2 } from 'lucide-react';

export default function GrinderCalibration() {
  const { activeUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [doseIn, setDoseIn] = useState('');
  const [yieldOut, setYieldOut] = useState('');
  
  const tenantId = activeUser?.tenant_id;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', 'CALIBRATION')
      .order('date', { ascending: false })
      .limit(50);
    setLogs(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) fetchLogs();
  }, [tenantId, fetchLogs]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!doseIn || !yieldOut) return;
    
    await supabase.from('transactions').insert({
      tenant_id: tenantId,
      type: 'CALIBRATION',
      date: new Date().toISOString(),
      qty: 0,
      amount: 0,
      notes: `Dose In: ${doseIn}g | Yield Out: ${yieldOut}g (By: ${activeUser?.name || 'Barista'})`
    });
    
    setDoseIn('');
    setYieldOut('');
    fetchLogs();
  };

  return (
    <div className="fade-in space-y-3.5 max-w-2xl mx-auto">
      {/* Standardized Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]/70 no-print">
        <div className="flex items-center gap-2.5">
          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-xs shrink-0">
            <Coffee size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
                Kalibrasi Grinder Harian
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30">
                <CheckCircle2 size={10} />
                <span>Quality Control</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5 m-0">
              Pencatatan rasio Dose In & Yield Out untuk menjaga standar ekstraksi espresso.
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4 sm:p-5 mb-3.5">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3 m-0">
          <Coffee size={16} className="text-[var(--accent)]" /> Form Input Kalibrasi
        </h2>
        <form onSubmit={handleSave} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Dose In (g)</label>
            <input type="number" step="0.1" className="form-control" value={doseIn} onChange={e => setDoseIn(e.target.value)} placeholder="18.0" required />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Yield Out (g)</label>
            <input type="number" step="0.1" className="form-control" value={yieldOut} onChange={e => setYieldOut(e.target.value)} placeholder="36.0" required />
          </div>
          <button type="submit" className="btn premium-btn-primary" style={{ padding: '10px 16px' }}>
            <PlusCircle size={18} /> Simpan
          </button>
        </form>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '16px' }}>Riwayat Kalibrasi</h3>
        {loading ? <p>Memuat...</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px 4px' }}>Waktu</th>
                <th style={{ padding: '8px 4px' }}>Detail Gramasi & Barista</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 4px', color: 'var(--text-secondary)' }}>{new Date(log.date).toLocaleString('id-ID')}</td>
                  <td style={{ padding: '12px 4px', fontWeight: '500' }}>{log.notes}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Belum ada log kalibrasi.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}