import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  BarChart3, 
  Star, 
  Search, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Filter,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import Pagination from '../../components/shared/Pagination';
import { menuEngApi } from '../../services/upgradeModulesApi';
import { useAuth } from '../../contexts/AuthContext';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';
import useDebounce from '../../hooks/useDebounce';

const CLASS_CONFIG = {
  STAR: { label: '⭐ Menu Bintang', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', desc: 'Paling Laris & Untung Gede (Pertahankan)' },
  PLOWHORSE: { label: '🐎 Menu Kerja Keras', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', desc: 'Sangat Laris, tapi Untung Tipis (Naikkan Harga)' },
  PUZZLE: { label: '🧩 Menu Teka-Teki', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', desc: 'Untung Gede, tapi Jarang Laku (Tingkatkan Promo)' },
  DOG: { label: '🐾 Menu Evaluasi', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', desc: 'Jarang Laku & Untung Dikit (Pertimbangkan Ganti)' }
};

export default function MenuEngineering() {
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  
  // Filtering states
  const [classFilter, setClassFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Sorting state
  const [sortKey, setSortKey] = useState('contribution'); // contribution | name | selling_price | cogs | margin | total_sold | food_cost_pct
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await menuEngApi.classifyMenuItems();
      setItems(data || []);
    } catch (e) { 
      setError(e.message || 'Gagal mengambil data matriks menu engineering'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    fetch(); 
  }, [fetch]);

  // Reset page to 1 when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, classFilter, categoryFilter, sortKey, sortOrder, pageSize]);

  // Unique categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set();
    items.forEach(i => {
      if (i.category && String(i.category).trim()) {
        set.add(String(i.category).trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Quadrant KPI counts
  const counts = useMemo(() => {
    const c = { STAR: 0, PLOWHORSE: 0, PUZZLE: 0, DOG: 0 };
    items.forEach(i => { 
      if (c[i.menu_class] !== undefined) c[i.menu_class]++; 
    });
    return c;
  }, [items]);

  // Filter & Sort
  const processedItems = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();

    return items
      .filter(item => {
        const matchClass = classFilter === 'ALL' || item.menu_class === classFilter;
        const matchCategory = categoryFilter === 'ALL' || (item.category && item.category === categoryFilter);
        
        const menuName = (item.name || item.menu_name || '').toLowerCase();
        const menuCat = (item.category || '').toLowerCase();
        const matchSearch = !query || menuName.includes(query) || menuCat.includes(query);

        return matchClass && matchCategory && matchSearch;
      })
      .sort((a, b) => {
        let valA, valB;

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

  // Pagination slice
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedItems.slice(start, start + pageSize);
  }, [processedItems, currentPage, pageSize]);

  // Handle column header click for sorting
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('desc'); // Default descending on new column
    }
  };

  const renderSortIndicator = (key) => {
    if (sortKey !== key) {
      return <ArrowUpDown size={12} className="opacity-40 hover:opacity-100 transition-opacity ml-1 inline" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={12} className="text-primary ml-1 inline font-bold" />
    ) : (
      <ArrowDown size={12} className="text-primary ml-1 inline font-bold" />
    );
  };

  const handleSave = async () => {
    try {
      await menuEngApi.saveClassification(items);
      setError('');
    } catch (e) { 
      setError(e.message || 'Gagal menyimpan klasifikasi menu'); 
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
      {/* Top Banner & Header */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)' }}>
              <BarChart3 size={22} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Menu Engineering Matrix</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Klasifikasi Boston Consulting Group (BCG) 4 kuadran: Stars, Plowhorses, Puzzles, Dogs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              type="button" 
              className="btn btn-secondary text-xs flex items-center gap-1.5" 
              onClick={fetch} 
              disabled={loading}
              title="Refresh Data"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Segarkan
            </button>
            <button 
              type="button"
              className="btn btn-primary text-xs flex items-center gap-1.5" 
              onClick={handleSave} 
              disabled={items.length === 0}
            >
              Simpan Klasifikasi
            </button>
          </div>
        </div>
      </div>

      {/* Quadrant KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(CLASS_CONFIG).map(([key, cfg]) => {
          const isSelected = classFilter === key;
          return (
            <button 
              key={key} 
              onClick={() => setClassFilter(isSelected ? 'ALL' : key)}
              className="glass-card p-4 text-left transition-all cursor-pointer hover:shadow-md"
              style={{ 
                borderLeft: `4px solid ${cfg.color}`, 
                background: isSelected ? cfg.bg : 'var(--bg-secondary)',
                opacity: classFilter !== 'ALL' && !isSelected ? 0.45 : 1,
                transform: isSelected ? 'scale(1.02)' : 'none'
              }}
            >
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', color: cfg.color, display: 'flex', justifyContent: 'space-between' }}>
                <span>{cfg.label}</span>
                {isSelected && <span className="text-[10px] font-bold">● Aktif</span>}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace', margin: '4px 0' }}>
                {counts[key]}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {cfg.desc}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Main Table Card with Search & Filters */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        {/* Controls Toolbar */}
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between mb-4">
          {/* Left: Search Bar with Debounce */}
          <div className="relative flex-1 max-w-md">
            <Search 
              size={15} 
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" 
            />
            <input
              type="text"
              placeholder="Cari menu atau kategori (contoh: Kopi, Mocktail)..."
              className="form-control pl-9 pr-8 text-xs py-2 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                title="Hapus pencarian"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Right: Category Filter, Kuadran Filter, & Page Size */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Kategori */}
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Filter size={13} className="text-gray-400" />
                <select
                  className="form-control text-xs py-2 pr-6"
                  style={{ width: 'auto', minWidth: '130px' }}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">Semua Kategori</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter Kuadran Dropdown */}
            <select
              className="form-control text-xs py-2 pr-6"
              style={{ width: 'auto', minWidth: '130px' }}
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="ALL">Semua Kuadran</option>
              <option value="STAR">⭐ Stars</option>
              <option value="PLOWHORSE">🐎 Plowhorses</option>
              <option value="PUZZLE">🧩 Puzzles</option>
              <option value="DOG">🐾 Dogs</option>
            </select>

            {/* Per-Page Selector */}
            <select
              className="form-control text-xs py-2 pr-6"
              style={{ width: 'auto' }}
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              title="Jumlah baris per halaman"
            >
              <option value={10}>10 / hal</option>
              <option value={20}>20 / hal</option>
              <option value={50}>50 / hal</option>
              <option value={100}>100 / hal</option>
            </select>

            {/* Reset Filter Button */}
            {isFiltered && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="btn btn-secondary text-xs py-2 px-3 flex items-center gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Reset semua filter"
              >
                <X size={12} />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table Area */}
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th 
                  style={{ textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('name')}
                >
                  Menu & Kategori {renderSortIndicator('name')}
                </th>
                <th style={{ textAlign: 'center', userSelect: 'none' }}>
                  Klasifikasi
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
                  COGS {renderSortIndicator('cogs')}
                </th>
                <th 
                  style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('margin')}
                >
                  Margin {renderSortIndicator('margin')}
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
                  Total Kontribusi (Rp) {renderSortIndicator('contribution')}
                </th>
                <th 
                  style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('food_cost_pct')}
                >
                  Food Cost % {renderSortIndicator('food_cost_pct')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <TableSkeletonRows rows={6} columns={[
                  { width: '160px', type: 'text' }, { width: '80px', type: 'badge', align: 'center' },
                  { width: '80px', type: 'text', align: 'right' }, { width: '80px', type: 'text', align: 'right' },
                  { width: '80px', type: 'text', align: 'right' }, { width: '60px', type: 'text', align: 'center' },
                  { width: '100px', type: 'text', align: 'right' }, { width: '60px', type: 'text', align: 'center' }
                ]} />
              ) : paginatedItems.map(item => {
                const cfg = CLASS_CONFIG[item.menu_class] || CLASS_CONFIG.DOG;
                const margin = item.margin || 0;
                const cogsVal = item.cogs ?? item.total_cost ?? item.basic_cost ?? 0;

                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name || item.menu_name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{item.category || 'Tanpa Kategori'}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '4px', 
                        padding: '3px 8px', borderRadius: '12px', fontSize: '0.7rem', 
                        fontWeight: 600, background: cfg.bg, color: cfg.color 
                      }}>
                        {item.menu_class === 'STAR' && <Star size={11} />}
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
                    <BarChart3 size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 500, margin: 0 }}>
                      {items.length === 0 
                        ? 'Belum ada data resep dengan harga jual' 
                        : isFiltered 
                          ? 'Tidak ada menu yang sesuai dengan filter pencarian' 
                          : 'Tidak ada menu dalam klasifikasi ini'}
                    </p>
                    {isFiltered && (
                      <button 
                        type="button" 
                        onClick={resetAllFilters} 
                        className="btn btn-secondary text-xs mt-3 inline-flex items-center gap-1.5"
                      >
                        Reset Filter
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
