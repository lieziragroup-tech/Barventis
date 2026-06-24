import { useState, useEffect } from 'react';
import {
  Activity, ShieldCheck, RefreshCw, Calculator, Users, AlertTriangle,
  CheckCircle, Info, Package, ChefHat, FileText, Clock, Database
} from 'lucide-react';
import { maintenanceService } from '../services/maintenanceService';

// Reusable KPI card (module-scope so it isn't recreated on every render).
function Kpi({ title, value, icon, color, footer, valueColor, loading }) {
  return (
    <div className="glass-card kpi-card">
      <div className="kpi-header">
        <span className="kpi-title">{title}</span>
        <div className="kpi-icon-wrap" style={{ background: `${color}1a`, color }}>{icon}</div>
      </div>
      <div className="kpi-value" style={{ color: valueColor || undefined, fontSize: typeof value === 'string' && value.length > 10 ? '1.1rem' : undefined }}>
        {loading ? '…' : value}
      </div>
      <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>{footer}</span></div>
    </div>
  );
}

export default function Maintenance({ activeUser }) {
  const isOwner = activeUser?.role === 'Admin / Owner';

  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [issues, setIssues] = useState(null);
  const [checkLoading, setCheckLoading] = useState(false);

  const [recalcLoading, setRecalcLoading] = useState(false);

  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);

  const [notice, setNotice] = useState(null); // { type, message }

  const flash = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 5000);
  };

  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      setHealth(await maintenanceService.getSystemHealth());
    } catch (e) {
      flash('error', 'Gagal memuat status sistem: ' + e.message);
    } finally {
      setHealthLoading(false);
    }
  };

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      setStaff(await maintenanceService.listStaff());
    } catch (e) {
      flash('error', e.message);
    } finally {
      setStaffLoading(false);
    }
  };

  // Initial load on mount. Setting loading flags inside the fetch is intentional
  // (standard fetch-on-mount pattern), so the related hooks rules are scoped off here.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    loadHealth();
    if (isOwner) loadStaff();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const handleRunCheck = async () => {
    setCheckLoading(true);
    try {
      setIssues(await maintenanceService.runIntegrityCheck());
    } catch (e) {
      flash('error', 'Pemeriksaan gagal: ' + e.message);
    } finally {
      setCheckLoading(false);
    }
  };

  const handleRecalc = async () => {
    if (!window.confirm('Hitung ulang HPP untuk SEMUA resep berdasarkan harga bahan terkini? Nilai HPP tersimpan akan diperbarui.')) return;
    setRecalcLoading(true);
    try {
      const res = await maintenanceService.recalcAllRecipeCosts();
      flash('success', `HPP ${res.updated} resep diperbarui${res.failed ? `, ${res.failed} gagal` : ''}.`);
      await loadHealth();
      if (issues) await handleRunCheck();
    } catch (e) {
      flash('error', 'Recalc gagal: ' + e.message);
    } finally {
      setRecalcLoading(false);
    }
  };

  const handleRoleChange = async (user, newRole) => {
    if (newRole === user.role) return;
    if (!window.confirm(`Ubah role "${user.name}" dari "${user.role}" menjadi "${newRole}"?`)) return;
    setSavingUserId(user.id);
    try {
      await maintenanceService.updateUserRole(user.id, newRole);
      flash('success', `Role "${user.name}" diperbarui menjadi ${newRole}.`);
      await loadStaff();
    } catch (e) {
      flash('error', e.message);
    } finally {
      setSavingUserId(null);
    }
  };

  const fmtDateTime = (iso) => {
    if (!iso) return 'Belum pernah';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(iso));
  };

  const sevColor = (s) => s === 'danger' ? 'var(--danger)' : s === 'warning' ? 'var(--warning)' : 'var(--accent)';
  const sevIcon = (s) => s === 'info'
    ? <Info size={18} style={{ color: sevColor(s), flexShrink: 0 }} />
    : <AlertTriangle size={18} style={{ color: sevColor(s), flexShrink: 0 }} />;

  const spinStyle = { animation: 'spin 1s linear infinite' };

  return (
    <div className="maintenance-container">
      {notice && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '10px',
          background: notice.type === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${notice.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          color: notice.type === 'success' ? 'var(--success)' : 'var(--danger)'
        }}>
          {notice.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {notice.message}
        </div>
      )}

      {/* Read-only role banner for Staff */}
      {!isOwner && (
        <div style={{
          marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', fontSize: '0.825rem',
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <Info size={16} style={{ color: 'var(--accent)' }} />
          Anda login sebagai <strong style={{ color: 'var(--text-secondary)' }}>{activeUser?.role}</strong>. Halaman ini hanya menampilkan status sistem (read-only). Aksi maintenance dikunci untuk Owner.
        </div>
      )}

      {/* SYSTEM HEALTH — all roles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} style={{ color: 'var(--accent)' }} /> Status Kesehatan Sistem
        </h3>
        <button className="btn btn-secondary" onClick={loadHealth} disabled={healthLoading}
          style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <RefreshCw size={12} style={healthLoading ? spinStyle : undefined} /> Segarkan
        </button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: '28px' }}>
        <Kpi loading={healthLoading} title="Bahan Baku Aktif" value={health?.materials ?? 0} icon={<Package size={20} />} color="#4c6ef5" footer="Total material aktif" />
        <Kpi loading={healthLoading} title="Stok Menipis" value={health?.lowStock ?? 0} icon={<AlertTriangle size={20} />} color="#f59e0b"
          valueColor={health?.lowStock ? 'var(--warning)' : undefined} footer="Di bawah minimum" />
        <Kpi loading={healthLoading} title="Resep COGS" value={health?.recipes ?? 0} icon={<ChefHat size={20} />} color="#845ef7" footer="Total menu" />
        <Kpi loading={healthLoading} title="PO Tertunda" value={health?.pendingInvoices ?? 0} icon={<FileText size={20} />} color="#10b981" footer="Draft / Sent" />
        <Kpi loading={healthLoading} title="Backup Terakhir" value={fmtDateTime(health?.lastBackup)} icon={<Database size={20} />} color="#4c6ef5" footer="Arsip cadangan" />
        <Kpi loading={healthLoading} title="Opname Terakhir" value={fmtDateTime(health?.lastOpname)} icon={<Clock size={20} />} color="#f59e0b" footer="Audit stok fisik" />
      </div>

      {/* OWNER-ONLY MAINTENANCE TOOLS */}
      {isOwner && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '28px' }}>
            {/* Integrity check */}
            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--success)' }} /> Pemeriksaan Integritas Data
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '16px' }}>
                Deteksi bahan resep yatim, resep tanpa bahan, HPP tidak sinkron, stok negatif, dan bahan tak terpakai.
              </p>

              {issues !== null && (
                <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {issues.length === 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '8px',
                      background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>
                      <CheckCircle size={16} /> Tidak ada masalah terdeteksi. Data sehat.
                    </div>
                  ) : issues.map(issue => (
                    <div key={issue.key} style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '8px',
                      background: 'rgba(255,255,255,0.02)', border: `1px solid ${sevColor(issue.severity)}33` }}>
                      {sevIcon(issue.severity)}
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                          {issue.title} <span style={{ color: sevColor(issue.severity) }}>({issue.count})</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{issue.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button className="btn btn-primary" onClick={handleRunCheck} disabled={checkLoading}
                style={{ marginTop: 'auto', padding: '11px', borderRadius: '10px', fontWeight: 700, display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                <ShieldCheck size={16} style={checkLoading ? spinStyle : undefined} />
                {checkLoading ? 'Memeriksa…' : 'Jalankan Pemeriksaan'}
              </button>
            </div>

            {/* Recalc HPP */}
            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calculator size={18} style={{ color: 'var(--accent)' }} /> Hitung Ulang HPP (COGS)
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: '16px' }}>
                Sinkronkan HPP semua resep dengan harga bahan terkini. Berguna setelah update harga material atau penerimaan invoice.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '10px',
                padding: '12px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Info size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                Menggunakan formula HPP kanonik yang sama dengan editor resep (subtotal + 5% fixed cost).
              </div>
              <button className="btn btn-primary" onClick={handleRecalc} disabled={recalcLoading}
                style={{ marginTop: 'auto', padding: '11px', borderRadius: '10px', fontWeight: 700, display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                <Calculator size={16} style={recalcLoading ? spinStyle : undefined} />
                {recalcLoading ? 'Menghitung ulang…' : 'Recalc Semua Resep'}
              </button>
            </div>
          </div>

          {/* Staff role management */}
          <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: 'var(--accent)' }} /> Manajemen Role Staff
              </h3>
              <button className="btn btn-secondary" onClick={loadStaff} disabled={staffLoading}
                style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <RefreshCw size={12} style={staffLoading ? spinStyle : undefined} /> Segarkan
              </button>
            </div>

            {staffLoading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Memuat daftar staff…</div>
            ) : staff.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tidak ada pengguna ditemukan.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                      {['Nama', 'Email', 'Role Saat Ini', 'Ubah Role'].map((h, i) => (
                        <th key={h} style={{ padding: '14px 20px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(u => {
                      const isSelf = u.id === activeUser?.id;
                      return (
                        <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '14px 20px', fontSize: '0.875rem', fontWeight: 600 }}>
                            {u.name} {isSelf && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>(Anda)</span>}
                          </td>
                          <td style={{ padding: '14px 20px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{u.email}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '5px',
                              background: u.role === 'Admin / Owner' ? 'rgba(76,110,245,0.12)' : 'rgba(148,163,184,0.12)',
                              color: u.role === 'Admin / Owner' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                              {u.role}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                            {u.role === 'Super Admin' || u.role === 'SuperAdmin' ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>
                            ) : (
                              <select
                                value={u.role}
                                disabled={savingUserId === u.id || isSelf}
                                onChange={(e) => handleRoleChange(u, e.target.value)}
                                title={isSelf ? 'Tidak bisa mengubah role sendiri' : 'Ubah role pengguna'}
                                style={{ padding: '6px 10px', background: 'rgba(15,23,42,0.8)', border: '1px solid var(--border)',
                                  borderRadius: '6px', color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                                  cursor: (savingUserId === u.id || isSelf) ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.5 : 1 }}
                              >
                                <option value="Admin / Owner">Admin / Owner</option>
                                <option value="Staff">Staff</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
