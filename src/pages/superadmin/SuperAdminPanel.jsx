import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Play, Pause, Edit3, Plus,
  Trash2, Search, FileSpreadsheet, CheckCircle,
  AlertCircle, Lock, Link as LinkIcon
} from 'lucide-react';
import { api } from '../../services/api';

export default function SuperAdminPanel({ tab }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Data States
  const [tenants, setTenants] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);

  // Filter States
  const [tenantFilter, setTenantFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Editor States
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantForm, setTenantForm] = useState({ name: '', company_name: '', locked_until_month: '', locked_until_year: '', overhead_pct: 0.05, is_pos_enabled: false });

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ name: '', display_name: '', mapping_str: '' });

  const displayToast = (message, type = 'success') => {
    if (type === 'success') {
      setSuccess(message);
      setTimeout(() => setSuccess(''), 4000);
    } else {
      setError(message);
      setTimeout(() => setError(''), 4000);
    }
  };

  // 1. Fetch data based on active tab
  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === 'tenants') {
        const [tenantsRes, materialsRes, recipesRes] = await Promise.all([
          supabase.from('tenants').select('*').order('created_at', { ascending: false }),
          supabase.from('materials').select('tenant_id'),
          supabase.from('recipes').select('tenant_id')
        ]);

        if (tenantsRes.error) throw tenantsRes.error;

        // Map material and recipe counts
        const matCounts = {};
        (materialsRes.data || []).forEach(m => {
          matCounts[m.tenant_id] = (matCounts[m.tenant_id] || 0) + 1;
        });

        const recCounts = {};
        (recipesRes.data || []).forEach(r => {
          recCounts[r.tenant_id] = (recCounts[r.tenant_id] || 0) + 1;
        });

        const enrichedTenants = (tenantsRes.data || []).map(t => ({
          ...t,
          materials_count: matCounts[t.id] || 0,
          recipes_count: recCounts[t.id] || 0
        }));

        setTenants(enrichedTenants);
      } else if (tab === 'templates') {
        const { data, error } = await supabase.from('pos_templates').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        setTemplates(data || []);
      } else if (tab === 'logs') {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*, tenants(name, company_name), users(name, role)')
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        setLogs(data || []);
        
        // Also fetch simple tenant list for filters
        const tenantsRes = await supabase.from('tenants').select('id, name, company_name');
        if (!tenantsRes.error) {
          setTenants(tenantsRes.data || []);
        }
      }
    } catch (err) {
      console.error(err);
      displayToast('Gagal memuat data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 2. Tenant Mutation Handlers
  const handleToggleTenantStatus = async (tenant) => {
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active';
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', tenant.id);
      
      if (error) throw error;
      
      displayToast(`Status tenant ${tenant.company_name} berhasil diubah ke ${newStatus.toUpperCase()}.`, 'success');
      fetchData();
    } catch (err) {
      displayToast('Gagal mengubah status: ' + err.message, 'error');
    }
  };

  const handleDeleteTenant = async (tenant) => {
    if (tenant.name === 'superadmin') {
      displayToast('Tenant @superadmin adalah tenant sistem dan tidak boleh dihapus.', 'error');
      return;
    }
    
    // Konfirmasi ganda karena aksi ini fatal (menghapus semua data tenant via Cascade)
    const confirmName = window.prompt(`PERINGATAN!\nMenghapus tenant ini akan MENGHAPUS SEMUA transaksi, material, dan resep milik "${tenant.company_name}".\nKetik "${tenant.name}" untuk melanjutkan:`);
    
    if (confirmName !== tenant.name) {
      if (confirmName !== null) displayToast('Penghapusan dibatalkan: Nama tenant tidak cocok.', 'error');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenant.id);
      
      if (error) throw error;
      
      displayToast(`Tenant ${tenant.company_name} beserta seluruh datanya berhasil dihapus permanen.`, 'success');
      fetchData();
    } catch (err) {
      displayToast('Gagal menghapus tenant: ' + err.message, 'error');
      setLoading(false);
    }
  };

  const handleGenerateInvite = async (tenant) => {
    try {
      setLoading(true);
      const inviteUrl = await api.generateTenantInvite(tenant.id);
      
      // Attempt to copy to clipboard
      try {
        await navigator.clipboard.writeText(inviteUrl);
        displayToast('Link OTP/Undangan disalin ke clipboard! (Berlaku 24 Jam)', 'success');
      } catch (clipErr) {
        // Fallback if clipboard API is not available (e.g., non-HTTPS)
        window.prompt('Link Undangan (Berlaku 24 Jam). Salin teks di bawah ini:', inviteUrl);
      }
    } catch (err) {
      displayToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTenant = async (e) => {
    e.preventDefault();
    try {
      if (selectedTenant) {
        // Edit Tenant
        const { error } = await supabase
          .from('tenants')
          .update({
            company_name: tenantForm.company_name,
            locked_until_month: tenantForm.locked_until_month ? parseInt(tenantForm.locked_until_month) : null,
            locked_until_year: tenantForm.locked_until_year ? parseInt(tenantForm.locked_until_year) : null,
            overhead_pct: tenantForm.overhead_pct ? parseFloat(tenantForm.overhead_pct) : 0.05,
            is_pos_enabled: !!tenantForm.is_pos_enabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedTenant.id);

        if (error) throw error;
        displayToast('Tenant berhasil diperbarui.', 'success');
      } else {
        // Create Tenant
        const formattedName = tenantForm.name.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (!formattedName) throw new Error('Subdomain tenant tidak valid!');

        // Cek apakah subdomain sudah ada untuk menghindari 409 Conflict
        const { data: existingTenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('name', formattedName)
          .maybeSingle();
          
        if (existingTenant) {
          throw new Error(`Subdomain "${formattedName}" sudah digunakan oleh tenant lain. Silakan pilih nama lain.`);
        }

        const { error } = await supabase
          .from('tenants')
          .insert({
            name: formattedName,
            company_name: tenantForm.company_name,
            overhead_pct: tenantForm.overhead_pct ? parseFloat(tenantForm.overhead_pct) : 0.05,
            is_pos_enabled: !!tenantForm.is_pos_enabled,
            status: 'active'
          });

        if (error) {
          if (error.code === '23505') throw new Error(`Subdomain "${formattedName}" sudah digunakan (Conflict).`);
          throw error;
        }
        displayToast('Tenant baru berhasil dibuat.', 'success');
      }
      setShowTenantModal(false);
      fetchData();
    } catch (err) {
      displayToast('Gagal menyimpan tenant: ' + err.message, 'error');
    }
  };

  const openTenantEdit = (tenant) => {
    setSelectedTenant(tenant);
    setTenantForm({
      name: tenant.name,
      company_name: tenant.company_name,
      locked_until_month: tenant.locked_until_month || '',
      locked_until_year: tenant.locked_until_year || '',
      overhead_pct: tenant.overhead_pct !== undefined ? tenant.overhead_pct : 0.05,
      is_pos_enabled: !!tenant.is_pos_enabled
    });
    setShowTenantModal(true);
  };

  const openTenantCreate = () => {
    setSelectedTenant(null);
    setTenantForm({ name: '', company_name: '', locked_until_month: '', locked_until_year: '', overhead_pct: 0.05, is_pos_enabled: false });
    setShowTenantModal(true);
  };

  // 3. POS Template Mutation Handlers
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    try {
      let mappingJson;
      try {
        mappingJson = JSON.parse(templateForm.mapping_str);
      } catch {
        throw new Error('Format Mapping JSON tidak valid! Harap cek tanda kurung dan koma.');
      }

      if (selectedTemplate) {
        // Edit Template
        const { error } = await supabase
          .from('pos_templates')
          .update({
            display_name: templateForm.display_name,
            column_mapping: mappingJson,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedTemplate.id);

        if (error) throw error;
        displayToast('Template POS berhasil diperbarui.', 'success');
      } else {
        // Create Template
        const { error } = await supabase
          .from('pos_templates')
          .insert({
            name: templateForm.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
            display_name: templateForm.display_name,
            column_mapping: mappingJson
          });

        if (error) throw error;
        displayToast('Template POS baru berhasil dibuat.', 'success');
      }
      setShowTemplateModal(false);
      fetchData();
    } catch (err) {
      displayToast('Gagal menyimpan template: ' + err.message, 'error');
    }
  };

  const openTemplateEdit = (tmpl) => {
    setSelectedTemplate(tmpl);
    setTemplateForm({
      name: tmpl.name,
      display_name: tmpl.display_name,
      mapping_str: JSON.stringify(tmpl.column_mapping, null, 2)
    });
    setShowTemplateModal(true);
  };

  const openTemplateCreate = () => {
    setSelectedTemplate(null);
    setTemplateForm({
      name: '',
      display_name: '',
      mapping_str: JSON.stringify({
        header_row_index: 0,
        branch_col: "outlet",
        sales_date_col: "date",
        menu_name_col: "item",
        menu_code_col: "sku",
        qty_col: "quantity",
        total_col: "gross sales"
      }, null, 2)
    });
    setShowTemplateModal(true);
  };

  const handleDeleteTemplate = async (id, name) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus template ${name}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const { error } = await supabase.from('pos_templates').delete().eq('id', id);
      if (error) throw error;
      displayToast('Template POS berhasil dihapus.', 'success');
      fetchData();
    } catch (err) {
      displayToast('Gagal menghapus template: ' + err.message, 'error');
    }
  };

  // 4. Log Filters and Search
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesTenant = !tenantFilter || log.tenant_id === tenantFilter;
      const matchesAction = !actionFilter || (log.action || '').toUpperCase() === actionFilter.toUpperCase();
      const matchesSearch = !searchQuery ||
        (log.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.action || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.users?.name && log.users.name.toLowerCase().includes(searchQuery.toLowerCase()));
      
      return matchesTenant && matchesAction && matchesSearch;
    });
  }, [logs, tenantFilter, actionFilter, searchQuery]);

  return (
    <div style={{ padding: '4px' }}>
      
      {/* Toast Alert */}
      {success && (
        <div className="glass-card" style={{
          position: 'fixed', top: '24px', right: '24px', background: 'rgba(34, 197, 94, 0.95)',
          color: 'var(--text-inverse)', padding: '12px 24px', borderRadius: 'var(--radius-md)', zIndex: 9999, border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
        }}>
          <CheckCircle size={18} /> <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="glass-card" style={{
          position: 'fixed', top: '24px', right: '24px', background: 'rgba(239, 68, 68, 0.95)',
          color: 'var(--text-inverse)', padding: '12px 24px', borderRadius: 'var(--radius-md)', zIndex: 9999, border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
        }}>
          <AlertCircle size={18} /> <span>{error}</span>
        </div>
      )}

      {/* Main Panel Card */}
      <div className="glass-card" style={{ padding: '24px', minHeight: '400px' }}>
        
        {/* TAB: TENANTS */}
        {tab === 'tenants' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--warning)', fontSize: '1.2rem', fontWeight: 800 }}>Daftar Client Resto / Tenant</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Total terdaftar: {tenants.length} outlet tenant aktif/nonaktif.
                </p>
              </div>
              <button className="btn btn-primary" onClick={openTenantCreate} style={{ background: 'var(--warning)', border: 'none', color: 'var(--text-inverse)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <Plus size={16} /> Buat Tenant Baru
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat data tenant...</div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Nama ID Resto</th>
                      <th>Nama Bisnis / Company</th>
                      <th style={{ textAlign: 'center' }}>Bahan Baku</th>
                      <th style={{ textAlign: 'center' }}>Resep COGS</th>
                      <th>Kunci Opname Periode</th>
                      <th>Modul POS</th>
                      <th>Status Akun</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>@</span>{t.name}
                        </td>
                        <td>{t.company_name}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{t.materials_count}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{t.recipes_count}</td>
                        <td>
                          {t.locked_until_month && t.locked_until_year ? (
                            <span style={{ color: 'var(--warning)', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Lock size={12} /> {t.locked_until_month}/{t.locked_until_year}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Terbuka (Tidak ada Kunci)</span>
                          )}
                        </td>
                        <td>
                          {t.is_pos_enabled ? (
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: 'var(--accent-glow)', color: 'var(--accent)' }}>POS ON</span>
                          ) : (
                            <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)' }}>POS OFF</span>
                          )}
                        </td>
                        <td>
                          <span style={{
                            padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                            background: t.status === 'active' ? 'var(--success-glow)' : 'var(--danger-glow)',
                            color: t.status === 'active' ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {(t.status || '').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} onClick={() => openTenantEdit(t)}>
                              <Edit3 size={14} /> Edit
                            </button>
                            <button
                              onClick={() => handleToggleTenantStatus(t)}
                              className="btn"
                              style={{
                                padding: '6px 10px', fontSize: '0.75rem', border: 'none',
                                background: t.status === 'active' ? 'var(--danger-glow)' : 'var(--success-glow)',
                                color: t.status === 'active' ? 'var(--danger)' : 'var(--success)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              {t.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                              {t.status === 'active' ? 'Suspend' : 'Aktifkan'}
                            </button>
                            <button
                              onClick={() => handleGenerateInvite(t)}
                              className="btn btn-secondary"
                              style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent)' }}
                              title="Buat Link Undangan Owner"
                            >
                              <LinkIcon size={14} /> Undangan
                            </button>
                            <button
                              onClick={() => handleDeleteTenant(t)}
                              className="btn"
                              style={{
                                padding: '6px 10px', fontSize: '0.75rem', border: 'none',
                                background: 'var(--danger-glow)',
                                color: 'var(--danger)',
                                cursor: t.name === 'superadmin' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                opacity: t.name === 'superadmin' ? 0.5 : 1
                              }}
                              title={t.name === 'superadmin' ? 'Tenant sistem tidak dapat dihapus' : 'Hapus permanen tenant dan datanya'}
                              disabled={t.name === 'superadmin'}
                            >
                              <Trash2 size={14} /> Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Belum ada tenant terdaftar.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: TEMPLATES */}
        {tab === 'templates' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: 'var(--warning)', fontSize: '1.2rem', fontWeight: 800 }}>Daftar Mapping Kolom Excel POS</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Manajemen mapping kolom berkas laporan penjualan POS global untuk tenant.
                </p>
              </div>
              <button className="btn btn-primary" onClick={openTemplateCreate} style={{ background: 'var(--warning)', border: 'none', color: 'var(--text-inverse)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <Plus size={16} /> Buat Template Baru
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat data template...</div>
            ) : (
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                {templates.map(tmpl => (
                  <div key={tmpl.id} className="glass-card" style={{ padding: '20px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <FileSpreadsheet size={20} style={{ color: 'var(--warning)' }} />
                        <h4 style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 800 }}>{tmpl.display_name}</h4>
                      </div>
                      <code style={{ fontSize: '0.7rem', color: 'var(--warning)', background: 'var(--warning-glow)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '12px' }}>
                        KEY: {tmpl.name}
                      </code>
                      <pre style={{
                        background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: 'var(--radius-md)', fontSize: '0.725rem',
                        overflowX: 'auto', border: '1px solid rgba(255,255,255,0.03)', color: 'var(--text-muted)', maxHeight: '180px'
                      }}>
                        {JSON.stringify(tmpl.column_mapping, null, 2)}
                      </pre>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => openTemplateEdit(tmpl)}>
                        <Edit3 size={12} /> Edit
                      </button>
                      {tmpl.name !== 'UMATIS_DEFAULT' && (
                        <button className="btn" style={{ padding: '6px 12px', fontSize: '0.75rem', background: 'var(--danger-glow)', color: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleDeleteTemplate(tmpl.id, tmpl.display_name)}>
                          <Trash2 size={12} /> Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: SYSTEM AUDIT LOGS */}
        {tab === 'logs' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: 'var(--warning)', fontSize: '1.2rem', fontWeight: 800 }}>Log Audit Sistem Terpusat</h3>
              <p style={{ margin: '4px 0 16px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Memantau semua aktivitas pengguna dari seluruh tenant secara real-time.
              </p>

              {/* Filters Bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-tertiary)', padding: '14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                {/* Search query */}
                <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Cari deskripsi, aksi, atau nama user..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px 8px 36px', background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.825rem', outline: 'none'
                    }}
                  />
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                </div>

                {/* Tenant Filter */}
                <div style={{ minWidth: '180px' }}>
                  <select
                    value={tenantFilter}
                    onChange={(e) => setTenantFilter(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.825rem', outline: 'none'
                    }}
                  >
                    <option value="">-- Semua Tenant --</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.company_name} (@{t.name})</option>
                    ))}
                  </select>
                </div>

                {/* Action Filter */}
                <div style={{ minWidth: '140px' }}>
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.825rem', outline: 'none'
                    }}
                  >
                    <option value="">-- Semua Aksi --</option>
                    <option value="LOGIN">LOGIN</option>
                    <option value="LOGOUT">LOGOUT</option>
                    <option value="REGISTER">REGISTER</option>
                    <option value="STOCK_ADJUST">STOCK_ADJUST</option>
                    <option value="RECIPE_SAVE">RECIPE_SAVE</option>
                    <option value="INVOICE_CREATE">INVOICE_CREATE</option>
                    <option value="INVOICE_RECEIVE">INVOICE_RECEIVE</option>
                    <option value="OPNAME_COMPLETE">OPNAME_COMPLETE</option>
                    <option value="RESTORE">RESTORE</option>
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Memuat logs...</div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '150px' }}>Tanggal & Waktu</th>
                      <th>Restoran / Tenant</th>
                      <th>Aksi</th>
                      <th>Pengguna</th>
                      <th>Deskripsi</th>
                      <th>Alamat IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(log.created_at).toLocaleString('id-ID', { hour12: false })}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--warning)' }}>
                          {log.tenants ? `${log.tenants.company_name} (@${log.tenants.name})` : 'System'}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                            background: log.action === 'LOGIN' ? 'var(--accent-glow)' : log.action === 'RESTORE' ? 'var(--danger-glow)' : 'rgba(255,255,255,0.06)',
                            color: log.action === 'LOGIN' ? 'var(--accent)' : log.action === 'RESTORE' ? 'var(--danger)' : 'var(--text-inverse)'
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td>
                          {log.users ? (
                            <div>
                              <div style={{ fontWeight: 600 }}>{log.users.name}</div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{log.users.role}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>System / Guest</span>
                          )}
                        </td>
                        <td>{log.description}</td>
                        <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{log.ip_address || '—'}</td>
                      </tr>
                    ))}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>Tidak ada log audit ditemukan yang cocok.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          TENANT MODAL (CREATE / EDIT)
          ==================================================================== */}
      {showTenantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '28px', border: '1px solid rgba(217, 119, 6, 0.15)' }}>
            <h4 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem' }}>
              {selectedTenant ? 'Edit Konfigurasi Tenant' : 'Daftarkan Tenant Baru'}
            </h4>
            <form onSubmit={handleSaveTenant} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ID Resto / Subdomain
                </label>
                <input
                  type="text"
                  placeholder="e.g. umatis-resto"
                  value={tenantForm.name}
                  onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                  required
                  disabled={!!selectedTenant} // Tenant ID tidak bisa diganti setelah dibuat
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none'
                  }}
                />
                {!selectedTenant && (
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '4px' }}>
                    Hanya karakter alfanumerik huruf kecil dan strip (a-z0-9-).
                  </small>
                )}
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Nama Bisnis (Company)
                </label>
                <input
                  type="text"
                  placeholder="e.g. PT Umatis Resto & Venue"
                  value={tenantForm.company_name}
                  onChange={(e) => setTenantForm({ ...tenantForm, company_name: e.target.value })}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Overhead HPP Rate (Condiment / Waste %)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  placeholder="e.g. 0.05 for 5%"
                  value={tenantForm.overhead_pct}
                  onChange={(e) => setTenantForm({ ...tenantForm, overhead_pct: e.target.value })}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none'
                  }}
                />
              </div>

              {selectedTenant && (
                <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Lock size={14} style={{ color: 'var(--warning)' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Kunci Edit Periode Bulanan</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Bulan (1-12)</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        placeholder="e.g. 4"
                        value={tenantForm.locked_until_month}
                        onChange={(e) => setTenantForm({ ...tenantForm, locked_until_month: e.target.value })}
                        style={{
                          width: '100%', padding: '6px 10px', background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none'
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Tahun</label>
                      <input
                        type="number"
                        min="2020"
                        max="2100"
                        placeholder="e.g. 2026"
                        value={tenantForm.locked_until_year}
                        onChange={(e) => setTenantForm({ ...tenantForm, locked_until_year: e.target.value })}
                        style={{
                          width: '100%', padding: '6px 10px', background: 'var(--bg-secondary)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none'
                        }}
                      />
                    </div>
                  </div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '6px' }}>
                    Mengunci modifikasi transaksi/opname pada periode sebelum atau sama dengan bulan di atas.
                  </small>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTenantModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--warning)', border: 'none' }}>
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          TEMPLATE MODAL (CREATE / EDIT)
          ==================================================================== */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', padding: '28px', border: '1px solid rgba(217, 119, 6, 0.15)' }}>
            <h4 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)', fontWeight: 800, fontSize: '1.1rem' }}>
              {selectedTemplate ? 'Edit Template POS Mapping' : 'Buat Template POS Baru'}
            </h4>
            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Kode Template (Unique Key)
                </label>
                <input
                  type="text"
                  placeholder="e.g. MOKA_POS"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  required
                  disabled={!!selectedTemplate}
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Nama Tampilan (Display Name)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Moka POS (Row 0 Header)"
                  value={templateForm.display_name}
                  onChange={(e) => setTemplateForm({ ...templateForm, display_name: e.target.value })}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  JSON Column Mapping
                </label>
                <textarea
                  rows="9"
                  value={templateForm.mapping_str}
                  onChange={(e) => setTemplateForm({ ...templateForm, mapping_str: e.target.value })}
                  required
                  style={{
                    width: '100%', padding: '9px 12px', background: 'rgba(15,23,42,0.6)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--warning)', fontSize: '0.8rem',
                    fontFamily: 'monospace', outline: 'none', resize: 'vertical'
                  }}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.7rem', display: 'block', marginTop: '4px' }}>
                  Harus berformat JSON dengan properties wajib: `header_row_index`, `branch_col`, `sales_date_col`, `menu_name_col`, `qty_col`, `total_col`.
                </small>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--warning)', border: 'none' }}>
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}


