import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Building2, Users, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Crown, Search, ChevronDown, Edit2, X,
  Save, ArrowLeft, Plus, Shield, Clock, UserPlus, Copy, Mail, Check
} from 'lucide-react';

// ── Design tokens ─────────────────────────────────────────────────
const T = {
  brand: '#3b82f6', brandLight: '#eff6ff', brandMid: 'rgba(59,130,246,.12)',
  green: '#16a34a', greenLight: '#f0fdf4',
  red: '#dc2626', redLight: '#fef2f2',
  amber: '#d97706', amberLight: '#fffbeb',
  text: '#0f172a', textSub: '#475569', textMuted: '#94a3b8',
  surface: '#ffffff', surfaceAlt: '#f8fafc',
  border: '#e2e8f0', borderLight: '#f1f5f9',
  shadow: '0 1px 3px rgba(0,0,0,.08)',
  rSm: '8px', rMd: '10px', rLg: '14px', rXl: '18px',
  fontBody: "'DM Sans','Inter',system-ui,sans-serif",
  fontDisplay: "'Sora','DM Sans',system-ui,sans-serif",
};

const STATUS_META = {
  active:   { label: 'Aktif',       bg: T.greenLight, color: T.green, border: '#bbf7d0', Icon: CheckCircle2 },
  inactive: { label: 'Nonaktif',    bg: T.redLight,   color: T.red,   border: '#fecaca', Icon: XCircle },
  trial:    { label: 'Trial',       bg: T.amberLight, color: T.amber, border: '#fde68a', Icon: Clock },
};

const ROLE_META = {
  'SuperAdmin':    { label: 'Super Admin',  bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
  'Admin / Owner': { label: 'Admin/Owner',  bg: T.brandLight, color: T.brand, border: '#bfdbfe' },
  'Staff':         { label: 'Staff',        bg: T.surfaceAlt, color: T.textMuted, border: T.border },
};

const fmt = (n) => (n ?? 0).toLocaleString('id-ID');
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Reusable components ───────────────────────────────────────────
const Badge = ({ label, color, bg, border }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap', fontFamily: T.fontBody }}>
    {label}
  </span>
);

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.inactive;
  const Icon = m.Icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: '700', background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: 'nowrap', fontFamily: T.fontBody }}>
      <Icon size={10} />{m.label}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color, bg }) => (
  <div style={{ background: T.surface, borderRadius: T.rLg, padding: '16px', border: `1px solid ${T.borderLight}`, boxShadow: T.shadow, display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={16} style={{ color }} />
    </div>
    <div>
      <div style={{ fontFamily: T.fontDisplay, fontSize: '20px', fontWeight: '700', color: T.text, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: '12px', fontWeight: '600', color: T.textSub, fontFamily: T.fontBody }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontBody }}>{sub}</div>}
    </div>
  </div>
);

const FieldInput = ({ label, required, error, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    {label && <label style={{ fontSize: '12px', fontWeight: '600', color: T.textSub, fontFamily: T.fontBody }}>{label}{required && <span style={{ color: T.red, marginLeft: '2px' }}>*</span>}</label>}
    <input {...props} style={{ padding: '9px 12px', borderRadius: T.rSm, fontSize: '13px', color: T.text, fontFamily: T.fontBody, border: `1.5px solid ${error ? '#fca5a5' : T.border}`, background: T.surfaceAlt, outline: 'none', width: '100%', boxSizing: 'border-box', ...props.style }}
      onFocus={e => { e.target.style.borderColor = T.brand; e.target.style.boxShadow = `0 0 0 3px ${T.brandMid}`; e.target.style.background = T.surface; }}
      onBlur={e => { e.target.style.borderColor = error ? '#fca5a5' : T.border; e.target.style.boxShadow = 'none'; e.target.style.background = T.surfaceAlt; }} />
    {error && <span style={{ fontSize: '11px', color: T.red }}>{error}</span>}
  </div>
);

const FieldSelect = ({ label, required, options, ...props }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    {label && <label style={{ fontSize: '12px', fontWeight: '600', color: T.textSub, fontFamily: T.fontBody }}>{label}{required && <span style={{ color: T.red, marginLeft: '2px' }}>*</span>}</label>}
    <div style={{ position: 'relative' }}>
      <select {...props} style={{ padding: '9px 32px 9px 12px', borderRadius: T.rSm, fontSize: '13px', color: T.text, fontFamily: T.fontBody, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, outline: 'none', width: '100%', appearance: 'none', cursor: 'pointer', ...props.style }}
        onFocus={e => { e.target.style.borderColor = T.brand; e.target.style.boxShadow = `0 0 0 3px ${T.brandMid}`; }}
        onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
      <ChevronDown size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }} />
    </div>
  </div>
);

