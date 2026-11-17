import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { api } from '../../services/api';

const STORAGE_KEY = 'barventis_supplier_price_comparisons_v17';

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

export default function ComparePriceModal({ item, suppliers = [], onClose, onSelect }) {
  const [allSuppliers, setAllSuppliers] = useState(suppliers || []);
  const [offers, setOffers] = useState([]);
  const [newOffer, setNewOffer] = useState({
    supplier_name: '',
    price: '',
    quality: 'Standar',
    lead_time: 'H+1',
    notes: ''
  });
  const [changeReason, setChangeReason] = useState('');

  useEffect(() => {
    if (!suppliers || suppliers.length === 0) {
      api.getSuppliers().then(res => setAllSuppliers(res || [])).catch(() => {});
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
      supplier_name: item.supplier || 'Supplier Utama Saat Ini',
      price: currentPrice,
      quality: 'Standar (Acuan)',
      lead_time: 'Reguler',
      notes: 'Supplier terdaftar di master bahan saat ini'
    };
    const customOffers = Array.isArray(savedMap[key]) ? savedMap[key] : [];
    const merged = [
      baseOffer,
      ...customOffers.filter(o => (o.supplier_name || '').toLowerCase() !== (baseOffer.supplier_name || '').toLowerCase())
    ];
    setOffers(merged);
  }, [item]);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  }, [offers]);

  if (!item) return null;

  const currentPrice = Number(item.new_price) > 0 ? Number(item.new_price) : (Number(item.price) || 0);

  const handleAddComparisonOffer = (e) => {
    e.preventDefault();
    if (!newOffer.supplier_name.trim() || !newOffer.price || Number(newOffer.price) <= 0) return;
    const entry = {
      id: `off-${Date.now()}`,
      supplier_name: newOffer.supplier_name.trim(),
      price: Number(newOffer.price),
      quality: newOffer.quality || 'Standar',
      lead_time: newOffer.lead_time || '-',
      notes: newOffer.notes.trim() || '-'
    };
    const nextOffers = [
      ...offers.filter(o => o.supplier_name.toLowerCase() !== entry.supplier_name.toLowerCase()),
      entry
    ];
    setOffers(nextOffers);
    const savedMap = loadSavedOffersMap();
    const key = String(item.id || item.name || '').toLowerCase();
    savedMap[key] = nextOffers;
    saveOffersMap(savedMap);
    setNewOffer({ supplier_name: '', price: '', quality: 'Standar', lead_time: 'H+1', notes: '' });
  };

  const handleRemoveOffer = (offerId) => {
    const nextOffers = offers.filter(o => o.id !== offerId);
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
        ? `Ganti ke ${offer.supplier_name} (Lebih hemat Rp ${diff.toLocaleString('id-ID')}/${item.unit || 'pck'}, Kualitas: ${offer.quality || 'Standar'})`
        : `Pilih supplier ${offer.supplier_name} (Kualitas: ${offer.quality || 'Standar'})`
    );
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
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="relative max-w-2xl w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div>
            <h3 className="font-bold text-base text-[var(--text-primary)] m-0">
              Analisis &amp; Komparasi Efisiensi Supplier
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 m-0">
              Bahan: <strong className="text-[var(--text-primary)]">{item.name}</strong> · Kemasan: <strong>{item.full_pack || item.unit}</strong> · Supplier Saat Ini: <strong className="text-[var(--accent)]">{item.supplier || '-'}</strong> (Rp {currentPrice.toLocaleString('id-ID')}/{item.unit})
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>

        {/* Form Tambah Penawaran Supplier Pembanding */}
        <form onSubmit={handleAddComparisonOffer} className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3">
          <div className="text-xs font-bold text-[var(--text-primary)]">
            + Tambah Data Pembanding Harga &amp; Kualitas dari Supplier Lain
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Nama Supplier Pembanding *</label>
              <input
                type="text"
                list="comparison-supplier-list"
                className="form-control text-xs py-1.5 px-2.5 w-full"
                placeholder="Pilih atau ketik nama supplier..."
                value={newOffer.supplier_name}
                onChange={e => setNewOffer(prev => ({ ...prev, supplier_name: e.target.value }))}
                required
              />
              <datalist id="comparison-supplier-list">
                {allSuppliers.map(s => <option key={s.id || s.name} value={s.name} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Harga / {item.unit || 'Pack'} (Rp) *</label>
              <input
                type="number"
                min="1"
                step="any"
                className="form-control text-xs py-1.5 px-2.5 w-full font-mono"
                placeholder="Contoh: 95000"
                value={newOffer.price}
                onChange={e => setNewOffer(prev => ({ ...prev, price: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Kualitas (Opsional)</label>
              <select
                className="form-control text-xs py-1.5 px-2.5 w-full"
                value={newOffer.quality}
                onChange={e => setNewOffer(prev => ({ ...prev, quality: e.target.value }))}
              >
                <option value="Premium">Premium / Grade A</option>
                <option value="Standar">Standar Setara</option>
                <option value="Ekonomis">Ekonomis</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Lead Time Kirim</label>
              <input
                type="text"
                className="form-control text-xs py-1.5 px-2.5 w-full"
                placeholder="H+1 / Same Day"
                value={newOffer.lead_time}
                onChange={e => setNewOffer(prev => ({ ...prev, lead_time: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Catatan Spesifikasi / Efisiensi (Opsional)</label>
              <input
                type="text"
                className="form-control text-xs py-1.5 px-2.5 w-full"
                placeholder="Mis: Kemasan 1 Kg, gratis ongkir min 5 pack..."
                value={newOffer.notes}
                onChange={e => setNewOffer(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary text-xs py-2 px-3 w-full font-bold">
                Simpan Pembanding
              </button>
            </div>
          </div>
        </form>

        {/* Tabel Komparasi Supplier */}
        <div className="space-y-2">
          <div className="text-xs font-bold text-[var(--text-primary)]">
            Daftar Perbandingan Harga, Kualitas &amp; Efisiensi Supplier ({sortedOffers.length} Opsi)
          </div>
          <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
            {sortedOffers.map((offer, idx) => {
              const isSelected = (offer.supplier_name || '').toLowerCase() === (item.supplier || '').toLowerCase();
              const isCheapest = idx === 0 && sortedOffers.length > 1;
              const diff = currentPrice - Number(offer.price || 0);
              const pctDiff = currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(1) : '0.0';

              return (
                <div
                  key={offer.id || offer.supplier_name}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border)] bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-[var(--text-primary)]">{offer.supplier_name}</span>
                      {isCheapest && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Paling Efisien / Termurah
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]">
                          Supplier Saat Ini
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]">
                        Kualitas: {offer.quality || 'Standar'}
                      </span>
                      {offer.lead_time && (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          Lead Time: {offer.lead_time}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
                      <strong className="text-sm font-bold text-[var(--text-primary)]">
                        Rp {Number(offer.price || 0).toLocaleString('id-ID')}
                      </strong>
                      <span className="text-[var(--text-muted)]">/ {item.unit}</span>
                      {diff > 0 && (
                        <span className="text-emerald-600 font-bold text-[11px]">
                          (Hemat Rp {diff.toLocaleString('id-ID')} / {pctDiff}%)
                        </span>
                      )}
                      {diff < 0 && (
                        <span className="text-amber-600 font-semibold text-[11px]">
                          (+Rp {Math.abs(diff).toLocaleString('id-ID')} lebih tinggi)
                        </span>
                      )}
                    </div>
                    {offer.notes && offer.notes !== '-' && (
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        Catatan: {offer.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isSelected && (
                      <button
                        type="button"
                        className="btn btn-primary text-xs py-1.5 px-3 font-bold"
                        onClick={() => handleApplyOffer(offer)}
                      >
                        Gunakan Supplier Ini
                      </button>
                    )}
                    {offer.id !== 'current-supplier' && (
                      <button
                        type="button"
                        className="btn btn-secondary text-xs py-1.5 px-2.5"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => handleRemoveOffer(offer.id)}
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Catatan Pergantian Supplier untuk Pembuat PO & Owner */}
        <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
          <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">
            Catatan Pergantian Supplier (Tampil pada PO Cabang &amp; Persetujuan Owner):
          </label>
          <input
            type="text"
            className="form-control text-xs py-2 px-3 w-full"
            placeholder="Contoh: Diganti ke supplier ini karena harga lebih murah Rp 12.000/pack dengan kualitas setara..."
            value={changeReason}
            onChange={e => setChangeReason(e.target.value)}
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button type="button" className="btn btn-secondary text-xs py-2 px-4" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
