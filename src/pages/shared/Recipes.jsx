import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Trash2, Save, X, UploadCloud, Coins, AlertTriangle, CheckCircle, ChefHat, RefreshCw } from 'lucide-react';
import BulkImport from '../../components/BulkImport';
import Pagination from '../../components/shared/Pagination';
import { useData } from '../../contexts/DataContext';
import { api } from '../../services/api';
import { maintenanceService } from '../../services/maintenanceService';
import { formatIDR, calculateIngredientCost, parsePackSize, isPackUnitConsistent, computeRecipeCosts, roundSellingPrice, DEFAULT_FIX_COST_PCT, DEFAULT_ROUNDING_DIRECTION, DEFAULT_ROUNDING_INCREMENT, DEFAULT_PRICE_ADJUSTMENT } from '../../services/costUtils';

// Stable client-side id for editable ingredient rows so React keys don't rely on the
// array index (preserves input focus/state across add/remove/reorder). (LOW #19)
const rowUid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `r${Date.now()}${Math.random()}`);
const ensureUids = (arr = []) => arr.map(x => ({ ...x, _uid: x._uid ?? rowUid() }));

export default function Recipes() {
  const { stock, recipes, handleSaveRecipe: onSaveRecipe, handleAddRecipe: onAddRecipe, handleDeleteRecipe: onDeleteRecipe, refreshData, showToast } = useData();
  const [recalculating, setRecalculating] = useState(false);
  const [activeRecipe, setActiveRecipe] = useState(recipes[0] || null);
  const [search, setSearch] = useState('');
  const [editedIngredients, setEditedIngredients] = useState(activeRecipe ? ensureUids(activeRecipe.ingredients) : []);
  const [editedSellingPrice, setEditedSellingPrice] = useState(activeRecipe ? Math.round(activeRecipe.selling_price) : 0);
  const [editedCategory, setEditedCategory] = useState(activeRecipe?.category || 'NON-KOPI');
  const [editedImageUrl, setEditedImageUrl] = useState(activeRecipe?.image_url || '');
  // Per Panduan_Kartu_Resep_HPP.md (2026-08): Fix Cost % is now per-recipe editable
  // (5% default), and Food Cost % is the TARGET margin driving a computed + rounded
  // selling-price suggestion — separate from editedSellingPrice, which is still the
  // actual price charged (pre-filled from the suggestion, but always hand-editable).
  const [editedFixCostPct, setEditedFixCostPct] = useState(activeRecipe?.fix_cost_pct ?? DEFAULT_FIX_COST_PCT);
  const [editedFoodCostPctTarget, setEditedFoodCostPctTarget] = useState(activeRecipe?.food_cost_pct ?? 0);
  const [editedRoundingDirection, setEditedRoundingDirection] = useState(activeRecipe?.rounding_direction || DEFAULT_ROUNDING_DIRECTION);
  const [editedRoundingIncrement, setEditedRoundingIncrement] = useState(activeRecipe?.rounding_increment ?? DEFAULT_ROUNDING_INCREMENT);
  // Manual Rp nudge applied AFTER rounding, per follow-up refinement to
  // Panduan_Kartu_Resep_HPP.md — rounding alone now targets the nearest whole
  // rupiah (not a 500/1000/2000 bucket); this is for fine-tuning beyond that.
  const [editedPriceAdjustment, setEditedPriceAdjustment] = useState(activeRecipe?.price_adjustment ?? DEFAULT_PRICE_ADJUSTMENT);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('KOPI');
  const [newMenuPrice, setNewMenuPrice] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);



  // Parse full_pack field to extract numeric value and unit.
  // BUG-FIX 2026-07: this used to be a SECOND, separately-maintained regex parser
  // (diverged from costUtils.parsePackSize on cases like "2 kg" — this one used to
  // keep the unit as literal 'kg' instead of normalizing to gr, which could make the
  // unit dropdown below offer the wrong usage unit). Now delegates the numeric parse
  // to the shared parsePackSize(), and takes the *content* unit from the material's
  // own `unit` column (gr/ml/pcs) — a much more reliable signal than trying to guess
  // it back out of the free-text Full Pack string.
  const parseFullPack = (fullPack, materialUnit) => {
    const size = parsePackSize(fullPack);
    const consistent = isPackUnitConsistent(materialUnit, fullPack);
    let unit = (materialUnit || 'pcs').toLowerCase().trim();
    if (unit === 'grm' || unit === 'gram' || unit === 'grams') unit = 'gr';
    if (unit === 'l' || unit === 'liter' || unit === 'ltr') unit = 'ml';
    return { size: size > 0 && consistent ? size : 0, unit, consistent };
  };

  // Build a mapping of inventory items with their pack size info for smart unit selection
  const stockMap = useMemo(() => {
    const map = {};
    stock.forEach(item => {
      const packInfo = parseFullPack(item.full_pack, item.unit);
      // Determine available usage units for this item
      let usageUnits;
      const packUnit = item.unit?.toLowerCase() || 'pck';

      if (['gr', 'ml'].includes(packInfo.unit)) {
        // Item's pack converts to gr or ml — you can use it in gr/ml or per pack
        usageUnits = [packInfo.unit, packUnit];
      } else if (packInfo.unit === 'pcs') {
        // Item is counted in pcs per pack — use pcs or per pack
        usageUnits = ['pcs', packUnit];
      } else {
        usageUnits = [packInfo.unit, packUnit];
      }
      // Remove duplicates
      usageUnits = [...new Set(usageUnits)];

      map[item.name] = {
        ...item,
        packSize: packInfo.size,
        packContentUnit: packInfo.unit,
        packDataInconsistent: !packInfo.consistent,
        usageUnits,
        // Price per smallest unit (e.g., per gram, per ml, per pcs)
        pricePerUnit: packInfo.size > 0 ? (item.new_price || item.price) / packInfo.size : 0
      };
    });
    return map;
  }, [stock]);

  // Select recipe
  const handleSelectRecipe = (r) => {
    setActiveRecipe(r);
    setEditedIngredients(ensureUids(r.ingredients || []));
    setEditedSellingPrice(Math.round(r.selling_price));
    setEditedCategory(r.category || 'NON-KOPI');
    setEditedImageUrl(r.image_url || '');
    setEditedFixCostPct(r.fix_cost_pct ?? DEFAULT_FIX_COST_PCT);
    setEditedFoodCostPctTarget(r.food_cost_pct ?? 0);
    setEditedRoundingDirection(r.rounding_direction || DEFAULT_ROUNDING_DIRECTION);
    setEditedRoundingIncrement(r.rounding_increment ?? DEFAULT_ROUNDING_INCREMENT);
    setEditedPriceAdjustment(r.price_adjustment ?? DEFAULT_PRICE_ADJUSTMENT);
    setOpenDropdown(null);
  };

  // M-1: recipes arrive asynchronously. If none is selected yet (or the selected one
  // disappeared after a refetch), auto-select the first so the editor isn't stuck blank.
  // Selecting on data-arrival is intentional, so the related hooks rules are scoped off.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (recipes.length === 0) return;
    const stillExists = activeRecipe && recipes.some(r => r.menu_name === activeRecipe.menu_name);
    if (!stillExists) {
      handleSelectRecipe(recipes[0]);
    }
  }, [recipes]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  // Filter recipe list
  const filteredRecipes = useMemo(() => recipes.filter(r => r.menu_name.toLowerCase().includes(search.toLowerCase())), [recipes, search]);

  const RECIPES_PAGE_SIZE = 15;
  const [recipesPage, setRecipesPage] = useState(1);
  const paginatedRecipes = useMemo(() => {
    const start = (recipesPage - 1) * RECIPES_PAGE_SIZE;
    return filteredRecipes.slice(start, start + RECIPES_PAGE_SIZE);
  }, [filteredRecipes, recipesPage]);

  const toggleSelectAll = (e) => {
    if (e.target.checked) setSelectedItems(filteredRecipes.map(r => r.id));
    else setSelectedItems([]);
  };

  const toggleSelectItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Hapus ${selectedItems.length} resep terpilih secara permanen?`)) return;
    for (const id of selectedItems) {
      if (id) await onDeleteRecipe(id);
    }
    setSelectedItems([]);
    if (activeRecipe && selectedItems.includes(activeRecipe.id)) {
      setActiveRecipe(null);
    }
  };

  // Calculate amount for a single ingredient row
  // amount = qty_in_use * pricePerUnit (if using the pack's content unit like gr/ml)
  // amount = qty_in_use * full_pack_price (if using per-pack unit like pck/btl)
  const calcRowAmount = (ing) => {
    const info = stockMap[ing.item_name];
    if (!info) {
      if (ing.amount && ing.amount > 0) return ing.amount;
      return 0;
    }
    return calculateIngredientCost(info, ing.qty_in_use, ing.unit);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subtotal = useMemo(() => editedIngredients.reduce((acc, ing) => acc + calcRowAmount(ing), 0), [editedIngredients, stockMap]);
  // Per Panduan_Kartu_Resep_HPP.md (2026-08, refined per follow-up): Fix Cost %
  // is per-recipe editable, Food Cost % is a TARGET margin driving a computed
  // "Harga Jual Ideal" suggestion, rounding defaults to the nearest whole
  // rupiah (not a 500/1000/2000 bucket), and editedPriceAdjustment is an
  // optional manual Rp nudge applied after rounding — actualFoodCostPct below
  // reflects whatever Harga Jual is currently set (manual or
  // applied-from-suggestion-plus-adjustment), not the pre-adjustment target.
  const { fixCost, basicCost, sellingPriceRaw, sellingPriceRounded, sellingPriceFinal } = useMemo(() => computeRecipeCosts({
    subtotal, fixCostPct: editedFixCostPct, foodCostPct: editedFoodCostPctTarget,
    roundingDirection: editedRoundingDirection, roundingIncrement: editedRoundingIncrement,
    priceAdjustment: editedPriceAdjustment
  }), [subtotal, editedFixCostPct, editedFoodCostPctTarget, editedRoundingDirection, editedRoundingIncrement, editedPriceAdjustment]);
  const actualFoodCostPct = useMemo(() => editedSellingPrice > 0 ? (basicCost / editedSellingPrice) : 0, [basicCost, editedSellingPrice]);
  // Keep the old name available anywhere below that still reads `foodCostPct` — it
  // now means "actual ratio at the current Harga Jual", matching what the top badge
  // has always shown (a real-time cost-vs-price health check), not the target input.
  const foodCostPct = actualFoodCostPct;

  // Ingredient actions
  const handleQtyChange = (idx, val) => {
    const updated = [...editedIngredients];
    updated[idx] = { ...updated[idx], qty_in_use: parseFloat(val) || 0 };
    setEditedIngredients(updated);
  };

  const handleUnitChange = (idx, newUnit) => {
    const updated = [...editedIngredients];
    const info = stockMap[updated[idx].item_name];
    updated[idx] = {
      ...updated[idx],
      unit: newUnit,
      // Update unit_price reference based on unit choice
      unit_price: info ? (info.new_price || info.price) : updated[idx].unit_price
    };
    setEditedIngredients(updated);
  };

  const handleAddIngredient = () => {
    setEditedIngredients([...editedIngredients, { item_name: '', qty_in_use: 0, unit: 'gr', unit_price: 0, amount: 0, _uid: rowUid() }]);
  };

  const handleRemoveIngredient = (idx) => {
    setEditedIngredients(editedIngredients.filter((_, i) => i !== idx));
  };

  const handleSelectItem = (idx, item) => {
    const info = stockMap[item.name];
    const defaultUnit = info ? info.packContentUnit : 'gr';
    const updated = [...editedIngredients];
    updated[idx] = {
      ...updated[idx],
      item_name: item.name,
      unit: defaultUnit,
      unit_price: item.new_price || item.price
    };
    setEditedIngredients(updated);
    setOpenDropdown(null);
  };

  // Save recipe — persist all calculations to database
  // BUG-RCP-01: Ingredients from DB already carry material_id. Pass it through so
  // App.jsx handleSaveRecipe can use it directly without a slow name-based lookup
  // that fails when stock names have changed since the recipe was created.
  const handleSaveRecipe = () => {
    if (!activeRecipe) return;
    if (!window.confirm(`Konfirmasi simpan perubahan resep "${activeRecipe.menu_name}"?`)) return;
    const savedIngredients = editedIngredients
      .filter(ing => ing.item_name !== '')
      .map(ing => {
        // Prefer already-known material_id; fall back to lookup by name for new rows
        const mat = ing.material_id ? null : stock.find(s => s.name === ing.item_name);
        return {
          ...ing,
          material_id: ing.material_id ?? mat?.id ?? null,
          amount: calcRowAmount(ing)
        };
      })
      .filter(ing => ing.material_id !== null);

    const updatedRecipe = {
      ...activeRecipe,
      category: editedCategory,
      selling_price: editedSellingPrice,
      image_url: editedImageUrl,
      subtotal, fix_cost: fixCost, basic_cost: basicCost, food_cost_pct: editedFoodCostPctTarget,
      fix_cost_pct: editedFixCostPct,
      selling_price_raw: sellingPriceRaw,
      rounding_direction: editedRoundingDirection,
      rounding_increment: editedRoundingIncrement,
      price_adjustment: editedPriceAdjustment,
      total_cost: basicCost,
      ingredients: savedIngredients
    };
    onSaveRecipe(updatedRecipe);
  };

  // GAP-FIX 2026-07: recipes' stored basic_cost/food_cost_pct only refresh when a
  // human opens+saves each one individually. After fixing master-data pack sizes
  // (e.g. Ice Cube), every recipe's stored number stays stale until re-saved. This
  // lets the user refresh all of them in one action instead of opening all 56.
  // Reuses maintenanceService.recalcAllRecipeCosts() (also surfaced on the
  // Maintenance/System Health page) rather than a separate implementation here.
  const handleRecalculateAll = async () => {
    if (!window.confirm('Hitung ulang HPP untuk SEMUA resep berdasarkan harga bahan terbaru? Target Food Cost % dan Harga Jual tiap resep tidak akan berubah — cuma biaya bahannya yang di-refresh.')) return;
    setRecalculating(true);
    try {
      const result = await maintenanceService.recalcAllRecipeCosts();
      showToast?.(`Selesai: HPP ${result.updated} resep diperbarui${result.failed ? `, ${result.failed} gagal` : ''}.`, 'success');
      if (refreshData) await refreshData();
    } catch (err) {
      showToast?.(err.message || 'Gagal menghitung ulang resep', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  // Add new recipe
  const handleAddNewRecipe = (e) => {
    e.preventDefault();
    if (!newMenuName.trim()) return;
    const newRecipe = {
      menu_name: newMenuName.trim(),
      category: newMenuCategory,
      image_url: newImageUrl,
      total_cost: 0, yield: '1',
      ingredients: [],
      subtotal: 0, fix_cost: 0, basic_cost: 0,
      fix_cost_pct: DEFAULT_FIX_COST_PCT,
      food_cost_pct: 0,
      selling_price_raw: 0,
      rounding_direction: DEFAULT_ROUNDING_DIRECTION,
      rounding_increment: DEFAULT_ROUNDING_INCREMENT,
      price_adjustment: DEFAULT_PRICE_ADJUSTMENT,
      selling_price: parseFloat(newMenuPrice) || 0
    };
    if (onAddRecipe) onAddRecipe(newRecipe);
    setShowAddModal(false);
    setNewMenuName('');
    setNewMenuPrice('');
    setNewImageUrl('');
    setActiveRecipe(newRecipe);
    setEditedIngredients([]);
    setEditedSellingPrice(parseInt(newMenuPrice) || 0);
    setEditedCategory(newMenuCategory);
    setEditedImageUrl(newImageUrl);
    setEditedFixCostPct(DEFAULT_FIX_COST_PCT);
    setEditedFoodCostPctTarget(0);
    setEditedRoundingDirection(DEFAULT_ROUNDING_DIRECTION);
    setEditedRoundingIncrement(DEFAULT_ROUNDING_INCREMENT);
    setEditedPriceAdjustment(DEFAULT_PRICE_ADJUSTMENT);
  };

  // Cost badge color. food_cost_pct is ALWAYS stored as a fraction (basic_cost /
  // selling_price), so convert to percent unconditionally. The previous `< 1` guess
  // mis-handled food costs >= 100% (e.g. 1.2 shown/treated as ~1%). (M-5)
  const getCostBadge = (pct) => {
    const p = (Number(pct) || 0) * 100;
    if (p < 27) return 'badge-success';
    if (p <= 30) return 'badge-warning';
    return 'badge-danger';
  };

  // Get available units for a given ingredient
  const getUnitsForItem = (itemName) => {
    const info = stockMap[itemName];
    if (!info) return ['gr', 'ml', 'pcs', 'pck'];
    return info.usageUnits;
  };

  // Get pack info label for display
  const getPackLabel = (itemName) => {
    const info = stockMap[itemName];
    if (!info) return '';
    return `${info.full_pack || ''} / ${(info.unit || 'pck').toUpperCase()}`;
  };

  return (
    <div className="recipes-layout" style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 180px)', fontFamily: 'var(--font-sans)', animation: 'fadeIn 0.3s ease' }}>
      {/* Left: Recipe List */}
      <div className="glass-card recipes-list-panel" style={{ width: '310px', display: 'flex', flexDirection: 'column', padding: '20px', flexShrink: 0, border: '1px solid var(--border)' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Cari resep menu..." 
            className="form-control premium-input" 
            style={{ paddingLeft: '38px', height: '40px' }} 
            value={search} 
            onChange={e => { setSearch(e.target.value); setRecipesPage(1); }} 
          />
        </div>

        {selectedItems.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '10px', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>{selectedItems.length} Resep Terpilih</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn premium-btn premium-btn-danger" style={{ flex: 1, padding: '6px 0', fontSize: '0.8rem', background: 'var(--danger-glow)', color: 'var(--danger-text)' }} onClick={handleBulkDelete}>
                <Trash2 size={14} style={{ marginRight: '4px' }}/> Hapus
              </button>
              <button className="btn premium-btn premium-btn-secondary" style={{ flex: 1, padding: '6px 0', fontSize: '0.8rem' }} onClick={() => setSelectedItems([])}>Batal</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button 
              className="btn premium-btn premium-btn-primary" 
              style={{ flex: 1, fontSize: '0.825rem', height: '38px', borderRadius: 'var(--radius-md)' }} 
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={15} /> Tambah Menu
            </button>
            <button 
              className="btn premium-btn premium-btn-secondary" 
              style={{ width: '38px', height: '38px', padding: 0, borderRadius: 'var(--radius-md)' }} 
              onClick={() => setShowBulkImport(true)} 
              title="Bulk Import Resep"
            >
              <UploadCloud size={15} />
            </button>
            <button 
              className="btn premium-btn premium-btn-secondary" 
              style={{ width: '38px', height: '38px', padding: 0, borderRadius: 'var(--radius-md)' }} 
              onClick={handleRecalculateAll}
              disabled={recalculating}
              title="Hitung ulang HPP & Food Cost% semua resep berdasarkan harga bahan terbaru (perlu dijalankan setelah memperbaiki data bahan)"
            >
              <RefreshCw size={15} className={recalculating ? 'spin' : ''} />
            </button>
          </div>
        )}

        {/* Recipe List */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', paddingLeft: '8px' }}>
          <input type="checkbox" checked={filteredRecipes.length > 0 && selectedItems.length === filteredRecipes.length} onChange={toggleSelectAll} style={{ cursor: 'pointer', marginRight: '8px' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pilih Semua</span>
        </div>
        <div className="glass-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
          {paginatedRecipes.map(r => {
            const isActive = activeRecipe && activeRecipe.menu_name === r.menu_name;
            const pct = r.food_cost_pct || 0;
            const pctDisplay = ((Number(pct) || 0) * 100).toFixed(0); // M-5: pct is always a fraction
            return (
              <div
                key={r.id ?? r.menu_name}
                className={`recipe-nav-item ${isActive ? 'active' : ''}`}
                style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', background: selectedItems.includes(r.id) ? 'rgba(59,130,246,0.05)' : '' }}
                onClick={() => handleSelectRecipe(r)}
              >
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: 1 }}>
                  <input type="checkbox" checked={selectedItems.includes(r.id)} onChange={(e) => { e.stopPropagation(); toggleSelectItem(r.id); }} style={{ cursor: 'pointer', marginRight: '8px' }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.menu_name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      HPP: {formatIDR(r.basic_cost || 0)}
                    </div>
                  </div>
                </div>
                <span 
                  className={`badge ${getCostBadge(pct)}`} 
                  style={{ 
                    fontSize: '0.65rem', 
                    padding: '3px 8px', 
                    flexShrink: 0,
                    background: pct < 0.27 ? 'rgba(81,207,102,0.08)' : pct <= 0.3 ? 'rgba(252,196,25,0.08)' : 'rgba(255,107,107,0.08)',
                    border: pct < 0.27 ? '1px solid rgba(81,207,102,0.2)' : pct <= 0.3 ? '1px solid rgba(252,196,25,0.2)' : '1px solid rgba(255,107,107,0.2)',
                    color: pct < 0.27 ? 'var(--success)' : pct <= 0.3 ? 'var(--warning)' : 'var(--danger)'
                  }}
                >
                  {pctDisplay}%
                </span>
              </div>
            );
          })}
          {filteredRecipes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '0.825rem', fontStyle: 'italic' }}>
              Tidak ada resep ditemukan
            </div>
          )}
        </div>
        <Pagination
          page={recipesPage}
          pageSize={RECIPES_PAGE_SIZE}
          totalCount={filteredRecipes.length}
          onPageChange={setRecipesPage}
          itemLabel="resep"
        />
      </div>

      {/* Right: Recipe Editor */}
      {activeRecipe ? (
        <div className="glass-card animate-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '18px', marginBottom: '18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <span className="badge" style={{ marginBottom: '6px', background: 'var(--accent-glow)', color: 'var(--accent)', border: '1px solid rgba(79,110,247,0.15)', fontSize: '0.65rem', padding: '3px 8px' }}>
                Resep & Harga Pokok
              </span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{activeRecipe.menu_name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>Kelola komposisi bahan baku dari inventory per porsi</p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', flexShrink: 0 }}>
              {/* Cost Card 1 */}
              <div style={{ 
                background: 'linear-gradient(135deg, rgba(76, 110, 245, 0.06) 0%, rgba(76, 110, 245, 0.01) 100%)', 
                border: '1px solid rgba(76, 110, 245, 0.2)', 
                padding: '10px 16px', 
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '150px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', background: 'var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <Coins size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>HPP (Basic Cost)</div>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginTop: '1px' }}>{formatIDR(basicCost)}</div>
                </div>
              </div>

              {/* Cost Card 2 */}
              <div style={{ 
                background: foodCostPct < 0.27 
                  ? 'linear-gradient(135deg, rgba(81, 207, 102, 0.06) 0%, rgba(81, 207, 102, 0.01) 100%)' 
                  : foodCostPct <= 0.3 
                    ? 'linear-gradient(135deg, rgba(252, 196, 25, 0.06) 0%, rgba(252, 196, 25, 0.01) 100%)' 
                    : 'linear-gradient(135deg, rgba(255, 107, 107, 0.06) 0%, rgba(255, 107, 107, 0.01) 100%)', 
                border: foodCostPct < 0.27 
                  ? '1px solid rgba(81, 207, 102, 0.2)' 
                  : foodCostPct <= 0.3 
                    ? '1px solid rgba(252, 196, 25, 0.2)' 
                    : '1px solid rgba(255, 107, 107, 0.2)', 
                padding: '10px 16px', 
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: '150px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}>
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: 'var(--radius-md)', 
                  background: foodCostPct < 0.27 
                    ? 'rgba(81, 207, 102, 0.1)' 
                    : foodCostPct <= 0.3 
                      ? 'rgba(252, 196, 25, 0.1)' 
                      : 'rgba(255, 107, 107, 0.1)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  color: foodCostPct < 0.27 
                    ? 'var(--success)' 
                    : foodCostPct <= 0.3 
                      ? 'var(--warning)' 
                      : 'var(--danger)' 
                }}>
                  {foodCostPct < 0.27 ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                </div>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>Food Cost %</div>
                  <div style={{ 
                    fontWeight: 800, fontSize: '1.05rem', 
                    color: foodCostPct < 0.27 
                      ? 'var(--success)' 
                      : foodCostPct <= 0.3 
                        ? 'var(--warning)' 
                        : 'var(--danger)',
                    marginTop: '1px' 
                  }}>
                    {(foodCostPct * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Selling Price + Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Kategori Menu</label>
              <select
                className="form-control premium-input"
                value={editedCategory}
                onChange={e => setEditedCategory(e.target.value)}
                style={{ height: '40px' }}
              >
                <option value="KOPI">Kopi</option>
                <option value="NON-KOPI">Non-Kopi</option>
                <option value="MOCKTAIL">Mocktail</option>
                <option value="JUICE">Juice</option>
                <option value="TEA">Tea</option>
                <option value="BEER">Beer & Alcohol</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Harga Jual (IDR)</label>
              <input 
                type="number" 
                className="form-control premium-input" 
                style={{ height: '40px', fontWeight: 700 }}
                value={editedSellingPrice} 
                onChange={e => setEditedSellingPrice(parseInt(e.target.value) || 0)} 
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>URL Gambar Menu</label>
              <input 
                type="text" 
                className="form-control premium-input" 
                style={{ height: '40px' }}
                placeholder="https://example.com/image.jpg" 
                value={editedImageUrl} 
                onChange={e => setEditedImageUrl(e.target.value)} 
              />
            </div>
          </div>

          {/* Pricing formula controls — per Panduan_Kartu_Resep_HPP.md (2026-08,
              refined per follow-up): Fix Cost % (per-recipe, was hardcoded 5%) and
              Food Cost % (a TARGET margin, not derived) drive a computed "Harga
              Jual Ideal" suggestion, rounded to the nearest whole rupiah (no
              500/1000/2000 bucket forced — Arah Pembulatan still matters for
              which way a fractional rupiah rounds). Penyesuaian Manual is an
              optional extra nudge on top of that, for hitting a specific price
              point; it feeds into the actual Food Cost % once applied. Harga
              Jual above stays the actual, always hand-editable price — the
              suggestion here is a one-click apply, never auto-overwritten. */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px',
            marginBottom: '16px', padding: '14px 16px', borderRadius: 'var(--radius-lg)',
            background: 'rgba(30, 41, 59, 0.25)', border: '1px solid var(--border)'
          }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'normal', display: 'block' }}>Fix Cost %</label>
              <input
                type="number" step="0.5" min="0" max="100"
                className="form-control premium-input"
                style={{ height: '36px', width: '100%', boxSizing: 'border-box' }}
                value={Math.round(editedFixCostPct * 1000) / 10}
                onChange={e => setEditedFixCostPct((parseFloat(e.target.value) || 0) / 100)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'normal', display: 'block' }}>Food Cost % (Target)</label>
              <input
                type="number" step="1" min="0" max="100"
                className="form-control premium-input"
                style={{ height: '36px', width: '100%', boxSizing: 'border-box' }}
                placeholder="wajib diisi"
                value={editedFoodCostPctTarget > 0 ? Math.round(editedFoodCostPctTarget * 1000) / 10 : ''}
                onChange={e => setEditedFoodCostPctTarget((parseFloat(e.target.value) || 0) / 100)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'normal', display: 'block' }}>Arah Pembulatan</label>
              <select
                className="form-control premium-input"
                style={{ height: '36px', width: '100%', boxSizing: 'border-box' }}
                value={editedRoundingDirection}
                onChange={e => setEditedRoundingDirection(e.target.value)}
              >
                <option value="down">Ke bawah (rupiah bulat)</option>
                <option value="up">Ke atas (rupiah bulat)</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 0 }}>
              <label className="form-label" style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'normal', display: 'block' }}>Penyesuaian Manual (Rp)</label>
              <input
                type="number" step="1"
                className="form-control premium-input"
                style={{ height: '36px', width: '100%', boxSizing: 'border-box' }}
                placeholder="opsional, +/-"
                value={editedPriceAdjustment !== 0 ? editedPriceAdjustment : ''}
                onChange={e => setEditedPriceAdjustment(parseFloat(e.target.value) || 0)}
              />
            </div>

            {sellingPriceFinal > 0 && (
              <div style={{
                gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '12px', marginTop: '2px', padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Harga Jual Ideal — raw: {formatIDR(sellingPriceRaw)}, dibulatkan: {formatIDR(sellingPriceRounded)}
                  {editedPriceAdjustment !== 0 && <> + penyesuaian {formatIDR(editedPriceAdjustment)}</>}:{' '}
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatIDR(sellingPriceFinal)}</strong>
                </div>
                <button
                  type="button"
                  className="btn premium-btn premium-btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.75rem', flexShrink: 0 }}
                  onClick={() => setEditedSellingPrice(sellingPriceFinal)}
                  disabled={editedSellingPrice === sellingPriceFinal}
                >
                  Pakai harga ini
                </button>
              </div>
            )}
          </div>

          {/* Ingredients Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>
              Komposisi Bahan Baku (Recipe List)
            </h3>
            <button 
              className="btn premium-btn premium-btn-secondary" 
              style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '6px' }} 
              onClick={handleAddIngredient}
            >
              <Plus size={14} /> Tambah Bahan
            </button>
          </div>

          {/* Ingredients Table */}
          <div className="table-container glass-scrollbar" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 'var(--radius-lg)', background: 'rgba(0,0,0,0.1)' }}>
            <table className="custom-table premium-table" style={{ width: '100%', minWidth: '750px' }}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Bahan Baku</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                  <th style={{ width: '12%' }}>Satuan</th>
                  <th style={{ width: '18%' }}>Pack Info</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Harga/Pack</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                  <th style={{ width: '3%', textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {editedIngredients.map((ing, idx) => {
                  const rowAmount = calcRowAmount(ing);
                  const availableUnits = getUnitsForItem(ing.item_name);
                  const packLabel = getPackLabel(ing.item_name);
                  const info = stockMap[ing.item_name];

                  return (
                    <tr key={ing._uid ?? idx}>
                      {/* Item Name with Autocomplete */}
                      <td style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className="form-control premium-input table-input"
                          placeholder="Ketik nama bahan..."
                          value={ing.item_name}
                          onFocus={() => setOpenDropdown(idx)}
                          onChange={(e) => {
                            const updated = [...editedIngredients];
                            updated[idx] = { ...updated[idx], item_name: e.target.value };
                            setEditedIngredients(updated);
                            setOpenDropdown(idx);
                          }}
                          onBlur={() => setTimeout(() => setOpenDropdown(null), 250)}
                        />
                        {openDropdown === idx && (
                          <ul className="search-results-list glass-scrollbar" style={{ 
                            background: '#161922', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            borderRadius: 'var(--radius-lg)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(10px)',
                            zIndex: 1000,
                            padding: '4px',
                            marginTop: '2px'
                          }}>
                            {stock
                              .filter(item => item.name.toLowerCase().includes((ing.item_name || '').toLowerCase()))
                              .slice(0, 8)
                              .map(item => (
                                <li
                                  key={item.id ?? item.name}
                                  className="search-results-item"
                                  style={{ borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}
                                  onMouseDown={() => handleSelectItem(idx, item)}
                                >
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.825rem' }}>{item.name}</div>
                                  <div style={{ fontSize: '0.675rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                                    <span>{item.category}</span>
                                    <span>•</span>
                                    <span>{item.full_pack}</span>
                                    <span>•</span>
                                    <span style={{ color: 'var(--accent)' }}>{formatIDR(item.new_price || item.price)}</span>
                                  </div>
                                </li>
                              ))}
                            {stock.filter(item => item.name.toLowerCase().includes((ing.item_name || '').toLowerCase())).length === 0 && (
                              <li className="search-results-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem', padding: '8px 12px' }}>
                                Tidak ditemukan di inventory
                              </li>
                            )}
                          </ul>
                        )}
                      </td>

                      {/* Qty */}
                      <td>
                        <input
                          type="number"
                          step="any"
                          className="form-control premium-input table-input"
                          style={{ textAlign: 'right', fontWeight: 600 }}
                          value={ing.qty_in_use}
                          onChange={e => handleQtyChange(idx, e.target.value)}
                        />
                      </td>

                      {/* Unit Selector */}
                      <td>
                        <select
                          className="form-control premium-input table-input table-select"
                          value={ing.unit || 'gr'}
                          onChange={e => handleUnitChange(idx, e.target.value)}
                        >
                          {availableUnits.map(u => (
                            <option key={u} value={u}>{u.toUpperCase()}</option>
                          ))}
                        </select>
                      </td>

                      {/* Pack Info */}
                      <td style={{ fontSize: '0.7rem', color: info?.packDataInconsistent ? 'var(--danger, #e05252)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={info?.packDataInconsistent ? `Full Pack "${info?.full_pack}" tidak cocok dengan Satuan "${info?.unit}" — cek data master bahan ini.` : packLabel}>
                        {info?.packDataInconsistent && <AlertTriangle size={11} style={{ verticalAlign: '-2px', marginRight: '3px' }} />}
                        {packLabel || '-'}
                      </td>

                      {/* Price per pack */}
                      <td style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={info ? formatIDR(info.new_price || info.price) : formatIDR(ing.unit_price)}>
                        {info ? formatIDR(info.new_price || info.price) : formatIDR(ing.unit_price)}
                      </td>

                      {/* Amount */}
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={formatIDR(rowAmount)}>
                        {formatIDR(rowAmount)}
                      </td>

                      {/* Remove */}
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '6px', borderRadius: 'var(--radius-sm)', transition: 'all 0.2s' }} 
                          className="premium-btn-danger"
                          onClick={() => handleRemoveIngredient(idx)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {editedIngredients.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.825rem' }}>
                      Belum ada bahan baku terhubung. Klik "Tambah Bahan" untuk meracik resep.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Calculation Bar - sticky */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            background: 'rgba(30, 41, 59, 0.4)', 
            border: '1px solid var(--border)', 
            padding: '14px 20px', 
            borderRadius: 'var(--radius-lg)', 
            flexShrink: 0,
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ display: 'flex', gap: '24px', fontSize: '0.825rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>Subtotal: <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatIDR(subtotal)}</strong></span>
              <span style={{ width: 1, background: 'var(--border)', height: '14px', alignSelf: 'center' }} />
              <span>Fix Cost ({(editedFixCostPct * 100).toFixed(1).replace(/\.0$/, '')}%): <strong style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatIDR(fixCost)}</strong></span>
              <span style={{ width: 1, background: 'var(--border)', height: '14px', alignSelf: 'center' }} />
              <span>HPP Gabungan: <strong style={{ color: 'var(--accent)', fontWeight: 800 }}>{formatIDR(basicCost)}</strong></span>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {activeRecipe && activeRecipe.id && (
                <button 
                  className="btn premium-btn premium-btn-danger" 
                  style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '8px', background: 'var(--danger-glow)', color: 'var(--danger-text)', border: '1px solid rgba(220, 38, 38, 0.2)' }} 
                  onClick={() => {
                    if (window.confirm(`Yakin ingin menghapus resep menu "${activeRecipe.menu_name}"?`)) {
                      onDeleteRecipe(activeRecipe.id);
                      setActiveRecipe(null);
                    }
                  }}
                >
                  <Trash2 size={15} /> Hapus Resep
                </button>
              )}
              <button 
                className="btn premium-btn premium-btn-primary" 
                style={{ padding: '10px 20px', fontSize: '0.85rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '8px' }} 
                onClick={handleSaveRecipe}
              >
                <Save size={15} /> Simpan Resep
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', minHeight: '60vh', border: '1px solid var(--border)' }}>
          <ChefHat size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
          <h4 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', marginBottom: '4px' }}>Tidak Ada Resep Terpilih</h4>
          <p style={{ fontSize: '0.85rem', maxWidth: '240px', textAlign: 'center' }}>Pilih resep dari menu di sebelah kiri atau buat resep baru.</p>
        </div>
      )}

      {/* Add New Recipe Slide-over Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 3000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Tambah Resep Baru</h3>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAddModal(false)}>
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddNewRecipe} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Nama Menu</label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ height: '40px' }}
                  placeholder="contoh: Iced Matcha Latte" 
                  required 
                  value={newMenuName} 
                  onChange={e => setNewMenuName(e.target.value)} 
                />
              </div>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Kategori</label>
                <select 
                  className="form-control" 
                  style={{ height: '40px' }}
                  value={newMenuCategory} 
                  onChange={e => setNewMenuCategory(e.target.value)}
                >
                  <option value="KOPI">Kopi</option>
                  <option value="NON-KOPI">Non-Kopi</option>
                  <option value="MOCKTAIL">Mocktail</option>
                  <option value="JUICE">Juice</option>
                  <option value="TEA">Tea</option>
                  <option value="BEER">Beer & Alcohol</option>
                </select>
              </div>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Harga Jual (IDR)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  style={{ height: '40px' }}
                  placeholder="contoh: 35000" 
                  value={newMenuPrice} 
                  onChange={e => setNewMenuPrice(e.target.value)} 
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0, marginTop: '16px' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>URL Gambar Menu</label>
                <input 
                  type="text" 
                  className="form-control" 
                  style={{ height: '40px' }}
                  placeholder="https://example.com/image.jpg" 
                  value={newImageUrl} 
                  onChange={e => setNewImageUrl(e.target.value)} 
                />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, height: '44px', borderRadius: 'var(--radius-md)' }} onClick={() => setShowAddModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, height: '44px', borderRadius: 'var(--radius-md)', fontWeight: 700 }}>Buat Resep</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="recipes"
        title="Bulk Import Resep & Harga Jual"
        description="Upload data menu, harga jual, dan resep sekaligus dari file Excel."
        onCommit={async (rows) => {
          const res = await api.bulkImportRecipes(rows);
          if (res.success > 0) refreshData();
          return res;
        }}
        expectedColumns={[
          { key: 'menu_name', label: 'NAMA MENU', required: true, type: 'string', description: 'Nama menu (harus sama persis dengan di POS)', sample: 'Ice Caramel Latte' },
          { key: 'category', label: 'KATEGORI', required: false, type: 'string', description: 'Kategori menu: KOPI/NON-KOPI/TEA/MOCKTAIL/JUICE/BEER', sample: 'KOPI' },
          { key: 'selling_price', label: 'HARGA JUAL', required: true, type: 'number', description: 'Harga Jual (angka tanpa titik)', sample: 45000 },
          { key: 'bahan_1', label: 'BAHAN 1', required: false, type: 'string', description: 'Nama bahan baku 1', sample: 'Espresso Bean' },
          { key: 'qty_1', label: 'QTY 1', required: false, type: 'number', description: 'Jumlah bahan baku 1', sample: 36 },
          { key: 'bahan_2', label: 'BAHAN 2', required: false, type: 'string', description: 'Nama bahan baku 2', sample: 'Fresh Milk' },
          { key: 'qty_2', label: 'QTY 2', required: false, type: 'number', description: 'Jumlah bahan baku 2', sample: 150 },
          { key: 'bahan_3', label: 'BAHAN 3', required: false, type: 'string', description: 'Nama bahan baku 3', sample: 'Caramel Syrup' },
          { key: 'qty_3', label: 'QTY 3', required: false, type: 'number', description: 'Jumlah bahan baku 3', sample: 20 },
          // BAHAN 4-10 / QTY 4-10: api.bulkImportRecipes already reads up to 10 ingredient
          // pairs from the row object, but this list previously stopped at 3, so any
          // ingredient past slot 3 was silently dropped before it ever reached the API.
          { key: 'bahan_4', label: 'BAHAN 4', required: false, type: 'string', description: 'Nama bahan baku 4', sample: '' },
          { key: 'qty_4', label: 'QTY 4', required: false, type: 'number', description: 'Jumlah bahan baku 4', sample: '' },
          { key: 'bahan_5', label: 'BAHAN 5', required: false, type: 'string', description: 'Nama bahan baku 5', sample: '' },
          { key: 'qty_5', label: 'QTY 5', required: false, type: 'number', description: 'Jumlah bahan baku 5', sample: '' },
          { key: 'bahan_6', label: 'BAHAN 6', required: false, type: 'string', description: 'Nama bahan baku 6', sample: '' },
          { key: 'qty_6', label: 'QTY 6', required: false, type: 'number', description: 'Jumlah bahan baku 6', sample: '' },
          { key: 'bahan_7', label: 'BAHAN 7', required: false, type: 'string', description: 'Nama bahan baku 7', sample: '' },
          { key: 'qty_7', label: 'QTY 7', required: false, type: 'number', description: 'Jumlah bahan baku 7', sample: '' },
          { key: 'bahan_8', label: 'BAHAN 8', required: false, type: 'string', description: 'Nama bahan baku 8', sample: '' },
          { key: 'qty_8', label: 'QTY 8', required: false, type: 'number', description: 'Jumlah bahan baku 8', sample: '' },
          { key: 'bahan_9', label: 'BAHAN 9', required: false, type: 'string', description: 'Nama bahan baku 9', sample: '' },
          { key: 'qty_9', label: 'QTY 9', required: false, type: 'number', description: 'Jumlah bahan baku 9', sample: '' },
          { key: 'bahan_10', label: 'BAHAN 10', required: false, type: 'string', description: 'Nama bahan baku 10', sample: '' },
          { key: 'qty_10', label: 'QTY 10', required: false, type: 'number', description: 'Jumlah bahan baku 10', sample: '' }
        ]}
      />
    </div>
  );
}
