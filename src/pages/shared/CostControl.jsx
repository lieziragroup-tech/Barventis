import { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle,
  TrendingDown, TrendingUp, Info, Calendar, Loader, ChevronDown
} from 'lucide-react';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };
import { useData } from '../../contexts/DataContext';

export default function CostControl() {
  const { stock } = useData();
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);



  // Fetch dynamic report from backend API (resolving BUG-002)
  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const data = await api.getCostControlReport(period);
        setReportData(data);
      } catch (e) {
        console.error('Failed to load cost control report:', e);
        setErrorMsg(e.message || 'Gagal memuat laporan Cost Control.');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [period, stock]); // Reload if any crucial state updates

  // Map API metrics
  const openingStock = reportData?.metrics?.opening_stock ?? 0;
  const totalPembelian = reportData?.metrics?.purchases ?? 0;
  const closingStock = reportData?.metrics?.closing_stock ?? 0;
  const pemakaianBulan = reportData?.metrics?.total_cogs ?? 0;
  const totalSalesBeverage = reportData?.metrics?.sales_revenue ?? 0;
  const beverageCostPct = reportData?.metrics?.beverage_cost_pct ?? 0;
  const wasteValuation = reportData?.metrics?.waste_valuation ?? 0;
  const statusLabel = reportData?.metrics?.status ?? 'SAFE';

  // BUG-CC-01: POS sync writes transactions with type='OUT' (not 'POS_SALE' or 'POS_DEDUCTION').
  // The daily breakdown must also count OUT transactions with POS Sync notes as COGS.
  const dailyColumns = useMemo(() => {
    const dailyMap = {};
    const txs = reportData?.transactions || [];

    // Group POS OUT deductions (stock consumed from POS sync) by date
    txs
      .filter(tx => (tx.type === 'POS_SALE' || (tx.type === 'OUT' && (tx.notes || '').startsWith('POS Sync:'))) && (tx.date || '').startsWith(period))
      .forEach(tx => {
        const day = (tx.date || '').substring(5).replace('-', '/');
        if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
        dailyMap[day].sales += Math.abs(tx.amount || 0);
      });

    // Group PURCHASE_IN (stock received from invoices) by date
    txs
      .filter(tx => tx.type === 'PURCHASE_IN' && (tx.date || '').startsWith(period))
      .forEach(tx => {
        const day = (tx.date || '').substring(5).replace('-', '/');
        if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
        dailyMap[day].purchase += Math.abs(tx.amount || 0);
      });

    const result = Object.values(dailyMap);
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [reportData?.transactions, period]);

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

  // Export Excel Lengkap (Summary + SO Fisik)
  const handleExportExcel = async (type = 'ALL') => {
    const XLSX = await getXLSX();
    const summaryData = [
      { 'Item': 'Total Stock Awal (Opening)', 'Value (IDR)': openingStock },
      { 'Item': 'Total Pembelian (PO)', 'Value (IDR)': totalPembelian },
      { 'Item': 'Total Stock Akhir (Closing)', 'Value (IDR)': closingStock },
      { 'Item': 'Total Waste / Kerugian (Spoilage, Broken)', 'Value (IDR)': wasteValuation },
      { 'Item': 'Total Pemakaian (COGS Aktual + Overhead)', 'Value (IDR)': pemakaianBulan },
      { 'Item': 'Total Sales Beverage', 'Value (IDR)': totalSalesBeverage },
      { 'Item': 'Beverage Cost %', 'Value (IDR)': `${beverageCostPct.toFixed(2)}%` },
      { 'Item': 'Status', 'Value (IDR)': statusLabel }
    ];
    
    const opnameData = (reportData?.detailed_opname_items || []).map((item, idx) => ({
      'NO': idx + 1,
      'NAMA ITEM': item.name,
      'KATEGORI': item.category,
      'UNIT': item.unit,
      'FULL PACK': item.full_pack,
      'STOK SISTEM': item.systemQty,
      'STOK FISIK': item.physicalQty,
      'VARIANCE': item.variance,
      'HARGA BELI': item.price,
      'TOTAL VALUASI': item.totalValuation,
      'SUPPLIER': item.supplier
    }));

    const wb = XLSX.utils.book_new();

    if (type === 'ALL' || type === 'SUMMARY') {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Cost Control Summary');
      const dailyData = dailyColumns.map(row => ({
        'Date': row.date,
        'Purchases (IDR)': row.purchase,
        'Sales (IDR)': row.sales,
        'Purchase/Sales %': row.sales > 0 ? ((row.purchase / row.sales) * 100).toFixed(1) : '0.0'
      }));
      if (dailyData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyData), 'Daily Breakdown');
    }

    if (type === 'ALL' || type === 'SO') {
      if (opnameData.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(opnameData), 'Stock Opname Fisik');
      }
    }

    const filename = type === 'ALL' ? `Laporan_Lengkap_SO_COGS_${period}.xlsx` : type === 'SUMMARY' ? `CostControl_Summary_${period}.xlsx` : `StockOpname_Fisik_${period}.xlsx`;
    XLSX.writeFile(wb, filename);
    setShowExportMenu(false);
  };

  // Print PDF Lengkap
  const handlePrintPDF = (type = 'ALL') => {
    const opnameItems = reportData?.detailed_opname_items || [];
    const printHTML = `
      <html><head><title>UMATIS Laporan LENGKAP - ${period}</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:12px}
      h1{font-size:22px;margin-bottom:4px;color:#111;text-align:center;}
      h2{font-size:16px;color:#444;margin:30px 0 10px;border-bottom:2px solid #eee;padding-bottom:5px;}
      p.subtitle{text-align:center;color:#666;font-size:14px;margin-top:0;}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-size:11px;font-weight:bold;text-transform:uppercase;}
      .highlight{font-weight:bold;font-size:18px;color:${beverageCostPct <= 27 ? '#2ecc71' : '#e74c3c'}}
      .summary-row{background:#f9f9f9;font-weight:bold}
      .text-right{text-align:right;}
      .danger{color:#e74c3c;}
      @media print { @page { size: landscape; margin: 10mm; } }
      </style></head><body>
      
      <h1>UMATIS RESTO & VENUE</h1>
      <p class="subtitle">Laporan Bulanan ${type === 'ALL' ? 'Cost Control & Stock Opname' : 'Cost Control'} — Periode: <strong>${period}</strong></p>
      
      ${(type === 'ALL' || type === 'SUMMARY') ? `
      <h2>Ringkasan HPP & COGS</h2>
      <p style="font-size:14px;">Status HPP Beverage: <span class="highlight">${beverageCostPct.toFixed(2)}%</span> ${beverageCostPct <= 27 ? '✓ Target Aman' : '⚠ Di Atas Target'}</p>
      <table style="max-width:500px;">
        <tr><td>Total Stock Awal (Opening)</td><td class="text-right">Rp ${openingStock.toLocaleString('id-ID')}</td></tr>
        <tr><td>+ Total Pembelian (PO Masuk)</td><td class="text-right">Rp ${totalPembelian.toLocaleString('id-ID')}</td></tr>
        <tr><td>- Total Stock Akhir Fisik (Closing SO)</td><td class="text-right">Rp ${closingStock.toLocaleString('id-ID')}</td></tr>
        <tr><td class="danger">⚠ Kerugian / Waste (Basi, Hilang)</td><td class="text-right danger">Rp ${wasteValuation.toLocaleString('id-ID')}</td></tr>
        <tr class="summary-row"><td>= Total Pemakaian (COGS Aktual + Overhead)</td><td class="text-right">Rp ${pemakaianBulan.toLocaleString('id-ID')}</td></tr>
        <tr><td>Total Sales Beverage (Pendapatan POS)</td><td class="text-right">Rp ${totalSalesBeverage.toLocaleString('id-ID')}</td></tr>
      </table>
      ` : ''}

      ${(type === 'ALL' && opnameItems.length > 0) ? `
      <div style="page-break-before: always;"></div>
      <h2>Detail Fisik Stock Opname (SO)</h2>
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>Nama Item</th>
            <th>Kategori</th>
            <th>Sistem</th>
            <th>Fisik</th>
            <th>Selisih</th>
            <th>Unit</th>
            <th class="text-right">Harga Beli</th>
            <th class="text-right">Total Valuasi Fisik</th>
            <th>Supplier</th>
          </tr>
        </thead>
        <tbody>
          ${opnameItems.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.name}</td>
              <td>${r.category}</td>
              <td>${r.systemQty}</td>
              <td style="font-weight:bold;">${r.physicalQty}</td>
              <td class="${r.variance < 0 ? 'danger' : ''}">${r.variance}</td>
              <td>${r.unit}</td>
              <td class="text-right">Rp ${r.price.toLocaleString('id-ID')}</td>
              <td class="text-right">Rp ${r.totalValuation.toLocaleString('id-ID')}</td>
              <td>${r.supplier}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ` : ''}
      
      <p style="margin-top:40px;font-size:10px;color:#999;text-align:right;">Dicetak oleh Sistem Barventis pada ${new Date().toLocaleString('id-ID')}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(printHTML);
    w.document.close();
    w.print();
    setShowExportMenu(false);
  };

  return (
    <div className="fade-in">
      {/* Period Picker */}
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
          <button className="btn btn-secondary" onClick={() => setPeriod(period)}>Coba Lagi</button>
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
              <span className="badge badge-info" style={{ marginBottom: '8px' }}>Period Beverage Cost</span>
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
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} style={{ color: 'var(--accent)' }} /> Daily Purchase vs Sales
            </h3>
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
                          <td style={{ textAlign: 'right', fontWeight: 700, color: ratio > 50 ? 'var(--warning)' : 'white' }}>{ratio.toFixed(1)}%</td>
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