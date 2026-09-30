import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Star, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { menuEngApi } from '../../services/upgradeModulesApi';
import { useAuth } from '../../contexts/AuthContext';
import { TableSkeletonRows } from '../../components/shared/TableSkeleton';

const CLASS_CONFIG = {
  STAR: { label: 'Star', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', desc: 'Populer & Margin Tinggi' },
  PLOWHORSE: { label: 'Plowhorse', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', desc: 'Populer, Margin Rendah' },
  PUZZLE: { label: 'Puzzle', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', desc: 'Kurang Populer, Margin Tinggi' },
  DOG: { label: 'Dog', color: '#6b7280', bg: 'rgba(107,114,128,0.1)', desc: 'Kurang Populer & Margin Rendah' }
};

export default function MenuEngineering() {
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [classFilter, setClassFilter] = useState('ALL');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await menuEngApi.classifyMenuItems();
      setItems(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = useMemo(() =>
    classFilter === 'ALL' ? items : items.filter(i => i.menu_class === classFilter),
    [items, classFilter]
  );

  const counts = useMemo(() => {
    const c = { STAR: 0, PLOWHORSE: 0, PUZZLE: 0, DOG: 0 };
    items.forEach(i => { if (c[i.menu_class] !== undefined) c[i.menu_class]++; });
    return c;
  }, [items]);

  const handleSave = async () => {
    try {
      await menuEngApi.saveClassification(items);
      setError('');
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="fade-in space-y-5">
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)' }}>
              <BarChart3 size={22} style={{ color: '#f59e0b' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Menu Engineering Matrix</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Klasifikasi 4 kuadran: Stars, Plowhorses, Puzzles, Dogs
              </p>
            </div>
          </div>
          <button className="btn btn-primary text-xs flex items-center gap-1.5" onClick={handleSave} disabled={items.length === 0}>
            Simpan Klasifikasi
          </button>
        </div>
      </div>

      {/* Quadrant KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(CLASS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setClassFilter(classFilter === key ? 'ALL' : key)}
            className="glass-card p-4 text-left transition-all"
            style={{ borderLeft: `3px solid ${cfg.color}`, opacity: classFilter !== 'ALL' && classFilter !== key ? 0.5 : 1 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: cfg.color }}>{cfg.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'monospace' }}>{counts[key]}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{cfg.desc}</div>
          </button>
        ))}
      </div>

      {error && <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>{error}</div>}

      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <table className="custom-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Menu</th>
                <th style={{ textAlign: 'center' }}>Klasifikasi</th>
                <th style={{ textAlign: 'right' }}>Harga Jual</th>
                <th style={{ textAlign: 'right' }}>COGS</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th style={{ textAlign: 'center' }}>Terjual</th>
                <th style={{ textAlign: 'right' }}>Kontribusi (Rp)</th>
                <th style={{ textAlign: 'center' }}>Food Cost %</th>
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
              ) : filtered.map(item => {
                const cfg = CLASS_CONFIG[item.menu_class] || CLASS_CONFIG.DOG;
                const margin = item.margin || 0;
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.name || item.menu_name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{item.category}</div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600, background: cfg.bg, color: cfg.color }}>
                        {item.menu_class === 'STAR' && <Star size={11} />}
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>Rp {(item.selling_price || 0).toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>Rp {(item.cogs || item.total_cost || 0).toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: margin > 0 ? '#10b981' : '#ef4444' }}>
                      Rp {margin.toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{item.total_sold || 0}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                      Rp {(item.contribution || 0).toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: (item.food_cost_pct || 0) > 27 ? '#ef4444' : '#10b981' }}>
                      {item.food_cost_pct || 0}%
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                  <BarChart3 size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ fontWeight: 500, margin: 0 }}>
                    {items.length === 0 ? 'Belum ada data resep dengan harga jual' : 'Tidak ada menu dalam klasifikasi ini'}
                  </p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
