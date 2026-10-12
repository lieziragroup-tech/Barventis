import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Trash2, CheckCircle2, TrendingDown, TrendingUp, AlertTriangle, Layers, Clock, Loader2 } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../../contexts/ToastContext';
import { api } from '../../services/api';
import { supabase } from '../../lib/supabase';
import Pagination from './Pagination';
import { triggerHaptic } from '../../utils/haptics';

const ACTION_TYPES = [
  { id: 'OUT', label: 'Pemakaian (OUT)', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: TrendingDown, sign: '-' },
  { id: 'IN', label: 'Barang Masuk (IN)', color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: TrendingUp, sign: '+' },
  { id: 'WASTE', label: 'Limbah / Basi (WASTE)', color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: AlertTriangle, sign: '!' },
  { id: 'CLOSING', label: 'Hitung Sisa Fisik (EOD)', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: Layers, sign: '=' }
];

export default function QuickUsageLogger({ onActionRecorded }) {
  const { stock: rawStock, refreshData } = useData();
  const materials = rawStock || [];
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  
  // Form fields
  const [actionType, setActionType] = useState('OUT');
  const [qtyValue, setQtyValue] = useState('');
  const [fractionValue, setFractionValue] = useState(''); // khusus untuk closing broken
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Active recorded list for today
  const [activeActions, setActiveActions] = useState([]);
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

  // 2. Fetch today's transactions & EOD mutations
  const fetchTodayActions = async () => {
    try {
      setLoadingList(true);
      const tenantId = await api.getActiveTenantId();
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('transactions')
        .select('id, date, type, qty, amount, notes, created_at, material_id, materials(name, unit, category)')
        .eq('tenant_id', tenantId)
        .eq('date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setActiveActions(data || []);
    } catch (err) {
      console.error('Error fetching today actions:', err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchTodayActions();
  }, []);

  // 3. Paginated list
  const paginatedActions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return activeActions.slice(start, start + itemsPerPage);
  }, [activeActions, currentPage, itemsPerPage]);

  // 4. Handle Submit Action
  const handleSubmitAction = async (e) => {
    e.preventDefault();
    if (!selectedMaterial) {
      return toast.showError('Pilih bahan baku dari hasil pencarian.');
    }
    const qty = parseFloat(qtyValue);
    if (isNaN(qty) || qty < 0) {
      return toast.showError('Masukkan kuantitas yang valid (>= 0).');
    }

    setSaving(true);
    try {
      const desc = notes.trim() 
        ? `Quick Action [${actionType}]: ${notes.trim()}`
        : `Mutasi Cepat EOD [${actionType}]`;

      if (actionType === 'WASTE') {
        // Panggil recordWaste
        await api.recordWaste({
          material_id: selectedMaterial.id,
          quantity: qty,
          type: 'WASTE',
          location: 'RESTO',
          reason: notes.trim() || 'Limbah Harian (Quick EOD)',
          notes: desc
        });
      } else if (actionType === 'IN' || actionType === 'OUT') {
        // Panggil adjustStock
        await api.adjustStock(
          selectedMaterial.id,
          'RESTO',
          actionType,
          qty,
          desc
        );
      } else if (actionType === 'CLOSING') {
        // Sisa fisik closing
        const broken = parseFloat(fractionValue) || 0;
        const totalClosing = qty + broken;
        await api.adjustStock(
          selectedMaterial.id,
          'RESTO',
          'OPNAME_ADJ',
          totalClosing,
          `Hitung Fisik Sisa EOD: Utuh ${qty}, Pecahan ${broken} (${desc})`
        );
      }

      triggerHaptic('success');
      toast.showSuccess(`Aksi ${actionType} untuk ${selectedMaterial.name} berhasil dicatat!`);

      // Reset form
      setSelectedMaterial(null);
      setSearch('');
      setQtyValue('');
      setFractionValue('');
      setNotes('');

      // Refresh data
      await fetchTodayActions();
      if (refreshData) refreshData();
      if (onActionRecorded) onActionRecorded();
    } catch (err) {
      triggerHaptic('error');
      toast.showError('Gagal mencatat mutasi: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedActionConfig = ACTION_TYPES.find(a => a.id === actionType);

  return (
    <div className="space-y-6">
      {/* Input Box: Omnichannel Quick EOD Mutasi Logger */}
      <div className="glass-card p-5 md:p-6 rounded-2xl border border-[var(--border)] bg-gradient-to-r from-blue-50/40 via-indigo-50/20 to-purple-50/30">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[var(--text-primary)]">Quick EOD Action & Mutasi Langsung</h3>
              <p className="text-xs text-[var(--text-secondary)]">Pilih aksi (IN, OUT, Waste, Sisa Fisik), cari bahan, dan simpan. Bahan lain otomatis default 0.</p>
            </div>
          </div>

          {/* Action Selector Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-white/80 border border-gray-200 rounded-xl overflow-x-auto">
            {ACTION_TYPES.map((a) => {
              const Icon = a.icon;
              const isSel = actionType === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActionType(a.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isSel ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={13} />
                  <span>{a.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmitAction} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            
            {/* 1. Search Input with Debounce */}
            <div className="md:col-span-4 relative">
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
                      className="p-3 text-xs hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors"
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

            {/* 2. Primary Qty Input */}
            <div className={actionType === 'CLOSING' ? 'md:col-span-2' : 'md:col-span-3'}>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">
                {actionType === 'CLOSING' ? '2. Sisa Utuh (Full) *' : `2. Jumlah ${actionType} *`}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  placeholder="0.00"
                  className="form-control w-full text-sm py-2.5 pr-12 font-bold font-mono text-indigo-600"
                  value={qtyValue}
                  onChange={(e) => setQtyValue(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                  {selectedMaterial?.unit || 'Unit'}
                </span>
              </div>
            </div>

            {/* 2b. Fraction Input khusus CLOSING */}
            {actionType === 'CLOSING' && (
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1.5">Pecahan (0.25 / 0.5)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="0.99"
                  placeholder="0.00"
                  className="form-control w-full text-sm py-2.5 font-bold font-mono text-blue-600"
                  value={fractionValue}
                  onChange={(e) => setFractionValue(e.target.value)}
                />
              </div>
            )}

            {/* 3. Notes */}
            <div className={actionType === 'CLOSING' ? 'md:col-span-2' : 'md:col-span-3'}>
              <label className="text-xs font-bold text-gray-600 block mb-1.5">3. Keterangan</label>
              <input
                type="text"
                placeholder="Opsional..."
                className="form-control w-full text-sm py-2.5"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* 4. Submit Button */}
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving || !selectedMaterial || !qtyValue}
                className="w-full btn btn-primary py-2.5 justify-center font-bold text-xs shadow-md shadow-indigo-500/20 disabled:opacity-50 h-[42px]"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Catat {actionType}</>}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* List of Today's Recorded Actions with 20-Item Pagination */}
      <div className="glass-card rounded-2xl border border-[var(--border)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 flex justify-between items-center flex-wrap gap-2">
          <div>
            <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Clock size={16} className="text-indigo-600" /> Mutasi & Aksi Hari Ini
            </h4>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Seluruh rekaman IN, OUT, Waste, dan Sisa Fisik yang sudah dicatat hari ini. Otomatis sinkron ke rekap & formulir EOD.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
            {activeActions.length} Mutasi Tercatat
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="custom-table w-full">
            <thead>
              <tr>
                <th className="w-12 text-center">No</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Tipe Aksi</th>
                <th>Nama Bahan Baku</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Kuantitas</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Nilai Rupiah</th>
                <th>Keterangan</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Waktu</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-[var(--text-muted)]">
                    <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                    Memuat rekaman mutasi hari ini...
                  </td>
                </tr>
              ) : paginatedActions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-[var(--text-muted)] text-xs">
                    Belum ada mutasi bahan dicatat hari ini. Seluruh bahan lainnya saat ini bernilai default 0.
                  </td>
                </tr>
              ) : (
                paginatedActions.map((item, idx) => {
                  const m = item.materials || {};
                  const isOut = item.type === 'OUT' || item.type === 'WASTE';
                  const isIn = item.type === 'IN';
                  return (
                    <tr key={item.id} className="hover:bg-[var(--bg-secondary)]/50">
                      <td className="text-center text-[var(--text-muted)] font-mono text-xs">
                        {(currentPage - 1) * itemsPerPage + idx + 1}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.type === 'IN' ? 'bg-green-100 text-green-700' :
                          item.type === 'OUT' ? 'bg-orange-100 text-orange-700' :
                          item.type === 'WASTE' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="font-semibold text-gray-800">
                        {m.name || 'Bahan'}
                        <div className="text-[10px] text-gray-400 font-normal">{m.category || '-'}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: isOut ? 'var(--danger)' : isIn ? 'var(--success)' : 'var(--accent)' }}>
                        {isOut ? '-' : isIn ? '+' : ''}{item.qty} {m.unit || 'unit'}
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
        {activeActions.length > 0 && (
          <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex justify-end">
            <Pagination
              page={currentPage}
              pageSize={itemsPerPage}
              totalCount={activeActions.length}
              onPageChange={setCurrentPage}
              itemLabel="mutasi"
            />
          </div>
        )}
      </div>
    </div>
  );
}
