import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, TrendingUp, Loader2, CheckCircle2 } from 'lucide-react';
import ExportButton from '../../components/shared/ExportButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';

// ponytail: inline component, no external state management. Add context when multi-page usage needed.
export default function UsageRecap() {
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(weekAgo);
  const [endDate, setEndDate] = useState(today);
  const [records, setRecords] = useState([]);
  const [sortCol, setSortCol] = useState('total_terpakai');
  const [sortDir, setSortDir] = useState('desc');

  const fetchUsageData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tenantId = await api.getActiveTenantId();
      if (!tenantId) { setRecords([]); return; }

      // Fetch all daily_inventories headers in date range
      const { data: headers, error: hErr } = await supabase
        .from('daily_inventories')
        .select('id, date')
        .eq('tenant_id', tenantId)
        .gte('date', startDate)
        .lte('date', endDate);
      if (hErr) throw hErr;
      if (!headers || headers.length === 0) { setRecords([]); return; }

      const headerIds = headers.map(h => h.id);
      const dateMap = Object.fromEntries(headers.map(h => [h.id, h.date]));

      const [{ data: items, error: iErr }, materialsList] = await Promise.all([
        supabase.from('daily_inventory_items').select('*').in('inventory_id', headerIds),
        api.getMaterials().catch(() => [])
      ]);
      if (iErr) throw iErr;

      const matsById = Object.fromEntries((materialsList || []).map(m => [m.id, m]));

      // Aggregate per material across date range
      const agg = {};
      (items || []).forEach(r => {
        const mat = matsById[r.material_id];
        if (!mat) return;
        const cat = (mat.category || '').toUpperCase();
        if (cat === 'BEER' || cat === 'ASSET') return; // Bahan only

        if (!agg[r.material_id]) {
          agg[r.material_id] = {
            material_id: r.material_id,
            name: mat.name,
            unit: mat.unit || 'unit',
            price: Number(mat.price) || 0,
            category: mat.category || '',
            total_in: 0,
            total_out: 0,
            total_waste: 0,
            total_terpakai: 0,
            days_count: 0,
            daily: {}
          };
        }
        const a = agg[r.material_id];
        const inQ = Number(r.in_qty) || 0;
        const outQ = Number(r.out_qty) || 0;
        const waste = Number(r.waste_qty) || 0;
        const terpakai = r.terpakai_qty != null ? Number(r.terpakai_qty) : (outQ + waste);

        a.total_in += inQ;
        a.total_out += outQ;
        a.total_waste += waste;
        a.total_terpakai += terpakai;

        const dt = dateMap[r.inventory_id];
        if (dt && !a.daily[dt]) {
          a.daily[dt] = true;
          a.days_count++;
        }
      });

      setRecords(Object.values(agg).map(a => ({
        ...a,
        avg_per_day: a.days_count > 0 ? +(a.total_terpakai / a.days_count).toFixed(2) : 0,
        total_cost: a.total_terpakai * a.price
      })));
    } catch (err) {
      setError(err.message || 'Gagal memuat data pemakaian');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchUsageData(); }, [fetchUsageData]);

  const sorted = useMemo(() => {
    const copy = [...records];
    copy.sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return copy;
  }, [records, sortCol, sortDir]);

  const totals = useMemo(() => records.reduce((acc, r) => ({
    total_in: acc.total_in + r.total_in,
    total_out: acc.total_out + r.total_out,
    total_waste: acc.total_waste + r.total_waste,
    total_terpakai: acc.total_terpakai + r.total_terpakai,
    total_cost: acc.total_cost + r.total_cost
  }), { total_in: 0, total_out: 0, total_waste: 0, total_terpakai: 0, total_cost: 0 }), [records]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const handleExportExcel = async () => {
    const { exportToExcel } = await import('../../services/export/excelExporter');
    const rows = sorted.map(r => ({
      'Bahan': r.name,
      'Satuan': r.unit,
      'Total Masuk': r.total_in,
      'Total Keluar': r.total_out,
      'Total Waste': r.total_waste,
      'Total Terpakai': r.total_terpakai,
      'Rata-rata/Hari': r.avg_per_day,
      'Harga Satuan': r.price,
      'Total Biaya (Rp)': r.total_cost
    }));
    await exportWithAudit(
      () => exportToExcel(rows, `Pemakaian_${startDate}_sd_${endDate}`),
      { module: 'UsageRecap', format: 'xlsx', role: activeUser?.role }
    );
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return null;
    return <span style={{ marginLeft: 4, fontSize: '0.7rem' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const thStyle = (col, align = 'center') => ({
    textAlign: align, cursor: 'pointer', userSelect: 'none',
    background: sortCol === col ? 'rgba(99,102,241,0.07)' : undefined
  });

  return (
    <div className="fade-in space-y-5">
      {/* Unified Professional Header & Date Range Toolbar */}
      <div className="glass-card p-3.5 sm:p-4 mb-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border)]/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="m-0 text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                  Rekapitulasi Pemakaian Bahan
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/30">
                  <CheckCircle2 size={10} />
                  <span>Live Sinkron</span>
                </span>
              </div>
              <p className="m-0 text-[11px] text-[var(--text-secondary)] mt-0.5">
                Kumulatif pemakaian bahan baku dalam rentang tanggal terpilih
              </p>
            </div>
          </div>
          <ExportButton
            onExportExcel={handleExportExcel}
            currentRole={activeUser?.role}
            disabled={loading || records.length === 0}
            className="w-full sm:w-auto"
            style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem' }}
          />
        </div>

        {/* Toolbar Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3">
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <span className="font-bold text-xs text-[var(--text-secondary)] whitespace-nowrap">Periode:</span>
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <input type="date" className="form-control text-xs font-medium flex-1 sm:w-auto" style={{ height: '32px', padding: '4px 8px' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
              <span className="text-[var(--text-muted)] text-xs font-medium">s/d</span>
              <input type="date" className="form-control text-xs font-medium flex-1 sm:w-auto" style={{ height: '32px', padding: '4px 8px' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <button className="btn btn-secondary text-xs flex items-center justify-center gap-1.5 font-semibold w-full sm:w-auto" style={{ height: '32px', padding: '0 12px' }} onClick={fetchUsageData} disabled={loading}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
              Tampilkan
            </button>
          </div>

          {records.length > 0 && (
            <div className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)]/60 border border-[var(--border)] text-[var(--text-secondary)]">
              <span>{records.length} Item Tercatat</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      {records.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-card p-4">
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Item</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace' }}>{records.length}</div>
          </div>
          <div className="glass-card p-4">
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Terpakai</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace' }}>{totals.total_terpakai.toLocaleString('id-ID')}</div>
          </div>
          <div className="glass-card p-4">
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Waste</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace', color: totals.total_waste > 0 ? '#ef4444' : 'inherit' }}>
              {totals.total_waste.toLocaleString('id-ID')}
            </div>
          </div>
          <div className="glass-card p-4">
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Biaya HPP</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace' }}>
              Rp {totals.total_cost.toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle('name', 'left')} onClick={() => handleSort('name')}>Bahan <SortIcon col="name" /></th>
                <th style={thStyle('total_in')} onClick={() => handleSort('total_in')}>Masuk <SortIcon col="total_in" /></th>
                <th style={thStyle('total_out')} onClick={() => handleSort('total_out')}>Keluar <SortIcon col="total_out" /></th>
                <th style={thStyle('total_waste')} onClick={() => handleSort('total_waste')}>Waste <SortIcon col="total_waste" /></th>
                <th style={thStyle('total_terpakai')} onClick={() => handleSort('total_terpakai')}>Terpakai <SortIcon col="total_terpakai" /></th>
                <th style={thStyle('avg_per_day')} onClick={() => handleSort('avg_per_day')}>Rata-rata/Hari <SortIcon col="avg_per_day" /></th>
                <th style={thStyle('total_cost', 'right')} onClick={() => handleSort('total_cost')}>Biaya (Rp) <SortIcon col="total_cost" /></th>
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                <TableSkeletonRows
                  rows={6}
                  columns={[
                    { width: '180px', type: 'dual-text' },
                    { width: '70px', type: 'text', align: 'center' },
                    { width: '70px', type: 'text', align: 'center' },
                    { width: '70px', type: 'text', align: 'center' },
                    { width: '80px', type: 'text', align: 'center' },
                    { width: '80px', type: 'text', align: 'center' },
                    { width: '110px', type: 'text', align: 'right' }
                  ]}
                />
              ) : (
                sorted.map(row => (
                  <tr key={row.material_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                        {row.unit} | Rp {row.price.toLocaleString('id-ID')}/{row.unit} | {row.days_count} hari data
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>{row.total_in}</td>
                    <td style={{ textAlign: 'center' }}>{row.total_out}</td>
                    <td style={{ textAlign: 'center', color: row.total_waste > 0 ? '#ef4444' : 'inherit' }}>{row.total_waste}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.total_terpakai}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--accent)' }}>{row.avg_per_day}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {row.total_cost.toLocaleString('id-ID')}</td>
                  </tr>
                ))
              )}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                    <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada data pemakaian untuk periode ini</p>
                    <p style={{ fontSize: '0.75rem', margin: '4px 0 0' }}>Pilih rentang tanggal dan pastikan ada data inventaris harian.</p>
                  </td>
                </tr>
              )}
              {!loading && records.length > 0 && (
                <tr style={{ fontWeight: 700, background: 'rgba(99,102,241,0.05)', borderTop: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 800 }}>TOTAL ({records.length} bahan)</td>
                  <td style={{ textAlign: 'center' }}>{totals.total_in.toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>{totals.total_out.toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{totals.total_waste.toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>{totals.total_terpakai.toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>—</td>
                  <td style={{ textAlign: 'right' }}>Rp {totals.total_cost.toLocaleString('id-ID')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
