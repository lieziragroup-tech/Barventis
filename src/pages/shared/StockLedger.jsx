import { useState, useMemo, useEffect } from 'react';
import {
  Search, Plus, Edit, History, X, Trash2,
  Package, UploadCloud
} from 'lucide-react';
import BulkImport from '../../components/BulkImport';
import Pagination from '../../components/shared/Pagination';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';

import { useData } from '../../contexts/DataContext';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { useAuth } from '../../contexts/AuthContext';
import { formatIDR, parsePackSize, isPackUnitConsistent, getPackUnitInfo, parseStructuredFullPack } from '../../services/costUtils';
import { api } from '../../services/api';
import { locationService } from '../../services/locationService';

// MANUAL UNIT CONVERSION (2026-08): lets a user say e.g. "1 Carton = 24 pcs"
// directly in the Add/Edit Material form instead of typing a free-text Full
// Pack string by hand. Composes `full_pack` into the structured "PackLabel =
// Qty Unit" form costUtils.js already parses (see getPackUnitInfo/
// parseStructuredFullPack) — once saved, this reaches Recipe Builder, Cost
// Control, and Waste (Daily Inventory) automatically, since all of them
// already read `full_pack`/`unit` off the same material row. Left blank,
// nothing changes: the plain "Full Pack Size" field below still works
// exactly as before for materials that don't need a pack/content split.
function KonversiSatuanFields({ packUnit, fullPack, price, onChangeFullPack }) {
  const structured = parseStructuredFullPack(fullPack);
  const isi = structured ? String(structured.contentQty) : '';
  const satuanIsi = structured ? structured.contentUnit : '';
  const label = (packUnit || '').trim() || 'Pack';

  const compose = (nextIsi, nextSatuan) => {
    const qty = parseFloat(nextIsi);
    if (nextIsi === '' || isNaN(qty) || qty <= 0) {
      onChangeFullPack('');
      return;
    }
    onChangeFullPack(`${label} = ${nextIsi}${nextSatuan ? ' ' + nextSatuan : ''}`);
  };

  const priceNum = parseFloat(price || 0);
  const pricePerContent = structured && structured.contentQty > 0 ? priceNum / structured.contentQty : null;

  return (
    <div className="form-group">
      <label className="form-label">Konversi Isi (opsional)</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>1 {label} =</span>
        <input
          type="number" min="0" step="any" className="form-control" style={{ width: '90px' }}
          placeholder="mis. 24"
          value={isi}
          onChange={e => compose(e.target.value, satuanIsi)}
        />
        <input
          type="text" list="satuan-isi-list" className="form-control" style={{ width: '110px' }}
          placeholder="pcs / gr / ml"
          value={satuanIsi}
          onChange={e => compose(isi || '1', e.target.value)}
        />
        <datalist id="satuan-isi-list">
          <option value="pcs" /><option value="gr" /><option value="ml" />
        </datalist>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
        Isi kalau 1 {label} berisi beberapa satuan kecil (mis. 1 Carton = 24 pcs) — supaya resep bisa pakai "pcs" langsung dan HPP-nya tetap benar.
        {pricePerContent != null && (
          <> &nbsp;→ {formatIDR(pricePerContent)} / {satuanIsi || 'unit'}.</>
        )}
      </div>
    </div>
  );
}

// Resolve a material's Full Pack string into a usable { size, unit, consistent }
// shape for the ledger table (same logic used in Recipes.jsx's stockMap).
function parseFullPack(fullPack, materialUnit) {
  const size = parsePackSize(fullPack);
  const consistent = isPackUnitConsistent(materialUnit, fullPack);
  const { contentUnit } = getPackUnitInfo(fullPack, materialUnit);
  return { size: size > 0 && consistent ? size : 0, unit: contentUnit, consistent };
}

