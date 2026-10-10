import { useState } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';

export default function AddSupplierModal({ onClose, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [newSupplierData, setNewSupplierData] = useState({ name: '', phone: '', address: '', contact_person: '' });

  const handleQuickAddSupplier = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // In a real implementation, call api.createSupplier
      // await api.createSupplier(newSupplierData);
      onSuccess(newSupplierData);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="relative max-w-md w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-[var(--accent)]" />
            <h3 className="font-bold text-sm text-[var(--text-primary)]">Tambah Supplier Baru</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleQuickAddSupplier} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">Nama Supplier <span className="text-rose-500">*</span></label>
            <input type="text" placeholder="Contoh: PT Segar Pangan Makmur" className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={newSupplierData.name} onChange={e => setNewSupplierData({ ...newSupplierData, name: e.target.value })} required autoFocus />
          </div>
          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">Nomor HP / WhatsApp</label>
            <input type="text" placeholder="0812xxxxxxxx" className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={newSupplierData.phone} onChange={e => setNewSupplierData({ ...newSupplierData, phone: e.target.value })} />
          </div>
          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">Contact Person (PIC)</label>
            <input type="text" placeholder="Nama sales / kontak supplier" className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]" value={newSupplierData.contact_person} onChange={e => setNewSupplierData({ ...newSupplierData, contact_person: e.target.value })} />
          </div>
          <div>
            <label className="block font-semibold text-[var(--text-primary)] mb-1">Alamat / Lokasi</label>
            <textarea rows="2" placeholder="Alamat gudang / pasar / toko..." className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none" value={newSupplierData.address} onChange={e => setNewSupplierData({ ...newSupplierData, address: e.target.value })} />
          </div>
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)] mt-5">
            <button type="button" className="btn btn-secondary text-xs px-3.5 py-2" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5" disabled={saving}>
              {saving && <Loader2 size={13} className="animate-spin" />}
              Daftarkan Supplier
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
