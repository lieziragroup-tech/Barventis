/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const DataContext = createContext();

export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const { isAuthenticated, activeUser } = useAuth();
  const toast = useToast();
  const fetchControllerRef = useRef(null);
  
  const [stock, setStock] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [unitConversions, setUnitConversions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(() => api.getActiveBranchId());

  const roleNorm = String(activeUser?.role || '').trim();
  const canSwitchBranch = roleNorm === 'Admin / Owner' || roleNorm === 'Owner';

  const refreshBranches = useCallback(async () => {
    if (!isAuthenticated || !activeUser || roleNorm === 'Super Admin' || roleNorm === 'SuperAdmin') {
      setBranches([]);
      return [];
    }
    try {
      const list = await api.getBranches();
      setBranches(list || []);
      return list || [];
    } catch (e) {
      console.warn('refreshBranches warning:', e);
      return [];
    }
  }, [isAuthenticated, activeUser, roleNorm]);

  const fetchAllData = useCallback(async (overrideBranchId = undefined) => {
    if (!isAuthenticated || !activeUser || roleNorm === 'Super Admin' || roleNorm === 'SuperAdmin') return;

    // Cancel any in-flight fetch (prevents race condition on rapid re-renders / branch switches)
    if (fetchControllerRef.current) {
      fetchControllerRef.current.cancelled = true;
    }
    const controller = { cancelled: false };
    fetchControllerRef.current = controller;

    setLoadingData(true);
    try {
      const branchList = await api.getBranches().catch(() => []);
      if (controller.cancelled) return;
      setBranches(branchList);

      const storageKey = activeUser?.tenant_id ? `bv_owner_branch_${activeUser.tenant_id}` : null;
      const savedOwnerBranch = canSwitchBranch && storageKey && typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(storageKey)
        : null;

      let resolvedBranchId = activeUser.branch_id || null;
      if (canSwitchBranch) {
        const candidateId = overrideBranchId !== undefined ? overrideBranchId : (activeBranchId || savedOwnerBranch || activeUser.branch_id);
        const existsInList = branchList.find(b => b.id === candidateId && b.is_active !== false);
        resolvedBranchId = existsInList
          ? existsInList.id
          : (branchList.find(b => b.is_active !== false)?.id || branchList[0]?.id || candidateId || null);
        if (storageKey && resolvedBranchId && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(storageKey, resolvedBranchId);
        }
      } else {
        // Staf terkunci pada branch_id miliknya
        resolvedBranchId = activeUser.branch_id || branchList.find(b => b.is_active !== false)?.id || branchList[0]?.id || null;
      }

      api.setActiveBranch(resolvedBranchId);
      setActiveBranchId(resolvedBranchId);

      const [materialsData, recipesData, invoicesData, transactionsData, conversionsData] = await Promise.all([
        api.getMaterials().catch(e => { console.error('Materials:', e); return []; }),
        api.getRecipes().catch(e => { console.error('Recipes:', e); return []; }),
        Promise.resolve([]),
        Promise.resolve([]),
        api.getUnitConversions().catch(e => { console.error('UnitConversions:', e); return []; })
      ]);

      // Skip state updates if a newer fetch has been initiated
      if (controller.cancelled) return;

      setStock(materialsData);

      setRecipes(recipesData.map(r => ({
        ...r,
        total_cost: r.basic_cost,
        yield: "1",
        ingredients: (r.ingredients || []).map(ing => ({
          material_id: ing.material_id,
          item_name: ing.item_name || (ing.material ? ing.material.name : 'Bahan Terhapus'),
          qty_in_use: parseFloat(ing.qty_in_use),
          unit: ing.unit,
          unit_price: parseFloat(ing.unit_price),
          amount: parseFloat(ing.amount)
        }))
      })));

      setInvoices(invoicesData.map(inv => ({
        ...inv,
        items: (inv.items || []).map(item => ({
          material_id: item.material_id,
          item_name: item.item_name || (item.material ? item.material.name : 'Bahan Terhapus'),
          qty: parseFloat(item.qty),
          unit_price: parseFloat(item.unit_price),
          unit: item.unit || (item.material ? item.material.unit : 'pck')
        }))
      })));

      const txData = Array.isArray(transactionsData) ? transactionsData : (transactionsData.data || []);
      setTransactions(txData);
      setUnitConversions(conversionsData || []);
    } catch (e) {
      console.error('fetchAllData error:', e);
    } finally {
      if (!controller.cancelled) {
        setLoadingData(false);
      }
    }
  }, [isAuthenticated, activeUser, roleNorm, canSwitchBranch, activeBranchId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAllData();
  }, [fetchAllData]);

  const showToast = useCallback((message, type = 'error') => {
    if (!toast) return;
    if (type === 'success') toast.showSuccess(message);
    else if (type === 'warning') toast.showWarning(message);
    else if (type === 'info') toast.showInfo(message);
    else toast.showError(message);
  }, [toast]);

  const handleAdjustStock = useCallback(async (itemNameOrObj, location, type, qty, notes) => {
    let id;
    if (typeof itemNameOrObj === 'object' && itemNameOrObj !== null && itemNameOrObj.id) {
      id = itemNameOrObj.id;
    } else {
      const match = stock.find(item => item.name === itemNameOrObj);
      if (!match) throw new Error(`Material "${itemNameOrObj}" tidak ditemukan di data lokal.`);
      id = match.id;
    }
    await api.adjustStock(id, { location, type, qty, notes });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleUpdateItem = useCallback(async (updatedItem) => {
    const match = stock.find(item => item.name === updatedItem.originalName || item.name === updatedItem.name);
    if (!match) throw new Error(`Material "${updatedItem.originalName || updatedItem.name}" tidak ditemukan di data lokal.`);
    await api.updateMaterial(match.id, {
      name: updatedItem.name,
      category: updatedItem.category,
      supplier: updatedItem.supplier,
      unit: updatedItem.unit,
      full_pack: updatedItem.full_pack,
      price: updatedItem.price,
      new_price: updatedItem.new_price ?? updatedItem.price,
      min_stock: updatedItem.min_stock
    });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleAddItem = useCallback(async (newItem) => {
    const data = await api.createMaterial(newItem);
    await fetchAllData();
    return data;
  }, [fetchAllData]);

  const handleDeleteItem = useCallback(async (itemName, force = false) => {
    const match = stock.find(item => item.name === itemName);
    if (!match) throw new Error(`Material "${itemName}" tidak ditemukan di data lokal.`);
    await api.deleteMaterial(match.id, force);
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleProcessPosSales = useCallback(async (mappedSales, options) => {
    try {
      // mappedSales structure dari PosUpload: [{ recipe_id, qty, price }, ...]
      await api.processPOSSync(mappedSales, options);
      await fetchAllData();
      showToast('POS data synced. Usage teoritis tercatat sbg benchmark — stok riil tetap mengikuti input Daily Inventory/Stock Opname fisik.', 'success');
    } catch (error) {
      console.error('POS sync error:', error);
      showToast(error.message || 'Failed to sync POS data', 'error');
      throw error;
    }
  }, [fetchAllData, showToast]);

  const handleSaveRecipe = useCallback(async (updatedRecipe) => {
    const recipeId = updatedRecipe.id;
    if (!recipeId) throw new Error("ID Resep tidak ditemukan.");
    const mappedIngredients = (updatedRecipe.ingredients || []).map(ing => {
      const materialId = ing.material_id ?? stock.find(s => s.name === ing.item_name)?.id ?? null;
      return {
        material_id: materialId,
        qty_in_use: ing.qty_in_use,
        unit: ing.unit
      };
    }).filter(ing => ing.material_id !== null);

    await api.updateRecipe(recipeId, {
      menu_name: updatedRecipe.menu_name,
      category: updatedRecipe.category,
      // selling_price_override (not selling_price): the manual price typed in
      // the (unchanged) Recipe Builder form always wins over the new
      // target-price formula. See PRD §5. The fields below are undefined
      // for now since Recipes.jsx doesn't set them yet (Phase 1) — api.js
      // falls back to sensible defaults when they're undefined/null.
      selling_price_override: updatedRecipe.selling_price,
      fix_cost_pct: updatedRecipe.fix_cost_pct,
      food_cost_pct: updatedRecipe.food_cost_pct,
      rounding_direction: updatedRecipe.rounding_direction,
      rounding_increment: updatedRecipe.rounding_increment,
      price_adjustment: updatedRecipe.price_adjustment,
      ingredients: mappedIngredients
    });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleAddRecipe = useCallback(async (newRecipe) => {
    const mappedIngredients = newRecipe.ingredients.map(ing => {
      const mat = stock.find(s => s.name === ing.item_name);
      return {
        material_id: mat ? mat.id : null,
        qty_in_use: ing.qty_in_use,
        unit: ing.unit
      };
    }).filter(ing => ing.material_id !== null);

    await api.createRecipe({
      menu_name: newRecipe.menu_name,
      category: newRecipe.category,
      selling_price_override: newRecipe.selling_price,
      fix_cost_pct: newRecipe.fix_cost_pct,
      food_cost_pct: newRecipe.food_cost_pct,
      rounding_direction: newRecipe.rounding_direction,
      rounding_increment: newRecipe.rounding_increment,
      price_adjustment: newRecipe.price_adjustment,
      ingredients: mappedIngredients
    });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleDeleteRecipe = useCallback(async (recipeId) => {
    await api.deleteRecipe(recipeId);
    await fetchAllData();
  }, [fetchAllData]);

  const handleCompleteOpname = useCallback(async (auditLoc, reconciliation, signatureData, period_month = null, period_year = null) => {
    const formattedItems = reconciliation.map(item => {
      const mat = stock.find(s => s.name === item.name);
      return {
        material_id: mat ? mat.id : null,
        physical_qty: item.physical_qty,
        notes: item.notes
      };
    }).filter(item => item.material_id !== null);

    await api.completeOpname({
      location: auditLoc,
      items: formattedItems,
      signature_svg: signatureData || '',
      period_month,
      period_year
    });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleCreateInvoice = useCallback(async (invoice) => {
    const formattedItems = invoice.items.map(item => {
      const mat = stock.find(s => s.name === item.item_name);
      return {
        material_id: mat ? mat.id : null,
        qty: item.qty,
        unit_price: item.unit_price
      };
    }).filter(item => item.material_id !== null);

    await api.createInvoice({
      supplier: invoice.supplier,
      notes: invoice.notes || '',
      location: invoice.location || 'CENTRAL',
      items: formattedItems
    });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleReceiveInvoice = useCallback(async (invoiceId, payload = {}) => {
    await api.receiveInvoice(invoiceId, payload);
    await fetchAllData();
  }, [fetchAllData]);

  const handleCancelInvoice = useCallback(async (invoiceId) => {
    await api.updateInvoiceStatus(invoiceId, 'CANCELLED');
    await fetchAllData();
  }, [fetchAllData]);

  const handleSendInvoice = useCallback(async (invoiceId) => {
    await api.updateInvoiceStatus(invoiceId, 'SENT');
    await fetchAllData();
  }, [fetchAllData]);

  // Build a Map<material_id, factor> from unit_conversions for costUtils
  const unitConversionMap = useMemo(() => {
    const map = new Map();
    for (const uc of unitConversions) {
      if (uc.material_id && uc.factor > 0) map.set(uc.material_id, uc.factor);
    }
    return map;
  }, [unitConversions]);

  const activeBranch = useMemo(() => {
    return branches.find(b => b.id === activeBranchId) || branches[0] || null;
  }, [branches, activeBranchId]);

  const switchBranch = useCallback(async (nextBranchId) => {
    if (!canSwitchBranch || !nextBranchId || nextBranchId === activeBranchId) return;
    const target = branches.find(b => b.id === nextBranchId);
    const storageKey = activeUser?.tenant_id ? `bv_owner_branch_${activeUser.tenant_id}` : null;
    if (storageKey && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(storageKey, nextBranchId);
    }
    api.setActiveBranch(nextBranchId);
    setActiveBranchId(nextBranchId);
    await fetchAllData(nextBranchId);
    if (target) {
      showToast(`Beralih ke ${target.name}`, 'info');
    }
  }, [canSwitchBranch, activeBranchId, branches, activeUser, fetchAllData, showToast]);

  const value = useMemo(() => ({
    stock,
    recipes,
    transactions,
    invoices,
    unitConversions,
    unitConversionMap,
    loadingData,
    branches,
    activeBranch,
    activeBranchId,
    canSwitchBranch,
    switchBranch,
    refreshBranches,
    refreshData: fetchAllData,
    fetchAllData,
    showToast,
    currentTenant: activeUser ? { 
      id: activeUser.tenant_id, 
      company_name: activeUser.company_name, 
      name: activeUser.tenant_name,
      is_pos_enabled: activeUser.is_pos_enabled,
      pos_tax_rate: activeUser.pos_tax_rate,
      pos_service_charge: activeUser.pos_service_charge,
      locked_until_month: activeUser.locked_until_month,
      locked_until_year: activeUser.locked_until_year
    } : null,
    sessionUser: activeUser,
    handleAdjustStock,
    handleUpdateItem,
    handleAddItem,
    handleDeleteItem,
    handleProcessPosSales,
    handleSaveRecipe,
    handleAddRecipe,
    handleDeleteRecipe,
    handleCompleteOpname,
    handleCreateInvoice,
    handleReceiveInvoice,
    handleCancelInvoice,
    handleSendInvoice
  }), [stock, recipes, transactions, invoices, unitConversions, unitConversionMap, loadingData, branches, activeBranch, activeBranchId, canSwitchBranch, switchBranch, refreshBranches, fetchAllData, showToast, activeUser, handleAdjustStock, handleUpdateItem, handleAddItem, handleDeleteItem, handleProcessPosSales, handleSaveRecipe, handleAddRecipe, handleDeleteRecipe, handleCompleteOpname, handleCreateInvoice, handleReceiveInvoice, handleCancelInvoice, handleSendInvoice]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
