import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ListPlus,
  Search,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  Building2,
  Copy,
  Sparkles,
  Package,
  FileText,
  Eye,
  Send
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';

// Helper to format Material ID
const formatMaterialId = (mat) => {
  if (!mat) return '-';
  if (mat.sku && mat.sku.trim()) return mat.sku.trim();
  const rawId = mat.id || '';
  return `MAT-${rawId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
};

// Helper to format Supplier ID
const formatSupplierId = (supplier) => {
  if (!supplier) return '-';
  if (typeof supplier === 'string') {
    if (supplier.startsWith('SUP-')) return supplier;
    return `SUP-${supplier.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  }
  const rawId = supplier.id || '';
  return `SUP-${rawId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
};

// Helper to parse item remarks safely
const parseItemRemarks = (rawRemarks, fallbackVendor = '') => {
  if (!rawRemarks && !fallbackVendor) {
    return {
      supplier_id: '',
      supplier_name: '',
      quality_status: 'bagus',
      notes: '',
      comparison_note: ''
    };
  }

  if (typeof rawRemarks === 'object' && rawRemarks !== null) {
    return {
      supplier_id: rawRemarks.supplier_id || '',
      supplier_name: rawRemarks.supplier_name || fallbackVendor || '',
      quality_status: rawRemarks.quality_status || 'bagus',
      notes: rawRemarks.notes || '',
      comparison_note: rawRemarks.comparison_note || ''
    };
  }

  try {
    const parsed = JSON.parse(rawRemarks);
    if (parsed && typeof parsed === 'object') {
      return {
        supplier_id: parsed.supplier_id || '',
        supplier_name: parsed.supplier_name || fallbackVendor || '',
        quality_status: parsed.quality_status || 'bagus',
        notes: parsed.notes || '',
        comparison_note: parsed.comparison_note || ''
      };
    }
  } catch {
    // Legacy plain text remarks
    return {
      supplier_id: '',
      supplier_name: fallbackVendor || '',
      quality_status: 'bagus',
      notes: String(rawRemarks || ''),
      comparison_note: ''
    };
  }

  return {
    supplier_id: '',
    supplier_name: fallbackVendor || '',
    quality_status: 'bagus',
    notes: '',
    comparison_note: ''
  };
};

export default function Marketlist() {
  const { showToast, stock } = useData();
  const { activeUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingToPO, setSendingToPO] = useState(false);
  const [lists, setLists] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);

  // Views: 'list', 'edit-header', 'edit-items'
  const [view, setView] = useState('list');
  const [currentList, setCurrentList] = useState(null);

  // Form states
  const [formData, setFormData] = useState({ name: '', description: '', is_active: true });
  const [itemsData, setItemsData] = useState([]);

  // Filter & Search in edit-items
  const [itemSearch, setItemSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [qualityFilter, setQualityFilter] = useState('ALL');

  // Preview Modal in list view
  const [previewList, setPreviewList] = useState(null);

  // Compare Price Modal
  const [compareModalItem, setCompareModalItem] = useState(null);

  // Quick Add Supplier Modal
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierData, setNewSupplierData] = useState({ name: '', phone: '', address: '', contact_person: '' });
  const [activeItemIndexForSupplier, setActiveItemIndexForSupplier] = useState(null);

  const getTenantId = useCallback(() => activeUser?.tenant_id || 'UNKNOWN', [activeUser]);

  // Fetch Master Suppliers and Price History
  const fetchMasterData = useCallback(async () => {
    try {
      const [supData, histData] = await Promise.all([
        api.getSuppliers().catch(e => { console.warn('Gagal memuat supplier:', e); return []; }),
        api.getMaterialSupplierHistory().catch(e => { console.warn('Gagal memuat history harga:', e); return []; })
      ]);
      setSuppliers(supData || []);
      setPriceHistory(histData || []);
    } catch (err) {
      console.error('Master data error:', err);
    }
  }, []);

  // Fetch All Market Lists
  const fetchLists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getMarketLists();
      setLists(data || []);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLists();
    fetchMasterData();
  }, [fetchLists, fetchMasterData]);

  // Build supplier pricing lookup map: { [material_id]: { [supplier_id]: { price, date, name } } }
  const supplierPriceCatalog = useMemo(() => {
    const catalog = {};

    // 1. From historical purchase entries
    (priceHistory || []).forEach(entry => {
      if (!entry.material_id || !entry.supplier_id) return;
      if (!catalog[entry.material_id]) catalog[entry.material_id] = {};
      if (!catalog[entry.material_id][entry.supplier_id]) {
        catalog[entry.material_id][entry.supplier_id] = {
          price: Number(entry.unit_price) || 0,
          date: entry.date,
          supplier_name: entry.suppliers?.name || 'Supplier'
        };
      }
    });

    return catalog;
  }, [priceHistory]);

  // Helper to get prices of all suppliers for a material (sorted by price ascending)
  const getSupplierPricesForMaterial = useCallback((materialId) => {
    if (!materialId) return [];
    const mat = (stock || []).find(s => s.id === materialId);
    const baseCatalogPrice = Number(mat?.price) || 0;
    const recorded = supplierPriceCatalog[materialId] || {};

    const list = (suppliers || []).map(sup => {
      const rec = recorded[sup.id];
      return {
        supplier_id: sup.id,
        supplier_name: sup.name,
        supplier_code: formatSupplierId(sup),
        price: rec ? rec.price : baseCatalogPrice,
        is_historical: Boolean(rec),
        date: rec ? rec.date : null
      };
    });

    return list.sort((a, b) => a.price - b.price);
  }, [stock, supplierPriceCatalog, suppliers]);

  // Handle header form save
  const handleSaveHeader = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return showToast('Nama Market List wajib diisi', 'error');

    try {
      setSaving(true);
      const tenantId = getTenantId();
      let saved;

      if (currentList?.id) {
        const { data, error } = await supabase
          .from('market_lists')
          .update({
            name: formData.name,
            description: formData.description || '',
            is_active: formData.is_active ?? true
          })
          .eq('id', currentList.id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        saved = data;
        showToast('Header Market List berhasil diperbarui', 'success');
      } else {
        const { data, error } = await supabase
          .from('market_lists')
          .insert({
            name: formData.name,
            description: formData.description || '',
            is_active: formData.is_active ?? true,
            tenant_id: tenantId
          })
          .select()
          .single();
        if (error) throw error;
        saved = data;
        showToast('Market List baru berhasil dibuat', 'success');
      }

      setCurrentList(saved);
      // Populate items state
      const fullList = lists.find(l => l.id === saved.id);
      loadItemsIntoState(fullList?.market_list_items || []);
      setView('edit-items');
      await fetchLists();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Convert raw DB items into rich UI state
  const loadItemsIntoState = useCallback((rawItems) => {
    if (!rawItems || rawItems.length === 0) {
      setItemsData([]);
      return;
    }

    const richItems = rawItems.map(item => {
      const remarksData = parseItemRemarks(item.remarks, item.vendor);
      const mat = item.materials || (stock || []).find(s => s.id === item.material_id);
      const supplierObj = (suppliers || []).find(s => s.id === remarksData.supplier_id) ||
                          (suppliers || []).find(s => s.name.toLowerCase() === (remarksData.supplier_name || '').toLowerCase());

      const supId = supplierObj ? supplierObj.id : remarksData.supplier_id;
      const supName = supplierObj ? supplierObj.name : (remarksData.supplier_name || '');

      // Price: use item.estimated_price if available, else look up supplier price, else mat price
      let unitPrice = Number(item.estimated_price);
      if (!unitPrice || unitPrice === 0) {
        const recordedPrices = supplierPriceCatalog[item.material_id];
        if (supId && recordedPrices && recordedPrices[supId]) {
          unitPrice = recordedPrices[supId].price;
        } else {
          unitPrice = Number(mat?.price) || 0;
        }
      }

      return {
        id: item.id || `temp_${Math.random()}`,
        material_id: item.material_id,
        material_name: mat?.name || 'Pilih Material',
        material_sku: formatMaterialId(mat),
        category: mat?.category || 'Bahan Baku',
        unit: item.unit || mat?.unit || 'pcs',
        current_stock: Number(mat?.stock ?? item.current_stock ?? 0),
        min_stock: Number(item.min_stock ?? mat?.min_stock ?? 0),
        par_stock: Number(item.par_stock ?? mat?.par_stock ?? 0),
        quantity: Number(item.quantity ?? item.request_qty ?? 0),
        approved_qty: Number(item.approved_qty ?? 0),
        supplier_id: supId || '',
        supplier_name: supName || '',
        supplier_code: supId ? formatSupplierId(supId) : '',
        price: unitPrice,
        quality_status: remarksData.quality_status || 'bagus',
        notes: remarksData.notes || '',
        is_urgent: Boolean(item.is_urgent)
      };
    });

    setItemsData(richItems);
  }, [stock, suppliers, supplierPriceCatalog]);

  const handleDelete = async (id) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus Market List ini?')) return;
    try {
      const { error } = await supabase.from('market_lists').delete().eq('id', id);
      if (error) throw error;
      showToast('Market List berhasil dihapus', 'success');
      fetchLists();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Save items to Supabase
  const handleSaveItems = async () => {
    if (!currentList?.id) return;
    try {
      setSaving(true);
      const validItems = itemsData.filter(i => i.material_id).map(i => {
        const remarksPayload = {
          supplier_id: i.supplier_id || '',
          supplier_name: i.supplier_name || '',
          quality_status: i.quality_status || 'bagus',
          notes: (i.notes || '').trim(),
          supplier_price: Number(i.price) || 0
        };

        return {
          market_list_id: currentList.id,
          material_id: i.material_id,
          unit: i.unit || '',
          current_stock: Number(i.current_stock) || 0,
          min_stock: Number(i.min_stock) || 0,
          par_stock: Number(i.par_stock) || 0,
          quantity: Number(i.quantity) || 0,
          request_qty: Number(i.quantity) || 0,
          approved_qty: Number(i.approved_qty) || 0,
          estimated_price: Number(i.price) || 0,
          is_urgent: Boolean(i.is_urgent),
          remarks: JSON.stringify(remarksPayload)
        };
      });

      // Atomic wipe and re-insert
      await supabase.from('market_list_items').delete().eq('market_list_id', currentList.id);

      if (validItems.length > 0) {
        const { error } = await supabase.from('market_list_items').insert(validItems);
        if (error) throw error;
      }

      showToast(`Berhasil menyimpan ${validItems.length} item ke Market List!`, 'success');
      await fetchLists();
      setView('list');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Send approved marketlist items to Purchase Order (WBS 4.3.4)
  const handleSendToPO = async () => {
    if (!currentList?.id) return;
    const validItems = itemsData.filter(i => i.material_id && (Number(i.approved_qty) || Number(i.quantity)) > 0);
    if (validItems.length === 0) {
      return showToast('Tidak ada item dengan kuantitas valid untuk dikirim ke PO.', 'warning');
    }

    const confirmed = window.confirm(
      `Kirim ${validItems.length} item dari "${currentList.name}" ke Pembelian Harian?\n\n` +
      'Aksi ini akan membuat entri pembelian baru dan menambah stok material. Pastikan data sudah benar.'
    );
    if (!confirmed) return;

    setSendingToPO(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let successCount = 0;
      let failCount = 0;

      for (const item of validItems) {
        const qty = Number(item.approved_qty) || Number(item.quantity) || 0;
        if (qty <= 0) continue;
        try {
          await api.createPurchaseEntry({
            date: today,
            material_id: item.material_id,
            supplier_id: item.supplier_id || null,
            qty: qty,
            unit: item.unit || 'pcs',
            unit_price: Number(item.price) || 0,
            notes: `Dari Market List: ${currentList.name}`
          });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (failCount > 0) {
        showToast(`${successCount} item berhasil, ${failCount} gagal dikirim ke PO.`, 'warning');
      } else {
        showToast(`Berhasil mengirim ${successCount} item ke Pembelian Harian!`, 'success');
      }
    } catch (err) {
      showToast(err.message || 'Gagal mengirim ke PO', 'error');
    } finally {
      setSendingToPO(false);
    }
  };

  // Add empty row
  const handleAddItemRow = () => {
    setItemsData([
      ...itemsData,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        material_id: '',
        material_name: '',
        material_sku: '-',
        category: 'Bahan Baku',
        unit: 'kg',
        current_stock: 0,
        min_stock: 0,
        par_stock: 0,
        quantity: 1,
        approved_qty: 0,
        supplier_id: '',
        supplier_name: '',
        supplier_code: '-',
        price: 0,
        quality_status: 'bagus',
        notes: '',
        is_urgent: false
      }
    ]);
  };

  // Auto-populate materials below par stock
  const handleAutoAddLowStock = () => {
    const lowStockMaterials = (stock || []).filter(m => {
      const current = Number(m.stock) || 0;
      const par = Number(m.par_stock) || 0;
      const min = Number(m.min_stock) || 0;
      return current < par || current <= min;
    });

    if (lowStockMaterials.length === 0) {
      return showToast('Semua bahan baku saat ini berada di atas par stock!', 'info');
    }

    const existingMatIds = new Set(itemsData.map(i => i.material_id));
    const newItems = [];

    lowStockMaterials.forEach(mat => {
      if (existingMatIds.has(mat.id)) return; // Don't duplicate

      // Find best/cheapest supplier for this material
      const supplierOffers = getSupplierPricesForMaterial(mat.id);
      const bestOffer = supplierOffers[0];

      const current = Number(mat.stock) || 0;
      const par = Number(mat.par_stock) || (current + 5);
      const reqQty = Math.max(1, par - current);

      newItems.push({
        id: `temp_${Date.now()}_${mat.id}`,
        material_id: mat.id,
        material_name: mat.name,
        material_sku: formatMaterialId(mat),
        category: mat.category || 'Bahan Baku',
        unit: mat.unit || 'pcs',
        current_stock: current,
        min_stock: Number(mat.min_stock) || 0,
        par_stock: par,
        quantity: reqQty,
        approved_qty: reqQty,
        supplier_id: bestOffer ? bestOffer.supplier_id : '',
        supplier_name: bestOffer ? bestOffer.supplier_name : '',
        supplier_code: bestOffer ? bestOffer.supplier_code : '-',
        price: bestOffer ? bestOffer.price : (Number(mat.price) || 0),
        quality_status: 'bagus',
        notes: 'Stok menipis, disarankan order segera.',
        is_urgent: current <= Number(mat.min_stock)
      });
    });

    if (newItems.length === 0) {
      return showToast('Bahan baku dengan stok rendah sudah ada dalam daftar.', 'info');
    }

    setItemsData([...itemsData, ...newItems]);
    showToast(`Berhasil menambahkan ${newItems.length} bahan berstatus stok menipis!`, 'success');
  };

  // Update specific item field
  const updateItemRow = (index, field, value) => {
    const updated = [...itemsData];
    const item = { ...updated[index] };

    if (field === 'material_id') {
      const mat = (stock || []).find(s => s.id === value);
      if (mat) {
        item.material_id = mat.id;
        item.material_name = mat.name;
        item.material_sku = formatMaterialId(mat);
        item.category = mat.category || 'Bahan Baku';
        item.unit = mat.unit || 'pcs';
        item.current_stock = Number(mat.stock) || 0;
        item.min_stock = Number(mat.min_stock) || 0;
        item.par_stock = Number(mat.par_stock) || 0;

        // Auto-calculate suggested quantity
        const par = Number(mat.par_stock) || 0;
        const cur = Number(mat.stock) || 0;
        item.quantity = Math.max(1, par > cur ? par - cur : 1);

        // Auto-assign supplier & price based on material + supplier
        const offers = getSupplierPricesForMaterial(mat.id);
        if (offers.length > 0) {
          // If already had a supplier and that supplier is valid, keep it
          const existingOffer = item.supplier_id ? offers.find(o => o.supplier_id === item.supplier_id) : null;
          if (existingOffer) {
            item.price = existingOffer.price;
          } else {
            // Default to cheapest/first supplier
            const bestOffer = offers[0];
            item.supplier_id = bestOffer.supplier_id;
            item.supplier_name = bestOffer.supplier_name;
            item.supplier_code = bestOffer.supplier_code;
            item.price = bestOffer.price;
          }
        } else {
          item.price = Number(mat.price) || 0;
        }
      } else {
        item.material_id = '';
        item.material_name = '';
        item.material_sku = '-';
        item.price = 0;
      }
    } else if (field === 'supplier_id') {
      // User changed the supplier: look up price for this (material_id + supplier_id) pair!
      const sup = (suppliers || []).find(s => s.id === value);
      item.supplier_id = value;
      item.supplier_name = sup ? sup.name : '';
      item.supplier_code = sup ? formatSupplierId(sup) : '-';

      if (item.material_id) {
        const recorded = supplierPriceCatalog[item.material_id]?.[value];
        if (recorded) {
          item.price = recorded.price;
          showToast(`Harga disesuaikan dengan ${sup?.name}: Rp ${recorded.price.toLocaleString('id-ID')}/${item.unit}`, 'info');
        } else {
          // Fallback to base material price if this supplier doesn't have a distinct price record yet
          const mat = (stock || []).find(s => s.id === item.material_id);
          item.price = Number(mat?.price) || 0;
        }
      }
    } else {
      item[field] = value;
    }

    updated[index] = item;
    setItemsData(updated);
  };

  // Remove row
  const removeItemRow = (index) => {
    setItemsData(itemsData.filter((_, i) => i !== index));
  };

  // Duplicate row
  const duplicateItemRow = (index) => {
    const item = itemsData[index];
    setItemsData([
      ...itemsData,
      {
        ...item,
        id: `temp_${Date.now()}_dup`
      }
    ]);
    showToast('Baris berhasil diduplikat', 'info');
  };

  // Switch supplier to cheaper option directly
  const switchSupplierToCheaper = (index, targetSupplierId, targetPrice) => {
    const sup = (suppliers || []).find(s => s.id === targetSupplierId);
    if (!sup) return;

    const updated = [...itemsData];
    updated[index] = {
      ...updated[index],
      supplier_id: targetSupplierId,
      supplier_name: sup.name,
      supplier_code: formatSupplierId(sup),
      price: targetPrice
    };
    setItemsData(updated);
    showToast(`Supplier berhasil diganti ke ${sup.name} (Rp ${targetPrice.toLocaleString('id-ID')})!`, 'success');
  };

  // Quick save new supplier
  const handleQuickAddSupplier = async (e) => {
    e.preventDefault();
    if (!newSupplierData.name.trim()) return showToast('Nama supplier wajib diisi', 'error');

    try {
      setSaving(true);
      const saved = await api.saveSupplier(newSupplierData);
      showToast(`Supplier "${saved.name}" berhasil didaftarkan!`, 'success');

      // Refresh master suppliers
      await fetchMasterData();

      // If triggered from a specific item row, assign it immediately
      if (activeItemIndexForSupplier !== null && activeItemIndexForSupplier >= 0) {
        updateItemRow(activeItemIndexForSupplier, 'supplier_id', saved.id);
      }

      setShowAddSupplierModal(false);
      setNewSupplierData({ name: '', phone: '', address: '', contact_person: '' });
      setActiveItemIndexForSupplier(null);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Calculate summary totals in item editor
  const { totalEstimatedCost, totalItemsCount, uniqueSuppliersCount, totalPotentialSavings } = useMemo(() => {
    let cost = 0;
    let savings = 0;
    const supSet = new Set();

    itemsData.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const prc = Number(item.price) || 0;
      cost += qty * prc;

      if (item.supplier_name) supSet.add(item.supplier_name);

      // Check if there is a cheaper supplier available
      if (item.material_id) {
        const offers = getSupplierPricesForMaterial(item.material_id);
        if (offers.length > 0) {
          const cheapest = offers[0];
          if (cheapest.price < prc) {
            savings += qty * (prc - cheapest.price);
          }
        }
      }
    });

    return {
      totalEstimatedCost: cost,
      totalItemsCount: itemsData.length,
      uniqueSuppliersCount: supSet.size,
      totalPotentialSavings: savings
    };
  }, [itemsData, getSupplierPricesForMaterial]);

  // Filtered items list
  const filteredItems = useMemo(() => {
    return itemsData.filter(item => {
      // Search
      if (itemSearch.trim()) {
        const q = itemSearch.toLowerCase();
        const matchName = (item.material_name || '').toLowerCase().includes(q);
        const matchSku = (item.material_sku || '').toLowerCase().includes(q);
        const matchSup = (item.supplier_name || '').toLowerCase().includes(q);
        const matchNotes = (item.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchSup && !matchNotes) return false;
      }

      // Filter supplier
      if (supplierFilter !== 'ALL') {
        if (item.supplier_id !== supplierFilter) return false;
      }

      // Filter quality
      if (qualityFilter !== 'ALL') {
        if (item.quality_status !== qualityFilter) return false;
      }

      return true;
    });
  }, [itemsData, itemSearch, supplierFilter, qualityFilter]);

  // Generate WhatsApp / Order Sheet Text
  const generateWhatsAppOrderText = (listToExport) => {
    if (!listToExport) return '';
    const rawItems = listToExport.market_list_items || [];
    const dateFormatted = listToExport.created_at
      ? new Date(listToExport.created_at).toLocaleDateString('id-ID', { dateStyle: 'full' })
      : '-';
    let text = `📋 *MARKET LIST BELANJA: ${listToExport.name.toUpperCase()}*\n`;
    text += `📅 Dibuat: ${dateFormatted}\n`;
    text += `🏢 Deskripsi: ${listToExport.description || 'Daftar kebutuhan operasional'}\n`;
    text += `--------------------------------------------------\n\n`;

    let grandTotal = 0;

    rawItems.forEach((item, idx) => {
      const remarks = parseItemRemarks(item.remarks, item.vendor);
      const mat = item.materials;
      const matName = mat?.name || 'Item';
      const matId = formatMaterialId(mat || { id: item.material_id });
      const supName = remarks.supplier_name || 'Tanpa Supplier';
      const supId = remarks.supplier_id ? formatSupplierId(remarks.supplier_id) : '-';
      const price = Number(item.estimated_price) || Number(mat?.price) || 0;
      const qty = Number(item.quantity || item.request_qty) || 0;
      const subtotal = qty * price;
      grandTotal += subtotal;

      const qualityIcon = remarks.quality_status === 'bagus' ? '🟢 Bagus / Prima' :
                          remarks.quality_status === 'standar' ? '🟡 Standar' : '🔴 Perlu Cek Fisik';

      text += `${idx + 1}. *${matName}* (ID: ${matId})\n`;
      text += `   • Supplier: ${supName} [ID: ${supId}]\n`;
      text += `   • Harga: Rp ${price.toLocaleString('id-ID')} / ${item.unit || mat?.unit || 'pcs'}\n`;
      text += `   • Qty: ${qty} ${item.unit || mat?.unit || 'pcs'} = *Rp ${subtotal.toLocaleString('id-ID')}*\n`;
      text += `   • Kualitas: [${qualityIcon}] ${remarks.notes || 'Normal'}\n\n`;
    });

    text += `--------------------------------------------------\n`;
    text += `💰 *TOTAL ESTIMASI BELANJA: Rp ${grandTotal.toLocaleString('id-ID')}*\n`;
    text += `📌 Mohon konfirmasi stok dan harga ke masing-masing supplier.`;

    return text;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast('Daftar belanja berhasil disalin ke clipboard!', 'success');
  };

  if (loading && view === 'list' && lists.length === 0) {
    return (
      <div className="p-16 text-center space-y-3">
        <Loader2 className="w-9 h-9 animate-spin mx-auto text-[var(--accent)]" />
        <p className="text-xs text-[var(--text-muted)] font-mono">Memuat database Market List...</p>
      </div>
    );
  }

  return (
    <div className="fade-in space-y-6 max-w-7xl mx-auto pb-16">
      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
              <Package size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Market List & Supplier Hub</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Daftar belanja bahan baku dengan integrasi Supplier ID, perbandingan harga antar-supplier, dan audit catatan kualitas.
              </p>
            </div>
          </div>
        </div>

        {view === 'list' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary text-xs flex items-center gap-1.5"
              onClick={() => {
                setActiveItemIndexForSupplier(null);
                setShowAddSupplierModal(true);
              }}
            >
              <Building2 size={15} /> + Supplier Baru
            </button>
            <button
              type="button"
              className="btn btn-primary text-xs flex items-center gap-1.5 shadow-md shadow-[var(--accent)]/15"
              onClick={() => {
                setCurrentList(null);
                setFormData({ name: '', description: '', is_active: true });
                setView('edit-header');
              }}
            >
              <Plus size={16} /> Buat Market List
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          VIEW 1: LIST VIEW (OVERVIEW CARDS)
         ========================================================================= */}
      {view === 'list' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {lists.map(list => {
              const rawItems = list.market_list_items || [];
              const itemCount = rawItems.length;
              let estBudget = 0;
              const supplierSet = new Set();
              let qualityAttentionCount = 0;

              rawItems.forEach(item => {
                const remarks = parseItemRemarks(item.remarks, item.vendor);
                const mat = item.materials;
                const prc = Number(item.estimated_price) || Number(mat?.price) || 0;
                const qty = Number(item.quantity || item.request_qty) || 0;
                estBudget += qty * prc;
                if (remarks.supplier_name) supplierSet.add(remarks.supplier_name);
                if (remarks.quality_status === 'kurang') qualityAttentionCount++;
              });

              return (
                <div
                  key={list.id}
                  className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2.5">
                      <div className="flex-1">
                        <h3 className="font-bold text-base text-[var(--text-primary)] line-clamp-1">{list.name}</h3>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {new Date(list.created_at).toLocaleDateString('id-ID', { dateStyle: 'medium' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Lihat Detail Belanja"
                          onClick={() => setPreviewList(list)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          type="button"
                          title="Ubah Nama/Deskripsi"
                          onClick={() => {
                            setCurrentList(list);
                            setFormData({ name: list.name, description: list.description || '', is_active: list.is_active });
                            setView('edit-header');
                          }}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-colors"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          type="button"
                          title="Hapus List"
                          onClick={() => handleDelete(list.id)}
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 min-h-[32px] mb-4">
                      {list.description || 'Tidak ada deskripsi spesifik.'}
                    </p>

                    {/* Meta badges */}
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[var(--bg-secondary)]/70 border border-[var(--border)] mb-4 text-xs">
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Total Belanja</div>
                        <div className="font-mono font-bold text-[var(--text-primary)] mt-0.5 text-sm">
                          Rp {estBudget.toLocaleString('id-ID')}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Supplier Terlibat</div>
                        <div className="font-semibold text-[var(--accent)] mt-0.5 flex items-center gap-1">
                          <Building2 size={13} /> {supplierSet.size} Rekanan
                        </div>
                      </div>
                    </div>

                    {qualityAttentionCount > 0 && (
                      <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[11px] flex items-center gap-1.5">
                        <AlertTriangle size={13} />
                        <span>{qualityAttentionCount} item perlu pengecekan kualitas khusus</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[var(--border)] text-xs mt-2">
                    <span className="text-[var(--text-muted)] font-mono">{itemCount} Bahan Baku</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                        onClick={() => copyToClipboard(generateWhatsAppOrderText(list))}
                        title="Salin Pesanan WhatsApp"
                      >
                        <Copy size={13} /> Salin Order
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1"
                        onClick={() => {
                          setCurrentList(list);
                          loadItemsIntoState(list.market_list_items || []);
                          setView('edit-items');
                        }}
                      >
                        Kelola Items <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {lists.length === 0 && (
              <div className="col-span-full text-center py-16 px-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)]/30">
                <ListPlus className="w-12 h-12 mx-auto mb-3 text-[var(--text-muted)] opacity-40" />
                <h3 className="font-bold text-base text-[var(--text-primary)]">Belum ada Market List</h3>
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mt-1 mb-5">
                  Buat daftar belanja rutin pertama Anda untuk memantau harga per supplier, nomor ID material, dan catatan kualitas.
                </p>
                <button
                  type="button"
                  className="btn btn-primary text-xs"
                  onClick={() => {
                    setCurrentList(null);
                    setFormData({ name: '', description: '', is_active: true });
                    setView('edit-header');
                  }}
                >
                  <Plus size={15} /> Buat Market List Sekarang
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 2: EDIT HEADER FORM
         ========================================================================= */}
      {view === 'edit-header' && (
        <div className="max-w-xl mx-auto glass-card p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl">
          <div className="flex items-center gap-2.5 pb-4 border-b border-[var(--border)] mb-5">
            <button
              type="button"
              onClick={() => setView('list')}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            >
              <ArrowLeft size={16} />
            </button>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">
              {currentList ? 'Edit Header Market List' : 'Buat Market List Baru'}
            </h3>
          </div>

          <form onSubmit={handleSaveHeader} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Nama Market List <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: Belanja Rutin Kitchen, Restock Sayur & Daging"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Deskripsi / Catatan Peruntukan
              </label>
              <textarea
                rows="3"
                placeholder="Keterangan jadwal belanja, outlet target, atau catatan purchasing..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)] mt-6">
              <button
                type="button"
                className="btn btn-secondary text-xs px-4 py-2"
                onClick={() => setView('list')}
                disabled={saving}
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn btn-primary text-xs px-5 py-2 flex items-center gap-1.5"
                disabled={saving}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {currentList ? 'Update & Lanjut ke Items' : 'Simpan & Lanjut ke Items'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================================================================
          VIEW 3: EDIT ITEMS (MAIN FEATURE WORKBENCH)
         ========================================================================= */}
      {view === 'edit-items' && (
        <div className="space-y-5">
          {/* Top Workbench Card */}
          <div className="glass-card p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors border border-[var(--border)]"
                >
                  <ArrowLeft size={17} />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-[var(--text-primary)]">{currentList?.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      Aktif
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {currentList?.description || 'Kelola bahan baku, harga supplier, dan audit kualitas barang.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleAutoAddLowStock}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                  title="Tambah otomatis bahan yang stoknya di bawah par stock"
                >
                  <Sparkles size={14} className="text-amber-500" /> Auto-Tambah Stok Menipis
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveItemIndexForSupplier(null);
                    setShowAddSupplierModal(true);
                  }}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Building2 size={14} /> + Supplier Baru
                </button>
                <button
                  type="button"
                  onClick={handleSaveItems}
                  disabled={saving}
                  className="btn btn-primary text-xs flex items-center gap-1.5 shadow-md shadow-[var(--accent)]/15"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={15} />}
                  Simpan Perubahan
                </button>
                <button
                  type="button"
                  onClick={handleSendToPO}
                  disabled={sendingToPO || saving}
                  className="btn text-xs flex items-center gap-1.5"
                  style={{ background: '#059669', color: 'white' }}
                  title="Kirim item yang sudah disetujui ke modul Pembelian Harian"
                >
                  {sendingToPO ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Kirim ke PO
                </button>
              </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)]">
                <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Total Item Belanja</div>
                <div className="text-lg font-black text-[var(--text-primary)] font-mono mt-0.5">{totalItemsCount} Bahan</div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)]">
                <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Estimasi Belanja</div>
                <div className="text-lg font-black text-[var(--text-primary)] font-mono mt-0.5">
                  Rp {totalEstimatedCost.toLocaleString('id-ID')}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)]">
                <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Supplier Terpilih</div>
                <div className="text-lg font-black text-[var(--accent)] font-mono mt-0.5 flex items-center gap-1.5">
                  <Building2 size={16} /> {uniqueSuppliersCount} Rekanan
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <TrendingDown size={12} /> Potensi Penghematan
                </div>
                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                  {totalPotentialSavings > 0 ? `Rp ${totalPotentialSavings.toLocaleString('id-ID')}` : 'Optimal'}
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Cari nama bahan, ID SKU, supplier, atau catatan..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <select
                className="text-xs px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none"
                value={supplierFilter}
                onChange={e => setSupplierFilter(e.target.value)}
              >
                <option value="ALL">Semua Supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({formatSupplierId(s)})</option>
                ))}
              </select>

              <select
                className="text-xs px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none"
                value={qualityFilter}
                onChange={e => setQualityFilter(e.target.value)}
              >
                <option value="ALL">Semua Catatan Kualitas</option>
                <option value="bagus">🟢 Kualitas Bagus / Prima</option>
                <option value="standar">🟡 Kualitas Standar</option>
                <option value="kurang">🔴 Perlu Cek Fisik / Sortir</option>
              </select>
            </div>
          </div>

          {/* Main Table */}
          <div className="glass-card rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden shadow-md">
            <div className="overflow-x-auto max-h-[620px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[var(--text-muted)] uppercase text-[10px] font-bold">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">No</th>
                    <th className="py-3 px-3 w-56">Bahan & ID Material</th>
                    <th className="py-3 px-3 w-56">Supplier & ID Supplier</th>
                    <th className="py-3 px-3 w-48 text-right">Harga Satuan (Rp)</th>
                    <th className="py-3 px-3 w-32 text-center">Qty Pesan</th>
                    <th className="py-3 px-3 w-36 text-right">Subtotal (Rp)</th>
                    <th className="py-3 px-3 min-w-[280px]">Notes & Kualitas Barang</th>
                    <th className="py-3 px-3 w-16 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-normal">
                  {filteredItems.map((item, idx) => {
                    // Find actual item index in parent itemsData
                    const realIndex = itemsData.findIndex(i => i.id === item.id);
                    const supplierOffers = item.material_id ? getSupplierPricesForMaterial(item.material_id) : [];
                    const cheapestOffer = supplierOffers.length > 0 ? supplierOffers[0] : null;
                    const isCheapest = cheapestOffer && item.supplier_id === cheapestOffer.supplier_id;
                    const hasCheaperAlternative = cheapestOffer && item.supplier_id && cheapestOffer.supplier_id !== item.supplier_id && cheapestOffer.price < item.price;
                    const savingsPerUnit = hasCheaperAlternative ? item.price - cheapestOffer.price : 0;
                    const subtotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);

                    return (
                      <tr key={item.id} className="hover:bg-[var(--bg-secondary)]/40 transition-colors">
                        {/* 1. Number */}
                        <td className="py-3 px-3 text-center text-[var(--text-muted)] font-mono">
                          {idx + 1}
                        </td>

                        {/* 2. Material Name & ID Materials */}
                        <td className="py-3 px-3">
                          <select
                            className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-semibold focus:outline-none focus:border-[var(--accent)]"
                            value={item.material_id}
                            onChange={e => updateItemRow(realIndex, 'material_id', e.target.value)}
                          >
                            <option value="">-- Pilih Bahan Baku --</option>
                            {(stock || []).map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({formatMaterialId(s)})
                              </option>
                            ))}
                          </select>

                          {item.material_id && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border)] font-mono font-bold text-[var(--accent)]">
                                {item.material_sku}
                              </span>
                              <span className="text-[var(--text-muted)]">
                                Stok: <strong className={item.current_stock <= item.min_stock ? 'text-rose-500 font-bold' : 'text-[var(--text-primary)]'}>{item.current_stock}</strong> {item.unit}
                              </span>
                              {item.par_stock > 0 && (
                                <span className="text-[var(--text-muted)] font-mono">
                                  (Par: {item.par_stock})
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 3. Supplier Name & ID Supplier */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <select
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--accent)]"
                              value={item.supplier_id}
                              onChange={e => updateItemRow(realIndex, 'supplier_id', e.target.value)}
                            >
                              <option value="">-- Pilih Supplier --</option>
                              {suppliers.map(s => {
                                const recPrice = supplierPriceCatalog[item.material_id]?.[s.id]?.price;
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({formatSupplierId(s)}) {recPrice ? `• Rp ${recPrice.toLocaleString('id-ID')}` : ''}
                                  </option>
                                );
                              })}
                            </select>

                            <div className="flex items-center justify-between gap-1 text-[10px]">
                              {item.supplier_id ? (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-mono">
                                  ID: {formatSupplierId(item.supplier_id)}
                                </span>
                              ) : (
                                <span className="text-amber-500 italic">Pilih supplier rekanan</span>
                              )}

                              <button
                                type="button"
                                className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-0.5 font-medium"
                                onClick={() => {
                                  setActiveItemIndexForSupplier(realIndex);
                                  setShowAddSupplierModal(true);
                                }}
                              >
                                + Baru
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* 4. Harga Satuan (Berdasarkan ID Material + ID Supplier) */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="relative w-32">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] font-bold">
                                Rp
                              </span>
                              <input
                                type="number"
                                className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-right font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                                value={item.price || ''}
                                onChange={e => updateItemRow(realIndex, 'price', parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                min="0"
                                step="any"
                              />
                            </div>

                            {/* Price Comparison Indicator */}
                            {item.material_id && supplierOffers.length > 1 && (
                              <div className="mt-0.5">
                                {isCheapest ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 size={11} /> Harga Termurah
                                  </span>
                                ) : hasCheaperAlternative ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.5 rounded">
                                      <TrendingDown size={11} /> Ada yg Rp {cheapestOffer.price.toLocaleString('id-ID')}
                                    </span>
                                    <button
                                      type="button"
                                      className="text-[10px] font-bold text-[var(--accent)] hover:underline"
                                      onClick={() => switchSupplierToCheaper(realIndex, cheapestOffer.supplier_id, cheapestOffer.price)}
                                      title={`Ganti ke ${cheapestOffer.supplier_name} untuk hemat Rp ${savingsPerUnit.toLocaleString('id-ID')}/${item.unit}`}
                                    >
                                      Ganti ke {cheapestOffer.supplier_name.slice(0, 12)}...
                                    </button>
                                  </div>
                                ) : null}

                                <button
                                  type="button"
                                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent)] underline block mt-0.5"
                                  onClick={() => setCompareModalItem({ item, realIndex, offers: supplierOffers })}
                                >
                                  Bandingkan ({supplierOffers.length})
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. Quantity & Unit */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              className="w-16 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-center font-mono font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                              value={item.quantity || ''}
                              onChange={e => updateItemRow(realIndex, 'quantity', parseFloat(e.target.value) || 0)}
                              min="0"
                              step="any"
                            />
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">
                              {item.unit}
                            </span>
                          </div>
                        </td>

                        {/* 6. Subtotal */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-[var(--text-primary)]">
                          Rp {subtotal.toLocaleString('id-ID')}
                        </td>

                        {/* 7. Notes untuk Deskripsi Singkat Kualitas Barang */}
                        <td className="py-3 px-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              {/* Quality Status Selector */}
                              <select
                                className={`text-[11px] font-bold px-2 py-1 rounded-lg border focus:outline-none ${
                                  item.quality_status === 'bagus'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                    : item.quality_status === 'standar'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                                    : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                                }`}
                                value={item.quality_status}
                                onChange={e => updateItemRow(realIndex, 'quality_status', e.target.value)}
                              >
                                <option value="bagus">🟢 Bagus / Prima</option>
                                <option value="standar">🟡 Standar / Layak</option>
                                <option value="kurang">🔴 Perlu Cek / Sortir</option>
                              </select>

                              {/* Quick tags pills */}
                              <div className="hidden lg:flex items-center gap-1 overflow-x-auto text-[10px]">
                                <button
                                  type="button"
                                  className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--accent)]/10 text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border)] transition-colors whitespace-nowrap"
                                  onClick={() => {
                                    const curr = item.notes ? `${item.notes}, Segar prima` : 'Segar prima';
                                    updateItemRow(realIndex, 'notes', curr);
                                  }}
                                >
                                  + Segar
                                </button>
                                <button
                                  type="button"
                                  className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--accent)]/10 text-[var(--text-muted)] hover:text-[var(--accent)] border border-[var(--border)] transition-colors whitespace-nowrap"
                                  onClick={() => {
                                    const curr = item.notes ? `${item.notes}, Kemasan rapi` : 'Kemasan rapi';
                                    updateItemRow(realIndex, 'notes', curr);
                                  }}
                                >
                                  + Kemasan Rapi
                                </button>
                                <button
                                  type="button"
                                  className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-500 border border-[var(--border)] transition-colors whitespace-nowrap"
                                  onClick={() => {
                                    const curr = item.notes ? `${item.notes}, Cek kadar air / layu` : 'Cek kadar air / layu';
                                    updateItemRow(realIndex, 'notes', curr);
                                    updateItemRow(realIndex, 'quality_status', 'kurang');
                                  }}
                                >
                                  + Cek Sortir
                                </button>
                              </div>
                            </div>

                            {/* Detailed Quality Description Text Input */}
                            <input
                              type="text"
                              placeholder="Deskripsi kualitas (apakah barangnya bagus/segar/tidak layu)..."
                              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]/60"
                              value={item.notes || ''}
                              onChange={e => updateItemRow(realIndex, 'notes', e.target.value)}
                            />
                          </div>
                        </td>

                        {/* 8. Action */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              title="Duplikat Baris"
                              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] rounded-lg transition-colors"
                              onClick={() => duplicateItemRow(realIndex)}
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              title="Hapus Item"
                              className="p-1.5 text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                              onClick={() => removeItemRow(realIndex)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan="8" className="text-center py-12 text-[var(--text-muted)]">
                        <Package className="w-9 h-9 mx-auto mb-2 opacity-30" />
                        <p className="font-semibold text-xs">Tidak ada item yang sesuai filter.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Table Actions */}
            <div className="p-4 bg-[var(--bg-secondary)]/50 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-dashed border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex items-center justify-center gap-2 font-semibold text-xs bg-[var(--bg-primary)]"
                onClick={handleAddItemRow}
              >
                <Plus size={15} /> Tambah Baris Bahan Baru
              </button>

              <div className="flex items-center gap-3 text-xs w-full sm:w-auto justify-end">
                <span className="text-[var(--text-muted)]">
                  Total {itemsData.length} item • Estimasi: <strong className="text-[var(--text-primary)] font-mono">Rp {totalEstimatedCost.toLocaleString('id-ID')}</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-primary px-5 py-2 flex items-center gap-1.5"
                  onClick={handleSaveItems}
                  disabled={saving}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Simpan Semua Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: PREVIEW & ORDER EXPORT
         ========================================================================= */}
      {previewList && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setPreviewList(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-secondary)]/80">
              <div className="flex items-center gap-2.5">
                <FileText size={18} className="text-[var(--accent)]" />
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">{previewList.name}</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Dibuat pada {new Date(previewList.created_at).toLocaleDateString('id-ID', { dateStyle: 'full' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewList(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
              >
                <X size={17} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[var(--text-muted)] text-[10px] uppercase font-bold">
                    <tr>
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Bahan & ID</th>
                      <th className="py-2.5 px-3">Supplier & ID</th>
                      <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3">Catatan Kualitas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(previewList.market_list_items || []).map((item, idx) => {
                      const remarks = parseItemRemarks(item.remarks, item.vendor);
                      const mat = item.materials;
                      const price = Number(item.estimated_price) || Number(mat?.price) || 0;
                      const qty = Number(item.quantity || item.request_qty) || 0;
                      const subtotal = qty * price;

                      return (
                        <tr key={idx} className="hover:bg-[var(--bg-secondary)]/30">
                          <td className="py-2 px-3 text-center font-mono text-[var(--text-muted)]">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-bold text-[var(--text-primary)]">{mat?.name || 'Material'}</div>
                            <span className="text-[10px] font-mono text-[var(--accent)]">{formatMaterialId(mat || { id: item.material_id })}</span>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-[var(--text-secondary)]">{remarks.supplier_name || '-'}</div>
                            {remarks.supplier_id && (
                              <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                {formatSupplierId(remarks.supplier_id)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            Rp {price.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-semibold">
                            {qty} {item.unit || mat?.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-[var(--text-primary)]">
                            Rp {subtotal.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                remarks.quality_status === 'bagus' ? 'bg-emerald-500/10 text-emerald-600' :
                                remarks.quality_status === 'standar' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-rose-500/10 text-rose-500'
                              }`}>
                                {remarks.quality_status === 'bagus' ? 'Bagus' :
                                 remarks.quality_status === 'standar' ? 'Standar' : 'Sortir'}
                              </span>
                              <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[150px]">
                                {remarks.notes || '-'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50 flex items-center justify-between">
              <button
                type="button"
                className="btn btn-secondary text-xs flex items-center gap-1.5"
                onClick={() => copyToClipboard(generateWhatsAppOrderText(previewList))}
              >
                <Copy size={14} /> Salin Format WhatsApp / Order
              </button>
              <button
                type="button"
                className="btn btn-primary text-xs px-4"
                onClick={() => setPreviewList(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: COMPARE SUPPLIER PRICES FOR A MATERIAL
         ========================================================================= */}
      {compareModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setCompareModalItem(null)}
        >
          <div
            className="relative max-w-lg w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                  <TrendingDown size={16} className="text-[var(--accent)]" />
                  Perbandingan Harga Supplier
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Bahan: <strong className="text-[var(--text-primary)]">{compareModalItem.item.material_name}</strong> ({compareModalItem.item.material_sku})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalItem(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
              {compareModalItem.offers.map((offer, idx) => {
                const isSelected = offer.supplier_id === compareModalItem.item.supplier_id;
                const isCheapest = idx === 0;
                const diff = (compareModalItem.item.price || 0) - offer.price;

                return (
                  <div
                    key={offer.supplier_id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/5 shadow-sm'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)]'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[var(--text-primary)]">{offer.supplier_name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                          {offer.supplier_code}
                        </span>
                        {isCheapest && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            Termurah
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[var(--accent)]/15 text-[var(--accent)]">
                            Terpilih
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-xs font-mono">
                        <strong className="text-sm font-bold text-[var(--text-primary)]">
                          Rp {offer.price.toLocaleString('id-ID')}
                        </strong>
                        <span className="text-[var(--text-muted)]">/ {compareModalItem.item.unit}</span>

                        {!isSelected && diff > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                            (Lebih hemat Rp {diff.toLocaleString('id-ID')})
                          </span>
                        )}
                        {!isSelected && diff < 0 && (
                          <span className="text-rose-500 font-semibold text-[11px]">
                            (+Rp {Math.abs(diff).toLocaleString('id-ID')})
                          </span>
                        )}
                      </div>
                    </div>

                    {!isSelected && (
                      <button
                        type="button"
                        className="btn btn-primary text-xs py-1.5 px-3"
                        onClick={() => {
                          switchSupplierToCheaper(compareModalItem.realIndex, offer.supplier_id, offer.price);
                          setCompareModalItem(null);
                        }}
                      >
                        Pilih Ini
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setCompareModalItem(null)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: QUICK ADD SUPPLIER
         ========================================================================= */}
      {showAddSupplierModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setShowAddSupplierModal(false)}
        >
          <div
            className="relative max-w-md w-full bg-[var(--bg-primary)] rounded-2xl overflow-hidden border border-[var(--border)] shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-[var(--accent)]" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Tambah Supplier Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleQuickAddSupplier} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Nama Supplier <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: PT Segar Pangan Makmur"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  value={newSupplierData.name}
                  onChange={e => setNewSupplierData({ ...newSupplierData, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Nomor HP / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="0812xxxxxxxx"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  value={newSupplierData.phone}
                  onChange={e => setNewSupplierData({ ...newSupplierData, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Contact Person (PIC)
                </label>
                <input
                  type="text"
                  placeholder="Nama sales / kontak supplier"
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  value={newSupplierData.contact_person}
                  onChange={e => setNewSupplierData({ ...newSupplierData, contact_person: e.target.value })}
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Alamat / Lokasi
                </label>
                <textarea
                  rows="2"
                  placeholder="Alamat gudang / pasar / toko..."
                  className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                  value={newSupplierData.address}
                  onChange={e => setNewSupplierData({ ...newSupplierData, address: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)] mt-5">
                <button
                  type="button"
                  className="btn btn-secondary text-xs px-3.5 py-2"
                  onClick={() => setShowAddSupplierModal(false)}
                  disabled={saving}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                  disabled={saving}
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  Daftarkan Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
