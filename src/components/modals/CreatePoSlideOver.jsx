import React, { useState, useMemo, useEffect } from 'react';
import { X, Search, Plus, Trash2, Calendar, TrendingUp, TrendingDown, Check } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';
import { computeLeadTimeMeta } from './ComparePriceModal';

const COMPARE_STORAGE_KEY = 'barventis_supplier_price_comparisons_v17';

function getTomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function loadOffersForMaterial(mat) {
  if (!mat) return [];
  const basePrice = Number(mat.new_price) > 0 ? Number(mat.new_price) : (Number(mat.price) || 0);
  const base = {
    supplier_name: mat.supplier && mat.supplier !== '-' ? mat.supplier : 'Supplier Utama',
    price: basePrice,
    quality: 'Standar',
    lead_time: 'Reguler',
    is_default: true
  };
  try {
    const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const key = String(mat.id || mat.name || '').toLowerCase();
    const saved = Array.isArray(map[key]) ? map[key] : [];
    const extras = saved.filter(
      (o) => String(o.supplier_name || '').toLowerCase() !== String(base.supplier_name || '').toLowerCase()
    );
    return [base, ...extras].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } catch {
    return [base];
  }
}

export default function CreatePoSlideOver({
  activeBranchId = null,
  open,
  onClose,
  stock = [],
  suppliersList = [],
  isCentral = false,
  isRekanBar = false,
  activeUser = null,
  initialPrefill = null,
  onSubmitPo,
  onSuppliersUpdated,
  onMaterialPriceUpdated,
  toast
}) {
  const [matSearch, setMatSearch] = useState('');
  const debouncedMatSearch = useDebounce(matSearch, 250);
  const [items, setItems] = useState([]);
  const [focusedItemIdx, setFocusedItemIdx] = useState(0);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [location, setLocation] = useState(isCentral ? 'CENTRAL' : 'RESTO');
  const [deliveryDate, setDeliveryDate] = useState(getTomorrowISO());
  const [notes, setNotes] = useState('');

  // Quick-add supplier inline state
  const [showAddSup, setShowAddSup] = useState(false);
  const [newSup, setNewSup] = useState({ name: '', phone: '', contact_person: '' });
  const [savingSup, setSavingSup] = useState(false);
  const [updatingMasterId, setUpdatingMasterId] = useState(null);

  useEffect(() => {
    if (open && initialPrefill?.material) {
      const m = initialPrefill.material;
      const activePrice = Number(m.new_price) > 0 ? Number(m.new_price) : (Number(m.price) || 0);
      setItems([{
        material_id: m.id,
        item_name: m.name,
        qty: initialPrefill.qty || 1,
        unit: m.unit || 'pck',
        unit_price: activePrice,
        base_price: activePrice,
        supplier_default: m.supplier || ''
      }]);
      setSelectedSupplier(m.supplier && m.supplier !== '-' ? m.supplier : '');
      setFocusedItemIdx(0);
    }
  }, [open, initialPrefill]);

  const searchResults = useMemo(() => {
    const q = debouncedMatSearch.trim().toLowerCase();
    if (!q) return (stock || []).slice(0, 8);
    return (stock || [])
      .filter((m) => String(m.name || '').toLowerCase().includes(q) || String(m.supplier || '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [stock, debouncedMatSearch]);

  const focusedItem = items[focusedItemIdx] || items[0] || null;
  const focusedMaterialObj = useMemo(() => {
    if (!focusedItem) return null;
    return (stock || []).find((s) => String(s.id) === String(focusedItem.material_id)) || {
      id: focusedItem.material_id,
      name: focusedItem.item_name,
      supplier: focusedItem.supplier_default,
      price: focusedItem.base_price
    };
  }, [focusedItem, stock]);

  const supplierComparisons = useMemo(
    () => loadOffersForMaterial(focusedMaterialObj),
    [focusedMaterialObj]
  );

  const leadMeta = useMemo(() => computeLeadTimeMeta(deliveryDate), [deliveryDate]);
  const totalOrder = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.qty || 0) * Number(it.unit_price || 0)), 0),
    [items]
  );

  if (!open) return null;

  const handlePickMaterial = (mat) => {
    const existsIdx = items.findIndex((it) => String(it.material_id) === String(mat.id));
    if (existsIdx !== -1) {
      setFocusedItemIdx(existsIdx);
      setMatSearch('');
      return;
    }
    const activePrice = Number(mat.new_price) > 0 ? Number(mat.new_price) : (Number(mat.price) || 0);
    const nextItems = [
      ...items,
      {
        material_id: mat.id,
        item_name: mat.name,
        qty: 1,
        unit: mat.unit || 'pck',
        unit_price: activePrice,
        base_price: activePrice,
        supplier_default: mat.supplier || ''
      }
    ];
    setItems(nextItems);
    setFocusedItemIdx(nextItems.length - 1);
    if (!selectedSupplier && mat.supplier && mat.supplier !== '-') {
      setSelectedSupplier(mat.supplier);
    }
    setMatSearch('');
  };

  const handleUpdateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const handleNudgePrice = (idx, delta) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, unit_price: Math.max(0, Math.round((Number(it.unit_price) || 0) + delta)) } : it
      )
    );
  };

  const handleSaveMasterPriceShortcut = async (it) => {
    if (!it?.material_id) return;
    setUpdatingMasterId(it.material_id);
    try {
      await api.updateMaterial(it.material_id, { new_price: Number(it.unit_price) || 0 }, activeUser?.id);
      setItems((prev) =>
        prev.map((row) =>
          row.material_id === it.material_id ? { ...row, base_price: Number(it.unit_price) || 0 } : row
        )
      );
      if (onMaterialPriceUpdated) await onMaterialPriceUpdated();
      if (toast) toast(`Harga baru "${it.item_name}" (${formatIDR(it.unit_price)}) tersimpan ke master bahan.`, 'success');
    } catch (err) {
      if (toast) toast(err.message || 'Gagal update harga master.', 'error');
    } finally {
      setUpdatingMasterId(null);
    }
  };

  const handleSelectComparisonOffer = (offer) => {
    setSelectedSupplier(offer.supplier_name);
    if (focusedItem && Number(offer.price) > 0) {
      handleUpdateItem(focusedItemIdx, 'unit_price', Number(offer.price));
    }
  };

  const handleQuickAddSupplier = async () => {
    const clean = newSup.name.trim();
    if (!clean) {
      if (toast) toast('Isi nama supplier dulu.', 'warning');
      return;
    }
    setSavingSup(true);
    try {
      const saved = await api.saveSupplier({
        name: clean,
        phone: newSup.phone.trim(),
        contact_person: newSup.contact_person.trim(),
        address: ''
      });
      if (onSuppliersUpdated) await onSuppliersUpdated();
      setSelectedSupplier(saved?.name || clean);
      setNewSup({ name: '', phone: '', contact_person: '' });
      setShowAddSup(false);
      if (toast) toast(`Supplier "${saved?.name || clean}" berhasil ditambah & dipilih.`, 'success');
    } catch (err) {
      if (toast) toast(err.message || 'Gagal tambah supplier.', 'error');
    } finally {
      setSavingSup(false);
    }
  };

  const handleSubmitForm = (e) => {
    e.preventDefault();
    if (items.length === 0) {
      if (toast) toast('Pilih minimal 1 bahan dulu.', 'warning');
      return;
    }
    const finalSupplier = selectedSupplier.trim() || items[0]?.supplier_default || 'Pasar Umum';
    const deliveryNoteTag = `Jadwal Kirim: ${deliveryDate} (${leadMeta.hLabel})`;
    const cleanNotes = notes.trim() ? `${deliveryNoteTag} | ${notes.trim()}` : deliveryNoteTag;

    // Simpan pengingat PO agar Purchasing tidak lupa
    try {
      const remKey = `bv_po_reminders_v5_${activeBranchId || 'default'}`;
      const raw = localStorage.getItem(remKey);
      const list = raw ? JSON.parse(raw) : [];
      const rem = {
        id: `rem-${Date.now()}`,
        item_name: items.map((i) => i.item_name).join(', '),
        supplier_name: finalSupplier,
        delivery_date: deliveryDate,
        h_label: leadMeta.hLabel,
        price: totalOrder,
        unit: 'PO',
        done: false,
        created_at: new Date().toISOString()
      };
      const scopedRem = { ...rem, branch_id: activeBranchId || null };
      localStorage.setItem(remKey, JSON.stringify([scopedRem, ...list].slice(0, 30)));
      window.dispatchEvent(new CustomEvent('barventis:po_reminders_updated'));
    } catch {
      // ignore
    }

    onSubmitPo({
      supplier: finalSupplier,
      date: new Date().toISOString().split('T')[0],
      delivery_date: deliveryDate,
      due_date: deliveryDate,
      location: isCentral ? 'CENTRAL' : (isRekanBar ? 'RESTO' : location),
      items: items.map((it) => ({
        material_id: it.material_id,
        item_name: it.item_name,
        qty: parseFloat(it.qty) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        unit: it.unit || 'pck'
      })),
      total: totalOrder,
      status: 'DRAFT',
      notes: cleanNotes,
      received_date: null
    });

    setItems([]);
    setSelectedSupplier('');
    setNotes('');
    setMatSearch('');
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '760px', background: 'var(--bg-primary)', height: '100vh', padding: '24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Buat PO Baru</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
              Pilih bahannya dulu, lalu bandingkan harga supplier &amp; atur tanggal kirim.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmitForm} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* LANGKAH 1: PILIH BAHAN DULU (DEBOUNCE) */}
          <div style={{ border: '1px solid var(--border)', padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
              1. Pilih Bahan (Cari Cepat)
            </div>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
                placeholder="Ketik nama bahan... (mis. Jeruk Pontianak, Es Batu, Susu)"
                value={matSearch}
                onChange={(e) => setMatSearch(e.target.value)}
              />
            </div>

            {matSearch.trim().length > 0 && (
              <div style={{ maxHeight: '175px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-primary)', marginBottom: '12px' }}>
                {searchResults.length === 0 ? (
                  <div style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Bahan tidak ketemu.
                  </div>
                ) : searchResults.map((mat) => {
                  const p = Number(mat.new_price) > 0 ? Number(mat.new_price) : (Number(mat.price) || 0);
                  return (
                    <div
                      key={mat.id}
                      onClick={() => handlePickMaterial(mat)}
                      style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{mat.name}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                          {mat.supplier && mat.supplier !== '-' ? mat.supplier : 'Belum ada supplier'} · {mat.unit}
                        </div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                        {formatIDR(p)} +
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Daftar Bahan Dipilih + Shortcut Edit Harga Naik/Turun */}
            {items.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: '8px' }}>
                Belum ada bahan dipilih. Ketik nama bahan di atas untuk menambahkan.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.map((it, idx) => {
                  const priceDiff = Number(it.unit_price || 0) - Number(it.base_price || 0);
                  const isFocused = idx === focusedItemIdx;
                  return (
                    <div
                      key={it.material_id || idx}
                      onClick={() => setFocusedItemIdx(idx)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: 'var(--bg-primary)',
                        border: isFocused ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontWeight: 800, fontSize: '0.86rem' }}>{it.item_name}</span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: '6px' }}>({it.unit})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--accent)' }}>
                            {formatIDR(Number(it.qty || 0) * Number(it.unit_price || 0))}
                          </span>
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setItems((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', alignItems: 'center' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Jumlah ({it.unit})</label>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            className="form-control"
                            style={{ padding: '5px 8px', fontSize: '0.82rem' }}
                            value={it.qty}
                            onChange={(e) => handleUpdateItem(idx, 'qty', e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Harga / {it.unit} (Rp)</label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="form-control"
                            style={{ padding: '5px 8px', fontSize: '0.82rem', fontWeight: 700 }}
                            value={it.unit_price}
                            onChange={(e) => handleUpdateItem(idx, 'unit_price', e.target.value)}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Shortcut Harga</label>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary" style={{ padding: '4px 7px', fontSize: '0.7rem' }} onClick={() => handleNudgePrice(idx, -1000)}>
                              <TrendingDown size={11} style={{ marginRight: '2px' }} />-1rb
                            </button>
                            <button type="button" className="btn btn-secondary" style={{ padding: '4px 7px', fontSize: '0.7rem' }} onClick={() => handleNudgePrice(idx, 1000)}>
                              <TrendingUp size={11} style={{ marginRight: '2px' }} />+1rb
                            </button>
                            {priceDiff !== 0 && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700 }}
                                disabled={updatingMasterId === it.material_id}
                                onClick={() => handleSaveMasterPriceShortcut(it)}
                                title="Simpan harga baru ke master bahan (hanya berlaku ke depan)"
                              >
                                <Check size={11} style={{ marginRight: '2px' }} />
                                {updatingMasterId === it.material_id ? '...' : 'Update Master'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* LANGKAH 2: PILIH SUPPLIER & BANDINGKAN HARGA LANGSUNG */}
          <div style={{ border: '1px solid var(--border)', padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--accent)' }}>
                2. Pilih Supplier &amp; Bandingkan Harga
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedSupplier('Pasar Umum')}
                  style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.1)', color: '#d97706', cursor: 'pointer' }}
                >
                  Pasar Umum
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddSup((p) => !p)}
                  style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--accent)', background: 'var(--bg-primary)', color: 'var(--accent)', cursor: 'pointer' }}
                >
                  {showAddSup ? 'Tutup' : '+ Supplier Baru'}
                </button>
              </div>
            </div>

            {/* Perbandingan Harga Langsung untuk Bahan Terpilih */}
            {focusedItem && supplierComparisons.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Perbandingan harga untuk <strong>{focusedItem.item_name}</strong> (klik untuk langsung pakai):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
                  {supplierComparisons.map((off, i) => {
                    const active = String(selectedSupplier || '').toLowerCase() === String(off.supplier_name || '').toLowerCase();
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectComparisonOffer(off)}
                        style={{
                          textAlign: 'left',
                          padding: '9px 11px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: active ? 'rgba(16,185,129,0.08)' : 'var(--bg-primary)'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                          {off.supplier_name} {i === 0 && supplierComparisons.length > 1 ? '· Termurah' : ''}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--accent)', marginTop: '2px' }}>
                          {formatIDR(off.price)} / {focusedItem.unit}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {showAddSup ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '8px', background: 'var(--bg-primary)', border: '1px solid var(--accent)' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                  placeholder="Nama supplier baru *"
                  value={newSup.name}
                  onChange={(e) => setNewSup((p) => ({ ...p, name: e.target.value }))}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-control"
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                    placeholder="No. WA / HP"
                    value={newSup.phone}
                    onChange={(e) => setNewSup((p) => ({ ...p, phone: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="form-control"
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                    placeholder="Nama kontak"
                    value={newSup.contact_person}
                    onChange={(e) => setNewSup((p) => ({ ...p, contact_person: e.target.value }))}
                  />
                </div>
                <button type="button" className="btn btn-primary" style={{ fontSize: '0.8rem', fontWeight: 700, padding: '7px 12px' }} onClick={handleQuickAddSupplier} disabled={savingSup}>
                  <Plus size={13} style={{ marginRight: '4px' }} /> {savingSup ? 'Menyimpan...' : 'Simpan & Pakai Supplier'}
                </button>
              </div>
            ) : (
              <select
                className="form-control"
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                required
              >
                <option value="">-- Pilih Supplier --</option>
                <option value="Pasar Umum">Pasar Umum (Belanja Darurat / Petty Cash)</option>
                {suppliersList.map((s) => (
                  <option key={s.id || s.name} value={s.name}>{s.name}</option>
                ))}
                {selectedSupplier && selectedSupplier !== 'Pasar Umum' && !suppliersList.some((s) => s.name === selectedSupplier) && (
                  <option value={selectedSupplier}>{selectedSupplier}</option>
                )}
              </select>
            )}
          </div>

          {/* LANGKAH 3: GUDANG TUJUAN & TANGGAL KIRIM (KALENDER + H+N) */}
          <div style={{ border: '1px solid var(--border)', padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-secondary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Gudang Tujuan</label>
              <select
                className="form-control"
                value={isCentral ? 'CENTRAL' : (isRekanBar ? 'RESTO' : location)}
                disabled={isCentral || isRekanBar}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="RESTO">Bar / Resto (Masuk Langsung Resto)</option>
                <option value="CENTRAL">Gudang Central</option>
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Calendar size={13} /> Tanggal Kirim</span>
                <span style={{ color: 'var(--accent)', fontSize: '0.74rem' }}>{leadMeta.hLabel}</span>
              </label>
              <input
                type="date"
                className="form-control"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Catatan Tambahan (opsional)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Mis. kirim pagi sebelum jam 10"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              Total: <span style={{ color: 'var(--accent)' }}>{formatIDR(totalOrder)}</span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Tutup</button>
              <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }} disabled={items.length === 0}>
                Simpan PO
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
