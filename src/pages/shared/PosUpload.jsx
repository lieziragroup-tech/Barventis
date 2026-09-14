import React, { useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle,
  Calendar, Database, ShieldAlert, X, AlertTriangle
} from 'lucide-react';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import { formatIDR } from '../../services/costUtils';

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };
let _confetti;
const getConfetti = async () => { if (!_confetti) _confetti = (await import('canvas-confetti')).default; return _confetti; };

export default function PosUpload() {
  const { recipes, stock, fetchAllData } = useData();
  const materials = stock; // alias for readability
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [searchMenu, setSearchMenu] = useState('');
  const [missingMenuMappings, setMissingMenuMappings] = useState({});
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const fileInputRef = useRef(null);

  // Derived state untuk summary dinamis
  const filteredSales = React.useMemo(() => {
    if (!parsedData) return [];
    return parsedData.sales.filter(s => selectedCategories.includes(s.category));
  }, [parsedData, selectedCategories]);

  const summaryStats = React.useMemo(() => {
    let tQty = 0;
    let tRev = 0;
    const uniq = new Set();
    filteredSales.forEach(s => {
      tQty += s.qty;
      tRev += s.total;
      uniq.add(s.menu_name);
    });

    // Filter missing menus based on selected categories
    const activeMissing = parsedData ? parsedData.missingMenus.filter(m => selectedCategories.includes(m.category)) : [];

    return { totalQty: tQty, totalRevenue: tRev, uniqueMenus: uniq.size, missingMenus: activeMissing };
  }, [filteredSales, parsedData, selectedCategories]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileParsing(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileParsing(e.target.files[0]);
    }
  };

  const handleFileParsing = async (file) => {
    setLoading(true);
    setUploadStatus(null);
    try {
      const XLSX = await getXLSX();
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 10) throw new Error("File ESB tidak valid atau kosong.");

      // ESB usually has header around row 9 or 10. Let's find "Menu Name"
      let headerRowIdx = -1;
      let colName = -1;
      let colQty = -1;
      let colTotal = -1;
      let colDate = -1;
      let colCode = -1;
      let colCategory = -1;

      for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (!row) continue;
        const lowerRow = row.map(c => String(c || '').toLowerCase().trim());

        if (lowerRow.includes('menu name') && lowerRow.includes('qty')) {
          headerRowIdx = i;
          colName = lowerRow.indexOf('menu name');
          colQty = lowerRow.indexOf('qty');

          if (lowerRow.includes('total')) colTotal = lowerRow.indexOf('total');
          else if (lowerRow.includes('subtotal')) colTotal = lowerRow.indexOf('subtotal');

          if (lowerRow.includes('sales date')) colDate = lowerRow.indexOf('sales date');
          if (lowerRow.includes('menu code')) colCode = lowerRow.indexOf('menu code');
          if (lowerRow.includes('category')) colCategory = lowerRow.indexOf('category');
          else if (lowerRow.includes('kategori')) colCategory = lowerRow.indexOf('kategori');
          else if (lowerRow.includes('menu category')) colCategory = lowerRow.indexOf('menu category');

          break;
        }
      }

      if (headerRowIdx === -1 || colName === -1 || colQty === -1) {
        throw new Error("Format tidak dikenali sebagai ESB. Kolom 'Menu Name' atau 'Qty' tidak ditemukan.");
      }

      let totalQty = 0;
      let totalRevenue = 0;
      const salesRows = [];
      const menuAggr = {};

      let sampleDate = null;

      for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !row[colName]) continue;

        const mName = String(row[colName]).trim();
        if (mName.toLowerCase().includes('total')) continue; // Skip total row

        const qty = parseFloat(row[colQty]) || 0;
        const total = parseFloat(row[colTotal] || 0);
        let sDate = row[colDate] ? String(row[colDate]) : null;

        // Clean date
        if (sDate && sDate.includes(' ')) {
          sDate = sDate.split(' ')[0];
        } else if (!isNaN(sDate) && typeof row[colDate] === 'number') {
           // Excel serial date
           const d = new Date(Math.round((row[colDate] - 25569)*86400*1000));
           sDate = d.toISOString().split('T')[0];
        }

        if (!sampleDate && sDate && sDate.length >= 10) sampleDate = sDate;

        totalQty += qty;
        totalRevenue += total;

        salesRows.push({
          menu_name: mName,
          menu_code: colCode !== -1 ? String(row[colCode] || '') : '',
          qty: qty,
          total: total,
          salesDate: sDate,
          category: colCategory !== -1 ? String(row[colCategory] || 'Lainnya') : 'Lainnya'
        });

        if (!menuAggr[mName]) {
           menuAggr[mName] = {
             qty: 0,
             revenue: 0,
             code: colCode !== -1 ? String(row[colCode] || '') : '',
             category: colCategory !== -1 ? String(row[colCategory] || 'Lainnya') : 'Lainnya'
           };
        }
        menuAggr[mName].qty += qty;
        menuAggr[mName].revenue += total;
      }

      if (salesRows.length === 0) throw new Error("Tidak ada data transaksi yang ditemukan.");

      const periodStr = sampleDate || new Date().toISOString().split('T')[0];
      const parts = periodStr.split('-');
      const periodYear = parts[0];
      const periodMonth = parts[1];

      // Kumpulkan kategori unik dari data
      const uniqueCategories = [...new Set(Object.values(menuAggr).map(m => m.category))];
      setCategories(uniqueCategories);
      setSelectedCategories(uniqueCategories); // default: semua dipilih

      // Missing Recipe Check
      const missingMenus = [];
      Object.keys(menuAggr).forEach(mName => {
         const mLow = mName.toLowerCase().trim();
         const hasRecipe = recipes.some(r => r.menu_name.toLowerCase().trim() === mLow || (r.pos_code && r.pos_code.toLowerCase() === menuAggr[mName].code.toLowerCase()));
         const hasMaterial = materials.some(m => m.name.toLowerCase().trim() === mLow);
         if (!hasRecipe && !hasMaterial) {
            missingMenus.push({ name: mName, ...menuAggr[mName] });
         }
      });

      // Duplicate Check
      // Use existing API duplicate check logic
      const { isDuplicate, message } = await api.checkPosSalesDuplicate(periodMonth, periodYear);
      if (isDuplicate) {
          setDuplicateInfo({
             sales: salesRows,
             filename: file.name,
             totalQty,
             totalRevenue,
             periodMonth,
             periodYear,
             periodStr: `${periodMonth}/${periodYear}`,
             uniqueMenus: Object.keys(menuAggr).length,
             missingMenus
          });
          setUploadStatus({ type: 'warning', message });
          setLoading(false);
          return;
      }

      // Hash file
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(file.name + JSON.stringify(salesRows)));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      setParsedData({
        sales: salesRows,
        filename: file.name,
        totalQty,
        totalRevenue,
        periodMonth,
        periodYear,
        periodStr: `${periodMonth}/${periodYear}`,
        uniqueMenus: Object.keys(menuAggr).length,
        missingMenus,
        fileHash,
        uploadMode: 'append'
      });

      // Setup default mappings: semua missing menu → ignore
      const initMappings = {};
      missingMenus.forEach(m => { initMappings[m.name] = { type: 'ignore' }; });
      setMissingMenuMappings(initMappings);

    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!parsedData) return;
    setLoading(true);
    try {
      // 1. Proses mappings untuk missing menus
      const mappedSales = parsedData.sales.map(s => ({ ...s }));

      for (const [mName, config] of Object.entries(missingMenuMappings)) {
        if (config.type === 'new') {
          // Buat resep baru dengan ingredient kosong
          const item = parsedData.missingMenus.find(m => m.name === mName);
          if (item) {
            try {
              await api.createRecipe({
                menu_name: mName,
                category: item.category || 'Lainnya',
                ingredients: [],
                selling_price: item.qty > 0 ? Math.round(item.revenue / item.qty) : 0
              });
            } catch (e) {
              console.warn('[PosUpload] Gagal buat resep baru untuk:', mName, e);
            }
          }
        } else if (config.type === 'map' && config.targetName) {
          // Ganti nama menu di sales agar cocok dengan resep yang dipilih
          mappedSales.forEach(s => {
            if (s.menu_name === mName) s.menu_name = config.targetName;
          });
        }
        // type 'ignore' → tidak lakukan apa-apa
      }

      // 2. Filter berdasarkan kategori yang dipilih
      const activeCats = selectedCategories.length > 0 ? selectedCategories : categories;
      const finalSales = activeCats.length > 0 && activeCats.length < categories.length
        ? mappedSales.filter(s => activeCats.includes(s.category))
        : mappedSales;

      const res = await api.processESBAndDeduct(finalSales, {
          mode: parsedData.uploadMode || 'append',
          periodMonth: parsedData.periodMonth,
          periodYear: parsedData.periodYear,
          filename: parsedData.filename,
          fileHash: parsedData.fileHash
      });

      const confetti = await getConfetti();
      await confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

      let msg = `Sukses memproses ESB! Memotong stok untuk ${res.deducted_materials} bahan.`;
      if (res.unmapped_items?.length > 0) {
          msg += ` Ada ${res.unmapped_items.length} menu yang dilewati (tidak ada resep).`;
      }
      setUploadStatus({ type: 'success', message: msg });

      setParsedData(null);
      await fetchAllData(); // refresh app state
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message || 'Gagal memproses data.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            ESB Auto-Deduct Upload
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Upload raw file Penjualan Beverage ESB. Sistem akan otomatis memotong stok real-time (Auto-COGS).
          </p>
        </div>
      </div>

      {uploadStatus && (
        <div style={{
          padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px',
          display: 'flex', alignItems: 'center', gap: '12px',
          background: uploadStatus.type === 'success' ? 'rgba(16,185,129,0.06)' : uploadStatus.type === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
          border: `1px solid ${uploadStatus.type === 'success' ? 'rgba(16,185,129,0.2)' : uploadStatus.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`
        }}>
          {uploadStatus.type === 'success' && <CheckCircle size={18} style={{ color: 'var(--success)' }} />}
          {uploadStatus.type === 'warning' && <ShieldAlert size={18} style={{ color: 'var(--warning)' }} />}
          {uploadStatus.type === 'error' && <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />}
          <span style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{uploadStatus.message}</span>
          <button onClick={() => { setUploadStatus(null); setDuplicateInfo(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
      )}

      {duplicateInfo && (
        <div style={{
          padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
          display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div>
            <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--warning)', marginBottom: '4px' }}>Data POS ESB Terdeteksi (Periode {duplicateInfo.periodStr})</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Sistem mendeteksi bahwa sudah ada data POS untuk bulan ini. Jika ini adalah revisi, pilih "Hapus & Timpa Baru" (Sistem akan otomatis ROLLBACK stok lama ke gudang sebelum memotong stok baru).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => { setDuplicateInfo(null); setUploadStatus(null); }}>Batal</button>
            <button className="btn btn-primary" onClick={async () => {
              const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(duplicateInfo.filename + JSON.stringify(duplicateInfo.sales)));
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              // Re-derive categories from duplicateInfo sales
              const dupCats = [...new Set(duplicateInfo.sales.map(s => s.category || 'Lainnya'))];
              setCategories(dupCats);
              setSelectedCategories(dupCats);
              const initMap = {};
              (duplicateInfo.missingMenus || []).forEach(m => { initMap[m.name] = { type: 'ignore' }; });
              setMissingMenuMappings(initMap);
              setParsedData({ ...duplicateInfo, uploadMode: 'append', fileHash });
              setDuplicateInfo(null);
              setUploadStatus(null);
            }}>Tambahkan Saja</button>
            <button className="btn btn-warning" onClick={async () => {
              const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(duplicateInfo.filename + JSON.stringify(duplicateInfo.sales)));
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              const dupCats = [...new Set(duplicateInfo.sales.map(s => s.category || 'Lainnya'))];
              setCategories(dupCats);
              setSelectedCategories(dupCats);
              const initMap = {};
              (duplicateInfo.missingMenus || []).forEach(m => { initMap[m.name] = { type: 'ignore' }; });
              setMissingMenuMappings(initMap);
              setParsedData({ ...duplicateInfo, uploadMode: 'overwrite', fileHash });
              setDuplicateInfo(null);
              setUploadStatus(null);
            }}>Hapus & Timpa Baru (Rollback)</button>
          </div>
        </div>
      )}

      {!parsedData ? (
        <div
          className={`glass-card upload-zone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
          style={{ minHeight: '340px' }}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".xlsx, .xls"
            onChange={handleFileChange}
          />
          <div className="upload-icon-circle">
            {loading ? <Database className="animate-spin" size={32} /> : <Upload size={32} />}
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {loading ? "Memproses Data..." : "Upload Spreadsheet Penjualan POS"}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '420px', margin: '0 auto' }}>
              Drag and drop file "Penjualan Beverage (ESB).xlsx" atau format POS lainnya kesini. Sistem otomatis menghapus header sampah dan memvisualisasikan data mentahnya.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '24px' }}>

          {/* CATEGORY FILTER */}
          {categories.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Filter Kategori:</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {categories.map(cat => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      className="btn"
                      style={{
                        padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                        color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: isSelected ? 600 : 400
                      }}
                      onClick={() => {
                        setSelectedCategories(prev =>
                          prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                        );
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TABS */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
            <button
              className="btn"
              style={{
                background: 'transparent', border: 'none', padding: '12px 20px',
                borderBottom: activeTab === 'summary' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'summary' ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: activeTab === 'summary' ? 700 : 500,
                borderRadius: 0
              }}
              onClick={() => setActiveTab('summary')}
            >
              Summary & Validasi Resep
            </button>
            <button
              className="btn"
              style={{
                background: 'transparent', border: 'none', padding: '12px 20px',
                borderBottom: activeTab === 'raw' ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === 'raw' ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: activeTab === 'raw' ? 700 : 500,
                borderRadius: 0
              }}
              onClick={() => setActiveTab('raw')}
            >
              Data Mentah (Raw Viewer)
            </button>
          </div>

          {activeTab === 'summary' ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                <Calendar size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Periode Deteksi</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{parsedData.periodStr}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Item Terjual</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summaryStats.totalQty.toLocaleString('id-ID')} Pcs</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Database size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Menu Unik</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{summaryStats.uniqueMenus} Menu</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                <span style={{ fontWeight: 800 }}>Rp</span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subtotal Revenue</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatIDR(summaryStats.totalRevenue)}</div>
              </div>
            </div>
          </div>

          {summaryStats.missingMenus.length > 0 ? (
            <div style={{
              marginBottom: '24px',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.05)'
            }}>
               <h3 style={{ color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={20} /> Warning: {summaryStats.missingMenus.length} Menu Tanpa Resep & Bahan
               </h3>
               <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', marginTop: '8px' }}>
                  Pilih aksi untuk setiap menu yang tidak dikenali: <strong>Abaikan</strong> (stok tidak dipotong), <strong>Buat Menu Baru</strong>, atau <strong>Map ke Menu Ada</strong>.
               </p>

               <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <tbody>
                      {summaryStats.missingMenus.map((m, i) => {
                         const mapping = missingMenuMappings[m.name] || { type: 'ignore' };
                         return (
                         <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>{m.name} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>({m.category})</span></td>
                            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{m.qty} terjual</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              <select
                                className="form-control"
                                style={{ width: '180px', padding: '6px 8px', fontSize: '0.8rem', height: 'auto', display: 'inline-block' }}
                                value={mapping.type}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setMissingMenuMappings(prev => ({
                                    ...prev,
                                    [m.name]: { type: val, targetName: val === 'map' ? (recipes[0]?.menu_name || '') : null }
                                  }));
                                }}
                              >
                                <option value="ignore">Abaikan</option>
                                <option value="new">Buat Menu Baru</option>
                                <option value="map">Map ke Menu Ada</option>
                              </select>

                              {mapping.type === 'map' && (
                                <select
                                  className="form-control"
                                  style={{ width: '180px', padding: '6px 8px', fontSize: '0.8rem', height: 'auto', display: 'inline-block', marginLeft: '8px' }}
                                  value={mapping.targetName || ''}
                                  onChange={(e) => setMissingMenuMappings(prev => ({ ...prev, [m.name]: { ...prev[m.name], targetName: e.target.value } }))}
                                >
                                  {recipes.map(r => (
                                    <option key={r.id} value={r.menu_name}>{r.menu_name}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                         </tr>
                      )})}
                    </tbody>
                  </table>
               </div>
            </div>
          ) : (
            <div style={{
              marginBottom: '24px',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--success)',
              display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600
            }}>
              <CheckCircle size={20} />
              Semua menu berhasil dipetakan ke resep/bahan baku. Aman untuk dipotong!
            </div>
          )}

            </>
          ) : (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ marginBottom: '16px', display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Cari Menu..."
                  value={searchMenu}
                  onChange={(e) => setSearchMenu(e.target.value)}
                  style={{ maxWidth: '300px' }}
                />
                <div style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  Total Baris Excel: <strong>{filteredSales.length}</strong>
                </div>
              </div>
              <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
                    <tr>
                      <th style={{ width: '120px' }}>Tanggal Sales</th>
                      <th>Menu Name</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '150px', textAlign: 'right' }}>Subtotal (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSales
                      .filter(r => r.menu_name.toLowerCase().includes(searchMenu.toLowerCase()))
                      .slice(0, 500) // limit display for performance
                      .map((row, i) => (
                      <tr key={i}>
                        <td>{row.salesDate}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.menu_name}</td>
                        <td style={{ textAlign: 'right' }}>{row.qty}</td>
                        <td style={{ textAlign: 'right' }}>{formatIDR(row.total)}</td>
                      </tr>
                    ))}
                    {filteredSales.filter(r => r.menu_name.toLowerCase().includes(searchMenu.toLowerCase())).length > 500 && (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)' }}>
                          ... dan {filteredSales.length - 500} baris lainnya (dibatasi 500 untuk performa UI).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-secondary"
              onClick={() => { setParsedData(null); setDuplicateInfo(null); setUploadStatus(null); }}
              disabled={loading}
            >
              Batal
            </button>
            <button
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--accent)' }}
              onClick={handleCommit}
              disabled={loading}
            >
              {loading ? (
                <>Menyimpan & Memotong Stok...</>
              ) : (
                <><Database size={18} /> Konfirmasi & Potong Stok Sekarang</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}