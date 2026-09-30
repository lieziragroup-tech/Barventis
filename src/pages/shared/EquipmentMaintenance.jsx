import { useState, useEffect, useCallback } from 'react';
import { Wrench, Calendar, PlusCircle, Loader2, Save } from 'lucide-react';
import { maintenanceApi } from '../../services/upgradeModulesApi';
import { api } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';

export default function EquipmentMaintenance() {
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    asset_id: '', service_type: 'PREVENTIVE', description: '', performed_by: '',
    performed_at: new Date().toISOString().split('T')[0], next_due_date: '', parts_replaced: '', cost: 0, notes: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
      const [logsData, { data: assetsData }] = await Promise.all([
        maintenanceApi.getServiceLogs(),
        supabase.from('assets').select('id, name, category').eq('tenant_id', tenantId)
      ]);
      setLogs(logsData);
      setAssets(assetsData || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.asset_id || !form.description) return setError('Pilih aset dan isi deskripsi.');
    setSaving(true);
    try {
      await maintenanceApi.createServiceLog(form);
      setShowForm(false);
      setForm({ asset_id: '', service_type: 'PREVENTIVE', description: '', performed_by: activeUser?.name || '',
        performed_at: new Date().toISOString().split('T')[0], next_due_date: '', parts_replaced: '', cost: 0, notes: '' });
      await fetchData();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const serviceTypeLabel = { PREVENTIVE: 'Preventif', CORRECTIVE: 'Korektif', CALIBRATION: 'Kalibrasi', REPLACEMENT: 'Penggantian' };
  const serviceTypeColor = { PREVENTIVE: '#3b82f6', CORRECTIVE: '#f59e0b', CALIBRATION: '#8b5cf6', REPLACEMENT: '#ef4444' };

  return (
    <div className="fade-in space-y-5">
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', borderRadius: '12px', background: 'rgba(139,92,246,0.1)' }}>
              <Wrench size={22} style={{ color: '#8b5cf6' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Pemeliharaan & Riwayat Servis Alat</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Jadwal preventif, riwayat servis, dan penggantian suku cadang
              </p>
            </div>
          </div>
          <button className="btn btn-primary text-xs flex items-center gap-1.5" onClick={() => setShowForm(!showForm)}>
            <PlusCircle size={14} /> Catat Servis Baru
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}

      {showForm && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <h4 style={{ margin: '0 0 16px', fontWeight: 700, fontSize: '0.95rem' }}>Form Pencatatan Servis</h4>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Aset/Alat</label>
              <select className="form-control" value={form.asset_id} onChange={e => setForm({...form, asset_id: e.target.value})} required>
                <option value="">Pilih aset...</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name} ({a.category})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Tipe Servis</label>
              <select className="form-control" value={form.service_type} onChange={e => setForm({...form, service_type: e.target.value})}>
                {Object.entries(serviceTypeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Tanggal</label>
              <input type="date" className="form-control" value={form.performed_at} onChange={e => setForm({...form, performed_at: e.target.value})} />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Jadwal Berikutnya</label>
              <input type="date" className="form-control" value={form.next_due_date} onChange={e => setForm({...form, next_due_date: e.target.value})} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Deskripsi Pekerjaan</label>
              <input type="text" className="form-control" value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Contoh: Descaling mesin espresso" required />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Dilakukan Oleh</label>
              <input type="text" className="form-control" value={form.performed_by} onChange={e => setForm({...form, performed_by: e.target.value})} placeholder="Nama teknisi" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Suku Cadang</label>
              <input type="text" className="form-control" value={form.parts_replaced} onChange={e => setForm({...form, parts_replaced: e.target.value})} placeholder="Filter air, seal group head, dll" />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Biaya (Rp)</label>
              <input type="number" className="form-control" value={form.cost} onChange={e => setForm({...form, cost: Number(e.target.value)})} min="0" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <button type="submit" className="btn btn-primary text-xs flex items-center gap-1.5" disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
              </button>
              <button type="button" className="btn btn-secondary text-xs" onClick={() => setShowForm(false)}>Batal</button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Alat</th>
                <th style={{ textAlign: 'center' }}>Tipe</th>
                <th style={{ textAlign: 'left' }}>Deskripsi</th>
                <th style={{ textAlign: 'center' }}>Tanggal</th>
                <th style={{ textAlign: 'center' }}>Jadwal Berikutnya</th>
                <th style={{ textAlign: 'left' }}>Suku Cadang</th>
                <th style={{ textAlign: 'right' }}>Biaya</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <TableSkeletonRows rows={4} columns={[
                  { width: '120px', type: 'text' }, { width: '80px', type: 'badge', align: 'center' },
                  { width: '160px', type: 'text' }, { width: '80px', type: 'text', align: 'center' },
                  { width: '80px', type: 'text', align: 'center' }, { width: '120px', type: 'text' },
                  { width: '80px', type: 'text', align: 'right' }
                ]} />
              ) : logs.map(log => {
                const isDue = log.next_due_date && new Date(log.next_due_date) <= new Date(Date.now() + 7 * 86400000);
                return (
                  <tr key={log.id}>
                    <td style={{ fontWeight: 600 }}>{log.assets?.name || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: `${serviceTypeColor[log.service_type]}15`, color: serviceTypeColor[log.service_type] }}>
                        {serviceTypeLabel[log.service_type]}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{log.description}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{new Date(log.performed_at).toLocaleDateString('id-ID')}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: isDue ? 700 : 400, color: isDue ? '#ef4444' : 'inherit' }}>
                      {log.next_due_date ? new Date(log.next_due_date).toLocaleDateString('id-ID') : '-'}
                      {isDue && <Calendar size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{log.parts_replaced || '-'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{log.cost > 0 ? `Rp ${Number(log.cost).toLocaleString('id-ID')}` : '-'}</td>
                  </tr>
                );
              })}
              {!loading && logs.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                  <Wrench size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ fontWeight: 500, margin: 0 }}>Belum ada riwayat servis</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
