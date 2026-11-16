import { useState, useRef, useEffect, useMemo } from 'react';
import {
  ClipboardCheck, ArrowRight, ShieldCheck,
  Palette, UploadCloud, Search
} from 'lucide-react';
import BulkImport from '../../components/BulkImport';
import { useData } from '../../contexts/DataContext';
import { formatIDR, calculateIngredientCost } from '../../services/costUtils';
import { locationService } from '../../services/locationService';

let _confetti;
const getConfetti = async () => { if (!_confetti) _confetti = (await import('canvas-confetti')).default; return _confetti; };

export default function StockOpname({ defaultLocation } = {}) {
  const { currentTenant, stock, showToast, handleCompleteOpname: onCompleteOpname, unitConversionMap } = useData();
  const [step, setStep] = useState(1); // 1: Init, 2: Count, 3: Reconcile, 4: Approve & Sign
  
  const [locations, setLocations] = useState(() => locationService.getLocations(currentTenant?.id));
  useEffect(() => {
    const updateLocs = () => {
      setLocations(locationService.getLocations(currentTenant?.id));
    };
    updateLocs();
    return locationService.subscribe(updateLocs);
  }, [currentTenant]);

  const [location, setLocation] = useState(defaultLocation || 'RESTO');
  const [periodMonth, setPeriodMonth] = useState(() => (new Date().getMonth() + 1).toString());
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear().toString());
  const [opnameItems, setOpnameItems] = useState([]);
  const [, setSignatureData] = useState(null);
  const isDrawing = useRef(false);
  // FT-09.1 Fix: Default to 'ALL' ("Semua Kategori") so user doesn't have to scroll through all categories horizontally
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [opnameSearch, setOpnameSearch] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  
  const canvasRef = useRef(null);

  const categories = useMemo(() => [...new Set(stock.map(item => item.category).filter(Boolean))], [stock]);

  const [isInitializing, setIsInitializing] = useState(false);

  // 2. Initialize Opname
  const handleStartOpname = async () => {
    setIsInitializing(true);
    try {
      const items = stock.map(item => {
        const bookQty = location === 'RESTO' ? item.qty_resto : item.qty_central;

        return {
          id: item.id,
          sku: item.sku,
          name: item.name,
          category: item.category,
          unit: item.unit,
          price: Number(item.new_price) > 0 ? Number(item.new_price) : Number(item.price || 0),
          full_pack: item.full_pack,
          book_qty: bookQty || 0,
          physical_qty: '',
          notes: ''
        };
      });

      items.sort((a, b) => a.name.localeCompare(b.name));

      setOpnameItems(items);
      setActiveCategory('ALL');
      setOpnameSearch('');
      setStep(2);
    } catch (error) {
      console.error('Failed to init opname:', error);
      showToast('Gagal memuat snapshot stok: ' + error.message, 'error');
    } finally {
      setIsInitializing(false);
    }
  };

  // 3. Row Qty updates — supports split Full + Broken input
  const handleFullBrokenChange = (name, field, val) => {
    const updated = opnameItems.map(item => {
      if (item.name === name) {
        const newItem = { ...item, [field]: val === '' ? '' : parseFloat(val) || 0 };
        const full = newItem.full_count === '' || newItem.full_count === undefined ? 0 : parseFloat(newItem.full_count) || 0;
        const broken = newItem.broken_count === '' || newItem.broken_count === undefined ? 0 : parseFloat(newItem.broken_count) || 0;
        newItem.physical_qty = full + broken;
        return newItem;
      }
      return item;
    });
    setOpnameItems(updated);
  };

  const handleNotesChange = (name, val) => {
    const updated = opnameItems.map(item => {
      if (item.name === name) {
        return { ...item, notes: val };
      }
      return item;
    });
    setOpnameItems(updated);
  };

  // 4. Digital Signature Pad drawing controls
  useEffect(() => {
    if (step === 4 && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
    }
  }, [step]);

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    isDrawing.current = true;
    draw(e);
  };

  const stopDrawing = (e) => {
    if (e && e.cancelable) e.preventDefault();
    isDrawing.current = false;
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
    }
  };

  const draw = (e) => {
    if (e.cancelable) e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;

    if (clientX == null) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearSignature = () => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const saveSignature = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL();
      setSignatureData(dataUrl);
      return dataUrl;
    }
    return null;
  };

  // 5. Complete and Commit Opname
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCommitOpname = async () => {
    const confetti = await getConfetti();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const currentSignature = saveSignature();

      const reconciliation = opnameItems.map(item => {
        const pQty = item.physical_qty === '' || item.physical_qty === null || item.physical_qty === undefined
          ? item.book_qty
          : parseFloat(item.physical_qty);
        const variance = pQty - item.book_qty;
        return {
          ...item,
          physical_qty: pQty,
          variance,
          valAdjustment: calculateIngredientCost(item, variance, item.unit, unitConversionMap)
        };
      });

      await onCompleteOpname(location, reconciliation, currentSignature, periodMonth, periodYear);

      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

      setStep(1);
      setOpnameItems([]);
      setSignatureData(null);
    } catch (err) {
      console.error('[StockOpname] Commit failed:', err);
      showToast('Gagal menyimpan opname: ' + (err?.message || 'Terjadi kesalahan.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOpnameItems = useMemo(() => {
    return opnameItems.filter(item => {
      const matchesCat = activeCategory === 'ALL' || item.category === activeCategory;
      const q = opnameSearch.trim().toLowerCase();
      const matchesSearch = !q || (item.name || '').toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [opnameItems, activeCategory, opnameSearch]);
  
  const itemsWithVariance = useMemo(() => opnameItems.filter(item => {
    if (item.physical_qty === '' || item.physical_qty === null || item.physical_qty === undefined) return false;
    const pQty = parseFloat(item.physical_qty);
    return !isNaN(pQty) && pQty !== item.book_qty;
  }), [opnameItems]);

  return (
    <div className="fade-in">
      {/* Step 1: Initialize Opname */}
      {step === 1 && (
        <div className="glass-card" style={{ maxWidth: '520px', margin: '40px auto', padding: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', marginBottom: '24px' }}>
            <div className="upload-icon-circle" style={{ background: 'var(--accent-glow)', color: 'var(--accent)', width: '72px', height: '72px' }}>
              <ClipboardCheck size={36} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Stock Opname
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Catat fisik stok untuk rekonsiliasi saldo.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Lokasi Gudang</label>
            <select className="form-control" value={location} onChange={e => setLocation(e.target.value)}>
              {locations.filter(l => l.code !== 'ALL').map(l => (
                <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group">
              <label className="form-label">Bulan SO</label>
              <select className="form-control" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)}>
                <option value="1">Januari</option>
                <option value="2">Februari</option>
                <option value="3">Maret</option>
                <option value="4">April</option>
                <option value="5">Mei</option>
                <option value="6">Juni</option>
                <option value="7">Juli</option>
                <option value="8">Agustus</option>
                <option value="9">September</option>
                <option value="10">Oktober</option>
                <option value="11">November</option>
                <option value="12">Desember</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tahun SO</label>
              <input 
                type="number" 
                className="form-control" 
                value={periodYear} 
                onChange={e => setPeriodYear(e.target.value)} 
                min="2020" 
                max="2100" 
              />
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: '16px', display: 'flex', justifyContent: 'center' }} onClick={handleStartOpname} disabled={isInitializing}>
            {isInitializing ? 'Memuat...' : 'Mulai Opname'} <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Step 2: Physical Count Input Grid */}
      {step === 2 && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <span className="badge badge-info" style={{ marginBottom: '6px' }}>Langkah 2: Hitung Fisik</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Opname Stok ({location})
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', minWidth: '210px' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '32px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.82rem' }}
                    placeholder="Cari bahan baku / SKU..."
                    value={opnameSearch}
                    onChange={e => setOpnameSearch(e.target.value)}
                  />
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', display: 'flex', gap: '6px', alignItems: 'center', borderColor: 'var(--accent)' }} 
                  onClick={() => setShowBulkImport(true)}
                >
                  <UploadCloud size={14} style={{ color: 'var(--accent)' }} /> Import Excel
                </button>
              </div>
            </div>
            
            {/* Category filter with "Semua Kategori" default (FT-09.1) */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button
                type="button"
                className={`btn ${activeCategory === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.8rem', whiteSpace: 'nowrap', fontWeight: 700 }}
                onClick={() => setActiveCategory('ALL')}
              >
                Semua Kategori ({opnameItems.length})
              </button>
              {categories.map(cat => (
                <button 
                  key={cat}
                  type="button"
                  className={`btn ${activeCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat} ({opnameItems.filter(i => i.category === cat).length})
                </button>
              ))}
            </div>
          </div>

          {/* Items Table for counting */}
          <div className="table-container" style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto', marginBottom: '24px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Nama Bahan</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Stok Sistem</th>
                  <th style={{ width: '8%' }}>Satuan</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Utuh (Full)</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Terbuka (Broken)</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Total Fisik</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Selisih</th>
                </tr>
              </thead>
              <tbody>
                {filteredOpnameItems.map(item => {
                  const physicalVal = item.physical_qty;
                  const variance = physicalVal === '' ? 0 : physicalVal - item.book_qty;
                  
                  let varianceStyle = 'var(--text-muted)';
                  if (variance > 0) {
                    varianceStyle = 'var(--success)';
                  } else if (variance < 0) {
                    varianceStyle = 'var(--danger)';
                  }

                  return (
                    <tr key={item.name}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                            {item.sku || ('#MAT-' + String(item.id || '').slice(0, 6).toUpperCase())}
                          </span>
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                          {activeCategory === 'ALL' && item.category && (
                            <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '999px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                              {item.category}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.book_qty.toFixed(0)}</td>
                      <td>{item.unit}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input 
                          type="number"
                          inputMode="decimal"
                          step="any"
                          className="form-control"
                          style={{ padding: '6px 10px', fontSize: '0.85rem', textAlign: 'right', width: '100px', marginLeft: 'auto' }}
                          placeholder="0"
                          value={item.full_count ?? ''}
                          onChange={e => handleFullBrokenChange(item.name, 'full_count', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <input 
                          type="number"
                          inputMode="decimal"
                          step="any"
                          className="form-control"
                          style={{ padding: '6px 10px', fontSize: '0.85rem', textAlign: 'right', width: '100px', marginLeft: 'auto' }}
                          placeholder="0"
                          value={item.broken_count ?? ''}
                          onChange={e => handleFullBrokenChange(item.name, 'broken_count', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.physical_qty === '' ? '-' : (typeof item.physical_qty === 'number' ? item.physical_qty.toFixed(0) : item.physical_qty)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: varianceStyle }}>
                        {variance === 0 ? '0' : variance > 0 ? `+${variance.toFixed(0)}` : variance.toFixed(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>Batal</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              Tinjau Selisih <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Reconciliation Review */}
      {step === 3 && (
        <div className="glass-card" style={{ padding: '28px' }}>
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '24px' }}>
            <span className="badge badge-warning" style={{ marginBottom: '6px' }}>Langkah 3: Rekonsiliasi</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>Daftar Selisih Stok</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Tambahkan catatan untuk bahan yang berselisih.
            </p>
          </div>

          <div className="table-container" style={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto', marginBottom: '24px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Nama Bahan</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Stok Sistem</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Hitung Fisik</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Selisih</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Nilai Selisih</th>
                  <th style={{ width: '25%' }}>Catatan Audit</th>
                </tr>
              </thead>
              <tbody>
                {itemsWithVariance.map(item => {
                  const pQty = parseFloat(item.physical_qty);
                  const variance = pQty - item.book_qty;
                  const valAdjustment = calculateIngredientCost(item, variance, item.unit, unitConversionMap);

                  return (
                    <tr key={item.name}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                            {item.sku || ('#MAT-' + String(item.id || '').slice(0, 6).toUpperCase())}
                          </span>
                          <span style={{ fontWeight: 600 }}>{item.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.book_qty.toFixed(0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{pQty.toFixed(0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: variance > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {variance > 0 ? `+${variance.toFixed(0)}` : variance.toFixed(0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: valAdjustment > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {formatIDR(valAdjustment)}
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="form-control" 
                          placeholder="Contoh: Kemasan rusak, tumpah..."
                          style={{ padding: '6px 12px', fontSize: '0.825rem' }}
                          value={item.notes}
                          onChange={e => handleNotesChange(item.name, e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {itemsWithVariance.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--success)', fontWeight: 600 }}>
                      Tidak ada selisih. Semua stok sesuai.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>Kembali</button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>
              Tanda Tangan <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Digital Signature Canvas */}
      {step === 4 && (
        <div className="glass-card" style={{ maxWidth: '520px', margin: '40px auto', padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span className="badge badge-success" style={{ marginBottom: '8px' }}>Langkah 4: Persetujuan</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Setujui Stock Opname
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Tanda tangan di bawah untuk mengesahkan opname.
            </p>
          </div>

          <div className="signature-canvas-container">
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              width={456}
              height={200}
              style={{ touchAction: 'none' }}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchMove={draw}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={clearSignature}>
              Hapus TTD
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Palette size={12} /> Kanvas Siap
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(3)}>Kembali</button>
            <button className="btn btn-success" style={{ flex: 2, display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }} onClick={handleCommitOpname} disabled={isSubmitting}>
              <ShieldCheck size={18} /> {isSubmitting ? 'Menyimpan...' : 'Setujui & Simpan'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="opname"
        title="Import Hasil Opname"
        description="Unggah hasil hitung fisik dari Excel."
        currentData={opnameItems.map((item, idx) => ({
          'NO': idx + 1,
          'NAMA ITEM': item.name,
          'KUANTITI': item.physical_qty || '',
          'UNIT': item.unit || '',
          'Full': '',
          'Price': item.price || 0,
          'NEW Price': item.price || 0,
          'SUPPLIER': item.notes || ''
        }))}
        onCommit={async (rows) => {
          const updated = [...opnameItems];
          let success = 0;
          let failed = 0;
          const errors = [];

          rows.forEach((row, i) => {
            const rawName = row.material_name || row['NAMA ITEM'] || '';
            const rowName = rawName.toLowerCase();
            const idx = updated.findIndex(u => u.name.toLowerCase() === rowName);
            if (idx >= 0) {
              const qty = row.physical_qty !== undefined ? row.physical_qty : row['KUANTITI'];
              updated[idx].physical_qty = parseFloat(qty || 0);
              updated[idx].notes = row.notes || row['SUPPLIER'] || '';
              success++;
            } else {
              failed++;
              errors.push({ row: rawName || `Baris ${i + 1}`, error: 'Nama item tidak ditemukan di sistem' });
            }
          });

          setOpnameItems(updated);
          return { success, failed, errors };
        }}
        expectedColumns={[
          { key: 'NO', label: 'NO', required: false, type: 'number', description: 'Nomor Urut', sample: 1 },
          { key: 'NAMA ITEM', label: 'NAMA ITEM', required: true, type: 'string', description: 'Nama bahan baku (sama persis dengan sistem)', sample: 'Espresso Bean' },
          { key: 'KUANTITI', label: 'KUANTITI', required: true, type: 'number', description: 'Hasil perhitungan fisik (angka)', sample: 12 },
          { key: 'UNIT', label: 'UNIT', required: false, type: 'string', description: 'Satuan', sample: 'kg' },
          { key: 'Full', label: 'Full', required: false, type: 'string', description: 'Isi kemasan utuh', sample: '1000 gr' },
          { key: 'Price', label: 'Price', required: false, type: 'number', description: 'Harga Beli (opsional)', sample: 120000 },
          { key: 'NEW Price', label: 'NEW Price', required: false, type: 'number', description: 'Harga Baru (opsional)', sample: 125000 },
          { key: 'SUPPLIER', label: 'SUPPLIER', required: false, type: 'string', description: 'Nama supplier / Catatan selisih', sample: 'Vendor A' }
        ]}
      />

    </div>
  );
}