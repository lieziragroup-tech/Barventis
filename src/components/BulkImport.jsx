import { useState, useRef } from 'react';
import { 
  UploadCloud, FileSpreadsheet, Download, CheckCircle, 
  AlertTriangle, X, ChevronRight, Loader
} from 'lucide-react';

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };

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
          setParsedRows([]);
          setLoading(false);
          return;
        }
        
        const parsed = [];
        
        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          // Skip truly empty rows only. Use a blank check (null/undefined/'') so a
          // legitimate row whose values are all 0 / false is NOT dropped. (LOW #22)
          if (!row || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue;
          
          const obj = { _selected: true, _rowIndex: i + 1, _error: null }; // Default selected
          let rowErrorMsg = null;
          
          expectedColumns.forEach(col => {
            const headerIdx = headers.indexOf(col.label.toLowerCase());
            const rawVal = headerIdx >= 0 ? row[headerIdx] : undefined;
            
            if (col.required && (rawVal === undefined || rawVal === '' || rawVal === null)) {
              rowErrorMsg = `Kolom "${col.label}" wajib diisi.`;
              return;
            }
            
            if (col.type === 'number') {
              const num = parseFloat(rawVal);
              obj[col.key] = isNaN(num) ? 0 : num;
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
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: '24px' }}>
                <strong style={{ color: 'var(--success)' }}>{importResult.success}</strong> baris berhasil diimport
                {importResult.failed > 0 && <>, <strong style={{ color: 'var(--danger)' }}>{importResult.failed}</strong> baris gagal</>}.
              </p>
            )}
            <button onClick={handleClose} className="btn btn-primary" style={{ padding: '9px 28px', fontSize: '0.84rem', borderRadius: 'var(--radius-md)' }}>Selesai</button>
          </div>
        )}
      </div>
    </div>
  );
}
