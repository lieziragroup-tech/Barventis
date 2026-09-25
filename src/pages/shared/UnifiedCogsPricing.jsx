import React, { useState, useMemo } from 'react';
import { Search, Calculator, Check, AlertCircle } from 'lucide-react';
import { formatIDR } from '../../services/costUtils';
import { useToast } from '../../contexts/ToastContext';

const UnifiedCogsPricing = ({ recipes = [], materials = [], onSaveRecipe }) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('Semua');
  
  // States for Editing/Adding
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const filters = ['Semua', 'Kopi Racik', 'Non-Kopi & Teh', 'Mocktail & Jus', 'Beer', 'Soft Drink'];

  const filteredRecipes = useMemo(() => {
    return recipes.filter(r => {
      const matchSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (r.item_code || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;
      
      if (activeFilter === 'Semua') return true;
      if (activeFilter === 'Beer') return r.category === 'Beer';
      if (activeFilter === 'Soft Drink') return r.category === 'Soft Drink' || r.category === 'RTD';
      if (activeFilter === 'Kopi Racik') return r.category === 'Coffee' || r.category === 'Kopi';
      if (activeFilter === 'Mocktail & Jus') return r.category === 'Mocktail' || r.category === 'Juice';
      if (activeFilter === 'Non-Kopi & Teh') return r.category === 'Tea' || r.category === 'Non-Coffee';
      return r.category === activeFilter;
    });
  }, [recipes, searchTerm, activeFilter]);

  // HPP Calculation Logic
  const getMaterialCost = (materialId) => {
    const mat = materials.find(m => m.id === materialId || m.id === parseInt(materialId));
    if (!mat) return 0;
    // Calculate Base Cost
    return mat.cost_per_base_unit || (mat.price && mat.pack_factor ? mat.price / mat.pack_factor : 0);
  };

  const calculateHPP = (recipeForm) => {
    if (recipeForm.is_ready_to_drink) {
      // Poka-Yoke: Produk Jadi ambil modal dari Market List (Material langsung)
      return getMaterialCost(recipeForm.linked_material_id) || recipeForm.base_cost || 0;
    }
    
    // Minuman Racik: Jumlahkan gramasi bahan
    let total = 0;
    (recipeForm.ingredients || []).forEach(ing => {
      total += getMaterialCost(ing.material_id) * (ing.qty || 0);
    });
    return total;
  };

  const getCostStatus = (costPercent) => {
    if (costPercent <= 27) return { color: 'bg-green-100 text-green-700 border-green-200', label: 'Aman' };
    if (costPercent <= 30) return { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Warning' };
    return { color: 'bg-red-100 text-red-700 border-red-200', label: 'Bocor' };
  };

  const startEdit = (recipe) => {
    setEditingId(recipe.id);
    setEditForm({
      ...recipe,
      // determine type
      is_ready_to_drink: recipe.category === 'Beer' || recipe.category === 'Soft Drink' || recipe.category === 'RTD' || recipe.is_ready_to_drink,
      ingredients: recipe.ingredients || Array.from({ length: 10 }, () => ({ material_id: '', qty: 0 }))
    });
  };

  const handleIngredientChange = (index, field, value) => {
    const newIngredients = [...editForm.ingredients];
    if (!newIngredients[index]) newIngredients[index] = { material_id: '', qty: 0 };
    
    if (field === 'material_id') {
      newIngredients[index] = { ...newIngredients[index], material_id: value };
    } else {
      newIngredients[index] = { ...newIngredients[index], qty: parseFloat(value) || 0 };
    }
    
    setEditForm({ ...editForm, ingredients: newIngredients });
  };

  const handleSave = () => {
    const currentHpp = calculateHPP(editForm);
    if (currentHpp <= 0) {
      return toast.showError('HPP tidak boleh Rp 0');
    }

    // Rekomendasi Jual = HPP / (0.27 - 0.05) => HPP / 0.22
    const targetCostPercent = editForm.target_cost_percent || 27;
    const fixCost = 5;
    const marginDivisor = (targetCostPercent - fixCost) / 100;
    const recommendedPrice = currentHpp / marginDivisor;
    
    const finalForm = {
      ...editForm,
      base_cost: currentHpp,
      recommended_price: recommendedPrice,
      // Filter out empty ingredients
      ingredients: editForm.is_ready_to_drink ? [] : editForm.ingredients.filter(i => i.material_id && i.qty > 0)
    };

    if (onSaveRecipe) {
      onSaveRecipe(finalForm);
      setEditingId(null);
      setEditForm(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-800">Unifikasi COGS & Menu Pricing</h2>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Cari menu, PLU..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                ${activeFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 font-medium">Menu & Kode</th>
              <th className="p-3 font-medium">Tipe</th>
              <th className="p-3 font-medium text-right">Modal (HPP)</th>
              <th className="p-3 font-medium text-right">Harga Jual</th>
              <th className="p-3 font-medium text-center">Cost %</th>
              <th className="p-3 font-medium text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRecipes.map(recipe => {
              const isEditing = editingId === recipe.id;
              const hpp = isEditing ? calculateHPP(editForm) : (recipe.base_cost || 0);
              const price = isEditing ? (editForm.price || 0) : (recipe.price || 0);
              const costPercent = price > 0 ? (hpp / price) * 100 : 0;
              const status = getCostStatus(costPercent);

              return (
                <React.Fragment key={recipe.id}>
                  <tr className={`hover:bg-gray-50 ${isEditing ? 'bg-blue-50/30' : ''}`}>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{recipe.name}</div>
                      <div className="text-xs text-gray-500">{recipe.item_code || '-'} • {recipe.category}</div>
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <select 
                            value={editForm.is_ready_to_drink ? 'true' : 'false'}
                            onChange={(e) => setEditForm({...editForm, is_ready_to_drink: e.target.value === 'true'})}
                            className="text-xs border rounded p-1"
                          >
                            <option value="false">Minuman Racik</option>
                            <option value="true">Produk Jadi</option>
                          </select>
                        </div>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full ${(recipe.category === 'Beer' || recipe.category === 'Soft Drink' || recipe.is_ready_to_drink) ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {(recipe.category === 'Beer' || recipe.category === 'Soft Drink' || recipe.is_ready_to_drink) ? 'Produk Jadi' : 'Racik'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium">{formatIDR(hpp)}</td>
                    <td className="p-3 text-right">
                      {isEditing ? (
                        <input 
                          type="number" 
                          value={editForm.price} 
                          onChange={(e) => setEditForm({...editForm, price: parseFloat(e.target.value) || 0})}
                          className="w-24 text-right border rounded p-1 focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      ) : (
                        formatIDR(price)
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className={`inline-flex flex-col items-center justify-center px-2 py-1 rounded border ${status.color}`}>
                        <span className="font-bold">{costPercent.toFixed(1)}%</span>
                        <span className="text-[10px] uppercase">{status.label}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => setEditingId(null)} className="text-gray-500 text-xs hover:underline">Batal</button>
                          <button onClick={handleSave} className="bg-primary text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 hover:bg-primary/90">
                            <Check className="w-3 h-3" /> Simpan
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(recipe)} className="text-primary text-xs font-medium hover:underline">
                          Edit BOM & Harga
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Expanded Edit Form */}
                  {isEditing && (
                    <tr className="bg-blue-50/10">
                      <td colSpan="6" className="p-4 border-b">
                        <div className="bg-white p-4 rounded border shadow-inner">
                          <h4 className="font-semibold text-sm mb-3">Formula / Bill of Materials</h4>
                          
                          {editForm.is_ready_to_drink ? (
                            <div className="bg-purple-50 p-4 rounded flex items-start gap-3 border border-purple-100">
                              <AlertCircle className="w-5 h-5 text-purple-500 shrink-0" />
                              <div>
                                <p className="text-sm text-purple-800 font-medium">Mode Produk Jadi Aktif</p>
                                <p className="text-xs text-purple-600 mt-1">Form input gramasi bahan dikunci (Poka-Yoke). HPP otomatis diambil langsung dari harga beli bahan baku (Market List).</p>
                                <div className="mt-3">
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Pilih Produk (Tarik Harga Modal)</label>
                                  <select 
                                    value={editForm.linked_material_id || ''}
                                    onChange={(e) => setEditForm({...editForm, linked_material_id: e.target.value})}
                                    className="w-full md:w-1/2 text-sm border rounded p-2 focus:ring-1 focus:ring-primary"
                                  >
                                    <option value="">-- Pilih Material Referensi --</option>
                                    {materials.filter(m => m.category === 'Beer' || m.category === 'Soft Drink' || m.category === 'RTD').map(m => (
                                      <option key={m.id} value={m.id}>{m.name} - Modal: {formatIDR(m.cost_per_base_unit || (m.price/m.pack_factor))}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 pb-1 border-b">
                                <div className="col-span-1">No</div>
                                <div className="col-span-6">Bahan Baku</div>
                                <div className="col-span-3">Gramasi/Qty</div>
                                <div className="col-span-2 text-right">Subtotal</div>
                              </div>
                              
                              {editForm.ingredients.slice(0, 10).map((ing, idx) => {
                                const costPerUnit = ing.material_id ? getMaterialCost(ing.material_id) : 0;
                                const sub = costPerUnit * (ing.qty || 0);
                                
                                return (
                                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                                    <div className="col-span-1 text-xs text-gray-400">{idx + 1}</div>
                                    <div className="col-span-6">
                                      <select 
                                        value={ing.material_id || ''}
                                        onChange={(e) => handleIngredientChange(idx, 'material_id', e.target.value)}
                                        className="w-full text-xs border rounded p-1.5 focus:ring-1 focus:outline-none"
                                      >
                                        <option value="">-- Pilih --</option>
                                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                      </select>
                                    </div>
                                    <div className="col-span-3">
                                      <input 
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={ing.qty === 0 ? '' : ing.qty}
                                        onChange={(e) => handleIngredientChange(idx, 'qty', e.target.value)}
                                        placeholder="0"
                                        className="w-full text-xs border rounded p-1.5 text-center focus:ring-1"
                                      />
                                    </div>
                                    <div className="col-span-2 text-right text-xs font-medium text-gray-700">
                                      {formatIDR(sub)}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          
                          <div className="mt-4 pt-3 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Simulasi Target Harga Jual Ideal</div>
                              <div className="text-sm font-medium">
                                HPP / (Ideal Food Cost 27% - Fix Cost 5%) = 
                                <span className="ml-2 text-primary font-bold">{formatIDR(hpp / 0.22)}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-500 mb-1">Total HPP Formula Aktif</div>
                              <div className="text-lg font-bold text-gray-800">{formatIDR(hpp)}</div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UnifiedCogsPricing;
