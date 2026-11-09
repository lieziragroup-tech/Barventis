import { useState, useEffect, useCallback, useMemo } from 'react';
import Pagination from '../../components/shared/Pagination';
import { menuEngApi } from '../../services/upgradeModulesApi';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';
import useDebounce from '../../hooks/useDebounce';

const CLASS_CONFIG = {
  STAR: {
    label: 'Menu Andalan',
    color: '#d97706',
    bg: 'rgba(245,158,11,0.1)',
    desc: 'Penjualan tinggi dan untung per porsi besar. Pertahankan rasa dan jaga stok bahannya.'
  },
  PLOWHORSE: {
    label: 'Laris Untung Tipis',
    color: '#2563eb',
    bg: 'rgba(59,130,246,0.1)',
    desc: 'Sering dipesan pelanggan, tetapi untung per porsinya kecil. Cek takaran resep atau sesuaikan harga.'
  },
  PUZZLE: {
    label: 'Untung Besar Jarang Laku',
    color: '#7c3aed',
    bg: 'rgba(139,92,246,0.1)',
    desc: 'Untung per porsinya besar, tetapi jarang dipesan. Dorong lewat paket hemat atau rekomendasi kasir.'
  },
  DOG: {
    label: 'Perlu Ditinjau',
    color: '#4b5563',
    bg: 'rgba(107,114,128,0.1)',
    desc: 'Jarang dipesan dan untungnya kecil. Pertimbangkan ubah resep atau ganti dengan menu baru.'
  }
};

