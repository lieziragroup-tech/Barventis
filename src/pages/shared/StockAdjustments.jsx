import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, Loader2, FileText } from 'lucide-react';
import { adjustmentApi } from '../../services/upgradeModulesApi';
import { useAuth } from '../../contexts/AuthContext';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';

export default function StockAdjustments() {
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const isManager = ['Admin / Owner', 'Owner', 'Super Admin'].includes(activeUser?.role);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adjustmentApi.getAdjustments({ status: statusFilter === 'all' ? null : statusFilter });
      setItems(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleApprove = async (id) => {
    try {
      await adjustmentApi.approveAdjustment(id);
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'approved' } : i));
    } catch (e) { setError(e.message); }
  };

  const handleReject = async (id) => {
    const notes = window.prompt('Alasan penolakan:');
    if (notes === null) return;
    try {
      await adjustmentApi.rejectAdjustment(id, notes);
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'rejected' } : i));
    } catch (e) { setError(e.message); }
  };

  const statusBadge = (status) => {
    const map = {
      pending: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', text: 'Menunggu' },
      approved: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', text: 'Disetujui' },
      rejected: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', text: 'Ditolak' }
    };
    const s = map[status] || map.pending;
    return <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: s.bg, color: s.color }}>{s.text}</span>;
  };

  const categoryLabel = {
    SPILLAGE: 'Tumpah', RECIPE_ERROR: 'Salah Resep', THEFT: 'Kehilangan',
    COUNTING_ERROR: 'Salah Hitung', EXPIRY: 'Kedaluwarsa', OTHER: 'Lainnya', UNCLASSIFIED: 'Belum Diklasifikasi'
  };

  const pending = items.filter(i => i.status === 'pending');

  return (
    <div className="fade-in space-y-3.5">
      {/* Standardized Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]/70 no-print">
        <div className="flex items-center gap-2.5">
          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-xs shrink-0">
            <FileText size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
                Audit Selisih Stok & Berita Acara
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30">
                <CheckCircle2 size={10} />
                <span>Otorisasi Manager</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5 m-0">
              Investigasi dan persetujuan variansi stok &gt; 2%
            </p>
          </div>
        </div>

        {/* Labeled Status Filter Sub-menu */}
        <div className="flex items-center gap-2 bg-[var(--bg-secondary)]/80 p-1.5 rounded-xl border border-[var(--border)] shadow-xs ml-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-1.5">
            Status:
          </span>
          <div className="inline-flex p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs shadow-2xs gap-0.5">
            {['pending', 'approved', 'rejected', 'all'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md font-semibold text-xs transition-all whitespace-nowrap ${
                  statusFilter === s
                    ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s === 'all' ? 'Semua' : s === 'pending' ? `Menunggu (${pending.length})` : s === 'approved' ? 'Disetujui' : 'Ditolak'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}

      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Bahan</th>
                <th style={{ textAlign: 'center' }}>Tanggal</th>
                <th style={{ textAlign: 'center' }}>Sistem</th>
                <th style={{ textAlign: 'center' }}>Fisik</th>
                <th style={{ textAlign: 'center' }}>Selisih</th>
                <th style={{ textAlign: 'center' }}>%</th>
                <th style={{ textAlign: 'left' }}>Kategori & Alasan</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                {isManager && <th style={{ textAlign: 'center' }}>Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <TableSkeletonRows rows={5} columns={[
                  { width: '140px', type: 'text' }, { width: '80px', type: 'text', align: 'center' },
                  { width: '60px', type: 'text', align: 'center' }, { width: '60px', type: 'text', align: 'center' },
                  { width: '60px', type: 'text', align: 'center' }, { width: '40px', type: 'text', align: 'center' },
                  { width: '160px', type: 'text' }, { width: '80px', type: 'badge' },
                  ...(isManager ? [{ width: '80px', type: 'text', align: 'center' }] : [])
                ]} />
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.materials?.name || '-'}</td>
                  <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{new Date(item.opname_date).toLocaleDateString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>{item.system_qty}</td>
                  <td style={{ textAlign: 'center' }}>{item.physical_qty}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: item.variance_qty < 0 ? '#ef4444' : '#10b981' }}>
                    {item.variance_qty > 0 ? '+' : ''}{item.variance_qty}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600, color: Math.abs(item.variance_pct) > 2 ? '#ef4444' : 'inherit' }}>
                    {item.variance_pct}%
                  </td>
                  <td>
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)' }}>{categoryLabel[item.category] || item.category}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.reason || '-'}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>{statusBadge(item.status)}</td>
                  {isManager && (
                    <td style={{ textAlign: 'center' }}>
                      {item.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#10b981', color: 'white' }} onClick={() => handleApprove(item.id)} title="Setujui">
                            <CheckCircle2 size={13} />
                          </button>
                          <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem', background: '#ef4444', color: 'white' }} onClick={() => handleReject(item.id)} title="Tolak">
                            <XCircle size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 9 : 8} style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                    <CheckCircle2 size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada selisih stok yang memerlukan investigasi</p>
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
