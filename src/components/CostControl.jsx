import { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet, FileText, CheckCircle, AlertTriangle,
  TrendingDown, TrendingUp, Info, Calendar, Loader
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../services/api';

export default function CostControl({ stock, transactions, invoices }) {
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

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
  }, [period, transactions, stock, invoices]); // Reload if any crucial state updates

  // Map API metrics
  const openingStock = reportData?.metrics?.opening_stock ?? 0;
  const totalPembelian = reportData?.metrics?.purchases ?? 0;
  const closingStock = reportData?.metrics?.closing_stock ?? 0;
  const pemakaianBulan = reportData?.metrics?.total_cogs ?? 0;
  const totalSalesBeverage = reportData?.metrics?.sales_revenue ?? 0;
  const beverageCostPct = reportData?.metrics?.beverage_cost_pct ?? 0;
  const statusLabel = reportData?.metrics?.status ?? 'SAFE';

  // BUG-CC-01: POS sync writes transactions with type='OUT' (not 'POS_SALE' or 'POS_DEDUCTION').
  // The daily breakdown must also count OUT transactions with POS Sync notes as COGS.
  const dailyColumns = useMemo(() => {
    const dailyMap = {};

    // Group POS OUT deductions (stock consumed from POS sync) by date
    (transactions || [])
      .filter(tx => (tx.type === 'POS_SALE' || (tx.type === 'OUT' && (tx.notes || '').startsWith('POS Sync:'))) && (tx.date || '').startsWith(period))
      .forEach(tx => {
        const day = (tx.date || '').substring(5).replace('-', '/');
        if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
        dailyMap[day].sales += Math.abs(tx.amount || 0);
      });

    // Group PURCHASE_IN (stock received from invoices) by date
    (transactions || [])
      .filter(tx => tx.type === 'PURCHASE_IN' && (tx.date || '').startsWith(period))
      .forEach(tx => {
        const day = (tx.date || '').substring(5).replace('-', '/');
        if (!dailyMap[day]) dailyMap[day] = { date: day, purchase: 0, sales: 0 };
        dailyMap[day].purchase += Math.abs(tx.amount || 0);
      });

    const result = Object.values(dailyMap);
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [transactions, period]);

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

  // Export to Excel
  const handleExportExcel = () => {
    const summaryData = [
      { 'Item': 'Total Stock Awal (Opening)', 'Value (IDR)': openingStock },
      { 'Item': 'Total Pembelian (PO)', 'Value (IDR)': totalPembelian },
      { 'Item': 'Total Stock Akhir (Closing)', 'Value (IDR)': closingStock },
      { 'Item': 'Total Pemakaian (COGS + 5% Overhead)', 'Value (IDR)': pemakaianBulan },
      { 'Item': 'Total Sales Beverage', 'Value (IDR)': totalSalesBeverage },
      { 'Item': 'Beverage Cost %', 'Value (IDR)': `${beverageCostPct.toFixed(2)}%` },
      { 'Item': 'Status', 'Value (IDR)': statusLabel }
    ];
    
    const dailyData = dailyColumns.map(row => ({
      'Date': row.date,
      'Purchases (IDR)': row.purchase,
      'Sales (IDR)': row.sales,
      'Purchase/Sales %': row.sales > 0 ? ((row.purchase / row.sales) * 100).toFixed(1) : '0.0'
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Cost Control Summary');
    if (dailyData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyData), 'Daily Breakdown');
    }
    XLSX.writeFile(wb, `UMATIS_CostControl_${period}.xlsx`);
  };

  // Print PDF
  const handlePrintPDF = () => {
    const printHTML = `
      <html><head><title>UMATIS Cost Control - ${period}</title>
      <style>body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:13px}
      h1{font-size:20px;margin-bottom:4px}h2{font-size:16px;color:#555;margin:20px 0 10px}
      table{width:100%;border-collapse:collapse;margin:10px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left}
      th{background:#f5f5f5;font-size:12px}
      .highlight{font-weight:bold;font-size:18px;color:${beverageCostPct <= 27 ? '#2ecc71' : '#e74c3c'}}
      .summary-row{background:#f9f9f9;font-weight:bold}
      </style></head><body>
      <h1>UMATIS RESTO & VENUE</h1>
      <p>Monthly Cost Control Report — Period: <strong>${period}</strong></p>
      <h2>HPP Beverage: <span class="highlight">${beverageCostPct.toFixed(2)}%</span> ${beverageCostPct <= 27 ? '✓ Target Aman' : '⚠ Above Target'}</h2>
      <table>
        <tr><td>Total Stock Awal (Opening)</td><td style="text-align:right">Rp ${openingStock.toLocaleString('id-ID')}</td></tr>
        <tr><td>+ Total Pembelian (PO)</td><td style="text-align:right">Rp ${totalPembelian.toLocaleString('id-ID')}</td></tr>
        <tr><td>- Total Stock Akhir (Closing)</td><td style="text-align:right">Rp ${closingStock.toLocaleString('id-ID')}</td></tr>
        <tr class="summary-row"><td>= Total Pemakaian (COGS + 5% Overhead)</td><td style="text-align:right">Rp ${pemakaianBulan.toLocaleString('id-ID')}</td></tr>
        <tr><td>Total Sales Beverage</td><td style="text-align:right">Rp ${totalSalesBeverage.toLocaleString('id-ID')}</td></tr>
      </table>
      ${dailyColumns.length > 0 ? `
      <h2>Daily Breakdown</h2>
      <table>
        <thead><tr><th>Date</th><th style="text-align:right">Purchases</th><th style="text-align:right">Sales</th><th style="text-align:right">Beli/Jual %</th></tr></thead>
        <tbody>${dailyColumns.map(r => `<tr><td>${r.date}</td><td style="text-align:right">Rp ${r.purchase.toLocaleString('id-ID')}</td><td style="text-align:right">Rp ${r.sales.toLocaleString('id-ID')}</td><td style="text-align:right">${r.sales > 0 ? ((r.purchase / r.sales) * 100).toFixed(1) : '0.0'}%</td></tr>`).join('')}</tbody>
      </table>` : ''}
      <p style="margin-top:30px;font-size:11px;color:#999">Generated by UMATIS Inventory System — ${new Date().toLocaleString('id-ID')}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(printHTML);
    w.document.close();
    w.print();
  };

  return (
    <div>
      {/* Period Picker */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontWeight: 600 }}>Period:</span>
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }} 
            onClick={handleExportExcel}
            disabled={loading || !reportData}
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          <button 
            className="btn btn-secondary" 
            style={{ display: 'flex', gap: '6px', padding: '8px 14px', fontSize: '0.8rem' }} 
            onClick={handlePrintPDF}
            disabled={loading || !reportData}
          >
            <FileText size={14} /> Print PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '16px' }}>
          <Loader size={36} className="animate-spin" style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Memuat Laporan Cost Control...</span>
        </div>
      ) : errorMsg ? (
        <div className="glass-card" style={{ padding: '24px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <AlertTriangle size={36} style={{ color: 'var(--danger)', margin: '0 auto 12px' }} />
          <h4 style={{ color: 'white', fontWeight: 700, marginBottom: '8px' }}>Gagal Memuat Laporan</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>{errorMsg}</p>
          <button className="btn btn-secondary" onClick={() => setPeriod(period)}>Coba Lagi</button>
        </div>
      ) : (
        <>
          {/* HPP Card */}
          <div style={{
            background: beverageCostPct <= 27 ? 'rgba(81,207,102,0.04)' : 'rgba(255,107,107,0.04)',
            border: `1px solid ${beverageCostPct <= 27 ? 'rgba(81,207,102,0.15)' : 'rgba(255,107,107,0.15)'}`,
            borderRadius: '16px', padding: '24px 32px', marginBottom: '24px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px'
          }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: '8px' }}>Period Beverage Cost</span>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'white', marginBottom: '6px' }}>
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
              width: '64px', height: '64px', borderRadius: '12px',
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
              { label: '4. Pemakaian (COGS)', value: `= ${formatIDR(pemakaianBulan)}`, sub: '(Awal + PO) - Akhir', accent: true }
            ].map((card, i) => (
              <div key={i} className="glass-card" style={{ padding: '16px 20px', borderLeft: card.accent ? '3px solid var(--accent)' : 'none' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{card.label}</div>
                <div style={{ fontWeight: card.accent ? 800 : 700, fontSize: '1.05rem', color: card.accent ? 'var(--accent)' : 'white' }}>{card.value}</div>
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
                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderTop: '2px solid var(--border)' }}>
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