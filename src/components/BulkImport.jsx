import { useState, useRef } from 'react';
import {
  UploadCloud, FileSpreadsheet, Download, CheckCircle,
  AlertTriangle, X, ChevronRight, Loader, Sparkles, PlusCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };

// Menormalkan nilai tanggal dari Excel ke format YYYY-MM-DD, apapun bentuk
// mentahnya dari SheetJS:
// 1. Angka serial Excel (cell benar-benar berformat Date di Excel)
// 2. Objek Date (jaga-jaga kalau suatu saat cellDates diaktifkan)
// 3. String dengan berbagai format umum (YYYY-MM-DD, DD/MM/YYYY, dst.)
// Sebelumnya kolom bertipe 'string' langsung di-.toString() tanpa cek ini,
// jadi kalau raw value-nya angka serial Excel, hasilnya string angka mentah
// ("46113") yang gagal di-parse ulang jadi tanggal valid di layer berikutnya.
const normalizeDateValue = (raw) => {
  if (raw === undefined || raw === null || raw === '') return '';

  if (typeof raw === 'number' && !isNaN(raw)) {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  }

  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? '' : raw.toISOString().split('T')[0];
  }

  const s = raw.toString().trim();
  if (!s) return '';

  if (s.includes('/') || s.includes('-')) {
    const parts = s.split(/[/-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY atau DD-MM-YYYY (bagian terakhir 4 digit = tahun)
        const d = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
        return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
      }
      // YYYY-MM-DD atau YYYY/MM/DD (bagian pertama 4 digit = tahun)
      const d = new Date(s);
      return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

/**
 * BulkImport — Reusable Excel bulk import modal
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - onCommit: (rows: object[]) => Promise<{success: number, failed: number}>
 * - type: 'materials' | 'recipes' | 'opname' | 'invoices'
 * - title: string
 * - description: string
 * - expectedColumns: { key, label, required, type, sample, description }[]
 * - currentData: object[] (for template download, populates rows with existing data)
 */
export default function BulkImport({
  isOpen,
  onClose,
  onCommit,
  type,
  title,
  description,
  expectedColumns,
  currentData = [],          // New prop for Sync Export
  onRegisterMissing = null   // Layer 2: async (items[]) => void — daftarkan item ke master data
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'done'
  const [parsedRows, setParsedRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Layer 2 — Register & Retry state
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerDone, setRegisterDone] = useState(false);

  const handleClose = () => {
    setStep('upload');
    setParsedRows([]);
    setErrors([]);
    setImportResult(null);
    setLoading(false);
    setRegisterLoading(false);
    setRegisterDone(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  // Generate and download template Excel in browser
  const handleDownloadTemplate = async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();
    
    // Header row
    const headers = expectedColumns.map(c => c.label);
    
    let dataRows;
    if (currentData && currentData.length > 0) {
      dataRows = currentData.map(item => {
        return expectedColumns.map(c => item[c.key] !== undefined ? item[c.key] : '');
      });
    } else {
      // Sample row
      dataRows = [expectedColumns.map(c => {
        if (c.type === 'number') return c.sample ?? 0;
        return c.sample ?? `Contoh ${c.label}`;
      })];
    }
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    
    // Column widths
    ws['!cols'] = expectedColumns.map(() => ({ wch: 20 }));
    
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    
    // Instructions sheet
    const infoData = [
      ['PETUNJUK PENGISIAN'],
      [''],
      ['Kolom Wajib (*):', expectedColumns.filter(c => c.required).map(c => c.label).join(', ')],
      ['Format file:', 'Excel .xlsx atau .xls'],
      ['Baris pertama:', 'Header (jangan diubah)'],
      ['Baris berikutnya:', 'Data (satu baris = satu item)'],
      [''],
      ...expectedColumns.map(c => [
        `${c.required ? '* ' : ''}${c.label}`,
        c.description || '',
        `Tipe: ${c.type}`
      ])
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
    wsInfo['!cols'] = [{ wch: 25 }, { wch: 40 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Petunjuk');
    
    XLSX.writeFile(wb, `template_${type}.xlsx`);
  };

  // Parse uploaded Excel file
  const handleFileUpload = async (file) => {
    if (!file) return;
    const XLSX = await getXLSX();
    setLoading(true);
    setErrors([]);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (rawRows.length < 2) {
          setErrors([{ row: 0, message: 'File kosong atau hanya berisi header.' }]);
          setParsedRows([]);
          setLoading(false);
          return;
        }

        // Find the actual header row heuristically (row with most strings, or first row with > 2 non-empty columns)
        let headerRowIdx = 0;
        for(let r = 0; r < Math.min(10, rawRows.length); r++) {
          if (rawRows[r] && rawRows[r].filter(c => c && String(c).trim()).length > 2) {
            headerRowIdx = r;
            break;
          }
        }

        const headers = (rawRows[headerRowIdx] || []).map(h => (h || '').toString().trim().toLowerCase());

        // A column can optionally declare `labels: [..]` — alternate header text
        // that should also match (e.g. a column renamed between template
        // versions). Falls back to the single `label` when not provided, so
        // existing expectedColumns definitions are unaffected.
        const labelCandidates = (col) => (col.labels && col.labels.length ? col.labels : [col.label]);
        const findHeaderIdx = (col) => {
          for (const cand of labelCandidates(col)) {
            const idx = headers.indexOf(cand.toLowerCase());
            if (idx >= 0) return idx;
          }
          return -1;
        };

        // Check required columns exist
        const missingCols = expectedColumns
          .filter(c => c.required)
          .filter(c => findHeaderIdx(c) === -1);
        
        if (missingCols.length > 0) {
          setErrors([{ 
            row: 0, 
            message: `Kolom wajib tidak ditemukan: ${missingCols.map(c => c.label).join(', ')}` 
          }]);
          setParsedRows([]);
          setLoading(false);
          return;
        }
        
        const parsed = [];

        for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          // Skip truly empty rows only. Use a blank check (null/undefined/'') so a
          // legitimate row whose values are all 0 / false is NOT dropped. (LOW #22)
          if (!row || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue;
          
          const obj = { _selected: true, _rowIndex: i + 1, _error: null }; // Default selected
          let rowErrorMsg = null;
          
          expectedColumns.forEach(col => {
            const headerIdx = findHeaderIdx(col);
            const rawVal = headerIdx >= 0 ? row[headerIdx] : undefined;
            
            if (col.required && (rawVal === undefined || rawVal === '' || rawVal === null)) {
              rowErrorMsg = `Kolom "${col.label}" wajib diisi.`;
              return;
            }
            
            if (col.type === 'number') {
              const num = parseFloat(rawVal);
              obj[col.key] = isNaN(num) ? 0 : num;
            } else if (col.type === 'date') {
              obj[col.key] = normalizeDateValue(rawVal);
            } else {
              obj[col.key] = rawVal ? rawVal.toString().trim() : '';
            }
          });
          
          if (rowErrorMsg) {
             obj._selected = false;
             obj._error = rowErrorMsg;
          }
          parsed.push(obj);
        }
        
        setParsedRows(parsed);
        if (parsed.length > 0) setStep('preview');
        
      } catch (err) {
        setErrors([{ row: 0, message: 'Gagal membaca file: ' + err.message }]);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCommit = async () => {
    setStep('importing');
    setLoading(true);
    try {
      const selectedRows = parsedRows.filter(r => r._selected && !r._error);
      
      // Clean up internal metadata before passing to parent
      const cleanRows = selectedRows.map(r => {
        const rest = { ...r };
        delete rest._selected;
        delete rest._rowIndex;
        delete rest._error;
        return rest;
      });

      const result = await onCommit(cleanRows);
      setImportResult(result || { success: cleanRows.length, failed: 0 });
      setStep('done');
    } catch (err) {
      setErrors([{ row: 0, message: err.message }]);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const validCount = parsedRows.filter(r => r._selected && !r._error).length;
  const errorCount = parsedRows.filter(r => r._error).length;

  // Layer 2: Register semua missing items ke master data langsung dari modal,
  // lalu trigger retry import tanpa perlu upload ulang file.
  const handleRegisterAndRetry = async () => {
    if (!onRegisterMissing || !importResult?.missingItems?.length) return;
    setRegisterLoading(true);
    try {
      await onRegisterMissing(importResult.missingItems);
      setRegisterDone(true);
      // Retry commit dengan parsedRows yang valid (yang sebelumnya gagal karena missing)
      setStep('importing');
      setLoading(true);
      const selectedRows = parsedRows.filter(r => r._selected && !r._error);
      const cleanRows = selectedRows.map(r => {
        const rest = { ...r };
        delete rest._selected; delete rest._rowIndex; delete rest._error;
        return rest;
      });
      // Juga tambahkan kembali baris yang gagal karena missing master data
      const failedMissingRows = parsedRows.filter(r => {
        if (!r._error) return false;
        const name = (r.material_name || r['NAMA ITEM'] || r['NAMA BAHAN'] || '').toLowerCase();
        return importResult.missingItems.some(m => m.name.toLowerCase() === name);
      }).map(r => {
        const rest = { ...r };
        delete rest._selected; delete rest._rowIndex; delete rest._error;
        return rest;
      });
      const result = await onCommit([...cleanRows, ...failedMissingRows]);
      setImportResult(result || { success: cleanRows.length + failedMissingRows.length, failed: 0 });
      setStep('done');
    } catch (err) {
      setErrors([{ row: 0, message: 'Gagal mendaftarkan item: ' + err.message }]);
      setStep('done');
    } finally {
      setLoading(false);
      setRegisterLoading(false);
    }
  };

  const renderAIAnalysis = () => {
    if (!importResult || importResult.failed === 0 || !Array.isArray(importResult.errors) || importResult.errors.length === 0) return null;

    const errorMessages = importResult.errors.map(e => e.error?.toLowerCase() || '');
    const hasMissingMasterData = errorMessages.some(m => m.includes('tidak ditemukan') || m.includes('master data') || m.includes('kosong'));
    const hasFormatError = errorMessages.some(m => m.includes('format') || m.includes('valid') || m.includes('angka') || m.includes('harus'));

    // Layer 2: apakah ada missing items yang bisa di-register langsung?
    const canRegisterInline = onRegisterMissing && Array.isArray(importResult.missingItems) && importResult.missingItems.length > 0;
    const missingNames = canRegisterInline ? importResult.missingItems.map(i => i.name) : [];

    return (
      <div style={{
        marginTop: '12px', background: 'var(--accent-glow)', border: '1px solid rgba(79, 110, 247, 0.2)',
        borderRadius: 'var(--radius-lg)', padding: '16px', textAlign: 'left'
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>AI Assistant Analysis</span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 12px 24px', lineHeight: 1.5 }}>
          Ditemukan {importResult.failed} baris data yang ditolak oleh sistem. Berdasarkan analisis pola error:
        </p>

        <ul style={{ color: 'var(--text-primary)', fontSize: '0.8rem', margin: '0 0 16px 24px', paddingLeft: '16px', lineHeight: 1.6 }}>
          {hasMissingMasterData && (
            <li>
              Beberapa item belum terdaftar di <strong>Master Data</strong>.
              {canRegisterInline && (
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}> ({missingNames.join(', ')})</span>
              )}
            </li>
          )}
          {hasFormatError && <li>Terdapat angka Qty atau Harga yang kosong/bernilai negatif.</li>}
          {!hasMissingMasterData && !hasFormatError && <li>Pastikan penulisan data mengikuti panduan standar.</li>}
        </ul>

        {/* Layer 2: Register & Retry inline — tidak perlu keluar modal atau upload ulang */}
        {canRegisterInline && !registerDone && (
          <div style={{
            margin: '0 0 12px 24px', padding: '10px 14px',
            background: 'rgba(79,110,247,0.06)', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(79,110,247,0.15)'
          }}>
            <p style={{ color: 'var(--text-primary)', fontSize: '0.78rem', margin: '0 0 10px 0', fontWeight: 600 }}>
              ✨ Daftarkan otomatis & ulangi import tanpa upload ulang:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {missingNames.map(n => (
                <span key={n} style={{
                  padding: '3px 10px', borderRadius: '99px', fontSize: '0.72rem',
                  background: 'rgba(79,110,247,0.12)', color: 'var(--accent)', fontWeight: 500
                }}>{n}</span>
              ))}
            </div>
            <button
              onClick={handleRegisterAndRetry}
              disabled={registerLoading}
              className="btn btn-primary"
              style={{ padding: '7px 16px', fontSize: '0.78rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {registerLoading
                ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Mendaftarkan & Mengulang...</>
                : <><PlusCircle size={13} /> Daftarkan ke Master Data & Ulangi Import</>
              }
            </button>
          </div>
        )}

        {registerDone && (
          <p style={{ margin: '0 0 12px 24px', fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600 }}>
            ✅ Item berhasil didaftarkan ke Master Data. Import diulang otomatis.
          </p>
        )}

        <div style={{ marginLeft: '24px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {hasMissingMasterData && !canRegisterInline && (
            <button
              onClick={() => {
                handleClose();
                const currentPath = window.location.pathname;
                const basePath = currentPath.startsWith('/superadmin') ? '/superadmin' : currentPath.startsWith('/owner') ? '/owner' : '/staff';
                if (type === 'assets') navigate(`${basePath}/assets`);
                else navigate(`${basePath}/stock`);
              }}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusCircle size={14} /> Tambahkan ke Master Data
            </button>
          )}
          <button
            onClick={() => handleDownloadTemplate()}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: 'var(--radius-md)' }}
          >
            Download Template Kosong
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3000, padding: '20px'
    }}>
      <div style={{
        width: '100%', maxWidth: '680px',
        padding: '28px 32px',
        background: 'var(--glass-bg)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--card-shadow)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
            </div>
            {description && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{description}</p>}
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {['Upload', 'Preview', 'Selesai'].map((s, i) => {
            const stepIdx = ['upload', 'preview', 'done'];
            const currentIdx = stepIdx.indexOf(step === 'importing' ? 'preview' : step);
            const active = i <= currentIdx;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: active ? 'var(--accent)' : 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.68rem', fontWeight: 600,
                  color: active ? '#fff' : 'var(--text-muted)',
                  transition: 'all 0.2s'
                }}>{i + 1}</div>
                <span style={{ fontSize: '0.78rem', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{s}</span>
                {i < 2 && <ChevronRight size={12} style={{ color: 'var(--border)' }} />}
              </div>
            );
          })}
        </div>

        {/* STEP: Upload */}
        {step === 'upload' && (
          <div>
            {/* Download template button */}
            <button
              onClick={handleDownloadTemplate}
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: '14px', gap: '8px', padding: '10px', borderRadius: 'var(--radius-lg)' }}
            >
              <Download size={15} /> Download Template Excel
            </button>

            {/* Upload zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '36px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--bg-tertiary)',
                transition: 'all 0.2s'
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files[0]); }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => handleFileUpload(e.target.files[0])}
              />
              {loading ? (
                <div style={{ color: 'var(--accent)' }}><Loader size={28} style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : (
                <>
                  <UploadCloud size={28} style={{ color: 'var(--text-muted)', marginBottom: '10px' }} />
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px' }}>Drop file Excel di sini atau klik untuk browse</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Format: .xlsx atau .xls</p>
                </>
              )}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div style={{ marginTop: '14px', background: 'var(--danger-glow)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 'var(--radius-lg)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
                  <span style={{ color: 'var(--danger-text)', fontWeight: 600, fontSize: '0.82rem' }}>Error Validasi</span>
                </div>
                {errors.slice(0, 5).map((err, i) => (
                  <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '2px 0 2px 23px', lineHeight: 1.4 }}>• {err.message}</p>
                ))}
                {errors.length > 5 && <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '23px' }}>...dan {errors.length - 5} error lainnya</p>}
              </div>
            )}
          </div>
        )}

        {/* STEP: Preview */}
        {step === 'preview' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{validCount}</strong> baris dipilih
                </span>
                {errorCount > 0 && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--warning-text)', background: 'var(--warning-glow)', padding: '2px 10px', borderRadius: '20px', fontWeight: 500 }}>
                    {errorCount} error (auto-skip)
                  </span>
                )}
              </div>
              <button onClick={() => setStep('upload')} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.78rem', borderRadius: 'var(--radius-md)' }}>← Ganti File</button>
            </div>

            {/* Error banner from commit failure */}
            {errors.length > 0 && (
              <div style={{ marginBottom: '12px', background: 'var(--danger-glow)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <span style={{ color: 'var(--danger-text)', fontWeight: 500, fontSize: '0.82rem' }}>{errors[0]?.message}</span>
              </div>
            )}

            {/* Preview table */}
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '18px' }}>
              <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center', padding: '10px 6px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
                      <input 
                        type="checkbox" 
                        checked={(() => {
                          const valid = parsedRows.filter(r => !r._error);
                          return valid.length > 0 && valid.every(r => r._selected);
                        })()}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setParsedRows(prev => prev.map(r => r._error ? r : { ...r, _selected: checked }));
                        }}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                      />
                    </th>
                    <th style={{ padding: '10px 8px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 500, width: '32px' }}>#</th>
                    {expectedColumns.map(c => (
                      <th key={c.key} style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <tr key={i} style={{ 
                      background: row._error ? 'var(--danger-glow)' : 'transparent', 
                      opacity: row._error ? 0.55 : 1,
                      transition: 'background 0.15s'
                    }}>
                      <td style={{ textAlign: 'center', padding: '8px 6px' }}>
                        <input 
                          type="checkbox" 
                          checked={row._selected}
                          disabled={!!row._error}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setParsedRows(prev => prev.map((r, idx) => idx === i ? { ...r, _selected: checked } : r));
                          }}
                          style={{ cursor: row._error ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }}
                        />
                      </td>
                      <td style={{ padding: '8px 8px', color: 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap' }} title={row._error || ''}>
                        {row._rowIndex}
                        {row._error && <AlertTriangle size={11} style={{ color: 'var(--danger)', marginLeft: '4px', verticalAlign: 'middle' }} />}
                      </td>
                      {expectedColumns.map(c => (
                        <td key={c.key} style={{ padding: '8px 12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: row._error ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {row[c.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {parsedRows.length > 50 && (
                    <tr><td colSpan={expectedColumns.length + 2} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '10px', fontSize: '0.78rem' }}>...dan {parsedRows.length - 50} baris lainnya</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={handleClose} className="btn btn-secondary" style={{ padding: '8px 20px', fontSize: '0.82rem', borderRadius: 'var(--radius-md)' }}>Batal</button>
              <button
                onClick={handleCommit}
                disabled={loading || validCount === 0}
                className="btn btn-primary"
                style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '8px 20px', fontSize: '0.82rem', borderRadius: 'var(--radius-md)' }}
              >
                {loading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <UploadCloud size={13} />}
                {loading ? 'Mengimport...' : `Import ${validCount} Baris`}
              </button>
            </div>
          </div>
        )}

        {/* STEP: Importing */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Loader size={36} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', marginBottom: '14px' }} />
            <h4 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem', marginBottom: '6px' }}>Sedang Mengimport Data...</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Mohon tunggu, jangan tutup halaman ini.</p>
          </div>
        )}

        {/* STEP: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '28px 20px' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '50%',
              background: 'var(--success-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', color: 'var(--success)'
            }}>
              <CheckCircle size={28} />
            </div>
            <h4 style={{ color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>Import Berhasil!</h4>
            {importResult && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: importResult.failed > 0 ? '14px' : '24px' }}>
                <strong style={{ color: 'var(--success)' }}>{importResult.success}</strong> baris berhasil diimport
                {importResult.failed > 0 && <>, <strong style={{ color: 'var(--danger)' }}>{importResult.failed}</strong> baris gagal</>}.
              </p>
            )}
            {importResult && importResult.failed > 0 && Array.isArray(importResult.errors) && importResult.errors.length > 0 && (
              <div style={{
                textAlign: 'left', marginBottom: '20px', background: 'var(--danger-glow)',
                border: '1px solid rgba(220,38,38,0.15)', borderRadius: 'var(--radius-lg)',
                padding: '12px 14px', maxHeight: '220px', overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--danger)' }} />
                  <span style={{ color: 'var(--danger-text)', fontWeight: 600, fontSize: '0.82rem' }}>Detail Baris Gagal (Silakan perbaiki data di bawah atau upload ulang)</span>
                </div>
                {importResult.errors.map((err, i) => (
                  <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '2px 0 2px 23px', lineHeight: 1.4 }}>
                    • <strong>{err.row || '(tanpa nama)'}</strong>: {err.error}
                  </p>
                ))}
              </div>
            )}
            {importResult && Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
              <div style={{
                textAlign: 'left', marginBottom: '20px', background: 'var(--warning-glow)',
                border: '1px solid rgba(217,119,6,0.2)', borderRadius: 'var(--radius-lg)',
                padding: '12px 14px', maxHeight: '220px', overflowY: 'auto'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <AlertTriangle size={15} style={{ color: 'var(--warning)' }} />
                  <span style={{ color: 'var(--warning-text)', fontWeight: 600, fontSize: '0.82rem' }}>Perlu Dicek</span>
                </div>
                {importResult.warnings.map((w, i) => (
                  <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '2px 0 2px 23px', lineHeight: 1.4 }}>
                    • {w}
                  </p>
                ))}
              </div>
            )}

            {/* AI Analysis and Recommendations */}
            {renderAIAnalysis()}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
              <button onClick={handleClose} className="btn btn-secondary" style={{ padding: '9px 28px', fontSize: '0.84rem', borderRadius: 'var(--radius-md)' }}>{importResult && importResult.failed > 0 ? 'Tutup' : 'Selesai'}</button>
              {importResult && importResult.failed > 0 && (
                <button onClick={() => setStep('upload')} className="btn btn-primary" style={{ padding: '9px 28px', fontSize: '0.84rem', borderRadius: 'var(--radius-md)' }}>
                  Upload Ulang File Perbaikan
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}