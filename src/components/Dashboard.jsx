import { useMemo } from 'react';
import { TrendingDown, DollarSign, Package, AlertTriangle, ArrowRight, CheckCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard({ stock, transactions, onNavigate }) {
  const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

  // KPI Calculations
  const stockValuation = stock.reduce((acc, item) => acc + ((item.qty_resto || 0) + (item.qty_central || 0)) * (item.new_price || item.price || 0), 0);
  const lowStockItems = stock.filter(item => ((item.qty_resto || 0) + (item.qty_central || 0)) < (item.min_stock || 15));

  // Calculate real metrics from live transaction data
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const realSalesRevenue = useMemo(() => {
    return (transactions || [])
      .filter(tx => tx.type === 'POS_SALE' && tx.date && tx.date.startsWith(currentMonth))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  }, [transactions, currentMonth]);

  const realCogsCost = useMemo(() => {
    return (transactions || [])
      .filter(tx => tx.type === 'POS_DEDUCTION' && tx.date && tx.date.startsWith(currentMonth))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  }, [transactions, currentMonth]);

  const realCostPct = realSalesRevenue > 0 ? (realCogsCost / realSalesRevenue) * 100 : 0;

  // Real 30-day trend from transactions
  const realTrendData = useMemo(() => {
    const dayMap = {};
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const label = `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      dayMap[key] = { name: label, cost: 0, revenue: 0, target: 27 };
      last30.push(key);
    }
    (transactions || []).forEach(tx => {
      if (dayMap[tx.date]) {
        if (tx.type === 'POS_DEDUCTION') dayMap[tx.date].cost += Math.abs(parseFloat(tx.amount || 0));
        if (tx.type === 'POS_SALE') dayMap[tx.date].revenue += Math.abs(parseFloat(tx.amount || 0));
      }
    });
    return last30.map(key => ({
      ...dayMap[key],
      cost: dayMap[key].revenue > 0 ? parseFloat(((dayMap[key].cost / dayMap[key].revenue) * 100).toFixed(1)) : 0
    }));
  }, [transactions]);

  // Top 5 cost contributors from stock value
  const topContributors = useMemo(() => {
    return [...(stock || [])]
      .map(item => ({
        name: item.name,
        cost: ((item.qty_resto || 0) + (item.qty_central || 0)) * (item.new_price || item.price || 0)
      }))
      .filter(item => item.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [stock]);

  const totalSalesBeverage = realSalesRevenue;
  const currentCostPct = realCostPct;
  const trendData = realTrendData;
  const contributorsData = topContributors;

  // Category breakdown
  const categoryVals = {};
  stock.forEach(item => {
    const val = ((item.qty_resto || 0) + (item.qty_central || 0)) * (item.new_price || item.price || 0);
    categoryVals[item.category] = (categoryVals[item.category] || 0) + val;
  });
  const pieData = Object.entries(categoryVals).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 6);
  const COLORS = ['#4c6ef5', '#51cf66', '#fcc419', '#845ef7', '#ff6b6b', '#20c997'];

  const tooltipStyle = { background: '#1a1d27', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', color: '#f1f3f5' };

  return (
    <div>
      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Beverage Cost %</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(81,207,102,0.1)', color: 'var(--success)' }}>
              <TrendingDown size={20} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{currentCostPct.toFixed(1)}%</div>
          <div className="kpi-footer"><span className="trend-up">Target aman (&lt;27%)</span></div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Beverage Sales</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
              <DollarSign size={20} />
            </div>
          </div>
          <div className="kpi-value">{formatIDR(totalSalesBeverage)}</div>
          <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>Periode {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</span></div>
        </div>

        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Stock Valuation</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(132,94,247,0.1)', color: '#845ef7' }}>
              <Package size={20} />
            </div>
          </div>
          <div className="kpi-value">{formatIDR(stockValuation)}</div>
          <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>Resto + Central</span></div>
        </div>

        <div className="glass-card kpi-card" onClick={() => onNavigate('stock')} style={{ cursor: 'pointer' }}>
          <div className="kpi-header">
            <span className="kpi-title">Low Stock Items</span>
            <div className="kpi-icon-wrap" style={{ background: lowStockItems.length > 0 ? 'rgba(255,107,107,0.1)' : 'rgba(81,207,102,0.1)', color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="chart-title">
            <span>Beverage Cost Trend (30 Days)</span>
            <span className="badge badge-info">Target: 27%</span>
          </div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#5c636e" tick={{ fontSize: 12 }} />
                <YAxis domain={[20, 32]} stroke="#5c636e" tick={{ fontSize: 12 }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="top" height={36} />
                <Line type="monotone" dataKey="cost" name="Beverage Cost %" stroke="#4c6ef5" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="target" name="Target" stroke="#ff6b6b" strokeDasharray="5 5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="chart-title">Stock Value by Category</div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatIDR(v)} contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="chart-title">Top 5 Cost Contributors</div>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contributorsData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" stroke="#5c636e" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" stroke="#5c636e" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v) => formatIDR(v)} contentStyle={tooltipStyle} />
                <Bar dataKey="cost" fill="#fcc419" radius={[0, 4, 4, 0]} name="Pemakaian (IDR)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="chart-title">
            <span>Low Stock Alerts</span>
            {lowStockItems.length > 0 && <span className="badge badge-danger">{lowStockItems.length} items</span>}
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {lowStockItems.length > 0 ? lowStockItems.slice(0, 8).map(item => {
              const total = (item.qty_resto || 0) + (item.qty_central || 0);
              return (
                <div key={item.id ?? item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,107,107,0.03)', border: '1px solid rgba(255,107,107,0.1)', padding: '10px 14px', borderRadius: '8px' }}>
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
                <span>All materials above min level</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
