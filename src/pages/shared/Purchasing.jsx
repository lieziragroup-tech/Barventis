import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Plus, Edit2, Search, Trash2, Calendar, ShoppingCart, User, UploadCloud, Package, CheckCircle2, AlertTriangle, RotateCcw, Save } from 'lucide-react';
import { api } from '../../services/api';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import Pagination from '../../components/shared/Pagination';
import BulkImport from '../../components/BulkImport';
import SwipeableItem from '../../components/shared/SwipeableItem';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import useIsMobile from '../../hooks/useIsMobile';

const formatIDR = (val) => 'Rp ' + Number(val || 0).toLocaleString('id-ID');

const PAGE_SIZE = 15;

export default function Purchasing() {
  const { activeUser } = useAuth();
  const { refreshData } = useData();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('PURCHASES'); // 'PURCHASES', 'SUPPLIERS'

  // Supplier State
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [editingSupplier, setEditSupplier] = useState(null);
  const [selectedSupplierMaterialIds, setSelectedSupplierMaterialIds] = useState([]);
  const [modalMaterialSearch, setModalMaterialSearch] = useState('');
  const [modalMaterialFilter, setModalMaterialFilter] = useState('ALL'); // 'ALL' | 'SELECTED' | 'UNASSIGNED'
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierDrawer, setSupplierDrawer] = useState(null);
  const [drawerDraftMaterialIds, setDrawerDraftMaterialIds] = useState([]);
  const [drawerPOs, setDrawerPOs] = useState([]);
  const [drawerMaterialSearch, setDrawerMaterialSearch] = useState('');
  const [savingDrawerMapping, setSavingDrawerMapping] = useState(false);

  // Double-Check Confirmation Popup Modal State (replaces blocked window.confirm)
  const [doubleCheckModal, setDoubleCheckModal] = useState(null);

  // Materials Master
  const [materials, setMaterials] = useState([]);

  // Purchase Entry history
  const [purchases, setPurchases] = useState([]);
  const [selectedPurchases, setSelectedPurchases] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [historySearchInput, setHistorySearchInput] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [totalNominal, setTotalNominal] = useState(0);
  const [allMatchingIds, setAllMatchingIds] = useState([]);
  const [notification, setNotification] = useState(null);

  // Period Filter
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const periodOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  // --- CART STATES ---
  const [cart, setCart] = useState([]);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Search Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchInputRef = useRef(null);

  // Debounce effects
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) setDebouncedQuery(searchQuery);
    }, 250); // 250ms debounce
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      if (active) {
        setSearch(historySearchInput);
        setPage(1);
      }
    }, 500); // 500ms debounce for API call
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [historySearchInput]);

  // Bulk Import
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showBulkImportPurchases, setShowBulkImportPurchases] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // New Material Modal
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const isMobile = useIsMobile(768);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [newMaterialData, setNewMaterialData] = useState({ name: '', category: 'Bahan Baku Dasar', unit: 'pcs', price: '', min_stock: 15, supplier: '' });

  const fetchHistory = useCallback(async (targetPage, targetSearch, targetPeriod) => {
    setHistoryLoading(true);
    try {
      const { data, totalCount: count, totalNominal: nominal, allMatchingIds: allIds } = await api.getPurchaseEntriesPaged({ page: targetPage, pageSize: PAGE_SIZE, search: targetSearch, period: targetPeriod });
      setPurchases(data);
      setTotalCount(count);
      setTotalNominal(nominal);
      setAllMatchingIds(allIds || []);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const fetchMasterData = async () => {
    setLoading(true);
    try {
      const [supData, matData] = await Promise.all([
        api.getSuppliers(),
        api.getMaterials()
      ]);
      setSuppliers(supData || []);
      setMaterials((matData || []).map(m => {
        const rawSup = String(m.supplier || '').trim();
        return {
          id: m.id,
          name: m.name,
          category: m.category || 'Bahan Baku Dasar',
          unit: m.unit,
          price: m.new_price || m.price || 0,
          supplier: rawSup === '-' ? '' : rawSup
        };
      }));
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, []);

  useEffect(() => {
    fetchHistory(page, search, period);
  }, [page, search, period, fetchHistory]);

  useEffect(() => {
    if (supplierDrawer) {
      api.getInvoicesPaged({ page: 1, pageSize: 5, search: supplierDrawer.name }).then(res => {
        setDrawerPOs(res.data || []);
      });
    }
  }, [supplierDrawer]);

  // Click outside to close dropdown — use mousedown on the wrapper so the
  // dropdown is still alive when any child receives a click event
  useEffect(() => {

    const handleClickOutside = (event) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        // Delay so click handlers inside the dropdown fire first
        setTimeout(() => setShowSearchDropdown(false), 150);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizeSupplierName = useCallback((val) => {
    const s = String(val || '').trim();
    return s === '-' ? '' : s;
  }, []);

  // Helper: check if material belongs to supplier name (case-insensitive, trimmed — identical to PO boundary logic)
  const isMaterialInSupplier = useCallback((materialSupplier, targetSupplierName) => {
    const a = normalizeSupplierName(materialSupplier).toLowerCase();
    const b = normalizeSupplierName(targetSupplierName).toLowerCase();
    return Boolean(a && b && a === b);
  }, [normalizeSupplierName]);

  const openSupplierDrawer = useCallback((supplierObj) => {
    if (!supplierObj) return;
    setDrawerMaterialSearch('');
    setSupplierDrawer(supplierObj);
    const initialIds = materials
      .filter(m => isMaterialInSupplier(m.supplier, supplierObj.name))
      .map(m => m.id);
    setDrawerDraftMaterialIds(initialIds);
  }, [materials, isMaterialInSupplier]);

  const openSupplierModal = (supplierObj = null) => {
    const base = supplierObj
      ? { ...supplierObj }
      : { name: '', phone: '', address: '', contact_person: '' };
    setEditSupplier(base);
    setModalMaterialSearch('');
    setModalMaterialFilter('ALL');
    if (supplierObj?.name) {
      const preselected = materials
        .filter(m => isMaterialInSupplier(m.supplier, supplierObj.name))
        .map(m => m.id);
      setSelectedSupplierMaterialIds(preselected);
    } else {
      setSelectedSupplierMaterialIds([]);
    }
  };

  const toggleMaterialInSupplierModal = (materialId) => {
    setSelectedSupplierMaterialIds(prev =>
      prev.includes(materialId) ? prev.filter(id => id !== materialId) : [...prev, materialId]
    );
  };

  // --- Handlers: Modal Supplier Save (Step 1: Prepare Double-Check -> Step 2: Execute) ---
  const handleSaveSupplier = (e) => {
    e.preventDefault();
    const cleanName = String(editingSupplier?.name || '').trim();
    if (!cleanName) {
      setNotification({ type: 'error', text: 'Nama supplier wajib diisi.' });
      return;
    }

    const originalSupplier = editingSupplier.id
      ? suppliers.find(s => s.id === editingSupplier.id)
      : null;
    const oldName = originalSupplier?.name || editingSupplier.name || '';
    const selectedSet = new Set(selectedSupplierMaterialIds);

    const addedMats = materials.filter(
      m =>
        selectedSet.has(m.id) &&
        !isMaterialInSupplier(m.supplier, cleanName) &&
        !(oldName && isMaterialInSupplier(m.supplier, oldName))
    );
    const removedMats = materials.filter(
      m =>
        !selectedSet.has(m.id) &&
        (isMaterialInSupplier(m.supplier, cleanName) ||
          (oldName && isMaterialInSupplier(m.supplier, oldName)))
    );

    setDoubleCheckModal({
      type: 'SAVE_SUPPLIER_MODAL',
      title: editingSupplier.id ? 'Simpan Perubahan Supplier?' : 'Simpan Supplier Baru?',
      subtitle: '',
      supplierName: cleanName,
      isEdit: Boolean(editingSupplier.id),
      oldName: oldName && oldName !== cleanName ? oldName : null,
      totalSelected: selectedSupplierMaterialIds.length,
      addedMats,
      removedMats
    });
  };

  const executeSaveSupplier = async () => {
    if (!editingSupplier) return;
    const cleanName = String(editingSupplier?.name || '').trim();
    setSavingSupplier(true);
    try {
      const originalSupplier = editingSupplier.id
        ? suppliers.find(s => s.id === editingSupplier.id)
        : null;
      const oldName = originalSupplier?.name || editingSupplier.name || '';

      const saved = await api.saveSupplier({
        ...editingSupplier,
        name: cleanName
      });

      const finalSupplierName = saved?.name || cleanName;
      const selectedSet = new Set(selectedSupplierMaterialIds);

      const toAssign = materials.filter(
        m => selectedSet.has(m.id) && !isMaterialInSupplier(m.supplier, finalSupplierName)
      );
      const toUnassign = materials.filter(
        m =>
          !selectedSet.has(m.id) &&
          (isMaterialInSupplier(m.supplier, finalSupplierName) ||
            (oldName && isMaterialInSupplier(m.supplier, oldName)))
      );

      await Promise.all([
        ...toAssign.map(m => api.updateMaterial(m.id, { supplier: finalSupplierName }, activeUser?.id)),
        ...toUnassign.map(m => api.updateMaterial(m.id, { supplier: '' }, activeUser?.id))
      ]);

      setDoubleCheckModal(null);
      setEditSupplier(null);
      setNotification({
        type: 'success',
        text: `Supplier "${finalSupplierName}" berhasil disimpan (${selectedSupplierMaterialIds.length} bahan).`
      });

      await fetchMasterData();
      if (typeof refreshData === 'function') await refreshData();

      if (supplierDrawer && (supplierDrawer.id === saved?.id || isMaterialInSupplier(supplierDrawer.name, oldName))) {
        setSupplierDrawer(saved);
        setDrawerDraftMaterialIds(Array.from(selectedSet));
      }
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setSavingSupplier(false);
    }
  };

  // --- Handlers: Delete Supplier (Step 1: Prepare Double-Check -> Step 2: Execute) ---
  const handleDeleteSupplier = (supplier) => {
    if (!supplier?.id) return;
    const linkedMats = materials.filter(m => isMaterialInSupplier(m.supplier, supplier.name));
    setDoubleCheckModal({
      type: 'DELETE_SUPPLIER',
      title: `Hapus Supplier "${supplier.name}"?`,
      subtitle: '',
      supplier,
      removedMats: linkedMats
    });
  };

  const executeDeleteSupplier = async (supplier) => {
    if (!supplier?.id) return;
    setSavingSupplier(true);
    setLoading(true);
    try {
      await api.deleteSupplier(supplier.id);
      setDoubleCheckModal(null);
      if (supplierDrawer?.id === supplier.id) {
        setSupplierDrawer(null);
      }
      setNotification({
        type: 'success',
        text: `Supplier "${supplier.name}" berhasil dihapus.`
      });
      await fetchMasterData();
      if (typeof refreshData === 'function') await refreshData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setSavingSupplier(false);
      setLoading(false);
    }
  };

  // --- Handlers: Interactive Staged Material Mapping in Supplier Drawer ---
  const handleStageAssignInDrawer = (material) => {
    if (!material?.id) return;
    setDrawerDraftMaterialIds(prev => (prev.includes(material.id) ? prev : [...prev, material.id]));
    setDrawerMaterialSearch('');
  };

  const handleStageUnassignInDrawer = (materialId) => {
    if (!materialId) return;
    setDrawerDraftMaterialIds(prev => prev.filter(id => id !== materialId));
  };

  const handleUndoUnassignInDrawer = (materialId) => {
    if (!materialId) return;
    setDrawerDraftMaterialIds(prev => (prev.includes(materialId) ? prev : [...prev, materialId]));
  };

  const handleResetDrawerDraft = () => {
    if (!supplierDrawer) return;
    const originalIds = materials
      .filter(m => isMaterialInSupplier(m.supplier, supplierDrawer.name))
      .map(m => m.id);
    setDrawerDraftMaterialIds(originalIds);
  };

  const handlePrepareSaveDrawerMapping = () => {
    if (!supplierDrawer) return;
    const originalIds = materials
      .filter(m => isMaterialInSupplier(m.supplier, supplierDrawer.name))
      .map(m => m.id);
    const draftSet = new Set(drawerDraftMaterialIds);
    const origSet = new Set(originalIds);

    const addedMats = materials.filter(m => draftSet.has(m.id) && !origSet.has(m.id));
    const removedMats = materials.filter(m => origSet.has(m.id) && !draftSet.has(m.id));

    if (addedMats.length === 0 && removedMats.length === 0) {
      setNotification({ type: 'success', text: 'Belum ada perubahan.' });
      return;
    }

    setDoubleCheckModal({
      type: 'SAVE_DRAWER_MAPPING',
      title: 'Simpan Perubahan?',
      subtitle: '',
      supplierName: supplierDrawer.name,
      totalSelected: drawerDraftMaterialIds.length,
      addedMats,
      removedMats
    });
  };

  const executeSaveDrawerMapping = async () => {
    if (!supplierDrawer) return;
    const targetSupplierName = supplierDrawer.name.trim();
    const originalIds = materials
      .filter(m => isMaterialInSupplier(m.supplier, targetSupplierName))
      .map(m => m.id);
    const draftSet = new Set(drawerDraftMaterialIds);
    const origSet = new Set(originalIds);

    const addedMats = materials.filter(m => draftSet.has(m.id) && !origSet.has(m.id));
    const removedMats = materials.filter(m => origSet.has(m.id) && !draftSet.has(m.id));

    setSavingDrawerMapping(true);
    try {
      await Promise.all([
        ...addedMats.map(m => api.updateMaterial(m.id, { supplier: targetSupplierName }, activeUser?.id)),
        ...removedMats.map(m => api.updateMaterial(m.id, { supplier: '' }, activeUser?.id))
      ]);

      setDoubleCheckModal(null);
      setNotification({
        type: 'success',
        text: `Katalog "${targetSupplierName}" tersimpan (+${addedMats.length} / -${removedMats.length}).`
      });

      await fetchMasterData();
      if (typeof refreshData === 'function') await refreshData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setSavingDrawerMapping(false);
    }
  };

  const addToCart = (material) => {
    setCart(prev => [...prev, {
      cart_id: Date.now() + Math.random(),
      request_key: `purchase-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      material_id: material.id,
      name: material.name,
      unit: material.unit,
      qty: '',
      unit_price: material.price || '',
      supplier_id: material.supplier || '',
      date: purchaseDate,
      destination: 'RESTO',
      expiry_date: ''
    }]);
    setSearchQuery('');
    setShowSearchDropdown(false);
  };

  const updateCartItem = (cartId, field, value) => {
    setCart(prev => prev.map(item => item.cart_id === cartId ? { ...item, [field]: value } : item));
  };

  const removeCartItem = (cartId) => {
    setCart(prev => prev.filter(item => item.cart_id !== cartId));
  };
  const removeFromCart = removeCartItem;

  const handlePrepareSavePurchases = () => {
    if (cart.length === 0) return setNotification({ type: 'error', text: 'Keranjang pembelian kosong.' });

    // Validation
    for (const item of cart) {
      if (!item.qty || parseFloat(item.qty) <= 0) return setNotification({ type: 'error', text: `Kuantitas untuk ${item.name} harus lebih dari 0.` });
      if (item.unit_price === '' || parseFloat(item.unit_price) < 0) return setNotification({ type: 'error', text: `Harga untuk ${item.name} tidak valid.` });
      if (!item.date && !purchaseDate) return setNotification({ type: 'error', text: `Tanggal pembelian untuk ${item.name} tidak valid.` });
    }

    setShowConfirmModal(true);
  };

  const handleFinalSavePurchases = async () => {
    const invalidItems = cart.filter(item => isNaN(parseFloat(item.qty)) || parseFloat(item.qty) <= 0 || isNaN(parseFloat(item.unit_price)) || parseFloat(item.unit_price) < 0);
    if (invalidItems.length > 0) {
      return setNotification({ type: 'error', text: 'Terdapat input Kuantitas atau Harga Satuan yang tidak valid (NaN atau <= 0) di keranjang.' });
    }
    setLoading(true);
    try {
      await Promise.all(cart.map(item => api.createPurchaseEntry({
        date: item.date || purchaseDate,
        material_id: item.material_id,
        supplier_id: item.supplier_id || null,
        qty: parseFloat(item.qty),
        unit: item.unit,
        unit_price: parseFloat(item.unit_price),
        notes: `Pembelian Multi-Cart by ${activeUser?.name || 'Sistem'}`,
        destination: item.destination || 'RESTO',
        expiry_date: item.expiry_date || null,
        request_key: item.request_key || String(item.cart_id)
      })));

      setCart([]);
      setShowConfirmModal(false);
      setNotification({ type: 'success', text: `${cart.length} item pembelian tersimpan.` });
      setPage(1);
      fetchHistory(1, search);
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistory = (purchaseId, itemName) => {
    setDoubleCheckModal({
      type: 'DELETE_HISTORY',
      title: 'Hapus Pembelian?',
      subtitle: `Stok "${itemName}" akan dikembalikan otomatis.`,
      purchaseId,
      itemName
    });
  };

  const executeDeleteHistory = async (purchaseId, itemName) => {
    setLoading(true);
    try {
      await api.deletePurchaseEntry(purchaseId);
      setDoubleCheckModal(null);
      setNotification({ type: 'success', text: `Pembelian "${itemName}" berhasil dibatalkan.` });
      fetchHistory(page, search);
      fetchMasterData(); // Refresh current stock levels globally
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteHistory = () => {
    if (selectedPurchases.length === 0) return;
    setDoubleCheckModal({
      type: 'BULK_DELETE_HISTORY',
      title: `Hapus ${selectedPurchases.length} Pembelian?`,
      subtitle: `Stok ${selectedPurchases.length} item terpilih akan dikembalikan.`,
      count: selectedPurchases.length
    });
  };

  const executeBulkDeleteHistory = async () => {
    setLoading(true);
    try {
      const { successCount, failedItems } = await api.bulkDeletePurchaseEntries(selectedPurchases);
      setDoubleCheckModal(null);

      if (failedItems.length === 0) {
        setNotification({ type: 'success', text: `${successCount} data pembelian berhasil dibatalkan.` });
        setSelectedPurchases([]);
      } else {
        setNotification({
          type: 'error',
          text: `${successCount} berhasil dihapus, ${failedItems.length} gagal (contoh: ${failedItems[0].error}). Item yang gagal tetap tercentang agar bisa dicoba lagi.`
        });
        setSelectedPurchases(failedItems.map(f => f.id));
      }
      fetchHistory(page, search);
      fetchMasterData();
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllHistory = (e) => {
    if (e.target.checked) {
      // Pilih HANYA yang ada di halaman saat ini (Current Page)
      setSelectedPurchases(purchases.map(p => p.id));
    } else {
      setSelectedPurchases([]);
    }
  };

  const handleSelectAllMatchedHistory = () => {
    setSelectedPurchases(allMatchingIds);
  };

  const handleSelectHistory = (id) => {
    setSelectedPurchases(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleEditHistory = (p) => {
    setEditingPurchase({
      id: p.id,
      name: p.materials?.name || 'Bahan Baku',
      unit: p.unit || p.materials?.unit || 'unit',
      qty: String(p.qty ?? ''),
      unit_price: String(p.unit_price ?? ''),
      date: p.date || new Date().toISOString().split('T')[0],
      notes: p.notes || ''
    });
  };

  const handleSaveEditHistory = async (e) => {
    e.preventDefault();
    if (!editingPurchase) return;
    const qtyFloat = parseFloat(editingPurchase.qty);
    const priceFloat = parseFloat(editingPurchase.unit_price);
    if (isNaN(qtyFloat) || qtyFloat <= 0) {
      return setNotification({ type: 'error', text: 'Kuantitas harus berupa angka lebih dari 0.' });
    }
    if (isNaN(priceFloat) || priceFloat < 0) {
      return setNotification({ type: 'error', text: 'Harga satuan tidak valid.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editingPurchase.date)) {
      return setNotification({ type: 'error', text: 'Format tanggal harus YYYY-MM-DD.' });
    }

    setLoading(true);
    try {
      await api.editTransactionAndAdjustStock(editingPurchase.id, {
        qty: qtyFloat,
        unit_price: priceFloat,
        notes: editingPurchase.notes,
        date: editingPurchase.date
      });
      setNotification({ type: 'success', text: `Pembelian "${editingPurchase.name}" diperbarui.` });
      setEditingPurchase(null);
      fetchHistory(page, search, period);
      fetchMasterData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const assignedSupplier = normalizeSupplierName(newMaterialData.supplier);
      const payload = {
        name: newMaterialData.name,
        category: newMaterialData.category,
        unit: newMaterialData.unit,
        price: parseFloat(newMaterialData.price) || 0,
        min_stock: parseFloat(newMaterialData.min_stock) || 15,
        supplier: assignedSupplier
      };
      const created = await api.createMaterial(payload);

      // Auto add to cart only when user is on Daily Purchases tab
      if (tab === 'PURCHASES') {
        addToCart({
          id: created.id,
          name: created.name,
          unit: created.unit,
          price: created.price,
          supplier: created.supplier
        });
      }

      if (supplierDrawer && isMaterialInSupplier(assignedSupplier, supplierDrawer.name)) {
        setDrawerDraftMaterialIds(prev => (prev.includes(created.id) ? prev : [...prev, created.id]));
      }

      setShowNewMaterialModal(false);
      setNotification({
        type: 'success',
        text: assignedSupplier
          ? `Bahan "${created.name}" ditambahkan ke "${assignedSupplier}".`
          : `Bahan "${created.name}" ditambahkan.`
      });
      await fetchMasterData();
      if (typeof refreshData === 'function') await refreshData();
    } catch (err) {
      setNotification({ type: 'error', text: err.message });
      setLoading(false); // Reset loading if error, otherwise it resets when fetching
    }
  };

  // FIX 2026-09 (QA finding 3A): jangan pernah export dari `purchases`, karena
  // itu adalah state HALAMAN yang sudah dipaginasi (PAGE_SIZE=15). Export harus
  // menarik ULANG seluruh baris yang cocok dengan filter aktif (search/period)
  // langsung dari server, memakai pageSize besar, supaya jumlah baris yang
  // diekspor selalu sama dengan `totalCount`/`totalNominal` yang tampil di UI.
  const fetchAllForExport = async () => {
    const sizeNeeded = totalCount && totalCount > 0 ? totalCount : 100000;
    const { data } = await api.getPurchaseEntriesPaged({
      page: 1,
      pageSize: sizeNeeded,
      search,
      period
    });
    return data || [];
  };

  const handleExportExcel = async () => {
    try {
      const allRows = await fetchAllForExport();
      if (allRows.length !== totalCount) {
        console.warn(`[Export] Baris tertarik (${allRows.length}) tidak sama dengan totalCount (${totalCount}) — periksa filter/pagination di getPurchaseEntriesPaged.`);
      }
      const rows = allRows.map((p, idx) => ({
        'NO': idx + 1,
        'TANGGAL': p.date,
        'NAMA BAHAN BAKU': p.materials?.name || '-',
        'SUPPLIER': p.suppliers?.name || '-',
        'QTY': p.qty,
        'UNIT': p.unit,
        'HARGA SATUAN': p.unit_price,
        'TOTAL': (parseFloat(p.qty) || 0) * (parseFloat(p.unit_price) || 0)
      }));
      await exportWithAudit({
        format: 'excel',
        filename: `Riwayat_Pembelian_${period || 'Semua'}`,
        sheets: [{ name: 'Pembelian Harian', rows }],
        actionName: 'Purchasing Export',
        role: activeUser?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor data pembelian');
    }
  };

  const handleExportPDF = async () => {
    try {
      const allRows = await fetchAllForExport();
      if (allRows.length !== totalCount) {
        console.warn(`[Export] Baris tertarik (${allRows.length}) tidak sama dengan totalCount (${totalCount}) — periksa filter/pagination di getPurchaseEntriesPaged.`);
      }
      const columns = [
        { key: 'no', label: '#' },
        { key: 'tanggal', label: 'Tanggal' },
        { key: 'bahan', label: 'Nama Bahan Baku' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'qty', label: 'Qty' },
        { key: 'total', label: 'Total' }
      ];
      const rows = allRows.map((p, idx) => ({
        no: idx + 1,
        tanggal: p.date,
        bahan: p.materials?.name || '-',
        supplier: p.suppliers?.name || '-',
        qty: `${p.qty} ${p.unit}`,
        total: `Rp ${((parseFloat(p.qty) || 0) * (parseFloat(p.unit_price) || 0)).toLocaleString('id-ID')}`
      }));
      await exportWithAudit({
        format: 'pdf',
        filename: `Riwayat_Pembelian_${period || 'Semua'}`,
        title: `Log Riwayat Pembelian Harian — Periode: ${period || 'Semua'}`,
        tenantName: 'BARVENTIS - Sistem Manajemen Gudang',
        columns,
        rows,
        actionName: 'Purchasing Export PDF',
        role: activeUser?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error(err);
      alert('Gagal mengekspor PDF pembelian');
    }
  };

  const filteredSearch = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (q === '') return [];
    return materials.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [debouncedQuery, materials]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + ((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0)), 0);
  }, [cart]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Pembelian & Supplier</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Catat pembelian dan kelola supplier.</p>
        </div>
      </div>

      {notification && (
        <div style={{ padding: '14px 20px', borderRadius: 'var(--radius-lg)', marginBottom: '20px', background: notification.type === 'success' ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${notification.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{notification.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)', width: 'fit-content', marginBottom: '20px' }}>
        <button className={`btn ${tab === 'PURCHASES' ? 'btn-primary' : ''}`} style={{ background: tab === 'PURCHASES' ? '' : 'transparent', color: tab === 'PURCHASES' ? '' : 'var(--text-secondary)' }} onClick={() => setTab('PURCHASES')}>Pembelian Harian</button>
        <button className={`btn ${tab === 'SUPPLIERS' ? 'btn-primary' : ''}`} style={{ background: tab === 'SUPPLIERS' ? '' : 'transparent', color: tab === 'SUPPLIERS' ? '' : 'var(--text-secondary)' }} onClick={() => setTab('SUPPLIERS')}>Daftar Supplier</button>
      </div>

      {tab === 'SUPPLIERS' && (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>Daftar Supplier</h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0 }}>
                Kelola kontak dan bahan supplier.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>
                <UploadCloud size={16} style={{ marginRight: '8px' }}/> Import Excel
              </button>
              <button className="btn btn-primary" onClick={() => openSupplierModal(null)}>
                <Plus size={16} style={{ marginRight: '8px' }}/> Tambah Supplier
              </button>
            </div>
          </div>

          {/* Filter & Summary Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '420px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '36px' }}
                placeholder="Cari supplier, kontak, atau bahan..."
                value={supplierSearch}
                onChange={e => setSupplierSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.82rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>Total Supplier: <strong style={{ color: 'var(--text-primary)' }}>{suppliers.length}</strong></span>
              <span>•</span>
              <span>
                Bahan Terdaftar: <strong style={{ color: 'var(--accent)' }}>{materials.filter(m => Boolean(normalizeSupplierName(m.supplier))).length}</strong> / {materials.length} Bahan
              </span>
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Nama Supplier</th>
                  <th>Kontak & Telepon</th>
                  <th>Alamat</th>
                  <th>Bahan Terdaftar</th>
                  <th style={{ width: '190px', textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {suppliers
                  .filter(s => {
                    const q = supplierSearch.trim().toLowerCase();
                    if (!q) return true;
                    const linkedMats = materials.filter(m => isMaterialInSupplier(m.supplier, s.name));
                    return (
                      (s.name || '').toLowerCase().includes(q) ||
                      (s.contact_person || '').toLowerCase().includes(q) ||
                      (s.phone || '').toLowerCase().includes(q) ||
                      linkedMats.some(m => (m.name || '').toLowerCase().includes(q))
                    );
                  })
                  .map(s => {
                    const supplierMats = materials.filter(m => isMaterialInSupplier(m.supplier, s.name));
                    return (
                      <tr
                        key={s.id}
                        onClick={(e) => {
                          if (!e.target.closest('button')) {
                            openSupplierDrawer(s);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.95rem' }}>{s.name}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.contact_person || '-'}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{s.phone || '-'}</div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '220px' }}>
                          {s.address || '-'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '3px 10px',
                                  borderRadius: '6px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  background: supplierMats.length > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                  color: supplierMats.length > 0 ? 'var(--success)' : 'var(--warning)',
                                  border: `1px solid ${supplierMats.length > 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`
                                }}
                              >
                                <Package size={13} />
                                {supplierMats.length > 0 ? `${supplierMats.length} Bahan` : 'Belum diatur'}
                              </span>
                            </div>
                            {supplierMats.length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {supplierMats.slice(0, 3).map(m => (
                                  <span
                                    key={m.id}
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      background: 'var(--bg-tertiary)',
                                      color: 'var(--text-secondary)',
                                      border: '1px solid var(--border)'
                                    }}
                                  >
                                    {m.name}
                                  </span>
                                ))}
                                {supplierMats.length > 3 && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                                    +{supplierMats.length - 3} lainnya
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '5px 10px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="Cek & Kelola Daftar Bahan Supplier"
                              onClick={() => openSupplierDrawer(s)}
                            >
                              <Package size={14} /> Kelola Bahan
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '6px', color: 'var(--accent)', background: 'var(--bg-tertiary)' }}
                              title="Edit Supplier & Pemetaan Bahan"
                              onClick={() => openSupplierModal(s)}
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn"
                              style={{ padding: '6px', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.08)' }}
                              title="Hapus Supplier"
                              onClick={() => handleDeleteSupplier(s)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '28px', color: 'var(--text-secondary)' }}>
                      Belum ada data supplier. Klik <strong>+ Tambah Supplier</strong> untuk menambahkan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'PURCHASES' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Top Form: Cart & Search */}
          <div className="glass-card no-print" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '20px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Keranjang Pembelian</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cari bahan, atur jumlah dan harga.</p>
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setShowBulkImportPurchases(true)}>
                  <UploadCloud size={16} style={{ marginRight: '8px' }}/> Import Excel
                </button>
              </div>

              {/* Global Cart Info (Date & Recorder) */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <User size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Oleh: <strong style={{ color: 'var(--text-primary)' }}>{activeUser?.name || '-'}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <Calendar size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Tanggal:</span>
                  <input
                    type="date"
                    className="form-control"
                    style={{ padding: '2px 6px', height: 'auto', background: 'transparent', border: 'none', width: '130px', fontWeight: 600 }}
                    value={purchaseDate}
                    onChange={e => setPurchaseDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Smart Search Bar */}
            <div style={{ position: 'relative', marginBottom: '24px', zIndex: 10 }}>
              <div style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="form-control"
                  style={{ padding: '14px 16px 14px 44px', fontSize: '1rem', background: 'var(--bg-tertiary)', borderColor: showSearchDropdown ? 'var(--accent)' : 'var(--border)' }}
                  placeholder="Cari nama bahan baku..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                  }}
                  onFocus={() => setShowSearchDropdown(true)}
                />
              </div>

              {/* Dropdown Results */}
              {showSearchDropdown && searchQuery.trim() !== '' && (
                <div className="glass-card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', padding: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: '1px solid var(--border-focus)' }}>
                  {filteredSearch.length > 0 ? (
                    filteredSearch.map(m => (
                      <div
                        key={m.id}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        onClick={() => addToCart(m)}
                      >
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tap untuk tambah</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Bahan "{searchQuery}" tidak ditemukan.
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '4px' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', color: 'var(--accent)', border: 'none', background: 'transparent' }}
                      onClick={() => {
                        setNewMaterialData({ ...newMaterialData, name: searchQuery });
                        setShowSearchDropdown(false);
                        setShowNewMaterialModal(true);
                      }}
                    >
                      <Plus size={16} style={{ marginRight: '6px' }} /> Tambah "{searchQuery}" ke Master Data
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cart Table */}
            <div className="table-container" style={{ minHeight: '150px' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Bahan Baku</th>
                    <th style={{ width: '120px' }}>Supplier</th>
                    <th style={{ width: '130px' }}>Expired (FEFO)</th>
                    <th style={{ width: '130px' }}>Tanggal</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Qty</th>
                    <th style={{ width: '60px' }}>Unit</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Harga Satuan</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Total Harga</th>
                    <th style={{ width: '50px', textAlign: 'center' }}>Hapus</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <React.Fragment key={item.cart_id}>
                      {!isMobile ? (
                        <tr>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td>
                            <select
                              className="form-control"
                              style={{ padding: '6px 8px', fontSize: '0.8rem' }}
                              value={item.supplier_id}
                              onChange={(e) => updateCartItem(item.cart_id, 'supplier_id', e.target.value)}
                            >
                              <option value="">(Tunai / Tidak ada)</option>
                              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                          <td>
                            <input
                              type="date"
                              className="form-control"
                              style={{ padding: '6px 8px', fontSize: '0.8rem', borderColor: !item.expiry_date ? 'var(--danger)' : 'var(--border)' }}
                              value={item.expiry_date}
                              onChange={(e) => updateCartItem(item.cart_id, 'expiry_date', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              className="form-control text-right"
                              style={{ width: '80px', padding: '6px 8px' }}
                              value={item.qty === 0 ? '' : item.qty}
                              onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)}
                            />
                          </td>
                          <td>{item.unit}</td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              className="form-control text-right"
                              style={{ width: '120px', padding: '6px 8px' }}
                              value={item.unit_price === 0 ? '' : item.unit_price}
                              onChange={(e) => updateCartItem(item.cart_id, 'unit_price', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {formatIDR(item.qty * item.unit_price)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn" style={{ padding: '4px', color: 'var(--danger)' }} onClick={() => removeFromCart(item.cart_id)}>
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr>
                          <td colSpan="8" style={{ padding: 0 }}>
                            <SwipeableItem onDelete={() => removeFromCart(item.cart_id)}>
                              <div className="p-3 bg-white border-b border-gray-100 flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                  <div className="font-bold text-sm">{item.name} <span className="font-normal text-xs text-gray-500">({item.unit})</span></div>
                                  <div className="font-bold text-primary">{formatIDR(item.qty * item.unit_price)}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                  <div>
                                    <label className="text-[10px] text-gray-500">Qty</label>
                                    <input type="number" className="form-control text-sm py-1 px-2" value={item.qty} onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)} />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-gray-500">Harga Satuan</label>
                                    <input type="number" className="form-control text-sm py-1 px-2" value={item.unit_price} onChange={(e) => updateCartItem(item.cart_id, 'unit_price', e.target.value)} />
                                  </div>
                                  <div className="col-span-2">
                                    <label className="text-[10px] text-red-500 font-bold">Expired Date (FEFO)</label>
                                    <input type="date" className="form-control text-sm py-1 px-2 border-red-300" value={item.expiry_date} onChange={(e) => updateCartItem(item.cart_id, 'expiry_date', e.target.value)} />
                                  </div>
                                </div>
                              </div>
                            </SwipeableItem>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {cart.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                        <ShoppingCart size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                        <div>Keranjang kosong. Cari bahan baku di atas.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
                {cart.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 700 }}>Total Estimasi Pembelian:</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--success)', fontSize: '1.1rem' }}>
                        Rp {cartTotal.toLocaleString('id-ID')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                className="btn btn-primary"
                style={{ display: 'flex', gap: '8px', padding: '12px 24px', fontSize: '0.95rem' }}
                onClick={handlePrepareSavePurchases}
                disabled={loading || cart.length === 0}
              >
                <ShoppingCart size={18} /> {loading ? 'Menyimpan...' : `Simpan (${cart.length} Item)`}
              </button>
            </div>
          </div>

          {/* History Panel */}
          <div className="glass-card purchasing-history-panel" style={{ padding: '24px' }}>
            <div className="paged-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Riwayat Pembelian</h3>
              <ExportButton 
                onExportExcel={handleExportExcel} 
                onExportPDF={handleExportPDF}
                currentRole={activeUser?.role || 'SuperAdmin'}
              />
              <PrintButton
                currentRole={activeUser?.role || 'SuperAdmin'}
                title="Cetak log riwayat pembelian"
              />
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Periode:</span>
                  <select
                    className="form-control"
                    style={{ padding: '6px 12px', fontSize: '0.85rem', width: '150px' }}
                    value={period}
                    onChange={e => { setPeriod(e.target.value); setPage(1); }}
                  >
                    <option value="">Semua Waktu</option>
                    {periodOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ position: 'relative', width: '250px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Cari histori (bahan/supplier)..."
                    style={{ paddingLeft: '36px' }}
                    value={historySearchInput}
                    onChange={e => setHistorySearchInput(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {/* Print-only Document Header */}
            <div className="print-only print-header">
              <div className="print-header-brand">BARVENTIS — SISTEM MANAJEMEN GUDANG</div>
              <div style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>Log Riwayat Pembelian Bahan Baku</div>
              <div className="print-header-meta">
                Periode: {period || 'Semua Waktu'} | Pencarian: {historySearchInput || 'Semua'} | Tanggal Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
              </div>
            </div>

            <div className="table-container relative">
              <TableLoadingOverlay loading={historyLoading && purchases.length > 0} message="Menyinkronkan riwayat pembelian..." />
              {selectedPurchases.length > 0 && (
                <div style={{ padding: '8px 12px', background: 'var(--danger)', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedPurchases.length} item terpilih</span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {allMatchingIds.length > purchases.length && selectedPurchases.length > 0 && selectedPurchases.length < allMatchingIds.length && (
                      <button className="btn" style={{ background: 'transparent', color: 'white', padding: '4px 12px', fontSize: '0.8rem', border: 'none', textDecoration: 'underline' }} onClick={handleSelectAllMatchedHistory}>
                        Pilih semua {allMatchingIds.length} item di filter ini
                      </button>
                    )}
                    <button className="btn" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '4px 12px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.3)' }} onClick={handleBulkDeleteHistory} disabled={loading}>
                      <Trash2 size={14} style={{ marginRight: '6px' }}/> Hapus Terpilih
                    </button>
                  </div>
                </div>
              )}
              <table className="custom-table" style={selectedPurchases.length > 0 ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : {}}>
                <thead>
                  <tr>
                    <th className="no-print" style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={purchases.length > 0 && purchases.every(p => selectedPurchases.includes(p.id))}
                        onChange={handleSelectAllHistory}
                      />
                    </th>
                    <th>Tanggal Input</th>
                    <th>Nama Bahan Baku</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th className="no-print" style={{ textAlign: 'center', width: '60px' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading && purchases.length === 0 ? (
                    <TableSkeletonRows
                      rows={6}
                      columns={[
                        { width: '40px', type: 'checkbox' },
                        { width: '120px', type: 'text' },
                        { width: '220px', type: 'text' },
                        { width: '160px', type: 'text' },
                        { width: '90px', type: 'text', align: 'right' },
                        { width: '120px', type: 'text', align: 'right' },
                        { width: '60px', type: 'actions' }
                      ]}
                    />
                  ) : (
                    purchases.map(p => (
                      <tr key={p.id} style={{ background: selectedPurchases.includes(p.id) ? 'var(--bg-tertiary)' : 'transparent' }}>
                        <td className="no-print" style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedPurchases.includes(p.id)}
                            onChange={() => handleSelectHistory(p.id)}
                          />
                        </td>
                        <td>{p.date}</td>
                        <td style={{ fontWeight: 600 }}>{p.materials?.name}</td>
                        <td style={{ fontSize: '0.85rem' }}>{p.suppliers?.name || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{p.qty} {p.unit}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>Rp {((parseFloat(p.qty) || 0) * (parseFloat(p.unit_price) || 0)).toLocaleString('id-ID')}</td>
                        <td className="no-print" style={{ textAlign: 'center' }}>
                          {p.materials ? (
                            <>
                              <button className="btn" style={{ padding: '4px', color: 'var(--accent)', background: 'transparent', marginRight: '4px' }} onClick={() => handleEditHistory(p)}>
                                <Edit2 size={16} />
                              </button>
                              <button className="btn" style={{ padding: '4px', color: 'var(--danger)', background: 'transparent' }} onClick={() => handleDeleteHistory(p.id, p.materials?.name)}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No Action</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  {purchases.length === 0 && !historyLoading && <tr><td colSpan="7" style={{ textAlign: 'center' }}>{search ? 'Tidak ada hasil untuk pencarian ini.' : 'Belum ada data pembelian harian.'}</td></tr>}
                </tbody>
                {purchases.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                      <td colSpan="5" style={{ textAlign: 'right', fontWeight: 700 }}>Total Nominal Keseluruhan:</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                        Rp {totalNominal.toLocaleString('id-ID')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalCount={totalCount}
              onPageChange={setPage}
              itemLabel="pembelian"
              loading={historyLoading}
            />
          </div>
        </div>
      )}

      {/* Edit Purchase History Modal (Single-Screen Replacement for 4 sequential prompts) */}
      {editingPurchase && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => !loading && setEditingPurchase(null)}
        >
          <div
            className="glass-card modal-card"
            style={{ width: '440px', maxWidth: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '4px' }}>
              Edit Riwayat Pembelian
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              {editingPurchase.name} ({editingPurchase.unit})
            </p>
            <form onSubmit={handleSaveEditHistory} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Kuantitas ({editingPurchase.unit}) *</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    className="form-control"
                    value={editingPurchase.qty}
                    onChange={e => setEditingPurchase({ ...editingPurchase, qty: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Harga Satuan (Rp) *</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    className="form-control"
                    value={editingPurchase.unit_price}
                    onChange={e => setEditingPurchase({ ...editingPurchase, unit_price: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Tanggal Pembelian *</label>
                <input
                  type="date"
                  required
                  className="form-control"
                  value={editingPurchase.date}
                  onChange={e => setEditingPurchase({ ...editingPurchase, date: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Catatan Revisi</label>
                <input
                  type="text"
                  className="form-control"
                  value={editingPurchase.notes}
                  onChange={e => setEditingPurchase({ ...editingPurchase, notes: e.target.value })}
                  placeholder="Catatan tambahan..."
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingPurchase(null)} disabled={loading}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Modal (Add / Edit + Material Mapping for PO Validation) */}
      {editingSupplier && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => !savingSupplier && setEditSupplier(null)}
        >
          <div
            className="glass-card modal-card"
            style={{ width: '680px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', overflowY: 'auto', padding: '24px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
                  {editingSupplier.id ? 'Edit Supplier' : 'Tambah Supplier'}
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Atur profil dan bahan milik supplier.
                </p>
              </div>
              <button type="button" className="btn" onClick={() => !savingSupplier && setEditSupplier(null)} style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <form onSubmit={handleSaveSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Nama Supplier *</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="Contoh: PT. Indofood Sukses"
                    value={editingSupplier.name}
                    onChange={e => setEditSupplier({ ...editingSupplier, name: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Contact Person (PIC)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Contoh: Budi Santoso"
                    value={editingSupplier.contact_person || ''}
                    onChange={e => setEditSupplier({ ...editingSupplier, contact_person: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">No. Telepon / WhatsApp</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Contoh: 08123456789"
                    value={editingSupplier.phone || ''}
                    onChange={e => setEditSupplier({ ...editingSupplier, phone: e.target.value })}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Alamat</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Alamat lengkap supplier..."
                    value={editingSupplier.address || ''}
                    onChange={e => setEditSupplier({ ...editingSupplier, address: e.target.value })}
                  />
                </div>
              </div>

              {/* Pemetaan Daftar Bahan / Material Spesifik Supplier */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  background: 'var(--bg-tertiary)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Package size={16} style={{ color: 'var(--accent)' }} />
                      Daftar Bahan Supplier
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Pilih bahan yang disediakan supplier ini.
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      background: 'rgba(16, 185, 129, 0.14)',
                      color: 'var(--success)'
                    }}
                  >
                    {selectedSupplierMaterialIds.length} Bahan Terpilih
                  </span>
                </div>

                {/* Search & Filter Tabs for Materials */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-control"
                      style={{ paddingLeft: '32px', paddingTop: '6px', paddingBottom: '6px', fontSize: '0.84rem' }}
                      placeholder="Cari nama bahan baku..."
                      value={modalMaterialSearch}
                      onChange={e => setModalMaterialSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[
                      { id: 'ALL', label: `Semua (${materials.length})` },
                      { id: 'SELECTED', label: `Terpilih (${selectedSupplierMaterialIds.length})` },
                      { id: 'UNASSIGNED', label: 'Belum Ada Supplier' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        className="btn"
                        style={{
                          padding: '5px 10px',
                          fontSize: '0.76rem',
                          background: modalMaterialFilter === f.id ? 'var(--accent)' : 'var(--bg-primary)',
                          color: modalMaterialFilter === f.id ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid var(--border)'
                        }}
                        onClick={() => setModalMaterialFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Checklist Box */}
                <div
                  style={{
                    maxHeight: '230px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-primary)',
                     divideY: '1px solid var(--border-light)'
                  }}
                >
                  {(() => {
                    const q = modalMaterialSearch.trim().toLowerCase();
                    const filteredMats = materials.filter(m => {
                      const cleanSup = normalizeSupplierName(m.supplier);
                      const matchesText = !q || (m.name || '').toLowerCase().includes(q) || cleanSup.toLowerCase().includes(q);
                      if (!matchesText) return false;
                      if (modalMaterialFilter === 'SELECTED') return selectedSupplierMaterialIds.includes(m.id);
                      if (modalMaterialFilter === 'UNASSIGNED') return !cleanSup;
                      return true;
                    });

                    if (filteredMats.length === 0) {
                      return (
                        <div style={{ padding: '18px', textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                          Tidak ada bahan baku yang cocok dengan filter pencarian.
                        </div>
                      );
                    }

                    return filteredMats.map(m => {
                      const isChecked = selectedSupplierMaterialIds.includes(m.id);
                      const currentSup = normalizeSupplierName(m.supplier);
                      const belongsToOther =
                        currentSup &&
                        !isMaterialInSupplier(currentSup, editingSupplier.name) &&
                        !(editingSupplier.id && isMaterialInSupplier(currentSup, suppliers.find(s => s.id === editingSupplier.id)?.name));

                      return (
                        <label
                          key={m.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--border-light)',
                            cursor: 'pointer',
                            background: isChecked ? 'rgba(16, 185, 129, 0.07)' : 'transparent'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleMaterialInSupplierModal(m.id)}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                                {m.name} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({m.unit})</span>
                              </div>
                              {belongsToOther && (
                                <div style={{ fontSize: '0.73rem', color: 'var(--warning)' }}>
                                  Saat ini terdaftar di: <strong>{currentSup}</strong> {isChecked ? '→ Akan dipindahkan ke supplier ini' : ''}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            Rp {Number(m.price || 0).toLocaleString('id-ID')} / {m.unit}
                          </div>
                        </label>
                      );
                    });
                  })()}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setEditSupplier(null)}
                  disabled={savingSupplier}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={savingSupplier}
                >
                  {savingSupplier ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Material Modal */}
      {showNewMaterialModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowNewMaterialModal(false)}>
          <div className="glass-card modal-card" style={{ width: '420px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>Tambah Bahan Baru</h3>
            <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Nama Bahan</label>
                <input type="text" required className="form-control" value={newMaterialData.name} onChange={e => setNewMaterialData({...newMaterialData, name: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Supplier (Opsional)</label>
                <select
                  className="form-control"
                  value={newMaterialData.supplier || ''}
                  onChange={e => setNewMaterialData({ ...newMaterialData, supplier: e.target.value })}
                >
                  <option value="">-- Tanpa Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <select className="form-control" required value={newMaterialData.category} onChange={e => setNewMaterialData({...newMaterialData, category: e.target.value})}>
                  <option value="Bahan Baku Dasar">Bahan Baku Dasar</option>
                  <option value="Packaging">Packaging</option>
                  <option value="Syrup & Flavor">Syrup & Flavor</option>
                  <option value="Dairy & Milk">Dairy & Milk</option>
                  <option value="Coffee Beans">Coffee Beans</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Satuan (Unit)</label>
                  <input type="text" required className="form-control" placeholder="Contoh: pcs, kg, ltr" value={newMaterialData.unit} onChange={e => setNewMaterialData({...newMaterialData, unit: e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Minimal Stok</label>
                  <input type="number" required className="form-control" value={newMaterialData.min_stock} onChange={e => setNewMaterialData({...newMaterialData, min_stock: e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Harga Estimasi (Opsional)</label>
                <input type="number" className="form-control" value={newMaterialData.price} onChange={e => setNewMaterialData({...newMaterialData, price: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewMaterialModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="suppliers"
        title="Import Data Supplier"
        description="Unggah data supplier dari file Excel."
        currentData={[]}
        expectedColumns={[
          { key: 'name', label: 'NAMA SUPPLIER', required: true, type: 'string', sample: 'PT. Supplier Abadi', description: 'Nama supplier (wajib)' },
          { key: 'contact_person', label: 'KONTAK', required: false, type: 'string', sample: 'Budi Santoso', description: 'Nama PIC/Kontak person' },
          { key: 'phone', label: 'NO HP', required: false, type: 'string', sample: '08123456789', description: 'Nomor telepon/WA' },
          { key: 'address', label: 'ALAMAT', required: false, type: 'string', sample: 'Jl. Sudirman No.123, Jakarta', description: 'Alamat lengkap supplier' }
        ]}
        onCommit={async (rows) => {
          let success = 0;
          let failed = 0;
          const errors = [];

          for (const row of rows) {
            const name = row.name || row['NAMA SUPPLIER'];
            if (!name) {
              failed++;
              errors.push({ row: 'Baris Kosong', error: 'Nama supplier tidak boleh kosong' });
              continue;
            }
            try {
              await api.saveSupplier({
                name: name,
                contact_person: row.contact_person || row['KONTAK'] || '',
                phone: row.phone || row['NO HP'] || '',
                address: row.address || row['ALAMAT'] || ''
              });
              success++;
            } catch (err) {
              console.warn("Failed to import supplier:", err);
              failed++;
              errors.push({ row: name, error: err.message || 'Gagal menyimpan ke database' });
            }
          }

          fetchMasterData();
          return { success, failed, errors };
        }}
      />

      {/* Bulk Import Purchases Modal */}
      <BulkImport
        isOpen={showBulkImportPurchases}
        onClose={() => setShowBulkImportPurchases(false)}
        type="materials"
        title="Import Pembelian Harian"
        description="Unggah data pembelian dari file Excel."
        currentData={[]}
        onRegisterMissing={async (missingItems) => {
          // Layer 2: Daftarkan semua missing items ke master data secara batch.
          // Item akan dibuat dengan data minimal dari Excel (name, unit, price).
          // Owner bisa update detail (kategori, min_stock, dll) nanti di Stock Ledger.
          const created = [];
          for (const item of missingItems) {
            const newMat = await api.createMaterial({
              name: item.name,
              unit: item.unit || 'pcs',
              price: item.price || 0,
              category: 'Bahan Baku',
              supplier: '',
              full_pack: 1,
              min_stock: 15
            });
            created.push(newMat);
          }
          // Refresh materials state agar fuzzy match pada retry bisa menemukan item baru.
          // Format sama dengan load awal di useEffect (map ke { id, name, unit, price })
          const freshMaterials = await api.getMaterials();
          setMaterials((freshMaterials || []).map(m => ({ id: m.id, name: m.name, unit: m.unit, price: m.new_price || 0, supplier: m.supplier })));
          return created;
        }}
        expectedColumns={[
          { key: 'tanggal', label: 'TANGGAL', required: false, type: 'date', sample: '2026-08-30', description: 'Tanggal pembelian' },
          { key: 'material_name', label: 'NAMA ITEM', labels: ['NAMA ITEM', 'NAMA BAHAN'], required: true, type: 'string', sample: 'Kopi Arabica', description: 'Nama bahan baku (harus persis sama)' },
          { key: 'qty', label: 'QTY', required: true, type: 'number', sample: 5, description: 'Jumlah yang dibeli' },
          { key: 'unit', label: 'Unit', required: false, type: 'string', sample: 'kg', description: 'Satuan barang' },
          { key: 'unit_price', label: 'HARGA/KG', labels: ['HARGA/KG', 'HARGA/UNIT', 'HARGA SATUAN'], required: true, type: 'number', sample: 150000, description: 'Harga per satuan (tanpa titik/koma)' },
          { key: 'supplier_name', label: 'SUPPLIER', labels: ['SUPPLIER', 'NAMA SUPPLIER'], required: false, type: 'string', sample: 'Supplier A', description: 'Nama supplier (opsional)' },
        ]}
        onCommit={async (rows) => {
          let success = 0;
          let failed = 0;
          const errors = [];
          const warnings = [];

          // ─── LAYER 1: Fuzzy Match Helper ─────────────────────────────────────────
          // Hitung similarity antara dua string (0-1).
          // Menggunakan bigram overlap agar tahan terhadap typo minor,
          // perbedaan spasi, dan variasi kapitalisasi.
          const getBigrams = (str) => {
            const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
            const bigrams = new Set();
            for (let i = 0; i < s.length - 1; i++) bigrams.add(s.slice(i, i + 2));
            return bigrams;
          };
          const similarity = (a, b) => {
            const ba = getBigrams(a);
            const bb = getBigrams(b);
            if (ba.size === 0 || bb.size === 0) return 0;
            let intersection = 0;
            ba.forEach(g => { if (bb.has(g)) intersection++; });
            return (2 * intersection) / (ba.size + bb.size);
          };

          // Cari material: exact first, lalu fuzzy (≥0.70 = auto-map, ≥0.50 = auto-map + warning)
          const findMaterial = (name) => {
            const exact = materials.find(m => m.name.toLowerCase() === name.toLowerCase());
            if (exact) return { material: exact, matched: 'exact' };

            let best = null, bestScore = 0;
            materials.forEach(m => {
              const s = similarity(m.name, name);
              if (s > bestScore) { bestScore = s; best = m; }
            });
            if (best && bestScore >= 0.70) return { material: best, matched: 'fuzzy-high', score: bestScore };
            if (best && bestScore >= 0.50) return { material: best, matched: 'fuzzy-low', score: bestScore };
            return { material: null, matched: 'none' };
          };
          // ─────────────────────────────────────────────────────────────────────────

          // Parse tanggal helper (reused for firstValidDate + per-row)
          const parseExcelDate = (d) => {
            if (!d) return null;
            if (!isNaN(d) && typeof d === 'number')
              return new Date(Math.round((d - 25569) * 86400 * 1000)).toISOString().split('T')[0];
            if (typeof d === 'string' && (d.includes('/') || d.includes('-'))) {
              const parts = d.split(/[/-]/);
              if (parts.length === 3) {
                if (parts[2].length === 4) // DD/MM/YYYY
                  return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString().split('T')[0];
                return new Date(d).toISOString().split('T')[0];
              }
            }
            if (typeof d === 'string' && !isNaN(Date.parse(d)))
              return new Date(d).toISOString().split('T')[0];
            return null;
          };

          let firstValidDate = null;
          for (const row of rows) {
            firstValidDate = parseExcelDate(row.tanggal || row['TANGGAL']);
            if (firstValidDate && !isNaN(new Date(firstValidDate).getTime())) break;
          }
          if (firstValidDate && !isNaN(new Date(firstValidDate).getTime()))
            setPurchaseDate(firstValidDate);

          // ─── LAYER 2: Kumpulkan item yang belum di master data ────────────────────
          // Jika tidak ada match sama sekali (bahkan fuzzy), kumpulkan untuk
          // ditawarkan ke user via "Register & Retry" di BulkImport modal.
          const missingItems = new Map(); // key: lowerCaseName, val: { name, unit, price }
          // ─────────────────────────────────────────────────────────────────────────

          for (const row of rows) {
            const rawDate = row.tanggal || row['TANGGAL'];
            const rowDate = (() => {
              const parsed = parseExcelDate(rawDate);
              return parsed && !isNaN(new Date(parsed).getTime()) ? parsed : purchaseDate;
            })();

            const materialName = row.material_name || row['NAMA ITEM'] || row['NAMA BAHAN'];
            const qty = parseFloat(row.qty || row['QTY'] || 0);
            const unitPrice = parseFloat(row.unit_price || row['HARGA/KG'] || row['HARGA/UNIT'] || row['HARGA SATUAN'] || 0);
            const supplierName = row.supplier_name || row['SUPPLIER'] || row['NAMA SUPPLIER'] || '';
            const unitLabel = row.unit || row['Unit'] || '';

            if (!materialName) {
              failed++;
              errors.push({ row: 'Baris Kosong', error: 'Nama bahan kosong/tidak ditemukan di excel' });
              continue;
            }
            if (qty <= 0) {
              failed++;
              errors.push({ row: materialName, error: 'Qty harus lebih dari 0' });
              continue;
            }
            if (unitPrice < 0) {
              failed++;
              errors.push({ row: materialName, error: 'Harga satuan tidak valid' });
              continue;
            }

            // LAYER 1: Coba exact + fuzzy match
            const { material, matched, score } = findMaterial(materialName);

            if (!material) {
              // LAYER 2: Tidak ada match → kumpulkan untuk Register & Retry
              failed++;
              errors.push({ row: materialName, error: 'Bahan baku belum terdaftar di Master Data' });
              const key = materialName.toLowerCase();
              if (!missingItems.has(key)) {
                missingItems.set(key, {
                  name: materialName,
                  unit: unitLabel || 'pcs',
                  price: unitPrice,
                  category: 'Bahan Baku'
                });
              }
              continue;
            }

            // Fuzzy match dengan confidence rendah → tetap lolos tapi beri warning
            if (matched === 'fuzzy-high') {
              warnings.push(`"${materialName}" dicocokkan otomatis ke "${material.name}" (kemiripan: ${Math.round(score * 100)}%)`);
            } else if (matched === 'fuzzy-low') {
              warnings.push(`"${materialName}" dicocokkan ke "${material.name}" (kemiripan: ${Math.round(score * 100)}%) — harap verifikasi`);
            }

            let supplier_id = '';
            if (supplierName) {
              const supplier = suppliers.find(s => s.name.toLowerCase() === supplierName.toLowerCase());
              if (supplier) supplier_id = supplier.id;
            }

            setCart(prev => [...prev, {
              cart_id: Date.now() + Math.random(),
              request_key: `purchase-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
              material_id: material.id,
              name: material.name,
              unit: unitLabel || material.unit,
              qty: qty,
              unit_price: unitPrice,
              supplier_id: supplier_id,
              date: rowDate,
              destination: 'RESTO'
            }]);
            success++;
          }

          // Kirim missingItems ke BulkImport untuk flow Register & Retry
          return {
            success, failed, errors, warnings,
            missingItems: missingItems.size > 0 ? Array.from(missingItems.values()) : []
          };
        }}
      />

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Konfirmasi Pembelian</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Tinjau rincian pembelian sebelum disimpan.
            </p>
            
            <div className="table-container" style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
              <table className="custom-table" style={{ fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Bahan Baku</th>
                    <th style={{ width: '130px' }}>Tanggal</th>
                    <th style={{ width: '150px' }}>Kuantitas</th>
                    <th style={{ width: '200px' }}>Harga Satuan</th>
                    <th style={{ textAlign: 'right' }}>Total (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                      <React.Fragment key={item.cart_id}>
                      <SwipeableItem onDelete={() => removeFromCart(item.cart_id)}>
                        <tr className="block md:table-row bg-white border-b">

                      <td style={{ fontWeight: 600 }}>{item.name} <br/><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{suppliers.find(s => s.id === item.supplier_id)?.name || 'Tanpa Supplier'}</span></td>
                      <td style={{ display: 'flex', gap: '4px' }}>
                        <input type="date" className="form-control" style={{ padding: '4px', fontSize: '0.85rem', width: '110px' }} value={item.date || purchaseDate} onChange={(e) => updateCartItem(item.cart_id, 'date', e.target.value)} />
                        <select className="form-control" style={{ padding: '4px', fontSize: '0.85rem', width: '90px' }} value={item.destination || 'RESTO'} onChange={(e) => updateCartItem(item.cart_id, 'destination', e.target.value)}>
                          <option value="RESTO">RESTO</option>
                          <option value="CENTRAL">CENTRAL</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input type="number" step="any" min="0" className="form-control" style={{ width: '80px', padding: '4px' }} value={item.qty} onChange={(e) => updateCartItem(item.cart_id, 'qty', e.target.value)} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.unit}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Rp</span>
                          <input type="number" step="any" min="0" className="form-control" style={{ paddingLeft: '32px', paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px' }} value={item.unit_price} onChange={(e) => updateCartItem(item.cart_id, 'unit_price', e.target.value)} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {((parseFloat(item.qty) || 0) * (parseFloat(item.unit_price) || 0)).toLocaleString('id-ID')}
                      </td>
                    </tr>
                      </SwipeableItem>
                      </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                Total Estimasi: <span style={{ color: 'var(--primary)' }}>Rp {cart.reduce((acc, curr) => acc + (parseFloat(curr.qty || 0) * parseFloat(curr.unit_price || 0)), 0).toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)} disabled={loading}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={handleFinalSavePurchases} disabled={loading}>
                  {loading ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Supplier Drawer (Detail Supplier, Staged Material Mapping with Save + Double-Check & PO History) */}
      {supplierDrawer && (() => {
        const originalIds = materials
          .filter(m => isMaterialInSupplier(m.supplier, supplierDrawer.name))
          .map(m => m.id);
        const origSet = new Set(originalIds);
        const draftSet = new Set(drawerDraftMaterialIds);

        const activeDraftMaterials = materials.filter(m => draftSet.has(m.id));
        const stagedRemovedMaterials = materials.filter(m => origSet.has(m.id) && !draftSet.has(m.id));
        const stagedAddedCount = activeDraftMaterials.filter(m => !origSet.has(m.id)).length;
        const stagedRemovedCount = stagedRemovedMaterials.length;
        const hasUnsavedDrawerChanges = stagedAddedCount > 0 || stagedRemovedCount > 0;

        return (
          <div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSupplierDrawer(null); }}
          >
            <div style={{ width: '520px', maxWidth: '100vw', background: 'var(--bg-primary)', height: '100%', overflowY: 'auto', padding: '24px', boxShadow: '-5px 0 25px rgba(0,0,0,0.15)', animation: 'slideInRight 0.2s ease-out', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', marginBottom: '2px' }}>
                    Katalog Supplier
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{supplierDrawer.name}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                    onClick={() => openSupplierModal(supplierDrawer)}
                  >
                    <Edit2 size={14} style={{ marginRight: '4px' }} /> Edit
                  </button>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '6px 10px', fontSize: '0.78rem', color: 'var(--danger)', background: 'rgba(239,68,68,0.08)' }}
                    onClick={() => handleDeleteSupplier(supplierDrawer)}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button type="button" className="btn" onClick={() => setSupplierDrawer(null)}>✕</button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.84rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Contact Person</span>
                  <strong>{supplierDrawer.contact_person || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Telepon / WA</span>
                  <strong>{supplierDrawer.phone || '-'}</strong>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>Alamat</span>
                  <span>{supplierDrawer.address || '-'}</span>
                </div>
              </div>

              {/* Interactive Material Mapping Section with Draft + Save + Double-Check */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h3 style={{ fontSize: '0.96rem', fontWeight: 700, margin: 0 }}>
                      Daftar Bahan ({activeDraftMaterials.length})
                    </h3>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Tambah atau lepas bahan, lalu simpan.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '5px 10px', fontSize: '0.76rem' }}
                    onClick={() => {
                      setNewMaterialData({ name: '', category: 'Bahan Baku Dasar', unit: 'pcs', price: '', min_stock: 15, supplier: supplierDrawer.name });
                      setShowNewMaterialModal(true);
                    }}
                  >
                    <Plus size={13} style={{ marginRight: '4px' }} /> Bahan Baru
                  </button>
                </div>

                {/* Quick Search to Stage Existing Material to This Supplier */}
                <div>
                  <div style={{ position: 'relative' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-control"
                      style={{ paddingLeft: '32px', fontSize: '0.84rem' }}
                      placeholder={`Cari nama bahan untuk ditambahkan ke ${supplierDrawer.name}...`}
                      value={drawerMaterialSearch}
                      onChange={e => setDrawerMaterialSearch(e.target.value)}
                    />
                  </div>
                  {drawerMaterialSearch.trim() !== '' && (
                    <div
                      style={{
                        marginTop: '6px',
                        maxHeight: '180px',
                        overflowY: 'auto',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-secondary)'
                      }}
                    >
                      {(() => {
                        const q = drawerMaterialSearch.trim().toLowerCase();
                        const candidates = materials
                          .filter(m => !draftSet.has(m.id) && (m.name || '').toLowerCase().includes(q))
                          .slice(0, 12);

                        if (candidates.length === 0) {
                          return (
                            <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <span>Tidak ada bahan lain dengan nama "{drawerMaterialSearch}".</span>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '4px 8px', fontSize: '0.74rem', whiteSpace: 'nowrap' }}
                                onClick={() => {
                                  setNewMaterialData({ name: drawerMaterialSearch.trim(), category: 'Bahan Baku Dasar', unit: 'pcs', price: '', min_stock: 15, supplier: supplierDrawer.name });
                                  setDrawerMaterialSearch('');
                                  setShowNewMaterialModal(true);
                                }}
                              >
                                + Buat Baru
                              </button>
                            </div>
                          );
                        }

                        return candidates.map(m => {
                          const currentSup = normalizeSupplierName(m.supplier);
                          return (
                            <div
                              key={m.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 12px',
                                borderBottom: '1px solid var(--border-light)',
                                fontSize: '0.83rem'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600 }}>{m.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({m.unit})</span></div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {currentSup ? `Supplier saat ini: ${currentSup}` : 'Belum punya supplier'} • Rp {Number(m.price || 0).toLocaleString('id-ID')}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                                onClick={() => handleStageAssignInDrawer(m)}
                              >
                                + Tautkan
                              </button>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* Current Active Draft Materials List */}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '260px', overflowY: 'auto' }}>
                  {activeDraftMaterials.length > 0 ? (
                    activeDraftMaterials.map(m => {
                      const isNewlyAdded = !origSet.has(m.id);
                      return (
                        <li
                          key={m.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '9px 10px',
                            borderBottom: '1px solid var(--border-light)',
                            fontSize: '0.86rem',
                            background: isNewlyAdded ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                            borderRadius: '4px'
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span>{m.name}</span>
                              {isNewlyAdded && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'var(--success)', color: '#fff', fontWeight: 700 }}>
                                  Baru
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Rp {Number(m.price || 0).toLocaleString('id-ID')} / {m.unit}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn"
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              color: 'var(--danger)',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}
                            title="Tandai bahan ini untuk dilepas dari supplier"
                            onClick={() => handleStageUnassignInDrawer(m.id)}
                          >
                            Lepas ✕
                          </button>
                        </li>
                      );
                    })
                  ) : (
                    <li style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '18px 8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                      Belum ada bahan pada supplier ini.
                    </li>
                  )}
                </ul>

                {/* Staged Removed Materials (Akan Dilepas) with Undo */}
                {stagedRemovedMaterials.length > 0 && (
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.06)', border: '1px dashed rgba(239, 68, 68, 0.35)' }}>
                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--danger)', marginBottom: '6px' }}>
                      Akan Dilepas ({stagedRemovedMaterials.length}) — klik Simpan:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {stagedRemovedMaterials.map(m => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                          <span style={{ textDecoration: 'line-through', color: 'var(--text-secondary)' }}>
                            {m.name} ({m.unit})
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '0.73rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleUndoUnassignInDrawer(m.id)}
                          >
                            <RotateCcw size={12} /> Urungkan
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save & Reset Bar for Supplier Drawer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border)',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ fontSize: '0.78rem', color: hasUnsavedDrawerChanges ? 'var(--warning)' : 'var(--text-muted)', fontWeight: hasUnsavedDrawerChanges ? 600 : 400 }}>
                    {hasUnsavedDrawerChanges
                      ? `Perubahan belum disimpan (+${stagedAddedCount} / -${stagedRemovedCount})`
                      : 'Tersimpan'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {hasUnsavedDrawerChanges && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                        onClick={handleResetDrawerDraft}
                        disabled={savingDrawerMapping}
                      >
                        Reset
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '7px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      disabled={!hasUnsavedDrawerChanges || savingDrawerMapping}
                      onClick={handlePrepareSaveDrawerMapping}
                    >
                      <Save size={14} />
                      {savingDrawerMapping
                        ? 'Menyimpan...'
                        : hasUnsavedDrawerChanges
                          ? `Simpan (${stagedAddedCount + stagedRemovedCount})`
                          : 'Simpan'}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>5 PO Terakhir</h3>
                {drawerPOs.length > 0 ? (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {drawerPOs.map(po => (
                      <li key={po.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600 }}>{po.invoice_no}</span>
                          <span style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', background: po.status === 'RECEIVED' ? 'var(--success)' : (po.status === 'SENT' ? 'var(--primary)' : 'var(--warning)'), color: po.status === 'DRAFT' ? 'black' : 'white' }}>{po.status}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          <span>{po.date}</span>
                          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>Rp {Number(po.total || 0).toLocaleString('id-ID')}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Belum ada histori PO.</p>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Custom In-App Confirmation Popup Modal */}
      {doubleCheckModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
            padding: '16px'
          }}
          onClick={() => {
            if (!savingSupplier && !savingDrawerMapping && !loading) {
              setDoubleCheckModal(null);
            }
          }}
        >
          <div
            className="glass-card modal-card"
            style={{ width: '440px', maxWidth: 'calc(100vw - 32px)', maxHeight: '88vh', overflowY: 'auto', padding: '22px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              {doubleCheckModal.type.includes('DELETE') ? (
                <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
              ) : (
                <CheckCircle2 size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, margin: 0 }}>
                {doubleCheckModal.title}
              </h3>
            </div>

            {doubleCheckModal.subtitle && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.45 }}>
                {doubleCheckModal.subtitle}
              </p>
            )}

            {/* Summary Box for Supplier & Material Mapping Changes */}
            {(doubleCheckModal.type === 'SAVE_SUPPLIER_MODAL' || doubleCheckModal.type === 'SAVE_DRAWER_MAPPING') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span>Supplier: <strong>{doubleCheckModal.supplierName}</strong></span>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{doubleCheckModal.totalSelected} Bahan</span>
                </div>

                {doubleCheckModal. addedMats?.length > 0 && (
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--success)', marginBottom: '6px' }}>
                      + Ditambah ({doubleCheckModal.addedMats.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {doubleCheckModal.addedMats.map(m => (
                        <span key={m.id} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          {m.name} ({m.unit})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {doubleCheckModal.removedMats?.length > 0 && (
                  <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--danger)', marginBottom: '6px' }}>
                      - Dilepas ({doubleCheckModal.removedMats.length}):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {doubleCheckModal.removedMats.map(m => (
                        <span key={m.id} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                          {m.name} ({m.unit})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary Box for Delete Supplier */}
            {doubleCheckModal.type === 'DELETE_SUPPLIER' && (
              <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', marginBottom: '18px', fontSize: '0.84rem' }}>
                {doubleCheckModal.removedMats?.length > 0 ? (
                  <>
                    <div style={{ marginBottom: '6px', color: 'var(--text-secondary)' }}>
                      <strong>{doubleCheckModal.removedMats.length} bahan</strong> akan dilepas dari supplier ini:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {doubleCheckModal.removedMats.map(m => (
                        <span key={m.id} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    Tidak ada bahan yang terhubung ke supplier ini.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={savingSupplier || savingDrawerMapping || loading}
                onClick={() => setDoubleCheckModal(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className={doubleCheckModal.type.includes('DELETE') ? 'btn' : 'btn btn-primary'}
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  ...(doubleCheckModal.type.includes('DELETE')
                    ? { background: 'var(--danger)', color: '#fff', fontWeight: 700 }
                    : { fontWeight: 700 })
                }}
                disabled={savingSupplier || savingDrawerMapping || loading}
                onClick={() => {
                  if (doubleCheckModal.type === 'SAVE_SUPPLIER_MODAL') executeSaveSupplier();
                  else if (doubleCheckModal.type === 'SAVE_DRAWER_MAPPING') executeSaveDrawerMapping();
                  else if (doubleCheckModal.type === 'DELETE_SUPPLIER') executeDeleteSupplier(doubleCheckModal.supplier);
                  else if (doubleCheckModal.type === 'DELETE_HISTORY') executeDeleteHistory(doubleCheckModal.purchaseId, doubleCheckModal.itemName);
                  else if (doubleCheckModal.type === 'BULK_DELETE_HISTORY') executeBulkDeleteHistory();
                }}
              >
                {savingSupplier || savingDrawerMapping || loading
                  ? 'Menyimpan...'
                  : doubleCheckModal.type.includes('DELETE')
                    ? 'Hapus'
                    : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
