import { useState, useEffect, useMemo } from 'react';
import {
  History, Search, ShieldAlert, Calendar,
  ArrowRight, Clock, Laptop, RefreshCw, X, AlertTriangle, CheckCircle, Info
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { getPendingLogs, flushLogs } from '../../services/activityLogService';

export default function AuditLogs() {
  const { activeUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState(null);

  // Fetch logs on mount
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const [syncedData] = await Promise.all([
        api.getAuditLogs({ limit: 500 }).catch(() => []),
      ]);

      // Merge pending local logs with synced logs
      const pending = getPendingLogs().map(e => ({
        id: e.id,
        action: e.action,
        description: e.description,
        username: activeUser?.name || 'User',
        role: activeUser?.role || 'Staff',
        created_at: e.created_at,
        _pending: true,
      }));

      setPendingCount(pending.length);

      const merged = [...pending, ...syncedData]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setLogs(merged);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      setError(err.message || "Gagal memuat jejak audit dari server.");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    await flushLogs();
    await fetchLogs();
  };

  const getActionColor = (action) => {
    const act = (action || '').toUpperCase();
    if (act.includes('CREATE') || act.includes('RECEIVE') || act.includes('LOGIN') || act.includes('REGISTER')) {
      return {
        badge: 'rgba(81, 207, 102, 0.12)',
        text: 'var(--success)',
        border: 'rgba(81, 207, 102, 0.25)'
      };
    }
    if (act.includes('UPDATE') || act.includes('ADJUST') || act.includes('EDIT') || act.includes('SENT') || act.includes('SYNC')) {
      return {
        badge: 'rgba(252, 196, 25, 0.12)',
        text: 'var(--warning)',
        border: 'rgba(252, 196, 25, 0.25)'
      };
    }
    if (act.includes('DELETE') || act.includes('CANCEL') || act.includes('REMOVE')) {
      return {
        badge: 'rgba(255, 107, 107, 0.12)',
        text: 'var(--danger)',
        border: 'rgba(255, 107, 107, 0.25)'
      };
    }
    return {
      badge: 'rgba(255, 255, 255, 0.05)',
      text: 'var(--text-secondary)',
      border: 'rgba(255, 255, 255, 0.1)'
    };
  };

  const getActionCategory = (action) => {
    const act = (action || '').toUpperCase();
    if (act.includes('LOGIN') || act.includes('REGISTER')) return 'AUTH';
    if (act.includes('MATERIAL') || act.includes('PRICE') || act.includes('ADJUST')) return 'MATERIAL';
    if (act.includes('RECIPE')) return 'RECIPE';
    if (act.includes('PO') || act.includes('INVOICE')) return 'INVOICING';
    if (act.includes('POS') || act.includes('SYNC')) return 'POS';
    return 'OTHER';
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  };

  // Masking IP address for Inventory Manager / Assistant (Head Bar)
  const renderIpAddress = (ip) => {
    if (!ip) return '-';
    if (activeUser?.role === 'Inventory Manager') {
      return '***.***.***.***';
    }
    return ip;
  };

  // Filters logic
  const filteredLogs = useMemo(() => logs.filter(log => {
    const matchesSearch = 
      log.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action?.toLowerCase().includes(searchQuery.toLowerCase());

    if (categoryFilter === 'ALL') return matchesSearch;
    return getActionCategory(log.action) === categoryFilter && matchesSearch;
  }), [logs, searchQuery, categoryFilter]);

  // Calculate statistics
  const totalLogsCount = useMemo(() => logs.length, [logs]);
  const uniqueUsers = useMemo(() => new Set(logs.map(l => l.username)).size, [logs]);
  const securityAlerts = useMemo(() => logs.filter(l => {
    const act = (l.action || '').toUpperCase();
    return act.includes('DELETE') || act.includes('CANCEL');
  }).length, [logs]);
  const syncsCount = useMemo(() => logs.filter(l => (l.action || '').toUpperCase().includes('SYNC')).length, [logs]);

  return (
    <div className="audit-logs-container">
      {/* Quick Summary KPI */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Aktivitas Sistem</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
              <History size={20} />
            </div>
          </div>
          <div className="kpi-value">{totalLogsCount}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Semua jejak terekam otomatis</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Pengguna Aktif</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(81, 207, 102, 0.1)', color: 'var(--success)' }}>
              <Laptop size={20} />
            </div>
          </div>
          <div className="kpi-value">{uniqueUsers}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Admin & Owner pembuat perubahan</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Aktivitas Kritis</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(255, 107, 107, 0.1)', color: 'var(--danger)' }}>
              <ShieldAlert size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: securityAlerts > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {securityAlerts}
          </div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Log Hapus / Pembatalan PO</span>
          </div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Singkronisasi POS Kasir</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(252, 196, 25, 0.1)', color: 'var(--warning)' }}>
              <RefreshCw size={20} />
            </div>
          </div>
          <div className="kpi-value">{syncsCount}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--text-secondary)' }}>Update data penjualan kasir</span>
          </div>
        </div>
      </div>

      {/* Control panel (Search and filter) */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1', minWidth: '280px' }}>
            <Search size={18} style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)'
            }} />
            <input
              type="text"
              placeholder="Cari deskripsi, tindakan, atau pelaksana..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 42px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
            />
            {searchQuery && (
              <X 
                size={16} 
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              />
            )}
          </div>

          {/* Action Categories Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'AUTH', label: 'Akses / Auth' },
              { id: 'MATERIAL', label: 'Bahan Baku' },
              { id: 'RECIPE', label: 'Resep Menu' },
              { id: 'INVOICING', label: 'Pembelian PO' },
              { id: 'POS', label: 'POS Sync' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                style={{
                  padding: '8px 16px',
                  background: categoryFilter === cat.id ? 'var(--accent)' : 'var(--bg-primary)',
                  color: categoryFilter === cat.id ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: categoryFilter === cat.id ? 'var(--accent)' : 'var(--border)',
                  borderRadius: '30px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button 
            className="btn btn-secondary" 
            onClick={fetchLogs} 
            disabled={loading}
            style={{ padding: '10px 14px', height: '42px', display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Segarkan
          </button>

          {/* Pending Sync Badge + Sync Now */}
          {pendingCount > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleSyncNow}
              style={{ padding: '10px 14px', height: '42px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} />
              Sync {pendingCount} Logs
            </button>
          )}
        </div>
      </div>

      {/* RBAC Notice (Only shown to Head Bar for context) */}
      {activeUser?.role === 'Inventory Manager' && (
        <div style={{
          background: 'var(--accent-glow)',
          border: '1px solid rgba(76, 110, 245, 0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start'
        }}>
          <Info size={20} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Mode Asisten Terpercaya (Masking Aktif)
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              Sebagai <strong>Admin (Head Bar)</strong>, Anda memiliki hak akses kolaboratif penuh untuk memantau aktivitas operasional. Demi alasan keamanan jaringan sistem, parameter jaringan teknis (seperti <strong>IP Address</strong> asli pengguna) disembunyikan/di-masking dengan <code>***.***.***.***</code> pada feed Anda.
            </p>
          </div>
        </div>
      )}

      {/* Main Table / Timeline Feed */}
      <div className="glass-card" style={{ padding: '0px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '80px', textAlign: 'center' }}>
            <div style={{
              display: 'inline-block',
              width: '32px',
              height: '32px',
              border: '3px solid rgba(255,255,255,0.1)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginBottom: '16px'
            }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Memuat jejak audit sistem...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', color: 'var(--danger)' }}>
            <AlertTriangle size={48} style={{ margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '8px' }}>Terjadi Kesalahan</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>{error}</p>
            <button className="btn btn-primary" onClick={fetchLogs}>Coba Lagi</button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '80px 40px', textAlign: 'center' }}>
            <History size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Tidak Ada Jejak Audit</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Tidak ditemukan data audit log yang sesuai dengan kata kunci pencarian atau filter kategori Anda.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '16px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Waktu</th>
                  <th style={{ padding: '16px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Pelaksana</th>
                  <th style={{ padding: '16px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Tindakan</th>
                  <th style={{ padding: '16px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Deskripsi</th>
                  <th style={{ padding: '16px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>IP Address</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const colors = getActionColor(log.action);
                  return (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      style={{ 
                        borderBottom: '1px solid var(--border)', 
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px', fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                          {formatDateTime(log.created_at)}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{log.username}</div>
                          <div style={{ 
                            fontSize: '0.725rem', 
                            color: log.role === 'Admin / Owner' ? 'var(--accent)' : 'var(--text-muted)',
                            fontWeight: '500'
                          }}>
                            {log.role === 'Inventory Manager' ? 'Admin (Head Bar)' : log.role}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.725rem',
                          fontWeight: '700',
                          letterSpacing: '0.5px',
                          background: colors.badge,
                          color: colors.text,
                          border: `1px solid ${colors.border}`
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '0.875rem', color: 'var(--text-primary)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {renderIpAddress(log.ip_address)}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button className="btn" onClick={() => setSelectedLog(log)} style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
                          Detail <ArrowRight size={12} style={{ marginLeft: '4px', display: 'inline' }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Log Detail Modal */}
      {selectedLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 17, 23, 0.75)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '560px',
            position: 'relative',
            padding: '30px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <button 
              onClick={() => setSelectedLog(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--text-inverse)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
            >
              <X size={20} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-lg)',
                background: getActionColor(selectedLog.action).badge,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: getActionColor(selectedLog.action).text,
                border: `1px solid ${getActionColor(selectedLog.action).border}`
              }}>
                <History size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Detail Jejak Audit</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Log ID: #{selectedLog.id}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>Tindakan (Event Action)</div>
                <span style={{
                  display: 'inline-flex',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  background: getActionColor(selectedLog.action).badge,
                  color: getActionColor(selectedLog.action).text,
                  border: `1px solid ${getActionColor(selectedLog.action).border}`
                }}>
                  {selectedLog.action}
                </span>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>Deskripsi Perubahan</div>
                <div style={{ 
                  background: 'var(--bg-primary)', 
                  padding: '12px 16px', 
                  borderRadius: 'var(--radius-lg)', 
                  fontSize: '0.9rem', 
                  lineHeight: '1.5',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)'
                }}>
                  {selectedLog.description}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>Pelaksana (Executor)</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{selectedLog.username}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {selectedLog.role === 'Inventory Manager' ? 'Admin (Head Bar)' : selectedLog.role}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>Waktu Kejadian</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                    {formatDateTime(selectedLog.created_at)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>IP Address Asal</div>
                  <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', color: 'var(--text-secondary)', fontWeight: '600' }}>
                    {renderIpAddress(selectedLog.ip_address)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: '600' }}>Status Evaluasi Keamanan</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: '600' }}>
                    {(selectedLog.action || '').toUpperCase().includes('DELETE') || (selectedLog.action || '').toUpperCase().includes('CANCEL') ? (
                      <>
                        <ShieldAlert size={14} style={{ color: 'var(--danger)' }} />
                        <span style={{ color: 'var(--danger)' }}>KRITIS (Modifikasi Sensitif)</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                        <span style={{ color: 'var(--success)' }}>AMAN (Aktivitas Standar)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-primary" 
                onClick={() => setSelectedLog(null)}
                style={{ padding: '10px 24px', borderRadius: 'var(--radius-md)', fontWeight: '600' }}
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

