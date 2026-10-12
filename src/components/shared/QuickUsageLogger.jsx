import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Trash2, CheckCircle2, TrendingDown, Clock, Loader2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { supabase } from '../../lib/supabase';
import Pagination from './Pagination';
import { triggerHaptic } from '../../utils/haptics';

export default function QuickUsageLogger({ onUsageRecorded }) {
  const { stock: rawStock, refreshData } = useData();
  const materials = rawStock || [];
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [usageQty, setUsageQty] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Active recorded list for today
  const [activeUsages, setActiveUsages] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // Pagination state (20 items per page)
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // 1. Debounce implementation for search (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  // Autocomplete suggestions based on debounced search
  const suggestions = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    return materials
      .filter(m => m.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
      .slice(0, 8);
  }, [materials, debouncedSearch]);

  // 2. Fetch today's OUT transactions
  const fetchTodayUsages = async () => {
    try {
      setLoadingList(true);
      const tenantId = await api.getActiveTenantId();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('transactions')
        .select('id, date, qty, amount, notes, created_at, material_id, materials(name, unit, category)')
        .eq('tenant_id', tenantId)
        .eq('date', today)
        .eq('type', 'OUT')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActiveUsages(data || []);
    } catch (err) {
      console.error('Error fetching today usages:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchTodayUsages();
  }, []);

  // 3. Paginated list
  const paginatedUsages = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return activeUsages.slice(start, start + itemsPerPage);
  }, [activeUsages, currentPage, itemsPerPage]);

  // 4. Handle Add Usage
  const handleAddUsage = async (e) => {
    e.preventDefault();
    if (!selectedMaterial) {
      return toast.showError('Pilih bahan baku dari hasil pencarian.');
    }
    const qty = parseFloat(usageQty);
    if (isNaN(qty) || qty <= 0) {
      return toast.showError('Masukkan kuantitas pemakaian yang valid (> 0).');
    }

    setSaving(true);
    try {
      await api.adjustStock(
        selectedMaterial.id,
        'RESTO',
        'OUT',
        qty,
        notes.trim() ? `Pemakaian Harian: ${notes.trim()}` : 'Pemakaian Harian Operasional (OUT)'
      );

      triggerHaptic('success');
      toast.showSuccess(`Pemakaian ${selectedMaterial.name} (${qty} ${selectedMaterial.unit}) berhasil dicatat!`);

      // Reset form
      setSelectedMaterial(null);
      setSearch('');
      setUsageQty('');
      setNotes('');

      // Refresh data
      await fetchTodayUsages();
      if (refreshData) refreshData();
      if (onUsageRecorded) onUsageRecorded();
    } catch (err) {
      triggerHaptic('error');
      toast.showError('Gagal mencatat pemakaian: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Box: On-demand Quick Logger */}
      <div className="glass-card p-5 md:p-6 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <TrendingDown size={18} />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-[var(--text-primary)]">Catat Pemakaian Cepat (Quick Usage)</h3>
            <p className="text-xs text-[var(--text-secondary)]">Cari bahan yang terpakai hari ini, masukkan jumlahnya (OUT). Bahan lain otomatis default 0.</p>
          </div>
        </div>

        <form onSubmit={handleAddUsage} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            
            {/* Search Input with Debounce */}
            <div className="md:col-span-5 relative">
              <label className="text-xs font-bold text-gray-600 block mb-1.5">1. Cari Nama Bahan (Debounced) *</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Ketik nama bahan (cth: Air Kelapa, Susu)..."
                  className="form-control pl-9 w-full text-sm py-2.5"
                  value={selectedMaterial ? selectedMaterial.name : search}
                  onChange={(e) => {
                    setSelectedMaterial(null);
                    setSearch(e.target.value);
                  }}
                />
              </div>

              {/* Suggestions Dropdown */}
              {!selectedMaterial && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-[var(--border)] rounded-xl shadow-2xl max-h-56 overflow-y-auto divide-y divide-gray-100">
                  {suggestions.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 text-xs hover:bg-blue-50 cursor-pointer flex justify-between items-center transition-colors"
                      onClick={() => {
                        setSelectedMaterial(m);
                        setSearch(m.name);
                      }}
                    >
                      <span className="font-semibold text-gray-800">{m.name}</span>
                      <span className="text-gray-400 font-mono text-[11px]">{m.unit} • {m.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Qty Input */}
            <div className="md:col-span-3">
              <label className="text-xs font-bold text-gray-600 block mb-1.5">2. Jumlah Terpakai (OUT) *</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  placeholder="0.00"
                  className="form-control w-full text-sm py-2.5 pr-12 font-bold font-mono text-blue-600"
                  value={usageQty}
                  onChange={(e) => setUsageQty(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                  {selectedMaterial?.unit || 'Unit'}
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-gray-600 block mb-1.5">3. Keterangan</label>
              <input
                type="text"
                placeholder="Opsional..."
                className="form-control w-full text-sm py-2.5"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Submit Button */}
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving || !selectedMaterial || !usageQty}
                className="w-full btn btn-primary py-2.5 justify-center font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50 h-[42px]"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Catat OUT</>}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* List of Today's Recorded Usages with 20-Item Pagination */}
      <div className="glass-card rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 flex justify-between items-center flex-wrap gap-2">
          <div>
            <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Clock size={16} className="text-blue-600" /> Daftar Pemakaian Hari Ini (Aktif)
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Hanya menampilkan bahan yang ada mutasi keluarnya hari ini. Terkoneksi otomatis ke rekap & EOD.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
            {activeUsages.length} Bahan Terpakai
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="custom-table w-full">
            <thead>
              <tr>
                <th className="w-12 text-center">No</th>
                <th>Nama Bahan Baku</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Jumlah Terpakai</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Estimasi Biaya</th>
                <th>Keterangan</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Waktu Input</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-[var(--text-muted)]">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                    Memuat data pemakaian hari ini...
                  </td>
                </tr>
              ) : paginatedUsages.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-[var(--text-muted)] text-xs">
                    Belum ada pemakaian bahan dicatat hari ini. Semua bahan lainnya saat ini bernilai 0.
                  </td>
                </tr>
              ) : (
                paginatedUsages.map((item, idx) => {
                  const m = item.materials || {};
                  return (
                    <tr key={item.id} className="hover:bg-[var(--bg-secondary)]/50">
                      <td className="text-center text-[var(--text-muted)] font-mono text-xs">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td className="font-semibold text-gray-800">
                        {m.name || 'Bahan'}
                        <div className="text-[10px] text-gray-400 font-normal">{m.category || '-'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>
                        -{item.qty} {m.unit || 'unit'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Rp {Math.round(item.amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="text-xs text-gray-500 max-w-xs truncate">
                        {item.notes || '-'}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {item.created_at ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar (Max 20 items per page) */}
        {activeUsages.length > 0 && (
          <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex justify-end">
            <Pagination
              page={currentPage}
              pageSize={itemsPerPage}
              totalCount={activeUsages.length}
              onPageChange={setCurrentPage}
              itemLabel="pemakaian"
            />
          </div>
        )}
      </div>
    </div>
  );
}
