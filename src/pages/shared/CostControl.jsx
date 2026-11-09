import { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle,
    Info, Calendar, Loader, ChevronDown
} from 'lucide-react';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';

import { exportWithAudit } from '../../services/export/exportAudit';
import { useAuth } from '../../contexts/AuthContext';

export default function CostControl() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMethodNote, setShowMethodNote] = useState(false);

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
  const { openingStock, totalPembelian, closingStock, pemakaianBulan, totalSalesBeverage, beverageCostPct, wasteValuation, statusLabel, filteredOpnameItems, actualDailyUsageCost, theoreticalCogsCost, theoreticalUsageItems, reconciliationDifference, closedEodSessions, openingStockEstimated, closingStockEstimated } = useMemo(() => {
    if (!reportData) return { openingStock: 0, totalPembelian: 0, closingStock: 0, pemakaianBulan: 0, totalSalesBeverage: 0, beverageCostPct: 0, wasteValuation: 0, statusLabel: 'SAFE', filteredOpnameItems: [], actualDailyUsageCost: 0, theoreticalCogsCost: 0, theoreticalUsageItems: 0, reconciliationDifference: 0, closedEodSessions: 0, openingStockEstimated: false, closingStockEstimated: false };

    let purchases = 0;
    let cogsIngredients = 0;
    let sales = 0;
    let waste = 0;

    const wasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

    // 1. Accumulate Transactions
    (reportData?.transactions || []).forEach(tx => {
      const dateStr = tx.date || '';
      if (!dateStr.startsWith(period)) return;
      const amt = Math.round(Math.abs(Number(tx.amount || 0)));

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
      closing += Math.round(item.totalValuation || 0);
      filteredOpnames.push(item);
    });

    // 3. Backend metrics fallback
    let opening = cogsIngredients - purchases + closing;
    if (opening < 0) opening = 0;

    if (reportData.metrics) {
      opening = reportData.metrics.opening_stock;
      closing = reportData.metrics.closing_stock;
    }

    let actualCogs = opening + purchases - closing;
    if (actualCogs < 0) actualCogs = 0;
    actualCogs = Number(reportData.metrics?.total_cogs ?? actualCogs) || 0;

    const bevPct = sales > 0 ? (actualCogs / sales) * 100 : 0;
    // FIX 2026-09 (QA finding, sanity check): Cost % > 100% berarti COGS lebih
    // besar dari seluruh omzet bulan itu — secara bisnis nyaris mustahil terjadi
    // wajar. Ini jauh lebih mungkin gejala bug data (duplikasi upload POS,
    // duplikasi stock opname, atau transaksi historis pra-perbaikan pack-size)
    // daripada kondisi operasional riil. Beri label terpisah ('ANOMALY') supaya
    // tidak disamakan dengan 'DANGER' biasa (cost tinggi tapi datanya valid).
    const stat = bevPct <= 27.00 ? 'SAFE' : (bevPct <= 30.00 ? 'WARNING' : (bevPct <= 100.00 ? 'DANGER' : 'ANOMALY'));

    return {
      openingStock: opening,
      totalPembelian: purchases,
      closingStock: closing,
      pemakaianBulan: actualCogs,
      totalSalesBeverage: sales,
      beverageCostPct: bevPct,
      wasteValuation: waste,
      statusLabel: stat,
      filteredOpnameItems: filteredOpnames,
      actualDailyUsageCost: Number(reportData.metrics?.actual_daily_usage_cost) || 0,
      theoreticalCogsCost: Number(reportData.metrics?.theoretical_cogs_cost) || 0,
      theoreticalUsageItems: Number(reportData.metrics?.theoretical_usage_items) || 0,
      reconciliationDifference: Number(reportData.metrics?.reconciliation_difference_after_usage_and_waste) || 0,
      closedEodSessions: Number(reportData.metrics?.closed_eod_sessions) || 0,
      openingStockEstimated: Boolean(reportData.metrics?.opening_stock_estimated),
      closingStockEstimated: Boolean(reportData.metrics?.closing_stock_estimated)
    };
  }, [reportData, period]);

  // The daily breakdown must also count OUT transactions with POS Sync notes as COGS, and respect Tabs.
  const dailyColumns = useMemo(() => {
    const dailyMap = {};
    const txs = reportData?.transactions || [];

    // Group POS OUT deductions (stock consumed from POS sync) by date
    txs
      .filter(tx => (tx.type === 'POS_SALE' || (tx.type === 'OUT' && (tx.notes || '').startsWith('POS Sync:'))))
      .forEach(tx => {
        const dateStr = tx.date || '';
        if (dateStr.startsWith(period)) {
          const day = dateStr.substring(5).replace('-', '/');
          if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
          dailyMap[day].sales += Math.round(Math.abs(Number(tx.amount || 0)));
        }
      });

    // Group PURCHASE_IN (stock received from invoices) by date
    txs
      .filter(tx => tx.type === 'PURCHASE_IN')
      .forEach(tx => {
        const dateStr = tx.date || '';
        if (dateStr.startsWith(period)) {
          const day = dateStr.substring(5).replace('-', '/');
          if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
          dailyMap[day].purchase += Math.round(Math.abs(Number(tx.amount || 0)));
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
  }, [reportData?.transactions, period, dateFrom, dateTo]);

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
    { item: 'Pemakaian Harian Aktual (OUT manual / konsumsi akhir)', value: actualDailyUsageCost },
    { item: 'Theoretical COGS (ESB × Resep)', value: theoreticalCogsCost },
    { item: 'Catatan depletion harian berbasis ledger', value: 'Estimasi buku — bukan rekonsiliasi fisik independen karena FULL diinferensikan' },
    { item: 'Sisa Selisih Setelah Pemakaian Harian dan Waste', value: reconciliationDifference },
    { item: 'Sesi EOD Final', value: closedEodSessions },
    { item: 'Total F&B Sales', value: totalSalesBeverage },
    { item: 'Total F&B Cost %', value: `${beverageCostPct.toFixed(2)}%` },
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

        {/* Removed Tab Buttons */}

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
          {statusLabel === 'ANOMALY' && (
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
              borderRadius: 'var(--radius-xl)', padding: '16px 24px', marginBottom: '16px',
              display: 'flex', alignItems: 'flex-start', gap: '12px'
            }}>
              <AlertTriangle size={22} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--warning)' }}>Data tidak wajar terdeteksi.</strong>{' '}
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Beverage Cost {beverageCostPct.toFixed(2)}% berarti biaya bahan melebihi seluruh omzet periode ini —
                  ini nyaris selalu tanda ada duplikasi data (upload POS berulang, stock opname ganda, atau transaksi
                  historis lama) dan bukan kondisi bisnis riil. Periksa jumlah baris di modul Purchasing/POS Upload
                  untuk periode ini sebelum mengambil keputusan berdasarkan angka ini.
                </span>
              </div>
            </div>
          )}
          {/* Ringkasan Eksekutif Cost Control (4 Kartu Inti) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
            <div className="glass-card p-4 flex flex-col justify-between">
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
                Total Penjualan Beverage (POS)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatIDR(totalSalesBeverage)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Target Maks HPP (27%): <strong>{formatIDR(totalSalesBeverage * 0.27)}</strong>
              </div>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between" style={{ borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
                HPP Aktual (Rekonsiliasi Stok)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent)' }}>
                {formatIDR(pemakaianBulan)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Theoretical (ESB x Resep): <strong>{formatIDR(theoreticalCogsCost)}</strong>
              </div>
            </div>

            <div
              className="glass-card p-4 flex flex-col justify-between"
              style={{
                background: beverageCostPct <= 27 ? 'rgba(81,207,102,0.04)' : 'rgba(255,107,107,0.04)',
                border: `1px solid ${beverageCostPct <= 27 ? 'rgba(81,207,102,0.25)' : 'rgba(255,107,107,0.25)'}`
              }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
                Rasio Beverage Cost %
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800, color: beverageCostPct <= 27 ? 'var(--success)' : 'var(--danger)' }}>
                {beverageCostPct.toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {beverageCostPct <= 27 ? <CheckCircle size={13} color="var(--success)" /> : <AlertTriangle size={13} color="var(--danger)" />}
                <span>Selisih vs 27%: {(beverageCostPct - 27).toFixed(2)}%</span>
              </div>
            </div>

            <div className="glass-card p-4 flex flex-col justify-between">
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '6px' }}>
                Pemakaian EOD & Selisih
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {formatIDR(actualDailyUsageCost)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Selisih Rekonsiliasi: <strong style={{ color: Math.abs(reconciliationDifference) > 0.01 ? 'var(--warning)' : 'var(--success)' }}>{formatIDR(reconciliationDifference)}</strong> • EOD Lock: <strong>{closedEodSessions}</strong>
              </div>
            </div>
          </div>

          {/* Pita Rumus Baku HPP + Tombol Info Metodologi */}
          <div className="glass-card p-3.5 mb-5" style={{ background: 'var(--bg-secondary)' }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-[var(--text-secondary)] uppercase">Formula HPP:</span>
                <span>Stok Awal <strong>{formatIDR(openingStock)}</strong></span>
                <span>+ Belanja <strong>{formatIDR(totalPembelian)}</strong></span>
                <span>- Stok Akhir <strong>{formatIDR(closingStock)}</strong></span>
                <span>= HPP <strong style={{ color: 'var(--accent)' }}>{formatIDR(pemakaianBulan)}</strong></span>
                <span className="text-rose-500">• Waste/Loss: <strong>{formatIDR(wasteValuation)}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => setShowMethodNote(prev => !prev)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline shrink-0 self-start md:self-auto"
              >
                <Info size={13} />
                <span>{showMethodNote ? 'Sembunyikan Catatan Metodologi' : 'Catatan Metodologi Pengukuran'}</span>
              </button>
            </div>
            {showMethodNote && (
              <div
                role="note"
                className="mt-2.5 pt-2.5 border-t border-[var(--border)] text-[11px] text-[var(--text-secondary)] leading-relaxed"
              >
                Catatan pengukuran: FULL dihitung dari saldo buku dan BROKEN yang ditimbang, bukan hitung fisik independen atas kemasan utuh. Estimasi depletion harian dari ledger digunakan untuk pemantauan operasional harian, sedangkan rekonsiliasi HPP resmi mengacu pada Stock Opname yang disahkan.
              </div>
            )}
          </div>

          {/* Daily Table */}
          <div className="glass-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={16} style={{ color: 'var(--accent)' }} /> Daily Purchase vs Sales
              </h3>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', width: '100%', maxWidth: '420px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Filter Tanggal:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 240px', minWidth: 0 }}>
                  <input
                    type="date"
                    className="form-control"
                    style={{ padding: '5px 8px', fontSize: '0.78rem', flex: '1 1 110px', minWidth: 0, width: '100%' }}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    min={`${period}-01`}
                    max={`${period}-31`}
                  />
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>-</span>
                  <input
                    type="date"
                    className="form-control"
                    style={{ padding: '5px 8px', fontSize: '0.78rem', flex: '1 1 110px', minWidth: 0, width: '100%' }}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    min={dateFrom || `${period}-01`}
                    max={`${period}-31`}
                  />
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.75rem', flexShrink: 0 }}
                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                  >
                    Reset
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
                        <th style={{ textAlign: 'right' }} title="Rasio pembelian terhadap penjualan harian">Beli/Jual %</th>
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