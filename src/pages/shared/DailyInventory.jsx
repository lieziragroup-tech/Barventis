import { useState, useEffect, useCallback } from 'react';
import { getExpiryColor } from '../../utils/expiryColor';
import { Calendar, FileText, PlusCircle, Save, Loader2, Lock, Unlock, Info, Package, Camera, HelpCircle, ChevronDown, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';
import PhotoUploaderModal from '../../components/shared/PhotoUploaderModal';
import { calculateClosingStockQty, calculateDailyInventoryMetrics, getLocalDateISO } from '../../services/dailyInventoryMath';

export default function DailyInventory({ category, initialTab }) {
  const { activeUser } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab || 'REKAP');
  const [date, setDate] = useState(() => getLocalDateISO());
  const [location, setLocation] = useState('RESTO');
  const [showGuide, setShowGuide] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [photoModal, setPhotoModal] = useState({ isOpen: false, bucket: '', contextName: '' });

  // REKAP state
  const [records, setRecords] = useState([]);

  // EOD state
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // REFACTOR: endpoint baru
      const data = await api.getDailyInventoryRecords(date, location);
      if (!data || !data.length) {
        setRecords([]);
        setIsLocked(false);
        return;
      }
      // Locking flag: jika ada yang verified/closed
      setIsLocked(data.some(r => r.status === 'verified' || r.status === 'closed'));
      // Map sama seperti sebelumnya + filtering ASSET
      setRecords(data.filter(r => (r.materials?.category || '').toUpperCase() !== 'ASSET'));
    } catch (err) {
      setError(err.message || 'Gagal memuat rekap harian');
    } finally {
      setLoading(false);
    }
  }, [date, location]);

  const fetchEodData = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // REFACTOR: endpoint baru
      const { items: materialsList, inventory: invMap, isLocked: lockFlag } = await api.getDailyInventoryEodData(date, location);
      setItems(materialsList);
      setIsLocked(!!lockFlag);
      setInventory(invMap || {});
    } catch (err) {
      setError(err.message || 'Gagal memuat form EOD');
    } finally {
      setLoading(false);
    }
  }, [date, location]);

  useEffect(() => {
    if (activeTab === 'REKAP') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRecords();
    } else {
      fetchEodData();
    }
  }, [activeTab, fetchRecords, fetchEodData]);

  const handleChange = (itemId, field, value) => {
    if (isLocked) return;
    const initialItem = items.find(m => m.id === itemId);
    const fallbackStokAwal = Number(location === 'CENTRAL' ? initialItem?.qty_central : (initialItem?.qty_resto ?? initialItem?.stock)) || 0;
    setInventory(prev => {
      let parsedValue = value;
      if (field !== 'expiry_date') {
        if (value === '' || value === null || value === undefined) {
          parsedValue = '';
        } else {
          // Normalisasi koma (format keyboard ID) ke titik desimal
          parsedValue = String(value).replace(',', '.');
        }
      }
      const existing = prev[itemId] || {
        stok_awal: fallbackStokAwal,
        qty_in: 0,
        qty_out: 0,
        waste: 0,
        broken: 0,
        full_qty: ''
      };
      const nextRow = { ...existing, [field]: parsedValue };
      if (field === 'full_qty' || field === 'broken') {
        const fullValue = field === 'full_qty' ? parsedValue : existing.full_qty;
        const brokenValue = field === 'broken' ? parsedValue : existing.broken;
        const hasExplicitCount = (fullValue !== '' && fullValue !== null && fullValue !== undefined)
          || (brokenValue !== '' && brokenValue !== null && brokenValue !== undefined);
        nextRow.is_counted = hasExplicitCount;
      }
      return { ...prev, [itemId]: nextRow };
    });
  };

  const handleCountedChange = (itemId, checked) => {
    if (isLocked) return;
    setInventory(prev => {
      const current = prev[itemId] || {};
      // Checking an otherwise blank row explicitly means the physical count was
      // performed and the stock was zero; keep that distinct from uncounted.
      const shouldSetZero = checked && (current.full_qty === '' || current.full_qty == null) &&
        (current.broken === '' || current.broken == null);
      return {
        ...prev,
        [itemId]: {
          ...current,
          is_counted: Boolean(checked),
          ...(shouldSetZero ? { full_qty: 0, broken: 0 } : {})
        }
      };
    });
  };

  const getInventoryRowMetrics = (item, row = {}, strict = false) => {
    const opening = Number(row.stok_awal) || 0;
    const incoming = Number(row.qty_in) || 0;
    const out = Number(row.qty_out) || 0;
    const productionUsage = Number(row.production_usage_qty) || 0;
    const waste = Number(row.waste) || 0;
    const full = Number(row.full_qty) || 0;
    const broken = Number(row.broken) || 0;
    let closing = row.is_counted ? 0 : null;
    if (row.is_counted) {
      try {
        closing = calculateClosingStockQty(item, full, broken);
      } catch (error) {
        if (strict) throw error;
        closing = null;
      }
    }
    const metrics = calculateDailyInventoryMetrics({ opening, incoming, netMovement: row.net_stock_movement, out, productionUsage, waste, closing: Number(closing) || 0 });
    const unitCost = Number(row.cost_per_unit ?? row.unit_cost_snapshot ?? item.avg_cost ?? item.price) || 0;
    return {
      ...metrics,
      stockBasedUsage: closing === null ? null : metrics.stockBasedUsage,
      usageVariance: closing === null ? null : metrics.usageVariance,
      closing,
      unitCost,
      usageValue: (out + productionUsage) * unitCost,
      counted: Boolean(row.is_counted),
    };
  };

  const handleUnlock = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.unlockDailyInventory(date, location);
      setIsLocked(false);
      setSuccess('Kunci EOD berhasil dibuka. Formulir kini dapat diedit kembali.');
      if (activeTab === 'REKAP') {
        fetchRecords();
      } else {
        fetchEodData();
      }
    } catch (err) {
      setError('Gagal membuka kunci EOD: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setSaving(false);
    }
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
    // REFACTOR: call API endpoint, supply normalized inputs
    const itemsToSave = items.map(item => {
      const row = inventory[item.id] || {};
      const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
      const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
      const qtyOut = Number(row.qty_out) || 0;
      const fullQty = Number(row.full_qty) || 0;
      const broken = Number(row.broken) || 0;
      const expiry_date = row.expiry_date || undefined;
      const closingQty = row.is_counted ? calculateClosingStockQty(item, fullQty, broken) : 0;
      return {
        material_id: item.id,
        stok_awal: stokAwal,
        qty_out: qtyOut,
        broken: broken,
        full_qty: fullQty,
        closing_qty: closingQty,
        is_counted: Boolean(row.is_counted),
        opening_qty_source: row.opening_qty_source || 'CLIENT_OR_LEGACY_FALLBACK',
        expiry_date,
      };
    });
    if (isClosing) {
      const uncounted = items.filter(item => !inventory[item.id]?.is_counted);
      if (uncounted.length) {
        const examples = uncounted.slice(0, 5).map(item => item.name).join(', ');
        throw new Error(`${uncounted.length} barang belum dikonfirmasi hitung fisiknya. Contoh: ${examples}${uncounted.length > 5 ? ', …' : ''}. Centang “Sudah dihitung” atau isi FULL/BROKEN, termasuk 0 jika stok kosong.`);
      }
    }
    await api.saveDailyInventory(date, itemsToSave, !!isClosing, activeUser?.id, location);
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
      `Apakah Anda yakin ingin melakukan Closing EOD untuk ${date} • ${location}? Semua barang wajib sudah dikonfirmasi hitung fisiknya. Data akan dikunci.`
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
          'KELUAR (OUT MANUAL)': row.qty_out ?? 0,
          'PRODUKSI INPUT (OTOMATIS)': row.production_usage_qty ?? 0,
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
          const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
          const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
          const qtyIn = Number(row.qty_in) || 0;
          const qtyOut = Number(row.qty_out) || 0;
          const waste = Number(row.waste) || 0;
          const fullQty = Number(row.full_qty) || 0;
          const broken = Number(row.broken) || 0;
          const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
          const stokAkhir = metrics.closing ?? '';
          const qtyTerpakai = qtyOut;
          const unitPrice = metrics.unitCost;
          const nilaiRupiah = metrics.usageValue;

          return {
            'NO': idx + 1,
            'NAMA BARANG': item.name,
            'SATUAN': item.unit || 'unit',
            'HARGA SATUAN (RP)': unitPrice,
            'STOK AWAL': stokAwal,
            'MASUK (IN)': qtyIn,
            'KELUAR (OUT MANUAL)': qtyOut,
            'PRODUKSI INPUT (OTOMATIS)': Number(row.production_usage_qty) || 0,
            'WASTE / RUSAK': waste,
            'FISIK FULL': fullQty,
            'FISIK BROKEN': broken,
            'STOK AKHIR': stokAkhir,
            'QTY TERPAKAI': qtyTerpakai,
            'STOCK-BASED USAGE': metrics.stockBasedUsage,
            'SELISIH PEMAKAIAN': metrics.usageVariance,
            'SUDAH DIHITUNG': metrics.counted ? 'YA' : 'BELUM',
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
          const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
          const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
          const qtyIn = Number(row.qty_in) || 0;
          const qtyOut = Number(row.qty_out) || 0;
          const waste = Number(row.waste) || 0;
          const fullQty = Number(row.full_qty) || 0;
          const broken = Number(row.broken) || 0;
          const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
          const stokAkhir = metrics.closing ?? '';
          const qtyTerpakai = qtyOut;
          const unitPrice = metrics.unitCost;
          const nilaiRupiah = metrics.usageValue;

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
        title: `Laporan Inventaris Harian — Tanggal: ${date} — Lokasi: ${location} (${modeTitle})`,
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

  return (
    <div className="fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
              Daily Inventory
            </h1>
            {isLocked && (
              <span style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                TERKUNCI
              </span>
            )}
          </div>
          <p className="hidden md:block" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '2px 0 0 0' }}>
            Rekapitulasi stok akhir hari dan nilai terpakai
          </p>
        </div>

        {/* Action Controls: Compact Mode Switcher + Interactive Guide Button */}
        <div className="no-print flex items-center gap-2 flex-wrap">
          <div style={{ display: 'inline-flex', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <button
              className="btn"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                border: 'none',
                background: activeTab === 'REKAP' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'REKAP' ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '6px',
                fontWeight: activeTab === 'REKAP' ? 700 : 500,
                boxShadow: activeTab === 'REKAP' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setActiveTab('REKAP')}
            >
              <FileText size={14} style={{ marginRight: '5px' }} />
              Rekap Harian
            </button>
            <button
              className="btn"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                border: 'none',
                background: activeTab === 'EOD' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'EOD' ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '6px',
                fontWeight: activeTab === 'EOD' ? 700 : 500,
                boxShadow: activeTab === 'EOD' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setActiveTab('EOD')}
            >
              <PlusCircle size={14} style={{ marginRight: '5px' }} />
              Form Input EOD
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: '6px 10px',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: showGuide ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: showGuide ? 'var(--accent)' : 'var(--border)'
            }}
            onClick={() => setShowGuide(prev => !prev)}
            title="Tampilkan / Sembunyikan Panduan"
          >
            <HelpCircle size={14} />
            <span>Panduan</span>
            <ChevronDown size={13} className={`transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Interactive Collapsible Guide Card (Progressive Disclosure) */}
      {showGuide && (
        <div
          className="rounded-xl border p-3.5 text-xs transition-all no-print"
          style={{
            background: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(245, 158, 11, 0.06)',
            borderColor: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(245, 158, 11, 0.25)',
            color: 'var(--text-primary)',
            marginBottom: '10px'
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 flex-1">
              <Info size={16} className={activeTab === 'REKAP' ? 'text-blue-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
              <div className="space-y-1">
                <div className="font-bold" style={{ color: activeTab === 'REKAP' ? '#2563eb' : '#d97706' }}>
                  {activeTab === 'REKAP' ? '📊 Panduan: Rekap Harian (Audit & Tinjauan)' : '📝 Panduan: Form Input EOD (Closing Shift)'}
                </div>
                <p className="m-0 leading-relaxed text-[var(--text-secondary)]">
                  {activeTab === 'REKAP' 
                    ? 'Rekap Harian meninjau stok awal, IN, OUT aktual staf, waste, stok fisik, pemakaian harian, dan selisih rekonsiliasi untuk kebutuhan audit manajerial.'
                    : 'Form EOD diisi staf setiap hari. IN berasal dari pembelian/transfer yang sudah dicatat, WASTE berasal dari Catatan Limbah, OUT dikonfirmasi staf berdasarkan pemakaian aktual, lalu hitung FULL (kemasan utuh) dan BROKEN (sisa isi kemasan terbuka dalam satuan dasar). Data IN dan WASTE tidak perlu diketik ulang.'
                  }
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md"
              title="Tutup panduan"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px' }}>
        {/* Print-only Document Header */}
        <div className="print-only print-header">
          <div className="print-header-brand">BARVENTIS — SISTEM MANAJEMEN GUDANG</div>
          <div style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>
            {activeTab === 'REKAP' ? 'Laporan Rekapitulasi Inventaris Harian' : 'Lembar Kerja Input EOD (End of Day)'}
          </div>
          <div className="print-header-meta">
            Tanggal: {date} | Lokasi: {location} | Status: {isLocked ? 'Terkunci (EOD Closed)' : 'Draft / Terbuka'} | Tanggal Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Filter Tanggal:</label>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto' }}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            <label style={{ fontWeight: 600 }}>Lokasi:</label>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: '145px' }}
              value={location}
              onChange={e => setLocation(e.target.value)}
              disabled={saving || loading}
            >
              <option value="RESTO">Resto</option>
              <option value="CENTRAL">Central</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <ExportButton
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              currentRole={activeUser?.role}
              disabled={loading || (activeTab === 'REKAP' ? records.length === 0 : items.length === 0)}
            />
            <PrintButton
              currentRole={activeUser?.role}
              disabled={loading || (activeTab === 'REKAP' ? records.length === 0 : items.length === 0)}
              title="Cetak lembar inventaris harian"
            />

            {isLocked && (
              <button
                type="button"
                className="btn btn-secondary border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={handleUnlock}
                disabled={saving || loading}
                title="Buka kunci formulir EOD untuk revisi"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                Buka Kunci (Revisi EOD)
              </button>
            )}

            {activeTab === 'EOD' && !isLocked && (
              <>
                <button
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={handleSave}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Progress (Draf)
                </button>
                <button
                  className="btn"
                  style={{ background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => setPhotoModal({ isOpen: true, bucket: 'closing-photos', contextName: `Closing_EOD_${date}` })}
                >
                  <Camera size={16} />
                  Bukti Closing
                </button>
                <button
                  className="btn"
                  style={{ background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={submitEODSettlement}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  Kunci Closing EOD
                </button>
              </>
            )}
          </div>
        </div>

        {isLocked && (
          <div className="flex items-center justify-between p-3.5 mb-4 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-900 text-xs">
            <div className="flex items-center gap-2.5">
              <Lock size={16} className="text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Formulir Terkunci (EOD Closed / Verified).</span> Kolom input dinonaktifkan untuk melindungi data closing akhir hari.
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={saving || loading}
              className="ml-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <Unlock size={13} />
              Buka Kunci untuk Edit
            </button>
          </div>
        )}

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

        <div className="table-container relative" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <TableLoadingOverlay
            loading={loading && (activeTab === 'REKAP' ? records.length > 0 : items.length > 0)}
            message="Menyinkronkan data inventaris harian..."
          />
          {activeTab === 'REKAP' ? (
            <table className="custom-table" style={{ width: '100%', minWidth: '1240px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', minWidth: '220px' }} className="whitespace-nowrap">Barang</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">Stok Awal</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">IN</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">OUT Manual</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">WASTE</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">FULL</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">BROKEN</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '100px' }} className="whitespace-nowrap">Stok Akhir</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '100px' }} className="whitespace-nowrap">Terpakai</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', minWidth: '130px' }} className="whitespace-nowrap">Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 ? (
                  <TableSkeletonRows
                    rows={6}
                    columns={[
                      { width: '220px', type: 'dual-text' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '130px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  records.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">{row.materials?.name || 'Item Terhapus'}</div>
                        <div className="text-xs text-[var(--text-muted)] whitespace-nowrap mt-0.5">
                          Harga: Rp {(Number(row.materials?.price) || 0).toLocaleString('id-ID')} / {row.materials?.unit || 'unit'}
                        </div>
                      </td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.stok_awal}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.qty_in}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>
                        <div>{row.qty_out}</div>
                        {Number(row.production_usage_qty) > 0 && <div className="mt-1 text-[10px] font-semibold text-indigo-700" title="Bahan digunakan untuk produksi internal, bukan konsumsi akhir Cost Control.">Produksi: {Number(row.production_usage_qty).toLocaleString('id-ID')}</div>}
                      </td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px', color: Number(row.waste) > 0 ? '#dc2626' : 'inherit' }}>{row.waste}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.full_qty}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.broken}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap font-bold" style={{ padding: '12px 10px' }}>{row.stok_akhir}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap font-bold" style={{ padding: '12px 10px', color: row.qty_terpakai < 0 ? '#ef4444' : 'inherit' }}>
                        {row.qty_terpakai}
                      </td>
                      <td className="text-right font-mono tabular-nums whitespace-nowrap font-semibold" style={{ padding: '12px 16px' }}>
                        Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                      <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                      <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada data rekap untuk tanggal ini</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="custom-table" style={{ width: '100%', minWidth: '1360px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', minWidth: '220px' }} className="whitespace-nowrap">Barang</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '100px', width: '100px' }} className="whitespace-nowrap">Stok Awal</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '125px', width: '125px' }} className="whitespace-nowrap">IN</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '100px', width: '100px' }} className="whitespace-nowrap">OUT</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '140px', width: '140px', background: 'rgba(239,68,68,0.1)' }} className="whitespace-nowrap">Exp. Date</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '130px', width: '130px', background: 'rgba(239,68,68,0.05)' }} className="whitespace-nowrap">WASTE</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '100px', width: '100px', background: 'rgba(245,158,11,0.05)' }} className="whitespace-nowrap">FULL</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '100px', width: '100px', background: 'rgba(245,158,11,0.05)' }} className="whitespace-nowrap">BROKEN</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '100px', width: '100px', background: 'rgba(16,185,129,0.05)' }} className="whitespace-nowrap">Stok Akhir</th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '105px', width: '105px', background: 'rgba(139,92,246,0.05)' }} className="whitespace-nowrap">Terpakai</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', minWidth: '135px', width: '135px' }} className="whitespace-nowrap">Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <TableSkeletonRows
                    rows={8}
                    columns={[
                      { width: '220px', type: 'dual-text' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '125px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '140px', type: 'text', align: 'center' },
                      { width: '130px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '105px', type: 'text', align: 'center' },
                      { width: '135px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  items.map((item, idx) => {
                    const row = inventory[item.id] || {};
                    const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
                    const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
                    const qtyOut = Number(row.qty_out) || 0;
                    const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
                    const stokAkhir = metrics.closing;
                    const qtyTerpakai = qtyOut;
                    const unitPrice = metrics.unitCost;
                    const nilaiRupiah = metrics.usageValue;

                    // FEFO Expiry (H-3)
                    const expDate = row.expiry_date || item.brand || '';
                    const fefo = getExpiryColor(expDate);
                    const isExpiringSoon = fefo?.color === 'red';

                    return (
                      <tr key={item.id} style={{ background: fefo?.color === 'red' ? 'rgba(239,68,68,0.1)' : fefo?.color === 'yellow' ? 'rgba(245,158,11,0.1)' : fefo?.color === 'green' ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[var(--text-primary)]">{item.name}</span>
                            {fefo && (
                              <span style={{ fontWeight: 700, fontSize: '10px', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', background: fefo.color === 'red' ? '#fee2e2' : fefo.color === 'yellow' ? '#fef08a' : '#bbf7d0', color: fefo.color === 'red' ? '#b91c1c' : fefo.color === 'yellow' ? '#854d0e' : '#166534' }}>
                                {fefo.label} {fefo.days} hari
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] whitespace-nowrap mt-0.5">
                            Rp {unitPrice.toLocaleString('id-ID')} / {item.unit || 'unit'}
                          </div>
                          <label className="mt-2 flex items-center gap-2 text-xs font-medium" style={{ color: row.is_counted ? '#047857' : '#92400e' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(row.is_counted)}
                              disabled={isLocked}
                              onChange={e => handleCountedChange(item.id, e.target.checked)}
                            />
                            {row.is_counted ? 'Sudah dihitung' : 'Konfirmasi hitung fisik'}
                          </label>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled
                            className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2"
                            style={{ width: '100%', minWidth: '75px' }}
                            value={row.stok_awal !== undefined ? row.stok_awal : (fallbackOpening ?? '')}
                            readOnly
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, idx, 1, 'stok_awal')}
                            data-row={idx}
                            data-col={1}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div className="flex items-center gap-1.5 w-full">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled
                              className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2 flex-1"
                              style={{ minWidth: '70px' }}
                              value={row.qty_in ?? ''}
                              readOnly
                              onFocus={e => e.target.select()}
                              onKeyDown={e => handleKeyDown(e, idx, 2, 'qty_in')}
                              data-row={idx}
                              data-col={2}
                              placeholder="0"
                            />
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isLocked}
                            className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2"
                            style={{ width: '100%', minWidth: '75px' }}
                            value={row.qty_out ?? ''}
                            onChange={e => handleChange(item.id, 'qty_out', e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, idx, 3, 'qty_out')}
                            data-row={idx}
                            data-col={3}
                            placeholder="0"
                          />
                          {Number(row.production_usage_qty) > 0 && (
                            <div className="mt-1 text-center text-[10px] font-semibold text-indigo-700" title="Pemakaian bahan yang sudah dicatat otomatis dari batch produksi; tidak perlu dimasukkan ulang ke OUT manual.">
                              Produksi: {Number(row.production_usage_qty).toLocaleString('id-ID')} {item.unit || ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(239,68,68,0.1)' }}>
                          <input
                            type="date"
                            disabled={isLocked}
                            className="form-control text-xs py-1.5 px-2 text-center"
                            style={{ width: '100%', minWidth: '120px', color: isExpiringSoon ? '#dc2626' : 'inherit', fontWeight: isExpiringSoon ? 700 : 400 }}
                            value={expDate}
                            onChange={e => handleChange(item.id, 'expiry_date', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(239,68,68,0.05)' }}>
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex items-center gap-1.5 w-full">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled
                                className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2 flex-1 text-red-600 font-semibold"
                                style={{ minWidth: '70px' }}
                                value={row.waste ?? ''}
                                readOnly
                                onFocus={e => e.target.select()}
                                onKeyDown={e => handleKeyDown(e, idx, 4, 'waste')}
                                data-row={idx}
                                data-col={4}
                                placeholder={row.transaction_waste ? String(row.transaction_waste) : '0'}
                              />
                            </div>
                            {Number(row.transaction_waste) > 0 && (
                              <div className="text-[10px] text-red-500 font-semibold text-center whitespace-nowrap bg-red-50/80 rounded py-0.5 px-1 border border-red-200/50" title="Akumulasi dari Catatan Limbah hari ini">
                                Log: {row.transaction_waste} {item.unit || ''}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isLocked}
                            className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2 font-semibold text-amber-800"
                            style={{ width: '100%', minWidth: '75px' }}
                            value={row.full_qty ?? ''}
                            onChange={e => handleChange(item.id, 'full_qty', e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, idx, 5, 'full_qty')}
                            data-row={idx}
                            data-col={5}
                            placeholder="0"
                          />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled={isLocked}
                              className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2 font-semibold text-amber-800"
                              style={{ width: '100%', minWidth: '75px' }}
                              value={row.broken ?? ''}
                              onChange={e => handleChange(item.id, 'broken', e.target.value)}
                              onFocus={e => e.target.select()}
                              onKeyDown={e => handleKeyDown(e, idx, 6, 'broken')}
                              data-row={idx}
                              data-col={6}
                              placeholder="0"
                            />
                        </td>
                        <td className="text-center font-mono tabular-nums font-bold whitespace-nowrap" style={{ padding: '12px 10px', background: 'rgba(16,185,129,0.05)', color: stokAkhir === null ? '#b45309' : '#047857' }}>
                          {stokAkhir === null ? 'Belum dihitung' : stokAkhir}
                        </td>
                        <td className="text-center font-mono tabular-nums font-bold whitespace-nowrap" style={{ padding: '12px 10px', background: 'rgba(139,92,246,0.05)', color: qtyTerpakai < 0 ? '#ef4444' : '#6d28d9' }}>
                          <div>{qtyTerpakai}</div>
                          <div title="Stock-based usage = opening + non-consumption movements - closing - waste - production input" className="mt-1 text-[10px] font-medium" style={{ color: Math.abs(metrics.usageVariance) > 0.0001 ? '#b45309' : '#047857' }}>
                            Basis stok: {metrics.stockBasedUsage === null ? '—' : metrics.stockBasedUsage.toLocaleString('id-ID')}
                            {metrics.usageVariance !== null && Math.abs(metrics.usageVariance) > 0.0001 ? ` • selisih ${metrics.usageVariance.toLocaleString('id-ID')}` : ''}
                          </div>
                        </td>
                        <td className="text-right font-mono tabular-nums font-semibold whitespace-nowrap" style={{ padding: '12px 16px' }}>
                          Rp {nilaiRupiah.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
                      <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Package size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '6px', color: 'var(--text-primary)' }}>
                          Belum Ada Master Bahan Baku
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                          Daftar barang pada Form EOD diambil otomatis dari Master Bahan Baku (<strong>Stock Ledger</strong>). Silakan tambahkan bahan terlebih dahulu di menu <strong>Stock Ledger</strong> agar dapat dicatat stok fisiknya di sini.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <PhotoUploaderModal 
          isOpen={photoModal.isOpen} 
          onClose={() => setPhotoModal({ isOpen: false, bucket: '', contextName: '' })} 
          bucket={photoModal.bucket}
          contextName={photoModal.contextName}
        />
      </div>
    </div>
  );
}
