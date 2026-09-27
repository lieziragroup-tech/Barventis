import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Calendar,
  FileText,
  PlusCircle,
  Save,
  Loader2,
  Lock,
  Info,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Layers,
  HelpCircle,
  Search
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { offlineInventoryCache } from '../../services/offlineInventoryCache';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import PrintReportFooter from '../../components/shared/PrintReportFooter';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';

export default function DailyInventory({ category = 'ALL', initialTab, externalTab, onTabChange }) {
  const { activeUser } = useAuth();
  const [internalTab, setInternalTab] = useState(initialTab || 'REKAP');
  const activeTab = externalTab !== undefined ? externalTab : internalTab;
  const setActiveTab = (tab) => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // REKAP state
  const [records, setRecords] = useState([]);

  // EOD state
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});

  // Filter & Search state (allowing unified Beverage & Beer viewing)
  const [filterCat, setFilterCat] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tenantId = await api.getActiveTenantId();
      if (!tenantId) {
        setRecords([]);
        setIsLocked(false);
        return;
      }

      // Fetch header for date
      const { data: headers, error: headerErr } = await supabase
        .from('daily_inventories')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', date);

      if (headerErr) throw headerErr;

      const locked = (headers || []).some(h => h.status === 'verified' || h.status === 'closed');
      setIsLocked(locked);

      if (!headers || headers.length === 0) {
        setRecords([]);
        return;
      }

      const headerIds = headers.map(h => h.id);

      // Fetch items for these headers and materials in parallel
      const [{ data: itemRows, error: itemsErr }, materialsList] = await Promise.all([
        supabase
          .from('daily_inventory_items')
          .select('*')
          .in('inventory_id', headerIds),
        api.getMaterials().catch(() => [])
      ]);

      if (itemsErr) throw itemsErr;

      const materialsById = Object.fromEntries(
        (materialsList || []).map(m => [m.id, m])
      );

      // Map to records format expected by the view
      const mapped = (itemRows || []).map(r => {
        const mat = materialsById[r.material_id] || null;
        const full = Number(r.full_qty) || 0;
        const broken = Number(r.broken_qty) || 0;
        const stokAkhir = Number(r.closing_qty) || (full + broken);
        const stokAwal = Number(r.prev_full_qty) || 0;
        const inQty = Number(r.in_qty) || 0;
        const outQty = Number(r.out_qty) || 0;
        const waste = Number(r.waste_qty) || 0;
        const terpakai = r.terpakai_qty !== null && r.terpakai_qty !== undefined
          ? Number(r.terpakai_qty)
          : (outQty + waste);
        const unitPrice = Number(mat?.price) || 0;
        const nilaiRupiah = terpakai * unitPrice;

        return {
          id: r.id,
          material_id: r.material_id,
          materials: mat,
          stok_awal: stokAwal,
          qty_in: inQty,
          qty_out: outQty,
          waste: waste,
          full_qty: full,
          broken: broken,
          stok_akhir: stokAkhir,
          qty_terpakai: terpakai,
          nilai_rupiah: nilaiRupiah
        };
      });

      // Filter by category prop when provided (BEER vs BAHAN vs ALL)
      const filtered = (category && category !== 'ALL')
        ? mapped.filter(r => {
            const cat = (r.materials?.category || '').toUpperCase();
            return category === 'BEER' ? cat === 'BEER' : cat !== 'BEER' && cat !== 'ASSET';
          })
        : mapped.filter(r => {
            const cat = (r.materials?.category || '').toUpperCase();
            return cat !== 'ASSET';
          });
      setRecords(filtered);
      if (tenantId) {
        offlineInventoryCache.saveDailyInventory(tenantId, date, category, {
          records: filtered,
          isLocked: locked
        });
      }
    } catch (err) {
      console.warn('[DailyInventory] Failed to fetch live records, checking offline cache:', err);
      try {
        const tenantId = await api.getActiveTenantId();
        const cached = await offlineInventoryCache.getDailyInventory(tenantId, date, category);
        if (cached?.records && cached.records.length > 0) {
          setRecords(cached.records);
          setIsLocked(!!cached.isLocked);
          setError('Mode Offline Aktif: Menampilkan data inventaris yang tersimpan.');
          return;
        }
      } catch {
        // Fall through to error
      }
      setError(err.message || 'Gagal memuat rekap harian');
    } finally {
      setLoading(false);
    }
  }, [date, category]);

  const fetchEodData = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const tenantId = await api.getActiveTenantId();
      if (!tenantId) {
        setItems([]);
        setInventory({});
        setIsLocked(false);
        return;
      }

      // 1. Fetch materials (bar/resto inventory items)
      let materialsList = await api.getMaterials();
      // Filter by category prop when provided (BEER vs BAHAN vs ALL)
      if (category && category !== 'ALL') {
        materialsList = (materialsList || []).filter(m => {
          const cat = (m.category || '').toUpperCase();
          return category === 'BEER' ? cat === 'BEER' : cat !== 'BEER' && cat !== 'ASSET';
        });
      } else {
        materialsList = (materialsList || []).filter(m => {
          const cat = (m.category || '').toUpperCase();
          return cat !== 'ASSET';
        });
      }
      setItems(materialsList || []);

      // 2. Fetch existing daily inventory header for date
      const { data: header, error: headerErr } = await supabase
        .from('daily_inventories')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('date', date)
        .maybeSingle();

      if (headerErr) throw headerErr;

      const locked = header ? (header.status === 'verified' || header.status === 'closed') : false;
      setIsLocked(locked);

      const invMap = {};
      if (header) {
        const { data: itemRows, error: itemsErr } = await supabase
          .from('daily_inventory_items')
          .select('*')
          .eq('inventory_id', header.id);

        if (itemsErr) throw itemsErr;

        (itemRows || []).forEach(row => {
          invMap[row.material_id] = {
            stok_awal: row.prev_full_qty,
            qty_in: row.in_qty,
            qty_out: row.out_qty,
            waste: row.waste_qty,
            broken: row.broken_qty,
            full_qty: row.full_qty
          };
        });
      }

      setInventory(invMap);
    } catch (err) {
      setError(err.message || 'Gagal memuat form EOD');
    } finally {
      setLoading(false);
    }
  }, [date, category]);

  useEffect(() => {
    if (activeTab === 'REKAP') {
       
      fetchRecords();
    } else {
      fetchEodData();
    }
  }, [activeTab, fetchRecords, fetchEodData]);

  const displayedRecords = useMemo(() => {
    return records.filter(r => {
      const cat = (r.materials?.category || '').toUpperCase();
      if (filterCat === 'BEER' && cat !== 'BEER') return false;
      if (filterCat === 'BAHAN' && cat === 'BEER') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (r.materials?.name || '').toLowerCase();
        return name.includes(q);
      }
      return true;
    });
  }, [records, filterCat, searchQuery]);

  const displayedItems = useMemo(() => {
    return items.filter(m => {
      const cat = (m.category || '').toUpperCase();
      if (filterCat === 'BEER' && cat !== 'BEER') return false;
      if (filterCat === 'BAHAN' && cat === 'BEER') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (m.name || '').toLowerCase();
        return name.includes(q);
      }
      return true;
    });
  }, [items, filterCat, searchQuery]);

  const handleChange = (itemId, field, value) => {
    if (isLocked) return;
    setInventory(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { stok_awal: 0, qty_in: 0, qty_out: 0, waste: 0, broken: 0, full_qty: 0 }),
        [field]: value === '' ? '' : parseFloat(value) || 0
      }
    }));
  };

  const handleKeyDown = (e, rowIndex, colIndex) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = document.querySelector(`input[data-row="${rowIndex + 1}"][data-col="${colIndex}"]`);
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = document.querySelector(`input[data-row="${rowIndex - 1}"][data-col="${colIndex}"]`);
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      let nextCol = colIndex + direction;
      let nextRow = rowIndex;
      
      // If we go past the last column, wrap to next row
      if (nextCol > 6) {
        nextCol = 1;
        nextRow++;
      } else if (nextCol < 1) {
        nextCol = 6;
        nextRow--;
      }

      const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  };

  const performSave = async (isClosing = false) => {
    const tenantId = await api.getActiveTenantId();
    if (!tenantId) throw new Error('Sesi tenant tidak valid. Silakan login ulang.');

    // 1. Find or create daily_inventories header
    let { data: header, error: headerErr } = await supabase
      .from('daily_inventories')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('date', date)
      .maybeSingle();

    if (headerErr) throw headerErr;

    if (!header) {
      const { data: newHeader, error: createHeaderErr } = await supabase
        .from('daily_inventories')
        .insert({
          tenant_id: tenantId,
          date: date,
          status: isClosing ? 'verified' : 'draft',
          checked_by: activeUser?.id || null,
          location: 'RESTO',
          verified_by: isClosing ? (activeUser?.id || null) : null
        })
        .select()
        .single();

      if (createHeaderErr) throw createHeaderErr;
      header = newHeader;
    } else if (isClosing) {
      const { error: updateHeaderErr } = await supabase
        .from('daily_inventories')
        .update({
          status: 'verified',
          verified_by: activeUser?.id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', header.id);

      if (updateHeaderErr) throw updateHeaderErr;
    }

    // 2. Prepare items for daily_inventory_items
    const itemsToInsert = items.map(item => {
      const row = inventory[item.id] || {};
      const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(item.qty_resto ?? item.stock) || 0);
      const qtyIn = Number(row.qty_in) || 0;
      const qtyOut = Number(row.qty_out) || 0;
      const waste = Number(row.waste) || 0;
      const fullQty = Number(row.full_qty) || 0;
      const broken = Number(row.broken) || 0;

      const stokAkhir = fullQty + broken;
      const qtyTerpakai = qtyOut + waste; // or (stokAwal + qtyIn) - stokAkhir

      return {
        inventory_id: header.id,
        material_id: item.id,
        tenant_id: tenantId,
        prev_full_qty: stokAwal,
        in_qty: qtyIn,
        out_qty: qtyOut,
        waste_qty: waste,
        broken_qty: broken,
        full_qty: fullQty,
        closing_qty: stokAkhir,
        terpakai_qty: qtyTerpakai
      };
    });

    if (itemsToInsert.length === 0) return;

    // Delete existing rows for this inventory_id to prevent duplicates, then insert fresh
    const { error: delErr } = await supabase
      .from('daily_inventory_items')
      .delete()
      .eq('inventory_id', header.id);

    if (delErr) throw delErr;

    const { error: insertErr } = await supabase
      .from('daily_inventory_items')
      .insert(itemsToInsert);

    if (insertErr) throw insertErr;
  };

  const handleSave = async () => {
    if (isLocked) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await performSave(false);
      setSuccess('Berhasil menyimpan draft stok harian.');
    } catch (err) {
      setError(err.message || 'Gagal menyimpan draft.');
    } finally {
      setSaving(false);
    }
  };

  const submitEODSettlement = async () => {
    if (isLocked) return;
    const confirm = window.confirm(
      "Apakah Anda yakin ingin melakukan Closing EOD? Data per 23:59:59 akan dikunci."
    );
    if (!confirm) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await performSave(true);
      setIsLocked(true);
      setSuccess('Closing EOD berhasil disimpan dan dikunci.');
    } catch (err) {
      setError("Gagal closing EOD: " + (err.message || 'Terjadi kesalahan'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      let rows = [];
      if (activeTab === 'REKAP') {
        if (!records || records.length === 0) {
          alert('Tidak ada data rekap untuk tanggal yang dipilih.');
          return;
        }
        rows = records.map((row, idx) => ({
          'NO': idx + 1,
          'NAMA BARANG': row.materials?.name || 'Item Terhapus',
          'SATUAN': row.materials?.unit || 'unit',
          'HARGA SATUAN (RP)': Number(row.materials?.price) || 0,
          'STOK AWAL': row.stok_awal ?? 0,
          'MASUK (IN)': row.qty_in ?? 0,
          'KELUAR (OUT)': row.qty_out ?? 0,
          'WASTE / RUSAK': row.waste ?? 0,
          'FISIK FULL': row.full_qty ?? 0,
          'FISIK BROKEN': row.broken ?? 0,
          'STOK AKHIR': row.stok_akhir ?? 0,
          'QTY TERPAKAI': row.qty_terpakai ?? 0,
          'NILAI PEMAKAIAN (RP)': Number(row.nilai_rupiah) || 0
        }));
      } else {
        if (!items || items.length === 0) {
          alert('Tidak ada data item untuk diekspor.');
          return;
        }
        rows = items.map((item, idx) => {
          const row = inventory[item.id] || {};
          const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(item.qty_resto ?? item.stock) || 0);
          const qtyIn = Number(row.qty_in) || 0;
          const qtyOut = Number(row.qty_out) || 0;
          const waste = Number(row.waste) || 0;
          const fullQty = Number(row.full_qty) || 0;
          const broken = Number(row.broken) || 0;
          const stokAkhir = fullQty + broken;
          const qtyTerpakai = (stokAwal + qtyIn) - (stokAkhir + waste);
          const unitPrice = Number(item.price) || 0;
          const nilaiRupiah = qtyTerpakai * unitPrice;

          return {
            'NO': idx + 1,
            'NAMA BARANG': item.name,
            'SATUAN': item.unit || 'unit',
            'HARGA SATUAN (RP)': unitPrice,
            'STOK AWAL': stokAwal,
            'MASUK (IN)': qtyIn,
            'KELUAR (OUT)': qtyOut,
            'WASTE / RUSAK': waste,
            'FISIK FULL': fullQty,
            'FISIK BROKEN': broken,
            'STOK AKHIR': stokAkhir,
            'QTY TERPAKAI': qtyTerpakai,
            'NILAI PEMAKAIAN (RP)': nilaiRupiah
          };
        });
      }

      await exportWithAudit({
        format: 'excel',
        filename: `Inventaris_Harian_${activeTab}_${date}`,
        sheets: [{ name: `Inventaris ${date}`, rows }],
        actionName: `Daily Inventory Export Excel (${activeTab})`,
        role: activeUser?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error('Export Excel failed:', err);
      alert('Gagal mengekspor data: ' + err.message);
    }
  };

  const handleExportPDF = async () => {
    try {
      let rows = [];
      const columns = [
        { key: 'no', label: '#' },
        { key: 'name', label: 'Nama Barang' },
        { key: 'stok_awal', label: 'Stok Awal' },
        { key: 'in', label: 'IN' },
        { key: 'out', label: 'OUT' },
        { key: 'waste', label: 'Waste' },
        { key: 'full', label: 'Full' },
        { key: 'broken', label: 'Broken' },
        { key: 'stok_akhir', label: 'Stok Akhir' },
        { key: 'terpakai', label: 'Terpakai' },
        { key: 'nilai', label: 'Nilai (Rp)' }
      ];

      if (activeTab === 'REKAP') {
        if (!records || records.length === 0) {
          alert('Tidak ada data rekap untuk tanggal yang dipilih.');
          return;
        }
        rows = records.map((row, idx) => ({
          no: idx + 1,
          name: `${row.materials?.name || 'Item Terhapus'} (${row.materials?.unit || 'unit'})`,
          stok_awal: row.stok_awal ?? 0,
          in: row.qty_in ?? 0,
          out: row.qty_out ?? 0,
          waste: row.waste ?? 0,
          full: row.full_qty ?? 0,
          broken: row.broken ?? 0,
          stok_akhir: row.stok_akhir ?? 0,
          terpakai: row.qty_terpakai ?? 0,
          nilai: `Rp ${Number(row.nilai_rupiah || 0).toLocaleString('id-ID')}`
        }));
      } else {
        if (!items || items.length === 0) {
          alert('Tidak ada data item untuk diekspor.');
          return;
        }
        rows = items.map((item, idx) => {
          const row = inventory[item.id] || {};
          const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(item.qty_resto ?? item.stock) || 0);
          const qtyIn = Number(row.qty_in) || 0;
          const qtyOut = Number(row.qty_out) || 0;
          const waste = Number(row.waste) || 0;
          const fullQty = Number(row.full_qty) || 0;
          const broken = Number(row.broken) || 0;
          const stokAkhir = fullQty + broken;
          const qtyTerpakai = (stokAwal + qtyIn) - (stokAkhir + waste);
          const unitPrice = Number(item.price) || 0;
          const nilaiRupiah = qtyTerpakai * unitPrice;

          return {
            no: idx + 1,
            name: `${item.name} (${item.unit || 'unit'})`,
            stok_awal: stokAwal,
            in: qtyIn,
            out: qtyOut,
            waste: waste,
            full: fullQty,
            broken: broken,
            stok_akhir: stokAkhir,
            terpakai: qtyTerpakai,
            nilai: `Rp ${nilaiRupiah.toLocaleString('id-ID')}`
          };
        });
      }

      const modeTitle = activeTab === 'REKAP' ? 'Rekap Historis EOD' : 'Form EOD Berjalan';
      await exportWithAudit({
        format: 'pdf',
        filename: `Inventaris_Harian_${activeTab}_${date}`,
        title: `Laporan Inventaris Harian — Tanggal: ${date} (${modeTitle})`,
        tenantName: 'BARVENTIS - Sistem Manajemen Gudang',
        columns,
        rows,
        actionName: `Daily Inventory Export PDF (${activeTab})`,
        role: activeUser?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error('Export PDF failed:', err);
      alert('Gagal mengekspor PDF: ' + err.message);
    }
  };

  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="fade-in space-y-3.5">
      {/* Header with Distinct Labeled Submenu */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border)]/70 no-print">
        {/* Left: Main Header Title & Badges */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 shadow-xs">
            <ClipboardList size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
                {category === 'BEER' ? 'Daily Inventory Beer' : category === 'BAHAN' ? 'Daily Inventory Bahan' : 'Daily Inventory (Bahan & Beer)'}
              </h1>
              {isLocked && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/30">
                  <Lock size={10} /> Terkunci (Closed)
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] m-0 mt-0.5">
              {category === 'BEER'
                ? 'Pengawasan stok fisik botol bir & cider harian'
                : category === 'BAHAN'
                ? 'Kontrol stok fisik bahan baku bar & resto harian'
                : 'Kontrol stok fisik bahan baku bar, sirup, premix, bir & cider harian'}
            </p>
          </div>
        </div>

        {/* Right: Distinct Sub-menu with Label Background */}
        <div className="flex items-center gap-2 bg-[var(--bg-secondary)]/80 p-1.5 rounded-xl border border-[var(--border)] shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] px-1.5 flex items-center gap-1">
            <Layers size={11} className="text-[var(--accent)]" />
            Mode:
          </span>

          {/* Segmented Switcher */}
          <div className="inline-flex p-0.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs shadow-2xs">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'REKAP'
                  ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('REKAP')}
            >
              <FileText size={13} />
              <span>Rekap</span>
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'EOD'
                  ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('EOD')}
            >
              <PlusCircle size={13} />
              <span>Input EOD</span>
            </button>
          </div>

          {/* Collapsible Info Guide Toggle */}
          <button
            type="button"
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all ${
              showGuide
                ? 'bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]'
            }`}
            onClick={() => setShowGuide(!showGuide)}
            title={showGuide ? "Tutup panduan" : "Buka panduan mode"}
          >
            <Info size={14} />
            <span className="hidden sm:inline text-[11px] font-medium">{showGuide ? 'Tutup' : 'Panduan'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Info Banner: Only shown when toggled */}
      {showGuide && (
        <div
          className="rounded-xl border p-3 text-xs transition-all no-print animate-in fade-in duration-200"
          style={{
            background: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            borderColor: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(245, 158, 11, 0.25)',
            color: 'var(--text-primary)'
          }}
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <div
                className="p-1.5 rounded-lg shrink-0 mt-0.5"
                style={{
                  background: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: activeTab === 'REKAP' ? '#2563eb' : '#d97706'
                }}
              >
                <Info size={15} />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-xs m-0" style={{ color: activeTab === 'REKAP' ? '#2563eb' : '#d97706' }}>
                  {activeTab === 'REKAP' ? '📊 Panduan: Rekap Harian (Monitoring & Audit)' : '📝 Panduan: Form Input EOD (End of Day Closing)'}
                </h4>
                <p className="text-[11px] leading-relaxed m-0 text-[var(--text-secondary)]">
                  {activeTab === 'REKAP'
                    ? 'Rekap Harian berfungsi untuk meninjau hasil kalkulasi pergerakan stok (Stok Awal, In, Out, Waste, Full/Broken) dan nilai HPP untuk audit.'
                    : 'Form Input EOD adalah lembar kerja closing shift untuk menginput sisa botol utuh (Full), terbuka (Broken), dan terbuang (Waste).'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 shrink-0"
              title="Tutup panduan"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="glass-card p-3 sm:p-4 md:p-5" style={{ marginBottom: '16px' }}>
        {/* Print-only Document Header */}
        <div className="print-only print-header">
          <div className="print-header-brand">BARVENTIS — SISTEM MANAJEMEN GUDANG</div>
          <div style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>
            {activeTab === 'REKAP' ? 'Laporan Rekapitulasi Inventaris Harian' : 'Lembar Kerja Input EOD (End of Day)'}
          </div>
          <div className="print-header-meta">
            Tanggal: {date} | Status: {isLocked ? 'Terkunci (EOD Closed)' : 'Draft / Terbuka'} | Tanggal Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
          </div>
        </div>

        {/* Integrated Minimalist Toolbar with Zero Dead Whitespace */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 pb-3 border-b border-[var(--border)]/60">
          {/* Left: Date controls with quick stepper buttons */}
          <div className="flex items-center justify-between sm:justify-start gap-1.5 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
              <span className="text-xs font-bold text-[var(--text-secondary)] whitespace-nowrap mr-0.5">Tanggal:</span>
              <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/50 p-0.5 shadow-2xs flex-1 sm:flex-initial justify-between">
                <button
                  type="button"
                  className="p-1 hover:bg-[var(--bg-card)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                  onClick={handlePrevDay}
                  title="Hari sebelumnya"
                >
                  <ChevronLeft size={15} />
                </button>
                <input
                  type="date"
                  className="bg-transparent border-0 text-xs font-semibold text-[var(--text-primary)] px-1 sm:px-2 py-1 focus:outline-none cursor-pointer text-center sm:text-left flex-1"
                  style={{ height: '28px', minWidth: '105px' }}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                />
                <button
                  type="button"
                  className="p-1 hover:bg-[var(--bg-card)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                  onClick={handleNextDay}
                  title="Hari berikutnya"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <button
              type="button"
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shadow-2xs whitespace-nowrap shrink-0"
              style={{ height: '32px' }}
              onClick={handleToday}
            >
              Hari Ini
            </button>
          </div>

          {/* Center Info Badge: Eliminates empty gap and provides key context */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)]/60 border border-[var(--border)]/60 text-xs text-[var(--text-secondary)] shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${isLocked ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`} />
            <span className="font-semibold text-[var(--text-primary)]">
              {activeTab === 'REKAP' ? `${records.length} Bahan Terdata` : `${items.length} Bahan Siap Input`}
            </span>
            <span className="text-[var(--border)]">•</span>
            <span className="text-[11px]">
              {isLocked ? 'Status EOD: Terkunci' : 'Status EOD: Siap Closing'}
            </span>
          </div>

          {/* Right: Action Buttons Group */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto justify-end flex-wrap sm:flex-nowrap">
            <ExportButton
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              currentRole={activeUser?.role}
              disabled={loading || (activeTab === 'REKAP' ? records.length === 0 : items.length === 0)}
              className="flex-1 sm:flex-initial"
              style={{ height: '32px', padding: '0 10px', fontSize: '0.78rem', gap: '5px' }}
            />
            <PrintButton
              currentRole={activeUser?.role}
              disabled={loading || (activeTab === 'REKAP' ? records.length === 0 : items.length === 0)}
              title="Cetak lembar inventaris harian"
              className="flex-1 sm:flex-initial"
              style={{ height: '32px', padding: '0 10px', fontSize: '0.78rem', gap: '5px' }}
            />

            {activeTab === 'EOD' && !isLocked && (
              <>
                <button
                  className="btn btn-secondary text-xs"
                  style={{ height: '32px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                  onClick={handleSave}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>Simpan</span>
                </button>
                <button
                  className="btn text-xs font-bold"
                  style={{ height: '32px', padding: '0 11px', background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}
                  onClick={submitEODSettlement}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                  <span>Closing EOD</span>
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            {success}
          </div>
        )}

        {/* Category & Search Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3 no-print">
          <div className="inline-flex p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs shadow-2xs">
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${filterCat === 'ALL' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              onClick={() => setFilterCat('ALL')}
            >
              Semua ({activeTab === 'REKAP' ? records.length : items.length})
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${filterCat === 'BAHAN' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              onClick={() => setFilterCat('BAHAN')}
            >
              Bahan / Beverage
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-semibold transition-all ${filterCat === 'BEER' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs font-bold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
              onClick={() => setFilterCat('BEER')}
            >
              Beer & Cider
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              className="form-control text-xs w-full search-input-clearance"
              style={{ height: '32px', paddingLeft: '34px' }}
              placeholder="Cari bahan baku / bir..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        <div className="table-container relative" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <TableLoadingOverlay
            loading={loading && (activeTab === 'REKAP' ? records.length > 0 : items.length > 0)}
            message="Menyinkronkan data inventaris harian..."
          />
          {activeTab === 'REKAP' ? (
            <table className="custom-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Barang</th>
                  <th style={{ textAlign: 'center' }}>Stok Awal</th>
                  <th style={{ textAlign: 'center' }}>IN</th>
                  <th style={{ textAlign: 'center' }}>OUT</th>
                  <th style={{ textAlign: 'center' }}>WASTE</th>
                  <th style={{ textAlign: 'center' }}>FULL</th>
                  <th style={{ textAlign: 'center' }}>BROKEN</th>
                  <th style={{ textAlign: 'center' }}>Stok Akhir</th>
                  <th style={{ textAlign: 'center' }}>Terpakai</th>
                  <th style={{ textAlign: 'right' }}>Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 ? (
                  <TableSkeletonRows
                    rows={6}
                    columns={[
                      { width: '180px', type: 'dual-text' },
                      { width: '70px', type: 'text', align: 'center' },
                      { width: '70px', type: 'text', align: 'center' },
                      { width: '70px', type: 'text', align: 'center' },
                      { width: '70px', type: 'text', align: 'center' },
                      { width: '70px', type: 'text', align: 'center' },
                      { width: '70px', type: 'text', align: 'center' },
                      { width: '80px', type: 'text', align: 'center' },
                      { width: '80px', type: 'text', align: 'center' },
                      { width: '110px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  displayedRecords.map(row => (
                    <tr key={row.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{row.materials?.name || 'Item Terhapus'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Harga: Rp {(Number(row.materials?.price) || 0).toLocaleString('id-ID')} / {row.materials?.unit || 'unit'}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{row.stok_awal}</td>
                      <td style={{ textAlign: 'center' }}>{row.qty_in}</td>
                      <td style={{ textAlign: 'center' }}>{row.qty_out}</td>
                      <td style={{ textAlign: 'center' }}>{row.waste}</td>
                      <td style={{ textAlign: 'center' }}>{row.full_qty}</td>
                      <td style={{ textAlign: 'center' }}>{row.broken}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.stok_akhir}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: row.qty_terpakai < 0 ? '#ef4444' : 'inherit' }}>
                        {row.qty_terpakai}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && displayedRecords.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)' }}>
                      <Calendar size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                      <p style={{ fontWeight: 500, margin: 0, fontSize: '0.8rem' }}>
                        {searchQuery || filterCat !== 'ALL'
                          ? 'Tidak ada data inventaris yang cocok dengan filter / pencarian.'
                          : 'Tidak ada data rekap untuk tanggal ini.'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="custom-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Barang</th>
                  <th style={{ padding: '12px', width: '90px' }}>Stok Awal</th>
                  <th style={{ padding: '12px', width: '90px' }}>IN</th>
                  <th style={{ padding: '12px', width: '90px' }}>OUT</th>
                  <th style={{ padding: '12px', width: '130px', background: 'rgba(239,68,68,0.1)' }}>Exp. Date</th>
                  <th style={{ padding: '12px', width: '90px', background: 'rgba(239,68,68,0.05)' }}>WASTE</th>
                  <th style={{ padding: '12px', width: '90px', background: 'rgba(245,158,11,0.05)' }}>FULL</th>
                  <th style={{ padding: '12px', width: '90px', background: 'rgba(245,158,11,0.05)' }}>BROKEN</th>
                  <th style={{ padding: '12px', width: '90px', background: 'rgba(16,185,129,0.05)' }}>Stok Akhir</th>
                  <th style={{ padding: '12px', width: '90px', background: 'rgba(139,92,246,0.05)' }}>Terpakai</th>
                  <th style={{ padding: '12px', width: '120px', textAlign: 'right' }}>Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <TableSkeletonRows
                    rows={8}
                    columns={[
                      { width: '200px', type: 'dual-text' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '130px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '120px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  displayedItems.map((item, idx) => {
                    const row = inventory[item.id] || {};
                    const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(item.qty_resto ?? item.stock) || 0);
                    const qtyIn = Number(row.qty_in) || 0;
                    const waste = Number(row.waste) || 0;
                    const fullQty = Number(row.full_qty) || 0;
                    const broken = Number(row.broken) || 0;

                    const stokAkhir = fullQty + broken;
                    const qtyTerpakai = (stokAwal + qtyIn) - (stokAkhir + waste);
                    const unitPrice = Number(item.price) || 0;
                    const nilaiRupiah = qtyTerpakai * unitPrice;

                    // FEFO Expiry (H-3)
                    const expDate = row.expiry_date || item.brand || '';
                    let isExpiringSoon = false;
                    if (expDate && expDate.length > 5) { // minimal valid YYYY-MM-DD
                      const daysLeft = (new Date(expDate) - new Date()) / (1000 * 60 * 60 * 24);
                      isExpiringSoon = daysLeft <= 3 && daysLeft >= -30; // Warn if H-3 or expired (up to 30 days past)
                    }

                    return (
                      <tr key={item.id} style={{ background: isExpiringSoon ? 'rgba(239,68,68,0.1)' : 'transparent' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            Rp {unitPrice.toLocaleString('id-ID')} / {item.unit || 'unit'}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center' }} value={row.stok_awal ?? item.qty_resto ?? item.stock ?? ''} onChange={e => handleChange(item.id, 'stok_awal', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 1, 'stok_awal')} data-row={idx} data-col={1} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center' }} value={row.qty_in ?? ''} onChange={e => handleChange(item.id, 'qty_in', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 2, 'qty_in')} data-row={idx} data-col={2} />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center' }} value={row.qty_out ?? ''} onChange={e => handleChange(item.id, 'qty_out', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 3, 'qty_out')} data-row={idx} data-col={3} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(239,68,68,0.1)' }}>
                          <input type="date" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', fontSize: '0.75rem', color: isExpiringSoon ? '#dc2626' : 'inherit', fontWeight: isExpiringSoon ? 700 : 400 }} value={expDate} onChange={async (e) => {
                            handleChange(item.id, 'expiry_date', e.target.value);
                            try {
                              await api.updateMaterial(item.id, { brand: e.target.value });
                            } catch (err) { console.error('Failed to save exp date', err); }
                          }} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(239,68,68,0.05)' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center', color: '#dc2626' }} value={row.waste ?? ''} onChange={e => handleChange(item.id, 'waste', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 4, 'waste')} data-row={idx} data-col={4} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center', fontWeight: 600 }} value={row.full_qty ?? ''} onChange={e => handleChange(item.id, 'full_qty', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 5, 'full_qty')} data-row={idx} data-col={5} />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                          <input type="number" min="0" disabled={isLocked} className="form-control" style={{ width: '100%', padding: '6px', textAlign: 'center', fontWeight: 600 }} value={row.broken ?? ''} onChange={e => handleChange(item.id, 'broken', e.target.value)} onKeyDown={e => handleKeyDown(e, idx, 6, 'broken')} data-row={idx} data-col={6} />
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, background: 'rgba(16,185,129,0.05)', color: '#047857' }}>
                          {stokAkhir}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700, background: 'rgba(139,92,246,0.05)', color: qtyTerpakai < 0 ? '#ef4444' : '#6d28d9' }}>
                          {qtyTerpakai}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                          Rp {nilaiRupiah.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })
                )}
                {!loading && displayedItems.length === 0 && (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
                        <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <Package size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                          <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            {searchQuery || filterCat !== 'ALL'
                              ? 'Tidak ada bahan yang cocok dengan filter / pencarian'
                              : 'Belum Ada Master Bahan Baku'}
                          </p>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                            {searchQuery || filterCat !== 'ALL'
                              ? 'Coba ubah kata kunci pencarian atau ganti filter kategori di atas.'
                              : 'Daftar barang pada Form EOD diambil otomatis dari Master Bahan Baku (Stock Ledger). Silakan tambahkan bahan terlebih dahulu di menu Stock Ledger agar dapat dicatat stok fisiknya di sini.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          <PrintReportFooter
            title={category === 'BEER' ? 'Inventaris Harian Beer' : category === 'BAHAN' ? 'Inventaris Harian Bahan' : 'Inventaris Harian (Bahan & Beer)'}
            subtitle={`${activeTab === 'REKAP' ? 'Rekap Historis' : 'Input EOD'} • Tanggal: ${date}`}
          />
      </div>
    </div>
  );
}