// ── TenantModal ───────────────────────────────────────────────────
const TenantModal = ({ open, tenant, posTemplates, onClose, onSaved }) => {
  const isEdit = !!tenant?.id;
  const EMPTY = { name: '', company_name: '', status: 'active', pos_template_id: '' };
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (open) {
      setForm(tenant ? { name: tenant.name || '', company_name: tenant.company_name || '', status: tenant.status || 'active', pos_template_id: tenant.pos_template_id || '' } : EMPTY);
      setErrors({}); setSaveErr('');
    }
  }, [open, tenant?.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    const e = {};
    if (!form.name.trim()) e.name = 'ID Tenant wajib diisi';
    if (!form.company_name.trim()) e.company_name = 'Nama restoran wajib diisi';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true); setSaveErr('');
    try {
      const payload = {
        name: form.name.trim().toLowerCase().replace(/\s+/g, '-'),
        company_name: form.company_name.trim(),
        status: form.status,
        pos_template_id: form.pos_template_id || null,
        updated_at: new Date().toISOString()
      };
      const { error } = isEdit
        ? await supabase.from('tenants').update(payload).eq('id', tenant.id)
        : await supabase.from('tenants').insert([{ ...payload, created_at: new Date().toISOString() }]);
      if (error) throw error;
      onSaved(); onClose();
    } catch (err) { setSaveErr(err.message); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(6px)', zIndex: 190, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: T.surface, borderRadius: T.rXl, width: '100%', maxWidth: '500px', boxShadow: '0 32px 80px rgba(0,0,0,.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${T.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: T.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={14} style={{ color: T.brand }} />
            </div>
            <h2 style={{ fontFamily: T.fontDisplay, fontSize: '15px', fontWeight: '700', color: T.text, margin: 0 }}>{isEdit ? 'Edit Tenant' : 'Tambah Tenant Baru'}</h2>
          </div>
          <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: T.rSm, border: `1px solid ${T.borderLight}`, background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.textMuted }}>
            <X size={13} />
          </button>
        </div>
        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '13px' }}>
          <FieldInput label="ID Tenant" required placeholder="contoh: barventis-jakarta" value={form.name} onChange={e => set('name', e.target.value)} error={errors.name} />
          <FieldInput label="Nama Restoran" required placeholder="contoh: Barventis Jakarta Pusat" value={form.company_name} onChange={e => set('company_name', e.target.value)} error={errors.company_name} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '11px' }}>
            <FieldSelect label="Status" value={form.status} onChange={e => set('status', e.target.value)}
              options={[{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif' }, { value: 'trial', label: 'Trial' }]} />
            <FieldSelect label="Template POS" value={form.pos_template_id} onChange={e => set('pos_template_id', e.target.value)}
              options={[{ value: '', label: '— Pilih Template —' }, ...posTemplates.map(t => ({ value: t.id, label: t.display_name }))]} />
          </div>
          {saveErr && <div style={{ padding: '10px 13px', background: T.redLight, border: `1px solid #fecaca`, borderRadius: T.rSm, color: T.red, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={13} />{saveErr}</div>}
        </div>
        <div style={{ padding: '13px 22px', borderTop: `1px solid ${T.borderLight}`, display: 'flex', justifyContent: 'flex-end', gap: '9px' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '9px 18px', borderRadius: T.rSm, border: `1.5px solid ${T.border}`, background: T.surface, fontSize: '13px', fontWeight: '600', color: T.textSub, cursor: 'pointer', fontFamily: T.fontBody }}>Batal</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: T.rSm, border: 'none', background: saving ? T.border : T.brand, fontSize: '13px', fontWeight: '700', color: saving ? T.textMuted : '#fff', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: T.fontBody }}>
            {saving ? <div style={{ width: '13px', height: '13px', border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'sa-spin .7s linear infinite' }} /> : <Save size={13} />}
            {isEdit ? 'Simpan' : 'Tambah Tenant'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── TenantDrawer ──────────────────────────────────────────────────
const TenantDrawer = ({ tenant, users, onClose, onEdit }) => {
  if (!tenant) return null;
  const tenantUsers = users.filter(u => u.tenant_id === tenant.id);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 180, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(15,23,42,.4)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: '100%', maxWidth: '420px', background: T.surface, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 60px rgba(0,0,0,.15)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.borderLight}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: T.textSub, padding: 0, fontFamily: T.fontBody }}>
              <ArrowLeft size={13} /> Tutup
            </button>
            <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: T.rSm, border: `1.5px solid ${T.border}`, background: T.surface, fontSize: '12px', fontWeight: '600', color: T.textSub, cursor: 'pointer', fontFamily: T.fontBody }}>
              <Edit2 size={11} /> Edit
            </button>
          </div>
          <div style={{ display: 'flex', gap: '13px', alignItems: 'flex-start' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: T.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontDisplay, fontWeight: '700', fontSize: '17px', color: T.brand, flexShrink: 0 }}>
              {tenant.company_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ fontFamily: T.fontDisplay, fontSize: '15px', fontWeight: '700', color: T.text, margin: '0 0 6px' }}>{tenant.company_name}</h2>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <StatusBadge status={tenant.status} />
                <Badge label={`ID: ${tenant.name}`} color={T.brand} bg={T.brandLight} border="#bfdbfe" />
              </div>
            </div>
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
            {[
              { label: 'Total User', value: tenantUsers.length, color: T.brand, bg: T.brandLight },
              { label: 'Admin/Owner', value: tenantUsers.filter(u => u.role === 'Admin / Owner').length, color: T.green, bg: T.greenLight },
            ].map(s => (
              <div key={s.label} style={{ background: T.surfaceAlt, borderRadius: T.rMd, padding: '12px', border: `1px solid ${T.borderLight}` }}>
                <div style={{ fontFamily: T.fontDisplay, fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontBody }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Info */}
          <div style={{ background: T.surfaceAlt, borderRadius: T.rMd, padding: '13px', border: `1px solid ${T.borderLight}` }}>
            {[
              { label: 'ID Tenant', value: tenant.name },
              { label: 'Template POS', value: tenant.pos_templates?.display_name || '—' },
              { label: 'Dibuat', value: fmtDate(tenant.created_at) },
            ].map((row, i, arr) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${T.borderLight}` : 'none', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: T.textMuted, fontWeight: '600', flexShrink: 0, fontFamily: T.fontBody }}>{row.label}</span>
                <span style={{ fontSize: '12px', color: T.text, textAlign: 'right', fontFamily: T.fontBody }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Users list */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textMuted, letterSpacing: '.06em', marginBottom: '9px', fontFamily: T.fontBody }}>PENGGUNA ({tenantUsers.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {tenantUsers.length === 0
                ? <div style={{ padding: '24px', textAlign: 'center', color: T.textMuted, fontSize: '13px', fontFamily: T.fontBody }}>Belum ada pengguna</div>
                : tenantUsers.map(u => {
                  const rm = ROLE_META[u.role] || ROLE_META['Staff'];
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', background: T.surfaceAlt, borderRadius: T.rSm, border: `1px solid ${T.borderLight}` }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: rm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontDisplay, fontWeight: '700', fontSize: '12px', color: rm.color, flexShrink: 0 }}>
                        {u.name?.charAt(0) || '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.fontBody }}>{u.name}</div>
                        <div style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontBody }}>{u.email}</div>
                      </div>
                      <Badge label={rm.label} color={rm.color} bg={rm.bg} border={rm.border} />
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main SuperAdminPanel ──────────────────────────────────────────
export default function SuperAdminPanel({ activeUser }) {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [posTemplates, setPosTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modal, setModal] = useState(false);
  const [editTenant, setEditTenant] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [tenantsRes, usersRes, templatesRes] = await Promise.all([
        supabase.from('tenants').select('*, pos_templates(display_name)').order('created_at', { ascending: false }),
        supabase.from('users').select('id, name, email, role, tenant_id').order('created_at', { ascending: false }),
        supabase.from('pos_templates').select('id, name, display_name').order('name'),
      ]);
      if (tenantsRes.error) throw tenantsRes.error;
      setTenants(tenantsRes.data || []);
      setUsers(usersRes.data || []);
      setPosTemplates(templatesRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'active').length,
    inactive: tenants.filter(t => t.status === 'inactive').length,
    trial: tenants.filter(t => t.status === 'trial').length,
    totalUsers: users.filter(u => u.role !== 'SuperAdmin').length,
  };

  const filtered = tenants.filter(t => {
    const matchSearch = !search || t.company_name.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', color: T.textMuted, fontFamily: T.fontBody, fontSize: '14px', gap: '10px' }}>
      <div style={{ width: '18px', height: '18px', border: `2px solid ${T.border}`, borderTopColor: T.brand, borderRadius: '50%', animation: 'sa-spin .8s linear infinite' }} />
      Memuat data...
    </div>
  );

  return (
    <div style={{ fontFamily: T.fontBody, display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' }}>
      <style>{`@keyframes sa-spin { to { transform: rotate(360deg); } } @keyframes sa-fadein { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} } .sa-row:hover { background: #f8faff !important; cursor: pointer; }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '11px', background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Crown size={18} style={{ color: '#ca8a04' }} />
          </div>
          <div>
            <h1 style={{ fontFamily: T.fontDisplay, fontSize: '20px', fontWeight: '700', color: T.text, margin: 0 }}>Super Admin Panel</h1>
            <p style={{ fontSize: '13px', color: T.textSub, margin: 0 }}>Kelola semua tenant restoran di platform Barventis</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '9px' }}>
          <button onClick={() => { setRefreshing(true); fetchData(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: T.rSm, border: `1.5px solid ${T.border}`, background: T.surface, fontSize: '13px', fontWeight: '600', color: T.textSub, cursor: 'pointer', fontFamily: T.fontBody }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'sa-spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          <button onClick={() => { setEditTenant(null); setModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: T.rSm, border: 'none', background: T.brand, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: T.fontBody }}>
            <Plus size={13} /> Tambah Tenant
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: T.redLight, border: `1px solid #fecaca`, borderRadius: T.rMd, color: T.red, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={14} />{error}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '11px' }}>
        <StatCard icon={Building2} label="Total Tenant" value={fmt(stats.total)} sub="Di platform" color={T.brand} bg={T.brandLight} />
        <StatCard icon={CheckCircle2} label="Aktif" value={fmt(stats.active)} sub="Beroperasi" color={T.green} bg={T.greenLight} />
        <StatCard icon={Clock} label="Trial" value={fmt(stats.trial)} sub="Masa percobaan" color={T.amber} bg={T.amberLight} />
        <StatCard icon={XCircle} label="Nonaktif" value={fmt(stats.inactive)} sub="Dinonaktifkan" color={T.red} bg={T.redLight} />
        <StatCard icon={Users} label="Total User" value={fmt(stats.totalUsers)} sub="Semua tenant" color="#7c3aed" bg="#f5f3ff" />
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }} />
          <input type="text" placeholder="Cari nama atau ID tenant..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 11px 8px 30px', borderRadius: T.rSm, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, fontSize: '13px', color: T.text, outline: 'none', fontFamily: T.fontBody, boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = T.brand; e.target.style.boxShadow = `0 0 0 3px ${T.brandMid}`; }}
            onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none'; }} />
        </div>
        <div style={{ position: 'relative' }}>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 28px 8px 10px', borderRadius: T.rSm, border: `1.5px solid ${T.border}`, background: T.surfaceAlt, fontSize: '13px', color: filterStatus !== 'all' ? T.text : T.textMuted, outline: 'none', cursor: 'pointer', fontFamily: T.fontBody, appearance: 'none' }}
            onFocus={e => { e.target.style.borderColor = T.brand; }} onBlur={e => { e.target.style.borderColor = T.border; }}>
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="trial">Trial</option>
            <option value="inactive">Nonaktif</option>
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }} />
        </div>
        <span style={{ fontSize: '12px', color: T.textMuted, alignSelf: 'center', fontFamily: T.fontBody }}>{filtered.length} tenant</span>
      </div>

      {/* Table */}
      <div style={{ background: T.surface, borderRadius: T.rLg, border: `1px solid ${T.borderLight}`, overflow: 'hidden', boxShadow: T.shadow }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏪</div>
            <div style={{ fontFamily: T.fontDisplay, fontSize: '15px', fontWeight: '700', color: T.text, marginBottom: '6px' }}>
              {search || filterStatus !== 'all' ? 'Tidak ada tenant ditemukan' : 'Belum ada tenant'}
            </div>
            <div style={{ fontSize: '13px', color: T.textMuted, marginBottom: '18px', fontFamily: T.fontBody }}>
              {search || filterStatus !== 'all' ? 'Coba ubah filter pencarian' : 'Mulai dengan menambahkan tenant pertama'}
            </div>
            {!search && filterStatus === 'all' && (
              <button onClick={() => { setEditTenant(null); setModal(true); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: T.rSm, border: 'none', background: T.brand, fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: T.fontBody }}>
                <Plus size={13} /> Tambah Tenant
              </button>
            )}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: T.surfaceAlt, borderBottom: `1px solid ${T.borderLight}` }}>
                    {['Tenant', 'Status', 'POS Template', 'Users', 'Dibuat', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: T.textMuted, letterSpacing: '0.05em', whiteSpace: 'nowrap', fontFamily: T.fontBody }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t, idx) => (
                    <tr key={t.id} className="sa-row" onClick={() => setDrawer(t)}
                      style={{ borderBottom: `1px solid ${T.borderLight}`, background: T.surface, transition: 'background .1s', animation: `sa-fadein .3s ease ${Math.min(idx, 10) * 30}ms both` }}>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: T.brandLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontDisplay, fontWeight: '700', fontSize: '14px', color: T.brand, flexShrink: 0 }}>
                            {t.company_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, fontFamily: T.fontBody }}>{t.company_name}</div>
                            <div style={{ fontSize: '11px', color: T.textMuted, fontFamily: T.fontBody }}>ID: {t.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '13px 16px' }}><StatusBadge status={t.status} /></td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: '12px', color: T.textSub, fontFamily: T.fontBody }}>{t.pos_templates?.display_name || '—'}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontFamily: T.fontDisplay, fontSize: '14px', fontWeight: '700', color: T.text }}>
                          {users.filter(u => u.tenant_id === t.id).length}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: '12px', color: T.textMuted, fontFamily: T.fontBody }}>{fmtDate(t.created_at)}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditTenant(t); setModal(true); }}
                          style={{ width: '28px', height: '28px', borderRadius: '7px', border: `1px solid ${T.borderLight}`, background: T.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.textMuted }}
                          onMouseEnter={e => { e.currentTarget.style.background = T.brandLight; e.currentTarget.style.color = T.brand; }}
                          onMouseLeave={e => { e.currentTarget.style.background = T.surfaceAlt; e.currentTarget.style.color = T.textMuted; }}>
                          <Edit2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '9px 16px', borderTop: `1px solid ${T.borderLight}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: T.textMuted, fontFamily: T.fontBody }}>Menampilkan {filtered.length} dari {tenants.length} tenant</span>
            </div>
          </>
        )}
      </div>

      {/* Modals & Drawers */}
      <TenantModal open={modal} tenant={editTenant} posTemplates={posTemplates} onClose={() => { setModal(false); setEditTenant(null); }}
        onSaved={() => { fetchData(); showToast(editTenant ? 'Tenant berhasil diperbarui' : 'Tenant berhasil ditambahkan'); }} />
      {drawer && <TenantDrawer tenant={drawer} users={users} onClose={() => setDrawer(null)} onEdit={() => { setEditTenant(drawer); setDrawer(null); setModal(true); }} />}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '22px', right: '22px', zIndex: 300, display: 'flex', alignItems: 'center', gap: '9px', padding: '12px 16px', borderRadius: T.rMd, background: toast.type === 'error' ? T.red : '#0f172a', color: '#fff', fontSize: '13px', fontWeight: '500', boxShadow: '0 8px 30px rgba(0,0,0,.2)', fontFamily: T.fontBody, animation: 'sa-fadein .22s ease' }}>
          {toast.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} style={{ color: '#4ade80' }} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}