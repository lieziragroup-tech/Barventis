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

  const fetchAllData = useCallback(async () => {
    if (!isAuthenticated || !activeUser || activeUser.role === 'Super Admin' || activeUser.role === 'SuperAdmin') return;

    // Cancel any in-flight fetch (prevents race condition on rapid re-renders)
    if (fetchControllerRef.current) {
      fetchControllerRef.current.cancelled = true;
    }
    const controller = { cancelled: false };
    fetchControllerRef.current = controller;

    setLoadingData(true);
    try {
      const [materialsData, recipesData, invoicesData, transactionsData] = await Promise.all([
        api.getMaterials().catch(e => { console.error('Materials:', e); return []; }),
        api.getRecipes().catch(e => { console.error('Recipes:', e); return []; }),
        api.getInvoices().catch(e => { console.error('Invoices:', e); return []; }),
        api.getTransactions().catch(e => { console.error('Transactions:', e); return []; })
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
    } catch (e) {
      console.error('fetchAllData error:', e);
    } finally {
      setLoadingData(false);
    }
  }, [isAuthenticated, activeUser]);

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

  const handleAdjustStock = useCallback(async (itemName, location, type, qty, notes) => {
    const match = stock.find(item => item.name === itemName);
    if (!match) return;
    await api.adjustStock(match.id, { location, type, qty, notes });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleUpdateItem = useCallback(async (updatedItem) => {
    const match = stock.find(item => item.name === updatedItem.originalName || item.name === updatedItem.name);
    if (!match) return;
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
    await api.createMaterial(newItem);
    await fetchAllData();
  }, [fetchAllData]);

  const handleDeleteItem = useCallback(async (itemName) => {
    const match = stock.find(item => item.name === itemName);
    if (!match) return;
    await api.deleteMaterial(match.id);
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleProcessPosSales = useCallback(async (mappedSales, filename) => {
    try {
      // mappedSales structure dari PosUpload: [{ recipe_id, qty, price }, ...]
      await api.processPOSSync(mappedSales);
      await fetchAllData();
      showToast('POS data synced successfully & stock deducted.', 'success');
    } catch (error) {
      console.error('POS sync error:', error);
      showToast(error.message || 'Failed to sync POS data', 'error');
      throw error;
    }
  }, [fetchAllData, showToast]);

  const handleSaveRecipe = useCallback(async (updatedRecipe) => {
    const recipeId = updatedRecipe.id;
    if (!recipeId) return;
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
      selling_price: updatedRecipe.selling_price,
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
      selling_price: newRecipe.selling_price,
      ingredients: mappedIngredients
    });
    await fetchAllData();
  }, [stock, fetchAllData]);

  const handleDeleteRecipe = useCallback(async (recipeId) => {
    await api.deleteRecipe(recipeId);
    await fetchAllData();
  }, [fetchAllData]);

  const handleCompleteOpname = useCallback(async (auditLoc, reconciliation, signatureData) => {
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
      signature_svg: signatureData || ''
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

  const handleReceiveInvoice = useCallback(async (invoiceId) => {
    const match = invoices.find(inv => inv.id === invoiceId);
    if (!match) return;
    await api.receiveInvoice(match.id);
    await fetchAllData();
  }, [invoices, fetchAllData]);

  const handleCancelInvoice = useCallback(async (invoiceId) => {
    const match = invoices.find(inv => inv.id === invoiceId);
    if (!match) return;
    await api.updateInvoiceStatus(match.id, 'CANCELLED');
    await fetchAllData();
  }, [invoices, fetchAllData]);

  const value = useMemo(() => ({
    stock,
    recipes,
    transactions,
    invoices,
    loadingData,
    refreshData: fetchAllData,
    showToast,
    currentTenant: activeUser ? { id: activeUser.tenant_id, company_name: activeUser.company_name, name: activeUser.tenant_name } : null,
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
    handleCancelInvoice
  }), [stock, recipes, transactions, invoices, loadingData, fetchAllData, showToast, activeUser, handleAdjustStock, handleUpdateItem, handleAddItem, handleDeleteItem, handleProcessPosSales, handleSaveRecipe, handleAddRecipe, handleDeleteRecipe, handleCompleteOpname, handleCreateInvoice, handleReceiveInvoice, handleCancelInvoice]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
