import { api } from '../../services/api';
import { useMemo, useState, useEffect } from 'react';
import {
  Package, ArrowRight, AlertTriangle,
  TrendingDown, DollarSign, CheckCircle, Calendar
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { formatIDR, calculateIngredientCost } from '../../services/costUtils';
import WidgetErrorBoundary from '../../components/WidgetErrorBoundary';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();
  const { stock, unitConversionMap, branches, activeBranch, canSwitchBranch, switchBranch } = useData();
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const [branchScope, setBranchScope] = useState('ACTIVE');
  const [multiBranchRows, setMultiBranchRows] = useState([]);
  const [loadingMultiBranch, setLoadingMultiBranch] = useState(false);

  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const periodOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingTx(true);
    api.getTransactions(period)
      .then((data) => {
        if (isMounted) {
          setTransactions(data || []);
          setIsLoadingTx(false);
        }
      })
      .catch((err) => {
        console.error('Error fetching transactions:', err);
        if (isMounted) {
          setTransactions([]);
          setIsLoadingTx(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [period, activeBranch?.id]);

  useEffect(() => {
    if (!canSwitchBranch || branchScope !== 'ALL') return;
    let active = true;
    setLoadingMultiBranch(true);
    api.getMultiBranchSummary(period)
      .then(rows => {
        if (active) setMultiBranchRows(rows || []);
      })
      .catch(err => {
        console.warn('Multi-branch summary warning:', err);
        if (active) setMultiBranchRows([]);
      })
      .finally(() => {
        if (active) setLoadingMultiBranch(false);
      });
    return () => { active = false; };
  }, [canSwitchBranch, branchScope, period]);

  const stockValuation = useMemo(() => stock.reduce((acc, item) => acc + calculateIngredientCost(item, (item.qty_resto || 0) + (item.qty_central || 0), item.unit, unitConversionMap), 0), [stock, unitConversionMap]);
  const lowStockItems = useMemo(() => stock.filter(item => ((item.qty_resto || 0) + (item.qty_central || 0)) < (item.min_stock || 15)), [stock]);

  // Calculate real metrics from live transaction data
  const realSalesRevenue = useMemo(() => {
    return (transactions || [])
      .filter(tx => tx.type === 'POS_SALE' && tx.date && tx.date.startsWith(period))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  }, [transactions, period]);

  const realCogsCost = useMemo(() => {
    return (transactions || [])
      .filter(tx => tx.type === 'POS_DEDUCTION' && tx.date && tx.date.startsWith(period))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  }, [transactions, period]);

  const realCostPct = useMemo(() => realSalesRevenue > 0 ? (realCogsCost / realSalesRevenue) * 100 : 0, [realSalesRevenue, realCogsCost]);

  // Real trend from transactions within the selected period month
  const realTrendData = useMemo(() => {
    const dayMap = {};
    const year = parseInt(period.split('-')[0], 10);
    const month = parseInt(period.split('-')[1], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const resultArr = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const key = `${period}-${String(i).padStart(2,'0')}`;
      const label = `${period.split('-')[1]}/${String(i).padStart(2,'0')}`;
      dayMap[key] = { name: label, cost: 0, revenue: 0, target: 27 };
      resultArr.push(key);
    }

    (transactions || []).forEach(tx => {
      const dateStr = tx.date || '';
      if (dateStr && dateStr.startsWith(period) && dayMap[dateStr]) {
        if (tx.type === 'POS_DEDUCTION') dayMap[dateStr].cost += Math.abs(parseFloat(tx.amount || 0));
        if (tx.type === 'POS_SALE') dayMap[dateStr].revenue += Math.abs(parseFloat(tx.amount || 0));
      }
    });

    return resultArr.map(key => ({
      ...dayMap[key],
      cost: dayMap[key].revenue > 0 ? parseFloat(((dayMap[key].cost / dayMap[key].revenue) * 100).toFixed(1)) : 0
    }));
  }, [transactions, period]);

  // Top 5 cost contributors from stock value
  const topContributors = useMemo(() => {
    return [...(stock || [])]
      .map(item => ({
        name: item.name,
        // BUG-FIX 2026-08: same pack-size issue as stockValuation above.
        cost: calculateIngredientCost(item, (item.qty_resto || 0) + (item.qty_central || 0), item.unit, unitConversionMap)
      }))
      .filter(item => item.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [stock, unitConversionMap]);

  const totalSalesBeverage = realSalesRevenue;
  const currentCostPct = realCostPct;
  const trendData = realTrendData;
  const contributorsData = topContributors;

  // Category breakdown
  const pieData = useMemo(() => {
    const categoryVals = {};
    stock.forEach(item => {
      // BUG-FIX 2026-08: same pack-size issue as stockValuation above.
      const val = calculateIngredientCost(item, (item.qty_resto || 0) + (item.qty_central || 0), item.unit, unitConversionMap);
      categoryVals[item.category] = (categoryVals[item.category] || 0) + val;
    });
    return Object.entries(categoryVals).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [stock, unitConversionMap]);
  const COLORS = ['#3b82f6', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0d9488'];

  const tooltipStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', boxShadow: 'var(--card-shadow)' };

  return (
    <div className="fade-in">
      {/* Filters and Tab Switcher */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Calendar size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Periode:</span>
          <select
            className="form-control"
            style={{ width: '160px', padding: '6px 12px', fontSize: '0.875rem' }}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            {periodOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {canSwitchBranch && branches.length > 1 && (
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => setBranchScope('ACTIVE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                branchScope === 'ACTIVE'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {activeBranch?.name || 'Cabang Aktif'}
            </button>
            <button
              type="button"
              onClick={() => setBranchScope('ALL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                branchScope === 'ALL'
                  ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Semua Cabang ({branches.length})
            </button>
          </div>
        )}
      </div>

      {canSwitchBranch && branchScope === 'ALL' ? (
        <div className="space-y-6">
          <div className="kpi-grid">
            {(() => {
              const totalSalesAll = multiBranchRows.reduce((s, r) => s + Number(r.pos_sales || 0), 0);
              const totalCogsAll = multiBranchRows.reduce((s, r) => s + Number(r.actual_cogs || 0), 0);
              const totalStockAll = multiBranchRows.reduce((s, r) => s + Number(r.stock_valuation || 0), 0);
              const totalLowAll = multiBranchRows.reduce((s, r) => s + Number(r.low_stock_count || 0), 0);
              const avgPct = totalSalesAll > 0 ? (totalCogsAll / totalSalesAll) * 100 : 0;
              return (
                <>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Rasio Biaya Gabungan</span>
                      <div className="kpi-icon-wrap" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
                        <TrendingDown size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums" style={{ color: avgPct <= 27 ? 'var(--success)' : 'var(--warning)' }}>{avgPct.toFixed(1)}%</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">{multiBranchRows.length} cabang</span></div>
                  </div>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Total Penjualan Gabungan</span>
                      <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                        <DollarSign size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums">{formatIDR(totalSalesAll)}</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">Periode {period.split('-')[1]}/{period.split('-')[0]}</span></div>
                  </div>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Total Nilai Stok</span>
                      <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
                        <Package size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums">{formatIDR(totalStockAll)}</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">Seluruh cabang</span></div>
                  </div>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Stok Menipis</span>
                      <div className="kpi-icon-wrap" style={{ background: totalLowAll > 0 ? 'var(--danger-glow)' : 'var(--success-glow)', color: totalLowAll > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        <AlertTriangle size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums" style={{ color: totalLowAll > 0 ? 'var(--danger)' : 'var(--success)' }}>{totalLowAll}</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">Total item kritis</span></div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] m-0">Performa Antar Cabang</h3>
                <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5">Klik baris untuk masuk ke cabang.</p>
              </div>
            </div>
            {loadingMultiBranch ? (
              <div className="py-10 text-center text-xs text-[var(--text-muted)]">Memuat ringkasan cabang...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="custom-table w-full text-xs">
                  <thead>
                    <tr>
                      <th>Cabang</th>
                      <th>Tipe</th>
                      <th className="text-right">Penjualan POS</th>
                      <th className="text-right">HPP Aktual</th>
                      <th className="text-right">Food Cost %</th>
                      <th className="text-right">Nilai Stok</th>
                      <th className="text-right">Stok Menipis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiBranchRows.map(row => (
                      <tr
                        key={row.branch_id}
                        className="cursor-pointer hover:bg-[var(--bg-tertiary)]/50"
                        onClick={() => {
                          switchBranch(row.branch_id);
                          setBranchScope('ACTIVE');
                        }}
                      >
                        <td className="font-bold text-[var(--text-primary)]">{row.branch_name}</td>
                        <td className="text-[var(--text-secondary)]">{row.is_central ? 'Central' : 'Outlet'}</td>
                        <td className="text-right font-mono tabular-nums">{formatIDR(row.pos_sales || 0)}</td>
                        <td className="text-right font-mono tabular-nums">{formatIDR(row.actual_cogs || 0)}</td>
                        <td className="text-right font-mono tabular-nums font-bold" style={{ color: Number(row.food_cost_pct) > 30 ? 'var(--danger)' : 'var(--success)' }}>
                          {Number(row.food_cost_pct || 0).toFixed(1)}%
                        </td>
                        <td className="text-right font-mono tabular-nums">{formatIDR(row.stock_valuation || 0)}</td>
                        <td className="text-right font-mono tabular-nums font-semibold" style={{ color: Number(row.low_stock_count) > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                          {row.low_stock_count || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>

        {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Rasio Biaya F&B</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
              <TrendingDown size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{currentCostPct.toFixed(1)}%</div>
          <div className="kpi-footer"><span className="trend-up">Target aman (&lt;27%)</span></div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Penjualan</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div className="kpi-value">{formatIDR(totalSalesBeverage)}</div>
          <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>Periode {period.split('-')[1]}/{period.split('-')[0]}</span></div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Nilai Stok</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
              <Package size={20} />
            </div>
          </div>
          <div className="kpi-value">{formatIDR(stockValuation)}</div>
          <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>Resto + Central</span></div>
        </div>

        <div className="glass-card kpi-card" onClick={() => navigate('./stock')} style={{ cursor: 'pointer' }}>
          <div className="kpi-header">
            <span className="kpi-title">Stok Menipis</span>
            <div className="kpi-icon-wrap" style={{ background: lowStockItems.length > 0 ? 'var(--danger-glow)' : 'var(--success-glow)', color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--success)' }}>{lowStockItems.length}</div>
          <div className="kpi-footer">
            {lowStockItems.length > 0
              ? <span className="trend-down">Perlu restock <ArrowRight size={12} /></span>
              : <span className="trend-up">Semua stok aman</span>}
          </div>
        </div>
      </div>

      {/* Row 1: Trend + Pie */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="chart-title" style={{ marginBottom: '16px' }}>
            <span>Tren Biaya ({period.split('-')[1]}/{period.split('-')[0]})</span>
            <span className="badge badge-info">Target: 27%</span>
          </div>
          <WidgetErrorBoundary name="Grafik Tren Biaya">
            {isLoadingTx ? (
              <div style={{ width: '100%', height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                <div style={{ width: '24px', height: '24px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Memuat grafik...</span>
              </div>
            ) : (
              <div style={{ width: '100%', height: 300, minHeight: 300, position: 'relative' }}>
                <ResponsiveContainer width="100%" height={300} minWidth={100} debounce={50}>
                  <LineChart data={trendData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} minTickGap={20} interval="preserveStartEnd" />
                    <YAxis domain={[0, (dataMax) => Math.max(35, Math.ceil(dataMax + 5))]} stroke="var(--text-muted)" tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend verticalAlign="top" height={36} />
                    <Line type="monotone" dataKey="cost" name={'Biaya F&B %'} stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="target" name="Target" stroke="var(--danger)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </WidgetErrorBoundary>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="chart-title" style={{ marginBottom: '16px' }}>Nilai Stok per Kategori</div>
          <WidgetErrorBoundary name="Grafik Valuasi Kategori">
            <div style={{ width: '100%', height: 260, minHeight: 260, position: 'relative' }}>
              {pieData.length === 0 ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Belum ada data valuasi kategori
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260} minWidth={100} debounce={50}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatIDR(v)} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </WidgetErrorBoundary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
            {pieData.map((entry, i) => (
              <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                <span style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Bar + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="chart-title" style={{ marginBottom: '16px' }}>5 Bahan Nilai Tertinggi</div>
          <WidgetErrorBoundary name="Grafik Kontributor Biaya">
            <div style={{ width: '100%', height: 300, minHeight: 300, position: 'relative' }}>
              {contributorsData.length === 0 ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Belum ada data pemakaian.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300} minWidth={100} debounce={50}>
                  <BarChart data={contributorsData} layout="vertical" margin={{ top: 10, right: 15, left: -5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                    <XAxis type="number" stroke="var(--text-muted)" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" stroke="var(--text-muted)" tick={{ fontSize: 10 }} width={95} />
                    <Tooltip formatter={(v) => formatIDR(v)} contentStyle={tooltipStyle} />
                    <Bar dataKey="cost" fill="var(--warning)" radius={[0, 4, 4, 0]} name="Nilai (IDR)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </WidgetErrorBoundary>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="chart-title">
            <span>Stok Menipis</span>
            {lowStockItems.length > 0 && <span className="badge badge-danger">{lowStockItems.length} bahan</span>}
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lowStockItems.length > 0 ? lowStockItems.slice(0, 8).map(item => {
              const total = (item.qty_resto || 0) + (item.qty_central || 0);
              return (
                <div key={item.id ?? item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--danger-glow)', border: '1px solid rgba(220, 38, 38, 0.12)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                  <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.category}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '0.85rem' }}>{total.toFixed(0)} {item.unit}</div>
                  </div>
                </div>
              );
            }) : (
              <div className="empty-state">
                <CheckCircle size={40} style={{ color: 'var(--success)' }} />
                <span>Semua stok aman</span>
              </div>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}


