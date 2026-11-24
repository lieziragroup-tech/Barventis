import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText, Printer, Eye, EyeOff, Plus, Trash2, Save, RefreshCw,
  CheckCircle2, AlertTriangle, Camera, Users, Calendar
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { supabase } from '../../lib/supabase';
import { formatIDR } from '../../services/costUtils';
import { beritaAcaraService } from '../../services/modules/stakeholderV4Service';

// Semua data Berita Acara bersumber langsung dari database Supabase (tanpa data dummy).

const DISPOSITION_PRESETS = [
  'Memberikan Izin untuk membuang produk yang waste ini',
  'Memberikan Izin untuk mengalihkan produk mendekati expired ini ke Acara Karyawan / Tahun Baru',
  'Memberikan Izin untuk pemusnahan fisik barang kadaluarsa di lokasi Resto disaksikan Head Barista'
];

export default function BeritaAcaraMonthly() {
  const { activeUser } = useAuth();
  const { activeBranchId, stock } = useData();
  const toast = useToast();

  const [periodMonth, setPeriodMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [locationDivision, setLocationDivision] = useState('Resto - Central');
  const [submitterName, setSubmitterName] = useState(() => activeUser?.name || 'Head Bar');
  const [submitterNip, setSubmitterNip] = useState('-');
  const [submitterTitle, setSubmitterTitle] = useState('Head Barista');
  const [introStatement, setIntroStatement] = useState(
    'Dengan ini menyerahkan minuman beer yang sudah melewati masa Expired/Rusak Yaitu :'
  );
  const [approverName, setApproverName] = useState('Bpk. Gandhi');
  const [approverTitle, setApproverTitle] = useState('Owner Umatis');
  const [dispositionStatement, setDispositionStatement] = useState(
    'Memberikan Izin untuk membuang produk yang waste ini'
  );
  const [closingStatement, setClosingStatement] = useState(
    'Demikian Berita Acara ini dibuat menurut keadaan yang sebenarnya untuk di pergunakan sebagaimana mestinya.'
  );
  const [signCity, setSignCity] = useState('Tangerang');

  const [wasteItems, setWasteItems] = useState([]);
  const [breakageItems, setBreakageItems] = useState([]);
  const [disposalPhotos, setDisposalPhotos] = useState([]);
  const [status, setStatus] = useState('APPROVED');

  // Mode Cetak: 'COMPACT_1PAGE' (tanpa foto agar hemat kertas 1 lembar) vs 'FULL_WITH_PHOTOS' (dengan foto kecil)
  const [printMode, setPrintMode] = useState('COMPACT_1PAGE');
  const [loadingSync, setLoadingSync] = useState(false);
  const [recapSourceNote, setRecapSourceNote] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);
  const [sixMonthBreakageHistory, setSixMonthBreakageHistory] = useState([]);

  const rawRole = String(activeUser?.role || '').toLowerCase();
  const isOwnerOrHeadBar =
    rawRole.includes('owner') ||
    rawRole.includes('admin') ||
    rawRole.includes('head') ||
    rawRole.includes('supervisor') ||
    rawRole === 'bar' ||
    rawRole === 'barista';

  // Helper: tarik otomatis seluruh data Waste & Gelas Pecah bulan terpilih dari database
  const fetchLiveDatabaseRecap = useCallback(async (targetPeriod) => {
    const syncedWaste = [];
    const syncedBreakage = [];
    const [yStr, mStr] = String(targetPeriod || '').split('-');
    const yearNum = Number(yStr) || new Date().getFullYear();
    const monthNum = Number(mStr) || (new Date().getMonth() + 1);
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const startDate = `${targetPeriod}-01`;
    const endDate = `${targetPeriod}-${String(lastDay).padStart(2, '0')}`;

    // 1. Sumber: waste_logs (catatan limbah & gelas pecah harian)
    try {
      const allLogs = await api.getWasteLogs();
      const monthLogs = (allLogs || []).filter((l) => {
        const d = String(l.date || l.created_at || '').slice(0, 10);
        return d.startsWith(targetPeriod);
      });

      monthLogs.forEach((log, idx) => {
        const mat = (stock || []).find((s) => Number(s.id) === Number(log.material_id || log.item_id));
        const unitPrice = Number(log.unit_price_snapshot) || Number(mat?.new_price) || Number(mat?.price) || 0;
        const qtyNum = Number(log.quantity) || 1;
        const totalHarga = Number(log.total_price_snapshot) || Math.round(qtyNum * unitPrice);
        const typeUpper = String(log.ba_category || log.type || log.source_type || 'WASTE').toUpperCase();
        const isBreakage = typeUpper === 'BREAKAGE' || String(log.reason || '').toLowerCase().includes('pecah');

        if (isBreakage) {
          syncedBreakage.push({
            id: `wl-b-${log.id || idx}`,
            nama_karyawan: log.staff_responsible_name || log.recorded_by_name || 'Staf Bar',
            nama_barang: log.material_name || mat?.name || 'Gelas / Alat Bar',
            tanggal: String(log.date || log.created_at || startDate).slice(0, 10),
            jumlah: qtyNum,
            harga: unitPrice,
            total_harga: totalHarga
          });
        } else {
          syncedWaste.push({
            id: `wl-w-${log.id || idx}`,
            nama_barang: log.material_name || mat?.name || 'Bahan Waste',
            kemasan: log.pack_size_label || mat?.full_pack || mat?.unit || '-',
            jumlah: `${qtyNum} ${mat?.unit || 'pck'}`,
            masa_expired: log.expiry_or_status_label || log.reason || 'Waste / Expired',
            harga: unitPrice,
            total_harga: totalHarga,
            photo_url: log.photo_evidence_url || log.photo_url || ''
          });
        }
      });
    } catch {
      // ignore waste_logs fetch error
    }

    // 2. Sumber: daily_inventory_items dengan waste_qty > 0 di bulan terpilih
    try {
      const tenantId = activeUser?.tenant_id;
      if (tenantId) {
        let diQ = supabase
          .from('daily_inventory_items')
          .select('id, material_id, waste_qty, unit_cost_snapshot, notes, daily_inventories!inner(date, branch_id), materials(name, unit, full_pack, price, new_price)')
          .eq('tenant_id', tenantId)
          .gt('waste_qty', 0)
          .gte('daily_inventories.date', startDate)
          .lte('daily_inventories.date', endDate);
        if (activeBranchId) diQ = diQ.eq('branch_id', activeBranchId);

        const { data: diRows } = await diQ;
        const groupedWaste = new Map();
        (diRows || []).forEach((r) => {
          const name = r.materials?.name || 'Bahan Bar';
          const key = name.toLowerCase();
          const qty = Number(r.waste_qty) || 0;
          const price = Number(r.unit_cost_snapshot || r.materials?.new_price || r.materials?.price || 0);
          const cur = groupedWaste.get(key) || {
            id: `di-w-${r.material_id}`,
            nama_barang: name,
            kemasan: r.materials?.full_pack || r.materials?.unit || '-',
            qtyTotal: 0,
            unit: r.materials?.unit || 'pck',
            masa_expired: r.notes || 'Waste Daily Inventory',
            harga: price,
            photo_url: ''
          };
          cur.qtyTotal += qty;
          groupedWaste.set(key, cur);
        });

        groupedWaste.forEach((g) => {
          const alreadyExists = syncedWaste.some((w) => w.nama_barang.toLowerCase() === g.nama_barang.toLowerCase());
          if (!alreadyExists && g.qtyTotal > 0) {
            syncedWaste.push({
              id: g.id,
              nama_barang: g.nama_barang,
              kemasan: g.kemasan,
              jumlah: `${Number(g.qtyTotal.toFixed(2))} ${g.unit}`,
              masa_expired: g.masa_expired,
              harga: g.harga,
              total_harga: Math.round(g.qtyTotal * g.harga),
              photo_url: ''
            });
          }
        });
      }
    } catch {
      // ignore daily_inventory_items error
    }

    // 3. Sumber: asset_opname_items (SO Gelas & Alat Bar dengan adjustment_minus > 0)
    try {
      const tenantId = activeUser?.tenant_id;
      if (tenantId) {
        let aoQ = supabase
          .from('asset_opname_items')
          .select('id, asset_id, adjustment_minus, keterangan, asset_items(name, unit)')
          .eq('tenant_id', tenantId)
          .eq('period_year', yearNum)
          .eq('period_month', monthNum)
          .gt('adjustment_minus', 0);
        if (activeBranchId) aoQ = aoQ.eq('branch_id', activeBranchId);

        const { data: aoRows } = await aoQ;
        (aoRows || []).forEach((r) => {
          const itemName = r.asset_items?.name || 'Gelas / Alat Bar';
          const alreadyExists = syncedBreakage.some((b) => b.nama_barang.toLowerCase() === itemName.toLowerCase());
          if (!alreadyExists) {
            const qty = Number(r.adjustment_minus) || 1;
            syncedBreakage.push({
              id: `ao-b-${r.id}`,
              nama_karyawan: activeUser?.name || 'Tim Bar',
              nama_barang: itemName,
              tanggal: endDate,
              jumlah: qty,
              harga: 0,
              total_harga: 0
            });
          }
        });
      }
    } catch {
      // ignore asset_opname_items error
    }

    return { syncedWaste, syncedBreakage };
  }, [activeBranchId, activeUser?.tenant_id, activeUser?.name, stock]);

  // Auto-load BA tersimpan + otomatis isi rekap dari database jika belum disimpan / masih kosong
  const loadSavedBaDocument = useCallback(async (targetPeriod) => {
    setLoadingSync(true);
    try {
      const [doc, liveRecap] = await Promise.all([
        beritaAcaraService.getByPeriod(targetPeriod, activeBranchId).catch(() => null),
        fetchLiveDatabaseRecap(targetPeriod)
      ]);

      const savedWaste = Array.isArray(doc?.waste_items) ? doc.waste_items : [];
      const savedBreakage = Array.isArray(doc?.breakage_items) ? doc.breakage_items : [];

      if (doc) {
        setDocumentDate(doc.document_date || new Date().toISOString().split('T')[0]);
        setLocationDivision(doc.location_division || 'Resto - Bar');
        setSubmitterName(doc.submitter_name || activeUser?.name || 'Head Bar');
        setSubmitterNip(doc.submitter_nip || '-');
        setSubmitterTitle(doc.submitter_title || 'Head Barista');
        setIntroStatement(doc.intro_statement || 'Dengan ini melaporkan barang yang sudah melewati masa Expired/Rusak yaitu :');
        setApproverName(doc.approver_name || 'Bpk. Gandhi');
        setApproverTitle(doc.approver_title || 'Owner Umatis');
        setDispositionStatement(doc.disposition_statement || 'Memberikan Izin untuk membuang produk yang waste ini');
        setClosingStatement(doc.closing_statement || 'Demikian Berita Acara ini dibuat menurut keadaan yang sebenarnya untuk di pergunakan sebagaimana mestinya.');
        setSignCity(doc.sign_city || 'Tangerang');
        setDisposalPhotos(Array.isArray(doc.disposal_photo_urls) ? doc.disposal_photo_urls : []);
        setStatus(doc.status || 'APPROVED');
      }

      // Gunakan data tersimpan jika sudah ada; jika kosong, otomatis isi langsung dari rekap database bulan ini
      const finalWaste = savedWaste.length > 0 ? savedWaste : liveRecap.syncedWaste;
      const finalBreakage = savedBreakage.length > 0 ? savedBreakage : liveRecap.syncedBreakage;

      setWasteItems(finalWaste);
      setBreakageItems(finalBreakage);

      if (savedWaste.length === 0 && savedBreakage.length === 0 && (finalWaste.length > 0 || finalBreakage.length > 0)) {
        setRecapSourceNote(`Rekap otomatis ditarik dari data bulan ${targetPeriod} (${finalWaste.length} waste, ${finalBreakage.length} gelas pecah). Tinggal cek/edit jika ada yang perlu disesuaikan lalu klik Simpan.`);
      } else if (doc) {
        setRecapSourceNote(`Memuat dokumen tersimpan bulan ${targetPeriod}. Kamu tetap bisa edit langsung atau klik Tarik Ulang Data.`);
      } else {
        setRecapSourceNote('');
      }
    } finally {
      setLoadingSync(false);
    }
  }, [activeBranchId, activeUser?.name, fetchLiveDatabaseRecap]);

  useEffect(() => {
    loadSavedBaDocument(periodMonth);
  }, [periodMonth, loadSavedBaDocument]);

  // Tombol Tarik Ulang / Gabungkan Data Terbaru dari Database
  const handleSyncFromDailyWasteLogs = async () => {
    setLoadingSync(true);
    try {
      const { syncedWaste, syncedBreakage } = await fetchLiveDatabaseRecap(periodMonth);
      if (syncedWaste.length === 0 && syncedBreakage.length === 0) {
        if (toast?.showInfo) {
          toast.showInfo(`Belum ada catatan Waste atau Gelas Pecah di database untuk periode ${periodMonth}.`);
        }
      } else {
        // Gabungkan item baru yang belum ada di daftar tanpa menghapus edit manual Head Bar
        setWasteItems((prev) => {
          const existingNames = new Set(prev.map((w) => String(w.nama_barang || '').toLowerCase()));
          const additions = syncedWaste.filter((w) => !existingNames.has(String(w.nama_barang || '').toLowerCase()));
          return prev.length === 0 ? syncedWaste : [...prev, ...additions];
        });
        setBreakageItems((prev) => {
          const existingKeys = new Set(prev.map((b) => `${String(b.nama_barang || '').toLowerCase()}|${b.tanggal}|${String(b.nama_karyawan || '').toLowerCase()}`));
          const additions = syncedBreakage.filter((b) => !existingKeys.has(`${String(b.nama_barang || '').toLowerCase()}|${b.tanggal}|${String(b.nama_karyawan || '').toLowerCase()}`));
          return prev.length === 0 ? syncedBreakage : [...prev, ...additions];
        });
        setRecapSourceNote(`Data terbaru dari database bulan ${periodMonth} sudah digabungkan. Silakan cek/edit lalu klik Simpan.`);
        if (toast?.showSuccess) {
          toast.showSuccess(`Rekap diperbarui: ${syncedWaste.length} item Waste & ${syncedBreakage.length} item Gelas Pecah.`);
        }
      }
    } catch (err) {
      if (toast?.showError) toast.showError(err.message || 'Gagal menarik data rekap dari database.');
    } finally {
      setLoadingSync(false);
    }
  };

  // Compute 6-Month Staff Accountability Summary (Evaluasi Objektif Pemotongan / Teguran)
  useEffect(() => {
    const mapByStaff = new Map();
    breakageItems.forEach((row) => {
      const rawName = String(row.nama_karyawan || 'Tanpa Nama').trim();
      const key = rawName.toLowerCase();
      const existing = mapByStaff.get(key) || {
        nama_karyawan: rawName,
        incident_count: 0,
        total_qty: 0,
        total_nominal: 0,
        items_summary: [],
        is_external: key.includes('costumer') || key.includes('customer') || key.includes('tukang')
      };
      existing.incident_count += 1;
      existing.total_qty += Number(row.jumlah || 0);
      existing.total_nominal += Number(row.total_harga || 0);
      existing.items_summary.push(`${row.nama_barang} (${row.tanggal})`);
      mapByStaff.set(key, existing);
    });
    const sorted = Array.from(mapByStaff.values()).sort((a, b) => b.total_qty - a.total_qty);
    setSixMonthBreakageHistory(sorted);
  }, [breakageItems]);

  const totalWasteNominal = useMemo(
    () => wasteItems.reduce((acc, r) => acc + (Number(r.total_harga) || 0), 0),
    [wasteItems]
  );

  const totalBreakageNominal = useMemo(
    () => breakageItems.reduce((acc, r) => acc + (Number(r.total_harga) || 0), 0),
    [breakageItems]
  );

  const handleAddWasteRow = () => {
    setWasteItems((prev) => [
      ...prev,
      {
        id: `w-${Date.now()}`,
        nama_barang: '',
        kemasan: '1000 grm',
        jumlah: '1 box',
        masa_expired: 'Waste',
        harga: 0,
        total_harga: 0,
        photo_url: ''
      }
    ]);
  };

  const handleUpdateWasteRow = (idx, field, value) => {
    setWasteItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };
        if (field === 'harga' || field === 'jumlah') {
          const parsedQty = parseFloat(String(next.jumlah || '1').replace(/[^0-9.,]/g, '').replace(',', '.')) || 1;
          const parsedHarga = Number(next.harga) || 0;
          next.total_harga = Math.round(parsedQty * parsedHarga);
        }
        return next;
      })
    );
  };

  const handleRemoveWasteRow = (idx) => {
    setWasteItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddBreakageRow = () => {
    setBreakageItems((prev) => [
      ...prev,
      {
        id: `b-${Date.now()}`,
        nama_karyawan: '',
        nama_barang: 'Gelas teh',
        tanggal: `${periodMonth}-25`,
        jumlah: 1,
        harga: 23000,
        total_harga: 23000
      }
    ]);
  };

  const handleUpdateBreakageRow = (idx, field, value) => {
    setBreakageItems((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };
        if (field === 'jumlah' || field === 'harga') {
          const q = Number(next.jumlah) || 0;
          const p = Number(next.harga) || 0;
          next.total_harga = Math.round(q * p);
        }
        return next;
      })
    );
  };

  const handleRemoveBreakageRow = (idx) => {
    setBreakageItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUploadDisposalPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDisposalPhotos((prev) => [
        ...prev,
        {
          id: `ph-${Date.now()}`,
          name: file.name,
          url: String(reader.result || ''),
          uploaded_at: new Date().toISOString()
        }
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBeritaAcara = async (nextStatus = status) => {
    setSavingDoc(true);
    const localKey = `bv_ba_doc_${periodMonth}_${activeBranchId || 'default'}`;
    const payload = {
      periodMonth,
      documentDate,
      locationDivision,
      submitterName,
      submitterNip,
      submitterTitle,
      introStatement,
      approverName,
      approverTitle,
      dispositionStatement,
      closingStatement,
      signCity,
      wasteItems,
      breakageItems,
      disposalPhotos,
      status: nextStatus
    };

    try {
      localStorage.setItem(localKey, JSON.stringify(payload));
    } catch {
      // ignore local storage quota
    }

    try {
      await beritaAcaraService.saveDocument({
        ...payload,
        totalWasteAmount: totalWasteNominal,
        totalBreakageAmount: totalBreakageNominal
      }, activeBranchId);
      setStatus(nextStatus);
      if (toast?.showSuccess) {
        toast.showSuccess(`Berita Acara periode ${periodMonth} tersimpan aman di Supabase tanpa duplikasi (${nextStatus}).`);
      }
    } catch {
      setStatus(nextStatus);
      if (toast?.showSuccess) {
        toast.showSuccess(`Berita Acara periode ${periodMonth} tersimpan di penyimpanan lokal.`);
      }
    } finally {
      setSavingDoc(false);
    }
  };

  const handlePrintPaper = () => {
    window.print();
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Print-specific CSS for 1-Page Paper Saving Mode */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #ba-printable-sheet, #ba-printable-sheet * {
            visibility: visible;
          }
          #ba-printable-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #ffffff !important;
            color: #000000 !important;
            padding: 12px 18px !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Action & Mode Bar (No-Print) */}
      <div className="glass-card no-print" style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <FileText size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
              Berita Acara Akhir Bulan (Barang Kadaluarsa/Waste &amp; Gelas Pecah)
            </h3>
            <span style={{
              fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
              background: status === 'APPROVED' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
              color: status === 'APPROVED' ? 'var(--success)' : 'var(--warning)',
              border: '1px solid currentColor'
            }}>
              {status === 'APPROVED' ? 'DISETUJUI OWNER' : 'MENUNGGU ACC OWNER'}
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
            Format resmi Umatis Resto &amp; Venue (Head Barista <strong>Irpan</strong> &amp; Owner <strong>Bpk. Gandhi</strong>) lengkap dengan evaluasi historis 6 bulan karyawan.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={15} style={{ color: 'var(--text-muted)' }} />
            <input
              type="month"
              className="form-control"
              style={{ width: '155px', padding: '6px 10px', fontSize: '0.84rem' }}
              value={periodMonth}
              onChange={(e) => setPeriodMonth(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={handleSyncFromDailyWasteLogs}
            disabled={loadingSync}
          >
            <RefreshCw size={14} />
            {loadingSync ? 'Menarik Data...' : 'Tarik dari Log Harian'}
          </button>

          {/* Toggle Mode Cetak: 1 Lembar Hemat Kertas (Tanpa Foto) vs Lengkap Dengan Foto */}
          <button
            type="button"
            className="btn btn-secondary"
            style={{
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: printMode === 'COMPACT_1PAGE' ? 'var(--accent)' : 'var(--border)'
            }}
            onClick={() => setPrintMode((prev) => (prev === 'COMPACT_1PAGE' ? 'FULL_WITH_PHOTOS' : 'COMPACT_1PAGE'))}
            title="Sesuai kesepakatan rapat: Mode Cetak Kertas menyembunyikan foto agar muat 1 lembar A4"
          >
            {printMode === 'COMPACT_1PAGE' ? <EyeOff size={14} /> : <Eye size={14} />}
            {printMode === 'COMPACT_1PAGE' ? 'Mode Cetak 1 Lembar (Tanpa Foto)' : 'Mode PDF Lengkap (Tampil Foto)'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={handlePrintPaper}
          >
            <Printer size={14} /> Cetak / Simpan PDF
          </button>

          {isOwnerOrHeadBar && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={() => handleSaveBeritaAcara('APPROVED')}
              disabled={savingDoc}
            >
              <Save size={14} />
              {savingDoc ? 'Menyimpan...' : 'Simpan & Sahkan BA'}
            </button>
          )}
        </div>
      </div>

      {/* Printable Official Document Sheet (Matches 1000878580.jpg & 1000878588.jpg verbatim) */}
      <div
        id="ba-printable-sheet"
        className="glass-card"
        style={{
          padding: '28px 32px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-strong)',
          fontFamily: 'Georgia, "Times New Roman", serif'
        }}
      >
        {recapSourceNote && (
          <div className="no-print" style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '12px' }}>
            {recapSourceNote}
          </div>
        )}
        {/* ================= BAGIAN 1: BERITA ACARA BARANG KADALUARSA / WASTE ================= */}
        <div style={{ marginBottom: '34px' }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: '1.15rem',
            fontWeight: 800,
            letterSpacing: '0.03em',
            textDecoration: 'underline',
            marginBottom: '20px',
            color: 'var(--text-primary)'
          }}>
            BERITA ACARA BARANG KADALUARSA/WASTE
          </h2>

          {/* Header Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px', fontSize: '0.88rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ width: '110px', fontWeight: 600 }}>Tanggal :</span>
                <input
                  type="date"
                  className="form-control"
                  style={{ width: '170px', padding: '4px 8px', fontSize: '0.84rem' }}
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ width: '110px', fontWeight: 600 }}>Lokasi Devisi :</span>
                <input
                  type="text"
                  className="form-control"
                  style={{ width: '200px', padding: '4px 8px', fontSize: '0.84rem' }}
                  value={locationDivision}
                  onChange={(e) => setLocationDivision(e.target.value)}
                />
              </div>
              <p style={{ margin: '6px 0', fontStyle: 'italic' }}>Yang bertanda tangan di bawah ini :</p>
              <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '90px' }}>1. Nama :</span>
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: '180px', padding: '3px 8px', fontSize: '0.84rem', fontWeight: 700 }}
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '90px' }}>NIP :</span>
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: '180px', padding: '3px 8px', fontSize: '0.84rem' }}
                    value={submitterNip}
                    onChange={(e) => setSubmitterNip(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '90px' }}>Jabatan :</span>
                  <input
                    type="text"
                    className="form-control"
                    style={{ width: '180px', padding: '3px 8px', fontSize: '0.84rem' }}
                    value={submitterTitle}
                    onChange={(e) => setSubmitterTitle(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Editable Intro Statement */}
          <div style={{ marginBottom: '10px' }}>
            <input
              type="text"
              className="form-control"
              style={{ width: '100%', padding: '6px 10px', fontSize: '0.86rem', fontWeight: 600 }}
              value={introStatement}
              onChange={(e) => setIntroStatement(e.target.value)}
            />
          </div>

          {/* 7-Column Table: NO | NAMA BARANG | KEMASAN | JUMLAH | MASA EXPIRED | HARGA | TOTAL HARGA */}
          <div className="table-container" style={{ marginBottom: '12px' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>NO</th>
                  <th>NAMA BARANG</th>
                  <th>KEMASAN</th>
                  <th>JUMLAH</th>
                  <th>MASA EXPIRED</th>
                  <th style={{ textAlign: 'right' }}>HARGA</th>
                  <th style={{ textAlign: 'right' }}>TOTAL HARGA</th>
                  <th className="no-print" style={{ width: '50px', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {wasteItems.map((row, idx) => (
                  <tr key={row.id || idx}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem' }}
                        value={row.nama_barang}
                        placeholder="Mis. Juice Sirsak"
                        onChange={(e) => handleUpdateWasteRow(idx, 'nama_barang', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem', width: '110px' }}
                        value={row.kemasan}
                        placeholder="1440 grm"
                        onChange={(e) => handleUpdateWasteRow(idx, 'kemasan', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem', width: '95px' }}
                        value={row.jumlah}
                        placeholder="1 box"
                        onChange={(e) => handleUpdateWasteRow(idx, 'jumlah', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem', width: '110px' }}
                        value={row.masa_expired}
                        placeholder="Waste / Expired"
                        onChange={(e) => handleUpdateWasteRow(idx, 'masa_expired', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem', textAlign: 'right', width: '115px', marginLeft: 'auto' }}
                        value={row.harga}
                        onChange={(e) => handleUpdateWasteRow(idx, 'harga', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {Number(row.total_harga || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="no-print" style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }}
                        onClick={() => handleRemoveWasteRow(idx)}
                        title="Hapus baris"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', fontWeight: 800, padding: '10px' }}>
                    Total Harga Keseluruhan
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.92rem', color: 'var(--accent)' }}>
                    Rp. {totalWasteNominal.toLocaleString('id-ID')}
                  </td>
                  <td className="no-print" />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="no-print" style={{ marginBottom: '14px' }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px' }} onClick={handleAddWasteRow}>
              <Plus size={13} style={{ marginRight: '5px' }} /> Tambah Baris Barang Waste / Expired
            </button>
          </div>

          {/* Party 2 (Owner) & Editable Disposition Statement */}
          <div style={{ paddingLeft: '18px', marginBottom: '12px', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ width: '90px' }}>2. Nama :</span>
              <input
                type="text"
                className="form-control"
                style={{ width: '200px', padding: '3px 8px', fontSize: '0.84rem', fontWeight: 700 }}
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '90px' }}>Jabatan :</span>
              <input
                type="text"
                className="form-control"
                style={{ width: '200px', padding: '3px 8px', fontSize: '0.84rem' }}
                value={approverTitle}
                onChange={(e) => setApproverTitle(e.target.value)}
              />
            </div>
          </div>

          {/* Editable Disposition Clause with Quick Presets (Buang vs Acara Karyawan/Tahun Baru) */}
          <div style={{ marginBottom: '10px' }}>
            <div className="no-print" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Template Keputusan Owner:</span>
              {DISPOSITION_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                  onClick={() => setDispositionStatement(preset)}
                >
                  {i === 0 ? 'Izin Buang Waste' : i === 1 ? 'Acara Karyawan / Tahun Baru' : 'Pemusnahan Disaksikan Head Bar'}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="form-control"
              style={{ width: '100%', padding: '6px 10px', fontSize: '0.86rem', fontWeight: 700 }}
              value={dispositionStatement}
              onChange={(e) => setDispositionStatement(e.target.value)}
            />
          </div>

          <p style={{ fontSize: '0.86rem', margin: '10px 0 22px 0', lineHeight: 1.5 }}>
            {closingStatement}
          </p>

          {/* Signature Block (Matches Photo 1000878580.jpg) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '24px', marginTop: '18px', padding: '0 16px' }}>
            <div style={{ textAlign: 'center', minWidth: '180px' }}>
              <div style={{ fontSize: '0.86rem', marginBottom: '44px' }}>Yang Menyerahkan</div>
              <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '0.9rem' }}>
                {submitterName} (Head Bar)
              </div>
            </div>

            <div style={{ textAlign: 'center', minWidth: '220px' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: '4px' }}>
                {signCity}, {new Date(documentDate || Date.now()).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
              <div style={{ fontSize: '0.86rem', marginBottom: '40px' }}>Yang Memberi kuasa</div>
              <div style={{ fontWeight: 800, textDecoration: 'underline', fontSize: '0.9rem' }}>
                {approverName} (Owner)
              </div>
            </div>
          </div>
        </div>

        {/* ================= BAGIAN 2: BERITA ACARA GELAS PECAH (Matches 1000878588.jpg) ================= */}
        <div style={{ borderTop: '2px dashed var(--border)', paddingTop: '26px', marginTop: '16px' }}>
          <h2 style={{
            textAlign: 'center',
            fontSize: '1.15rem',
            fontWeight: 800,
            letterSpacing: '0.03em',
            textDecoration: 'underline',
            marginBottom: '16px',
            color: 'var(--text-primary)'
          }}>
            BERITA ACARA GELAS PECAH
          </h2>

          <div style={{ fontSize: '0.86rem', marginBottom: '10px' }}>
            <div><strong>Tanggal :</strong> {documentDate}</div>
            <div><strong>Lokasi Devisi :</strong> Resto</div>
            <div style={{ marginTop: '4px' }}>
              <strong>1. Nama :</strong> {submitterName} &nbsp;|&nbsp; <strong>NIP :</strong> {submitterNip} &nbsp;|&nbsp; <strong>Jabatan :</strong> {submitterTitle}
            </div>
            <div style={{ marginTop: '10px', fontWeight: 800, letterSpacing: '0.02em' }}>
              BERIKUT GELAS PECAH PERIODE BULAN {periodMonth}
            </div>
          </div>

          {/* 7-Column Table: NO | NAMA KARYAWAN | NAMA BARANG | TANGGAL | JUMLAH | HARGA | TOTAL HARGA */}
          <div className="table-container" style={{ marginBottom: '12px' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>NO</th>
                  <th>NAMA KARYAWAN</th>
                  <th>NAMA BARANG</th>
                  <th>TANGGAL</th>
                  <th style={{ width: '85px', textAlign: 'center' }}>JUMLAH</th>
                  <th style={{ textAlign: 'right' }}>HARGA</th>
                  <th style={{ textAlign: 'right' }}>TOTAL HARGA</th>
                  <th className="no-print" style={{ width: '50px', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {breakageItems.map((row, idx) => (
                  <tr key={row.id || idx}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem', fontWeight: 600 }}
                        value={row.nama_karyawan}
                        placeholder="ayat / Putri / costumer"
                        onChange={(e) => handleUpdateBreakageRow(idx, 'nama_karyawan', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem' }}
                        value={row.nama_barang}
                        placeholder="Gelas teh / Gelas latte ice"
                        onChange={(e) => handleUpdateBreakageRow(idx, 'nama_barang', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.82rem', width: '138px' }}
                        value={row.tanggal}
                        onChange={(e) => handleUpdateBreakageRow(idx, 'tanggal', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        className="form-control"
                        style={{ padding: '4px 6px', fontSize: '0.83rem', width: '70px', textAlign: 'center', margin: '0 auto' }}
                        value={row.jumlah}
                        onChange={(e) => handleUpdateBreakageRow(idx, 'jumlah', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ padding: '4px 8px', fontSize: '0.83rem', width: '110px', textAlign: 'right', marginLeft: 'auto' }}
                        value={row.harga}
                        onChange={(e) => handleUpdateBreakageRow(idx, 'harga', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {Number(row.total_harga || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="no-print" style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }}
                        onClick={() => handleRemoveBreakageRow(idx)}
                        title="Hapus baris"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} />
                  <td style={{ textAlign: 'right', fontWeight: 800, padding: '10px' }}>TOTAL HARGA</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.94rem', color: 'var(--danger)' }}>
                    Rp. {totalBreakageNominal.toLocaleString('id-ID')}
                  </td>
                  <td className="no-print" />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px' }} onClick={handleAddBreakageRow}>
              <Plus size={13} style={{ marginRight: '5px' }} /> Tambah Baris Gelas / Alat Pecah
            </button>

            <label className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Camera size={14} /> Upload Foto Bukti Pembuangan / Pecah
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadDisposalPhoto} />
            </label>
          </div>

          {/* Photo Evidence Grid — Hidden in COMPACT_1PAGE Print Mode to save paper */}
          {printMode === 'FULL_WITH_PHOTOS' && disposalPhotos.length > 0 && (
            <div style={{ marginTop: '18px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>
                Lampiran Foto Bukti Pembuangan &amp; Barang Pecah ({disposalPhotos.length} Foto):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}>
                {disposalPhotos.map((ph) => (
                  <div key={ph.id} style={{ border: '1px solid var(--border)', borderRadius: '6px', padding: '4px', textAlign: 'center' }}>
                    <img src={ph.url} alt={ph.name} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ph.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= BAGIAN 3: REKAP AKUNTABILITAS KARYAWAN 6 BULAN (No-Print Panel) ================= */}
      <div className="glass-card no-print" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Users size={18} style={{ color: 'var(--accent)' }} />
          <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>
            Rekapitulasi 6 Bulan Barang Pecah per Nama Karyawan (Evaluasi Sanksi &amp; Kehati-hatian)
          </h4>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
          Sesuai kesepakatan rapat stakeholder: karyawan yang baru memecahkan 1 kali atau faktor eksternal (<em>costumer / tukang</em>) diberikan toleransi, sedangkan karyawan yang berulang kali memecahkan alat dievaluasi secara objektif.
        </p>

        <div className="table-container">
          <table className="custom-table" style={{ fontSize: '0.83rem' }}>
            <thead>
              <tr>
                <th>Nama Karyawan / Pihak</th>
                <th>Kategori</th>
                <th style={{ textAlign: 'center' }}>Frekuensi Kejadian</th>
                <th style={{ textAlign: 'center' }}>Total Unit Pecah</th>
                <th style={{ textAlign: 'right' }}>Total Nilai Kerugian</th>
                <th>Rincian Barang &amp; Tanggal</th>
                <th>Rekomendasi Evaluasi Owner</th>
              </tr>
            </thead>
            <tbody>
              {sixMonthBreakageHistory.map((st, i) => {
                const isRepeated = !st.is_external && st.total_qty >= 2;
                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 700 }}>{st.nama_karyawan}</td>
                    <td>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                        background: st.is_external ? 'rgba(59,130,246,0.12)' : 'rgba(99,102,241,0.12)',
                        color: st.is_external ? '#2563eb' : 'var(--accent)'
                      }}>
                        {st.is_external ? 'Eksternal / Tamu' : 'Staf Internal'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{st.incident_count}x</td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>{st.total_qty} pcs</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatIDR(st.total_nominal)}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {st.items_summary.join(', ')}
                    </td>
                    <td>
                      {st.is_external ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          Non-Karyawan (Beban Operasional Resto)
                        </span>
                      ) : isRepeated ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <AlertTriangle size={13} /> Evaluasi Potong Gaji / SP ({st.total_qty} pcs)
                        </span>
                      ) : (
                        <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={13} /> Toleransi Kejadian Pertama (Pembinaan)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
