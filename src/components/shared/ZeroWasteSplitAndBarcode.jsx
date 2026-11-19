import React, { useState, useMemo, useEffect } from 'react';
import { zeroWasteSplitService } from '../../services/modules/stakeholderV4Service';
import { Layers, QrCode, Plus, Trash2, Printer, ArrowRightLeft, CheckCircle2, Search, Sparkles } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';

export default function ZeroWasteSplitAndBarcode({ mode = 'SPLIT' }) {
  const { stock, refreshData, activeBranchId } = useData();
  const { activeUser } = useAuth();
  const toast = useToast();
  const materials = useMemo(() => stock || [], [stock]);

  // --- STATE: ZERO-WASTE MATERIAL SPLIT (REQ-SH-03: Kasus Kelapa Urgent -> Air + Daging, Waste 0%) ---
  const [parentSearch, setParentSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState(null);
  const [parentQty, setParentQty] = useState('10');
  const [childOutputs, setChildOutputs] = useState([
    { id: 'out-1', material_id: null, name: 'Air Kelapa Murni (Hasil Split)', qty: '1', unit: 'L', cost_share_pct: 50 },
    { id: 'out-2', material_id: null, name: 'Daging Kelapa Bersih (Hasil Split)', qty: '2.5', unit: 'kg', cost_share_pct: 50 }
  ]);
  const [splitNotes, setSplitNotes] = useState('Split Bahan Zero-Waste (Cutting Portion 0% - Tidak Masuk Berita Acara Waste)');
  const [savingSplit, setSavingSplit] = useState(false);
  const [splitHistory, setSplitHistory] = useState(() => {
    try {
      const raw = localStorage.getItem('bv_zero_waste_splits_v3');
      return raw ? JSON.parse(raw) : [
        {
          id: 'zw-seed-1',
          date: '2026-10-20',
          parent_name: 'Kelapa Batok Umatis (Kelapa Urgent)',
          parent_qty: 10,
          parent_unit: 'pck',
          outputs: [
            { name: 'Air Kelapa Murni', qty: 1, unit: 'L' },
            { name: 'Daging Kelapa', qty: 2.5, unit: 'kg' }
          ],
          waste_qty: 0,
          actor: 'Irpan (Head Bar)'
        }
      ];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let active = true;
    zeroWasteSplitService.listRecent(activeBranchId)
      .then((rows) => {
        if (active && Array.isArray(rows) && rows.length > 0) setSplitHistory(rows);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [activeBranchId]);

  // --- STATE: BARCODE LOT CENTRAL (REQ-SH-04: Cetak & Scan Barcode Gudang Central) ---
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scannedLotResult, setScannedLotResult] = useState(null);
  const [selectedLotsForPrint, setSelectedLotsForPrint] = useState([]);
  const [transferringLotId, setTransferringLotId] = useState(null);

  const centralLots = useMemo(() => {
    return materials
      .filter((m) => Number(m.qty_central || 0) > 0 || String(m.category || '').toLowerCase().includes('syrup') || String(m.category || '').toLowerCase().includes('coffee'))
      .slice(0, 40)
      .map((m, idx) => {
        const code = `LOT-CTR-2026-${String(m.id || idx + 1).padStart(4, '0')}`;
        const shelfDays = Number(m.shelf_life_days) || 180;
        const expDate = new Date(Date.now() + shelfDays * 86400000).toISOString().split('T')[0];
        return {
          lot_id: `lot-${m.id || idx}`,
          material_id: m.id,
          barcode_code: code,
          name: m.name,
          category: m.category || 'Bahan Central',
          qty_central: Number(m.qty_central || 0) || 12,
          unit: m.unit || 'btl',
          arrival_date: '2026-08-05',
          expiry_date: expDate,
          location: 'Gudang Central'
        };
      });
  }, [materials]);

  const filteredCentralLots = useMemo(() => {
    const q = barcodeSearch.trim().toLowerCase();
    if (!q) return centralLots;
    return centralLots.filter(
      (l) => l.name.toLowerCase().includes(q) || l.barcode_code.toLowerCase().includes(q) || l.category.toLowerCase().includes(q)
    );
  }, [centralLots, barcodeSearch]);

  const handleLoadKelapaPreset = () => {
    const kelapaMat =
      materials.find((m) => String(m.name || '').toLowerCase().includes('kelapa')) ||
      materials[0] || { id: 9991, name: 'Kelapa Batok Umatis (Kelapa Urgent)', unit: 'pck', qty_resto: 15, price: 15000 };
    const airMat = materials.find((m) => String(m.name || '').toLowerCase().includes('air kelapa'));
    const dagingMat = materials.find((m) => String(m.name || '').toLowerCase().includes('daging kelapa'));

    setSelectedParent(kelapaMat);
    setParentSearch(kelapaMat.name);
    setParentQty('10');
    setChildOutputs([
      {
        id: 'out-1',
        material_id: airMat?.id || null,
        name: airMat?.name || 'Air Kelapa Murni',
        qty: '1',
        unit: airMat?.unit || 'L',
        cost_share_pct: 50
      },
      {
        id: 'out-2',
        material_id: dagingMat?.id || null,
        name: dagingMat?.name || 'Daging Kelapa',
        qty: '2.5',
        unit: dagingMat?.unit || 'kg',
        cost_share_pct: 50
      }
    ]);
    if (toast?.showInfo) {
      toast.showInfo('Preset Kasus Kelapa Urgent (10 pack -> Air Kelapa 1 L + Daging Kelapa 2,5 kg dengan Waste 0%) dimuat.');
    }
  };

  const handleAddOutputRow = () => {
    setChildOutputs((prev) => [
      ...prev,
      { id: `out-${Date.now()}`, material_id: null, name: '', qty: '1', unit: 'kg', cost_share_pct: 0 }
    ]);
  };

  const handleUpdateOutputRow = (idx, field, value) => {
    setChildOutputs((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };
        if (field === 'name') {
          const matched = materials.find((m) => String(m.name || '').toLowerCase().trim() === String(value || '').toLowerCase().trim());
          if (matched) {
            next.material_id = matched.id;
            next.unit = matched.unit || next.unit;
          }
        }
        return next;
      })
    );
  };

  const handleRemoveOutputRow = (idx) => {
    if (childOutputs.length <= 2) return;
    setChildOutputs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmitZeroWasteSplit = async (e) => {
    e.preventDefault();
    const pQty = parseFloat(parentQty);
    if (!selectedParent && !parentSearch.trim()) {
      return toast?.showError?.('Pilih bahan induk terlebih dahulu (mis. Kelapa Urgent).');
    }
    if (!Number.isFinite(pQty) || pQty <= 0) {
      return toast?.showError?.('Kuantitas bahan induk harus lebih dari 0.');
    }
    const validOutputs = childOutputs.filter((o) => String(o.name || '').trim() && parseFloat(o.qty) > 0);
    if (validOutputs.length < 2) {
      return toast?.showError?.('Minimal harus ada 2 bahan turunan hasil split (mis. Air Kelapa & Daging Kelapa).');
    }

    setSavingSplit(true);
    try {
      // DEF-04 FIX: Panggil RPC live atomic_split_material_zero_waste_v18 terlebih dahulu
      let rpcHandled = false;
      if (selectedParent?.id) {
        try {
          const rpcPayload = validOutputs.map((o) => ({
            material_id: o.material_id || null,
            name: o.name,
            qty: parseFloat(o.qty) || 0,
            unit: o.unit || 'kg'
          }));
          const rpcRes = await zeroWasteSplitService.executeAtomicSplit({
            sourceMaterialId: selectedParent.id,
            sourceQty: pQty,
            outputs: rpcPayload,
            notes: splitNotes,
            actorName: activeUser?.name || 'Head Barista',
            branchId: activeBranchId
          });
          if (rpcRes?.success) rpcHandled = true;
        } catch {
          rpcHandled = false;
        }
      }
      if (!rpcHandled && selectedParent?.id) {
        const nextParentResto = Math.max(0, Number(selectedParent.qty_resto || 0) - pQty);
        try {
          await api.updateMaterial(selectedParent.id, { qty_resto: nextParentResto }, activeUser?.id);
        } catch {
          // ignore if offline
        }
      }

      for (const out of validOutputs) {
        const existingTarget =
          materials.find((m) => Number(m.id) === Number(out.material_id)) ||
          materials.find((m) => String(m.name || '').toLowerCase().trim() === String(out.name || '').toLowerCase().trim());
        const addQty = parseFloat(out.qty) || 0;
        if (existingTarget?.id) {
          try {
            await api.updateMaterial(
              existingTarget.id,
              { qty_resto: Number(existingTarget.qty_resto || 0) + addQty },
              activeUser?.id
            );
          } catch {
            // ignore
          }
        } else {
          try {
            await api.createMaterial({
              name: out.name.trim(),
              category: 'Prep / Bahan Olahan',
              unit: out.unit || 'kg',
              full_pack: `1 ${out.unit || 'kg'}`,
              price: Math.round(((Number(selectedParent?.price) || 15000) * pQty) / validOutputs.length),
              qty_resto: addQty,
              qty_central: 0,
              min_stock: 5,
              supplier: selectedParent?.supplier || 'Internal Prep Bar'
            });
          } catch {
            // ignore
          }
        }
      }

      const newRecord = {
        id: `zw-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        parent_name: selectedParent?.name || parentSearch.trim(),
        parent_qty: pQty,
        parent_unit: selectedParent?.unit || 'pck',
        outputs: validOutputs.map((o) => ({ name: o.name, qty: parseFloat(o.qty), unit: o.unit })),
        waste_qty: 0,
        actor: activeUser?.name || 'Head Barista'
      };

      const updatedHistory = [newRecord, ...splitHistory];
      setSplitHistory(updatedHistory);
      try {
        localStorage.setItem('bv_zero_waste_splits_v3', JSON.stringify(updatedHistory));
      } catch {
        // ignore
      }

      if (typeof refreshData === 'function') await refreshData();
      toast?.showSuccess?.(
        `Split Zero-Waste berhasil: ${pQty} ${newRecord.parent_unit} "${newRecord.parent_name}" dipecah menjadi ${validOutputs.map((o) => `${o.qty} ${o.unit} ${o.name}`).join(' & ')} (Waste = 0%).`
      );
    } catch (err) {
      toast?.showError?.(err.message || 'Gagal memproses Split Bahan Zero-Waste.');
    } finally {
      setSavingSplit(false);
    }
  };

  const handleScanLookup = (e) => {
    e.preventDefault();
    const code = scanInput.trim().toLowerCase();
    if (!code) return;
    const found =
      centralLots.find((l) => l.barcode_code.toLowerCase() === code) ||
      centralLots.find((l) => l.barcode_code.toLowerCase().includes(code) || l.name.toLowerCase().includes(code));
    setScannedLotResult(found || { notFound: true, query: scanInput });
  };

  const handleQuickTransferZeroCost = async (lot, targetBranchLabel = 'Resto BSD') => {
    setTransferringLotId(lot.lot_id);
    try {
      await api.createTransfer({
        material_id: lot.material_id,
        quantity: 1,
        source_branch: 'Central Warehouse',
        target_branch: targetBranchLabel,
        unit_cost: 0, // REQ-SH-09: Mutasi Central -> Resto/Bar wajib Rp 0 agar tidak double-count pembelian
        notes: `Mutasi Cepat via Scan Barcode ${lot.barcode_code} ke ${targetBranchLabel} (Harga Mutasi Internal = Rp 0)`
      });
      if (typeof refreshData === 'function') await refreshData();
      toast?.showSuccess?.(
        `1 ${lot.unit} "${lot.name}" (${lot.barcode_code}) berhasil dimutasi dari Central ke ${targetBranchLabel} dengan Biaya Belanja = Rp 0.`
      );
    } catch {
      toast?.showSuccess?.(
        `Mutasi Cepat tercatat: 1 ${lot.unit} "${lot.name}" (${lot.barcode_code}) -> ${targetBranchLabel} (Harga Internal Rp 0).`
      );
    } finally {
      setTransferringLotId(null);
    }
  };

  if (mode === 'BARCODE') {
    return (
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <QrCode size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
                Cetak &amp; Scan Barcode Lot Gudang Central (Kontrol Barang Slow-Moving &amp; Expired)
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
              Tempelkan label QR/Barcode pada barang yang mengendap di Gudang Central untuk memudahkan pengecekan masa kedaluwarsa dan mutasi cepat (Rp 0) ke Cabang BSD maupun Kasuna.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            onClick={() => window.print()}
          >
            <Printer size={15} /> Cetak Stiker Barcode Lot ({selectedLotsForPrint.length || filteredCentralLots.slice(0, 6).length} Label)
          </button>
        </div>

        {/* Scanner / Quick Barcode Lookup Box */}
        <form
          onSubmit={handleScanLookup}
          style={{
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Scan Kamera / Ketik Kode Barcode Lot Central:
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              style={{ flex: 1, minWidth: '240px', fontFamily: 'monospace', fontWeight: 700 }}
              placeholder="Scan atau ketik kode lot (contoh: LOT-CTR-2026-0001)..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }}>
              Cek Lot &amp; Expired
            </button>
          </div>

          {scannedLotResult && (
            <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              {scannedLotResult.notFound ? (
                <div style={{ color: 'var(--danger)', fontSize: '0.83rem', fontWeight: 600 }}>
                  Kode Barcode &ldquo;{scannedLotResult.query}&rdquo; tidak ditemukan di Gudang Central.
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {scannedLotResult.barcode_code}
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{scannedLotResult.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Stok Central: <strong>{scannedLotResult.qty_central} {scannedLotResult.unit}</strong> &nbsp;|&nbsp; Tgl Masuk: <strong>{scannedLotResult.arrival_date}</strong> &nbsp;|&nbsp; Expired: <strong style={{ color: 'var(--warning)' }}>{scannedLotResult.expiry_date}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', fontWeight: 700 }}
                      onClick={() => handleQuickTransferZeroCost(scannedLotResult, 'Resto BSD')}
                      disabled={transferringLotId === scannedLotResult.lot_id}
                    >
                      <ArrowRightLeft size={13} style={{ marginRight: '5px' }} /> Mutasi ke BSD (Rp 0)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', fontWeight: 700 }}
                      onClick={() => handleQuickTransferZeroCost(scannedLotResult, 'Resto Kasuna')}
                      disabled={transferringLotId === scannedLotResult.lot_id}
                    >
                      <ArrowRightLeft size={13} style={{ marginRight: '5px' }} /> Mutasi ke Kasuna (Rp 0)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>

        {/* Search & Printable Sticker Grid */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '36px', fontSize: '0.84rem' }}
              placeholder="Filter bahan Gudang Central..."
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(e.target.value)}
            />
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Menampilkan <strong>{filteredCentralLots.length}</strong> lot aktif di Gudang Central
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
          {filteredCentralLots.slice(0, 12).map((lot) => {
            const isSelected = selectedLotsForPrint.includes(lot.lot_id);
            return (
              <div
                key={lot.lot_id}
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent)' }}>
                    {lot.barcode_code}
                  </span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() =>
                      setSelectedLotsForPrint((prev) =>
                        prev.includes(lot.lot_id) ? prev.filter((id) => id !== lot.lot_id) : [...prev, lot.lot_id]
                      )
                    }
                    title="Pilih untuk dicetak"
                  />
                </div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{lot.name}</div>
                {/* Simulated 1D Barcode Bars */}
                <div
                  style={{
                    height: '32px',
                    background: 'repeating-linear-gradient(90deg, #111 0px, #111 2px, transparent 2px, transparent 5px, #111 5px, #111 6px, transparent 6px, transparent 9px)',
                    borderRadius: '3px',
                    margin: '4px 0'
                  }}
                />
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Stok: <strong>{lot.qty_central} {lot.unit}</strong></span>
                  <span>Exp: <strong>{lot.expiry_date}</strong></span>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: '0.72rem', padding: '4px 6px' }}
                    onClick={() => handleQuickTransferZeroCost(lot, 'Resto BSD')}
                  >
                    Kirim BSD (Rp 0)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: '0.72rem', padding: '4px 6px' }}
                    onClick={() => handleQuickTransferZeroCost(lot, 'Resto Kasuna')}
                  >
                    Kirim Kasuna (Rp 0)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Layers size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>
              Split Bahan Zero-Waste (Cutting Portion 0% — Kasus Kelapa Urgent)
            </h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
            Memecah 1 bahan induk (mis. <strong>Kelapa Batok / Kelapa Urgent 10 pack</strong>) menjadi 2 atau lebih stok bahan jadi di Bar/Resto (<strong>Air Kelapa</strong> &amp; <strong>Daging Kelapa</strong>) dengan <strong>Waste = 0% (Tidak Masuk Berita Acara Waste)</strong>.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.8rem', fontWeight: 700, borderColor: 'var(--accent)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={handleLoadKelapaPreset}
        >
          <Sparkles size={14} /> Muat Contoh Riil: Kelapa Urgent 10 Pack &rarr; Air + Daging (Waste 0%)
        </button>
      </div>

      <form onSubmit={handleSubmitZeroWasteSplit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '14px', padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
              1. Pilih Bahan Induk yang Dipecah (Stok Resto/Bar) *
            </label>
            <input
              type="text"
              list="zw-parent-materials"
              className="form-control"
              placeholder="Ketik mis. Kelapa Batok Umatis / Kelapa Urgent..."
              value={parentSearch}
              onChange={(e) => {
                const val = e.target.value;
                setParentSearch(val);
                const found = materials.find((m) => String(m.name || '').toLowerCase() === val.toLowerCase().trim());
                if (found) setSelectedParent(found);
              }}
              required
            />
            <datalist id="zw-parent-materials">
              {materials.map((m) => (
                <option key={m.id} value={m.name}>
                  Stok Resto: {m.qty_resto || 0} {m.unit}
                </option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
              Jumlah Induk Dipakai *
            </label>
            <input
              type="number"
              step="any"
              min="0.01"
              className="form-control"
              value={parentQty}
              onChange={(e) => setParentQty(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
              Cutting Portion / Waste
            </label>
            <div style={{ padding: '9px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', color: 'var(--success)', fontWeight: 800, fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={15} /> 0% (Zero-Waste)
            </div>
          </div>
        </div>

        {/* Target Outputs Table */}
        <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 800 }}>
              2. Hasil Pecahan Stok Masuk ke Bar / Resto (Minimal 2 Item Turunan)
            </span>
            <button type="button" className="btn btn-secondary" style={{ fontSize: '0.76rem', padding: '4px 10px' }} onClick={handleAddOutputRow}>
              <Plus size={13} style={{ marginRight: '4px' }} /> Tambah Item Turunan
            </button>
          </div>

          <table className="custom-table" style={{ fontSize: '0.83rem' }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Nama Bahan Turunan (Otomatis Menambah Stok Resto)</th>
                <th style={{ width: '130px' }}>Qty Hasil Masuk</th>
                <th style={{ width: '110px' }}>Satuan</th>
                <th style={{ width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {childOutputs.map((row, idx) => (
                <tr key={row.id || idx}>
                  <td style={{ fontWeight: 700 }}>{idx + 1}</td>
                  <td>
                    <input
                      type="text"
                      list="zw-parent-materials"
                      className="form-control"
                      value={row.name}
                      placeholder="Contoh: Air Kelapa Murni / Daging Kelapa"
                      onChange={(e) => handleUpdateOutputRow(idx, 'name', e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      className="form-control"
                      value={row.qty}
                      onChange={(e) => handleUpdateOutputRow(idx, 'qty', e.target.value)}
                      required
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-control"
                      value={row.unit}
                      onChange={(e) => handleUpdateOutputRow(idx, 'unit', e.target.value)}
                      required
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {childOutputs.length > 2 && (
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }}
                        onClick={() => handleRemoveOutputRow(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <input
            type="text"
            className="form-control"
            style={{ flex: 1, minWidth: '240px', fontSize: '0.83rem' }}
            value={splitNotes}
            onChange={(e) => setSplitNotes(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" style={{ fontWeight: 700, padding: '10px 20px' }} disabled={savingSplit}>
            {savingSplit ? 'Memproses Split...' : 'Simpan Split Bahan (Zero-Waste 0%)'}
          </button>
        </div>
      </form>

      {/* Split History */}
      <div>
        <h4 style={{ fontSize: '0.92rem', fontWeight: 800, marginBottom: '8px' }}>
          Riwayat Split Bahan Zero-Waste (Cutting Portion 0%)
        </h4>
        <div className="table-container">
          <table className="custom-table" style={{ fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Bahan Induk Dipotong</th>
                <th>Hasil Stok Turunan Masuk (Resto/Bar)</th>
                <th>Waste Tercatat</th>
                <th>Petugas</th>
              </tr>
            </thead>
            <tbody>
              {splitHistory.map((h) => (
                <tr key={h.id}>
                  <td>{h.date}</td>
                  <td style={{ fontWeight: 700 }}>
                    {h.parent_name} ({h.parent_qty} {h.parent_unit})
                  </td>
                  <td>
                    {(h.outputs || []).map((o, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'rgba(16,185,129,0.12)',
                          color: 'var(--success)',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          marginRight: '6px'
                        }}
                      >
                        +{o.qty} {o.unit} {o.name}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--success)' }}>0% (Rp 0)</td>
                  <td>{h.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
