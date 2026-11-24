import React, { useState, useMemo, useEffect } from 'react';
import { pettyCashService } from '../../services/modules/stakeholderV4Service';
import useIsMobile from '../../hooks/useIsMobile';
import { Calendar, FileSpreadsheet, FileText, DollarSign, Camera, CheckCircle2, Clock, Search, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { exportToPDF } from '../../services/export/pdfExporter';
import { formatIDR } from '../../services/costUtils';
import { exportWithAudit } from '../../services/export/exportAudit';

// Semua data Petty Cash & Tempo bersumber langsung dari database Supabase (tanpa data dummy).

const MONTH_OPTIONS = [
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

export default function PurchasingMatrixAndPettyCash({
  mode = 'MATRIX',
  purchases = [],
  materials = [],
  period = '2026-11',
  onPeriodChange = null,
  activeUser = null
}) {
  const isMobile = useIsMobile(768);
  const [matrixSearch, setMatrixSearch] = useState('');

  const parsedInitialPeriod = useMemo(() => {
    const now = new Date();
    const parts = String(period || '').split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return {
      year: Number.isFinite(y) && y >= 2020 ? y : now.getFullYear(),
      month: Number.isFinite(m) && m >= 1 && m <= 12 ? m : now.getMonth() + 1
    };
  }, [period]);

  const [selectedYear, setSelectedYear] = useState(parsedInitialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(parsedInitialPeriod.month);
  const [periodPurchases, setPeriodPurchases] = useState(null);
  const [loadingMatrix, setLoadingMatrix] = useState(false);

  const effectivePeriod = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const selectedMonthLabel = MONTH_OPTIONS.find((m) => m.value === selectedMonth)?.label || `Bulan ${selectedMonth}`;
  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    const years = [];
    for (let y = base - 3; y <= base + 2; y++) years.push(y);
    if (!years.includes(selectedYear)) years.push(selectedYear);
    return years.sort((a, b) => b - a);
  }, [selectedYear]);

  // Fetch ALL purchase entries for the chosen Month & Year so matrix & full export are never truncated by pagination
  useEffect(() => {
    if (mode !== 'MATRIX') return;
    let active = true;
    setLoadingMatrix(true);
    api.getPurchaseEntriesPaged({
      page: 1,
      pageSize: 100000,
      search: '',
      period: effectivePeriod
    })
      .then((res) => {
        if (active && Array.isArray(res?.data)) {
          setPeriodPurchases(res.data);
        }
      })
      .catch(() => {
        if (active) setPeriodPurchases(null);
      })
      .finally(() => {
        if (active) setLoadingMatrix(false);
      });
    return () => { active = false; };
  }, [mode, effectivePeriod]);
  const [pettyCashRows, setPettyCashRows] = useState(() => {
    try {
      const raw = localStorage.getItem('bv_petty_cash_accurate_v3');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  useEffect(() => {
    if (mode !== 'PETTY_CASH') return;
    let active = true;
    pettyCashService.listEntries(period)
      .then((rows) => {
        if (active && Array.isArray(rows) && rows.length > 0) setPettyCashRows(rows);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [mode, period]);
  const [newPcRow, setNewPcRow] = useState({
    date: new Date().toISOString().split('T')[0],
    item_name: '',
    supplier: 'Pasar Umum',
    qty: 1,
    unit: 'kg',
    unit_price: 25000,
    payment_method: 'PETTY_CASH',
    payment_status: 'PAID',
    due_date: '',
    notes: ''
  });

  // Determine exact number of days in selected Month & Year (28, 29, 30, or 31)
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // Build FULL Monthly Purchase Matrix for the selected Month & Year (unfiltered for complete exports)
  const allMatrixData = useMemo(() => {
    const mapByMat = new Map();
    const sourcePurchases = Array.isArray(periodPurchases)
      ? periodPurchases
      : (purchases || []).filter((p) => String(p.date || '').startsWith(effectivePeriod));

    (materials || []).forEach((m) => {
      mapByMat.set(String(m.name || '').toLowerCase().trim(), {
        id: m.id,
        name: m.name,
        unit: m.unit || 'pck',
        unit_price: Number(m.new_price || m.price || 0),
        days: {},
        totalQty: 0,
        totalNominal: 0
      });
    });

    sourcePurchases.forEach((p) => {
      const dateStr = String(p.date || '');
      if (dateStr && !dateStr.startsWith(effectivePeriod)) return;
      const matName = p.materials?.name || p.item_name || p.name || 'Bahan Umum';
      const key = String(matName).toLowerCase().trim();
      const dayNum = parseInt(dateStr.split('-')[2], 10);
      const qty = parseFloat(p.qty) || 0;
      const uPrice = parseFloat(p.unit_price) || 0;

      if (!mapByMat.has(key)) {
        mapByMat.set(key, {
          id: p.material_id || key,
          name: matName,
          unit: p.unit || 'pck',
          unit_price: uPrice,
          days: {},
          totalQty: 0,
          totalNominal: 0
        });
      }
      const entry = mapByMat.get(key);
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        entry.days[dayNum] = (entry.days[dayNum] || 0) + qty;
      }
      entry.totalQty += qty;
      entry.totalNominal += qty * uPrice;
    });

    return Array.from(mapByMat.values()).sort((a, b) => {
      if (b.totalNominal !== a.totalNominal) return b.totalNominal - a.totalNominal;
      if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [materials, purchases, periodPurchases, effectivePeriod, daysInMonth]);

  const matrixData = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    return q ? allMatrixData.filter((r) => String(r.name || '').toLowerCase().includes(q)) : allMatrixData;
  }, [allMatrixData, matrixSearch]);

  const grandTotals = useMemo(() => {
    const perDay = {};
    let totalQty = 0;
    let totalNominal = 0;
    let activeMaterials = 0;
    allMatrixData.forEach((r) => {
      if (r.totalQty > 0 || r.totalNominal > 0) activeMaterials += 1;
      totalQty += r.totalQty;
      totalNominal += r.totalNominal;
      dayNumbers.forEach((d) => {
        perDay[d] = (perDay[d] || 0) + (r.days[d] || 0);
      });
    });
    return { perDay, totalQty, totalNominal, activeMaterials, totalMaterials: allMatrixData.length };
  }, [allMatrixData, dayNumbers]);

  const handleChangeMonth = (nextMonth) => {
    const m = parseInt(nextMonth, 10);
    setSelectedMonth(m);
    if (typeof onPeriodChange === 'function') {
      onPeriodChange(`${selectedYear}-${String(m).padStart(2, '0')}`);
    }
  };

  const handleChangeYear = (nextYear) => {
    const y = parseInt(nextYear, 10);
    setSelectedYear(y);
    if (typeof onPeriodChange === 'function') {
      onPeriodChange(`${y}-${String(selectedMonth).padStart(2, '0')}`);
    }
  };

  const handleExportMatrixExcel = async () => {
    // Export ALL materials (keseluruhan) with daily QTY, Total Qty, Total Belanja, and Grand Total row
    const rows = allMatrixData.map((r, idx) => {
      const rowObj = {
        NO: idx + 1,
        'NAMA BAHAN BAKU': r.name,
        SATUAN: r.unit
      };
      dayNumbers.forEach((d) => {
        rowObj[`Tgl ${d}`] = r.days[d] || 0;
      });
      rowObj['TOTAL QTY'] = r.totalQty;
      rowObj['TOTAL BELANJA (RP)'] = r.totalNominal;
      return rowObj;
    });

    const grandTotalRow = {
      NO: '',
      'NAMA BAHAN BAKU': `TOTAL KESELURUHAN (${selectedMonthLabel} ${selectedYear})`,
      SATUAN: `${grandTotals.totalMaterials} bahan`
    };
    dayNumbers.forEach((d) => {
      grandTotalRow[`Tgl ${d}`] = grandTotals.perDay[d] || 0;
    });
    grandTotalRow['TOTAL QTY'] = grandTotals.totalQty;
    grandTotalRow['TOTAL BELANJA (RP)'] = grandTotals.totalNominal;
    rows.push(grandTotalRow);

    const summaryRows = [
      { Keterangan: 'Periode Rekap', Nilai: `${selectedMonthLabel} ${selectedYear} (Tgl 1 s/d ${daysInMonth})` },
      { Keterangan: 'Total Jenis Bahan', Nilai: grandTotals.totalMaterials },
      { Keterangan: 'Bahan Ada Pembelian', Nilai: grandTotals.activeMaterials },
      { Keterangan: 'Total QTY Keseluruhan', Nilai: grandTotals.totalQty },
      { Keterangan: 'Total Belanja Keseluruhan (Rp)', Nilai: grandTotals.totalNominal }
    ];

    await exportWithAudit({
      format: 'excel',
      filename: `Rekap_Belanja_Bulanan_${selectedMonthLabel}_${selectedYear}`,
      sheets: [
        { name: `Matriks Tgl 1-${daysInMonth}`, rows },
        { name: 'Ringkasan Keseluruhan', rows: summaryRows }
      ],
      actionName: 'Export Monthly Purchase Matrix (Full)',
      role: activeUser?.role || 'Purchasing'
    });
  };

  const handleExportMatrixPdf = async () => {
    const pdfRows = allMatrixData.map((r, idx) => {
      const activeDaysCount = dayNumbers.filter((d) => (r.days[d] || 0) > 0).length;
      return {
        no: idx + 1,
        name: r.name,
        unit: r.unit,
        activeDays: activeDaysCount > 0 ? `${activeDaysCount} hari` : '-',
        totalQty: `${r.totalQty} ${r.unit}`,
        totalNominal: formatIDR(r.totalNominal)
      };
    });

    pdfRows.push({
      no: '',
      name: `TOTAL PEMBELIAN (${grandTotals.totalMaterials} bahan)`,
      unit: '',
      activeDays: `${grandTotals.activeMaterials} bahan aktif`,
      totalQty: String(grandTotals.totalQty),
      totalNominal: formatIDR(grandTotals.totalNominal)
    });

    await exportToPDF({
      filename: `Rekap_Belanja_Bulanan_${selectedMonthLabel}_${selectedYear}`,
      title: `Rekap Pembelian Bulanan Keseluruhan - ${selectedMonthLabel} ${selectedYear}
Periode: Tanggal 1 s/d ${daysInMonth} ${selectedMonthLabel} ${selectedYear}
Total Bahan: ${grandTotals.totalMaterials} jenis (${grandTotals.activeMaterials} ada pembelian) | Total QTY: ${grandTotals.totalQty} | Total Belanja: ${formatIDR(grandTotals.totalNominal)}`,
      tenantName: 'BARVENTIS - Rekap Pembelian Bulanan',
      orientation: 'portrait',
      columns: [
        { key: 'no', label: '#' },
        { key: 'name', label: 'Nama Bahan Baku' },
        { key: 'unit', label: 'Unit' },
        { key: 'activeDays', label: 'Frekuensi' },
        { key: 'totalQty', label: 'Total Qty' },
        { key: 'totalNominal', label: 'Total Belanja (Rp)' }
      ],
      rows: pdfRows
    });
  };

  const handleTogglePaymentStatus = (rowId) => {
    const target = pettyCashRows.find((r) => r.id === rowId);
    if (target) pettyCashService.updatePaymentState(rowId, { payment_status: target.payment_status === 'PAID' ? 'UNPAID' : 'PAID', payment_proof_url: target.proof_photo }).catch(() => {});
    const updated = pettyCashRows.map((r) =>
      r.id === rowId
        ? { ...r, payment_status: r.payment_status === 'PAID' ? 'UNPAID' : 'PAID' }
        : r
    );
    setPettyCashRows(updated);
    try {
      localStorage.setItem('bv_petty_cash_accurate_v3', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const handleUploadPaymentProof = (rowId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const updated = pettyCashRows.map((r) =>
        r.id === rowId
          ? { ...r, proof_photo: String(reader.result || ''), payment_status: 'PAID' }
          : r
      );
      setPettyCashRows(updated);
      try {
        localStorage.setItem('bv_petty_cash_accurate_v3', JSON.stringify(updated));
      } catch {
        // ignore
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddPettyCashRow = (e) => {
    e.preventDefault();
    if (!newPcRow.item_name.trim()) return;
    const q = parseFloat(newPcRow.qty) || 1;
    const p = parseFloat(newPcRow.unit_price) || 0;
    const created = {
      id: `pc-${Date.now()}`,
      ...newPcRow,
      qty: q,
      unit_price: p,
      total: Math.round(q * p),
      location: 'RESTO',
      accurate_account:
        newPcRow.payment_method === 'PETTY_CASH'
          ? '1101-02 Kas Kecil Resto (Petty Cash)'
          : '2101-01 Hutang Dagang Supplier (Tempo)',
      proof_photo: ''
    };
    const updated = [created, ...pettyCashRows];
    setPettyCashRows(updated);
    try {
      localStorage.setItem('bv_petty_cash_accurate_v3', JSON.stringify(updated));
    } catch {
      // ignore
    }
    setNewPcRow((prev) => ({ ...prev, item_name: '', notes: '' }));
  };

  const handleExportAccurateExcel = async () => {
    const rows = pettyCashRows.map((r, i) => ({
      NO: i + 1,
      TANGGAL: r.date,
      'NAMA BARANG / BELANJA': r.item_name,
      SUPPLIER: r.supplier,
      LOKASI: r.location,
      QTY: r.qty,
      SATUAN: r.unit,
      'HARGA SATUAN (BON)': r.unit_price,
      'TOTAL (RP)': r.total,
      'METODE BAYAR': r.payment_method,
      'STATUS BAYAR': r.payment_status === 'PAID' ? 'SUDAH DIBAYAR' : 'BELUM DIBAYAR',
      'AKUN JURNAL ACCURATE': r.accurate_account,
      CATATAN: r.notes
    }));
    await exportWithAudit({
      format: 'excel',
      filename: `Rekap_Petty_Cash_&_Tempo_Accurate_${period}`,
      sheets: [{ name: 'Jurnal Accurate Petty Cash', rows }],
      actionName: 'Export Petty Cash Accurate',
      role: activeUser?.role || 'Purchasing'
    });
  };

  if (mode === 'PETTY_CASH') {
    const filteredPc = pettyCashRows.filter((r) =>
      paymentFilter === 'ALL' ? true : r.payment_status === paymentFilter
    );

    return (
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <DollarSign size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                Rekap Belanja Petty Cash Resto (Input Accurate) &amp; Bukti Pembayaran Tempo
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
              Memisahkan belanja dadakan menggunakan <strong>Petty Cash Kasir Resto</strong> (seperti <em>Kelapa Urgent</em>, <em>Cincau Hijau</em>, atau <em>Pasar Umum</em>) untuk diinput ke <strong>Accurate</strong>, sekaligus memantau tagihan PO Tempo beserta bukti transfernya.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="form-control"
              style={{ width: '185px', fontSize: '0.82rem', fontWeight: 600 }}
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="ALL">Semua Status Bayar</option>
              <option value="UNPAID">Belum Dibayar (Tempo)</option>
              <option value="PAID">Sudah Dibayar / Lunas</option>
            </select>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={handleExportAccurateExcel}
            >
              <FileSpreadsheet size={15} /> Export Jurnal Accurate (Excel)
            </button>
          </div>
        </div>

        {/* Quick Form to Record Urgent Petty Cash / Tempo Purchase */}
        <form
          onSubmit={handleAddPettyCashRow}
          style={{
            padding: '14px 16px',
            borderRadius: '10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
            alignItems: 'end'
          }}
        >
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700 }}>Tanggal</label>
            <input
              type="date"
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '6px 8px' }}
              value={newPcRow.date}
              onChange={(e) => setNewPcRow({ ...newPcRow, date: e.target.value })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700 }}>Nama Barang (Urgent/Bon)</label>
            <input
              type="text"
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '6px 8px' }}
              placeholder="Mis. Kelapa / Jeruk Pontianak"
              value={newPcRow.item_name}
              onChange={(e) => setNewPcRow({ ...newPcRow, item_name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700 }}>Supplier</label>
            <input
              type="text"
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '6px 8px' }}
              value={newPcRow.supplier}
              onChange={(e) => setNewPcRow({ ...newPcRow, supplier: e.target.value })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700 }}>Harga Bon Fisik (Rp)</label>
            <input
              type="number"
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '6px 8px' }}
              value={newPcRow.unit_price}
              onChange={(e) => setNewPcRow({ ...newPcRow, unit_price: e.target.value })}
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 700 }}>Sumber Dana</label>
            <select
              className="form-control"
              style={{ fontSize: '0.8rem', padding: '6px 8px' }}
              value={newPcRow.payment_method}
              onChange={(e) =>
                setNewPcRow({
                  ...newPcRow,
                  payment_method: e.target.value,
                  payment_status: e.target.value === 'TEMPO' ? 'UNPAID' : 'PAID'
                })
              }
            >
              <option value="PETTY_CASH">Petty Cash Resto (Accurate)</option>
              <option value="CASH">Cash Langsung</option>
              <option value="TEMPO">Tempo / Hutang Supplier</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ padding: '7px 12px', fontSize: '0.8rem', fontWeight: 700 }}>
            <Plus size={14} style={{ marginRight: '4px' }} /> Catat Transaksi
          </button>
        </form>

        <div className="table-container">
          <table className="custom-table" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Nama Barang &amp; Catatan</th>
                <th>Supplier</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Harga Bon</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Metode &amp; Akun Accurate</th>
                <th style={{ textAlign: 'center' }}>Status Bayar</th>
                <th style={{ textAlign: 'center' }}>Bukti Pembayaran</th>
              </tr>
            </thead>
            <tbody>
              {filteredPc.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{row.item_name}</div>
                    {row.notes && <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>{row.notes}</div>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{row.supplier}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{row.qty} {row.unit}</td>
                  <td style={{ textAlign: 'right' }}>{formatIDR(row.unit_price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatIDR(row.total)}</td>
                  <td>
                    <div style={{ fontWeight: 700, fontSize: '0.76rem', color: 'var(--accent)' }}>{row.payment_method}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{row.accurate_account}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleTogglePaymentStatus(row.id)}
                      style={{
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: row.payment_status === 'PAID' ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)',
                        color: row.payment_status === 'PAID' ? 'var(--success)' : 'var(--danger)'
                      }}
                      title="Klik untuk mengubah status pembayaran"
                    >
                      {row.payment_status === 'PAID' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {row.payment_status === 'PAID' ? 'SUDAH DIBAYAR' : 'BELUM DIBAYAR'}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {row.proof_photo ? (
                      <a href={row.proof_photo} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success)' }}>
                        Lihat Foto Bukti
                      </a>
                    ) : (
                      <label className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 8px', cursor: 'pointer', margin: 0 }}>
                        <Camera size={12} style={{ marginRight: '4px' }} /> Upload Bukti
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUploadPaymentProof(row.id, e)} />
                      </label>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <Calendar size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
              Rekap Belanja Bulanan ({selectedMonthLabel} {selectedYear} · Tgl 1–{daysInMonth})
            </h3>
            {loadingMatrix && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Memuat data...</span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            Rincian belanja harian per bahan beserta total QTY ({grandTotals.totalQty.toLocaleString('id-ID')}) dan total belanja ({formatIDR(grandTotals.totalNominal)}).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            aria-label="Pilih Bulan"
            value={selectedMonth}
            onChange={(e) => handleChangeMonth(e.target.value)}
            style={{ width: '132px', fontSize: '0.82rem', padding: '7px 10px' }}
          >
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <select
            className="form-control"
            aria-label="Pilih Tahun"
            value={selectedYear}
            onChange={(e) => handleChangeYear(e.target.value)}
            style={{ width: '92px', fontSize: '0.82rem', padding: '7px 10px' }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div style={{ position: 'relative', width: '210px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '32px', fontSize: '0.82rem' }}
              placeholder="Cari bahan..."
              value={matrixSearch}
              onChange={(e) => setMatrixSearch(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={handleExportMatrixExcel}
            title="Export semua bahan lengkap dengan QTY harian, Total QTY, dan Total Belanja"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={handleExportMatrixPdf}
            title="Export rekap keseluruhan ke PDF lengkap dengan stempel validasi"
          >
            <FileText size={15} /> PDF
          </button>
        </div>
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {matrixData.slice(0, 40).map((row) => {
            const activeDays = dayNumbers.filter((d) => (row.days[d] || 0) > 0);
            return (
              <div key={row.id} style={{ padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', minWidth: 0 }}>{row.name}</div>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{formatIDR(row.totalNominal)}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Total Sebulan: <strong>{row.totalQty} {row.unit}</strong> ({activeDays.length} hari belanja)
                </div>
                {activeDays.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {activeDays.map((d) => (
                      <span key={d} style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)', color: 'var(--accent)' }}>
                        Tgl {d}: {row.days[d]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <div className="table-container" style={{ overflowX: 'auto', maxWidth: '100%' }}>
        <table className="custom-table" style={{ fontSize: '0.76rem', minWidth: '1400px' }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 5, minWidth: '210px' }}>
                Nama Bahan Baku
              </th>
              <th style={{ width: '65px', textAlign: 'center' }}>Unit</th>
              {dayNumbers.map((d) => (
                <th key={d} style={{ width: '36px', textAlign: 'center', padding: '6px 4px' }}>
                  {d}
                </th>
              ))}
              <th style={{ textAlign: 'right', minWidth: '95px', background: 'rgba(16,185,129,0.08)' }}>Total Qty</th>
              <th style={{ textAlign: 'right', minWidth: '130px', background: 'rgba(16,185,129,0.08)' }}>Total Belanja (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {matrixData.map((row) => (
              <tr key={row.id}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 4, fontWeight: 700 }}>
                  {row.name}
                </td>
                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{row.unit}</td>
                {dayNumbers.map((d) => {
                  const val = row.days[d] || 0;
                  return (
                    <td
                      key={d}
                      style={{
                        textAlign: 'center',
                        padding: '6px 3px',
                        fontWeight: val > 0 ? 800 : 400,
                        color: val > 0 ? 'var(--accent)' : 'var(--text-muted)',
                        background: val > 0 ? 'rgba(16,185,129,0.07)' : 'transparent'
                      }}
                    >
                      {val > 0 ? val : '-'}
                    </td>
                  );
                })}
                <td style={{ textAlign: 'right', fontWeight: 800, background: 'rgba(16,185,129,0.04)' }}>
                  {row.totalQty} {row.unit}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)', background: 'rgba(16,185,129,0.04)' }}>
                  {formatIDR(row.totalNominal)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: 'rgba(16,185,129,0.08)', fontWeight: 800 }}>
              <td style={{ position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 4, fontWeight: 800 }}>
                TOTAL KESELURUHAN ({grandTotals.totalMaterials} bahan)
              </td>
              <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>-</td>
              {dayNumbers.map((d) => (
                <td key={d} style={{ textAlign: 'center', padding: '7px 3px', color: grandTotals.perDay[d] > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {grandTotals.perDay[d] > 0 ? grandTotals.perDay[d] : '-'}
                </td>
              ))}
              <td style={{ textAlign: 'right', fontWeight: 800 }}>
                {grandTotals.totalQty.toLocaleString('id-ID')}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)' }}>
                {formatIDR(grandTotals.totalNominal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      )}
    </div>
  );
}
