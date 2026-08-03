import React, { useState, useRef } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle,
  MapPin, Calendar, Database, ShieldAlert, Sparkles, X, Settings
} from 'lucide-react';

let _confetti;
const getConfetti = async () => { if (!_confetti) _confetti = (await import('canvas-confetti')).default; return _confetti; };

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import { formatIDR } from '../../services/costUtils';
import { validateBranchMatch } from '../../services/validationService';

export default function PosUpload() {
  const { recipes, currentTenant, handleProcessPosSales, fetchAllData } = useData();
  const onProcessPosSales = handleProcessPosSales;
  const [dragActive, setDragActive] = useState(false);
  const [rawFile, setRawFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [customMappings, setCustomMappings] = useState({});
  const mappedSales = React.useMemo(() => {
    if (!parsedData?.sales) return [];
    
    const nameMap = new Map();
    const codeMap = new Map();
    const customMap = new Map();
    
    Object.entries(customMappings).forEach(([k, v]) => {
      customMap.set(String(k).toLowerCase().trim(), v);
    });
    
    (recipes || []).forEach(r => {
      if (r.menu_name) nameMap.set(String(r.menu_name).toLowerCase().trim(), r);
      if (r.pos_code) codeMap.set(String(r.pos_code).toLowerCase().trim(), r);
    });

    return parsedData.sales.map(row => {
      const rowName = String(row.menu_name || '').toLowerCase().trim();
      const rowCode = String(row.menu_code || '').toLowerCase().trim();
      
      let recipe = customMap.get(rowName);
      if (!recipe && rowCode && rowCode !== '-' && codeMap.has(rowCode)) {
        recipe = codeMap.get(rowCode);
      }
      if (!recipe && nameMap.has(rowName)) {
        recipe = nameMap.get(rowName);
      }
      
      return {
        salesDate: row.sales_date,
        menuName: row.menu_name,
        menuCode: row.menu_code,
        qty: row.qty,
        total: row.total_sales,
        price: row.qty > 0 ? (row.total_sales / row.qty) : 0,
        isMapped: !!recipe,
        recipe_id: recipe?.id || null,
        recipeName: recipe?.menu_name || '',
        totalCost: recipe ? recipe.basic_cost * row.qty : 0
      };
    });
  }, [parsedData, recipes, customMappings]);

  // Bulk Auto-Create Modal States
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSelection, setBulkSelection] = useState({}); // { [menuName]: { selected, price, category, posCode } }

  const openBulkModal = (unmappedItems) => {
    const initial = {};
    unmappedItems.forEach(item => {
      initial[item.menuName] = {
        selected: true,
        price: item.price || 0,
        category: 'NON-KOPI',
        posCode: item.menuCode !== '-' ? item.menuCode : ''
      };
    });
    setBulkSelection(initial);
    setShowBulkModal(true);
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const rowsToImport = Object.entries(bulkSelection)
        .filter(([_, data]) => data.selected)
        .map(([name, data]) => ({
          menu_name: name,
          pos_code: data.posCode || null,
          category: data.category,
          selling_price: data.price,
        }));
      
      if (rowsToImport.length === 0) {
        throw new Error("Pilih minimal satu menu untuk dibuat.");
      }

      await api.bulkImportRecipes(rowsToImport);
      if (fetchAllData) await fetchAllData();
      
      setUploadStatus({ type: 'success', message: `Berhasil membuat ${rowsToImport.length} resep baru!` });
      setShowBulkModal(false);
    } catch (err) {
      setUploadStatus({ type: 'error', message: err.message || 'Gagal membuat resep massal.' });
    } finally {
      setLoading(false);
    }
  };
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingMenuName, setMappingMenuName] = useState('');
  const [selectedRecipeName, setSelectedRecipeName] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'warning', 'error'
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const fileInputRef = useRef(null);

  // GAP-FIX 2026-07: category filter used to be hardcoded to 'minuman' only
  // (see old `BEVERAGE_CATEGORY` const, now replaced by this selectable state).
  // 'MINUMAN' | 'MAKANAN' | 'BOTH'
  const [categoryFilter, setCategoryFilter] = useState('MINUMAN');

  // POS Custom templates states
  const [templates, setTemplates] = useState([]);
  // eslint-disable-next-line no-unused-vars
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
    // eslint-disable-next-line react-hooks/immutability
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
      // Toast handled via onProcessPosSales callback — notify parent
    } catch (err) {
      console.error("Gagal mengubah template kasir:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const openMappingModal = (name) => {
    setMappingMenuName(name);
    setSelectedRecipeName(recipes?.[0]?.menu_name || '');
    setShowMappingModal(true);
  };

  const handleMapSubmit = (e) => {
    e.preventDefault();
    const recipe = (recipes || []).find(r => r.menu_name === selectedRecipeName);
    if (recipe) {
      setCustomMappings(prev => ({
        ...prev,
        [mappingMenuName]: recipe
      }));
    }
    setShowMappingModal(false);
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
  const processExcelFile = async (excelFile) => {
    const XLSX = await getXLSX();
    setRawFile(excelFile);
    setLoading(true);
    setUploadStatus(null);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const ab = e.target.result;
        const wb = XLSX.read(ab, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
                // --- AI HEURISTIC: Find Header Row ---
        let headerRowIndex = -1;
        let colMap = {};
        console.log('AI Analyzing first 30 rows of', excelFile.name);
        for (let i = 0; i < Math.min(30, rawRows.length); i++) {
          const row = rawRows[i] || [];
          const nonEmptyCells = row.filter(c => c !== null && c !== undefined && c.toString().trim() !== '').length;
          const text = row.join(' ').toLowerCase();
          console.log('Row', i, '=>', text);
          
          const hasProduct = /nama|item|menu|produk|product|barang|desc/i.test(text);
          const hasQty = /qty|quantity|jumlah|terjual|sold/i.test(text);
          const hasSales = /gross|kotor|net|bersih|total|amount|sales|harga/i.test(text);
          
          // Require a real tabular header row: several distinct columns filled AND
          // product + qty + total-like keywords all present. A single-cell title
          // like "Daily Sales Menu Report" can otherwise false-match (it contains
          // both "menu" and "sales") and get mistaken for the real header row.
          if (nonEmptyCells >= 3 && hasProduct && hasQty && hasSales) {
            headerRowIndex = i;
            console.log('AI Header Row Detected at index:', i);
            // Map columns. Check date first and claim the column exclusively so a
            // header like "Sales Date" isn't also grabbed by the total-keyword
            // regex (which matches "sales") and stolen from the real total column.
            row.forEach((h, idx) => {
              if (!h) return;
              const hStr = h.toString().toLowerCase().trim();
              if (/tanggal|date|waktu/i.test(hStr) && colMap.date === undefined) { colMap.date = idx; return; }
              if (/nama|item|menu|produk|product|barang|desc/i.test(hStr) && colMap.menu_name === undefined) { colMap.menu_name = idx; return; }
              if (/qty|quantity|jumlah|terjual|sold/i.test(hStr) && colMap.qty === undefined) { colMap.qty = idx; return; }
              // NOTE: 'sales' is deliberately excluded here (kept only for the row-level
              // hasSales check above) because it also matches non-amount columns like
              // "Sales Type" / "Sales Date", which would otherwise steal this slot.
              if (/gross|kotor|net|bersih|total|amount|harga/i.test(hStr) && colMap.total === undefined) { colMap.total = idx; return; }
              // FIX: kategori menu (mis. "Category" -> MINUMAN/MAKANAN/Extra/LAINNYA).
              // Reverse-engineering menemukan file mentah POS sering berisi SEMUA
              // kategori, bukan cuma beverage — tanpa filter ini, item makanan ikut
              // ter-import sebagai "sales beverage".
              if (/^category$/i.test(hStr) && colMap.category === undefined) { colMap.category = idx; return; }
            });
            console.log('AI Column Mapping:', colMap);
            break;
          }
        }

        // --- FIX: Baca Branch & Company SUNGGUHAN dari header, jangan hardcode ---
        // Sebelumnya branchName selalu di-set string statis 'RESTO OUTLET' — file dari
        // outlet manapun akan lolos tanpa validasi. Sekarang cari baris key-value
        // "Branch" / "Company" di area metadata (baris sebelum header tabel).
        let detectedBranch = null;
        let detectedCompany = null;
        for (let i = 0; i < headerRowIndex; i++) {
          const row = rawRows[i] || [];
          const key = (row[0] || '').toString().trim().toLowerCase();
          const val = (row[1] || '').toString().trim();
          if (key === 'branch' && val) detectedBranch = val;
          if (key === 'company' && val) detectedCompany = val;
        }

        if (headerRowIndex === -1 || colMap.menu_name === undefined || colMap.qty === undefined || colMap.total === undefined) {
          throw new Error('AI Gagal mendeteksi format tabel. Pastikan terdapat kolom (Item/Nama), (Qty/Jumlah), dan (Total/Gross). Buka console browser (F12) untuk melihat log pembacaan baris.');
        }

        // --- AI HEURISTIC: Extract Period ---
        let periodMonth = (new Date().getMonth() + 1).toString();
        let periodYear = new Date().getFullYear().toString();
        const months = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const nameLower = excelFile.name.toLowerCase();
        
        let foundMonth = false;
        for (let m = 0; m < months.length; m++) {
          if (nameLower.includes(months[m])) {
            periodMonth = (m % 12 + 1).toString();
            foundMonth = true;
            break;
          }
        }
        const yearMatch = nameLower.match(/20\d{2}/);
        if (yearMatch) periodYear = yearMatch[0];

        if (!foundMonth) {
          for (let i = 0; i < headerRowIndex; i++) {
             const rowText = (rawRows[i]||[]).join(' ').toLowerCase();
             if (rowText.includes('period') || rowText.includes('periode')) {
                for (let m = 0; m < months.length; m++) {
                  if (rowText.includes(months[m])) {
                    periodMonth = (m % 12 + 1).toString();
                    break;
                  }
                }
                const ym = rowText.match(/20\d{2}/);
                if (ym) periodYear = ym[0];
             }
          }
        }

        const defaultDateStr = `${periodYear}-${periodMonth.toString().padStart(2, '0')}-01`;
        
        const parseExcelDate = (dVal) => {
          if (!dVal) return defaultDateStr;
          if (typeof dVal === 'number') {
            const utcMs = Math.round((dVal - 25569) * 86400 * 1000);
            const d = new Date(utcMs);
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
          }
          const parsed = new Date(dVal);
          return isNaN(parsed.getTime()) ? defaultDateStr : parsed.toISOString().split('T')[0];
        };

        const salesRows = [];
        let totalQty = 0;
        let totalRevenue = 0;
        let skippedNonBeverage = 0;

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || row.length === 0) continue;

          const menuName = row[colMap.menu_name];
          if (!menuName || menuName.toString().trim() === '') continue;
          if (menuName.toString().toLowerCase().includes('total')) continue;

          // GAP-FIX 2026-07: kategori filter sekarang mengikuti pilihan user
          // (Minuman / Makanan / Keduanya) alih-alih hardcode ke MINUMAN saja.
          // Kalau categoryFilter === 'BOTH', tidak ada baris yang dibuang di sini
          // sama sekali (baik MINUMAN maupun MAKANAN ikut masuk).
          if (colMap.category !== undefined && categoryFilter !== 'BOTH') {
            const catVal = (row[colMap.category] || '').toString().trim().toLowerCase();
            const wanted = categoryFilter.toLowerCase();
            if (catVal && catVal !== wanted) {
              skippedNonBeverage++;
              continue;
            }
          }

          const rawQty = row[colMap.qty];
          const qty = parseFloat(rawQty) || 0;
          // FIX: qty negatif (void/refund/cancel) SEBELUMNYA DIBUANG (qty <= 0 di-skip
          // semua). Void seharusnya tetap dihitung sbg pengurang usage teoritis, bukan
          // menghilang begitu saja (lihat edge case "Sales minus / Void" di dokumen
          // reverse-engineering §K). qty === 0 tetap di-skip krn tidak ada efek apapun.
          if (qty === 0) continue;

          const rawTotal = row[colMap.total];
          const total = parseFloat(rawTotal) || 0;
          
          let dateStr = defaultDateStr;
          if (colMap.date !== undefined && row[colMap.date]) {
            dateStr = parseExcelDate(row[colMap.date]);
          }

          salesRows.push({
            branch: detectedBranch || 'UNKNOWN BRANCH',
            sales_date: dateStr,
            menu_name: menuName.toString().trim(),
            menu_code: '-',
            qty: qty,
            is_void: qty < 0,
            total_sales: total
          });

          totalQty += qty;
          totalRevenue += total;
        }

        if (salesRows.length === 0) {
          throw new Error(`Tidak ada baris penjualan yang valid ditemukan (setelah filter kategori ${categoryFilter === 'BOTH' ? 'Minuman + Makanan' : categoryFilter}). Cek apakah file ini berisi data dengan kategori tersebut.`);
        }

        // --- Validasi Branch/Company vs tenant aktif ---
        // Kasus nyata yang jadi alasan pengecekan ini: file "Daily Sales Menu Report
        // Juni 2026" ternyata dari branch "Kasuna by Umatis" / "PT. Puri Asta Rasa",
        // sedangkan tenant aktif adalah "UMATIS RESTO & VENUE" / "PT. Asta Boga
        // Nusantara". BUG-FIX 2026-07: ini SEBELUMNYA melempar Error dan memblokir
        // upload sepenuhnya. Dikonfirmasi ke pemilik tenant: "Kasuna by Umatis" adalah
        // nama yang sama, hanya ditarik dari device/admin POS yang berbeda — bukan
        // outlet/tenant yang benar-benar terpisah. Jadi sekarang ini HANYA sebuah
        // peringatan non-blocking (banner info), datanya tetap digabung ke laporan
        // tenant aktif seperti yang diminta, bukan lagi ditolak.
        //
        // GAP-FIX 2026-07: now calls the shared validateBranchMatch() from
        // validationService.js instead of re-implementing the same comparison inline
        // — that file existed with this exact rule already written but nothing ever
        // called it.
        const expectedBranch = currentTenant?.branch_name || currentTenant?.name;
        const branchCheck = validateBranchMatch({ detectedBranch, detectedCompany, expectedBranch });
        // Regardless of level (validateBranchMatch returns 'error' for a mismatch by
        // default), treat it as informational only here — never block the upload.
        const branchMismatchNote = branchCheck.code === 'BRANCH_MISMATCH'
          ? `${branchCheck.message} Data tetap digabungkan ke laporan tenant ini (sesuai kebijakan yang sudah dikonfirmasi).`
          : null;

        // --- Check Duplicates ---
        const { isDuplicate, message } = await api.checkPosSalesDuplicate(periodMonth, periodYear);
        if (isDuplicate) {
          setDuplicateInfo({ sales: salesRows, filename: excelFile.name, branchName: detectedBranch, companyName: detectedCompany, totalQty, totalRevenue, periodMonth, periodYear, periodStr: `${periodMonth}/${periodYear}` });
          setUploadStatus({ type: 'warning', message });
          setLoading(false);
          return;
        }

        if (skippedNonBeverage > 0) {
          console.log(`Filter kategori (${categoryFilter}): ${skippedNonBeverage} baris di luar kategori dilewati.`);
        }

        setParsedData({
          sales: salesRows,
          filename: excelFile.name,
          branchName: detectedBranch,
          companyName: detectedCompany,
          branchMismatchNote,
          categoryFilter,
          skippedNonBeverage,
          totalQty,
          totalRevenue,
          periodMonth,
          periodYear,
          periodStr: `${periodMonth}/${periodYear}`
        });

        setUploadStatus(branchMismatchNote
          ? { type: 'warning', message: `AI Berhasil mengekstrak ${salesRows.length} data (${periodMonth}/${periodYear}). ${branchMismatchNote}` }
          : { type: 'success', message: `AI Berhasil mengekstrak ${salesRows.length} data (${periodMonth}/${periodYear}).` }
        );

      } catch (err) {
        console.error(err);
        setUploadStatus({ type: 'error', message: err.message });
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setUploadStatus({ type: 'error', message: 'Gagal membaca file lokal.' });
      setLoading(false);
    };
    reader.readAsArrayBuffer(excelFile);
  };

  const handleCommitSales = async () => {
    const confetti = await getConfetti();
    setLoading(true);
    setUploadStatus(null);
    try {
      const validSales = mappedSales.filter(s => s.isMapped);
      if (validSales.length === 0) {
        throw new Error("Tidak ada data POS yang valid untuk diproses (0 mapped items).");
      }
      
      const payload = validSales.map(s => ({
        salesDate: s.salesDate,
        recipe_id: s.recipe_id,
        qty: s.qty,
        price: s.price,
        total: s.total
      }));

      await onProcessPosSales(payload, { 
        filename: parsedData.filename, 
        mode: parsedData.uploadMode || 'append',
        periodMonth: parsedData.periodMonth,
        periodYear: parsedData.periodYear,
        branchName: parsedData.branchName,
        companyName: parsedData.companyName,
        branchMismatch: !!parsedData.branchMismatchNote,
        categoryFilter: parsedData.categoryFilter,
        totalRows: parsedData.sales?.length || 0
      });
      await confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      setRawFile(null);
      setParsedData(null);
      setUploadStatus(null);
    } catch (err) {
      console.error("[PosUpload] handleCommitSales error:", err);
      setUploadStatus({ type: 'error', message: err.message || 'Terjadi kesalahan saat menyimpan data.' });
    } finally {
      setLoading(false);
    }
  };




  const unmappedItems = mappedSales.filter(s => !s.isMapped);
  const unmappedUniqueNames = [...new Set(unmappedItems.map(s => s.menuName))];

  return (
    <div className="fade-in">
      {/* POS Template Configuration Dropdown */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px', 
        background: 'rgba(30, 41, 59, 0.35)', 
        border: '1px solid var(--border)', 
        padding: '16px 24px', 
        borderRadius: 'var(--radius-lg)',
        backdropFilter: 'blur(10px)',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <Settings size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Sistem Kasir POS Aktif</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: 0, width: '100%', maxWidth: '340px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Pilih format pembacaan kasir:</span>
          <select 
            value={selectedTemplateId} 
            onChange={(e) => handleTemplateChange(e.target.value)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.825rem',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
              flex: '1',
              minWidth: 0,
              maxWidth: '100%'
            }}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.display_name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Kategori yang diproses:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            disabled={loading || !!parsedData}
            title={parsedData ? 'Reset upload (batal) untuk mengganti filter kategori' : 'Pilih kategori baris yang mau diproses dari file POS'}
            style={{
              padding: '8px 14px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: '0.825rem',
              fontWeight: '600',
              outline: 'none',
              cursor: parsedData ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="MINUMAN">Minuman saja</option>
            <option value="MAKANAN">Makanan saja</option>
            <option value="BOTH">Makanan + Minuman</option>
          </select>
        </div>
      </div>

      {/* Upload Status Alert */}
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

      {/* Duplicate Confirmation */}
      {duplicateInfo && (
        <div style={{
          padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px',
          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
          display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div>
            <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--warning)', marginBottom: '4px' }}>Data POS Terdeteksi (Periode {duplicateInfo.periodStr})</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Sistem mendeteksi bahwa sudah ada data POS untuk bulan ini. Jika ini adalah kelanjutan data (misal Upload Mingguan), pilih "Tambahkan". Jika Anda merevisi dan ingin mengulang data dari awal, pilih "Hapus & Timpa Baru".
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => { setDuplicateInfo(null); setUploadStatus(null); }}>Batal</button>
            <button className="btn btn-primary" onClick={() => {
              setParsedData({
                ...duplicateInfo,
                uploadMode: 'append'
              });
              setDuplicateInfo(null);
              setUploadStatus(null);
            }}>Tambahkan (Upload Mingguan)</button>
            <button className="btn btn-warning" onClick={() => {
              setParsedData({
                ...duplicateInfo,
                uploadMode: 'overwrite'
              });
              setDuplicateInfo(null);
              setUploadStatus(null);
            }}>Hapus & Timpa Baru</button>
          </div>
        </div>
      )}

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
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '20px', borderRadius: 'var(--radius-lg)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>File Uploaded</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{parsedData.filename}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                <MapPin size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Branch Location</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{parsedData.branchName || 'Tidak terdeteksi'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '160px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.1)', color: 'var(--warning)' }}>
                <Calendar size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Period Span</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{parsedData.periodStr}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '160px' }}>
              <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
                <Database size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total POS Records</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{parsedData.totalQty} Rows</div>
              </div>
            </div>
          </div>

          {/* Alert for unmapped items */}
          {unmappedUniqueNames.length > 0 && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.15)',
              padding: '16px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '24px',
              display: 'flex', gap: '16px'
            }}>
              <ShieldAlert size={28} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--danger)', marginBottom: '4px' }}>
                  Perhatian: {unmappedUniqueNames.length} Menu POS Belum Terpetakan
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                  Menu-menu di bawah ini tidak memiliki resep di dalam sistem. Anda dapat memetakan menu tersebut secara manual, atau **melanjutkan proses (klik tombol proses kuning di kanan bawah) untuk memproses pengurangan stok menu yang sudah terpetakan saja dan mengabaikan menu lainnya**.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '120px', overflowY: 'auto', padding: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                  {unmappedUniqueNames.map(name => (
                    <button 
                      key={name}
                      onClick={() => openMappingModal(name)}
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', gap: '6px', alignItems: 'center', borderColor: 'rgba(239,68,68,0.2)' }}
                    >
                      <Settings size={12} style={{ color: 'var(--danger)' }} /> Bind: "{name}"
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '12px' }}>
                  <button 
                    className="btn btn-primary"
                    onClick={() => openBulkModal(unmappedItems.filter((v,i,a)=>a.findIndex(t=>(t.menuName === v.menuName))===i))}
                    style={{ fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}
                  >
                    <Sparkles size={14} /> Buat Massal Resep Baru (0 HPP)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {unmappedUniqueNames.length === 0 && (
            <div style={{ 
              background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)',
              padding: '16px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '24px',
              display: 'flex', alignItems: 'center', gap: '16px'
            }}>
              <CheckCircle size={28} style={{ color: 'var(--success)', flexShrink: 0 }} />
              <div>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  Mapping Validation Passed!
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                  All {mappedSales.length} POS sales rows successfully matched their respective recipes. You are ready to process deductions.
                </p>
              </div>
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>POS Spreadsheet Rows Preview</h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => {
                setRawFile(null);
                setParsedData(null);
                setUploadStatus(null);
              }}>
                Cancel Upload
              </button>
              
              <button 
                onClick={handleCommitSales}
                disabled={loading}
                className={unmappedUniqueNames.length === 0 ? "btn btn-success" : "btn btn-warning"}
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <Sparkles size={16} /> 
                {loading 
                  ? "Deducting Stock..." 
                  : unmappedUniqueNames.length === 0 
                    ? "Process Stock Deductions" 
                    : `Process (${mappedSales.length - unmappedItems.length} Mapped / Skip ${unmappedUniqueNames.length} Unmapped)`
                }
              </button>
            </div>
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
                      {sale.qty > 0 ? formatIDR(sale.total / sale.qty) : '-'}
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
        <div className="modal-overlay" style={{ 
          position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-card modal-card" style={{ width: '450px', maxWidth: 'calc(100vw - 32px)', padding: '28px', border: '1px solid var(--border-focus)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Bind POS Menu to Recipe</h3>
              <button className="btn btn-secondary" style={{ padding: '4px', borderRadius: '50%' }} onClick={() => setShowMappingModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleMapSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unmapped POS Name</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: '2px' }}>"{mappingMenuName}"</div>
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

      {/* Bulk Auto-Create Modal */}
      {showBulkModal && (
        <div className="modal-overlay" style={{ 
          position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '28px', border: '1px solid var(--border-focus)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Buat Resep Baru secara Massal</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pilih menu POS yang ingin didaftarkan otomatis sebagai Master Resep (0 HPP).</p>
              </div>
              <button className="btn btn-secondary" style={{ padding: '4px', borderRadius: '50%' }} onClick={() => setShowBulkModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
              <div className="table-container" style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
                <table className="custom-table" style={{ margin: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-tertiary)' }}>
                    <tr>
                      <th style={{ width: '40px', textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={Object.values(bulkSelection).every(v => v.selected)}
                          onChange={e => {
                            const val = e.target.checked;
                            setBulkSelection(prev => {
                              const next = { ...prev };
                              Object.keys(next).forEach(k => next[k].selected = val);
                              return next;
                            });
                          }}
                        />
                      </th>
                      <th>Nama Menu (POS)</th>
                      <th>Kode POS</th>
                      <th>Kategori</th>
                      <th style={{ textAlign: 'right' }}>Harga Jual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(bulkSelection).map(([name, data]) => (
                      <tr key={name}>
                        <td style={{ textAlign: 'center' }}>
                          <input 
                            type="checkbox"
                            checked={data.selected}
                            onChange={e => setBulkSelection(prev => ({
                              ...prev, [name]: { ...prev[name], selected: e.target.checked }
                            }))}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>{name}</td>
                        <td>
                          <input 
                            type="text"
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'transparent' }}
                            value={data.posCode}
                            onChange={e => setBulkSelection(prev => ({
                              ...prev, [name]: { ...prev[name], posCode: e.target.value }
                            }))}
                            placeholder="Kode POS (Opsional)"
                          />
                        </td>
                        <td>
                          <select 
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'transparent' }}
                            value={data.category}
                            onChange={e => setBulkSelection(prev => ({
                              ...prev, [name]: { ...prev[name], category: e.target.value }
                            }))}
                          >
                            <option value="NON-KOPI">NON-KOPI</option>
                            <option value="KOPI">KOPI</option>
                            <option value="MOCKTAIL">MOCKTAIL</option>
                            <option value="JUICE">JUICE</option>
                            <option value="TEA">TEA</option>
                            <option value="BEER">BEER</option>
                          </select>
                        </td>
                        <td>
                          <input 
                            type="number"
                            className="form-control"
                            style={{ padding: '4px 8px', fontSize: '0.8rem', textAlign: 'right', background: 'transparent' }}
                            value={data.price}
                            onChange={e => setBulkSelection(prev => ({
                              ...prev, [name]: { ...prev[name], price: e.target.value }
                            }))}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total terpilih: <strong style={{ color: 'var(--text-primary)' }}>{Object.values(bulkSelection).filter(v => v.selected).length}</strong> menu.
                </span>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)} disabled={loading}>Batal</button>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? "Memproses..." : "Buat Resep Baru"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}