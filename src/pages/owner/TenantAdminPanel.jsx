import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import {
  Users, Building, Link as LinkIcon, Trash2, Copy, Clock, CheckCircle, XCircle, Store
} from 'lucide-react';

export default function TenantAdminPanel() {
  const { currentTenant, sessionUser, showToast: displayToast } = useData();
  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [isPosEnabled, setIsPosEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetOptions, setResetOptions] = useState({
    resetPos: true,
    resetStockHistory: true,
    resetPurchasing: true,
    resetRecipes: false,
    resetMaterials: false
  });
  const [resetRequests, setResetRequests] = useState([]);
  const [loadingResetRequests, setLoadingResetRequests] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmActionState, setConfirmActionState] = useState(null);

  // Helper for Double Confirmation
  const requestConfirmation = (title, message, onConfirm) => {
    setConfirmActionState({ title, message, onConfirm });
    setShowConfirmModal(true);
  };

  useEffect(() => {
    if (currentTenant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompanyName(currentTenant.company_name || '');
      setIsPosEnabled(!!currentTenant.is_pos_enabled);
    }
    fetchUsers();
    fetchInvitations();
    fetchResetRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentTenant]);

  async function fetchUsers() {
    if (!currentTenant) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setTenantUsers(data || []);
    } catch (err) {
      console.error(err);
      displayToast('Gagal memuat daftar pengguna', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchInvitations() {
    if (!currentTenant) return;
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setInvitations(data || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchResetRequests() {
    if (!currentTenant) return;
    try {
      setLoadingResetRequests(true);
      const data = await api.getTenantResetRequests(currentTenant.id);
      setResetRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingResetRequests(false);
    }
  }

  const handleGenerateInvite = async (role) => {
    if (!currentTenant) return;
    try {
      setIsSaving(true);
      const inviteUrl = await api.generateTenantInvite(currentTenant.id, role);
      
      try {
        await navigator.clipboard.writeText(inviteUrl);
        displayToast(`Link Undangan untuk ${role} disalin! (Berlaku 24 Jam)`, 'success');
      } catch {
        window.prompt(`Link Undangan ${role} (Berlaku 24 Jam). Salin teks di bawah ini:`, inviteUrl);
      }
      fetchInvitations();
    } catch (err) {
      displayToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteInvite = async (id) => {
    try {
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
      displayToast('Link undangan dihapus.', 'success');
      fetchInvitations();
    } catch {
      displayToast('Gagal menghapus link', 'error');
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === sessionUser.id) {
      displayToast('Anda tidak dapat menghapus diri sendiri.', 'error');
      return;
    }
    
    requestConfirmation(
      'Hapus Pengguna',
      `Apakah Anda yakin ingin menghapus staf ${user.name} (${user.email})?`,
      async () => {
        try {
          setLoading(true);
          const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', user.id);

          if (error) {
            if (error.code === '23503') {
              throw new Error('Tidak dapat menghapus pengguna ini karena sudah memiliki riwayat aktivitas (transaksi, opname, dll).');
            }
            throw error;
          }
          displayToast('Pengguna berhasil dihapus.', 'success');
          fetchUsers();
        } catch (err) {
          displayToast('Gagal menghapus pengguna: ' + err.message, 'error');
          setLoading(false);
        }
      }
    );
  };

  const executeFactoryReset = async () => {
    setShowResetModal(false);
    requestConfirmation(
      'Ajukan Permintaan Reset Data',
      `Anda akan MENGAJUKAN reset data terpilih untuk resto "${currentTenant?.company_name}" ke Super Admin. Data BELUM akan terhapus sekarang — baru terhapus setelah Super Admin menyetujui permintaan ini.`,
      async () => {
        try {
          setIsSaving(true);
          await api.requestTenantReset(currentTenant.id, resetOptions);
          displayToast('Permintaan reset sudah dikirim. Menunggu persetujuan Super Admin — data belum terhapus.', 'success');
          fetchResetRequests();
        } catch (err) {
          displayToast('Gagal mengajukan reset: ' + err.message, 'error');
        } finally {
          setIsSaving(false);
        }
      }
    );
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    requestConfirmation(
      'Simpan Profil',
      'Apakah Anda yakin ingin menyimpan perubahan profil pengaturan resto ini?',
      async () => {
        try {
          setIsSaving(true);
          await api.updateTenantSettings({
            company_name: companyName,
            is_pos_enabled: isPosEnabled
          });
          displayToast('Profil resto berhasil diperbarui.', 'success');
          window.location.reload();
        } catch (err) {
          displayToast('Gagal memperbarui profil: ' + err.message, 'error');
        } finally {
          setIsSaving(false);
        }
      }
    );
  };

  return (
    <div style={{ paddingBottom: '30px' }}>
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Store size={20} style={{ color: 'var(--accent)' }} /> Pengaturan Resto
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.8rem' }}>
          Kelola profil resto dan hak akses staf Anda.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          className="btn"
          onClick={() => setTab('users')}
          style={{
            background: tab === 'users' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
            border: tab === 'users' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(255,255,255,0.08)',
            color: tab === 'users' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
          }}
        >
          <Users size={14} /> Manajemen Pengguna
        </button>
        <button
          className="btn"
          onClick={() => setTab('invites')}
          style={{
            background: tab === 'invites' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
            border: tab === 'invites' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(255,255,255,0.08)',
            color: tab === 'invites' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
          }}
        >
          <LinkIcon size={14} /> Link Undangan
        </button>
        <button
          className="btn"
          onClick={() => setTab('profile')}
          style={{
            background: tab === 'profile' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
            border: tab === 'profile' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(255,255,255,0.08)',
            color: tab === 'profile' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
          }}
        >
          <Building size={14} /> Profil Resto
        </button>
        <button
          className="btn"
          onClick={() => setTab('addons')}
          style={{
            background: tab === 'addons' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
            border: tab === 'addons' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(255,255,255,0.08)',
            color: tab === 'addons' ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '6px 12px', fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
          }}
        >
          <Store size={14} /> Add-Ons & Kuota
        </button>
      </div>

      <div className="glass-card" style={{ padding: '16px 20px', minHeight: '350px' }}>
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>Daftar Pengguna Aktif</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Kelola staf yang memiliki akses ke modul restoran Anda.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleGenerateInvite('Staff')} disabled={isSaving} style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '0.78rem', padding: '6px 10px' }}>
                  <LinkIcon size={12} /> Undang Staff
                </button>
                <button className="btn btn-primary" onClick={() => handleGenerateInvite('Admin / Owner')} disabled={isSaving} style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '0.78rem', padding: '6px 10px' }}>
                  <LinkIcon size={12} /> Undang Owner
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Memuat data pengguna...</div>
            ) : (
              <div className="table-container" style={{ margin: 0 }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Nama Pengguna</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Bergabung Pada</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantUsers.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                        <td>
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                            background: u.role === 'Admin / Owner' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(148, 163, 184, 0.08)',
                            color: u.role === 'Admin / Owner' ? 'var(--accent)' : 'var(--text-muted)'
                          }}>
                            {u.role.toUpperCase()}
                          </span>
                        </td>
                        <td>{new Date(u.created_at).toLocaleDateString('id-ID')}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="btn"
                            disabled={u.id === sessionUser?.id}
                            style={{
                              padding: '4px 8px', fontSize: '0.72rem', border: 'none',
                              background: 'var(--danger-glow)',
                              color: 'var(--danger)',
                              cursor: u.id === sessionUser?.id ? 'not-allowed' : 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              opacity: u.id === sessionUser?.id ? 0.3 : 1,
                              borderRadius: '4px'
                            }}
                            title="Hapus Akses Pengguna"
                          >
                            <Trash2 size={12} /> Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'invites' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>Kelola Link Undangan</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Buat link undangan untuk merekrut staf baru ke sistem Anda.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => handleGenerateInvite('Staff')} disabled={isSaving} style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '0.78rem', padding: '6px 10px' }}>
                  <LinkIcon size={12} /> Undang Staff
                </button>
                <button className="btn btn-primary" onClick={() => handleGenerateInvite('Admin / Owner')} disabled={isSaving} style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '0.78rem', padding: '6px 10px' }}>
                  <LinkIcon size={12} /> Undang Owner
                </button>
              </div>
            </div>

            {invitations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Belum ada link undangan yang dibuat.</div>
            ) : (
              <div style={{ display: 'grid', gap: '10px' }}>
                {invitations.map(inv => {
                  const isExpired = new Date(inv.expires_at) < new Date();
                  const isActive = !inv.is_used && !isExpired;
                  // SEC-FIX 2026-08: role is now resolved server-side from
                  // invitations.invite_role (see api.js registerWithToken),
                  // so this link no longer needs (or should carry) a &role=
                  // query param — it was previously hardcoded to 'Staff'
                  // regardless of what role the invite was actually for.
                  const linkUrl = `${window.location.origin}/login?token=${inv.token}`;
                  
                  return (
                    <div key={inv.id} style={{
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: `1px solid ${isActive ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)'}`,
                      borderRadius: 'var(--radius-md)', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      opacity: isActive ? 1 : 0.6, gap: '12px', flexWrap: 'wrap'
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                          <span style={{ 
                            fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700,
                            background: inv.is_used ? 'rgba(34, 197, 94, 0.1)' : isExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            color: inv.is_used ? 'var(--success)' : isExpired ? 'var(--danger)' : 'var(--accent)',
                            display: 'flex', alignItems: 'center', gap: '3px'
                          }}>
                            {inv.is_used ? <CheckCircle size={10} /> : isExpired ? <XCircle size={10} /> : <Clock size={10} />}
                            {inv.is_used ? 'Sudah Dipakai' : isExpired ? 'Kadaluarsa' : 'Aktif'}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>Link Undangan Outlet</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '2px', wordBreak: 'break-all' }}>
                          {linkUrl}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                          Dibuat: {new Date(inv.created_at).toLocaleString('id-ID')}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {isActive && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => {
                              navigator.clipboard.writeText(linkUrl);
                              displayToast('Link disalin ke clipboard!', 'success');
                            }}
                          >
                            <Copy size={12} /> Salin
                          </button>
                        )}
                        <button 
                          className="btn" 
                          style={{ padding: '4px 8px', color: 'var(--danger)', background: 'var(--danger-glow)', border: 'none', borderRadius: 'var(--radius-sm)' }}
                          onClick={() => handleDeleteInvite(inv.id)}
                          title="Hapus Link"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div style={{ maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700 }}>Profil Restoran</h3>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>ID Subdomain Resto</label>
                <input
                  type="text"
                  className="form-control"
                  value={currentTenant?.name || ''}
                  disabled
                  style={{
                    width: '100%', padding: '8px 12px',
                    cursor: 'not-allowed', fontSize: '0.8rem'
                  }}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '2px', display: 'block' }}>ID Subdomain tidak dapat diubah.</small>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Nama Bisnis / Perusahaan</label>
                <input
                  type="text"
                  className="form-control"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '8px 12px', fontSize: '0.8rem'
                  }}
                />
              </div>

              <div style={{ marginTop: '8px', padding: '16px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Integrasi POS Internal</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aktifkan modul Point of Sale (Kasir) bawaan Barventis.</p>
                  </div>
                  <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                    <input 
                      type="checkbox" 
                      checked={isPosEnabled} 
                      onChange={async (e) => {
                        const newValue = e.target.checked;
                        setIsPosEnabled(newValue);
                        try {
                          setIsSaving(true);
                          await api.updateTenantSettings({
                            is_pos_enabled: newValue
                          });
                          displayToast(`Integrasi POS Internal ${newValue ? 'Diaktifkan' : 'Dinonaktifkan'}.`, 'success');
                          setTimeout(() => window.location.reload(), 800);
                        } catch (err) {
                          displayToast('Gagal mengubah pengaturan POS: ' + err.message, 'error');
                          setIsPosEnabled(!newValue);
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: isPosEnabled ? 'var(--accent)' : 'var(--surface-active)', border: '1px solid ' + (isPosEnabled ? 'var(--accent)' : 'var(--border)'), transition: '.4s', borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '18px', width: '18px', left: '2px', bottom: '2px',
                        backgroundColor: isPosEnabled ? '#ffffff' : 'var(--text-muted)', transition: '.4s', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                        transform: isPosEnabled ? 'translateX(20px)' : 'translateX(0)'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.1)', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 4px 0', color: 'var(--warning)', fontSize: '0.82rem', fontWeight: '700' }}>Status Kunci Pembukuan</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {currentTenant?.locked_until_month && currentTenant?.locked_until_year 
                    ? `Transaksi sebelum bulan ${currentTenant.locked_until_month}/${currentTenant.locked_until_year} telah dikunci dan tidak dapat diubah.` 
                    : 'Belum ada periode yang dikunci. Data masih bebas diubah.'}
                </p>
              </div>

              <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239, 68, 68, 0.1)', marginBottom: '16px' }}>
                <h4 style={{ margin: '0 0 4px 0', color: 'var(--danger)', fontSize: '0.82rem', fontWeight: '700' }}>Zona Berbahaya (Danger Zone)</h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Reset seluruh statistik penjualan dan transaksi (mengulang dari 0). Bahan baku dan resep tidak akan dihapus.
                </p>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  disabled={isSaving}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem', color: 'var(--danger-text)', borderColor: 'var(--danger)' }}
                >
                  <Trash2 size={12} style={{ marginRight: 4 }} /> Reset Data Transaksi (0)
                </button>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
                style={{
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)', fontWeight: 600,
                  marginTop: '8px', display: 'flex', justifyContent: 'center', fontSize: '0.8rem'
                }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </form>
          </div>
        )}
        
        {tab === 'addons' && (
          <div>
            <h3 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 700 }}>Upgrade & Beli Add-Ons</h3>
            <p style={{ margin: '0 0 20px 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Tingkatkan kapasitas sistem Barventis sesuai kebutuhan bisnis Anda tanpa harus upgrade ke paket yang lebih mahal.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              
              {/* Addon 1 */}
              <div style={{ 
                background: 'rgba(15, 23, 42, 0.4)', 
                border: '1px solid rgba(255, 255, 255, 0.08)', 
                borderRadius: 'var(--radius-md)', padding: '20px', 
                display: 'flex', flexDirection: 'column' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '1rem' }}>+ 500 Kuota Transaksi POS</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tambahan kuota transaksi per hari.</p>
                  </div>
                  <span style={{ 
                    background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' 
                  }}>
                    Rp 15.000 / bln
                  </span>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 'auto', padding: '8px', fontSize: '0.8rem', justifyContent: 'center' }}>
                  Beli Add-On Ini
                </button>
              </div>

              {/* Addon 2 */}
              <div style={{ 
                background: 'rgba(15, 23, 42, 0.4)', 
                border: '1px solid rgba(255, 255, 255, 0.08)', 
                borderRadius: 'var(--radius-md)', padding: '20px', 
                display: 'flex', flexDirection: 'column' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-primary)', fontSize: '1rem' }}>+ 20 Slot Resep Menu</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tambahkan lebih banyak variasi menu.</p>
                  </div>
                  <span style={{ 
                    background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' 
                  }}>
                    Rp 10.000 / bln
                  </span>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 'auto', padding: '8px', fontSize: '0.8rem', justifyContent: 'center' }}>
                  Beli Add-On Ini
                </button>
              </div>

              {/* Upgrade Plan */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.02) 100%)', 
                border: '1px solid rgba(245, 158, 11, 0.3)', 
                borderRadius: 'var(--radius-md)', padding: '20px', 
                display: 'flex', flexDirection: 'column' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--warning)', fontSize: '1rem' }}>Upgrade Paket Pro</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unlimited POS, unlimited resep, multi-cabang.</p>
                  </div>
                  <span style={{ 
                    background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)', 
                    padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' 
                  }}>
                    Rp 149.000 / bln
                  </span>
                </div>
                <button className="btn" style={{ 
                  marginTop: 'auto', padding: '8px', fontSize: '0.8rem', justifyContent: 'center',
                  background: 'var(--warning)', color: '#000', fontWeight: 'bold', border: 'none'
                }}>
                  Upgrade Sekarang
                </button>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal (Generic) */}
      {showConfirmModal && confirmActionState && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-5">
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                <Trash2 size={20} className="text-[var(--danger)]" /> {confirmActionState.title}
              </h3>
              <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">
                {confirmActionState.message}
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  className="btn btn-secondary px-4 py-2"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isSaving}
                >
                  Batal
                </button>
                <button
                  className="btn premium-btn-danger px-4 py-2"
                  onClick={async () => {
                    await confirmActionState.onConfirm();
                    setShowConfirmModal(false);
                  }}
                  disabled={isSaving}
                >
                  {isSaving ? 'Memproses...' : 'Ya, Lanjutkan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border)] flex justify-between items-center bg-[rgba(239,68,68,0.05)]">
              <h3 className="text-lg font-bold text-[var(--danger)] flex items-center gap-2 m-0">
                <Trash2 size={20} /> Reset Data Spesifik
              </h3>
              <button onClick={() => setShowResetModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto">
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Pilih kategori data yang ingin Anda ajukan untuk dihapus. Permintaan ini akan dikirim ke <strong>Super Admin untuk disetujui</strong> — data Anda <strong>tidak langsung terhapus</strong> saat Anda klik tombol di bawah.
              </p>

              {resetRequests.some(r => r.status === 'pending') && (
                <div className="mb-4 p-3 rounded-lg border border-[var(--warning)] bg-[rgba(217,119,6,0.08)] flex items-start gap-2">
                  <Clock size={16} className="text-[var(--warning)] mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-[var(--text-primary)] m-0">
                    Sudah ada permintaan reset yang masih <strong>menunggu persetujuan Super Admin</strong>. Anda perlu menunggu itu diproses (disetujui/ditolak) sebelum bisa mengajukan permintaan baru.
                  </p>
                </div>
              )}

              {resetRequests.length > 0 && (
                <div className="mb-4">
                  <h5 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                    Riwayat Permintaan Terakhir{loadingResetRequests ? ' (memuat...)' : ''}
                  </h5>
                  <div className="flex flex-col gap-2">
                    {resetRequests.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-center justify-between p-2 rounded-lg border border-[var(--border)] text-xs">
                        <span className="text-[var(--text-secondary)]">
                          {new Date(r.requested_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <span className={
                          r.status === 'pending' ? 'text-[var(--warning)] font-bold' :
                          r.status === 'executed' ? 'text-[var(--success)] font-bold' :
                          r.status === 'rejected' ? 'text-[var(--danger)] font-bold' :
                          r.status === 'failed' ? 'text-[var(--danger)] font-bold' :
                          'text-[var(--text-muted)]'
                        }>
                          {{ pending: 'Menunggu Persetujuan', executed: 'Disetujui & Dieksekusi', rejected: 'Ditolak', failed: 'Gagal Dieksekusi' }[r.status] || r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <input type="checkbox" checked={resetOptions.resetPos} onChange={(e) => setResetOptions({...resetOptions, resetPos: e.target.checked})} className="mt-1" />
                  <div>
                    <h5 className="font-bold text-sm text-[var(--text-primary)] m-0">Data Kasir (POS)</h5>
                    <p className="text-xs text-[var(--text-secondary)] m-0">Log Upload POS, Riwayat Transaksi Penjualan, Expected Usage.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <input type="checkbox" checked={resetOptions.resetStockHistory} onChange={(e) => setResetOptions({...resetOptions, resetStockHistory: e.target.checked})} className="mt-1" />
                  <div>
                    <h5 className="font-bold text-sm text-[var(--text-primary)] m-0">Riwayat Penyesuaian Stok</h5>
                    <p className="text-xs text-[var(--text-secondary)] m-0">Stock Opname, Daily Inventory, Kartu Stok.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <input type="checkbox" checked={resetOptions.resetPurchasing} onChange={(e) => setResetOptions({...resetOptions, resetPurchasing: e.target.checked})} className="mt-1" />
                  <div>
                    <h5 className="font-bold text-sm text-[var(--text-primary)] m-0">Pembelian & Supplier</h5>
                    <p className="text-xs text-[var(--text-secondary)] m-0">Invoices, Purchase Orders, Riwayat Pembelian.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <input type="checkbox" checked={resetOptions.resetRecipes} onChange={(e) => setResetOptions({...resetOptions, resetRecipes: e.target.checked})} className="mt-1" />
                  <div>
                    <h5 className="font-bold text-sm text-[var(--text-primary)] m-0">F&B Recipes (HPP)</h5>
                    <p className="text-xs text-[var(--text-secondary)] m-0 text-[var(--warning)] font-medium">Peringatan: Menghapus semua racikan resep yang sudah Anda buat.</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors">
                  <input type="checkbox" checked={resetOptions.resetMaterials} onChange={(e) => setResetOptions({...resetOptions, resetMaterials: e.target.checked})} className="mt-1" />
                  <div>
                    <h5 className="font-bold text-sm text-[var(--text-primary)] m-0">Master Bahan Baku</h5>
                    <p className="text-xs text-[var(--text-secondary)] m-0 text-[var(--danger)] font-medium">Hati-hati: Menghapus seluruh nama bahan baku (Stock Ledger).</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-tertiary)] flex justify-end gap-3">
              <button 
                type="button" 
                className="btn btn-secondary px-4"
                onClick={() => setShowResetModal(false)}
              >
                Batal
              </button>
              <button 
                type="button" 
                className="btn premium-btn-danger px-4"
                onClick={executeFactoryReset}
                disabled={!Object.values(resetOptions).some(v => v) || resetRequests.some(r => r.status === 'pending')}
                title={resetRequests.some(r => r.status === 'pending') ? 'Masih ada permintaan yang menunggu persetujuan' : undefined}
              >
                Ajukan Reset ke Super Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
