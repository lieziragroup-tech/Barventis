import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Lock, Save, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

/**
 * Unified Daily Inventory EOD (One-Sheet Counting)
 */
const DailyInventoryEOD = ({ inventoryData = [], materials = [], onSave, onLockEOD, isLocked = false }) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('Semua');
  
  // Create a deep copy of inventory items to handle local state before save
  const [items, setItems] = useState([]);
  
  // Refs for keyboard navigation
  const inputRefs = useRef({});

  // Initialize items from props
  useEffect(() => {
    if (inventoryData && inventoryData.length > 0) {
      setItems(inventoryData.map(d => ({...d})));
    } else if (materials && materials.length > 0) {
      // Fallback if no inventory data passed for today yet
      setItems(materials.map(m => ({
        material_id: m.id,
        name: m.name,
        category: m.category,
        unit: m.unit,
        opening_stock: 0,
        in_qty: 0,
        out_qty: 0,
        full_units: 0,
        broken_fraction: 0,
        waste_qty: 0,
      })));
    }
  }, [inventoryData, materials]);

  const categories = useMemo(() => {
    const cats = new Set(items.map(i => i.category).filter(Boolean));
    return ['Semua', ...Array.from(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = activeFilter === 'Semua' || item.category === activeFilter;
      return matchSearch && matchCat;
    });
  }, [items, searchTerm, activeFilter]);

  // Keyboard navigation logic
  const handleKeyDown = (e, index, field) => {
    if (isLocked) return;
    
    if (e.key === 'Enter') {
      e.preventDefault();
      // Move to same field in next row
      const nextIndex = index + 1;
      if (nextIndex < filteredItems.length) {
        const nextId = `${filteredItems[nextIndex].material_id}-${field}`;
        inputRefs.current[nextId]?.focus();
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      // Move to next field in same row
      const fields = ['full_units', 'broken_fraction', 'waste_qty'];
      const fieldIdx = fields.indexOf(field);
      
      if (fieldIdx < fields.length - 1) {
        const nextField = fields[fieldIdx + 1];
        const nextId = `${filteredItems[index].material_id}-${nextField}`;
        inputRefs.current[nextId]?.focus();
      } else {
        // Move to first field of next row
        const nextIndex = index + 1;
        if (nextIndex < filteredItems.length) {
          const nextId = `${filteredItems[nextIndex].material_id}-full_units`;
          inputRefs.current[nextId]?.focus();
        }
      }
    }
  };

  const handleFocus = (e) => {
    e.target.select();
  };

  const handleChange = (id, field, value) => {
    const numValue = parseFloat(value) || 0;
    
    // Typo protection for BROKEN (should generally be < 1)
    if (field === 'broken_fraction' && numValue >= 1) {
      toast.showWarning('Peringatan: Fraksi (Broken) umumnya kurang dari 1. Pastikan input benar.');
    }

    setItems(prev => prev.map(item => {
      if (item.material_id === id) {
        const updated = { ...item, [field]: numValue };
        
        // Auto-calculate client side for display purposes
        // Backend Trigger will re-calculate anyway
        updated.closing_stock = (updated.full_units || 0) + (updated.broken_fraction || 0);
        updated.usage_qty = (updated.opening_stock || 0) + (updated.in_qty || 0) - updated.closing_stock - (updated.waste_qty || 0);
        
        return updated;
      }
      return item;
    }));
  };

  const handleSaveDraft = () => {
    if (onSave) onSave(items);
  };

  const handleLock = () => {
    if (confirm('Anda yakin ingin menutup EOD? Setelah dikunci, data tidak dapat diubah dan saldo akan disalin ke esok hari.')) {
      if (onLockEOD) onLockEOD(items);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border flex flex-col h-[calc(100vh-100px)] relative">
      {/* Absolute overlay if locked */}
      {isLocked && (
        <div className="absolute inset-0 bg-gray-50/50 z-20 flex items-center justify-center pointer-events-none">
          <div className="bg-white px-6 py-4 rounded-xl shadow-lg border border-gray-200 flex flex-col items-center gap-2 transform -translate-y-12">
            <Lock className="w-10 h-10 text-red-500" />
            <h3 className="font-bold text-gray-800 text-lg">EOD TERKUNCI</h3>
            <p className="text-gray-500 text-sm">Data harian sudah ditutup dan saldo disalin.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-800">Daily Inventory EOD</h2>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-48">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Cari item..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-1 focus:outline-none"
              />
            </div>
            {!isLocked && (
              <>
                <button 
                  onClick={handleSaveDraft}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-1 whitespace-nowrap"
                >
                  <Save className="w-4 h-4" /> Draft
                </button>
                <button 
                  onClick={handleLock}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-1 whitespace-nowrap"
                >
                  <Lock className="w-4 h-4" /> Closing EOD (23:59:59)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                ${activeFilter === cat ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 font-medium bg-gray-50 sticky left-0 z-10 border-r">Nama Bahan / Item</th>
              <th className="p-3 font-medium text-center">Unit</th>
              <th className="p-3 font-medium text-center border-l bg-gray-50">Stok Awal</th>
              <th className="p-3 font-medium text-center bg-gray-50">+ IN</th>
              <th className="p-3 font-medium text-center bg-gray-50">- OUT</th>
              <th className="p-3 font-medium text-center bg-blue-50 border-l border-blue-100">FULL (Utuh)</th>
              <th className="p-3 font-medium text-center bg-blue-50">BROKEN (Sisa)</th>
              <th className="p-3 font-medium text-center bg-red-50 border-l border-red-100">WASTE (Buang)</th>
              <th className="p-3 font-medium text-center border-l bg-gray-50">Stok Akhir</th>
              <th className="p-3 font-medium text-center bg-gray-50">Total Pakai</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredItems.map((item, index) => {
              const rowClosing = (item.full_units || 0) + (item.broken_fraction || 0);
              const rowUsage = (item.opening_stock || 0) + (item.in_qty || 0) - rowClosing - (item.waste_qty || 0);
              
              // Highlight anomali
              const isBrokenAnomaly = item.broken_fraction >= 1;
              const isNegativeUsage = rowUsage < 0;

              return (
                <tr key={item.material_id} className="hover:bg-gray-50 group">
                  <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white group-hover:bg-gray-50 border-r">
                    {item.name}
                    <div className="text-[10px] text-gray-400 mt-0.5">{item.category}</div>
                  </td>
                  <td className="p-3 text-center text-xs text-gray-500">{item.unit}</td>
                  
                  <td className="p-3 text-center font-medium border-l bg-gray-50/30">{item.opening_stock}</td>
                  <td className="p-3 text-center text-green-600 bg-gray-50/30">+{item.in_qty}</td>
                  <td className="p-3 text-center text-orange-600 bg-gray-50/30">-{item.out_qty}</td>
                  
                  <td className="p-3 text-center bg-blue-50/30 border-l border-blue-100/50">
                    <input 
                      type="number"
                      min="0"
                      disabled={isLocked}
                      value={item.full_units === 0 ? '' : item.full_units}
                      onChange={(e) => handleChange(item.material_id, 'full_units', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'full_units')}
                      onFocus={handleFocus}
                      ref={el => inputRefs.current[`${item.material_id}-full_units`] = el}
                      placeholder="0"
                      className="w-16 border rounded text-center p-1.5 focus:ring-2 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </td>
                  <td className="p-3 text-center bg-blue-50/30 relative">
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isLocked}
                      value={item.broken_fraction === 0 ? '' : item.broken_fraction}
                      onChange={(e) => handleChange(item.material_id, 'broken_fraction', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'broken_fraction')}
                      onFocus={handleFocus}
                      ref={el => inputRefs.current[`${item.material_id}-broken_fraction`] = el}
                      placeholder="0"
                      className={`w-16 border rounded text-center p-1.5 focus:ring-2 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500 ${isBrokenAnomaly ? 'border-orange-400 bg-orange-50 focus:ring-orange-200' : 'focus:ring-primary'}`}
                    />
                    {isBrokenAnomaly && (
                      <AlertTriangle className="w-3 h-3 text-orange-500 absolute top-1 right-2" />
                    )}
                  </td>
                  
                  <td className="p-3 text-center bg-red-50/30 border-l border-red-100/50">
                    <input 
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={isLocked}
                      value={item.waste_qty === 0 ? '' : item.waste_qty}
                      onChange={(e) => handleChange(item.material_id, 'waste_qty', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index, 'waste_qty')}
                      onFocus={handleFocus}
                      ref={el => inputRefs.current[`${item.material_id}-waste_qty`] = el}
                      placeholder="0"
                      className="w-16 border rounded text-center p-1.5 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500 border-red-200"
                    />
                  </td>
                  
                  <td className="p-3 text-center font-bold text-gray-800 border-l bg-gray-50/50">{rowClosing.toFixed(2)}</td>
                  <td className={`p-3 text-center font-bold bg-gray-50/50 ${isNegativeUsage ? 'text-red-600' : 'text-blue-700'}`}>
                    {rowUsage.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DailyInventoryEOD;
