import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertTriangle, Clock, Sliders, CheckCircle2, Search, RefreshCw, Info, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  getExpiryColor,
  getExpiryThresholds,
  saveExpiryThresholds,
  DEFAULT_EXPIRY_THRESHOLDS
} from '../../utils/expiryColor';

export default function ExpiryMonitor() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [thresholds, setThresholds] = useState(() => getExpiryThresholds());
  const [criticalDaysInput, setCriticalDaysInput] = useState(thresholds.criticalDays);
  const [warningDaysInput, setWarningDaysInput] = useState(thresholds.warningDays);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Filter & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'red' | 'yellow' | 'green'

  const fetchExpiry = useCallback(async () => {
    setLoading(true);
    try {
      const tenantId = profile?.tenant_id;
      if (!tenantId) return;

      // Primary: baca dari material_batches (FEFO source of truth)
      const { data: batches, error: batchErr } = await supabase
        .from('material_batches')
        .select('id, expired_date, qty_resto, qty_central, batch_no, material_id, status, materials(id, name, unit, shelf_life_days)')
        .eq('tenant_id', tenantId)
        .in('status', ['ACTIVE', 'active'])
        .order('expired_date', { ascending: true })
        .limit(100);

      if (!batchErr && batches && batches.length > 0) {
        setItems(batches.map(b => ({
          id: b.id,
          expiry_date: b.expired_date,
          qty: (Number(b.qty_resto) || 0) + (Number(b.qty_central) || 0),
          batch_no: b.batch_no,
          materials: b.materials
        })));
        return;
      }

      // Fallback: baca dari daily_inventory_items (legacy)
      const { data, error } = await supabase
        .from('daily_inventory_items')
        .select('id, expiry_date, in_qty, material_id, materials(id, name, unit, shelf_life_days)')
        .eq('tenant_id', tenantId)
        .not('expiry_date', 'is', null)
        .gte('expiry_date', new Date().toISOString().split('T')[0])
        .order('expiry_date', { ascending: true })
        .limit(50);

      if (!error && data) {
        setItems(data.map(d => ({
          id: d.id,
          expiry_date: d.expiry_date,
          qty: d.in_qty,
          batch_no: null,
          materials: d.materials
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchExpiry();
  }, [fetchExpiry]);


  const handleSaveThresholds = (e) => {
    e.preventDefault();
    const cDays = Math.max(0, parseInt(criticalDaysInput, 10) || 0);
    const wDays = Math.max(cDays, parseInt(warningDaysInput, 10) || cDays);
    const updated = saveExpiryThresholds({ criticalDays: cDays, warningDays: wDays });
    setThresholds(updated);
    setCriticalDaysInput(updated.criticalDays);
    setWarningDaysInput(updated.warningDays);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 2500);
  };

  const handleResetThresholds = () => {
    const updated = saveExpiryThresholds(DEFAULT_EXPIRY_THRESHOLDS);
    setThresholds(updated);
    setCriticalDaysInput(DEFAULT_EXPIRY_THRESHOLDS.criticalDays);
    setWarningDaysInput(DEFAULT_EXPIRY_THRESHOLDS.warningDays);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 2500);
  };

  // Metrics
  const itemsWithFefo = useMemo(() => {
    return items.map(item => ({
      ...item,
      fefo: getExpiryColor(item.expiry_date, thresholds)
    }));
  }, [items, thresholds]);

  const stats = useMemo(() => {
    let redCount = 0;
    let yellowCount = 0;
    let greenCount = 0;

    itemsWithFefo.forEach(item => {
      if (item.fefo?.color === 'red') redCount++;
      else if (item.fefo?.color === 'yellow') yellowCount++;
      else if (item.fefo?.color === 'green') greenCount++;
    });

    return {
      total: itemsWithFefo.length,
      redCount,
      yellowCount,
      greenCount
    };
  }, [itemsWithFefo]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return itemsWithFefo.filter(item => {
      const matchSearch =
        (item.materials?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.batch_no || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || item.fefo?.color === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [itemsWithFefo, searchTerm, statusFilter]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data kedaluwarsa...</div>;

  return (
    <div className="space-y-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-200">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Pantau & Setup Kedaluwarsa (FEFO)</h2>
            <p className="text-xs text-gray-500">
              Pengawasan First Expired First Out (FEFO) dengan ambang batas peringatan terintegrasi.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`btn text-xs px-3.5 py-2 flex items-center gap-1.5 transition-all ${
              showSettings ? 'btn-primary' : 'btn-secondary'
            }`}
          >
            <Sliders size={14} />
            {showSettings ? 'Tutup Pengaturan' : 'Setup Ambang Batas'}
          </button>
          <button
            onClick={fetchExpiry}
            className="btn btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            title="Muat ulang data"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Accordion / Drawer Setup Ambang Batas */}
      {showSettings && (
        <div className="bg-gradient-to-r from-amber-50/70 via-orange-50/40 to-yellow-50/60 p-5 rounded-2xl border border-amber-200 shadow-sm transition-all">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200/60 mb-4">
            <div className="flex items-center gap-2">
              <Sliders size={18} className="text-amber-700" />
              <h3 className="font-bold text-sm text-amber-900">
                Setup Ambang Batas Hari Peringatan Kedaluwarsa
              </h3>
            </div>
            {saveSuccessMsg && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 animate-pulse">
                <CheckCircle2 size={12} /> Pengaturan tersimpan!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveThresholds} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                Ambang Kritis / Bahaya (Hari)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="30"
                  className="form-control text-sm py-1.5 w-full bg-white font-medium"
                  value={criticalDaysInput}
                  onChange={(e) => setCriticalDaysInput(e.target.value)}
                  placeholder="3"
                />
                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">hari lagi</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Bahan dengan sisa waktu ≤ {criticalDaysInput} hari masuk kategori <b>Kritis (Merah)</b>.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span>
                Ambang Perhatian / Waspada (Hari)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  className="form-control text-sm py-1.5 w-full bg-white font-medium"
                  value={warningDaysInput}
                  onChange={(e) => setWarningDaysInput(e.target.value)}
                  placeholder="7"
                />
                <span className="text-xs text-gray-500 font-medium whitespace-nowrap">hari lagi</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Bahan dengan sisa waktu {Number(criticalDaysInput) + 1} s/d {warningDaysInput} hari masuk <b>Perhatian (Kuning)</b>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="btn btn-primary text-xs py-2 px-4 flex-1 flex items-center justify-center gap-1.5 shadow-sm"
              >
                <CheckCircle2 size={14} /> Simpan Ambang
              </button>
              <button
                type="button"
                onClick={handleResetThresholds}
                className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1 text-gray-600 hover:text-gray-900"
                title="Kembalikan ke standar (3 hari kritis, 7 hari perhatian)"
              >
                <RotateCcw size={13} /> Reset Standar
              </button>
            </div>
          </form>

          <div className="mt-4 pt-3 border-t border-amber-200/50 flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <Info size={13} className="text-amber-600" /> Aturan Aktif:
            </span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">
              ≤ {thresholds.criticalDays} Hari: Kritis
            </span>
            <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-medium">
              {thresholds.criticalDays + 1} - {thresholds.warningDays} Hari: Perhatian
            </span>
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">
              &gt; {thresholds.warningDays} Hari: Aman
            </span>
          </div>
        </div>
      )}

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'ALL'
              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/20'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="text-xs text-gray-500 font-medium">Total Terpantau</div>
          <div className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Semua batch aktif</div>
        </div>

        <div
          onClick={() => setStatusFilter('red')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'red'
              ? 'bg-red-50 border-red-300 ring-2 ring-red-400/20'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="text-xs text-red-600 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span> Kritis / Lewat
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">{stats.redCount}</div>
          <div className="text-[11px] text-red-500/80 mt-0.5">Prioritas pakai / olah segera</div>
        </div>

        <div
          onClick={() => setStatusFilter('yellow')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'yellow'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="text-xs text-amber-700 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Perhatian (Waspada)
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{stats.yellowCount}</div>
          <div className="text-[11px] text-amber-600/80 mt-0.5">Mendekati tenggat simpan</div>
        </div>

        <div
          onClick={() => setStatusFilter('green')}
          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'green'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-white border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Masa Simpan Aman
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.greenCount}</div>
          <div className="text-[11px] text-emerald-600/80 mt-0.5">Sisa waktu &gt; {thresholds.warningDays} hari</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari nama bahan atau batch..."
            className="form-control pl-9 w-full text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'Semua' },
            { id: 'red', label: `Kritis (${stats.redCount})`, color: 'text-red-700 bg-red-50 border-red-200' },
            { id: 'yellow', label: `Perhatian (${stats.yellowCount})`, color: 'text-amber-800 bg-amber-50 border-amber-200' },
            { id: 'green', label: `Aman (${stats.greenCount})`, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
                statusFilter === f.id
                  ? 'bg-gray-800 text-white border-gray-800 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm || statusFilter !== 'ALL'
              ? 'Tidak ada data kedaluwarsa yang sesuai dengan filter pencarian.'
              : 'Tidak ada barang dengan tanggal kedaluwarsa dalam waktu dekat.'}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="p-3.5">Nama Bahan</th>
                <th className="p-3.5">Batch / Kode</th>
                <th className="p-3.5">Sisa Qty</th>
                <th className="p-3.5">Tanggal Kedaluwarsa</th>
                <th className="p-3.5 text-right">Status FEFO</th>
                <th className="p-3.5 text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-gray-50">
              {filteredItems.map((item) => {
                const fefo = item.fefo;
                return (
                  <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="p-3.5 font-medium text-gray-800">
                      <div>{item.materials?.name || 'Unknown'}</div>
                      {item.materials?.shelf_life_days && (
                        <span className="text-[11px] text-gray-400">
                          Standar simpan: {item.materials.shelf_life_days} hari
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-gray-500 font-mono text-xs">
                      {item.batch_no ? (
                        <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{item.batch_no}</span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-3.5 text-gray-700 font-medium">
                      {item.qty} {item.materials?.unit}
                    </td>
                    <td className="p-3.5 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-mono text-xs font-semibold">{item.expiry_date}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-right">
                      {fefo?.color === 'red' && (
                        <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                          {fefo.label} ({fefo.days <= 0 ? 'Hari ini / Lewat' : `${fefo.days} hr`})
                        </span>
                      )}
                      {fefo?.color === 'yellow' && (
                        <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-600"></span>
                          {fefo.label} ({fefo.days} hr)
                        </span>
                      )}
                      {fefo?.color === 'green' && (
                        <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
                          {fefo.label} ({fefo.days} hr)
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => navigate('/dashboard/olah-bahan')}
                        className="text-xs px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium transition-colors border border-emerald-200"
                        title="Olah atau racik bahan ini"
                      >
                        Olah Bahan
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

