import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar, TrendingUp, Loader2, AlertTriangle, FileText, Check, X, Sparkles } from 'lucide-react';
import ExportButton from '../../components/shared/ExportButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';
import { adjustmentApi } from '../../services/upgradeModulesApi';

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

  // Justification Modal State
  const [justificationModal, setJustificationModal] = useState({
    isOpen: false,
    material: null,
    varianceQty: 0,
    category: 'EVENT_NON_POS',
    reason: '',
    submitting: false,
    error: '',
    success: ''
  });
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

      const [{ data: items, error: iErr }, materialsList, { data: expectedUsageRows, error: eErr }] = await Promise.all([
        supabase.from('daily_inventory_items').select('*').in('inventory_id', headerIds),
        api.getMaterials().catch(() => []),
        supabase.from('expected_usage').select('material_id, expected_qty, total_sold')
          .eq('tenant_id', tenantId)
          .gte('week_start', startDate)
          .lte('week_end', endDate)
      ]);
      if (iErr) throw iErr;
      if (eErr) console.warn('[UsageRecap] Gagal memuat expected_usage:', eErr);
      const matsById = Object.fromEntries((materialsList || []).map(m => [m.id, m]));
      const expectedByMat = {};
      (expectedUsageRows || []).forEach(eu => {
        expectedByMat[eu.material_id] = (expectedByMat[eu.material_id] || 0) + Number(eu.expected_qty || 0);
      });

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
            daily: {},
            theoretical_qty: expectedByMat[r.material_id] || 0
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

      setRecords(Object.values(agg).map(a => {
        const theoretical = Number(a.theoretical_qty || 0);
        const actual = Number(a.total_terpakai || 0);
        const gapQty = Number((actual - theoretical).toFixed(2));
        const gapPct = theoretical > 0 ? Number(((gapQty / theoretical) * 100).toFixed(1)) : (actual > 0 ? 100 : 0);
        const gapValue = Math.round(gapQty * a.price);
        return {
          ...a,
          theoretical_qty: theoretical,
          gap_qty: gapQty,
          gap_pct: gapPct,
          gap_value: gapValue,
          avg_per_day: a.days_count > 0 ? +(a.total_terpakai / a.days_count).toFixed(2) : 0,
          total_cost: a.total_terpakai * a.price
        };
      }));
    } catch (err) {
      setError(err.message || 'Gagal memuat data pemakaian');
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
      {/* Header */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', borderRadius: '12px', background: 'rgba(99,102,241,0.1)' }}>
              <TrendingUp size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Rekapitulasi Pemakaian Bahan</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Kumulatif pemakaian bahan baku dalam rentang tanggal terpilih
              </p>
            </div>
          </div>
          <ExportButton
            onExportExcel={handleExportExcel}
            currentRole={activeUser?.role}
            disabled={loading || records.length === 0}
          />
        </div>
      </div>

      {/* Date range */}
      <div className="glass-card" style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Periode:</label>
          <input type="date" className="form-control" style={{ width: 'auto' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>s/d</span>
          <input type="date" className="form-control" style={{ width: 'auto' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button className="btn btn-secondary text-xs flex items-center gap-1.5" onClick={fetchUsageData} disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Tampilkan
          </button>
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
                <th style={thStyle('total_terpakai')} onClick={() => handleSort('total_terpakai')}>Fisik (EOD) <SortIcon col="total_terpakai" /></th>
                <th style={thStyle('theoretical_qty')} onClick={() => handleSort('theoretical_qty')}>Teori (POS) <SortIcon col="theoretical_qty" /></th>
                <th style={thStyle('gap_qty')} onClick={() => handleSort('gap_qty')}>GAP Selisih <SortIcon col="gap_qty" /></th>
                <th style={thStyle('total_cost', 'right')} onClick={() => handleSort('total_cost')}>Biaya (Rp) <SortIcon col="total_cost" /></th>
                <th style={{ padding: '12px 16px', textAlign: 'center', minWidth: '120px' }}>Keterangan Event</th>
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
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{row.theoretical_qty.toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.gap_qty === 0 ? (
                        <span className="badge text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Presisi (0)</span>
                      ) : row.gap_qty > 0 ? (
                        <span className="badge text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-mono">
                          +{row.gap_qty} {row.unit}
                        </span>
                      ) : (
                        <span className="badge text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono">
                          {row.gap_qty} {row.unit}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {row.total_cost.toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.gap_qty > 0 ? (
                        <button
                          type="button"
                          onClick={() => setJustificationModal({
                            isOpen: true,
                            material: row,
                            varianceQty: row.gap_qty,
                            category: 'EVENT_NON_POS',
                            reason: '',
                            submitting: false,
                            error: '',
                            success: ''
                          })}
                          className="btn btn-secondary text-[11px] py-1 px-2.5 inline-flex items-center gap-1 text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300"
                          title="Ajukan keterangan selisih event untuk di-ACC Direktur"
                        >
                          <FileText size={12} /> Ajukan ACC
                        </button>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]">—</span>
                      )}
                    </td>
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
                  <td style={{ textAlign: 'center' }}>—</td>
                  <td style={{ textAlign: 'right' }}>Rp {totals.total_cost.toLocaleString('id-ID')}</td>
                  <td style={{ textAlign: 'center' }}>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Keterangan Event / Justifikasi GAP */}
      {justificationModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="glass-card max-w-md w-full p-6 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
                  <FileText size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-[var(--text-primary)]">Keterangan Selisih / Event</h4>
                  <p className="text-xs text-[var(--text-muted)] m-0">Pengajuan wewenang Head ke Manajer / Direktur</p>
                </div>
              </div>
              <button type="button" onClick={() => setJustificationModal(prev => ({ ...prev, isOpen: false }))} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Bahan Baku:</span>
                <strong className="text-[var(--text-primary)]">{justificationModal.material?.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">GAP Selisih Tekor:</span>
                <strong className="text-red-600 font-mono">+{justificationModal.varianceQty} {justificationModal.material?.unit}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Estimasi Biaya:</span>
                <strong className="text-[var(--text-primary)] font-mono">Rp {Math.round(justificationModal.varianceQty * (justificationModal.material?.price || 0)).toLocaleString('id-ID')}</strong>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold block mb-1">Kategori Alasan:</label>
                <select
                  className="form-control text-xs w-full py-2 px-3"
                  value={justificationModal.category}
                  onChange={e => setJustificationModal(prev => ({ ...prev, category: e.target.value }))}
                >
                  <option value="EVENT_NON_POS">Event / Catering Khusus (Tanpa Kasir POS)</option>
                  <option value="PROMO_COMP">Complimentary VIP / Tester Tamu</option>
                  <option value="KALIBRASI_RASA">Kalibrasi Mesin & Dial-in Espresso</option>
                  <option value="SPILLAGE">Tumpah Tak Terduga Saat Jam Sibuk</option>
                  <option value="LAINNYA">Alasan Operasional Lainnya</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold block mb-1">Catatan Keterangan Resmi (Untuk Manajer / Direktur):</label>
                <textarea
                  rows={3}
                  className="form-control text-xs w-full py-2 px-3"
                  placeholder="Tuliskan nama acara, tanggal event, atau nomor BAP internal..."
                  value={justificationModal.reason}
                  onChange={e => setJustificationModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>
            </div>

            {justificationModal.error && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
                {justificationModal.error}
              </div>
            )}
            {justificationModal.success && (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs flex items-center gap-1.5">
                <Check size={14} /> {justificationModal.success}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                className="btn btn-secondary text-xs py-2 px-3"
                onClick={() => setJustificationModal(prev => ({ ...prev, isOpen: false }))}
                disabled={justificationModal.submitting}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn text-xs py-2 px-3"
                style={{ background: '#059669', color: 'white' }}
                disabled={justificationModal.submitting || !justificationModal.reason.trim()}
                onClick={async () => {
                  setJustificationModal(prev => ({ ...prev, submitting: true, error: '', success: '' }));
                  try {
                    await adjustmentApi.createAdjustment({
                      material_id: justificationModal.material?.material_id,
                      opname_date: endDate,
                      system_qty: justificationModal.material?.theoretical_qty,
                      physical_qty: justificationModal.material?.total_terpakai,
                      variance_pct: justificationModal.material?.gap_pct,
                      reason: justificationModal.reason.trim(),
                      category: justificationModal.category
                    });
                    setJustificationModal(prev => ({
                      ...prev,
                      submitting: false,
                      success: 'Keterangan event berhasil diajukan ke antrean ACC Direktur.'
                    }));
                    setTimeout(() => {
                      setJustificationModal(prev => ({ ...prev, isOpen: false }));
                    }, 1200);
                  } catch (err) {
                    setJustificationModal(prev => ({
                      ...prev,
                      submitting: false,
                      error: err.message || 'Gagal mengajukan keterangan.'
                    }));
                  }
                }}
              >
                {justificationModal.submitting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Kirim ke Direktur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
