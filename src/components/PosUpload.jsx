import React, { useState, useRef } from 'react';
import { 
  Upload, FileSpreadsheet, AlertCircle, CheckCircle, 
  MapPin, Calendar, Database, ShieldAlert, Sparkles, X, Settings
} from 'lucide-react';
import * as XLSX from 'xlsx';
import confetti from 'canvas-confetti';

export default function PosUpload({ stock, recipes, transactions, onProcessPosSales }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [mappedSales, setMappedSales] = useState([]);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingMenuName, setMappingMenuName] = useState('');
  const [selectedRecipeName, setSelectedRecipeName] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'warning', 'error'
  const fileInputRef = useRef(null);

  // POS Custom templates states
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState({
    header_row_index: 12,
    branch_col: "branch",
    sales_date_col: "sales date",
    menu_name_col: "menu name",
    menu_code_col: "menu code",
    qty_col: "qty",
    total_col: "total"
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  React.useEffect(() => {
    loadTemplateConfig();
  }, []);

  const loadTemplateConfig = async () => {
    try {
      const allTemplates = await api.getPosTemplates();
      setTemplates(allTemplates);

      const details = await api.getActiveTenantTemplateDetails();
      if (details) {
        if (details.pos_template_id) {
          setSelectedTemplateId(details.pos_template_id);
        }
        if (details.pos_templates) {
          setActiveTemplate(details.pos_templates.column_mapping);
        }
      }
    } catch (e) {
      console.warn("Failed to load POS template config:", e);
    }
  };

  const handleTemplateChange = async (templateId) => {
    try {
      setLoading(true);
      await api.updateTenantTemplate(templateId);
      setSelectedTemplateId(templateId);
      const match = templates.find(t => t.id === templateId);
      if (match) {
        setActiveTemplate(match.column_mapping);
      }
      alert("Sistem pembacaan kasir POS berhasil diubah!");
    } catch (err) {
      alert("Gagal mengubah template kasir: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 1. Drag Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processExcelFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processExcelFile(e.target.files[0]);
    }
  };

  // 2. Excel Parsing Engine
  const processExcelFile = (excelFile) => {
    setFile(excelFile);
    setLoading(true);
    setUploadStatus(null);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const ab = e.target.result;
        const wb = XLSX.read(ab, { type: 'array' });
        
        // Use the first sheet
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        
        // Convert sheet to raw array
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        const headerRowIndex = activeTemplate.header_row_index ?? 12;

        if (rawRows.length <= headerRowIndex) {
          throw new Error("Spreadsheet baris data terlalu sedikit. File POS ini tidak memiliki baris data yang cukup.");
        }

        // Extract metadata from row 0 to headerRowIndex-1 (if headerRowIndex > 0)
        let periodStr = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
        let branchName = "RESTO OUTLET";
        let generatedBy = "POS Kasir System";

        for (let i = 0; i < headerRowIndex; i++) {
          const rVals = rawRows[i] || [];
          const rowText = rVals.join(" ").toLowerCase();
          if (rowText.includes("period") || rowText.includes("periode")) {
            periodStr = rVals[1] || rVals[2] || periodStr;
          }
          if (rowText.includes("branch") || rowText.includes("cabang") || rowText.includes("outlet")) {
            branchName = rVals[1] || rVals[2] || branchName;
          }
          if (rowText.includes("generated") || rowText.includes("user") || rowText.includes("kasir")) {
            generatedBy = rVals[1] || rVals[2] || generatedBy;
          }
        }

        // Headers are at headerRowIndex
        const headers = rawRows[headerRowIndex] || [];
        const colMap = {};
        headers.forEach((h, idx) => {
          if (h) colMap[h.toString().trim().toLowerCase()] = idx;
        });

        // Verify key columns dynamically
        const reqColsKeys = ['menu_name_col', 'qty_col', 'total_col'];
        const missingCols = [];
        reqColsKeys.forEach(key => {
          const colName = activeTemplate[key];
          if (colName && colMap[colName.toLowerCase()] === undefined) {
            missingCols.push(colName);
          }
        });

        if (missingCols.length > 0) {
          throw new Error(`Kolom wajib tidak ditemukan di spreadsheet: ${missingCols.join(", ")}`);
        }

        // Data starts at headerRowIndex + 1
        const salesRows = [];
        let totalQty = 0;
        let totalRevenue = 0;

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;
          
          const branchColName = activeTemplate.branch_col;
          const salesDateColName = activeTemplate.sales_date_col;
          const menuNameColName = activeTemplate.menu_name_col;
          const menuCodeColName = activeTemplate.menu_code_col;
          const qtyColName = activeTemplate.qty_col;
          const totalColName = activeTemplate.total_col;

          const branchVal = branchColName ? row[colMap[branchColName.toLowerCase()]] : null;
          const dateVal = salesDateColName ? row[colMap[salesDateColName.toLowerCase()]] : null;
          const menuNameVal = menuNameColName ? row[colMap[menuNameColName.toLowerCase()]] : null;
          const menuCodeVal = menuCodeColName ? row[colMap[menuCodeColName.toLowerCase()]] : null;
          const qtyVal = qtyColName ? parseInt(row[colMap[qtyColName.toLowerCase()]]) : 0;
          const totalVal = totalColName ? parseFloat(row[colMap[totalColName.toLowerCase()]]) : 0;

          // Rule 1: Skip daily subtotal rows
          if (branchColName && !branchVal && !isNaN(qtyVal) && !menuNameVal) {
            continue;
          }

          // Rule 2: Skip empty rows
          if (!branchVal && !dateVal && !menuNameVal) {
            continue;
          }

          if (menuNameVal && !isNaN(qtyVal)) {
            salesRows.push({
              branch: branchVal || branchName,
              salesDate: dateVal ? (() => {
                if (typeof dateVal === 'number') {
                  // Handle Excel serial number
                  return new Date(Math.round((dateVal - 25569) * 86400 * 1000)).toISOString().split('T')[0];
                }
                const parsed = new Date(dateVal);
                return isNaN(parsed.getTime()) ? new Date().toISOString().split('T')[0] : parsed.toISOString().split('T')[0];
              })() : new Date().toISOString().split('T')[0],
              menuName: menuNameVal.toString().trim(),
              menuCode: menuCodeVal ? menuCodeVal.toString().trim() : null,
              qty: qtyVal,
              total: totalVal || 0
            });
            totalQty += qtyVal;
            totalRevenue += totalVal || 0;
          }
        }

        // Process Mapping of sales to recipes
        const mappedData = salesRows.map(sale => {
          // Attempt 1: Exact match by POS/menu name (ignoring case)
          let match = recipes.find(r => r.menu_name.toLowerCase() === sale.menuName.toLowerCase());
          
          // Attempt 2: Fuzzy match if possible or fallback
          return {
            ...sale,
            isMapped: !!match,
            recipeName: match ? match.menu_name : null,
            totalCost: match ? match.basic_cost * sale.qty : 0
          };
        });

        setParsedData({
          filename: excelFile.name,
          period: periodStr,
          branchName: branchName,
          generatedBy: generatedBy,
          totalRows: salesRows.length,
          totalQty: totalQty,
          totalRevenue: totalRevenue
        });

        setMappedSales(mappedData);
        setUploadStatus(mappedData.some(s => !s.isMapped) ? 'warning' : 'success');
        setLoading(false);
      } catch (err) {
        setUploadStatus('error');
        alert("Error parsing excel: " + err.message);
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(excelFile);
  };

  // 3. Open Manual Mapping Modal
  const openMappingModal = (menuName) => {
    setMappingMenuName(menuName);
    setSelectedRecipeName(recipes[0]?.menu_name || '');
    setShowMappingModal(true);
  };

  // 4. Submit Manual Mapping
  const handleMapSubmit = (e) => {
    e.preventDefault();
    
    // Bind all instances of this menu name in mappedSales to selectedRecipeName
    const match = recipes.find(r => r.menu_name === selectedRecipeName);
    if (!match) return;

    const updatedSales = mappedSales.map(s => {
      if (s.menuName === mappingMenuName) {
        return {
          ...s,
          isMapped: true,
          recipeName: selectedRecipeName,
          totalCost: match.basic_cost * s.qty
        };
      }
      return s;
    });

    setMappedSales(updatedSales);
    setUploadStatus(updatedSales.some(s => !s.isMapped) ? 'warning' : 'success');
    setShowMappingModal(false);
  };

  // 5. Complete Processing & Deduct Stock
  const handleCommitSales = () => {
    const unmapped = mappedSales.filter(s => !s.isMapped);
    if (unmapped.length > 0) {
      alert(`Cannot process sales! There are ${unmapped.length} unmapped F&B items. Please bind all items to recipes first.`);
      return;
    }

    setLoading(true);
    setTimeout(() => {
      onProcessPosSales(mappedSales, parsedData.filename);
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
      // Clear State
      setFile(null);
      setParsedData(null);
      setMappedSales([]);
      setUploadStatus(null);
      setLoading(false);
    }, 1500);
  };

  // Format Currency
  const formatIDR = (num) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  const unmappedItems = mappedSales.filter(s => !s.isMapped);
  const unmappedUniqueNames = [...new Set(unmappedItems.map(s => s.menuName))];

  return (
    <div>
      {/* POS Template Configuration Dropdown */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px', 
        background: 'rgba(30, 41, 59, 0.35)', 
        border: '1px solid var(--border)', 
        padding: '16px 24px', 
        borderRadius: '12px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#fff' }}>Sistem Kasir POS Aktif</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pilih format pembacaan kasir:</span>
          <select 
            value={selectedTemplateId} 
            onChange={(e) => handleTemplateChange(e.target.value)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.825rem',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* File Uploader area */}
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
            <Upload size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'white', marginBottom: '8px' }}>
              Upload Daily POS Sales Spreadsheet
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '380px', margin: '0 auto' }}>
              Drag and drop your excel sales export here, or click to browse files.
            </p>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supported: .xlsx, .xls max 10MB</span>
        </div>
      ) : (
        /* Excel Preview Panel */
        <div className="glass-card" style={{ padding: '24px' }}>
          
          {/* Metadata Grid */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '20px', borderRadius: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>File Uploaded</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{parsedData.filename}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                <MapPin size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Branch Location</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{parsedData.branchName}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '160px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Period Span</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{parsedData.period}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '160px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                <Database size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total POS Records</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{parsedData.totalRows} Rows</div>
              </div>
            </div>
          </div>

          {/* Alert for unmapped items */}
          {unmappedUniqueNames.length > 0 && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)',
              padding: '16px 20px', borderRadius: '12px', marginBottom: '24px',
              display: 'flex', gap: '16px'
            }}>
              <ShieldAlert size={28} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white', marginBottom: '4px' }}>
                  Action Required: {unmappedUniqueNames.length} Unmapped POS Items
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                  The items listed below do not match any recipe in the UMATIS system. You must manually bind them to their respective resep before you can deduct stock or calculate COGS.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {unmappedUniqueNames.map(name => (
                    <button 
                      key={name}
                      onClick={() => openMappingModal(name)}
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', gap: '6px', alignItems: 'center', borderColor: 'var(--danger)' }}
                    >
                      <Settings size={12} style={{ color: 'var(--danger)' }} /> Bind: "{name}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {unmappedUniqueNames.length === 0 && (
            <div style={{ 
              background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)',
              padding: '16px 20px', borderRadius: '12px', marginBottom: '24px',
              display: 'flex', alignItems: 'center', gap: '16px'
            }}>
              <CheckCircle size={28} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'white', marginBottom: '2px' }}>
                  Mapping Validation Passed!
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  All {mappedSales.length} POS sales rows successfully matched their respective recipes. You are ready to process deductions.
                </p>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <button 
                  onClick={handleCommitSales}
                  disabled={loading}
                  className="btn btn-success" 
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <Sparkles size={16} /> {loading ? "Deducting Stock..." : "Process Stock Deductions"}
                </button>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>POS Spreadsheet Rows Preview</h3>
            <button className="btn btn-secondary" onClick={() => {
              setFile(null);
              setParsedData(null);
              setMappedSales([]);
              setUploadStatus(null);
            }}>
              Cancel Upload
            </button>
          </div>

          {/* Data Preview Table */}
          <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Sales Date</th>
                  <th>Menu Name</th>
                  <th>POS Code</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Selling Price</th>
                  <th style={{ textAlign: 'right' }}>Total Sales</th>
                  <th>Recipe Status</th>
                  <th style={{ textAlign: 'right' }}>COGS Deduction Value</th>
                </tr>
              </thead>
              <tbody>
                {mappedSales.map((sale, idx) => (
                  <tr key={idx}>
                    <td>{sale.salesDate}</td>
                    <td style={{ fontWeight: 600 }}>{sale.menuName}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{sale.menuCode || 'NULL'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{sale.qty}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {formatIDR(sale.total / sale.qty)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIDR(sale.total)}</td>
                    <td>
                      {sale.isMapped ? (
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>Mapped: {sale.recipeName}</span>
                      ) : (
                        <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>Unmapped</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {sale.isMapped ? formatIDR(sale.totalCost) : 'IDR 0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* Manual Recipe Binding Modal */}
      {showMappingModal && (
        <div style={{ 
          position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-card" style={{ width: '450px', padding: '28px', border: '1px solid var(--border-focus)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Bind POS Menu to Recipe</h3>
              <button className="btn btn-secondary" style={{ padding: '4px', borderRadius: '50%' }} onClick={() => setShowMappingModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleMapSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unmapped POS Name</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'white', marginTop: '2px' }}>"{mappingMenuName}"</div>
              </div>

              {/* Autocomplete selection */}
              <div className="form-group">
                <label className="form-label">Select Destination COGS Recipe</label>
                <select 
                  className="form-control" 
                  value={selectedRecipeName}
                  onChange={e => setSelectedRecipeName(e.target.value)}
                >
                  {recipes.map(r => (
                    <option key={r.menu_name} value={r.menu_name}>{r.menu_name} (HPP: {formatIDR(r.basic_cost)})</option>
                  ))}
                </select>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '12px' }}>
                * Binding this item will automatically connect all instances in the current POS upload, applying the ingredient subtraction rule upon execution.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMappingModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Bind Menu Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
