import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle,
  TrendingDown, TrendingUp, Info, Calendar, Loader, ChevronDown
} from 'lucide-react';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';

import { useData } from '../../contexts/DataContext';

import { exportWithAudit } from '../../services/export/exportAudit';
import { useAuth } from '../../contexts/AuthContext';

export default function CostControl() {
  const { profile } = useAuth();
  const { recipes } = useData();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [activeTab, setActiveTab] = useState('ALL');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Cross-reference menu names to categories
  const menuCategoryMap = useMemo(() => {
    const map = {};
    (recipes || []).forEach(r => {
      if (r.menu_name) map[r.menu_name.toLowerCase()] = r.category?.toUpperCase() || '';
    });
    return map;
  }, [recipes]);

  const checkTabMatch = useCallback((tx, tab) => {
    if (tab === 'ALL') return true;

    let matchedCategory = null;

    if (tx.type === 'POS_SALE' || tx.type === 'POS_DEDUCTION' || tx.type === 'OUT') {
      let menuName = tx.notes || '';
      if (menuName.startsWith('POS Sync:')) menuName = menuName.replace('POS Sync:', '').trim();

      const exactMatch = menuCategoryMap[menuName.toLowerCase()];
      if (exactMatch) {
        matchedCategory = exactMatch;
      } else {
        const rMatch = (recipes || []).find(r => r.menu_name && menuName.toLowerCase().includes(r.menu_name.toLowerCase()));
        if (rMatch) matchedCategory = rMatch.category?.toUpperCase() || '';
      }
    } else {
      // PURCHASE_IN, WASTE, etc. rely on the attached material category from API
      matchedCategory = tx.materials?.category?.toUpperCase() || '';
    }

    if (!matchedCategory) return true; // Fail-safe let it through ALL

    const isBeer = matchedCategory.includes('BEER');
    if (tab === 'BEER') return isBeer;
    if (tab === 'BEVERAGE') return !isBeer;
    return true;
  }, [menuCategoryMap, recipes]);

  useEffect(() => {
    let active = true;
    const loadReport = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const data = await api.getCostControlReport(period);
        if (active) setReportData(data);
      } catch (e) {
        console.error('Failed to load cost control report:', e);
        if (active) setErrorMsg(e.message || 'Gagal memuat laporan Cost Control.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadReport();
    return () => { active = false; };
  }, [period]);

  // Re-calculate all metrics dynamically on the frontend to support Tab Filtering
  const { openingStock, totalPembelian, closingStock, pemakaianBulan, totalSalesBeverage, beverageCostPct, wasteValuation, statusLabel, filteredOpnameItems } = useMemo(() => {
    if (!reportData) return { openingStock: 0, totalPembelian: 0, closingStock: 0, pemakaianBulan: 0, totalSalesBeverage: 0, beverageCostPct: 0, wasteValuation: 0, statusLabel: 'SAFE', filteredOpnameItems: [] };

    let purchases = 0;
    let cogsIngredients = 0;
    let sales = 0;
    let waste = 0;

    const wasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

    // 1. Accumulate Transactions
    (reportData?.transactions || []).forEach(tx => {
      const dateStr = tx.date || '';
      if (!dateStr.startsWith(period) || !checkTabMatch(tx, activeTab)) return;
      const amt = Math.abs(parseFloat(tx.amount || 0));

      if (tx.type === 'PURCHASE_IN') {
        purchases += amt;
      } else if (tx.type === 'POS_DEDUCTION' || (tx.type === 'OUT' && (tx.notes || '').startsWith('POS Sync:'))) {
        cogsIngredients += amt;
      } else if (tx.type === 'POS_SALE') {
        sales += amt;
      } else if (wasteTypes.includes(tx.type)) {
        waste += amt;
      }
    });

    // 2. Accumulate Closing Stock from detailed_opname_items
    let closing = 0;
    const filteredOpnames = [];
    (reportData?.detailed_opname_items || []).forEach(item => {
      const isBeer = (item.category || '').toUpperCase().includes('BEER');
      let include = true;
      if (activeTab === 'BEER') include = isBeer;
      else if (activeTab === 'BEVERAGE') include = !isBeer;

      if (include) {
        closing += (item.totalValuation || 0);
        filteredOpnames.push(item);
      }
    });

    // 3. Reverse-engineer Opening Stock dynamically
    // Opening = COGS + Closing - Purchases + Waste
    // Wait, the backend formula is: COGS = Opening + Purchases - Closing -> Opening = COGS - Purchases + Closing
    let opening = cogsIngredients - purchases + closing;
    if (opening < 0) opening = 0; // Fallback bound

    // In case of ALL, we can just use the backend's opening stock if it differs from the derivation
    if (activeTab === 'ALL' && reportData.metrics) {
      opening = reportData.metrics.opening_stock;
      closing = reportData.metrics.closing_stock;
    }

    let actualCogs = opening + purchases - closing;
    if (actualCogs < 0) actualCogs = 0;

    const bevPct = sales > 0 ? (actualCogs / sales) * 100 : 0;
    const stat = bevPct <= 27.00 ? 'SAFE' : (bevPct <= 30.00 ? 'WARNING' : 'DANGER');

    return {
      openingStock: opening,
      totalPembelian: purchases,
      closingStock: closing,
      pemakaianBulan: actualCogs,
      totalSalesBeverage: sales,
      beverageCostPct: bevPct,
      wasteValuation: waste,
      statusLabel: stat,
      filteredOpnameItems: filteredOpnames
    };
  }, [reportData, activeTab, checkTabMatch, period]);

  // The daily breakdown must also count OUT transactions with POS Sync notes as COGS, and respect Tabs.
  const dailyColumns = useMemo(() => {
    const dailyMap = {};
    const txs = reportData?.transactions || [];

    // Group POS OUT deductions (stock consumed from POS sync) by date
    txs
      .filter(tx => (tx.type === 'POS_SALE' || (tx.type === 'OUT' && (tx.notes || '').startsWith('POS Sync:'))) && checkTabMatch(tx, activeTab))
      .forEach(tx => {
        const dateStr = tx.date || '';
        if (dateStr.startsWith(period)) {
          const day = dateStr.substring(5).replace('-', '/');
          if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
          dailyMap[day].sales += Math.abs(tx.amount || 0);
        }
      });

    // Group PURCHASE_IN (stock received from invoices) by date
    txs
      .filter(tx => tx.type === 'PURCHASE_IN' && checkTabMatch(tx, activeTab))
      .forEach(tx => {
        const dateStr = tx.date || '';
        if (dateStr.startsWith(period)) {
          const day = dateStr.substring(5).replace('-', '/');
          if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
          dailyMap[day].purchase += Math.abs(tx.amount || 0);
        }
      });

    const result = Object.values(dailyMap);
    result.sort((a, b) => a.date.localeCompare(b.date));

    // Apply date range filter
    return result.filter(row => {
      if (!dateFrom && !dateTo) return true;

      const year = parseInt(period.split('-')[0], 10);
      const month = parseInt(period.split('-')[1], 10) - 1;
      const day = parseInt(row.date.split('/')[1] || row.date.split('-')[1], 10);

      const rowDateObj = new Date(year, month, day);

      let passFrom = true;
      let passTo = true;

      if (dateFrom) {
        passFrom = rowDateObj >= new Date(dateFrom);
      }
      if (dateTo) {
        passTo = rowDateObj <= new Date(dateTo);
      }

      return passFrom && passTo;
    });
  }, [reportData?.transactions, period, activeTab, checkTabMatch, dateFrom, dateTo]);

  // Generate last 18 months dynamically
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

  
  const prepareSummaryRows = () => [
    { item: 'Total Stock Awal (Opening)', value: openingStock },
    { item: 'Total Pembelian (PO)', value: totalPembelian },
    { item: 'Total Stock Akhir (Closing)', value: closingStock },
    { item: 'Total Waste / Kerugian (Spoilage, Broken)', value: wasteValuation },
    { item: 'Total Pemakaian (COGS Aktual + Overhead)', value: pemakaianBulan },
    { item: 'Total Sales Beverage', value: totalSalesBeverage },
    { item: 'Beverage Cost %', value: `${beverageCostPct.toFixed(2)}%` },
    { item: 'Status', value: statusLabel }
  ];

  const prepareOpnameRows = () => filteredOpnameItems.map((item, idx) => ({
    no: idx + 1,
    name: item.name,
    category: item.category,
    unit: item.unit,
    full_pack: item.full_pack,
    system_qty: item.systemQty,
    physical_qty: item.physicalQty,
    variance: item.variance,
    price: item.price,
    total_val: item.totalValuation,
    supplier: item.supplier
  }));

  const handleExportExcel = async (type = 'ALL') => {
    try {
      const sheets = [];
      if (type === 'ALL' || type === 'SUMMARY') {
        const sumRows = prepareSummaryRows().map(r => ({ 'Item': r.item, 'Value': r.value }));
        sheets.push({ name: 'Cost Control Summary', rows: sumRows });
        
        const dailyRows = dailyColumns.map(row => ({
          'Date': row.date,
          'Purchases': row.purchase,
          'Sales': row.sales,
          'Purchase/Sales %': row.sales > 0 ? ((row.purchase / row.sales) * 100).toFixed(1) : '0.0'
        }));
        if (dailyRows.length > 0) sheets.push({ name: 'Daily Breakdown', rows: dailyRows });
      }

      if (type === 'ALL' || type === 'SO') {
        const soRows = prepareOpnameRows().map(r => ({
          'NO': r.no, 'NAMA ITEM': r.name, 'KATEGORI': r.category, 'UNIT': r.unit,
          'FULL PACK': r.full_pack, 'STOK SISTEM': r.system_qty, 'STOK FISIK': r.physical_qty,
          'VARIANCE': r.variance, 'HARGA BELI': r.price, 'TOTAL VALUASI': r.total_val, 'SUPPLIER': r.supplier
        }));
        if (soRows.length > 0) sheets.push({ name: 'Stock Opname Fisik', rows: soRows });
      }

      const filename = type === 'ALL' ? `Laporan_Lengkap_SO_COGS_${period}` : type === 'SUMMARY' ? `CostControl_Summary_${period}` : `StockOpname_Fisik_${period}`;
      await exportWithAudit({
        format: 'excel',
        filename,
        sheets,
        actionName: 'Cost Control Export',
        role: profile?.role || 'SuperAdmin'
      });
      setShowExportMenu(false);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor file');
    }
  };

  const handlePrintPDF = async (type = 'ALL') => {
    try {
      let rows = [];
      let columns = [];
      
      if (type === 'ALL' || type === 'SUMMARY') {
        columns = [
          { key: 'item', label: 'Item' },
          { key: 'value', label: 'Value' }
        ];
        rows = prepareSummaryRows().map(r => ({ item: r.item, value: typeof r.value === 'number' ? `Rp ${r.value.toLocaleString('id-ID')}` : r.value }));
      } else if (type === 'SO') {
        columns = [
          { key: 'no', label: '#' },
          { key: 'name', label: 'Item' },
          { key: 'system_qty', label: 'Sistem' },
          { key: 'physical_qty', label: 'Fisik' },
          { key: 'variance', label: 'Selisih' },
          { key: 'total_val', label: 'Total Valuasi' }
        ];
        rows = prepareOpnameRows().map(r => ({
          ...r,
          total_val: `Rp ${(r.total_val || 0).toLocaleString('id-ID')}`
        }));
      }

      const filename = type === 'ALL' ? `Laporan_Lengkap_${period}` : type === 'SUMMARY' ? `Summary_${period}` : `SO_${period}`;
      await exportWithAudit({
        format: 'pdf',
        filename,
        title: `Laporan ${type === 'ALL' ? 'Lengkap' : type === 'SUMMARY' ? 'Cost Control Summary' : 'Stock Opname Fisik'} - ${period}`,
        tenantName: 'UMATIS RESTO & VENUE',
        columns,
        rows,
        actionName: 'Cost Control Export PDF',
        role: profile?.role || 'SuperAdmin'
      });
      setShowExportMenu(false);
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor PDF');
    }
  };


  // Print PDF Lengkap

  return (
    <div className="fade-in">
      {/* Tab Switcher & Period Picker */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Calendar size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Period:</span>
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

        <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
          <button
            className={`btn ${activeTab === 'ALL' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '0.8rem', background: activeTab === 'ALL' ? '' : 'transparent', color: activeTab === 'ALL' ? '' : 'var(--text-secondary)', border: 'none' }}
            onClick={() => setActiveTab('ALL')}
          >
            Semua (Global)
          </button>
          <button
            className={`btn ${activeTab === 'BEVERAGE' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '0.8rem', background: activeTab === 'BEVERAGE' ? '' : 'transparent', color: activeTab === 'BEVERAGE' ? '' : 'var(--text-secondary)', border: 'none' }}
            onClick={() => setActiveTab('BEVERAGE')}
          >
            Beverage (Non-Beer)
          </button>
          <button
            className={`btn ${activeTab === 'BEER' ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '0.8rem', background: activeTab === 'BEER' ? '' : 'transparent', color: activeTab === 'BEER' ? '' : 'var(--text-secondary)', border: 'none' }}
            onClick={() => setActiveTab('BEER')}
          >
            Beer Only
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-primary" 
            style={{ display: 'flex', gap: '8px', padding: '10px 18px', fontSize: '0.85rem', fontWeight: 600, alignItems: 'center' }} 
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={loading || !reportData}
          >
            Export & Cetak Laporan <ChevronDown size={14} />
          </button>
          
          {showExportMenu && (
            <div className="glass-card" style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', minWidth: '280px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', paddingLeft: '8px' }}>All-In-One (Lengkap)</div>
              <button className="btn btn-secondary" style={{ textAlign: 'left', justifyContent: 'flex-start', border: 'none', background: 'transparent' }} onClick={() => handlePrintPDF('ALL')}>
                <FileText size={14} style={{ color: 'var(--danger)' }} /> Cetak PDF Lengkap (COGS + Opname Fisik)
              </button>
              <button className="btn btn-secondary" style={{ textAlign: 'left', justifyContent: 'flex-start', border: 'none', background: 'transparent' }} onClick={() => handleExportExcel('ALL')}>
                <FileSpreadsheet size={14} style={{ color: '#2ecc71' }} /> Export Excel Lengkap (2 Sheets)
              </button>
              
              <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', paddingLeft: '8px' }}>Eksport Terpisah</div>
              
              <button className="btn btn-secondary" style={{ textAlign: 'left', justifyContent: 'flex-start', border: 'none', background: 'transparent', fontSize: '0.8rem' }} onClick={() => handlePrintPDF('SUMMARY')}>
                <FileText size={14} /> Hanya PDF Ringkasan COGS
              </button>
              <button className="btn btn-secondary" style={{ textAlign: 'left', justifyContent: 'flex-start', border: 'none', background: 'transparent', fontSize: '0.8rem' }} onClick={() => handleExportExcel('SO')}>
                <FileSpreadsheet size={14} /> Hanya Excel Stock Opname
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
          <Loader size={36} className="animate-spin" style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Memuat Laporan Cost Control...</span>
        </div>
      ) : errorMsg ? (
        <div className="glass-card" style={{ padding: '24px', textAlign: 'center', border: '1px solid var(--danger)' }}>
          <AlertTriangle size={36} style={{ color: 'var(--danger)', margin: '0 auto 12px' }} />
          <h4 style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '8px' }}>Gagal Memuat Laporan</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>Coba Lagi</button>
        </div>
      ) : (
        <>
          {/* HPP Card */}
          <div style={{
            background: beverageCostPct <= 27 ? 'rgba(81,207,102,0.04)' : 'rgba(255,107,107,0.04)',
            border: `1px solid ${beverageCostPct <= 27 ? 'rgba(81,207,102,0.15)' : 'rgba(255,107,107,0.15)'}`,
            borderRadius: 'var(--radius-xl)', padding: '24px 32px', marginBottom: '24px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px'
          }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: '8px' }}>Period {activeTab === 'BEER' ? 'Beer Cost' : 'Beverage Cost'}</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '6px' }}>
                HPP: <span style={{ color: beverageCostPct <= 27 ? 'var(--success)' : 'var(--danger)' }}>{beverageCostPct.toFixed(2)}%</span>
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {beverageCostPct <= 27 ? (
                  <><CheckCircle size={16} style={{ color: 'var(--success)' }} /> Target aman (&lt;27%)</>
                ) : (
                  <><AlertTriangle size={16} style={{ color: 'var(--danger)' }} /> Melebihi target 27%</>
                )}
              </p>
            </div>
            <div className="kpi-icon-wrap" style={{
              width: '64px', height: '64px', borderRadius: 'var(--radius-lg)',
              background: beverageCostPct <= 27 ? 'var(--success-glow)' : 'var(--danger-glow)',
              color: beverageCostPct <= 27 ? 'var(--success)' : 'var(--danger)'
            }}>
              {beverageCostPct <= 27 ? <TrendingDown size={32} /> : <TrendingUp size={32} />}
            </div>
          </div>

          {/* Formula Cards */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '32px' }}>
            {[
              { label: '1. Stock Awal (Opening)', value: formatIDR(openingStock), sub: 'Awal resto + gudang pusat' },
              { label: '2. Pembelian (PO Received)', value: `+ ${formatIDR(totalPembelian)}`, sub: 'Barang masuk periode ini' },
              { label: '3. Stock Akhir (Closing)', value: `- ${formatIDR(closingStock)}`, sub: 'Stok opname yang aktif' },
              { label: 'Kerugian (Waste/Loss)', value: formatIDR(wasteValuation), sub: 'Basi, Pecah, Hilang (Di luar HPP)', warning: true },
              { label: '4. Pemakaian (COGS)', value: `= ${formatIDR(pemakaianBulan)}`, sub: '(Awal + PO) - Akhir', accent: true }
            ].map((card, i) => (
              <div key={i} className="glass-card" style={{ padding: '16px 20px', borderLeft: card.accent ? '3px solid var(--accent)' : (card.warning ? '3px solid var(--danger)' : 'none') }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{card.label}</div>
                <div style={{ fontWeight: (card.accent || card.warning) ? 800 : 700, fontSize: '1.05rem', color: card.accent ? 'var(--accent)' : (card.warning ? 'var(--danger)' : 'var(--text-primary)') }}>{card.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Daily Table */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={16} style={{ color: 'var(--accent)' }} /> Daily Purchase vs Sales
              </h3>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Filter Tanggal:</span>
                <input
                  type="date"
                  className="form-control"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', width: '130px' }}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  min={`${period}-01`}
                  max={`${period}-31`}
                />
                <span style={{ color: 'var(--text-muted)' }}>-</span>
                <input
                  type="date"
                  className="form-control"
                  style={{ padding: '4px 8px', fontSize: '0.8rem', width: '130px' }}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || `${period}-01`}
                  max={`${period}-31`}
                />
                {(dateFrom || dateTo) && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {dailyColumns.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Tidak ada data transaksi harian tercatat untuk periode {period}.
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Purchases</th>
                      <th style={{ textAlign: 'right' }}>Sales Revenue</th>
                      <th style={{ textAlign: 'right' }} title="Rasio pembelian terhadap penjualan harian — BUKAN HPP/beverage cost %. HPP periode ada di kartu atas.">Beli/Jual %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyColumns.map(row => {
                      const ratio = row.sales > 0 ? (row.purchase / row.sales) * 100 : 0;
                      return (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatIDR(row.purchase)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIDR(row.sales)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: ratio > 50 ? 'var(--warning)' : 'var(--text-primary)' }}>{ratio.toFixed(1)}%</td>
                          <td>{ratio > 50 ? <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>High</span> : <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>OK</span>}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: 'var(--bg-tertiary)', borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 700 }}>TOTAL</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatIDR(totalPembelian)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatIDR(totalSalesBeverage)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>{totalSalesBeverage > 0 ? ((totalPembelian / totalSalesBeverage) * 100).toFixed(1) : '0.0'}%</td>
                      <td><span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Complete</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}