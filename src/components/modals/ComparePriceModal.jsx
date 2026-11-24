import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, Plus, Bell } from 'lucide-react';
import { api } from '../../services/api';

const STORAGE_KEY = 'barventis_supplier_price_comparisons_v17';
const REMINDER_KEY = 'bv_po_reminders_v4';

function loadSavedOffersMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOffersMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function computeLeadTimeMeta(dateStr) {
  if (!dateStr) return { diffDays: 0, badge: 'Hari ini (H+0)', formattedDate: '-' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return { diffDays: 0, badge: 'H+0', formattedDate: dateStr };
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  const formattedDate = target.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const hLabel = diffDays === 0 ? 'Hari ini (H+0)' : diffDays > 0 ? `H+${diffDays}` : `Lewat ${Math.abs(diffDays)} hari`;
  return { diffDays, badge: `${formattedDate} (${hLabel})`, hLabel, formattedDate };
}

function savePoReminder({ itemName, supplierName, deliveryDate, hLabel, price, unit }) {
  if (!deliveryDate || !supplierName) return;
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const entry = {
      id: `rem-${Date.now()}`,
      item_name: itemName || 'Bahan PO',
      supplier_name: supplierName,
      delivery_date: deliveryDate,
      h_label: hLabel || 'H+1',
      price: Number(price) || 0,
      unit: unit || 'pcs',
      done: false,
      created_at: new Date().toISOString()
    };
    const filtered = list.filter(
      (r) => !(r.item_name === entry.item_name && r.supplier_name === entry.supplier_name && !r.done)
    );
    const next = [entry, ...filtered].slice(0, 30);
    localStorage.setItem(REMINDER_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('barventis:po_reminders_updated', { detail: next }));
  } catch {
    // ignore storage errors
  }
}

function getTomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default function ComparePriceModal({ item, suppliers = [], onClose, onSelect }) {
  const [allSuppliers, setAllSuppliers] = useState(suppliers || []);
  const [offers, setOffers] = useState([]);
  const [newOffer, setNewOffer] = useState({
    supplier_name: '',
    price: '',
    quality: 'Standar',
    delivery_date: getTomorrowISO(),
    notes: ''
  });
  const [changeReason, setChangeReason] = useState('');
  const [savingQuickSup, setSavingQuickSup] = useState(false);

  useEffect(() => {
    if (!suppliers || suppliers.length === 0) {
      api.getSuppliers().then((res) => setAllSuppliers(res || [])).catch(() => {});
    } else {
      setAllSuppliers(suppliers);
    }
  }, [suppliers]);

  useEffect(() => {
    if (!item) return;
    const savedMap = loadSavedOffersMap();
    const key = String(item.id || item.name || '').toLowerCase();
    const currentPrice = Number(item.new_price) > 0 ? Number(item.new_price) : (Number(item.price) || 0);
    const baseOffer = {
      id: 'current-supplier',
      supplier_name: item.supplier || 'Supplier saat ini',
      price: currentPrice,
      quality: 'Standar',
      lead_time: 'Reguler',
      delivery_date: '',
      notes: 'Supplier utama bahan ini'
    };
    const customOffers = Array.isArray(savedMap[key]) ? savedMap[key] : [];
    const merged = [
      baseOffer,
      ...customOffers.filter((o) => (o.supplier_name || '').toLowerCase() !== (baseOffer.supplier_name || '').toLowerCase())
    ];
    setOffers(merged);
  }, [item]);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  }, [offers]);

  const liveLeadMeta = useMemo(
    () => computeLeadTimeMeta(newOffer.delivery_date),
    [newOffer.delivery_date]
  );

  const isSupplierNew = useMemo(() => {
    const q = (newOffer.supplier_name || '').trim().toLowerCase();
    if (!q) return false;
    return !allSuppliers.some((s) => String(s.name || '').trim().toLowerCase() === q);
  }, [newOffer.supplier_name, allSuppliers]);

  if (!item) return null;

  const currentPrice = Number(item.new_price) > 0 ? Number(item.new_price) : (Number(item.price) || 0);

  const handleQuickSaveSupplierToMaster = async () => {
    const clean = (newOffer.supplier_name || '').trim();
    if (!clean || savingQuickSup) return;
    setSavingQuickSup(true);
    try {
      const saved = await api.saveSupplier({ name: clean, phone: '', contact_person: '', address: '' });
      const nextList = [...allSuppliers, saved || { id: `sup-${Date.now()}`, name: clean }];
      setAllSuppliers(nextList);
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: `Supplier "${clean}" masuk daftar master.`, type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: err.message || 'Gagal simpan supplier baru.', type: 'error' } }));
    } finally {
      setSavingQuickSup(false);
    }
  };

  const handleAddComparisonOffer = async (e) => {
    e.preventDefault();
    if (!newOffer.supplier_name.trim() || !newOffer.price || Number(newOffer.price) <= 0) return;

    const cleanSup = newOffer.supplier_name.trim();
    if (isSupplierNew) {
      try {
        const saved = await api.saveSupplier({ name: cleanSup, phone: '', contact_person: '', address: '' });
        setAllSuppliers((prev) => [...prev, saved || { id: `sup-${Date.now()}`, name: cleanSup }]);
      } catch {
        // tetap simpan pembanding walau master gagal
      }
    }

    const meta = computeLeadTimeMeta(newOffer.delivery_date);
    const entry = {
      id: `off-${Date.now()}`,
      supplier_name: cleanSup,
      price: Number(newOffer.price),
      quality: newOffer.quality || 'Standar',
      delivery_date: newOffer.delivery_date,
      lead_time: meta.badge,
      h_label: meta.hLabel,
      notes: newOffer.notes.trim() || '-'
    };

    const nextOffers = [
      ...offers.filter((o) => o.supplier_name.toLowerCase() !== entry.supplier_name.toLowerCase()),
      entry
    ];
    setOffers(nextOffers);
    const savedMap = loadSavedOffersMap();
    const key = String(item.id || item.name || '').toLowerCase();
    savedMap[key] = nextOffers;
    saveOffersMap(savedMap);

    // Masuk ke sistem pengingat PO Purchasing
    savePoReminder({
      itemName: item.name,
      supplierName: cleanSup,
      deliveryDate: newOffer.delivery_date,
      hLabel: meta.hLabel,
      price: entry.price,
      unit: item.unit || 'pcs'
    });

    window.dispatchEvent(new CustomEvent('barventis:toast', {
      detail: { message: `Pembanding disimpan & pengingat PO diset ke ${meta.badge}.`, type: 'success' }
    }));

    setNewOffer({ supplier_name: '', price: '', quality: 'Standar', delivery_date: getTomorrowISO(), notes: '' });
  };

  const handleRemoveOffer = (offerId) => {
    const nextOffers = offers.filter((o) => o.id !== offerId);
    setOffers(nextOffers);
    const savedMap = loadSavedOffersMap();
    const key = String(item.id || item.name || '').toLowerCase();
    savedMap[key] = nextOffers;
    saveOffersMap(savedMap);
  };

  const handleApplyOffer = (offer) => {
    const diff = currentPrice - Number(offer.price || 0);
    const autoNote = changeReason.trim() || (
      diff > 0
        ? `Ganti ke ${offer.supplier_name} (hemat Rp ${diff.toLocaleString('id-ID')}/${item.unit || 'pck'})`
        : `Pakai ${offer.supplier_name}`
    );

    if (offer.delivery_date) {
      savePoReminder({
        itemName: item.name,
        supplierName: offer.supplier_name,
        deliveryDate: offer.delivery_date,
        hLabel: offer.h_label || 'H+1',
        price: offer.price,
        unit: item.unit || 'pcs'
      });
    }

    if (onSelect) {
      onSelect({
        ...offer,
        previous_supplier: item.supplier || '-',
        previous_price: currentPrice,
        savings_per_unit: diff,
        change_note: autoNote
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-w-2xl w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div>
            <h3 className="font-bold text-base text-[var(--text-primary)] m-0">
              Bandingkan Supplier
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 m-0">
              <strong>{item.name}</strong> ({item.full_pack || item.unit}) · Sekarang: <strong className="text-[var(--accent)]">{item.supplier || '-'}</strong> (Rp {currentPrice.toLocaleString('id-ID')}/{item.unit})
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        {/* Form Tambah Pembanding + Kalender Pengingat PO */}
        <form onSubmit={handleAddComparisonOffer} className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-[var(--text-primary)]">+ Tambah Pembanding</span>
            {isSupplierNew && (
              <button
                type="button"
                onClick={handleQuickSaveSupplierToMaster}
                disabled={savingQuickSup}
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-primary)] inline-flex items-center gap-1"
              >
                <Plus size={12} /> {savingQuickSup ? 'Menyimpan...' : `Simpan "${newOffer.supplier_name.trim()}" ke Daftar Supplier`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Nama Supplier *</label>
              <input
                type="text"
                list="comparison-supplier-list"
                className="form-control text-xs py-1.5 px-2.5 w-full"
                placeholder="Pilih atau ketik supplier baru..."
                value={newOffer.supplier_name}
                onChange={(e) => setNewOffer((prev) => ({ ...prev, supplier_name: e.target.value }))}
                required
              />
              <datalist id="comparison-supplier-list">
                {allSuppliers.map((s) => <option key={s.id || s.name} value={s.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Harga / {item.unit || 'Pack'} *</label>
              <input
                type="number"
                min="1"
                step="any"
                className="form-control text-xs py-1.5 px-2.5 w-full font-mono"
                placeholder="Mis. 25000"
                value={newOffer.price}
                onChange={(e) => setNewOffer((prev) => ({ ...prev, price: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Kualitas</label>
              <select
                className="form-control text-xs py-1.5 px-2.5 w-full"
                value={newOffer.quality}
                onChange={(e) => setNewOffer((prev) => ({ ...prev, quality: e.target.value }))}
              >
                <option value="Premium">Bagus / Grade A</option>
                <option value="Standar">Standar</option>
                <option value="Ekonomis">Ekonomis</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
            <div className="sm:col-span-2">
              <label className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                <span className="inline-flex items-center gap-1"><Calendar size={12} /> Jadwal Kirim &amp; Pengingat PO</span>
                <span className="text-[10px] font-bold text-[var(--accent)]">{liveLeadMeta.hLabel}</span>
              </label>
              <input
                type="date"
                className="form-control text-xs py-1.5 px-2.5 w-full"
                value={newOffer.delivery_date}
                onChange={(e) => setNewOffer((prev) => ({ ...prev, delivery_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Catatan (opsional)</label>
              <input
                type="text"
                className="form-control text-xs py-1.5 px-2.5 w-full"
                placeholder="Gratis ongkir, dll."
                value={newOffer.notes}
                onChange={(e) => setNewOffer((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary text-xs py-2 px-3 w-full font-bold">
                Simpan
              </button>
            </div>
          </div>

          <div className="text-[11px] text-[var(--text-secondary)] flex items-center gap-1.5">
            <Bell size={12} className="text-[var(--accent)] shrink-0" />
            <span>Jadwal <strong>{liveLeadMeta.badge}</strong> otomatis masuk pengingat PO supaya tidak lupa order.</span>
          </div>
        </form>

        {/* Daftar Pilihan Supplier */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-[var(--text-primary)]">
            Daftar Pilihan Supplier ({sortedOffers.length})
          </div>
          <div className="space-y-2 max-h-[34vh] overflow-y-auto pr-1">
            {sortedOffers.map((offer, idx) => {
              const isSelected = (offer.supplier_name || '').toLowerCase() === (item.supplier || '').toLowerCase();
              const isCheapest = idx === 0 && sortedOffers.length > 1;
              const diff = currentPrice - Number(offer.price || 0);

              return (
                <div
                  key={offer.id || offer.supplier_name}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--bg-secondary)]/50'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-[var(--text-primary)]">{offer.supplier_name}</span>
                      {isCheapest && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                          Paling Murah
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]">
                          Dipakai
                        </span>
                      )}
                      {offer.lead_time && (
                        <span className="text-[10px] text-[var(--text-secondary)] font-semibold">
                          Kirim: {offer.lead_time}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
                      <span className="font-bold text-[var(--text-primary)]">
                        Rp {Number(offer.price || 0).toLocaleString('id-ID')}
                      </span>
                      <span className="text-[var(--text-muted)]">/ {item.unit}</span>
                      {diff > 0 && (
                        <span className="text-[11px] font-bold text-emerald-600">
                          (Hemat Rp {diff.toLocaleString('id-ID')})
                        </span>
                      )}
                    </div>
                    {offer.notes && offer.notes !== '-' && (
                      <div className="text-[11px] text-[var(--text-secondary)]">{offer.notes}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {offer.id !== 'current-supplier' && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOffer(offer.id)}
                        className="btn btn-secondary text-[11px] py-1.5 px-2.5 text-red-500"
                      >
                        Hapus
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleApplyOffer(offer)}
                      className="btn btn-primary text-xs py-1.5 px-3 font-bold"
                    >
                      Pilih
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alasan Ganti Supplier */}
        <div>
          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
            Alasan ganti supplier (opsional)
          </label>
          <input
            type="text"
            className="form-control text-xs py-1.5 px-2.5 w-full"
            placeholder="Mis. lebih murah atau stok supplier lama kosong"
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-[var(--border)]">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs py-2 px-4">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
