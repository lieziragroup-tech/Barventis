import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, ArrowRight, Save, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';

export default function MenuPricing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  
  const [globalTargetFc, setGlobalTargetFc] = useState(30);
  const [globalRounding, setGlobalRounding] = useState('up');

  // Simulation State
  const [simulatedPrices, setSimulatedPrices] = useState({});
  const [notification, setNotification] = useState(null);

  const fetchRecipes = async () => {
    setLoading(true);
    try {
      const tenantId = await api.getActiveTenantId();
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('category')
        .order('menu_name');

      if (error) throw error;
      setRecipes(data || []);
      
      const initialSims = {};
      (data || []).forEach(r => {
        initialSims[r.id] = r.selling_price;
      });
      setSimulatedPrices(initialSims);
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecipes();
  }, []);

  const handlePriceChange = (id, newPrice) => {
    setSimulatedPrices(prev => ({
      ...prev,
      [id]: parseFloat(newPrice) || 0
    }));
  };

  const calculateSuggestedPrice = (hpp) => {
    if (!hpp || globalTargetFc <= 0) return 0;
    const raw = hpp / (globalTargetFc / 100);
    if (globalRounding === 'up') return Math.ceil(raw / 1000) * 1000;
    if (globalRounding === 'down') return Math.floor(raw / 1000) * 1000;
    return Math.round(raw);
  };

  const handleSavePrice = async (recipe) => {
    const newPrice = simulatedPrices[recipe.id];
    if (newPrice === parseFloat(recipe.selling_price)) return;
    
    try {
      const newFoodCostPct = newPrice > 0 ? (parseFloat(recipe.basic_cost) / newPrice) : 0;

      const { error } = await supabase
        .from('recipes')
        .update({ 
          selling_price: newPrice,
          food_cost_pct: newFoodCostPct
        })
        .eq('id', recipe.id);
        
      if (error) throw error;
      
      setNotification({ type: 'success', text: `Harga ${recipe.menu_name} berhasil diperbarui.` });
      
      // Update local state
      setRecipes(prev => prev.map(r => r.id === recipe.id ? {
        ...r, 
        selling_price: newPrice,
        food_cost_pct: newFoodCostPct
      } : r));
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    }
  };

  const categories = ['ALL', ...new Set(recipes.map(r => r.category || 'Uncategorized'))];

  const filteredRecipes = recipes.filter(r => {
    const matchCat = categoryFilter === 'ALL' || (r.category || 'Uncategorized') === categoryFilter;
    const matchSearch = r.menu_name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Menu Pricing Simulator</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Simulasi dan optimasi harga jual berdasarkan HPP berjalan.</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchRecipes} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {notification && (
        <div style={{ padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px' }}>
        <div className="menu-pricing-toolbar" style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div className="menu-pricing-search" style={{ position: 'relative', width: '250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
            <input type="text" className="form-control" placeholder="Cari menu..." style={{ paddingLeft: '36px' }} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control menu-pricing-category" style={{ width: '200px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="menu-pricing-fc-group" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Target FC:</span>
            <input type="number" className="form-control" style={{ width: '70px', height: '32px', padding: '4px 8px' }} value={globalTargetFc} onChange={e => setGlobalTargetFc(parseFloat(e.target.value) || 0)} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>%</span>
            
            <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 8px' }} />
            
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Pembulatan:</span>
            <select className="form-control" style={{ width: '110px', height: '32px', padding: '4px 8px', fontSize: '0.8rem' }} value={globalRounding} onChange={e => setGlobalRounding(e.target.value)}>
              <option value="up">Ke Atas</option>
              <option value="down">Ke Bawah</option>
              <option value="none">Original</option>
            </select>
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
          <table className="custom-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Menu Name</th>
                <th style={{ width: '100px' }}>Category</th>
                <th style={{ textAlign: 'right' }}>Basic Cost (HPP)</th>
                <th style={{ textAlign: 'right', width: '120px' }}>Current Price</th>
                <th style={{ textAlign: 'right', width: '120px' }}>Saran Harga</th>
                <th style={{ textAlign: 'center', width: '60px' }}></th>
                <th style={{ textAlign: 'center', width: '140px' }}>New Selling Price</th>
                <th style={{ textAlign: 'center', width: '100px' }}>Current FC %</th>
                <th style={{ textAlign: 'center', width: '100px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.map(r => {
                const hpp = parseFloat(r.basic_cost);
                const simPrice = simulatedPrices[r.id] || 0;
                const simFc = simPrice > 0 ? (hpp / simPrice) * 100 : 0;
                const isChanged = simPrice !== parseFloat(r.selling_price);
                const isDanger = simFc > 30;
                
                const suggested = calculateSuggestedPrice(hpp);

                return (
                  <tr key={r.id} style={{ background: isChanged ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                    <td style={{ fontWeight: 600 }}>{r.menu_name}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.category || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {hpp.toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>Rp {parseFloat(r.selling_price).toLocaleString('id-ID')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                      {suggested > 0 ? (
                        <button 
                          type="button" 
                          onClick={() => handlePriceChange(r.id, suggested)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                          title="Klik untuk gunakan harga ini"
                        >
                          Rp {suggested.toLocaleString('id-ID')}
                        </button>
                      ) : '-'}
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}><ArrowRight size={16} /></td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="number" step="any" className="form-control" style={{ textAlign: 'center', padding: '6px', fontWeight: isChanged ? 700 : 400, color: isChanged ? 'var(--accent)' : 'var(--text-primary)' }} value={simPrice} onChange={e => handlePriceChange(r.id, e.target.value)} />
                      {isChanged && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>Old: Rp {parseFloat(r.selling_price).toLocaleString('id-ID')}</div>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: isDanger ? 'var(--danger)' : 'var(--success)' }}>
                      {simFc.toFixed(1)}%
                      {isDanger && <AlertTriangle size={12} style={{ display: 'inline', marginLeft: '4px' }} />}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isChanged ? (
                        <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.75rem', width: '100%', justifyContent: 'center' }} onClick={() => handleSavePrice(r)}>
                          <Save size={14} style={{ marginRight: '4px' }}/> Save
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '6px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', width: '100%' }}
                            onClick={() => navigate('../recipes', { state: { targetRecipeId: r.id } })}
                            title="Edit Resep di Recipe Builder"
                          >
                            <ExternalLink size={12} /> Lihat Resep
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRecipes.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Tidak ada menu ditemukan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}