import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, FileText, PlusCircle, Save, Loader2, Lock, Info, Package } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';

export default function DailyInventory({ category, initialTab }) {
  const { activeUser } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab || 'REKAP');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  // REKAP state
  const [records, setRecords] = useState([]);

  // EOD state
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});

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

      // ponytail: filter by category prop when provided (BEER vs BAHAN)
      const filtered = category
        ? mapped.filter(r => {
            const cat = (r.materials?.category || '').toUpperCase();
            return category === 'BEER' ? cat === 'BEER' : cat !== 'BEER' && cat !== 'ASSET';
          })
        : mapped;
      setRecords(filtered);
    } catch (err) {
      setError(err.message || 'Gagal memuat rekap harian');
    } finally {
      setLoading(false);
    }
  }, [date]);

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
      // ponytail: filter by category prop when provided (BEER vs BAHAN)
      if (category) {
        materialsList = (materialsList || []).filter(m => {
          const cat = (m.category || '').toUpperCase();
          return category === 'BEER' ? cat === 'BEER' : cat !== 'BEER' && cat !== 'ASSET';
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
  }, [date]);

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

  return (
    <div className="fade-in space-y-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            Daily Inventory
            {isLocked && <span style={{ marginLeft: '12px', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>TERKUNCI (EOD CLOSED)</span>}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '4px' }}>Rekapitulasi stok akhir hari dan nilai terpakai</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'REKAP' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setActiveTab('REKAP')}
          >
            <FileText size={16} />
            Rekap Harian
          </button>
          <button
            className={`btn ${activeTab === 'EOD' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setActiveTab('EOD')}
          >
            <PlusCircle size={16} />
            Form Input EOD
          </button>
        </div>
      </div>

      {/* Info Banner: Penjelasan Perbedaan Rekap Harian vs Form Input EOD */}
      <div
        className="rounded-xl border p-4 text-sm transition-all no-print"
        style={{
          background: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(245, 158, 11, 0.08)',
          borderColor: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(245, 158, 11, 0.25)',
          color: 'var(--text-primary)'
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="p-2 rounded-lg shrink-0 mt-0.5"
            style={{
              background: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: activeTab === 'REKAP' ? '#2563eb' : '#d97706'
            }}
          >
            <Info size={18} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-sm m-0" style={{ color: activeTab === 'REKAP' ? '#2563eb' : '#d97706' }}>
                {activeTab === 'REKAP' ? '📊 Panduan: Rekap Harian (Monitoring & Audit)' : '📝 Panduan: Form Input EOD (End of Day Closing)'}
              </h4>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                {activeTab === 'REKAP' ? 'Mode Tinjauan & Analisa' : 'Mode Pencatatan Fisik Staf'}
              </span>
            </div>

            {activeTab === 'REKAP' ? (
              <p className="text-xs leading-relaxed m-0 text-[var(--text-secondary)]">
                <strong>Rekap Harian</strong> berfungsi untuk <strong>meninjau hasil kalkulasi</strong> dari stok yang telah diinput pada tanggal terpilih. Anda dapat memantau pergerakan Stok Awal, Barang Masuk (IN), Barang Keluar (OUT), Barang Terbuang (WASTE), sisa fisik (FULL/BROKEN), total kuantitas terpakai, dan nilai rupiah biaya bahan (HPP) untuk keperluan audit manajerial.
              </p>
            ) : (
              <p className="text-xs leading-relaxed m-0 text-[var(--text-secondary)]">
                <strong>Form Input EOD</strong> adalah <strong>lembar kerja operasional</strong> bagi staf bar atau kitchen di akhir shift untuk menginput hasil opname fisik malam hari. Masukkan sisa botol/kemasan utuh (<em>Full</em>), botol terbuka/sebagian (<em>Broken</em>), dan barang rusak/tumpah (<em>Waste</em>). Gunakan <strong>Simpan Draft</strong> untuk menyimpan sementara, atau <strong>Kunci & Closing EOD</strong> saat operasional selesai agar data terkunci per 23:59:59.
              </p>
            )}

            <div className="pt-2 mt-2 border-t border-[var(--border)] grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                <span><strong>Rekap Harian:</strong> Khusus melihat rekap & nilai rupiah (Read/Review).</span>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                <span><strong>Form Input EOD:</strong> Khusus menginput stok fisik & closing shift (Write/Lock).</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
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

            {activeTab === 'EOD' && !isLocked && (
              <>
                <button
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={handleSave}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Draft
                </button>
                <button
                  className="btn"
                  style={{ background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={submitEODSettlement}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  Kunci & Closing EOD
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
                  records.map(row => (
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
                  items.map((item, idx) => {
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
                {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
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
      </div>
    </div>
  );
}
