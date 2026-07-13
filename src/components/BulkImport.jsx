import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, Download, CheckCircle, 
  AlertTriangle, X, ChevronRight, Loader
} from 'lucide-react';

/**
 * BulkImport — Reusable Excel bulk import modal
 * 
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - onCommit: (rows: object[]) => Promise<void>
 * - type: 'materials' | 'recipes' | 'opname'
 * - title: string
 * - description: string
 * - expectedColumns: { key: string, label: string, required: boolean, type: 'string'|'number' }[]
 * - templateData: object[][] (for in-browser template generation)
 */
export default function BulkImport({
  isOpen,
  onClose,
  onCommit,
  type,
  title,
  description,
  expectedColumns,
  currentData = [] // New prop for Sync Export
}) {
  const [step, setStep] = useState('upload'); // 'upload' | 'preview' | 'importing' | 'done'
  const [parsedRows, setParsedRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleClose = () => {
    setStep('upload');
    setParsedRows([]);
    setErrors([]);
    setImportResult(null);
    setLoading(false);
    onClose();
  };

  // Generate and download template Excel in browser
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    
    // Header row
    const headers = expectedColumns.map(c => c.label);
    
    let dataRows = [];
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
  const handleFileUpload = (file) => {
    if (!file) return;
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
          setLoading(false);
          return;
        }
        
        const headers = rawRows[0].map(h => (h || '').toString().trim().toLowerCase());

        // Check required columns exist
        const missingCols = expectedColumns
          .filter(c => c.required)
          .filter(c => !headers.includes(c.label.toLowerCase()));
        
        if (missingCols.length > 0) {
          setErrors([{ 
            row: 0, 
            message: `Kolom wajib tidak ditemukan: ${missingCols.map(c => c.label).join(', ')}` 
          }]);
          setLoading(false);
          return;
        }
        
        const parsed = [];
        const rowErrors = [];
        
        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          // Skip truly empty rows only. Use a blank check (null/undefined/'') so a
          // legitimate row whose values are all 0 / false is NOT dropped. (LOW #22)
          if (!row || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue;
          
          const obj = {};
          let rowHasError = false;
          
          expectedColumns.forEach(col => {
            const headerIdx = headers.indexOf(col.label.toLowerCase());
            const rawVal = headerIdx >= 0 ? row[headerIdx] : undefined;
            
            if (col.required && (rawVal === undefined || rawVal === '' || rawVal === null)) {
              rowErrors.push({ row: i + 1, message: `Baris ${i + 1}: Kolom "${col.label}" wajib diisi.` });
              rowHasError = true;
              return;
            }
            
            if (col.type === 'number') {
              const num = parseFloat(rawVal);
              obj[col.key] = isNaN(num) ? 0 : num;
            } else {
              obj[col.key] = rawVal ? rawVal.toString().trim() : '';
            }
          });
          
          if (!rowHasError) parsed.push(obj);
        }
        
        setErrors(rowErrors);
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
      const result = await onCommit(parsedRows);
      setImportResult(result || { success: parsedRows.length, failed: 0 });
      setStep('done');
    } catch (err) {
      setErrors([{ row: 0, message: err.message }]);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(6, 9, 19, 0.85)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3000, padding: '20px'
    }}>
      <div className="glass-card" style={{
        width: '100%', maxWidth: '680px',
        padding: '32px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <FileSpreadsheet size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', margin: 0 }}>{title}</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>{description}</p>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
          {['Upload', 'Preview', 'Selesai'].map((s, i) => {
            const stepIdx = ['upload', 'preview', 'done'];
            const currentIdx = stepIdx.indexOf(step === 'importing' ? 'preview' : step);
            const active = i <= currentIdx;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '50%',
                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700,
                  color: active ? '#fff' : 'var(--text-muted)'
                }}>{i + 1}</div>
                <span style={{ fontSize: '0.78rem', color: active ? 'white' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>{s}</span>
                {i < 2 && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
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
              style={{ width: '100%', justifyContent: 'center', marginBottom: '16px', gap: '8px', padding: '12px' }}
            >
              <Download size={16} /> Download Template Excel
            </button>

            {/* Upload zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(255,255,255,0.15)',
                borderRadius: '12px',
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.02)',
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
                <div style={{ color: 'var(--accent)' }}><Loader size={32} style={{ animation: 'spin 1s linear infinite' }} /></div>
              ) : (
                <>
                  <UploadCloud size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <p style={{ color: 'white', fontWeight: 600, marginBottom: '4px' }}>Drop file Excel di sini atau klik untuk browse</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Format: .xlsx atau .xls</p>
                </>
              )}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div style={{ marginTop: '16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                  <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}>Error Validasi</span>
                </div>
                {errors.slice(0, 5).map((err, i) => (
                  <p key={i} style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '2px 0' }}>• {err.message}</p>
                ))}
                {errors.length > 5 && <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>...dan {errors.length - 5} error lainnya</p>}
              </div>
            )}
          </div>
        )}

        {/* STEP: Preview */}
        {step === 'preview' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'white' }}>{parsedRows.length}</strong> baris siap diimport
                  {errors.length > 0 && <span style={{ color: '#fbbf24', marginLeft: '8px' }}>({errors.length} baris dilewati karena error)</span>}
                </span>
              </div>
              <button onClick={() => setStep('upload')} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>← Ganti File</button>
            </div>

            {/* Preview table */}
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '20px' }}>
              <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    {expectedColumns.map(c => <th key={c.key}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      {expectedColumns.map(c => (
                        <td key={c.key} style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row[c.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {parsedRows.length > 50 && (
                    <tr><td colSpan={expectedColumns.length + 1} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '8px' }}>...dan {parsedRows.length - 50} baris lainnya</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={handleClose} className="btn btn-secondary">Batal</button>
              <button
                onClick={handleCommit}
                disabled={loading || parsedRows.length === 0}
                className="btn btn-primary"
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UploadCloud size={14} />}
                {loading ? 'Mengimport...' : `Import ${parsedRows.length} Baris`}
              </button>
            </div>
          </div>
        )}

        {/* STEP: Importing */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Loader size={40} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
            <h4 style={{ color: 'white', marginBottom: '8px' }}>Sedang Mengimport Data...</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Mohon tunggu, jangan tutup halaman ini.</p>
          </div>
        )}

        {/* STEP: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', color: 'var(--success)'
            }}>
              <CheckCircle size={32} />
            </div>
            <h4 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>Import Berhasil!</h4>
            {importResult && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '24px' }}>
                {importResult.success} baris berhasil diimport
                {importResult.failed > 0 && `, ${importResult.failed} baris gagal`}.
              </p>
            )}
            <button onClick={handleClose} className="btn btn-primary" style={{ padding: '10px 28px' }}>Selesai</button>
          </div>
        )}
      </div>
    </div>
  );
}
