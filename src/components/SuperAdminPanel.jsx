import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Building2, Plus, Trash2, RefreshCw, Shield, CheckCircle, XCircle } from 'lucide-react';

export default function SuperAdminPanel({ activeUser }) {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeSection, setActiveSection] = useState('tenants');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Modal state untuk buat tenant baru
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', company_name: '' });

  // Modal state untuk buat user baru
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'Admin / Owner', tenant_id: '' });

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: tenantsData } = await supabase
        .from('tenants')
        .select('*, pos_templates(display_name)')
        .order('created_at', { ascending: false });

      const { data: usersData } = await supabase
        .from('users')
        .select('*, tenants(company_name)')
        .order('created_at', { ascending: false });

      setTenants(tenantsData || []);
      setUsers(usersData || []);
    } catch (e) {
      showToast('Gagal memuat data: ' + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleToggleTenantStatus = async (tenant) => {
    const newStatus = tenant.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase
      .from('tenants')
      .update({ status: newStatus })
      .eq('id', tenant.id);
    if (error) { showToast('Gagal update status: ' + error.message); return; }
    showToast(`Tenant ${tenant.company_name} di-${newStatus === 'active' ? 'aktifkan' : 'nonaktifkan'}.`, 'success');
    fetchData();
  };

  const handleAddTenant = async (e) => {
    e.preventDefault();
    if (!newTenant.name || !newTenant.company_name) return;
    const { error } = await supabase.from('tenants').insert({
      name: newTenant.name.toLowerCase().replace(/\s+/g, '-'),
      company_name: newTenant.company_name,
      status: 'active'
    });
    if (error) { showToast('Gagal buat tenant: ' + error.message); return; }
    showToast('Tenant berhasil dibuat!', 'success');
    setShowAddTenant(false);
    setNewTenant({ name: '', company_name: '' });
    fetchData();
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUser.email || !newUser.password || !newUser.name) return;

    // 1. Buat auth user via Supabase signUp
    const { data: authData, error: authErr } = await supabase.auth.admin
      ? supabase.auth.admin.createUser({
          email: newUser.email,
          password: newUser.password,
          email_confirm: true,
          user_metadata: {
            name: newUser.name,
            role: newUser.role,
            tenant_name: tenants.find(t => t.id === newUser.tenant_id)?.name || ''
          }
        })
      : { data: null, error: { message: 'Admin API tidak tersedia dari client.' } };

    if (authErr) {
      showToast('Gagal buat user auth: ' + authErr.message);
      return;
    }

    showToast('User berhasil dibuat!', 'success');
    setShowAddUser(false);
    setNewUser({ name: '', email: '', password: '', role: 'Admin / Owner', tenant_id: '' });
    fetchData();
  };

  const cardStyle = {
    background: 'rgba(30, 41, 59, 0.5)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '12px'
  };

  const badgeStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: '700',
    background: active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
    color: active ? '#4ade80' : '#f87171',
    border: `1px solid ${active ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
  });

  const roleBadge = (role) => {
    const colors = {
      'SuperAdmin': { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
      'Admin / Owner': { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
      'Staff': { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', border: 'rgba(148,163,184,0.3)' }
    };
    const c = colors[role] || colors['Staff'];
    return {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '0.75rem',
      fontWeight: '700',
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`
    };
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Tenant', value: tenants.length, icon: <Building2 size={20} />, color: '#3b82f6' },
          { label: 'Tenant Aktif', value: tenants.filter(t => t.status === 'active').length, icon: <CheckCircle size={20} />, color: '#22c55e' },
          { label: 'Total User', value: users.length, icon: <Users size={20} />, color: '#f59e0b' }
        ].map((stat, i) => (
          <div key={i} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ color: stat.color, opacity: 0.8 }}>{stat.icon}</div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#f8fafc' }}>{stat.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { id: 'tenants', label: 'Tenants', icon: <Building2 size={15} /> },
          { id: 'users', label: 'Users', icon: <Users size={15} /> }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '8px', fontWeight: '700', fontSize: '0.85rem',
              border: 'none', cursor: 'pointer',
              background: activeSection === tab.id ? '#3b82f6' : 'rgba(30,41,59,0.5)',
              color: activeSection === tab.id ? '#fff' : '#94a3b8'
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
        <button onClick={fetchData} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 14px', borderRadius: '8px', fontWeight: '600', fontSize: '0.82rem',
          border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer'
        }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* TENANTS SECTION */}
      {activeSection === 'tenants' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: '#f8fafc', fontWeight: '700', margin: 0 }}>Daftar Tenant ({tenants.length})</h3>
            <button onClick={() => setShowAddTenant(true)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px', fontWeight: '700', fontSize: '0.82rem',
              border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer'
            }}>
              <Plus size={14} /> Tambah Tenant
            </button>
          </div>

          {tenants.map(tenant => (
            <div key={tenant.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '700', color: '#f8fafc', fontSize: '0.95rem' }}>{tenant.company_name}</span>
                  <span style={badgeStyle(tenant.status === 'active')}>
                    {tenant.status === 'active' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                    {tenant.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  ID: <span style={{ color: '#3b82f6', fontWeight: '600' }}>{tenant.name}</span>
                  {' · '}{users.filter(u => u.tenant_id === tenant.id).length} user
                  {tenant.pos_templates && ` · POS: ${tenant.pos_templates.display_name}`}
                </div>
              </div>
              <button onClick={() => handleToggleTenantStatus(tenant)} style={{
                padding: '6px 14px', borderRadius: '6px', fontWeight: '600', fontSize: '0.78rem',
                border: `1px solid ${tenant.status === 'active' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                background: 'transparent',
                color: tenant.status === 'active' ? '#f87171' : '#4ade80',
                cursor: 'pointer'
              }}>
                {tenant.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
            </div>
          ))}
        </>
      )}

      {/* USERS SECTION */}
      {activeSection === 'users' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: '#f8fafc', fontWeight: '700', margin: 0 }}>Daftar User ({users.length})</h3>
          </div>

          {users.map(user => (
            <div key={user.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '800', color: '#fff', fontSize: '0.9rem'
              }}>
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <span style={{ fontWeight: '700', color: '#f8fafc', fontSize: '0.9rem' }}>{user.name}</span>
                  <span style={roleBadge(user.role)}>{user.role}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {user.email}
                  {user.tenants && ` · ${user.tenants.company_name}`}
                  {!user.tenant_id && ' · Tidak terikat tenant'}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* MODAL: Tambah Tenant */}
      {showAddTenant && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '420px'
          }}>
            <h3 style={{ color: '#f8fafc', marginBottom: '20px', fontWeight: '800' }}>Tambah Tenant Baru</h3>
            <form onSubmit={handleAddTenant}>
              {[
                { label: 'Nama Tenant (ID)', key: 'name', placeholder: 'contoh: barventis-jakarta' },
                { label: 'Nama Perusahaan', key: 'company_name', placeholder: 'contoh: PT Barventis Jakarta' }
              ].map(field => (
                <div key={field.key} style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.82rem', color: '#94a3b8' }}>{field.label}</label>
                  <input
                    type="text" placeholder={field.placeholder} required
                    value={newTenant[field.key]}
                    onChange={e => setNewTenant(p => ({ ...p, [field.key]: e.target.value }))}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: '8px',
                      background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: '0.9rem', boxSizing: 'border-box'
                    }}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowAddTenant(false)} style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontWeight: '700',
                  border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', cursor: 'pointer'
                }}>Batal</button>
                <button type="submit" style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontWeight: '700',
                  border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer'
                }}>Buat Tenant</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
          padding: '12px 20px', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem',
          background: toast.type === 'success' ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)',
          color: '#fff', boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}