import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Coffee, PlusCircle } from 'lucide-react';

export default function GrinderCalibration() {
  const { activeUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [doseIn, setDoseIn] = useState('');
  const [yieldOut, setYieldOut] = useState('');
  
  const tenantId = activeUser?.tenant_id;

  const fetchLogs = async () => {
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
  };

  useEffect(() => {
    if (tenantId) fetchLogs();
  }, [tenantId]);

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
    <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
      <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Coffee size={20} /> Input Kalibrasi Harian
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