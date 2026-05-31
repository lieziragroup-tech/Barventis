import React, { useState, useMemo } from 'react';
import { Search, Plus, Trash2, Save, X, ChevronDown } from 'lucide-react';

export default function Recipes({ stock, recipes, onSaveRecipe, onAddRecipe }) {
  const [activeRecipe, setActiveRecipe] = useState(recipes[0] || null);
  const [search, setSearch] = useState('');
  const [editedIngredients, setEditedIngredients] = useState(activeRecipe ? [...activeRecipe.ingredients] : []);
  const [editedSellingPrice, setEditedSellingPrice] = useState(activeRecipe ? Math.round(activeRecipe.selling_price) : 0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMenuName, setNewMenuName] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('KOPI');
  const [newMenuPrice, setNewMenuPrice] = useState('');
  const [openDropdown, setOpenDropdown] = useState(null);

  const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

  // Parse full_pack field to extract numeric value and unit
  // Examples: "1000 grm" => { size: 1000, unit: 'gr' }, "500 grm" => { size: 500, unit: 'gr' }
  // "24 pcs" => { size: 24, unit: 'pcs' }
  const parseFullPack = (fullPack) => {
    if (!fullPack) return { size: 1, unit: 'pcs' };
    const match = fullPack.match(/(\d+\.?\d*)\s*(.*)/);
    if (!match) return { size: 1, unit: 'pcs' };
    let unit = (match[2] || 'pcs').trim().toLowerCase();
    let size = parseFloat(match[1]);
    // Normalize units
    if (unit === 'grm' || unit === 'gram' || unit === 'grams') unit = 'gr';
    // Convert liters to ml (1L = 1000ml)
    if (unit === 'l' || unit === 'liter' || unit === 'ltr') { size = size * 1000; unit = 'ml'; }
    return { size, unit };
  };

  // Build a mapping of inventory items with their pack size info for smart unit selection
  const stockMap = useMemo(() => {
    const map = {};
    stock.forEach(item => {
      const packInfo = parseFullPack(item.full_pack);
      // Determine available usage units for this item
      let usageUnits = [];
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
    // All ingredients are now clean (mapped to inventory in seededData)
    setEditedIngredients([...(r.ingredients || [])]);
    setEditedSellingPrice(Math.round(r.selling_price));
    setOpenDropdown(null);
  };

  // Filter recipe list
  const filteredRecipes = recipes.filter(r => r.menu_name.toLowerCase().includes(search.toLowerCase()));

  // Calculate amount for a single ingredient row
  // amount = qty_in_use * pricePerUnit (if using the pack's content unit like gr/ml)
  // amount = qty_in_use * full_pack_price (if using per-pack unit like pck/btl)
  const calcRowAmount = (ing) => {
    // Use stored amount from database if available and qty hasn't changed
    if (ing.amount && ing.amount > 0) {
      // If user edited qty, recalculate; otherwise use stored value
    }
    const info = stockMap[ing.item_name];
    if (!info) {
      // Fallback: use stored amount or original formula
      if (ing.amount && ing.amount > 0) return ing.amount;
      const isGramMl = ['gr', 'ml', 'grm'].includes(ing.unit);
      return (ing.qty_in_use * (ing.unit_price || 0)) / (isGramMl ? 1000 : 1);
    }

    const usedUnit = (ing.unit || 'gr').toLowerCase().replace('grm', 'gr');
    const packUnit = (info.unit || 'pck').toLowerCase();
    const isGrMlPack = ['gr', 'ml'].includes(info.packContentUnit);

    if (usedUnit === packUnit) {
      // Using whole packs — multiply by pack price
      return ing.qty_in_use * (info.new_price || info.price);
    } else if (isGrMlPack && (usedUnit === 'gr' || usedUnit === 'ml')) {
      // Using gr/ml from a gr/ml pack
      return ing.qty_in_use * info.pricePerUnit;
    } else {
      // Fallback: pack has no gr/ml decomposition (e.g. "1 pck")
      // Use qty * packPrice / 1000 formula
      return (ing.qty_in_use * (info.new_price || info.price)) / 1000;
    }
  };

  const subtotal = editedIngredients.reduce((acc, ing) => acc + calcRowAmount(ing), 0);
  const fixCost = subtotal * 0.05;
  const basicCost = subtotal + fixCost;
  const foodCostPct = editedSellingPrice > 0 ? (basicCost / editedSellingPrice) : 0;

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
    setEditedIngredients([...editedIngredients, { item_name: '', qty_in_use: 0, unit: 'gr', unit_price: 0, amount: 0 }]);
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
  const handleSaveRecipe = () => {
    if (!activeRecipe) return;
    // Recalculate and store amount for each ingredient
    const savedIngredients = editedIngredients
      .filter(ing => ing.item_name !== '')
      .map(ing => ({ ...ing, amount: calcRowAmount(ing) }));
    const updatedRecipe = {
      ...activeRecipe,
      selling_price: editedSellingPrice,
      subtotal, fix_cost: fixCost, basic_cost: basicCost, food_cost_pct: foodCostPct,
      total_cost: basicCost,
      ingredients: savedIngredients
    };
    onSaveRecipe(updatedRecipe);
  };

  // Add new recipe
  const handleAddNewRecipe = (e) => {
    e.preventDefault();
    if (!newMenuName.trim()) return;
    const newRecipe = {
      menu_name: newMenuName.trim(),
      total_cost: 0, yield: '1',
      ingredients: [],
      subtotal: 0, fix_cost: 0, basic_cost: 0,
      food_cost_pct: 0,
      selling_price: parseInt(newMenuPrice) || 0
    };
    if (onAddRecipe) onAddRecipe(newRecipe);
    setShowAddModal(false);
    setNewMenuName('');
    setNewMenuPrice('');
    setActiveRecipe(newRecipe);
    setEditedIngredients([]);
    setEditedSellingPrice(parseInt(newMenuPrice) || 0);
  };

  // Cost badge color
  const getCostBadge = (pct) => {
    const p = typeof pct === 'number' && pct < 1 ? pct * 100 : pct;
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
    <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 180px)' }}>
      {/* Left: Recipe List */}
      <div className="glass-card" style={{ width: '300px', display: 'flex', flexDirection: 'column', padding: '16px', flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search recipes..." className="form-control" style={{ paddingLeft: '36px', padding: '10px 16px 10px 36px' }} value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Add New Button */}
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: '12px', fontSize: '0.85rem', padding: '8px' }} onClick={() => setShowAddModal(true)}>
          <Plus size={16} /> Tambah Menu Baru
        </button>

        {/* Recipe List */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {filteredRecipes.map(r => {
            const isActive = activeRecipe && activeRecipe.menu_name === r.menu_name;
            const pct = r.food_cost_pct || 0;
            const pctDisplay = typeof pct === 'number' && pct < 1 ? (pct * 100).toFixed(0) : pct;
            return (
              <div key={r.menu_name} className={`nav-item ${isActive ? 'active' : ''}`} style={{ padding: '10px 12px', justifyContent: 'space-between' }} onClick={() => handleSelectRecipe(r)}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.menu_name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>HPP: {formatIDR(r.basic_cost || 0)}</div>
                </div>
                <span className={`badge ${getCostBadge(pct)}`} style={{ fontSize: '0.65rem', padding: '2px 6px', flexShrink: 0 }}>
                  {pctDisplay}%
                </span>
              </div>
            );
          })}
          {filteredRecipes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No recipes found.
            </div>
          )}
        </div>
      </div>

      {/* Right: Recipe Editor */}
      {activeRecipe ? (
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', marginBottom: '16px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <span className="badge badge-info" style={{ marginBottom: '6px' }}>Recipe & COGS</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>{activeRecipe.menu_name}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px' }}>Ingredients dari inventory per porsi</p>
            </div>
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '10px' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Basic Cost (HPP)</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)' }}>{formatIDR(basicCost)}</div>
              </div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Food Cost %</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', color: foodCostPct < 0.27 ? 'var(--success)' : foodCostPct <= 0.3 ? 'var(--warning)' : 'var(--danger)' }}>
                  {(foodCostPct * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>

          {/* Selling Price + Category */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Menu Category</label>
              <input type="text" className="form-control" readOnly value={activeRecipe.menu_name.toLowerCase().match(/espresso|americano|latte|cappuc|kopi|coffee/) ? 'KOPI' : 'NON-KOPI / COGS'} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Harga Jual (IDR)</label>
              <input type="number" className="form-control" value={editedSellingPrice} onChange={e => setEditedSellingPrice(parseInt(e.target.value) || 0)} />
            </div>
          </div>

          {/* Ingredients Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
              Bahan Baku (dari Inventory)
            </h3>
            <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.8rem' }} onClick={handleAddIngredient}>
              <Plus size={14} /> Tambah Bahan
            </button>
          </div>

          {/* Ingredients Table */}
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Bahan Baku</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                  <th style={{ width: '14%' }}>Satuan</th>
                  <th style={{ width: '14%' }}>Pack Info</th>
                  <th style={{ width: '14%', textAlign: 'right' }}>Harga/Pack</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Amount</th>
                  <th style={{ width: '4%' }}></th>
                </tr>
              </thead>
              <tbody>
                {editedIngredients.map((ing, idx) => {
                  const rowAmount = calcRowAmount(ing);
                  const availableUnits = getUnitsForItem(ing.item_name);
                  const packLabel = getPackLabel(ing.item_name);
                  const info = stockMap[ing.item_name];

                  return (
                    <tr key={idx}>
                      {/* Item Name with Autocomplete */}
                      <td style={{ position: 'relative' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ padding: '7px 10px', fontSize: '0.85rem' }}
                          placeholder="Pilih bahan..."
                          value={ing.item_name}
                          onFocus={() => setOpenDropdown(idx)}
                          onChange={(e) => {
                            const updated = [...editedIngredients];
                            updated[idx] = { ...updated[idx], item_name: e.target.value };
                            setEditedIngredients(updated);
                            setOpenDropdown(idx);
                          }}
                          onBlur={() => setTimeout(() => setOpenDropdown(null), 200)}
                        />
                        {openDropdown === idx && (
                          <ul className="search-results-list">
                            {stock
                              .filter(item => item.name.toLowerCase().includes((ing.item_name || '').toLowerCase()))
                              .slice(0, 8)
                              .map(item => {
                                const pInfo = parseFullPack(item.full_pack);
                                return (
                                  <li key={item.name} className="search-results-item" onMouseDown={() => handleSelectItem(idx, item)}>
                                    <div style={{ fontWeight: 500 }}>{item.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                      {item.category} · {item.full_pack || item.unit} · {formatIDR(item.new_price || item.price)}
                                    </div>
                                  </li>
                                );
                              })}
                            {stock.filter(item => item.name.toLowerCase().includes((ing.item_name || '').toLowerCase())).length === 0 && (
                              <li className="search-results-item" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                Tidak ada item di inventory
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
                          className="form-control"
                          style={{ padding: '7px 10px', fontSize: '0.85rem', textAlign: 'right' }}
                          value={ing.qty_in_use}
                          onChange={e => handleQtyChange(idx, e.target.value)}
                        />
                      </td>

                      {/* Unit Selector */}
                      <td>
                        <select
                          className="form-control"
                          style={{ padding: '7px 8px', fontSize: '0.8rem' }}
                          value={ing.unit || 'gr'}
                          onChange={e => handleUnitChange(idx, e.target.value)}
                        >
                          {availableUnits.map(u => (
                            <option key={u} value={u}>{u.toUpperCase()}</option>
                          ))}
                        </select>
                      </td>

                      {/* Pack Info */}
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {packLabel || '-'}
                      </td>

                      {/* Price per pack */}
                      <td style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {info ? formatIDR(info.new_price || info.price) : formatIDR(ing.unit_price)}
                      </td>

                      {/* Amount */}
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>{formatIDR(rowAmount)}</td>

                      {/* Remove */}
                      <td style={{ textAlign: 'center' }}>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }} onClick={() => handleRemoveIngredient(idx)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {editedIngredients.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      Belum ada bahan. Klik "Tambah Bahan" untuk mulai membangun resep.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Calculation Bar - sticky */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '10px', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>Subtotal: <strong style={{ color: 'var(--text-primary)' }}>{formatIDR(subtotal)}</strong></span>
              <span>Fix Cost (5%): <strong style={{ color: 'var(--text-primary)' }}>{formatIDR(fixCost)}</strong></span>
              <span>Basic Cost: <strong style={{ color: 'var(--accent)' }}>{formatIDR(basicCost)}</strong></span>
            </div>
            <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', flexShrink: 0 }} onClick={handleSaveRecipe}>
              <Save size={14} /> Simpan Resep
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card empty-state" style={{ flex: 1 }}>
          Pilih resep dari daftar, atau tambah menu baru.
        </div>
      )}

      {/* Add New Recipe Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="glass-card" style={{ width: '420px', padding: '24px', border: '1px solid var(--border-focus)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Tambah Menu Baru</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddNewRecipe}>
              <div className="form-group">
                <label className="form-label">Nama Menu</label>
                <input type="text" className="form-control" placeholder="contoh: Iced Matcha Latte" required value={newMenuName} onChange={e => setNewMenuName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select className="form-control" value={newMenuCategory} onChange={e => setNewMenuCategory(e.target.value)}>
                  <option value="KOPI">Kopi</option>
                  <option value="NON-KOPI">Non-Kopi</option>
                  <option value="MOCKTAIL">Mocktail</option>
                  <option value="JUICE">Juice</option>
                  <option value="TEA">Tea</option>
                  <option value="BEER">Beer & Alcohol</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Harga Jual (IDR)</label>
                <input type="number" className="form-control" placeholder="contoh: 35000" value={newMenuPrice} onChange={e => setNewMenuPrice(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Buat Resep</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
