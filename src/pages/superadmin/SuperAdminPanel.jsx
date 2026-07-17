import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Play, Pause, Edit3, Plus,
  Trash2, Search, FileSpreadsheet, CheckCircle,
  AlertCircle, Lock, Link as LinkIcon, Users,
  Database, Activity, ShieldAlert, Eye, Calendar, Percent
} from 'lucide-react';
import { api } from '../../services/api';

// Landing Page Inspired Theme Palette & CSS Variables (No Tailwind)
const colors = {
  primary: '#00685f', // Emerald Green-Teal
  primaryHover: '#005049',
  primaryLight: '#eceef0',
  cream: '#FDFBF7',
  warmWhite: '#FAFAF8',
  accent: '#ffb95f', // Golden Amber Accent
  tertiary: '#825100', // Deep Amber / Golden Brown
  textPrimary: '#2d2a26',
  textSecondary: '#5a554f',
  textMuted: '#8a8580',
  border: 'rgba(109, 122, 119, 0.12)',
  borderLight: 'rgba(109, 122, 119, 0.06)',
  success: '#059669',
  successGlow: 'rgba(5, 150, 105, 0.08)',
  danger: '#dc2626',
  dangerGlow: 'rgba(220, 38, 38, 0.08)',
  warning: '#d97706',
  warningGlow: 'rgba(217, 119, 6, 0.08)',
};