export default function MenuEngineering() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [items, setItems] = useState([]);

  // Filtering states
  const [classFilter, setClassFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 250);

  // Sorting state
  const [sortKey, setSortKey] = useState('contribution');
  const [sortOrder, setSortOrder] = useState('desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    setSavedNotice('');
    try {
      const data = await menuEngApi.classifyMenuItems();
      setItems(data || []);
    } catch (e) {
      setError(e.message || 'Gagal memuat data evaluasi menu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, classFilter, categoryFilter, sortKey, sortOrder, pageSize]);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((i) => {
      if (i.category && String(i.category).trim()) {
        set.add(String(i.category).trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const counts = useMemo(() => {
    const c = { STAR: 0, PLOWHORSE: 0, PUZZLE: 0, DOG: 0 };
    items.forEach((i) => {
      if (c[i.menu_class] !== undefined) c[i.menu_class]++;
    });
    return c;
  }, [items]);

  const allZeroSales = useMemo(() => {
    return items.length > 0 && items.every((i) => !(Number(i.total_sold) > 0));
  }, [items]);

  const processedItems = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return items
      .filter((item) => {
        const matchClass = classFilter === 'ALL' || item.menu_class === classFilter;
        const matchCategory = categoryFilter === 'ALL' || (item.category && item.category === categoryFilter);

        const menuName = (item.name || item.menu_name || '').toLowerCase();
        const menuCat = (item.category || '').toLowerCase();
        const matchSearch = !query || menuName.includes(query) || menuCat.includes(query);

        return matchClass && matchCategory && matchSearch;
      })
      .sort((a, b) => {
        let valA;
        let valB;

        switch (sortKey) {
          case 'name':
            valA = (a.name || a.menu_name || '').toLowerCase();
            valB = (b.name || b.menu_name || '').toLowerCase();
            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
          case 'selling_price':
            valA = Number(a.selling_price) || 0;
            valB = Number(b.selling_price) || 0;
            break;
          case 'cogs':
            valA = Number(a.cogs ?? a.total_cost ?? a.basic_cost) || 0;
            valB = Number(b.cogs ?? b.total_cost ?? b.basic_cost) || 0;
            break;
          case 'margin':
            valA = Number(a.margin) || 0;
            valB = Number(b.margin) || 0;
            break;
          case 'total_sold':
            valA = Number(a.total_sold) || 0;
            valB = Number(b.total_sold) || 0;
            break;
          case 'food_cost_pct':
            valA = Number(a.food_cost_pct) || 0;
            valB = Number(b.food_cost_pct) || 0;
            break;
          case 'contribution':
          default:
            valA = Number(a.contribution) || 0;
            valB = Number(b.contribution) || 0;
            break;
        }

        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [items, classFilter, categoryFilter, debouncedSearch, sortKey, sortOrder]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedItems.slice(start, start + pageSize);
  }, [processedItems, currentPage, pageSize]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <span style={{ opacity: 0.35, marginLeft: '4px', fontSize: '0.7rem' }}>↕</span>;
    }
    return (
      <span style={{ marginLeft: '4px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)' }}>
        {sortOrder === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  const handleSave = async () => {
    try {
      setError('');
      setSavedNotice('');
      await menuEngApi.saveClassification(items);
      setSavedNotice('Pengelompokan menu berhasil disimpan.');
      setTimeout(() => setSavedNotice(''), 3500);
    } catch (e) {
      setError(e.message || 'Gagal menyimpan pengelompokan menu.');
    }
  };

  const resetAllFilters = () => {
    setClassFilter('ALL');
    setCategoryFilter('ALL');
    setSearchTerm('');
    setSortKey('contribution');
    setSortOrder('desc');
  };

  const isFiltered = classFilter !== 'ALL' || categoryFilter !== 'ALL' || Boolean(searchTerm);

  return (
    <div className="fade-in space-y-5">
      {/* Top Banner & Header (Tanpa Ikon Dekoratif) */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Evaluasi Untung & Penjualan Menu
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Pengelompokan menu otomatis berdasarkan jumlah porsi terjual dan untung bersih per porsi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={fetch}
              disabled={loading}
            >
              {loading ? 'Memuat...' : 'Perbarui Data'}
            </button>
            <button
              type="button"
              className="btn btn-primary text-xs"
              onClick={handleSave}
              disabled={items.length === 0 || loading}
            >
              Simpan Pengelompokan
            </button>
          </div>
        </div>
      </div>

      {/* Ringkasan 4 Kelompok Menu (Tanpa Ikon/Emoji, Bahasa Mudah Dipahami) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(CLASS_CONFIG).map(([key, cfg]) => {
          const isSelected = classFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setClassFilter(isSelected ? 'ALL' : key)}
              className="glass-card p-4 text-left transition-all cursor-pointer hover:shadow-md"
              style={{
                borderLeft: `4px solid ${cfg.color}`,
                background: isSelected ? cfg.bg : 'var(--bg-secondary)',
                opacity: classFilter !== 'ALL' && !isSelected ? 0.5 : 1
              }}
            >
              <div style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: cfg.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{cfg.label}</span>
                {isSelected && <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>Filter Aktif</span>}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'monospace', margin: '6px 0 4px', color: 'var(--text-primary)' }}>
                {counts[key]} <span style={{ fontSize: '0.78rem', fontWeight: 500, fontFamily: 'var(--font-sans)', color: 'var(--text-muted)' }}>menu</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {cfg.desc}
              </div>
            </button>
          );
        })}
      </div>

      {allZeroSales && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
          Data penjualan kasir (porsi terjual) saat ini masih 0 untuk seluruh menu, sehingga pengelompokan di atas baru membandingkan besaran untung per porsi. Setelah data penjualan harian masuk, kelompok menu akan otomatis menyesuaikan.
        </div>
      )}

      {savedNotice && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', color: '#059669', fontSize: '0.82rem', fontWeight: 600 }}>
          {savedNotice}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Tabel Daftar Menu & Filter */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between mb-4">
          {/* Pencarian Menu */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Cari nama menu atau kategori (contoh: Kopi, Mocktail)..."
              className="form-control pr-8 text-xs py-2 w-full"
              style={{ paddingLeft: '12px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 px-1 text-xs font-bold"
                title="Hapus pencarian"
              >
                ×
              </button>
            )}
          </div>

          {/* Filter Kategori, Kelompok Menu, & Jumlah Baris */}
          <div className="flex flex-wrap items-center gap-2">
            {categories.length > 0 && (
              <select
                className="form-control text-xs py-2 pr-6"
                style={{ width: 'auto', minWidth: '140px' }}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            <select
              className="form-control text-xs py-2 pr-6"
              style={{ width: 'auto', minWidth: '165px' }}
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="ALL">Semua Kelompok Menu</option>
              <option value="STAR">Menu Andalan</option>
              <option value="PLOWHORSE">Laris Untung Tipis</option>
              <option value="PUZZLE">Untung Besar Jarang Laku</option>
              <option value="DOG">Perlu Ditinjau</option>
            </select>

            <select
              className="form-control text-xs py-2 pr-6"
              style={{ width: 'auto' }}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              title="Jumlah baris per halaman"
            >
              <option value={10}>10 baris</option>
              <option value={20}>20 baris</option>
              <option value={50}>50 baris</option>
              <option value={100}>100 baris</option>
            </select>

            {isFiltered && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="btn btn-secondary text-xs py-2 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Reset semua filter"
              >
                Atur Ulang Filter
              </button>
            )}
          </div>
        </div>

        {/* Tabel Utama */}
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th
                  style={{ textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('name')}
                >
                  Nama Menu {renderSortIndicator('name')}
                </th>
                <th style={{ textAlign: 'center', userSelect: 'none' }}>
                  Kelompok Menu
                </th>
                <th
                  style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('selling_price')}
                >
                  Harga Jual {renderSortIndicator('selling_price')}
                </th>
                <th
                  style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('cogs')}
                >
                  Modal Bahan (HPP) {renderSortIndicator('cogs')}
                </th>
                <th
                  style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('margin')}
                >
                  Untung / Porsi {renderSortIndicator('margin')}
                </th>
                <th
                  style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('total_sold')}
                >
                  Terjual {renderSortIndicator('total_sold')}
                </th>
                <th
                  style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('contribution')}
                >
                  Total Untung (Rp) {renderSortIndicator('contribution')}
                </th>
                <th
                  style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('food_cost_pct')}
                >
                  Rasio HPP {renderSortIndicator('food_cost_pct')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <TableSkeletonRows rows={6} columns={[
                  { width: '160px', type: 'text' }, { width: '110px', type: 'badge', align: 'center' },
                  { width: '80px', type: 'text', align: 'right' }, { width: '80px', type: 'text', align: 'right' },
                  { width: '80px', type: 'text', align: 'right' }, { width: '60px', type: 'text', align: 'center' },
                  { width: '100px', type: 'text', align: 'right' }, { width: '60px', type: 'text', align: 'center' }
                ]} />
              ) : paginatedItems.map((item) => {
                const cfg = CLASS_CONFIG[item.menu_class] || CLASS_CONFIG.DOG;
                const margin = item.margin || 0;
                const cogsVal = item.cogs ?? item.total_cost ?? item.basic_cost ?? 0;

                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name || item.menu_name}</div>
                      <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{item.category || 'Tanpa Kategori'}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: cfg.bg,
                        color: cfg.color
                      }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      Rp {(item.selling_price || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                      Rp {cogsVal.toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: margin > 0 ? '#10b981' : '#ef4444' }}>
                      Rp {margin.toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 600 }}>
                      {item.total_sold || 0}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>
                      Rp {(item.contribution || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: (item.food_cost_pct || 0) > 27 ? '#ef4444' : '#10b981' }}>
                      {item.food_cost_pct || 0}%
                    </td>
                  </tr>
                );
              })}
              {!loading && processedItems.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                    <p style={{ fontWeight: 500, margin: 0 }}>
                      {items.length === 0
                        ? 'Belum ada data resep yang memiliki harga jual.'
                        : isFiltered
                          ? 'Tidak ada menu yang cocok dengan filter pencarian.'
                          : 'Tidak ada menu dalam kelompok ini.'}
                    </p>
                    {isFiltered && (
                      <button
                        type="button"
                        onClick={resetAllFilters}
                        className="btn btn-secondary text-xs mt-3"
                      >
                        Atur Ulang Filter
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {processedItems.length > 0 && (
          <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 flex justify-end">
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              totalCount={processedItems.length}
              onPageChange={setCurrentPage}
              itemLabel="menu"
              loading={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
