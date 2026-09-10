import React, { useState, useRef, useEffect } from 'react';
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

export default function ESBUpload() {
  const { recipes, stock, fetchAllData } = useData();
  const materials = stock; // alias for readability
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const fileInputRef = useRef(null);

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

      for (let i = 0; i < Math.min(20, jsonData.length); i++) {
        const row = jsonData[i];
        if (!row) continue;
        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '').toLowerCase().trim();
          if (val === 'menu name') {
            headerRowIdx = i;
            colName = j;
          } else if (val === 'qty') {
            colQty = j;
          } else if (val === 'total' || val === 'subtotal') {
            // Prefer Total
            if (colTotal === -1 || val === 'total') colTotal = j;
          } else if (val === 'sales date') {
            colDate = j;
          } else if (val === 'menu code') {
            colCode = j;
          }
        }
        if (headerRowIdx !== -1) break;
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
          salesDate: sDate
        });

        if (!menuAggr[mName]) {
           menuAggr[mName] = { qty: 0, revenue: 0, code: colCode !== -1 ? String(row[colCode] || '') : '' };
        }
        menuAggr[mName].qty += qty;
        menuAggr[mName].revenue += total;
      }

      if (salesRows.length === 0) throw new Error("Tidak ada data transaksi yang ditemukan.");

      const periodStr = sampleDate || new Date().toISOString().split('T')[0];
      const parts = periodStr.split('-');
      const periodYear = parts[0];
      const periodMonth = parts[1];

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
      const res = await api.processESBAndDeduct(parsedData.sales, {
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
              setParsedData({ ...duplicateInfo, uploadMode: 'append', fileHash });
              setDuplicateInfo(null);
              setUploadStatus(null);
            }}>Tambahkan Saja</button>
            <button className="btn btn-warning" onClick={async () => {
              const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(duplicateInfo.filename + JSON.stringify(duplicateInfo.sales)));
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
              {loading ? "Memproses ESB..." : "Upload ESB Beverage Excel"}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '380px', margin: '0 auto' }}>
              Drag and drop file "Penjualan Beverage (ESB).xlsx" kesini. Sistem otomatis menghapus header sampah.
            </p>
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: '24px' }}>

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
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{parsedData.totalQty.toLocaleString('id-ID')} Pcs</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Database size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Menu Unik</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{parsedData.uniqueMenus} Menu</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                <span style={{ fontWeight: 800 }}>Rp</span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subtotal Revenue</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatIDR(parsedData.totalRevenue)}</div>
              </div>
            </div>
          </div>

          {parsedData.missingMenus.length > 0 ? (
            <div style={{
              marginBottom: '24px',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.05)'
            }}>
               <h3 style={{ color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={20} /> Warning: {parsedData.missingMenus.length} Menu Tanpa Resep & Bahan
               </h3>
               <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px', marginTop: '8px' }}>
                  Menu di bawah ini ada di laporan ESB tapi tidak ditemukan di Database Resep / Bahan Baku Barventis. HPP tidak akan terpotong untuk menu ini.
                  Anda tetap bisa melanjutkan (Sistem akan mengabaikan pemotongan stok untuk menu ini saja).
               </p>

               <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem' }}>
                    <tbody>
                      {parsedData.missingMenus.map((m, i) => (
                         <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '8px', color: 'var(--text-primary)', fontWeight: 600 }}>{m.name}</td>
                            <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{m.qty} terjual</td>
                         </tr>
                      ))}
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