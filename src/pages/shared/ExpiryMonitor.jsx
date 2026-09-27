import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ShieldCheck, Clock, Trash2, Loader2 } from 'lucide-react';
import { fefoApi } from '../../services/upgradeModulesApi';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';

// ponytail: single-file component, no router needed. Embedded in DailyInventoryHub.
export default function ExpiryMonitor() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [daysFilter, setDaysFilter] = useState(3);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fefoApi.getExpiringItems(daysFilter);
      setItems(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [daysFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleDispose = async (id) => {
    if (!window.confirm('Tandai batch ini sebagai disposed (dibuang)?')) return;
    try {
      await fefoApi.disposeBatch(id, 'disposed');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { setError(e.message); }
  };

  const getExpiryBadge = (expiryDate) => {
    const diff = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
    if (diff < 0) return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', text: `Expired ${Math.abs(diff)}d`, icon: AlertTriangle };
    if (diff <= 1) return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', text: `H-${diff}`, icon: AlertTriangle };
    if (diff <= 3) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', text: `H-${diff}`, icon: Clock };
    return { color: '#10b981', bg: 'rgba(16,185,129,0.1)', text: `${diff} hari`, icon: ShieldCheck };
  };

  const expired = items.filter(i => new Date(i.expiry_date) < new Date());
  const warning = items.filter(i => {
    const d = new Date(i.expiry_date);
    return d >= new Date() && d <= new Date(Date.now() + 3 * 86400000);
  });

  return (
    <div className="fade-in space-y-5">
      {/* Header & Filter Toolbar */}
      <div className="glass-card p-3.5 sm:p-4 mb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 shadow-xs">
              <AlertTriangle size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="m-0 text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                  Monitor Kedaluwarsa (FEFO)
                </h3>
                {expired.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-700 dark:text-red-400 font-bold border border-red-500/30">
                    <AlertTriangle size={10} />
                    <span>{expired.length} Batch Expired</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/30">
                    <ShieldCheck size={10} />
                    <span>Stok Aman (FEFO)</span>
                  </span>
                )}
              </div>
              <p className="m-0 text-[11px] text-[var(--text-secondary)] mt-0.5">
                Pemantauan batch bahan yang mendekati atau melewati tanggal kedaluwarsa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-[var(--bg-secondary)]/80 p-1.5 rounded-xl border border-[var(--border)] shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-1.5">
              Filter Rentang:
            </span>
            <select
              className="form-control text-xs font-semibold"
              style={{ width: 'auto', height: '32px', padding: '4px 10px' }}
              value={daysFilter}
              onChange={e => setDaysFilter(Number(e.target.value))}
            >
              <option value={1}>H-1 (Besok)</option>
              <option value={3}>H-3 (3 Hari)</option>
              <option value={7}>H-7 (Seminggu)</option>
              <option value={14}>H-14 (2 Minggu)</option>
              <option value={30}>H-30 (Sebulan)</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4" style={{ borderLeft: '3px solid #ef4444' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#ef4444' }}>Expired</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>{expired.length}</div>
        </div>
        <div className="glass-card p-4" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#f59e0b' }}>Peringatan H-3</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>{warning.length}</div>
        </div>
        <div className="glass-card p-4" style={{ borderLeft: '3px solid #10b981' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Batch Aktif</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>{items.length}</div>
        </div>
      </div>

      {error && <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}

      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Bahan</th>
                <th style={{ textAlign: 'center' }}>Batch</th>
                <th style={{ textAlign: 'center' }}>Lokasi</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'center' }}>Tgl Kedaluwarsa</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <TableSkeletonRows rows={5} columns={[
                  { width: '160px', type: 'text' }, { width: '80px', type: 'text', align: 'center' },
                  { width: '60px', type: 'text', align: 'center' }, { width: '60px', type: 'text', align: 'center' },
                  { width: '100px', type: 'text', align: 'center' }, { width: '80px', type: 'badge' },
                  { width: '60px', type: 'text', align: 'center' }
                ]} />
              ) : items.map(item => {
                const badge = getExpiryBadge(item.expiry_date);
                const Icon = badge.icon;
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.materials?.name || 'Unknown'}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{item.materials?.unit}</div>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.batch_number || '-'}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{item.location}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{new Date(item.expiry_date).toLocaleDateString('id-ID')}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: badge.bg, color: badge.color }}>
                        <Icon size={12} /> {badge.text}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => handleDispose(item.id)} title="Buang/Dispose">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                    <ShieldCheck size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada bahan yang mendekati kedaluwarsa</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