export default function StockLedger() {
  const { profile } = useAuth();
  "use no memo";
  const { currentTenant, stock, loadingData, handleAdjustStock, handleUpdateItem, handleAddItem, handleDeleteItem, refreshData } = useData();
  const onAdjustStock = handleAdjustStock;
  const onUpdateItem = handleUpdateItem;
  const onAddItem = handleAddItem;
  const onDeleteItem = handleDeleteItem;

  // Dynamic Locations Management
  const [locations, setLocations] = useState(() => locationService.getLocations(currentTenant?.id));
  useEffect(() => {
    const updateLocs = () => {
      setLocations(locationService.getLocations(currentTenant?.id));
    };
    updateLocs();
    return locationService.subscribe(updateLocs);
  }, [currentTenant]);

  const [activeLoc, setActiveLoc] = useState('ALL');
  const safeActiveLoc = useMemo(() => {
    if (activeLoc === 'ALL') return 'ALL';
    return locations.some(l => l.code.toUpperCase() === activeLoc.toUpperCase()) ? activeLoc : 'ALL';
  }, [locations, activeLoc]);

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
  const [supFilter, setSupFilter] = useState('ALL');
  const [alertFilter, setAlertFilter] = useState('ALL');
  const [selectedItem, setSelectedItem] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustLoc, setAdjustLoc] = useState('RESTO');
  const [adjustType, setAdjustType] = useState('IN');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [editItem, setEditItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [dependencyDeleteModal, setDependencyDeleteModal] = useState(null);
  const [newItem, setNewItem] = useState({ name: '', category: 'Coffee & Tea', unit: 'pck', full_pack: '1000 grm', price: 0, new_price: 0, supplier: '', min_stock: 15, initial_qty_resto: 0, initial_qty_central: 0 });
  const [selectedItems, setSelectedItems] = useState([]);

  // Supplier & Purchase integration states
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseHistory, setPurchaseHistory] = useState([]);
  const [historyTab, setHistoryTab] = useState('LEDGER');

  const [expiryMap, setExpiryMap] = useState({});
  useEffect(() => {
    api.getNearestExpiry().then(setExpiryMap).catch(console.error);
  }, []);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedItem && historyTab === 'PURCHASES') {
      api.getPurchaseEntriesPaged({ material_id: selectedItem.id, pageSize: 20 })
        .then(res => setPurchaseHistory(res.data))
        .catch(console.error);
    }
  }, [selectedItem, historyTab]);

  const categories = useMemo(() => ['ALL', ...new Set(stock.map(item => item.category))], [stock]);
  const uniqueSuppliersInStock = useMemo(() => ['ALL', ...new Set(stock.map(item => item.supplier).filter(Boolean))], [stock]);

  // Filtered stock with dynamic location awareness
  const filteredStock = useMemo(() => stock.filter(item => {
    const rQty = item.qty_resto || 0;
    const cQty = item.qty_central || 0;
    const totalQty = rQty + cQty;
    const minLevel = item.min_stock || 15;
    const matchesSearch = (item.name || '').toLowerCase().includes(search.toLowerCase()) || (item.supplier || '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = catFilter === 'ALL' || item.category === catFilter;
    const matchesSup = supFilter === 'ALL' || item.supplier === supFilter;

    // Evaluate stock alerts based on active location view
    let evalQty = totalQty;
    if (safeActiveLoc === 'RESTO') evalQty = rQty;
    else if (safeActiveLoc === 'CENTRAL') evalQty = cQty;

    let matchesAlert = true;
    if (alertFilter === 'CRITICAL') matchesAlert = evalQty === 0;
    else if (alertFilter === 'WARNING') matchesAlert = evalQty > 0 && evalQty < minLevel;
    else if (alertFilter === 'SAFE') matchesAlert = evalQty >= minLevel;

    // Location filtering logic
    let matchesLoc;
    if (safeActiveLoc === 'ALL' || safeActiveLoc === 'RESTO' || safeActiveLoc === 'CENTRAL') {
      matchesLoc = true;
    } else if (safeActiveLoc === 'KITCHEN') {
      const cat = (item.category || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      const loc = (item.location || item.storage_location || item.notes || '').toLowerCase();
      const kitchenKeywords = [
        'food', 'meat', 'poultry', 'seafood', 'vegetable', 'sauce', 'dairy', 'bakery', 
        'spice', 'seasoning', 'dapur', 'kitchen', 'bahan makanan', 'ayam', 'daging', 
        'ikan', 'sayur', 'bumbu', 'telur', 'beras', 'minyak', 'fresh', 'chilled', 'frozen', 
        'pasta', 'flour', 'tepung', 'buah', 'fruit', 'cooking', 'masak'
      ];
      matchesLoc = loc.includes('kitchen') || loc.includes('dapur') || kitchenKeywords.some(kw => cat.includes(kw) || name.includes(kw));
    } else if (safeActiveLoc === 'SERVICE') {
      const cat = (item.category || '').toLowerCase();
      const name = (item.name || '').toLowerCase();
      const loc = (item.location || item.storage_location || item.notes || '').toLowerCase();
      const serviceKeywords = [
        'beverage', 'coffee', 'tea', 'syrup', 'bar', 'packaging', 'cup', 'straw', 
        'tissue', 'service', 'minuman', 'consumable', 'sirup', 'susu', 'sedotan', 'gelas', 'takeaway', 'plastik', 'paper', 'napkin'
      ];
      matchesLoc = loc.includes('service') || loc.includes('bar') || loc.includes('floor') || serviceKeywords.some(kw => cat.includes(kw) || name.includes(kw));
    } else {
      // Custom location created in admin (e.g. PASTRY, CHILLER, BAR_2)
      const loc = (item.location || item.storage_location || item.notes || item.category || '').toLowerCase();
      const target = safeActiveLoc.toLowerCase();
      matchesLoc = loc.includes(target);
    }

    return matchesSearch && matchesCat && matchesSup && matchesAlert && matchesLoc;
  }), [stock, search, catFilter, supFilter, alertFilter, safeActiveLoc]);

  const PAGE_SIZE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  const paginatedStock = useMemo(() => {
    const start = (currentPage - 1) * 20;
    return filteredStock.slice(start, start + 20);
  }, [filteredStock, currentPage]);

  const toggleSelectAll = (e) => {
    if (e.target.checked) setSelectedItems(filteredStock.map(i => i.name));
    else setSelectedItems([]);
  };

  const toggleSelectItem = (name) => {
    setSelectedItems(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const handleAttemptDelete = async (itemName) => {
    if (!confirm(`Hapus "${itemName}" dari inventory?`)) return;
    try {
      await onDeleteItem(itemName);
    } catch (err) {
      if (err.hasDependencies) {
        setDependencyDeleteModal({ name: itemName, count: err.dependencyCount });
      } else {
        alert(err.message);
      }
    }
  };

  const confirmForceDelete = async () => {
    if (!dependencyDeleteModal) return;
    try {
      await onDeleteItem(dependencyDeleteModal.name, true);
      setDependencyDeleteModal(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Hapus ${selectedItems.length} bahan terpilih secara permanen?`)) return;

    let failedCount = 0;
    let failedNames = [];
    
    for (const name of selectedItems) {
      try {
        await onDeleteItem(name);
      } catch {
        failedCount++;
        failedNames.push(name);
      }
    }
    
    if (failedCount > 0) {
      alert(`Berhasil menghapus ${selectedItems.length - failedCount} bahan. ${failedCount} bahan gagal dihapus karena masih digunakan di resep.`);
    } else {
      alert(`Berhasil menghapus ${selectedItems.length} bahan.`);
    }
    
    setSelectedItems(prev => prev.filter(name => failedNames.includes(name)));
  };

  // Adjust submit
  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustItem || !adjustQty || isNaN(adjustQty)) return;
    if (!window.confirm(`Konfirmasi penyesuaian stok untuk ${adjustItem.name}?`)) return;
    try {
      await onAdjustStock(adjustItem.name, adjustLoc, adjustType, parseFloat(adjustQty), adjustNotes);
      setAdjustItem(null); setAdjustQty(''); setAdjustNotes('');
    } catch (err) {
      alert("Gagal menyimpan penyesuaian stok: " + err.message);
    }
  };

  // Edit item submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editItem) return;
    if (!window.confirm(`Simpan perubahan konfigurasi untuk ${editItem.name}?`)) return;
    
    try {
      // First, handle stock adjustments if they changed the physical stock fields
      const originalItem = stock.find(s => s.id === editItem.id);
      if (originalItem) {
        const oldResto = originalItem.qty_resto || 0;
        const newResto = editItem.qty_resto !== undefined ? editItem.qty_resto : oldResto;
        const diffResto = newResto - oldResto;
        if (diffResto !== 0) {
          const type = diffResto > 0 ? 'IN' : 'OUT';
          await onAdjustStock(originalItem.name, 'RESTO', type, Math.abs(diffResto), 'Penyesuaian stok fisik via Edit Configuration');
        }

        const oldCentral = originalItem.qty_central || 0;
        const newCentral = editItem.qty_central !== undefined ? editItem.qty_central : oldCentral;
        const diffCentral = newCentral - oldCentral;
        if (diffCentral !== 0) {
          const type = diffCentral > 0 ? 'IN' : 'OUT';
          await onAdjustStock(originalItem.name, 'CENTRAL', type, Math.abs(diffCentral), 'Penyesuaian stok fisik via Edit Configuration');
        }
      }
      
      // Clean up temporary stock fields before updating
      const updatePayload = { ...editItem };
      delete updatePayload.qty_resto; 
      delete updatePayload.qty_central;
      
      await onUpdateItem(updatePayload);
      setEditItem(null);
    } catch (err) {
      alert("Gagal menyimpan: " + err.message);
    }
  };

  // Add item submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    // Client-side duplicate check before hitting the DB
    const isDuplicate = stock.some(
      item => item.name.trim().toLowerCase() === newItem.name.trim().toLowerCase()
    );
    if (isDuplicate) {
      alert(`Bahan dengan nama "${newItem.name}" sudah ada di inventory. Gunakan nama yang berbeda atau edit bahan yang sudah ada.`);
      return;
    }

    if (!window.confirm(`Konfirmasi penambahan bahan baku baru: ${newItem.name}?`)) return;
    try {
      const payload = { ...newItem, new_price: newItem.price };
      delete payload.initial_qty_resto;
      delete payload.initial_qty_central;

      const createdMaterial = await onAddItem(payload);

      // Add initial stock if configured, passing the returned material object to avoid state-lag
      if (newItem.initial_qty_resto > 0) {
        await onAdjustStock(createdMaterial, 'RESTO', 'IN', newItem.initial_qty_resto, 'Stok awal saat penambahan bahan');
      }
      if (newItem.initial_qty_central > 0) {
        await onAdjustStock(createdMaterial, 'CENTRAL', 'IN', newItem.initial_qty_central, 'Stok awal saat penambahan bahan');
      }

      setShowAddModal(false);
      setNewItem({ name: '', category: 'Coffee & Tea', unit: 'pck', full_pack: '1000 grm', price: 0, new_price: 0, supplier: '', min_stock: 15, initial_qty_resto: 0, initial_qty_central: 0 });
    } catch (err) {
      // Friendly message for DB-level duplicate (race condition edge case)
      if (err.message?.includes('duplicate key') || err.message?.includes('unique constraint')) {
        alert(`Bahan "${newItem.name}" sudah ada di inventory. Gunakan nama yang berbeda.`);
      } else {
        alert("Gagal menambahkan bahan: " + err.message);
      }
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      let rowNum = 1;
      const data = filteredStock.map(item => {
        const rQty = item.qty_resto || 0;
        const cQty = item.qty_central || 0;
        const total = rQty + cQty;
        const minLevel = item.min_stock || 15;
        let statusLabel = 'AMAN';
        if (total === 0) statusLabel = 'HABIS (KRITIS)';
        else if (total < minLevel) statusLabel = 'MENIPIS (WARNING)';

        const parsed = parseFullPack(item.full_pack, item.unit);
        const conversionLabel = parsed.size > 0 ? `${(total * parsed.size).toLocaleString('id-ID')} ${parsed.unit}` : '-';
        const price = item.new_price || item.price || 0;
        const totalVal = total * price;

        return {
          'NO': rowNum++,
          'KODE / SKU': item.sku || item.id?.slice(0, 8) || '-',
          'NAMA BAHAN BAKU': item.name,
          'KATEGORI': item.category || '-',
          'SUPPLIER': item.supplier || '-',
          'STOK RESTO': rQty,
          'STOK CENTRAL': cQty,
          'TOTAL STOK (PACK)': total,
          'SATUAN PACK': item.unit || 'pck',
          'UKURAN PACK': item.full_pack || '-',
          'KONVERSI RESEP': conversionLabel,
          'MINIMUM STOK': minLevel,
          'STATUS STOK': statusLabel,
          'HARGA SATUAN (RP)': price,
          'TOTAL NILAI STOK (RP)': totalVal
        };
      });

      const locSuffix = activeLoc !== 'ALL' ? `_${activeLoc}` : '';
      const catSuffix = catFilter !== 'ALL' ? `_${catFilter.replace(/[^a-zA-Z0-9]/g, '')}` : '';

      await exportWithAudit({
        format: 'excel',
        filename: `Laporan_Stok_Ledger${locSuffix}${catSuffix}`,
        sheets: [{ name: 'Stok Gudang', rows: data }],
        actionName: 'Stock Ledger Export Excel',
        role: profile?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error('Export failed', err);
      alert('Gagal mengekspor data: ' + err.message);
    }
  };
  
  const handleExportPDF = async () => {
    try {
      const columns = [
        { key: 'no', label: '#' },
        { key: 'name', label: 'Nama Bahan Baku' },
        { key: 'category', label: 'Kategori' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'resto', label: 'Resto' },
        { key: 'central', label: 'Central' },
        { key: 'total', label: 'Total' },
        { key: 'price', label: 'Harga Satuan' },
        { key: 'status', label: 'Status' }
      ];
      let rowNum = 1;
      const rows = filteredStock.map(item => {
        const rQty = item.qty_resto || 0;
        const cQty = item.qty_central || 0;
        const total = rQty + cQty;
        const minLevel = item.min_stock || 15;
        let statusText = 'Aman';
        if (total === 0) statusText = 'Habis';
        else if (total < minLevel) statusText = 'Menipis';

        return {
          no: rowNum++,
          name: item.name,
          category: item.category || '-',
          supplier: item.supplier || '-',
          resto: `${rQty} ${item.unit || ''}`,
          central: `${cQty} ${item.unit || ''}`,
          total: `${total} ${item.unit || ''}`,
          price: `Rp ${(item.new_price || item.price || 0).toLocaleString('id-ID')}`,
          status: statusText
        };
      });

      const locText = activeLoc === 'ALL' ? 'Semua Gudang' : activeLoc;
      const catText = catFilter === 'ALL' ? 'Semua Kategori' : catFilter;
      const queryText = search ? ` | Pencarian: "${search}"` : '';

      await exportWithAudit({
        format: 'pdf',
        filename: `Laporan_Stok_Ledger_${activeLoc}`,
        title: `Laporan Stok Barang (Stock Ledger)\nLokasi: ${locText} | Kategori: ${catText}${queryText} (${rows.length} item)`,
        tenantName: 'BARVENTIS - Sistem Manajemen Gudang',
        columns,
        rows,
        actionName: 'Stock Ledger Export PDF',
        role: profile?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error('Export PDF failed', err);
      alert('Gagal mengekspor PDF: ' + err.message);
    }
  };

  const [itemHistory, setItemHistory] = useState([]);
  const [ledgerLocationFilter, setLedgerLocationFilter] = useState('ALL');

  useEffect(() => {
    if (selectedItem && historyTab === 'LEDGER') {
      api.getTransactionsPaged({ 
        materialName: selectedItem.name, 
        pageSize: 50,
        location: ledgerLocationFilter !== 'ALL' ? ledgerLocationFilter : null
      }).then(res => setItemHistory(res.data)).catch(console.error);
    }
  }, [selectedItem, historyTab, ledgerLocationFilter]);

  return (
    <div className="stock-ledger-layout fade-in" style={{ display: 'flex', gap: '24px', position: 'relative' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Filters */}
        <div className="glass-card" style={{ marginBottom: '24px', padding: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            {selectedItems.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedItems.length} Item Terpilih</span>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }} onClick={handleBulkDelete}>
                  <Trash2 size={14} style={{ marginRight: '6px' }}/> Hapus Terpilih
                </button>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setSelectedItems([])}>Batal (Unselect)</button>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                  <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input type="text" placeholder="Search materials or suppliers..." className="form-control" style={{ paddingLeft: '44px' }} value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} />
                </div>
                <select className="form-control" style={{ width: '170px' }} value={catFilter} onChange={e => { setCatFilter(e.target.value); setCurrentPage(1); }}>
                  {categories.map(cat => <option key={cat} value={cat}>{cat === 'ALL' ? 'All Categories' : cat}</option>)}
                  {!categories.includes('BEER') && <option value="BEER">BEER</option>}
                </select>
                <select className="form-control" style={{ width: '170px' }} value={supFilter} onChange={e => { setSupFilter(e.target.value); setCurrentPage(1); }}>
                  {uniqueSuppliersInStock.map(sup => <option key={sup} value={sup}>{sup === 'ALL' ? 'All Suppliers' : sup}</option>)}
                </select>
                <select className="form-control" style={{ width: '150px' }} value={alertFilter} onChange={e => { setAlertFilter(e.target.value); setCurrentPage(1); }}>
                  <option value="ALL">All Status</option>
                  <option value="SAFE">Safe</option>
                  <option value="WARNING">Low Stock</option>
                  <option value="CRITICAL">Out of Stock</option>
                </select>
                <select 
                  className="form-control" 
                  style={{ width: '170px' }} 
                  value={safeActiveLoc} 
                  onChange={e => { setActiveLoc(e.target.value); setCurrentPage(1); }}
                >
                  {locations.map(loc => (
                    <option key={loc.code} value={loc.code}>
                      {loc.code === 'ALL' ? 'All Locations' : loc.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={() => setShowAddModal(true)}>
                  <Plus size={14} style={{ marginRight: '4px' }}/> Tambah Bahan
                </button>
                <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={() => setShowBulkImport(true)}>
                  <UploadCloud size={14} style={{ marginRight: '4px' }}/> Bulk Import
                </button>
                <ExportButton 
                  onExportExcel={handleExportExcel} 
                  onExportPDF={handleExportPDF} 
                  currentRole={profile?.role || 'SuperAdmin'} 
                />
                <PrintButton
                  currentRole={profile?.role || 'SuperAdmin'}
                  title="Cetak kartu stok bahan (Stock Ledger)"
                />
              </>
            )}
          </div>
        </div>

        {/* Print-only Document Header */}
        <div className="print-only print-header">
          <div className="print-header-brand">BARVENTIS — SISTEM MANAJEMEN GUDANG</div>
          <div style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>Laporan Kartu Stok Bahan Baku (Stock Ledger)</div>
          <div className="print-header-meta">
            Lokasi: {activeLoc} | Kategori: {catFilter} | Pencarian: {search || 'Semua'} | Tanggal Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
          </div>
        </div>

        {/* Stock Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container relative">
            <TableLoadingOverlay loading={loadingData && stock.length > 0} message="Menyinkronkan stok bahan..." />
            {/* STOCK TABLE */}
            <table className="custom-table">
              <thead>
                <tr>
                  <th className="no-print" style={{ width: '40px', textAlign: 'center', padding: '14px 10px' }}>
                    <input type="checkbox" checked={filteredStock.length > 0 && selectedItems.length === filteredStock.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Material Name</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>{activeLoc === 'ALL' ? 'Stock (Pack)' : `Stok (${activeLoc})`}</th>
                  <th style={{ textAlign: 'right' }}>Stock (Converted)</th>
                  <th style={{ textAlign: 'right' }}>Price/Pack</th>
                  <th style={{ textAlign: 'center' }}>Expiry / Status</th>
                  <th className="no-print" style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingData && stock.length === 0 ? (
                  <TableSkeletonRows
                    rows={8}
                    columns={[
                      { width: '40px', type: 'checkbox' },
                      { width: '220px', type: 'dual-text' },
                      { width: '130px', type: 'text' },
                      { width: '140px', type: 'text' },
                      { width: '110px', type: 'text', align: 'right' },
                      { width: '130px', type: 'text', align: 'right' },
                      { width: '110px', type: 'text', align: 'right' },
                      { width: '120px', type: 'badge' },
                      { width: '160px', type: 'actions' }
                    ]}
                  />
                ) : (
                  paginatedStock.map(item => {
                  const rQty = item.qty_resto || 0;
                  const cQty = item.qty_central || 0;
                  const total = rQty + cQty;
                  const min = item.min_stock || 15;
                  const locQty = activeLoc === 'RESTO' ? rQty : (activeLoc === 'CENTRAL' ? cQty : total);
                  const pack = parseFullPack(item.full_pack, item.unit);
                  const convertedTotal = locQty * pack.size;
                  const convertedUnit = pack.unit.toUpperCase();

                  let badge = <span className="badge badge-success">Safe</span>;
                  if (locQty === 0) badge = <span className="badge badge-danger">Out</span>;
                  else if (locQty < min) badge = <span className="badge badge-warning">Low</span>;

                  // Expiry visual
                  const nearestExpiry = expiryMap[item.id];
                  const daysToExpiry = nearestExpiry
                    ? Math.ceil((new Date(nearestExpiry) - new Date()) / 86400000)
                    : null;

                  let expiryBadge;
                  if (daysToExpiry === null) {
                    expiryBadge = <div style={{width: 10, height: 10, borderRadius: '50%', background: '#9ca3af', display: 'inline-block'}} title="Tidak ada data" />;
                  } else if (daysToExpiry > 14) {
                    expiryBadge = <div style={{width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block'}} title="Aman (>14 hari)" />;
                  } else if (daysToExpiry >= 4) {
                    expiryBadge = <div style={{width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block'}} title="Peringatan (4-14 hari)" />;
                  } else {
                    expiryBadge = <div style={{width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'pulse 2s infinite'}} title="Kritis (<=3 hari)" />;
                  }

                  return (
                    <tr key={item.id ?? item.name} style={{ background: selectedItems.includes(item.name) ? 'rgba(59,130,246,0.05)' : 'transparent', transition: 'background 0.2s' }}>
                      <td className="no-print" style={{ textAlign: 'center', padding: '14px 10px' }}>
                        <input type="checkbox" checked={selectedItems.includes(item.name)} onChange={() => toggleSelectItem(item.name)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                            {item.sku || ('#MAT-' + String(item.id || '').slice(0, 6).toUpperCase())}
                          </span>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.full_pack || item.unit} / {item.unit}</div>
                      </td>
                      <td><span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{item.category}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.supplier}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: locQty < min ? 'var(--warning)' : 'var(--text-primary)' }}>
                          {locQty.toFixed(1)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.unit}</span>
                        </div>
                        {activeLoc === 'ALL' ? (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            R: {rQty.toFixed(0)} | C: {cQty.toFixed(0)}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600 }}>
                            {activeLoc === 'RESTO' ? `Resto: ${rQty.toFixed(0)}` : activeLoc === 'CENTRAL' ? `Central: ${cQty.toFixed(0)}` : `Area: ${activeLoc}`}
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 500, color: 'var(--accent)' }}>
                          {convertedTotal.toFixed(0)} <span style={{ fontSize: '0.7rem' }}>{convertedUnit}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {formatIDR(item.new_price || item.price)}
                      </td>
                      <td style={{ textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                        {expiryBadge} {badge}
                      </td>
                      <td style={{ textAlign: 'center' }} className="no-print">
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="Edit Item" onClick={() => setEditItem({ ...item, originalName: item.name })}>
                            <Edit size={13} />
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="Adjust Stock" onClick={() => { setAdjustItem(item); setAdjustLoc(activeLoc !== 'ALL' ? activeLoc : 'RESTO'); }}>
                            <Package size={13} />
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="History" onClick={() => { setSelectedItem(item); setLedgerLocationFilter(safeActiveLoc); }}>
                            <History size={13} />
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }} title="Delete" onClick={() => handleAttemptDelete(item.name)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
                {!loadingData && filteredStock.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Package size={28} style={{ opacity: 0.35 }} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Tidak ada bahan baku ditemukan</span>
                        <span style={{ fontSize: '0.75rem', maxWidth: '380px', color: 'var(--text-secondary)' }}>
                          {safeActiveLoc !== 'ALL'
                            ? `Tidak ada item yang sesuai untuk filter lokasi "${safeActiveLoc}".`
                            : 'Coba sesuaikan kata kunci pencarian atau filter kategori Anda.'}
                        </span>
                        {safeActiveLoc !== 'ALL' && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ marginTop: '6px', fontSize: '0.75rem', padding: '4px 12px' }}
                            onClick={() => setActiveLoc('ALL')}
                          >
                            Tampilkan Semua Lokasi
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '0 20px 16px' }}>
            <Pagination
              page={currentPage}
              pageSize={PAGE_SIZE}
              totalCount={filteredStock.length}
              onPageChange={setCurrentPage}
              itemLabel="bahan"
            />
          </div>
        </div>
      </div>

      {/* History Side Panel */}
      {selectedItem && (
        <div className="glass-card stock-ledger-detail-panel no-print" style={{ width: '360px', flexShrink: 0, position: 'sticky', top: 0, height: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Stock Audit</h3>
            <button className="btn btn-secondary" style={{ padding: '4px', borderRadius: '50%' }} onClick={() => setSelectedItem(null)}><X size={16} /></button>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
                {selectedItem.sku || ('#MAT-' + String(selectedItem.id || '').slice(0, 8).toUpperCase())}
              </span>
              <h4 style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>{selectedItem.name}</h4>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{selectedItem.category} · {selectedItem.supplier}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Pack: {selectedItem.full_pack || selectedItem.unit}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Resto</div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{(selectedItem.qty_resto || 0).toFixed(1)} {selectedItem.unit}</div></div>
              <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Central</div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{(selectedItem.qty_central || 0).toFixed(1)} {selectedItem.unit}</div></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            <button className={`btn ${historyTab === 'LEDGER' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1 }} onClick={() => setHistoryTab('LEDGER')}>Mutasi Stok</button>
            <button className={`btn ${historyTab === 'PURCHASES' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 8px', fontSize: '0.75rem', flex: 1 }} onClick={() => setHistoryTab('PURCHASES')}>Riwayat Pembelian</button>
          </div>
          {historyTab === 'LEDGER' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', padding: '0 2px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Filter Lokasi:</span>
              <select
                className="form-control"
                style={{ padding: '2px 8px', fontSize: '0.7rem', height: '26px', width: 'auto', flex: 1, maxWidth: '180px' }}
                value={ledgerLocationFilter}
                onChange={e => setLedgerLocationFilter(e.target.value)}
              >
                {locations.map(l => (
                  <option key={l.code} value={l.code}>{l.shortName || l.name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {historyTab === 'LEDGER' && itemHistory.map(tx => (
              <div key={tx.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border)' }}>
                      #{String(tx.id || '').slice(0, 8)}
                    </span>
                    <span style={{ fontWeight: 600 }}>{tx.type}</span>
                  </div>
                  <span style={{ color: tx.qty > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{tx.qty > 0 ? `+${tx.qty}` : tx.qty}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{tx.location} · {tx.date}</div>
                {tx.notes && <div style={{ fontSize: '0.65rem', marginTop: '4px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{tx.notes}"</div>}
              </div>
            ))}
            {historyTab === 'LEDGER' && itemHistory.length === 0 && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>No history.</div>}
            
            {historyTab === 'PURCHASES' && purchaseHistory.map(p => (
              <div key={p.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border)' }}>
                      #{String(p.id || '').slice(0, 8)}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{p.suppliers?.name || 'Tunai / Tanpa Supplier'}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--success)' }}>+{p.qty} {p.unit}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.date}</span>
                  <span style={{ fontWeight: 600 }}>{formatIDR(p.qty * p.unit_price)}</span>
                </div>
                {p.notes && <div style={{ fontSize: '0.65rem', marginTop: '4px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{p.notes}"</div>}
              </div>
            ))}
            {historyTab === 'PURCHASES' && purchaseHistory.length === 0 && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Belum ada riwayat pembelian dari supplier.</div>}
          </div>
        </div>
      )}

      {/* Adjust Stock Slide-over Modal */}
      {adjustItem && (
        <div onClick={() => { setAdjustItem(null); setAdjustQty(''); setAdjustNotes(''); }} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Adjust Stock</h3>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setAdjustItem(null)}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: '20px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Material</span>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>{adjustItem.name}</div>
            </div>
            <form onSubmit={handleAdjustSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Location</label>
                <select className="form-control" value={adjustLoc} onChange={e => setAdjustLoc(e.target.value)}>
                  {locations.filter(l => l.code !== 'ALL').map(l => (
                    <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-control" value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                  <optgroup label="Stok Masuk">
                    <option value="IN">Stock In (Purchase / Manual)</option>
                    <option value="TRANSFER">Transfer Antar Lokasi</option>
                  </optgroup>
                  <optgroup label="Stok Keluar (Pengurangan)">
                    <option value="OUT">Stock Out (Lain-lain)</option>
                    <option value="WASTE">Basi / Kualitas Drop (Waste)</option>
                    <option value="BREAKAGE">Pecah / Rusak (Breakage)</option>
                    <option value="EXPIRED">Kedaluwarsa (Expired)</option>
                    <option value="COMP">Makan Karyawan / Tester (Comp)</option>
                  </optgroup>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Qty ({adjustItem.unit})</label>
                <input type="number" step="any" className="form-control" placeholder="Enter quantity..." required value={adjustQty} onChange={e => setAdjustQty(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows="3" placeholder="Reason..." value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setAdjustItem(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px', fontWeight: 700 }}>Process Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Slide-over Modal */}
      {editItem && (
        <div onClick={() => setEditItem(null)} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '450px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Edit Material</h3>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setEditItem(null)}><X size={16} /></button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Material Name</label>
                <input type="text" className="form-control" value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={editItem.category} onChange={e => setEditItem({ ...editItem, category: e.target.value })}>
                  {[...new Set(stock.map(s => s.category))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Supplier (Master Data)</label>
                <input type="text" list="supplier-list-edit" className="form-control" placeholder="Pilih atau ketik supplier..." value={editItem.supplier} onChange={e => setEditItem({ ...editItem, supplier: e.target.value })} />
                <datalist id="supplier-list-edit">
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </datalist>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Pack Unit</label>
                  <input
                    type="text" list="pack-unit-list-edit" className="form-control"
                    placeholder="mis. Carton, pck, kaleng"
                    value={editItem.unit || ''}
                    onChange={e => {
                      const newUnit = e.target.value;
                      // Keep the pack-label side of a structured "X = Y unit"
                      // Full Pack in sync with this field, so they never disagree.
                      const structured = parseStructuredFullPack(editItem.full_pack);
                      const newFullPack = structured
                        ? `${newUnit} = ${structured.contentQty}${structured.contentUnit ? ' ' + structured.contentUnit : ''}`
                        : editItem.full_pack;
                      setEditItem({ ...editItem, unit: newUnit, full_pack: newFullPack });
                    }}
                  />
                  <datalist id="pack-unit-list-edit">
                    {['pck', 'Btl', 'Carton', 'kaleng', 'pcs', 'Galon', 'Kg', 'gr', 'ml'].map(u => <option key={u} value={u} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Full Pack Size</label>
                  <input type="text" className="form-control" placeholder="e.g. 1000 grm" value={editItem.full_pack || ''} onChange={e => setEditItem({ ...editItem, full_pack: e.target.value })} />
                </div>
              </div>
              <KonversiSatuanFields
                packUnit={editItem.unit}
                fullPack={editItem.full_pack}
                price={editItem.new_price ?? editItem.price}
                onChangeFullPack={fp => setEditItem({ ...editItem, full_pack: fp })}
              />
              <div className="form-group">
                <label className="form-label">Min Stock</label>
                <input type="number" className="form-control" value={editItem.min_stock || 15} onChange={e => setEditItem({ ...editItem, min_stock: parseInt(e.target.value) || 15 })} />
              </div>
              
              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>Set Stok Fisik Aktual (Opsional)</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Jika angka diubah, sistem otomatis membuat log penyesuaian (Adjustment) ke master.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group mb-0">
                    <label className="form-label" style={{fontSize: '0.75rem'}}>Stok Resto Bar</label>
                    <input type="number" step="any" className="form-control" 
                      value={editItem.qty_resto !== undefined ? editItem.qty_resto : (stock.find(s => s.id === editItem.id)?.qty_resto || 0)} 
                      onChange={e => setEditItem({ ...editItem, qty_resto: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label" style={{fontSize: '0.75rem'}}>Stok Central</label>
                    <input type="number" step="any" className="form-control" 
                      value={editItem.qty_central !== undefined ? editItem.qty_central : (stock.find(s => s.id === editItem.id)?.qty_central || 0)} 
                      onChange={e => setEditItem({ ...editItem, qty_central: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Harga Lama (IDR)</label>
                  <input type="number" className="form-control" value={editItem.price || 0} readOnly style={{ color: 'var(--text-muted)' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga Baru (IDR)</label>
                  <input type="number" className="form-control" value={editItem.new_price || 0} onChange={e => setEditItem({ ...editItem, new_price: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setEditItem(null)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px', fontWeight: 700 }}>Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Material Slide-over Modal */}
      {showAddModal && (
        <div onClick={() => { setShowAddModal(false); setNewItem({ name: '', category: 'Coffee & Tea', unit: 'pck', full_pack: '1000 grm', price: 0, new_price: 0, supplier: '', min_stock: 15, initial_qty_resto: 0, initial_qty_central: 0 }); }} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '450px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Tambah Bahan Baru</h3>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Nama Material</label>
                <input type="text" className="form-control" required placeholder="e.g. Vanilla Extract" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-control" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
                  {[...new Set(stock.map(s => s.category))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Supplier (Master Data)</label>
                <input type="text" list="supplier-list-add" className="form-control" placeholder="Pilih atau ketik nama supplier" value={newItem.supplier} onChange={e => setNewItem({ ...newItem, supplier: e.target.value })} />
                <datalist id="supplier-list-add">
                  {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </datalist>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Pack Unit</label>
                  <input
                    type="text" list="pack-unit-list-add" className="form-control"
                    placeholder="mis. Carton, pck, kaleng"
                    value={newItem.unit}
                    onChange={e => {
                      const newUnit = e.target.value;
                      const structured = parseStructuredFullPack(newItem.full_pack);
                      const newFullPack = structured
                        ? `${newUnit} = ${structured.contentQty}${structured.contentUnit ? ' ' + structured.contentUnit : ''}`
                        : newItem.full_pack;
                      setNewItem({ ...newItem, unit: newUnit, full_pack: newFullPack });
                    }}
                  />
                  <datalist id="pack-unit-list-add">
                    {['pck', 'Btl', 'Carton', 'kaleng', 'pcs', 'Galon', 'Kg', 'gr', 'ml'].map(u => <option key={u} value={u} />)}
                  </datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">Full Pack Size</label>
                  <input type="text" className="form-control" placeholder="e.g. 1000 grm" value={newItem.full_pack} onChange={e => setNewItem({ ...newItem, full_pack: e.target.value })} />
                </div>
              </div>
              <KonversiSatuanFields
                packUnit={newItem.unit}
                fullPack={newItem.full_pack}
                price={newItem.price}
                onChangeFullPack={fp => setNewItem({ ...newItem, full_pack: fp })}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Min Stock</label>
                  <input type="number" className="form-control" value={newItem.min_stock} onChange={e => setNewItem({ ...newItem, min_stock: parseInt(e.target.value) || 15 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Harga (IDR)</label>
                  <input type="number" className="form-control" placeholder="Harga beli" value={newItem.price || ''} onChange={e => setNewItem({ ...newItem, price: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>Set Stok Awal (Opsional)</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group mb-0">
                    <label className="form-label" style={{fontSize: '0.75rem'}}>Stok Resto Bar</label>
                    <input type="number" step="any" className="form-control"
                      value={newItem.initial_qty_resto}
                      onChange={e => setNewItem({ ...newItem, initial_qty_resto: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label" style={{fontSize: '0.75rem'}}>Stok Central</label>
                    <input type="number" step="any" className="form-control"
                      value={newItem.initial_qty_central}
                      onChange={e => setNewItem({ ...newItem, initial_qty_central: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '12px' }} onClick={() => setShowAddModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px', fontWeight: 700 }}>Tambah ke Inventory</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="materials"
        title="Bulk Import / Sync Bahan Baku"
        description="Upload master data bahan baku sekaligus dari file Excel. Anda juga dapat menambahkan kolom 'qty_resto' di Excel untuk langsung mengatur stok awal (opsional)."
        currentData={stock}
        onCommit={async (rows) => {
          const res = await api.bulkImportMaterials(rows);
          if (res.success > 0) refreshData();
          return res;
        }}
        expectedColumns={[
          { key: 'NO', label: 'NO', required: false, type: 'number', description: 'Nomor', sample: 1 },
          { key: 'sku', label: 'KODE ITEM', required: false, type: 'string', description: 'Kode/ID unik bahan baku (opsional) — dipakai resep untuk mencocokkan bahan secara otomatis & integrasi backend lain. Kosongkan untuk bahan lama tanpa kode.', sample: 'MTR-0001' },
          { key: 'name', label: 'NAMA ITEM', required: true, type: 'string', description: 'Nama unik bahan baku', sample: 'Espresso Bean' },
          { key: 'category', label: 'Kategori', required: true, type: 'string', description: 'Kategori (Coffee, Milk, dll)', sample: 'Coffee & Tea' },
          { key: 'supplier', label: 'SUPPLIER', required: false, type: 'string', description: 'Nama supplier', sample: 'Vendor A' },
          { key: 'unit', label: 'UNIT', required: true, type: 'string', description: 'Satuan beli (pck, btl, ltr, dll)', sample: 'kg' },
          { key: 'full_pack', label: 'Full', required: false, type: 'string', description: 'Isi per pack. Format bebas (1000 gr) untuk kasus sederhana, atau format terstruktur "PackLabel = Qty Satuan" (mis. "Carton = 24 pcs") kalau 1 pack berisi beberapa satuan kecil — sama dengan kolom Konversi Isi di halaman Materials.', sample: 'Carton = 24 pcs' },
          { key: 'price', label: 'Price', required: true, type: 'number', description: 'Harga beli (angka)', sample: 120000 },
          { key: 'min_stock', label: 'Min Stock', required: false, type: 'number', description: 'Batas alert stok minimum', sample: 5 },
          { key: 'qty_resto', label: 'Stok Awal', required: false, type: 'number', description: 'Stok awal gudang/resto (opsional)', sample: 10 }
        ]}
      />

      {/* Force Delete Dependency Modal */}
      {dependencyDeleteModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card modal-card" style={{ width: '400px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', padding: '24px', border: '1px solid var(--danger)' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '50%' }}>
                <Trash2 size={24} style={{ color: 'var(--danger)' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--danger)' }}>Hapus Paksa Bahan Baku?</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Bahan baku <strong>"{dependencyDeleteModal.name}"</strong> saat ini masih digunakan di <strong>{dependencyDeleteModal.count} resep aktif</strong>.
                  <br /><br />
                  Jika Anda melanjutkan, bahan ini akan <strong>dihapus dari semua resep</strong> tersebut secara otomatis. Tindakan ini tidak bisa dibatalkan!
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDependencyDeleteModal(null)}>Batal</button>
              <button type="button" className="btn btn-danger" style={{ background: 'var(--danger)', color: 'white' }} onClick={confirmForceDelete}>Ya, Hapus Paksa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}