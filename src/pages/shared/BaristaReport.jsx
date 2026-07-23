import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Download,
  FileText, Archive, Filter, Calendar, Database, ChevronRight, X, Loader
} from 'lucide-react';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import { formatIDR } from '../../services/costUtils';
import {
  parseSalesReport, generateReports, buildCombinedWorkbook,
  buildIndividualWorkbooks, generatePDF, downloadAsZip,
  downloadWorkbook, downloadPDF
} from '../../services/reportGenerator';

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };

const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const STEPS = ['Upload File', 'Pilih Kategori', 'Cek Data', 'Download'];

export default function BaristaReport() {
  const { recipes } = useData();
  const fileInputRef = useRef(null);

  // Step tracking
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Upload
  const [dragActive, setDragActive] = useState(false);
  const [rawFile, setRawFile] = useState(null);
  const [parsedRaw, setParsedRaw] = useState(null); // raw parsed before category filter

  // Step 2: Category filter
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [salesData, setSalesData] = useState(null);
  const [periodMonth, setPeriodMonth] = useState(null);
  const [periodYear, setPeriodYear] = useState(null);

  // Step 3: DB data check
  const [dbData, setDbData] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);

  // Step 4: Generated outputs
  const [generatedSheets, setGeneratedSheets] = useState(null);
  const [generating, setGenerating] = useState(false);

  // ── Step 1: File Upload ──
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const XLSX = await getXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const parsed = parseSalesReport(wb, XLSX);

      setRawFile(file);
      setParsedRaw(parsed);
      setAvailableCategories(parsed.categories);
      setSelectedCategories(parsed.categories.slice()); // all selected by default
      setPeriodMonth(parsed.periodMonth);
      setPeriodYear(parsed.periodYear);
      setStep(1);
    } catch (e) {
      setError(`Gagal parse file: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFile(file);
    } else {
      setError('Hanya file Excel (.xlsx/.xls) yang didukung');
    }
  }, [handleFile]);

  // ── Step 2: Apply Category Filter ──
  const applyCategoryFilter = useCallback(async () => {
    if (!parsedRaw) return;
    setLoading(true);
    try {
      const XLSX = await getXLSX();
      const buf = await rawFile.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const filtered = parseSalesReport(wb, XLSX, selectedCategories);
      setSalesData(filtered);
      setStep(2);

      // Auto-fetch DB data
      const data = await api.getBaristaReportData(filtered.periodMonth, filtered.periodYear);
      setDbData(data);

      // Compute data status
      setDataStatus({
        materials: (data.materials || []).length,
        recipes: (data.recipes || []).length,
        purchases: (data.purchases || []).length,
        opnameResto: !!data.opnameResto,
        opnameCentral: !!data.opnameCentral,
        prevOpnameResto: !!data.prevOpnameResto,
        prevOpnameCentral: !!data.prevOpnameCentral,
        dailyInventories: (data.dailyInventories || []).length,
        transactions: (data.transactions || []).length,
        daysInMonth: data.period.lastDay
      });
    } catch (e) {
      setError(`Gagal memuat data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [parsedRaw, rawFile, selectedCategories]);

  // ── Step 3 → 4: Generate Reports ──
  const handleGenerate = useCallback(async () => {
    if (!salesData || !dbData) return;
    setGenerating(true);
    setError(null);
    try {
      const XLSX = await getXLSX();
      const sheets = await generateReports(salesData, dbData, XLSX);
      setGeneratedSheets(sheets);
      setStep(3);
    } catch (e) {
      setError(`Gagal generate report: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }, [salesData, dbData]);

  // ── Downloads ──
  const handleDownloadCombined = useCallback(async () => {
    if (!generatedSheets) return;
    const XLSX = await getXLSX();
    const wb = buildCombinedWorkbook(generatedSheets, XLSX);
    const monthName = MONTHS[periodMonth] || '';
    downloadWorkbook(wb, `SO BARISTA ${monthName} ${periodYear}.xlsx`, XLSX);
  }, [generatedSheets, periodMonth, periodYear]);

  const handleDownloadZip = useCallback(async () => {
    if (!generatedSheets) return;
    const XLSX = await getXLSX();
    const workbooks = buildIndividualWorkbooks(generatedSheets, XLSX);
    await downloadAsZip(workbooks, XLSX);
  }, [generatedSheets]);

  const handleDownloadPDF = useCallback(async () => {
    if (!salesData || !dbData) return;
    setGenerating(true);
    try {
      const doc = await generatePDF(salesData, dbData);
      const monthName = MONTHS[periodMonth] || '';
      downloadPDF(doc, `SO BARISTA ${monthName} ${periodYear}.pdf`);
    } catch (e) {
      setError(`Gagal generate PDF: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  }, [salesData, dbData, periodMonth, periodYear]);

  const resetAll = () => {
    setStep(0);
    setRawFile(null);
    setParsedRaw(null);
    setSalesData(null);
    setDbData(null);
    setDataStatus(null);
    setGeneratedSheets(null);
    setError(null);
    setSelectedCategories([]);
    setAvailableCategories([]);
  };

  // ── Category toggle ──
  const toggleCategory = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // ── Sales summary ──
  const salesSummary = salesData ? {
    totalRows: salesData.totalRows,
    totalQty: salesData.sales.reduce((s, i) => s + i.qty, 0),
    totalSubtotal: salesData.sales.reduce((s, i) => s + i.subtotal, 0),
    totalFinal: salesData.sales.reduce((s, i) => s + i.total, 0),
    uniqueMenus: new Set(salesData.sales.map(s => s.menuName)).size,
    dateRange: salesData.sales.length > 0
      ? `${salesData.sales[0].salesDateStr} - ${salesData.sales[salesData.sales.length - 1].salesDateStr}`
      : '-'
  } : null;

  return (
    <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          <FileSpreadsheet size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          SO Barista Report Generator
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '6px 0 0' }}>
          Upload Daily Sales Report → Generate semua laporan barista otomatis
        </p>
      </div>

      {/* Step Indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            background: step >= i ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: step >= i ? '#fff' : 'var(--text-muted)',
            fontSize: '0.8rem', fontWeight: 600,
            transition: 'all var(--ease)'
          }}>
            {step > i ? <CheckCircle size={14} /> : <span style={{
              width: 18, height: 18, borderRadius: '50%',
              background: step >= i ? 'rgba(255,255,255,0.25)' : 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.7rem'
            }}>{i + 1}</span>}
            {s}
            {i < STEPS.length - 1 && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
          </div>
        ))}
        {step > 0 && (
          <button onClick={resetAll} className="btn btn-secondary" style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>
            <X size={14} /> Reset
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--danger-glow)', border: '1px solid var(--danger)',
          color: 'var(--danger-text)', fontSize: '0.85rem', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertTriangle size={16} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ═══ STEP 0: Upload ═══ */}
      {step === 0 && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: '60px 40px',
              cursor: 'pointer',
              transition: 'all var(--ease)',
              background: dragActive ? 'var(--accent-glow)' : 'transparent'
            }}
          >
            <Upload size={48} style={{ color: dragActive ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 16 }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Upload Daily Sales Menu Report
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              Drag & drop file .xlsx dari ESB POS system, atau klik untuk browse
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 8 }}>
              Format: Daily Sales Menu Report_URVGANDHI_April_Minuman.xlsx
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {loading && (
            <div style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 6 }} />
              Memproses file...
            </div>
          )}
        </div>
      )}

      {/* ═══ STEP 1: Category Selection ═══ */}
      {step === 1 && parsedRaw && (
        <div className="glass-card">
          <h3 style={{ margin: '0 0 16px', fontWeight: 600, fontSize: '1rem' }}>
            <Filter size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Pilih Kategori yang Diproses
          </h3>

          <div style={{
            padding: '12px 16px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-tertiary)', marginBottom: 16, fontSize: '0.85rem'
          }}>
            <strong>File:</strong> {rawFile?.name} &nbsp;|&nbsp;
            <strong>Total Rows:</strong> {parsedRaw.totalRows} &nbsp;|&nbsp;
            <strong>Periode:</strong> {MONTHS[parsedRaw.periodMonth]} {parsedRaw.periodYear}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {availableCategories.map(cat => {
              const isSelected = selectedCategories.includes(cat);
              const catCount = parsedRaw.sales.filter(s => s.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                    border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                    color: isSelected ? 'var(--accent-text)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                    transition: 'all var(--ease)'
                  }}
                >
                  {isSelected ? <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : null}
                  {cat} ({catCount})
                </button>
              );
            })}
          </div>

          {/* Period Override */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
            <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
            <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Periode:</label>
            <select
              value={periodMonth || ''}
              onChange={(e) => setPeriodMonth(Number(e.target.value))}
              className="premium-input"
              style={{ padding: '6px 12px', fontSize: '0.85rem', width: 'auto' }}
            >
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <input
              type="number"
              value={periodYear || ''}
              onChange={(e) => setPeriodYear(Number(e.target.value))}
              className="premium-input"
              style={{ padding: '6px 12px', fontSize: '0.85rem', width: 80 }}
              min={2020} max={2100}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(0)} className="btn btn-secondary">Kembali</button>
            <button
              onClick={applyCategoryFilter}
              className="btn btn-primary"
              disabled={selectedCategories.length === 0 || loading}
            >
              {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memuat Data...</> : <>Lanjutkan <ChevronRight size={14} /></>}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Data Check ═══ */}
      {step === 2 && salesData && dataStatus && (
        <div>
          {/* Sales Summary */}
          <div className="glass-card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '1rem' }}>
              <FileText size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Ringkasan Penjualan
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Baris', value: salesSummary.totalRows },
                { label: 'Total Qty', value: salesSummary.totalQty },
                { label: 'Total Subtotal', value: formatIDR(salesSummary.totalSubtotal) },
                { label: 'Menu Unik', value: salesSummary.uniqueMenus },
                { label: 'Periode', value: salesSummary.dateRange }
              ].map((kpi, i) => (
                <div key={i} style={{
                  padding: '12px 16px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)'
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{kpi.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{kpi.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Data Availability Check */}
          <div className="glass-card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '1rem' }}>
              <Database size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Kelengkapan Data dari Database
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
              {[
                { label: 'Materials (Marketlist)', value: `${dataStatus.materials} items`, ok: dataStatus.materials > 0 },
                { label: 'Recipes (Menu)', value: `${dataStatus.recipes} menu`, ok: dataStatus.recipes > 0 },
                { label: 'Purchase Entries', value: `${dataStatus.purchases} entries`, ok: dataStatus.purchases > 0 },
                { label: 'Stock Opname RESTO', value: dataStatus.opnameResto ? 'Ada' : 'Belum ada', ok: dataStatus.opnameResto },
                { label: 'Stock Opname CENTRAL', value: dataStatus.opnameCentral ? 'Ada' : 'Belum ada', ok: dataStatus.opnameCentral },
                { label: 'SO Bulan Sebelumnya (RESTO)', value: dataStatus.prevOpnameResto ? 'Ada' : 'Belum ada', ok: dataStatus.prevOpnameResto },
                { label: 'SO Bulan Sebelumnya (CENTRAL)', value: dataStatus.prevOpnameCentral ? 'Ada' : 'Belum ada', ok: dataStatus.prevOpnameCentral },
                { label: 'Daily Inventory', value: `${dataStatus.dailyInventories}/${dataStatus.daysInMonth} hari`, ok: dataStatus.dailyInventories > 0 },
                { label: 'Transaksi', value: `${dataStatus.transactions} records`, ok: dataStatus.transactions > 0 },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                  background: item.ok ? 'rgba(5, 150, 105, 0.06)' : 'rgba(217, 119, 6, 0.06)',
                  border: `1px solid ${item.ok ? 'rgba(5, 150, 105, 0.2)' : 'rgba(217, 119, 6, 0.2)'}`
                }}>
                  {item.ok
                    ? <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    : <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12 }}>
              Data yang belum ada akan menghasilkan sheet kosong/placeholder. Lengkapi melalui halaman terkait (Stock Opname, Invoicing, Daily Inventory).
            </p>
          </div>

          {/* Generate Button */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)} className="btn btn-secondary">Kembali</button>
            <button
              onClick={handleGenerate}
              className="btn btn-primary"
              disabled={generating}
              style={{ fontSize: '0.9rem', padding: '10px 24px' }}
            >
              {generating ? (
                <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
              ) : (
                <><FileSpreadsheet size={16} /> Generate 13 Laporan</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Download ═══ */}
      {step === 3 && generatedSheets && (
        <div>
          <div className="glass-card" style={{ marginBottom: 16, textAlign: 'center', padding: '30px 20px' }}>
            <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Laporan Berhasil Di-generate!
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              {Object.keys(generatedSheets).length} sheets siap download — {MONTHS[periodMonth]} {periodYear}
            </p>
          </div>

          {/* Download Options */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            {/* Combined Excel */}
            <div className="glass-card" style={{ cursor: 'pointer' }} onClick={handleDownloadCombined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-md)',
                  background: 'rgba(5, 150, 105, 0.1)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <FileSpreadsheet size={24} style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    File Gabungan (.xlsx)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    SO BARISTA {MONTHS[periodMonth]} {periodYear}.xlsx
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {Object.keys(generatedSheets).length} sheets dalam 1 file
                  </div>
                </div>
                <Download size={20} style={{ marginLeft: 'auto', color: 'var(--success)' }} />
              </div>
            </div>

            {/* Zip of individual files */}
            <div className="glass-card" style={{ cursor: 'pointer' }} onClick={handleDownloadZip}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-md)',
                  background: 'rgba(37, 99, 235, 0.1)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <Archive size={24} style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    File Terpisah (.zip)
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Barista_Report_Files.zip
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {Object.keys(generatedSheets).length} file Excel terpisah
                  </div>
                </div>
                <Download size={20} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />
              </div>
            </div>

            {/* PDF */}
            <div className="glass-card" style={{ cursor: 'pointer' }} onClick={handleDownloadPDF}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-md)',
                  background: 'rgba(220, 38, 38, 0.1)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center'
                }}>
                  <FileText size={24} style={{ color: 'var(--danger)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    PDF Full Report
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    SO BARISTA {MONTHS[periodMonth]} {periodYear}.pdf
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Semua section dalam 1 PDF
                  </div>
                </div>
                <Download size={20} style={{ marginLeft: 'auto', color: 'var(--danger)' }} />
              </div>
            </div>
          </div>

          {/* Sheet List */}
          <div className="glass-card">
            <h3 style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '0.95rem' }}>
              Daftar Sheet yang Di-generate
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
              {Object.keys(generatedSheets).map((name, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)', fontSize: '0.8rem'
                }}>
                  <CheckCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{name.trim()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* New Report */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={resetAll} className="btn btn-secondary">
              Generate Laporan Baru
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