const glassCardStyle = {
  background: 'rgba(255, 253, 250, 0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${colors.border}`,
  borderRadius: '12px',
  boxShadow: '0 8px 32px 0 rgba(45, 42, 38, 0.05)',
  padding: '16px 20px',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255, 255, 255, 0.95)',
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  color: colors.textPrimary,
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  outline: 'none',
  transition: 'all 0.2s ease',
};

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
  const [selectedDetailTenant, setSelectedDetailTenant] = useState(null);

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
        const [logsRes, tenantsRes] = await Promise.all([
          supabase
            .from('audit_logs')
            .select('*, tenants(name, company_name), users(name, role)')
            .order('created_at', { ascending: false })
            .limit(200),
          supabase.from('tenants').select('id, name, company_name')
        ]);

        if (logsRes.error) throw logsRes.error;
        setLogs(logsRes.data || []);
        
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
    
    // Konfirmasi ganda
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
      
      try {
        await navigator.clipboard.writeText(inviteUrl);
        displayToast('Link OTP/Undangan disalin! (Berlaku 24 Jam)', 'success');
      } catch {
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
            overhead_pct: tenantForm.overhead_pct !== '' ? parseFloat(tenantForm.overhead_pct) : 0.05,
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
            overhead_pct: tenantForm.overhead_pct !== '' ? parseFloat(tenantForm.overhead_pct) : 0.05,
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

  // Dynamic Dashboard Stats to follow the premium landing layout
  const tenantStats = useMemo(() => {
    const total = tenants.length;
    const active = tenants.filter(t => t.status === 'active').length;
    const suspended = tenants.filter(t => t.status === 'suspended').length;
    const totalBahan = tenants.reduce((sum, t) => sum + (t.materials_count || 0), 0);
    const totalResep = tenants.reduce((sum, t) => sum + (t.recipes_count || 0), 0);
    return { total, active, suspended, totalBahan, totalResep };
  }, [tenants]);

  const templateStats = useMemo(() => {
    const total = templates.length;
    const custom = templates.filter(t => t.name !== 'UMATIS_DEFAULT').length;
    return { total, custom };
  }, [templates]);

  const logStats = useMemo(() => {
    const total = filteredLogs.length;
    const logins = logs.filter(l => l.action === 'LOGIN').length;
    return { total, logins };
  }, [filteredLogs, logs]);

  return (
    <div style={{ fontFamily: 'var(--font-sans)', color: colors.textPrimary }}>
      
      {/* Elegant Toast Notifications */}
      {success && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', background: 'rgba(255, 255, 255, 0.95)',
          color: colors.success, padding: '14px 24px', borderRadius: '12px', zIndex: 9999, 
          borderLeft: `5px solid ${colors.success}`, display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)', backdropFilter: 'blur(10px)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <CheckCircle size={18} style={{ color: colors.success }} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{success}</span>
        </div>
      )}

      {error && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', background: 'rgba(255, 255, 255, 0.95)',
          color: colors.danger, padding: '14px 24px', borderRadius: '12px', zIndex: 9999, 
          borderLeft: `5px solid ${colors.danger}`, display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)', backdropFilter: 'blur(10px)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <AlertCircle size={18} style={{ color: colors.danger }} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{error}</span>
        </div>
      )}

      {/* Dynamic Statistics Bento-Grid based on current active tab */}
      {tab === 'tenants' && (
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={{ ...glassCardStyle, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255,253,250,0.9) 0%, rgba(255,185,95,0.05) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total Client Resto</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(0,104,95,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} style={{ color: colors.primary }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.textPrimary, lineHeight: 1.2 }}>{tenantStats.total}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Unit usaha terdaftar aktif/nonaktif</div>
          </div>

          <div style={{ ...glassCardStyle, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255,253,250,0.9) 0%, rgba(5,150,105,0.05) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Tenant Aktif</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(5,150,105,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={15} style={{ color: colors.success }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.success, lineHeight: 1.2 }}>{tenantStats.active}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Menjalankan operasional normal</div>
          </div>

          <div style={{ ...glassCardStyle, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Bahan Baku Terpantau</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(0,104,95,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={15} style={{ color: colors.primary }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.textPrimary, lineHeight: 1.2 }}>{tenantStats.totalBahan}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Item database di seluruh sistem</div>
          </div>

          <div style={{ ...glassCardStyle, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255,253,250,0.9) 0%, rgba(130,81,0,0.05) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total Resep Terpeta</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(130,81,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={15} style={{ color: colors.tertiary }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.tertiary, lineHeight: 1.2 }}>{tenantStats.totalResep}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Formula COGS terdaftar di outlet</div>
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={{ ...glassCardStyle, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255,253,250,0.9) 0%, rgba(0,104,95,0.05) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Total Mesin POS Terintegrasi</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(0,104,95,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileSpreadsheet size={15} style={{ color: colors.primary }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.textPrimary, lineHeight: 1.2 }}>{templateStats.total}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Mesin kasir (Moka, Pawoon, Olsera, ESB)</div>
          </div>

          <div style={{ ...glassCardStyle, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Custom Template</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(217,119,6,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Edit3 size={15} style={{ color: colors.warning }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.warning, lineHeight: 1.2 }}>{templateStats.custom}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Mapping disesuaikan khusus oleh superadmin</div>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={{ ...glassCardStyle, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255,253,250,0.9) 0%, rgba(0,104,95,0.05) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Security & Audit Events</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(0,104,95,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={15} style={{ color: colors.primary }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.textPrimary, lineHeight: 1.2 }}>{logStats.total}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Aktivitas pengguna terekam sistem</div>
          </div>

          <div style={{ ...glassCardStyle, padding: '12px 16px', background: 'linear-gradient(135deg, rgba(255,253,250,0.9) 0%, rgba(217,119,6,0.05) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Log Masuk (Sessions)</span>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(217,119,6,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} style={{ color: colors.warning }} />
              </div>
            </div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: colors.warning, lineHeight: 1.2 }}>{logStats.logins}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: '2px' }}>Autentikasi sesi aktif tenant</div>
          </div>
        </div>
      )}

      {/* Main Glassmorphic Panel Wrapper */}
      <div style={glassCardStyle}>
        
        {/* TAB 1: TENANTS */}
        {tab === 'tenants' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, color: colors.primary, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Daftar Client Resto / Tenant</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: colors.textSecondary }}>
                  Total terdaftar: <strong style={{ color: colors.primary }}>{tenants.length}</strong> outlet tenant aktif/nonaktif di ekosistem Barventis.
                </p>
              </div>
              <button 
                onClick={openTenantCreate} 
                style={{ 
                  background: colors.primary, 
                  border: 'none', 
                  color: '#fff', 
                  display: 'flex', 
                  gap: '6px', 
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,104,95,0.15)',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = colors.primaryHover;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = colors.primary;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Plus size={14} /> Buat Tenant Baru
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: colors.textMuted }}>
                <div style={{ width: '24px', height: '24px', border: '3px solid rgba(0,104,95,0.1)', borderTopColor: colors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }}></div>
                <p style={{ fontSize: '0.8rem' }}>Sinkronisasi data tenant...</p>
              </div>
            ) : (
              <div className="table-container" style={{ borderRadius: '8px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,104,95,0.03)' }}>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Nama ID Resto</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Nama Bisnis / Company</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Kunci Opname</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Modul POS</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Status Akun</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, textAlign: 'right' }}>Aksi Kelola</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(t => (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                        <td style={{ padding: '8px 12px' }}>
                          <span 
                            onClick={() => setSelectedDetailTenant(t)}
                            style={{ 
                              fontWeight: 700, 
                              color: colors.primary, 
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: 'rgba(0,104,95,0.04)',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = 'rgba(0,104,95,0.08)';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = 'rgba(0,104,95,0.04)';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            title="Klik untuk melihat detail informasi tenant"
                          >
                            <span style={{ opacity: 0.7, fontSize: '0.8rem' }}>@</span>{t.name}
                            <Eye size={11} style={{ opacity: 0.6 }} />
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: colors.textPrimary, fontWeight: 500 }}>{t.company_name}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {t.locked_until_month && t.locked_until_year ? (
                            <span style={{ color: colors.warning, fontSize: '0.725rem', display: 'inline-flex', alignItems: 'center', gap: '4px', background: colors.warningGlow, padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              <Lock size={11} /> {t.locked_until_month}/{t.locked_until_year}
                            </span>
                          ) : (
                            <span style={{ color: colors.textMuted, fontSize: '0.725rem' }}>Terbuka (Tidak dikunci)</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {t.is_pos_enabled ? (
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(0,104,95,0.08)', color: colors.primary }}>POS ON</span>
                          ) : (
                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(0,0,0,0.03)', color: colors.textMuted }}>POS OFF</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                            background: t.status === 'active' ? colors.successGlow : colors.dangerGlow,
                            color: t.status === 'active' ? colors.success : colors.danger
                          }}>
                            {(t.status || '').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '0.725rem', borderRadius: '6px', display: 'flex', gap: '4px', alignItems: 'center' }} 
                              onClick={() => openTenantEdit(t)}
                            >
                              <Edit3 size={11} /> Edit
                            </button>
                            <button
                              onClick={() => handleToggleTenantStatus(t)}
                              style={{
                                padding: '4px 8px', fontSize: '0.725rem', border: 'none', borderRadius: '6px',
                                background: t.status === 'active' ? colors.dangerGlow : colors.successGlow,
                                color: t.status === 'active' ? colors.danger : colors.success,
                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600
                              }}
                            >
                              {t.status === 'active' ? <Pause size={11} /> : <Play size={11} />}
                              {t.status === 'active' ? 'Suspend' : 'Aktifkan'}
                            </button>
                            <button
                              onClick={() => handleGenerateInvite(t)}
                              style={{ 
                                padding: '4px 8px', fontSize: '0.725rem', display: 'flex', alignItems: 'center', gap: '4px', 
                                color: colors.primary, background: 'rgba(0,104,95,0.06)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 
                              }}
                              title="Buat Link Undangan Owner"
                            >
                              <LinkIcon size={11} /> Undangan
                            </button>
                            <button
                              onClick={() => handleDeleteTenant(t)}
                              style={{
                                padding: '4px 8px', fontSize: '0.725rem', border: 'none', borderRadius: '6px',
                                background: colors.dangerGlow,
                                color: colors.danger,
                                cursor: t.name === 'superadmin' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                                opacity: t.name === 'superadmin' ? 0.35 : 1, fontWeight: 600
                              }}
                              title={t.name === 'superadmin' ? 'Tenant sistem tidak dapat dihapus' : 'Hapus permanen tenant dan datanya'}
                              disabled={t.name === 'superadmin'}
                            >
                              <Trash2 size={11} /> Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', color: colors.textMuted, padding: '32px' }}>Belum ada tenant terdaftar.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TEMPLATES */}
        {tab === 'templates' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, color: colors.primary, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Daftar Mapping Kolom Excel POS</h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: colors.textSecondary }}>
                  Konfigurasi dan pemetaan berkas transaksi POS harian global untuk stock-out.
                </p>
              </div>
              <button 
                onClick={openTemplateCreate} 
                style={{ 
                  background: colors.primary, 
                  border: 'none', 
                  color: '#fff', 
                  display: 'flex', 
                  gap: '6px', 
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,104,95,0.15)',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = colors.primaryHover;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = colors.primary;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Plus size={14} /> Buat Template Baru
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: colors.textMuted }}>
                <div style={{ width: '24px', height: '24px', border: '3px solid rgba(0,104,95,0.1)', borderTopColor: colors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }}></div>
                <p style={{ fontSize: '0.8rem' }}>Mengambil template POS...</p>
              </div>
            ) : (
              <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {templates.map(tmpl => (
                  <div key={tmpl.id} style={{ ...glassCardStyle, padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.7)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(0,104,95,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileSpreadsheet size={14} style={{ color: colors.primary }} />
                        </div>
                        <h4 style={{ margin: 0, color: colors.textPrimary, fontWeight: 800, fontSize: '0.875rem' }}>{tmpl.display_name}</h4>
                      </div>
                      
                      <div style={{ marginBottom: '10px' }}>
                        <code style={{ fontSize: '0.65rem', color: colors.tertiary, background: 'rgba(130,81,0,0.06)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          ID TEMPLATE: {tmpl.name}
                        </code>
                      </div>

                      <pre style={{
                        background: 'rgba(26,25,23,0.03)', padding: '8px', borderRadius: '6px', fontSize: '0.7rem',
                        overflowX: 'auto', border: `1px solid ${colors.border}`, color: colors.textSecondary, maxHeight: '140px',
                        fontFamily: 'monospace', lineHeight: '1.3'
                      }}>
                        {JSON.stringify(tmpl.column_mapping, null, 2)}
                      </pre>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 8px', fontSize: '0.725rem', borderRadius: '6px', display: 'inline-flex', gap: '4px', alignItems: 'center' }} 
                        onClick={() => openTemplateEdit(tmpl)}
                      >
                        <Edit3 size={11} /> Edit Template
                      </button>
                      {tmpl.name !== 'UMATIS_DEFAULT' && (
                        <button 
                          style={{ 
                            padding: '4px 8px', fontSize: '0.725rem', background: colors.dangerGlow, color: colors.danger, 
                            border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 
                          }} 
                          onClick={() => handleDeleteTemplate(tmpl.id, tmpl.display_name)}
                        >
                          <Trash2 size={11} /> Hapus
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SYSTEM AUDIT LOGS */}
        {tab === 'logs' && (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <h3 style={{ margin: 0, color: colors.primary, fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Log Audit Sistem Terpusat</h3>
              <p style={{ margin: '2px 0 12px 0', fontSize: '0.78rem', color: colors.textSecondary }}>
                Konsolidasi linimasa riwayat log aktivitas, perubahan operasional, input data, dan audit keamanan sistem Barventis.
              </p>

              {/* Filters Bar with landing style */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', background: 'rgba(0,104,95,0.02)', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                {/* Search input */}
                <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Cari deskripsi, aksi, atau nama user..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      ...inputStyle,
                      paddingLeft: '32px',
                      border: `1px solid ${colors.border}`
                    }}
                  />
                  <Search size={13} style={{ position: 'absolute', left: '10px', top: '10px', color: colors.textMuted }} />
                </div>

                {/* Tenant Filter */}
                <div style={{ minWidth: '160px' }}>
                  <select
                    value={tenantFilter}
                    onChange={(e) => setTenantFilter(e.target.value)}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
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
                      ...inputStyle,
                      cursor: 'pointer',
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
              <div style={{ textAlign: 'center', padding: '40px 0', color: colors.textMuted }}>
                <div style={{ width: '24px', height: '24px', border: '3px solid rgba(0,104,95,0.1)', borderTopColor: colors.primary, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px' }}></div>
                <p style={{ fontSize: '0.8rem' }}>Mengambil log aktivitas...</p>
              </div>
            ) : (
              <div className="table-container" style={{ borderRadius: '8px', border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,104,95,0.03)' }}>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, width: '150px' }}>Tanggal & Waktu</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Restoran / Tenant</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, width: '100px' }}>Aksi</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Pengguna</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>Deskripsi</th>
                      <th style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}`, width: '110px' }}>Alamat IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                        <td style={{ padding: '8px 12px', color: colors.textMuted }}>
                          {new Date(log.created_at).toLocaleString('id-ID', { hour12: false })}
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: colors.primary }}>
                          {log.tenants ? `${log.tenants.company_name} (@${log.tenants.name})` : 'System'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
                            background: log.action === 'LOGIN' ? colors.successGlow : log.action === 'RESTORE' ? colors.dangerGlow : 'rgba(0,0,0,0.03)',
                            color: log.action === 'LOGIN' ? colors.success : log.action === 'RESTORE' ? colors.danger : colors.textPrimary
                          }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {log.users ? (
                            <div>
                              <div style={{ fontWeight: 600, color: colors.textPrimary }}>{log.users.name}</div>
                              <div style={{ fontSize: '0.65rem', color: colors.textMuted }}>{log.users.role}</div>
                            </div>
                          ) : (
                            <span style={{ color: colors.textMuted, fontSize: '0.725rem' }}>Sistem Otomatis</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: colors.textSecondary, fontWeight: 500 }}>{log.description}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: colors.textMuted, fontSize: '0.725rem' }}>{log.ip_address || '—'}</td>
                      </tr>
                    ))}
                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: colors.textMuted, padding: '20px' }}>Tidak ada log audit ditemukan yang cocok.</td>
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
          TENANT MODAL (CREATE / EDIT) - Redesigned with Glassmorphism Overlay
          ==================================================================== */}
      {showTenantModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.35)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ ...glassCardStyle, width: '100%', maxWidth: '440px', padding: '16px 20px', border: `1px solid ${colors.primary}22` }}>
            <h4 style={{ margin: '0 0 6px 0', color: colors.primary, fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
              {selectedTenant ? 'Edit Konfigurasi Tenant' : 'Daftarkan Tenant Baru'}
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: colors.textSecondary }}>
              Masukkan detail identitas restoran dan konfigurasi parameter sistem di bawah ini.
            </p>
            
            <form onSubmit={handleSaveTenant} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.725rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ID Resto / Subdomain
                </label>
                <input
                  type="text"
                  placeholder="e.g. umatis-resto"
                  value={tenantForm.name}
                  onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                  required
                  disabled={!!selectedTenant}
                  style={{
                    ...inputStyle,
                    background: selectedTenant ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.95)',
                    cursor: selectedTenant ? 'not-allowed' : 'text'
                  }}
                />
                {!selectedTenant && (
                  <small style={{ color: colors.textMuted, fontSize: '0.65rem', display: 'block', marginTop: '3px' }}>
                    Hanya karakter alfanumerik huruf kecil dan strip (a-z0-9-).
                  </small>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.725rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Nama Bisnis (Company)
                </label>
                <input
                  type="text"
                  placeholder="e.g. PT Umatis Resto & Venue"
                  value={tenantForm.company_name}
                  onChange={(e) => setTenantForm({ ...tenantForm, company_name: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.725rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: 'rgba(0,104,95,0.03)', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                <input
                  id="is_pos_enabled"
                  type="checkbox"
                  checked={!!tenantForm.is_pos_enabled}
                  onChange={(e) => setTenantForm({ ...tenantForm, is_pos_enabled: e.target.checked })}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: colors.primary,
                    cursor: 'pointer',
                    marginTop: '2px'
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={() => setTenantForm({ ...tenantForm, is_pos_enabled: !tenantForm.is_pos_enabled })}>
                  <label htmlFor="is_pos_enabled" style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textPrimary, cursor: 'pointer', margin: 0 }}>
                    Aktivasi Modul POS (Upload Sales & Stock-Out)
                  </label>
                  <span style={{ fontSize: '0.65rem', color: colors.textMuted }}>
                    Aktifkan fitur sinkronisasi penjualan harian, pemetaan resep COGS dan pengurangan stok otomatis.
                  </span>
                </div>
              </div>

              {selectedTenant && (
                <div style={{ background: 'rgba(130,81,0,0.03)', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <Lock size={12} style={{ color: colors.warning }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textPrimary }}>Kunci Edit Periode Bulanan</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.65rem', color: colors.textSecondary, marginBottom: '2px' }}>Bulan (1-12)</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        placeholder="e.g. 4"
                        value={tenantForm.locked_until_month}
                        onChange={(e) => setTenantForm({ ...tenantForm, locked_until_month: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.65rem', color: colors.textSecondary, marginBottom: '2px' }}>Tahun</label>
                      <input
                        type="number"
                        min="2020"
                        max="2100"
                        placeholder="e.g. 2026"
                        value={tenantForm.locked_until_year}
                        onChange={(e) => setTenantForm({ ...tenantForm, locked_until_year: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <small style={{ color: colors.textMuted, fontSize: '0.65rem', display: 'block', marginTop: '6px' }}>
                    Mengunci modifikasi transaksi/opname pada periode sebelum atau sama dengan bulan di atas.
                  </small>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem' }} 
                  onClick={() => setShowTenantModal(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  style={{ 
                    background: colors.primary, 
                    border: 'none', 
                    color: '#fff', 
                    padding: '6px 12px', 
                    borderRadius: '6px', 
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = colors.primaryHover}
                  onMouseOut={(e) => e.currentTarget.style.background = colors.primary}
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================
          DETAIL TENANT MODAL (BY CLICK INFO DETAILS)
          ==================================================================== */}
      {selectedDetailTenant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.35)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ ...glassCardStyle, width: '100%', maxWidth: '420px', padding: '16px 20px', border: `1px solid ${colors.primary}22` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: `1px solid ${colors.border}`, paddingBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: colors.tertiary, background: 'rgba(130,81,0,0.06)', padding: '2px 4px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Detail Informasi Tenant
                </span>
                <h4 style={{ margin: '2px 0 0 0', color: colors.primary, fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {selectedDetailTenant.company_name} <span style={{ color: colors.textSecondary, fontWeight: 500, fontSize: '0.8rem' }}>(@{selectedDetailTenant.name})</span>
                </h4>
              </div>
              <span style={{
                padding: '2px 6px', borderRadius: '4px', fontSize: '0.675rem', fontWeight: 800,
                background: selectedDetailTenant.status === 'active' ? colors.successGlow : colors.dangerGlow,
                color: selectedDetailTenant.status === 'active' ? colors.success : colors.danger
              }}>
                {(selectedDetailTenant.status || '').toUpperCase()}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
              
              {/* Row 1: General Meta */}
              <div style={{ background: 'rgba(26,25,23,0.02)', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${colors.borderLight}` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <span style={{ color: colors.textSecondary, fontWeight: 600 }}>Database UUID:</span>
                    <span style={{ fontFamily: 'monospace', color: colors.textMuted, fontSize: '0.65rem' }}>{selectedDetailTenant.id}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <span style={{ color: colors.textSecondary, fontWeight: 600 }}>Resto ID / Subdomain:</span>
                    <span style={{ fontWeight: 700, color: colors.primary }}>@{selectedDetailTenant.name}</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Financial & Rates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'rgba(130,81,0,0.02)', padding: '8px', borderRadius: '6px', border: `1px solid ${colors.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
                    <Percent size={11} style={{ color: colors.tertiary }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase' }}>Overhead HPP</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.tertiary }}>
                    {((selectedDetailTenant.overhead_pct || 0) * 100).toFixed(0)}%
                  </div>
                  <span style={{ fontSize: '0.55rem', color: colors.textMuted, display: 'block' }}>
                    Condiment & waste markup
                  </span>
                </div>

                <div style={{ background: 'rgba(0,104,95,0.02)', padding: '8px', borderRadius: '6px', border: `1px solid ${colors.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
                    <Activity size={11} style={{ color: colors.primary }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase' }}>Modul POS</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '1.2rem' }}>
                    <span style={{
                      padding: '1px 4px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 800,
                      background: selectedDetailTenant.is_pos_enabled ? colors.successGlow : 'rgba(0,0,0,0.05)',
                      color: selectedDetailTenant.is_pos_enabled ? colors.success : colors.textMuted
                    }}>
                      {selectedDetailTenant.is_pos_enabled ? 'ACTIVE' : 'OFF'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.55rem', color: colors.textMuted, display: 'block' }}>
                    Daily sales integration
                  </span>
                </div>
              </div>

              {/* Row 3: Stats (Materials & Recipes) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: 'rgba(26,25,23,0.01)', padding: '8px', borderRadius: '6px', border: `1px solid ${colors.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
                    <Database size={11} style={{ color: colors.primary }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase' }}>Bahan Baku</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.textPrimary }}>
                    {selectedDetailTenant.materials_count || 0} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: colors.textSecondary }}>Item</span>
                  </div>
                </div>

                <div style={{ background: 'rgba(26,25,23,0.01)', padding: '8px', borderRadius: '6px', border: `1px solid ${colors.borderLight}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
                    <FileSpreadsheet size={11} style={{ color: colors.tertiary }} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase' }}>Resep COGS</span>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.textPrimary }}>
                    {selectedDetailTenant.recipes_count || 0} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: colors.textSecondary }}>Formula</span>
                  </div>
                </div>
              </div>

              {/* Row 4: Locked Period & Registered Date */}
              <div style={{ background: 'rgba(130,81,0,0.02)', padding: '8px 10px', borderRadius: '6px', border: `1px solid ${colors.borderLight}` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.675rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: colors.textSecondary, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Lock size={11} /> Proteksi Edit:</span>
                    <span style={{ fontWeight: 700, color: selectedDetailTenant.locked_until_month ? colors.warning : colors.textMuted }}>
                      {selectedDetailTenant.locked_until_month && selectedDetailTenant.locked_until_year 
                        ? `≤ Bulan ${selectedDetailTenant.locked_until_month}/${selectedDetailTenant.locked_until_year}`
                        : 'Terbuka (Bebas)'
                      }
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: colors.textSecondary, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Calendar size={11} /> Terdaftar:</span>
                    <span style={{ color: colors.textPrimary, fontWeight: 500 }}>
                      {selectedDetailTenant.created_at ? new Date(selectedDetailTenant.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: `1px solid ${colors.border}`, paddingTop: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ borderRadius: '4px', padding: '4px 10px', fontSize: '0.7rem', marginRight: 'auto' }} 
                onClick={() => setSelectedDetailTenant(null)}
              >
                Tutup
              </button>

              <button
                onClick={() => {
                  setSelectedDetailTenant(null);
                  openTenantEdit(selectedDetailTenant);
                }}
                className="btn btn-secondary"
                style={{ borderRadius: '4px', padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', borderColor: colors.primary, color: colors.primary }}
              >
                <Edit3 size={11} /> Edit Konfigurasi
              </button>

              <button
                onClick={() => {
                  handleGenerateInvite(selectedDetailTenant);
                }}
                style={{ 
                  padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px', 
                  color: colors.primary, background: 'rgba(0,104,95,0.06)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 
                }}
              >
                <LinkIcon size={11} /> Copy Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TEMPLATE MODAL (CREATE / EDIT) - Redesigned
          ==================================================================== */}
      {showTemplateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.35)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div style={{ ...glassCardStyle, width: '100%', maxWidth: '500px', padding: '16px 20px', border: `1px solid ${colors.primary}22` }}>
            <h4 style={{ margin: '0 0 6px 0', color: colors.primary, fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
              {selectedTemplate ? 'Edit Template POS Mapping' : 'Buat Template POS Baru'}
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '0.78rem', color: colors.textSecondary }}>
              Tentukan pemetaan kolom Excel POS untuk parsing data menu sales & quantity secara akurat.
            </p>
            
            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.725rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Kode Template (Unique Key)
                </label>
                <input
                  type="text"
                  placeholder="e.g. MOKA_POS"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  required
                  disabled={!!selectedTemplate}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.725rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Nama Tampilan (Display Name)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Moka POS (Row 0 Header)"
                  value={templateForm.display_name}
                  onChange={(e) => setTemplateForm({ ...templateForm, display_name: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.725rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  JSON Column Mapping
                </label>
                <textarea
                  rows="7"
                  value={templateForm.mapping_str}
                  onChange={(e) => setTemplateForm({ ...templateForm, mapping_str: e.target.value })}
                  required
                  style={{
                    ...inputStyle,
                    background: '#1e293b',
                    color: '#ffb95f',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    resize: 'vertical'
                  }}
                />
                <small style={{ color: colors.textMuted, fontSize: '0.65rem', display: 'block', marginTop: '4px' }}>
                  Harus berformat JSON dengan properties wajib: `header_row_index`, `branch_col`, `sales_date_col`, `menu_name_col`, `qty_col`, `total_col`.
                </small>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ borderRadius: '6px', padding: '6px 12px', fontSize: '0.75rem' }} 
                  onClick={() => setShowTemplateModal(false)}
                >
                  Batal
                </button>
                <button 
                  type="submit" 
                  style={{ 
                    background: colors.primary, 
                    border: 'none', 
                    color: '#fff', 
                    padding: '6px 12px', 
                    borderRadius: '6px', 
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = colors.primaryHover}
                  onMouseOut={(e) => e.currentTarget.style.background = colors.primary}
                >
                  Simpan Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal Animation Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

    </div>
  );
}
