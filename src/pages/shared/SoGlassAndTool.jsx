import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GlassWater, Plus, Save, AlertTriangle, Trash2, CheckCircle2, RefreshCw, Upload, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { exportWithAudit } from '../../services/export/exportAudit';
import { exportToPDF } from '../../services/export/pdfExporter';
import { supabase } from '../../lib/supabase';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatIDR } from '../../services/costUtils';
import { beritaAcaraService } from '../../services/modules/stakeholderV4Service';

const MONTHS_ID = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' }
];

/**
 * Halaman khusus SO Gelas & Alat Bar (terpisah dari Waste bahan baku).
 * - Tab 1: Stok & Hitung Fisik Gelas/Alat Bar (tabel `asset_items` + `asset_opname_items`).
 * - Tab 2: Catat Gelas/Alat Pecah (Kapan, Oleh Siapa, Barang Apa, Qty, Harga) -> langsung masuk ke `berita_acara_documents`.
 */
export default function SoGlassAndTool() {
  const { activeBranchId, activeBranch, showToast } = useData();
  const { activeUser } = useAuth();

  const now = new Date();
  const [subTab, setSubTab] = useState('OPNAME'); // 'OPNAME' | 'PECAH'
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const periodMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const yearOptions = useMemo(() => {
    const base = now.getFullYear();
    return [base + 1, base, base - 1, base - 2];
  }, []);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assetItems, setAssetItems] = useState([]);
  const [opnameDrafts, setOpnameDrafts] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [breakageList, setBreakageList] = useState([]);

  // Form tambah gelas/alat bar baru
  const [newAsset, setNewAsset] = useState({ name: '', unit: 'pcs', qty_owned: 0 });
  const [addingAsset, setAddingAsset] = useState(false);

  // Form catat gelas/alat pecah (untuk Berita Acara)
  const [breakForm, setBreakForm] = useState({
    tanggal: now.toISOString().split('T')[0],
    nama_karyawan: '',
    asset_id: '',
    nama_barang: '',
    jumlah: 1,
    harga: 23000,
    keterangan: ''
  });

  const notify = useCallback((msg, type = 'success') => {
    if (typeof showToast === 'function') {
      showToast(msg, type);
    } else {
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: msg, type } }));
    }
  }, [showToast]);

  const loadData = useCallback(async () => {
    const tenantId = activeUser?.tenant_id;
    if (!tenantId) return;
    setLoading(true);
    try {
      // 1. Ambil daftar Gelas & Alat Bar untuk cabang aktif
      let itemsQ = supabase
        .from('asset_items')
        .select('id, name, unit, qty_owned, branch_id')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });
      if (activeBranchId) itemsQ = itemsQ.eq('branch_id', activeBranchId);

      // 2. Ambil catatan opname bulan & tahun terpilih
      let opnameQ = supabase
        .from('asset_opname_items')
        .select('id, asset_id, stock_awal, stock_akhir, adjustment_plus, adjustment_minus, keterangan')
        .eq('tenant_id', tenantId)
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth);
      if (activeBranchId) opnameQ = opnameQ.eq('branch_id', activeBranchId);

      // 3. Ambil daftar karyawan untuk pilihan "Oleh Siapa"
      const staffQ = supabase
        .from('users')
        .select('id, name, role, sub_role')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });

      const [itemsRes, opnameRes, staffRes, baDoc] = await Promise.all([
        itemsQ,
        opnameQ,
        staffQ,
        beritaAcaraService.getByPeriod(periodMonth, activeBranchId).catch(() => null)
      ]);

      const loadedItems = Array.isArray(itemsRes.data) ? itemsRes.data : [];
      const loadedOpnames = Array.isArray(opnameRes.data) ? opnameRes.data : [];
      const opnameByAsset = new Map(loadedOpnames.map((o) => [o.asset_id, o]));

      const nextDrafts = {};
      loadedItems.forEach((item) => {
        const existing = opnameByAsset.get(item.id);
        nextDrafts[item.id] = {
          opname_id: existing?.id || null,
          stock_awal: existing ? Number(existing.stock_awal ?? item.qty_owned ?? 0) : Number(item.qty_owned ?? 0),
          stock_akhir: existing && existing.stock_akhir !== null ? String(existing.stock_akhir) : '',
          adjustment_plus: existing ? Number(existing.adjustment_plus ?? 0) : 0,
          adjustment_minus: existing ? Number(existing.adjustment_minus ?? 0) : 0,
          keterangan: existing?.keterangan || ''
        };
      });

      setAssetItems(loadedItems);
      setOpnameDrafts(nextDrafts);
      setStaffList((staffRes.data || []).filter((u) => u.name));
      setBreakageList(Array.isArray(baDoc?.breakage_items) ? baDoc.breakage_items : []);
    } catch (err) {
      notify('Gagal memuat data Gelas & Alat Bar: ' + (err?.message || 'Error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeUser?.tenant_id, activeBranchId, selectedYear, selectedMonth, periodMonth, notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddAssetItem = async (e) => {
    e.preventDefault();
    if (!newAsset.name.trim() || !activeUser?.tenant_id) return;
    setAddingAsset(true);
    try {
      const { error } = await supabase.from('asset_items').insert({
        tenant_id: activeUser.tenant_id,
        branch_id: activeBranchId || activeUser.branch_id || null,
        name: newAsset.name.trim(),
        unit: newAsset.unit.trim() || 'pcs',
        qty_owned: Number(newAsset.qty_owned) || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      if (error) throw error;
      setNewAsset({ name: '', unit: 'pcs', qty_owned: 0 });
      notify('Gelas / alat bar baru berhasil ditambahkan.', 'success');
      await loadData();
    } catch (err) {
      notify('Gagal menambah barang: ' + (err?.message || 'Error'), 'error');
    } finally {
      setAddingAsset(false);
    }
  };

  const handleUpdateDraft = (assetId, field, value) => {
    setOpnameDrafts((prev) => ({
      ...prev,
      [assetId]: {
        ...(prev[assetId] || { stock_awal: 0, stock_akhir: '', adjustment_plus: 0, adjustment_minus: 0, keterangan: '' }),
        [field]: value
      }
    }));
  };

  const handleSaveOpname = async () => {
    if (!activeUser?.tenant_id || assetItems.length === 0) return;
    setSaving(true);
    try {
      for (const item of assetItems) {
        const d = opnameDrafts[item.id];
        if (!d) continue;
        const stockAwal = Number(d.stock_awal) || 0;
        const stockAkhir = d.stock_akhir === '' ? null : Number(d.stock_akhir);
        const adjPlus = Number(d.adjustment_plus) || 0;
        const adjMinus = Number(d.adjustment_minus) || 0;
        const expectedAkhir = stockAwal + adjPlus - adjMinus;
        const selisih = stockAkhir === null ? 0 : stockAkhir - expectedAkhir;

        const payload = {
          tenant_id: activeUser.tenant_id,
          branch_id: activeBranchId || activeUser.branch_id || null,
          period_year: selectedYear,
          period_month: selectedMonth,
          asset_id: item.id,
          stock_awal: stockAwal,
          stock_akhir: stockAkhir,
          adjustment_plus: adjPlus,
          adjustment_minus: adjMinus,
          selisih_tidak_teridentifikasi: selisih,
          keterangan: d.keterangan || ''
        };

        if (d.opname_id) {
          const { error } = await supabase.from('asset_opname_items').update(payload).eq('id', d.opname_id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('asset_opname_items').insert(payload);
          if (error) throw error;
        }

        if (stockAkhir !== null) {
          await supabase
            .from('asset_items')
            .update({ qty_owned: stockAkhir, updated_at: new Date().toISOString() })
            .eq('id', item.id);
        }
      }
      notify(`Hasil hitung Gelas & Alat bulan ${MONTHS_ID[selectedMonth - 1]?.label} ${selectedYear} tersimpan.`, 'success');
      await loadData();
    } catch (err) {
      notify('Gagal menyimpan hasil hitung: ' + (err?.message || 'Error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBreakage = async (e) => {
    e.preventDefault();
    const itemName = breakForm.nama_barang.trim();
    const staffName = breakForm.nama_karyawan.trim();
    if (!itemName || !staffName) {
      notify('Isi dulu nama barang dan siapa yang memecahkan.', 'warning');
      return;
    }

    setSaving(true);
    try {
      const qty = Math.max(1, Number(breakForm.jumlah) || 1);
      const price = Math.max(0, Number(breakForm.harga) || 0);
      const newEntry = {
        id: `brk-${Date.now()}`,
        asset_id: breakForm.asset_id || null,
        nama_karyawan: staffName,
        nama_barang: itemName,
        tanggal: breakForm.tanggal || now.toISOString().split('T')[0],
        jumlah: qty,
        harga: price,
        total_harga: Math.round(qty * price),
        keterangan: breakForm.keterangan.trim()
      };

      const targetPeriod = String(newEntry.tanggal).slice(0, 7) || periodMonth;
      const existingDoc = await beritaAcaraService.getByPeriod(targetPeriod, activeBranchId).catch(() => null);
      const nextBreakageItems = [...(Array.isArray(existingDoc?.breakage_items) ? existingDoc.breakage_items : []), newEntry];
      const totalBreakage = nextBreakageItems.reduce((s, r) => s + (Number(r.total_harga) || 0), 0);

      await beritaAcaraService.saveDocument({
        periodMonth: targetPeriod,
        documentDate: existingDoc?.document_date || newEntry.tanggal,
        locationDivision: existingDoc?.location_division || `Bar - ${activeBranch?.name || 'Resto'}`,
        submitterName: existingDoc?.submitter_name || activeUser?.name || 'Head Bar',
        submitterNip: existingDoc?.submitter_nip || '-',
        submitterTitle: existingDoc?.submitter_title || 'Head Barista',
        introStatement: existingDoc?.intro_statement || 'Dengan ini melaporkan barang / gelas bar yang pecah atau rusak yaitu:',
        approverName: existingDoc?.approver_name || 'Owner / Pimpinan',
        approverTitle: existingDoc?.approver_title || 'Owner',
        dispositionStatement: existingDoc?.disposition_statement || 'Dicatat sebagai evaluasi bulanan operasional bar.',
        closingStatement: existingDoc?.closing_statement || 'Demikian Berita Acara ini dibuat menurut keadaan yang sebenarnya.',
        signCity: existingDoc?.sign_city || '',
        wasteItems: Array.isArray(existingDoc?.waste_items) ? existingDoc.waste_items : [],
        breakageItems: nextBreakageItems,
        totalWasteAmount: Number(existingDoc?.total_waste_amount) || 0,
        totalBreakageAmount: totalBreakage,
        disposalPhotos: Array.isArray(existingDoc?.disposal_photo_urls) ? existingDoc.disposal_photo_urls : [],
        status: existingDoc?.status || 'DRAFT'
      }, activeBranchId);

      setBreakageList(nextBreakageItems);
      setBreakForm((prev) => ({ ...prev, nama_karyawan: '', jumlah: 1, keterangan: '' }));
      notify('Catatan gelas pecah tersimpan dan otomatis masuk ke Berita Acara bulan ini.', 'success');
    } catch (err) {
      notify('Gagal menyimpan catatan pecah: ' + (err?.message || 'Error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBreakage = async (rowId) => {
    setSaving(true);
    try {
      const existingDoc = await beritaAcaraService.getByPeriod(periodMonth, activeBranchId).catch(() => null);
      const nextBreakageItems = breakageList.filter((r) => r.id !== rowId);
      const totalBreakage = nextBreakageItems.reduce((s, r) => s + (Number(r.total_harga) || 0), 0);

      await beritaAcaraService.saveDocument({
        periodMonth,
        documentDate: existingDoc?.document_date || `${periodMonth}-25`,
        locationDivision: existingDoc?.location_division || `Bar - ${activeBranch?.name || 'Resto'}`,
        submitterName: existingDoc?.submitter_name || activeUser?.name || 'Head Bar',
        submitterNip: existingDoc?.submitter_nip || '-',
        submitterTitle: existingDoc?.submitter_title || 'Head Barista',
        introStatement: existingDoc?.intro_statement || 'Dengan ini melaporkan barang / gelas bar yang pecah atau rusak yaitu:',
        approverName: existingDoc?.approver_name || 'Owner / Pimpinan',
        approverTitle: existingDoc?.approver_title || 'Owner',
        dispositionStatement: existingDoc?.disposition_statement || 'Dicatat sebagai evaluasi bulanan operasional bar.',
        closingStatement: existingDoc?.closing_statement || 'Demikian Berita Acara ini dibuat menurut keadaan yang sebenarnya.',
        signCity: existingDoc?.sign_city || '',
        wasteItems: Array.isArray(existingDoc?.waste_items) ? existingDoc.waste_items : [],
        breakageItems: nextBreakageItems,
        totalWasteAmount: Number(existingDoc?.total_waste_amount) || 0,
        totalBreakageAmount: totalBreakage,
        disposalPhotos: Array.isArray(existingDoc?.disposal_photo_urls) ? existingDoc.disposal_photo_urls : [],
        status: existingDoc?.status || 'DRAFT'
      }, activeBranchId);

      setBreakageList(nextBreakageItems);
      notify('Catatan pecah dihapus dari Berita Acara.', 'info');
    } catch (err) {
      notify('Gagal menghapus catatan: ' + (err?.message || 'Error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const sampleRows = [
      { 'Nama Barang': 'Gelas Teh', Satuan: 'pcs', 'Jumlah Awal': 24 },
      { 'Nama Barang': 'Gelas Beer', Satuan: 'pcs', 'Jumlah Awal': 18 },
      { 'Nama Barang': 'Shaker Boston', Satuan: 'unit', 'Jumlah Awal': 4 }
    ];
    await exportWithAudit({
      format: 'excel',
      filename: 'Template_Import_Gelas_Alat_Bar',
      sheets: [{ name: 'Template Gelas & Alat', rows: sampleRows }],
      actionName: 'Download Glass & Tool Import Template',
      role: activeUser?.role || 'Bar'
    });
  };

  const handleBulkImportAssets = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser?.tenant_id) return;
    setSaving(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const existingMap = new Map(assetItems.map((a) => [String(a.name || '').trim().toLowerCase(), a]));
      let inserted = 0;
      let updated = 0;

      for (const r of rawRows) {
        const name = String(r['Nama Barang'] || r['NAMA BARANG'] || r['name'] || r['Nama'] || '').trim();
        if (!name) continue;
        const unit = String(r['Satuan'] || r['SATUAN'] || r['unit'] || 'pcs').trim() || 'pcs';
        const qty = Number(r['Jumlah Awal'] ?? r['JUMLAH AWAL'] ?? r['qty_owned'] ?? r['Jumlah'] ?? 0) || 0;
        const match = existingMap.get(name.toLowerCase());

        if (match) {
          const { error } = await supabase
            .from('asset_items')
            .update({ unit, qty_owned: qty, updated_at: new Date().toISOString() })
            .eq('id', match.id);
          if (!error) updated++;
        } else {
          const { error } = await supabase.from('asset_items').insert({
            tenant_id: activeUser.tenant_id,
            branch_id: activeBranchId || activeUser.branch_id || null,
            name,
            unit,
            qty_owned: qty,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          if (!error) inserted++;
        }
      }

      notify(`Import selesai: ${inserted} barang baru, ${updated} diperbarui.`, 'success');
      await loadData();
    } catch (err) {
      notify('Gagal import file: ' + (err?.message || 'Format tidak didukung'), 'error');
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  };

  const handleExportAssetsExcel = async () => {
    const monthLabel = MONTHS_ID[selectedMonth - 1]?.label || String(selectedMonth);
    const opnameRows = assetItems.map((item, idx) => {
      const d = opnameDrafts[item.id] || {};
      const awal = Number(d.stock_awal ?? item.qty_owned ?? 0);
      const plus = Number(d.adjustment_plus ?? 0);
      const minus = Number(d.adjustment_minus ?? 0);
      const akhir = d.stock_akhir === '' || d.stock_akhir === undefined ? awal + plus - minus : Number(d.stock_akhir);
      return {
        No: idx + 1,
        'Nama Gelas / Alat': item.name,
        Satuan: item.unit,
        'Stok Awal': awal,
        'Tambah (+)': plus,
        'Pecah / Hilang (-)': minus,
        'Stok Akhir': akhir,
        Selisih: akhir - (awal + plus - minus),
        Catatan: d.keterangan || ''
      };
    });
    const pecahRows = breakageList.map((r, idx) => ({
      No: idx + 1,
      Tanggal: r.tanggal,
      'Oleh Siapa': r.nama_karyawan,
      'Barang Apa': r.nama_barang,
      Jumlah: r.jumlah,
      'Harga Satuan': r.harga,
      'Total (Rp)': r.total_harga,
      Keterangan: r.keterangan || ''
    }));
    await exportWithAudit({
      format: 'excel',
      filename: `Gelas_Alat_Bar_${monthLabel}_${selectedYear}`,
      sheets: [
        { name: 'Stok Gelas & Alat', rows: opnameRows },
        { name: 'Catatan Pecah', rows: pecahRows }
      ],
      actionName: 'Export Glass & Tool Opname Excel',
      role: activeUser?.role || 'Bar'
    });
  };

  const handleExportAssetsPdf = async () => {
    const monthLabel = MONTHS_ID[selectedMonth - 1]?.label || String(selectedMonth);
    const rows = assetItems.map((item, idx) => {
      const d = opnameDrafts[item.id] || {};
      const awal = Number(d.stock_awal ?? item.qty_owned ?? 0);
      const plus = Number(d.adjustment_plus ?? 0);
      const minus = Number(d.adjustment_minus ?? 0);
      const akhir = d.stock_akhir === '' || d.stock_akhir === undefined ? awal + plus - minus : Number(d.stock_akhir);
      return {
        no: idx + 1,
        name: item.name,
        unit: item.unit,
        awal: String(awal),
        minus: String(minus),
        akhir: String(akhir),
        catatan: d.keterangan || '-'
      };
    });
    await exportToPDF({
      filename: `Gelas_Alat_Bar_${monthLabel}_${selectedYear}`,
      title: `Laporan Stok Gelas & Alat Bar (${activeBranch?.name || 'Cabang'})
Periode: ${monthLabel} ${selectedYear} | Total Item: ${assetItems.length} | Catatan Pecah: ${breakageList.length} kejadian (${formatIDR(totalBreakageNominal)})`,
      tenantName: 'BARVENTIS - Gelas & Alat Bar',
      orientation: 'portrait',
      columns: [
        { key: 'no', label: '#' },
        { key: 'name', label: 'Nama Gelas / Alat' },
        { key: 'unit', label: 'Satuan' },
        { key: 'awal', label: 'Awal' },
        { key: 'minus', label: 'Pecah' },
        { key: 'akhir', label: 'Akhir' },
        { key: 'catatan', label: 'Catatan' }
      ],
      rows
    });
  };

  const totalBreakageNominal = useMemo(
    () => breakageList.reduce((sum, r) => sum + (Number(r.total_harga) || 0), 0),
    [breakageList]
  );

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Header & Pemilih Bulan/Tahun */}
      <div className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <GlassWater size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800 }}>
              Gelas & Alat Bar ({activeBranch?.name || 'Cabang Aktif'})
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Hitung stok gelas dan alat bar tiap bulan, lalu catat manual jika ada yang pecah supaya otomatis siap dicetak di Berita Acara.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ width: '130px', fontSize: '0.82rem', padding: '7px 10px' }}
          >
            {MONTHS_ID.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            className="form-control"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{ width: '90px', fontSize: '0.82rem', padding: '7px 10px' }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadTemplate}
            style={{ padding: '7px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            title="Unduh contoh file Excel untuk import massal"
          >
            <Download size={14} /> Template
          </button>
          <label
            className="btn btn-secondary"
            style={{ padding: '7px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', margin: 0 }}
            title="Import banyak gelas & alat sekaligus dari Excel/CSV"
          >
            <Upload size={14} /> Import Massal
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkImportAssets} disabled={saving} style={{ display: 'none' }} />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportAssetsExcel}
            style={{ padding: '7px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportAssetsPdf}
            style={{ padding: '7px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <FileText size={14} /> PDF
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadData}
            disabled={loading}
            style={{ padding: '7px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={14} /> Muat Ulang
          </button>
        </div>
      </div>

      {/* Sub-Tab: Hitung Stok Gelas/Alat vs Catat Pecah (Untuk Berita Acara) */}
      <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content' }}>
        <button
          type="button"
          className={`btn ${subTab === 'OPNAME' ? 'btn-primary' : ''}`}
          style={{ background: subTab === 'OPNAME' ? '' : 'transparent', color: subTab === 'OPNAME' ? '' : 'var(--text-secondary)', fontSize: '0.82rem' }}
          onClick={() => setSubTab('OPNAME')}
        >
          Stok Gelas & Alat ({assetItems.length})
        </button>
        <button
          type="button"
          className={`btn ${subTab === 'PECAH' ? 'btn-primary' : ''}`}
          style={{ background: subTab === 'PECAH' ? '' : 'transparent', color: subTab === 'PECAH' ? '' : 'var(--text-secondary)', fontSize: '0.82rem' }}
          onClick={() => setSubTab('PECAH')}
        >
          Catat Pecah ({breakageList.length})
        </button>
      </div>

      {subTab === 'OPNAME' && (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Form Tambah Gelas / Alat Bar */}
          <form
            onSubmit={handleAddAssetItem}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
              alignItems: 'end',
              padding: '14px',
              borderRadius: '10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)'
            }}
          >
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Nama Gelas / Alat Bar</label>
              <input
                type="text"
                className="form-control"
                placeholder="Contoh: Gelas Teh, Shaker, Jigger"
                value={newAsset.name}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                required
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Satuan</label>
              <input
                type="text"
                className="form-control"
                placeholder="pcs / unit"
                value={newAsset.unit}
                onChange={(e) => setNewAsset({ ...newAsset, unit: e.target.value })}
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Jumlah Awal Dimiliki</label>
              <input
                type="number" inputMode="numeric"
                min="0"
                className="form-control"
                value={newAsset.qty_owned}
                onChange={(e) => setNewAsset({ ...newAsset, qty_owned: e.target.value })}
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={addingAsset}
              style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px' }}
            >
              <Plus size={15} /> {addingAsset ? 'Menambah...' : 'Tambah Barang'}
            </button>
          </form>

          {/* Tabel Hitung Fisik */}
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Nama Gelas / Alat</th>
                  <th style={{ textAlign: 'center', width: '75px' }}>Satuan</th>
                  <th style={{ textAlign: 'center', width: '100px' }}>Stok Awal</th>
                  <th style={{ textAlign: 'center', width: '95px' }}>Tambah (+)</th>
                  <th style={{ textAlign: 'center', width: '95px' }}>Pecah/Hilang (-)</th>
                  <th style={{ textAlign: 'center', width: '110px' }}>Hasil Hitung</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Selisih</th>
                  <th>Catatan</th>
                </tr>
              </thead>
              <tbody>
                {assetItems.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      Belum ada daftar gelas atau alat bar di cabang ini. Tambahkan dulu di form atas.
                    </td>
                  </tr>
                )}
                {assetItems.map((item) => {
                  const d = opnameDrafts[item.id] || { stock_awal: item.qty_owned || 0, stock_akhir: '', adjustment_plus: 0, adjustment_minus: 0, keterangan: '' };
                  const expected = (Number(d.stock_awal) || 0) + (Number(d.adjustment_plus) || 0) - (Number(d.adjustment_minus) || 0);
                  const selisih = d.stock_akhir === '' ? null : Number(d.stock_akhir) - expected;
                  return (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 700 }}>{item.name}</td>
                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{item.unit}</td>
                      <td>
                        <input
                          type="number" inputMode="numeric"
                          className="form-control"
                          style={{ textAlign: 'center', padding: '5px 6px', fontSize: '0.8rem' }}
                          value={d.stock_awal}
                          onChange={(e) => handleUpdateDraft(item.id, 'stock_awal', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" inputMode="numeric"
                          min="0"
                          className="form-control"
                          style={{ textAlign: 'center', padding: '5px 6px', fontSize: '0.8rem' }}
                          value={d.adjustment_plus}
                          onChange={(e) => handleUpdateDraft(item.id, 'adjustment_plus', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" inputMode="numeric"
                          min="0"
                          className="form-control"
                          style={{ textAlign: 'center', padding: '5px 6px', fontSize: '0.8rem' }}
                          value={d.adjustment_minus}
                          onChange={(e) => handleUpdateDraft(item.id, 'adjustment_minus', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" inputMode="numeric"
                          min="0"
                          placeholder={String(expected)}
                          className="form-control"
                          style={{ textAlign: 'center', padding: '5px 6px', fontSize: '0.8rem', fontWeight: 700 }}
                          value={d.stock_akhir}
                          onChange={(e) => handleUpdateDraft(item.id, 'stock_akhir', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: selisih === null ? 'var(--text-muted)' : (selisih < 0 ? 'var(--danger)' : 'var(--accent)') }}>
                        {selisih === null ? '-' : (selisih > 0 ? `+${selisih}` : selisih)}
                      </td>
                      <td>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Catatan singkat..."
                          style={{ padding: '5px 8px', fontSize: '0.8rem' }}
                          value={d.keterangan}
                          onChange={(e) => handleUpdateDraft(item.id, 'keterangan', e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {assetItems.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveOpname}
                disabled={saving}
                style={{ fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={15} /> {saving ? 'Menyimpan...' : 'Simpan Hasil Hitung'}
              </button>
            </div>
          )}
        </div>
      )}

      {subTab === 'PECAH' && (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', fontSize: '0.8rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
            <span>
              Setiap kejadian pecah atau rusak yang dicatat di sini otomatis tersimpan ke <strong>Berita Acara Gelas Pecah</strong> bulan terkait.
            </span>
          </div>

          <form
            onSubmit={handleSaveBreakage}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px',
              alignItems: 'end',
              padding: '16px',
              borderRadius: '10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)'
            }}
          >
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Kapan (Tanggal)</label>
              <input
                type="date"
                className="form-control"
                value={breakForm.tanggal}
                onChange={(e) => setBreakForm({ ...breakForm, tanggal: e.target.value })}
                required
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Oleh Siapa</label>
              <input
                type="text"
                list="so-glass-staff-list"
                className="form-control"
                placeholder="Nama staf / Customer"
                value={breakForm.nama_karyawan}
                onChange={(e) => setBreakForm({ ...breakForm, nama_karyawan: e.target.value })}
                required
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Barang Apa</label>
              <input
                type="text"
                list="so-glass-items-list"
                className="form-control"
                placeholder="Pilih atau ketik nama gelas/alat"
                value={breakForm.nama_barang}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = assetItems.find((a) => a.name.toLowerCase() === val.trim().toLowerCase());
                  setBreakForm({ ...breakForm, nama_barang: val, asset_id: match?.id || '' });
                }}
                required
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Jumlah Pecah</label>
              <input
                type="number" inputMode="numeric"
                min="1"
                className="form-control"
                value={breakForm.jumlah}
                onChange={(e) => setBreakForm({ ...breakForm, jumlah: e.target.value })}
                required
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Harga Satuan (Rp)</label>
              <input
                type="number" inputMode="numeric"
                min="0"
                className="form-control"
                value={breakForm.harga}
                onChange={(e) => setBreakForm({ ...breakForm, harga: e.target.value })}
                required
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Keterangan (Opsional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="Mis. jatuh saat cuci"
                value={breakForm.keterangan}
                onChange={(e) => setBreakForm({ ...breakForm, keterangan: e.target.value })}
                style={{ fontSize: '0.82rem', padding: '7px 10px' }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
              style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '36px' }}
            >
              <CheckCircle2 size={15} /> {saving ? 'Menyimpan...' : 'Simpan ke Berita Acara'}
            </button>
          </form>

          {/* Daftar Gelas Pecah Bulan Ini */}
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Oleh Siapa</th>
                  <th>Barang Apa</th>
                  <th style={{ textAlign: 'center' }}>Jumlah</th>
                  <th style={{ textAlign: 'right' }}>Harga Satuan</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center', width: '70px' }}>Hapus</th>
                </tr>
              </thead>
              <tbody>
                {breakageList.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                      Belum ada catatan gelas atau alat pecah di bulan {MONTHS_ID[selectedMonth - 1]?.label} {selectedYear}.
                    </td>
                  </tr>
                )}
                {breakageList.map((row) => (
                  <tr key={row.id}>
                    <td>{row.tanggal}</td>
                    <td style={{ fontWeight: 700 }}>{row.nama_karyawan}</td>
                    <td>{row.nama_barang}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.jumlah}</td>
                    <td style={{ textAlign: 'right' }}>{formatIDR(row.harga)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{formatIDR(row.total_harga)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => handleDeleteBreakage(row.id)}
                        disabled={saving}
                        title="Hapus catatan ini"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {breakageList.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 800, background: 'var(--bg-secondary)' }}>
                    <td colSpan="5" style={{ textAlign: 'right' }}>Total Nilai Pecah Bulan Ini:</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatIDR(totalBreakageNominal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <datalist id="so-glass-items-list">
        {assetItems.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
      <datalist id="so-glass-staff-list">
        {staffList.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
    </div>
  );
}
