import { useState } from 'react';
import { X, TrendingDown, Loader2 } from 'lucide-react';

export default function ComparePriceModal({ item, onClose, onSelect }) {
  if (!item) return null;

  // Simulate offers if none provided yet (In real implementation, fetch from price history)
  const offers = item.offers || [
    { supplier_id: 'SUP-1', supplier_name: item.supplier || 'Current Supplier', supplier_code: 'CUR', price: item.price }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="relative max-w-lg w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div>
            <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
              <TrendingDown size={16} className="text-[var(--accent)]" />
              Perbandingan Harga Supplier
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Bahan: <strong className="text-[var(--text-primary)]">{item.name}</strong> ({item.sku || 'N/A'})
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
          {offers.map((offer, idx) => {
            const isSelected = offer.supplier_name === item.supplier;
            const isCheapest = idx === 0;
            const diff = (item.price || 0) - offer.price;

            return (
              <div key={offer.supplier_id} className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm' : 'border-[var(--border)] bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)]'}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-primary)]">{offer.supplier_name}</span>
                    {isCheapest && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Termurah</span>}
                    {isSelected && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)]">Terpilih</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs font-mono">
                    <strong className="text-sm font-bold text-[var(--text-primary)]">Rp {offer.price.toLocaleString('id-ID')}</strong>
                    <span className="text-[var(--text-muted)]">/ {item.unit}</span>
                    {!isSelected && diff > 0 && <span className="text-emerald-600 font-semibold text-[11px]">(Lebih hemat Rp {diff.toLocaleString('id-ID')})</span>}
                  </div>
                </div>
                {!isSelected && (
                  <button type="button" className="btn btn-primary text-xs py-1.5 px-3" onClick={() => { onSelect(offer); onClose(); }}>
                    Pilih Ini
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 flex justify-end">
          <button type="button" className="btn btn-secondary text-xs" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
