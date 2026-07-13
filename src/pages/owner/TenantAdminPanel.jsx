import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  Users, Building, Link as LinkIcon, Trash2, Key, Copy, Clock, CheckCircle, XCircle
} from 'lucide-react';

export default function TenantAdminPanel() {
  const { currentTenant, sessionUser, showToast: displayToast } = useData();
  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(false);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentTenant) {
      setCompanyName(currentTenant.company_name || '');
    }
    fetchUsers();
    fetchInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentTenant]);

  const fetchUsers = async () => {
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
  };

  const fetchInvitations = async () => {
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
  };

  const handleGenerateInvite = async (role) => {
    if (!currentTenant) return;
    try {
      setIsSaving(true);
      const inviteUrl = await api.generateTenantInvite(currentTenant.id, role);
      
      try {
        await navigator.clipboard.writeText(inviteUrl);
        displayToast(`Link Undangan untuk ${role} disalin! (Berlaku 24 Jam)`, 'success');
      } catch (clipErr) {
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
    } catch (err) {
      displayToast('Gagal menghapus link', 'error');
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === sessionUser.id) {
      displayToast('Anda tidak dapat menghapus diri sendiri.', 'error');
      return;
    }
    
    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus user ${user.name} (${user.email})?`);
    if (!confirmDelete) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id);
        
      if (error) throw error;
      displayToast('Pengguna berhasil dihapus.', 'success');
      fetchUsers();
    } catch (err) {
      displayToast('Gagal menghapus pengguna: ' + err.message, 'error');
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('tenants')
        .update({ company_name: companyName, updated_at: new Date().toISOString() })
        .eq('id', currentTenant.id);
        
      if (error) throw error;
      displayToast('Profil resto berhasil diperbarui.', 'success');
    } catch (err) {
      displayToast('Gagal memperbarui profil: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Store size={28} style={{ color: 'var(--accent)' }} /> Pengaturan Resto
        </h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          Kelola profil resto dan hak akses staf Anda.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          className="btn"
          onClick={() => setTab('users')}
          style={{
            background: tab === 'users' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: tab === 'users' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255,255,255,0.1)',
            color: tab === 'users' ? '#60a5fa' : 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
          }}
        >
          <Users size={16} /> Manajemen Pengguna
        </button>
        <button
          className="btn"
          onClick={() => setTab('invites')}
          style={{
            background: tab === 'invites' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: tab === 'invites' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255,255,255,0.1)',
            color: tab === 'invites' ? '#60a5fa' : 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
          }}
        >
          <LinkIcon size={16} /> Link Undangan
        </button>
        <button
          className="btn"
          onClick={() => setTab('profile')}
          style={{
            background: tab === 'profile' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            border: tab === 'profile' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(255,255,255,0.1)',
            color: tab === 'profile' ? '#60a5fa' : 'var(--text-secondary)',
            padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'
          }}
        >
          <Building size={16} /> Profil Resto
        </button>
      </div>

      <div className="glass-card" style={{ padding: '24px', minHeight: '400px' }}>
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 700 }}>Daftar Pengguna Aktif</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Kelola staf yang memiliki akses ke modul restoran Anda.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={() => handleGenerateInvite('Staff')} disabled={isSaving} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.85rem' }}>
                  <LinkIcon size={14} /> Undang Staff
                </button>
                <button className="btn btn-primary" onClick={() => handleGenerateInvite('Admin / Owner')} disabled={isSaving} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.85rem' }}>
                  <LinkIcon size={14} /> Undang Owner
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat data pengguna...</div>
            ) : (
              <div className="table-responsive">
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
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                        <td>
                          <span style={{
                            padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                            background: u.role === 'Admin / Owner' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                            color: u.role === 'Admin / Owner' ? '#60a5fa' : '#94a3b8'
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
                              padding: '6px 10px', fontSize: '0.75rem', border: 'none',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              cursor: u.id === sessionUser?.id ? 'not-allowed' : 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              opacity: u.id === sessionUser?.id ? 0.3 : 1
                            }}
                            title="Hapus Akses Pengguna"
                          >
                            <Trash2 size={14} /> Hapus
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 700 }}>Kelola Link Undangan</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Buat link undangan untuk merekrut staf baru ke sistem Anda.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={() => handleGenerateInvite('Staff')} disabled={isSaving} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.85rem' }}>
                  <LinkIcon size={14} /> Undang Staff
                </button>
                <button className="btn btn-primary" onClick={() => handleGenerateInvite('Admin / Owner')} disabled={isSaving} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.85rem' }}>
                  <LinkIcon size={14} /> Undang Owner
                </button>
              </div>
            </div>

            {invitations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Belum ada link undangan yang dibuat.</div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {invitations.map(inv => {
                  const isExpired = new Date(inv.expires_at) < new Date();
                  const isActive = !inv.is_used && !isExpired;
                  const linkUrl = `${window.location.origin}/login?token=${inv.token}`;
                  
                  return (
                    <div key={inv.id} style={{
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: `1px solid ${isActive ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      opacity: isActive ? 1 : 0.6
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ 
                            fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', fontWeight: 700,
                            background: inv.is_used ? 'rgba(34, 197, 94, 0.1)' : isExpired ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            color: inv.is_used ? '#22c55e' : isExpired ? '#ef4444' : '#60a5fa',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}>
                            {inv.is_used ? <CheckCircle size={12} /> : isExpired ? <XCircle size={12} /> : <Clock size={12} />}
                            {inv.is_used ? 'Sudah Dipakai' : isExpired ? 'Kadaluarsa' : 'Aktif'}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>Untuk: {inv.invite_role}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '4px' }}>
                          {linkUrl}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          Dibuat: {new Date(inv.created_at).toLocaleString('id-ID')}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {isActive && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => {
                              navigator.clipboard.writeText(linkUrl);
                              displayToast('Link disalin ke clipboard!', 'success');
                            }}
                          >
                            <Copy size={14} /> Salin
                          </button>
                        )}
                        <button 
                          className="btn" 
                          style={{ padding: '6px', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px' }}
                          onClick={() => handleDeleteInvite(inv.id)}
                          title="Hapus Link"
                        >
                          <Trash2 size={14} />
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
          <div style={{ maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 700 }}>Profil Restoran</h3>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>ID Subdomain Resto</label>
                <input
                  type="text"
                  className="form-control"
                  value={currentTenant?.name || ''}
                  disabled
                  style={{
                    width: '100%', padding: '10px 14px', background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)',
                    cursor: 'not-allowed'
                  }}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>ID Subdomain tidak dapat diubah.</small>
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Nama Bisnis / Perusahaan</label>
                <input
                  type="text"
                  className="form-control"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '10px 14px', background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white'
                  }}
                />
              </div>

              <div style={{ background: 'rgba(245, 158, 11, 0.05)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#fbbf24', fontSize: '0.9rem' }}>Status Kunci Pembukuan</h4>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {currentTenant?.locked_until_month && currentTenant?.locked_until_year 
                    ? `Transaksi sebelum bulan ${currentTenant.locked_until_month}/${currentTenant.locked_until_year} telah dikunci dan tidak dapat diubah.` 
                    : 'Belum ada periode yang dikunci. Data masih bebas diubah.'}
                </p>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
                style={{
                  padding: '12px', borderRadius: '8px', fontWeight: 600,
                  marginTop: '10px', display: 'flex', justifyContent: 'center'
                }}
              >
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
