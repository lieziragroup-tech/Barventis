import { useState, useMemo } from 'react';
import {
  Search, Plus, Edit, History, X, Download, Trash2,
  Package, UploadCloud
} from 'lucide-react';
import BulkImport from '../../components/BulkImport';

let _XLSX;
const getXLSX = async () => { if (!_XLSX) _XLSX = await import('xlsx'); return _XLSX; };
import { useData } from '../../contexts/DataContext';
import { formatIDR } from '../../services/costUtils';
import { api } from '../../services/api';

export default function StockLedger() {
  const { stock, transactions, handleAdjustStock, handleUpdateItem, handleAddItem, handleDeleteItem, refreshData } = useData();
  const onAdjustStock = handleAdjustStock;
  const onUpdateItem = handleUpdateItem;
  const onAddItem = handleAddItem;
  const onDeleteItem = handleDeleteItem;

  const [activeLoc, setActiveLoc] = useState('ALL');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('ALL');
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
  const [newItem, setNewItem] = useState({ name: '', category: 'Coffee & Tea', unit: 'pck', full_pack: '1000 grm', price: 0, new_price: 0, supplier: '', min_stock: 15 });
  const [selectedItems, setSelectedItems] = useState([]);

  const toggleSelectAll = (e) => {
    if (e.target.checked) setSelectedItems(filteredStock.map(i => i.name));
    else setSelectedItems([]);
  };

  const toggleSelectItem = (name) => {
    setSelectedItems(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Hapus ${selectedItems.length} bahan terpilih secara permanen?`)) return;
    for (const name of selectedItems) {
      await onDeleteItem(name);
    }
    setSelectedItems([]);
  };

  const categories = useMemo(() => ['ALL', ...new Set(stock.map(item => item.category))], [stock]);


  // Parse full_pack to get conversion
  const parseFullPack = (fullPack) => {
    if (!fullPack) return { size: 1, unit: 'pcs' };
    const match = fullPack.match(/(\d+\.?\d*)\s*(.*)/);
    if (!match) return { size: 1, unit: 'pcs' };
    let u = (match[2] || 'pcs').trim().toLowerCase();
    if (u === 'grm' || u === 'gram') u = 'gr';
    if (u === 'l' || u === 'liter') u = 'ml';
    return { size: parseFloat(match[1]), unit: u };
  };

  // Filtered stock
  const filteredStock = useMemo(() => stock.filter(item => {
    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
    const minLevel = item.min_stock || 15;
    const matchesSearch = (item.name || '').toLowerCase().includes(search.toLowerCase()) || (item.supplier || '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = catFilter === 'ALL' || item.category === catFilter;
    let matchesAlert = true;
    if (alertFilter === 'CRITICAL') matchesAlert = totalQty === 0;
    else if (alertFilter === 'WARNING') matchesAlert = totalQty > 0 && totalQty < minLevel;
    else if (alertFilter === 'SAFE') matchesAlert = totalQty >= minLevel;
    return matchesSearch && matchesCat && matchesAlert;
  }), [stock, search, catFilter, alertFilter]);

  // Adjust submit
  const handleAdjustSubmit = (e) => {
    e.preventDefault();
    if (!adjustItem || !adjustQty || isNaN(adjustQty)) return;
    onAdjustStock(adjustItem.name, adjustLoc, adjustType, parseFloat(adjustQty), adjustNotes);
    setAdjustItem(null); setAdjustQty(''); setAdjustNotes('');
  };

  // Edit item submit
  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editItem) return;
    onUpdateItem(editItem);
    setEditItem(null);
  };

  // Add item submit
  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;
    onAddItem({ ...newItem, new_price: newItem.price });
    setShowAddModal(false);
    setNewItem({ name: '', category: 'Coffee & Tea', unit: 'pck', full_pack: '1000 grm', price: 0, new_price: 0, supplier: '', min_stock: 15 });
  };

  // Export to Excel
  const handleExport = async () => {
    const XLSX = await getXLSX();
    let rowNum = 1;
    const data = filteredStock.map(item => {
      const rQty = item.qty_resto || 0;
      const cQty = item.qty_central || 0;
      const total = rQty + cQty;
      return {
        'NO': rowNum++,
        'NAMA ITEM': item.name,
        'KUANTITI': total,
        'UNIT': item.unit,
        'Full': item.full_pack || '',
        'Price': item.price || 0,
        'NEW Price': item.new_price || 0,
        'SUPPLIER': item.supplier || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
    XLSX.writeFile(wb, `SO BARISTA_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const itemHistory = useMemo(() => selectedItem
    ? transactions.filter(tx => tx.item_name === selectedItem.name).sort((a, b) => new Date(b.date) - new Date(a.date))
    : [], [selectedItem, transactions]);

  return (
    <div style={{ display: 'flex', gap: '24px', position: 'relative' }}>
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
                  <input type="text" placeholder="Search materials or suppliers..." className="form-control" style={{ paddingLeft: '44px' }} value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <select className="form-control" style={{ width: '170px' }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                  {categories.map(cat => <option key={cat} value={cat}>{cat === 'ALL' ? 'All Categories' : cat}</option>)}
                </select>
                <select className="form-control" style={{ width: '150px' }} value={alertFilter} onChange={e => setAlertFilter(e.target.value)}>
                  <option value="ALL">All Status</option>
                  <option value="SAFE">Safe</option>
                  <option value="WARNING">Low Stock</option>
                  <option value="CRITICAL">Out of Stock</option>
                </select>
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '3px' }}>
                  {['ALL', 'RESTO', 'CENTRAL'].map(loc => (
                    <button key={loc} className={`btn ${activeLoc === loc ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: '0.8rem', boxShadow: 'none' }} onClick={() => setActiveLoc(loc)}>
                      {loc === 'ALL' ? 'All' : loc === 'RESTO' ? 'Resto' : 'Central'}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={() => setShowAddModal(true)}>
                  <Plus size={14} style={{ marginRight: '4px' }}/> Tambah Bahan
                </button>
                <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={() => setShowBulkImport(true)}>
                  <UploadCloud size={14} style={{ marginRight: '4px' }}/> Bulk Import
                </button>
                <button className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }} onClick={handleExport}>
                  <Download size={14} style={{ marginRight: '4px' }}/> Export Excel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stock Table */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center', padding: '14px 10px' }}>
                    <input type="checkbox" checked={filteredStock.length > 0 && selectedItems.length === filteredStock.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Material Name</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Stock (Pack)</th>
                  <th style={{ textAlign: 'right' }}>Stock (Converted)</th>
                  <th style={{ textAlign: 'right' }}>Price/Pack</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map(item => {
                  const rQty = item.qty_resto || 0;
                  const cQty = item.qty_central || 0;
                  const total = rQty + cQty;
                  const min = item.min_stock || 15;
                  const pack = parseFullPack(item.full_pack);
                  const convertedTotal = total * pack.size;
                  const convertedUnit = pack.unit.toUpperCase();

                  let badge = <span className="badge badge-success">Safe</span>;
                  if (total === 0) badge = <span className="badge badge-danger">Out</span>;
                  else if (total < min) badge = <span className="badge badge-warning">Low</span>;

                  return (
                    <tr key={item.id ?? item.name} style={{ background: selectedItems.includes(item.name) ? 'rgba(59,130,246,0.05)' : 'transparent', transition: 'background 0.2s' }}>
                      <td style={{ textAlign: 'center', padding: '14px 10px' }}>
                        <input type="checkbox" checked={selectedItems.includes(item.name)} onChange={() => toggleSelectItem(item.name)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.full_pack || item.unit} / {item.unit}</div>
                      </td>
                      <td><span className="badge badge-info" style={{ fontSize: '0.65rem' }}>{item.category}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.supplier}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: total < min ? 'var(--warning)' : 'var(--text-primary)' }}>
                          {total.toFixed(1)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.unit}</span>
                        </div>
                        {activeLoc === 'ALL' && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            R: {rQty.toFixed(0)} | C: {cQty.toFixed(0)}
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
                      <td style={{ textAlign: 'center' }}>{badge}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="Edit Item" onClick={() => setEditItem({ ...item, originalName: item.name })}>
                            <Edit size={13} />
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="Adjust Stock" onClick={() => { setAdjustItem(item); setAdjustLoc('RESTO'); }}>
                            <Package size={13} />
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="History" onClick={() => setSelectedItem(item)}>
                            <History size={13} />
                          </button>
                          <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }} title="Delete" onClick={() => { if (confirm(`Hapus "${item.name}" dari inventory?`)) onDeleteItem(item.name); }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredStock.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No materials found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* History Side Panel */}
      {selectedItem && (
        <div className="glass-card" style={{ width: '360px', flexShrink: 0, position: 'sticky', top: 0, height: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Stock Audit</h3>
            <button className="btn btn-secondary" style={{ padding: '4px', borderRadius: '50%' }} onClick={() => setSelectedItem(null)}><X size={16} /></button>
          </div>
          <div style={{ padding: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '16px' }}>
            <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>{selectedItem.name}</h4>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{selectedItem.category} · {selectedItem.supplier}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Pack: {selectedItem.full_pack || selectedItem.unit}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Resto</div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{(selectedItem.qty_resto || 0).toFixed(1)} {selectedItem.unit}</div></div>
              <div><div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Central</div><div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{(selectedItem.qty_central || 0).toFixed(1)} {selectedItem.unit}</div></div>
            </div>
          </div>
          <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ledger ({itemHistory.length})
          </h4>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {itemHistory.map(tx => (
              <div key={tx.id} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600 }}>{tx.type}</span>
                  <span style={{ color: tx.qty > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{tx.qty > 0 ? `+${tx.qty}` : tx.qty}</span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{tx.location} · {tx.date}</div>
                {tx.notes && <div style={{ fontSize: '0.65rem', marginTop: '4px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{tx.notes}"</div>}
              </div>
            ))}
            {itemHistory.length === 0 && <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>No history.</div>}
          </div>
        </div>
      )}

      {/* Adjust Stock Slide-over Modal */}
      {adjustItem && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '400px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
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
                  <option value="RESTO">Resto Bar</option>
                  <option value="CENTRAL">Central Warehouse</option>
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
                    <option value="SPOILAGE">Basi / Kedaluwarsa (Spoilage)</option>
                    <option value="BROKEN">Pecah / Rusak (Broken)</option>
                    <option value="STOLEN">Hilang (Stolen)</option>
                    <option value="STAFF_MEAL">Makan Karyawan (Staff Meal)</option>
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
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '450px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
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
                <label className="form-label">Supplier</label>
                <input type="text" className="form-control" value={editItem.supplier} onChange={e => setEditItem({ ...editItem, supplier: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Pack Unit</label>
                  <select className="form-control" value={editItem.unit} onChange={e => setEditItem({ ...editItem, unit: e.target.value })}>
                    {['pck', 'Btl', 'Crtn', 'kaleng', 'pcs', 'Galon', 'Kg'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Full Pack Size</label>
                  <input type="text" className="form-control" placeholder="e.g. 1000 grm" value={editItem.full_pack || ''} onChange={e => setEditItem({ ...editItem, full_pack: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Min Stock</label>
                <input type="number" className="form-control" value={editItem.min_stock || 15} onChange={e => setEditItem({ ...editItem, min_stock: parseInt(e.target.value) || 15 })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '450px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
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
                <label className="form-label">Supplier</label>
                <input type="text" className="form-control" placeholder="Nama supplier" value={newItem.supplier} onChange={e => setNewItem({ ...newItem, supplier: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Pack Unit</label>
                  <select className="form-control" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })}>
                    {['pck', 'Btl', 'Crtn', 'kaleng', 'pcs', 'Galon', 'Kg'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Full Pack Size</label>
                  <input type="text" className="form-control" placeholder="e.g. 1000 grm" value={newItem.full_pack} onChange={e => setNewItem({ ...newItem, full_pack: e.target.value })} />
                </div>
              </div>
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
        description="Upload data bahan baku sekaligus dari file Excel. Gunakan Download Template untuk melakukan Export Sync (mengunduh data saat ini, mengubahnya, lalu upload kembali)."
        currentData={stock}
        onCommit={async (rows) => {
          const res = await api.bulkImportMaterials(rows);
          if (res.success > 0) refreshData();
          return res;
        }}
        expectedColumns={[
          { key: 'NO', label: 'NO', required: false, type: 'number', description: 'Nomor', sample: 1 },
          { key: 'name', label: 'NAMA ITEM', required: true, type: 'string', description: 'Nama unik bahan baku', sample: 'Espresso Bean' },
          { key: 'category', label: 'Kategori', required: true, type: 'string', description: 'Kategori (Coffee, Milk, dll)', sample: 'Coffee & Tea' },
          { key: 'supplier', label: 'SUPPLIER', required: false, type: 'string', description: 'Nama supplier', sample: 'Vendor A' },
          { key: 'unit', label: 'UNIT', required: true, type: 'string', description: 'Satuan beli (pck, btl, ltr, dll)', sample: 'kg' },
          { key: 'full_pack', label: 'Full', required: false, type: 'string', description: 'Isi per pack (1000 gr)', sample: '1000 gr' },
          { key: 'price', label: 'Price', required: true, type: 'number', description: 'Harga beli (angka)', sample: 120000 },
          { key: 'min_stock', label: 'Min Stock', required: false, type: 'number', description: 'Batas alert stok minimum', sample: 5 }
        ]}
      />
    </div>
  );
}


