import React, { useState, useMemo } from 'react';
import { Search, ShoppingCart, AlertTriangle, Send } from 'lucide-react';
import { formatIDR } from '../../services/costUtils';
import { useToast } from '../../contexts/ToastContext';

const MarketlistExcelView = ({ materials = [], currentStocks = {}, onSendRequest }) => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [requestQtys, setRequestQtys] = useState({});

  // Categories extraction
  const categories = useMemo(() => {
    const cats = new Set(materials.map(m => m.category).filter(Boolean));
    return ['Semua', ...Array.from(cats)];
  }, [materials]);

  // Filter materials based on search and category
  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      const matchCat = activeCategory === 'Semua' || m.category === activeCategory;
      const matchSearch = (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (m.item_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.supplier?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [materials, activeCategory, searchTerm]);

  // Handle request qty change
  const handleRequestQtyChange = (id, val) => {
    const numVal = parseInt(val, 10);
    setRequestQtys(prev => ({
      ...prev,
      [id]: isNaN(numVal) ? 0 : numVal
    }));
  };

  // Auto-fill requests based on par stock
  const handleAutoFill = () => {
    const newReqs = { ...requestQtys };
    let count = 0;
    materials.forEach(m => {
      const currentStock = currentStocks[m.id] || 0;
      const parStock = m.par_stock || 0;
      const reqQty = Math.max(0, parStock - currentStock);
      if (reqQty > 0) {
        newReqs[m.id] = reqQty;
        count++;
      }
    });
    setRequestQtys(newReqs);
    if (count > 0) {
      toast.showSuccess(`${count} item otomatis diisi berdasarkan batas Par Stock`);
    } else {
      toast.showInfo(`Stok semua item masih di atas Par Stock`);
    }
  };

  // Submit requests to Purchasing
  const handleSubmitRequests = () => {
    const itemsToRequest = Object.entries(requestQtys)
      .filter(([_, qty]) => qty > 0)
      .map(([id, qty]) => {
        const material = materials.find(m => m.id === id || m.id === parseInt(id));
        return {
          material_id: material.id,
          material_name: material.name,
          supplier_id: material.supplier_id,
          supplier_name: material.supplier?.name,
          request_qty: qty,
          pack_unit: material.full_pack
        };
      });

    if (itemsToRequest.length === 0) {
      toast.showWarning('Tidak ada item yang akan di-request (Qty = 0)');
      return;
    }

    if (onSendRequest) {
      onSendRequest(itemsToRequest);
      setRequestQtys({}); // reset form after sending
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col h-full">
      {/* Header & Controls */}
      <div className="p-4 border-b space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex items-center gap-2">
            <ShoppingCart className="text-primary w-5 h-5" />
            <h2 className="text-lg font-semibold text-gray-800">Katalog Market List & Usulan Belanja</h2>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Cari bahan, kode, vendor..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            <button 
              onClick={handleAutoFill}
              className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 whitespace-nowrap"
            >
              Auto-Fill (Par Stock)
            </button>
            <button 
              onClick={handleSubmitRequests}
              disabled={Object.values(requestQtys).filter(q => q > 0).length === 0}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              Kirim Usulan
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
                ${activeCategory === cat 
                  ? 'bg-gray-800 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3 font-medium">Bahan & Kode</th>
              <th className="p-3 font-medium">Konversi Unit</th>
              <th className="p-3 font-medium text-right">Finansial</th>
              <th className="p-3 font-medium">Status Stok</th>
              <th className="p-3 font-medium">Info Vendor</th>
              <th className="p-3 font-medium text-center bg-blue-50">Req. Qty (Pack)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredMaterials.length === 0 ? (
              <tr>
                <td colSpan="6" className="p-8 text-center text-gray-500">
                  Tidak ada data bahan yang cocok dengan pencarian.
                </td>
              </tr>
            ) : (
              filteredMaterials.map(m => {
                const current = currentStocks[m.id] || 0;
                const par = m.par_stock || 0;
                const min = m.min_stock || 0;
                const isUrgent = current < min;
                
                // Cek HPP Dasar per Base Unit via v_materials_costing logic atau field
                const baseCost = m.cost_per_base_unit || (m.price && m.pack_factor ? m.price / m.pack_factor : 0);

                return (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    {/* 1. Bahan & Kode */}
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{m.name}</div>
                      <div className="text-xs text-gray-500 mt-1 flex gap-2 items-center">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">{m.item_code || '-'}</span>
                        <span className="text-primary">{m.category}</span>
                      </div>
                    </td>
                    
                    {/* 2. Konversi Unit */}
                    <td className="p-3">
                      <div className="text-xs">
                        <span className="text-gray-500">Beli:</span> 1 {m.full_pack}
                        <br />
                        <span className="text-gray-500">Racik:</span> {m.pack_factor} {m.unit}
                      </div>
                    </td>
                    
                    {/* 3. Finansial */}
                    <td className="p-3 text-right">
                      <div className="font-medium text-gray-800">{formatIDR(m.price)}<span className="text-xs text-gray-400 font-normal">/{m.full_pack}</span></div>
                      <div className="text-xs text-gray-500 mt-1">HPP Dasar: {formatIDR(baseCost)}/{m.unit}</div>
                    </td>
                    
                    {/* 4. Status Stok */}
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{current} <span className="text-xs text-gray-500">{m.full_pack}</span></div>
                        {isUrgent && (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">
                            <AlertTriangle className="w-3 h-3" /> Urgent
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Min: {min} | Par: {par}
                      </div>
                    </td>
                    
                    {/* 5. Info Vendor */}
                    <td className="p-3">
                      {m.supplier ? (
                        <div className="text-xs">
                          <div className="font-medium text-gray-800">{m.supplier.name}</div>
                          <div className="text-gray-500 mt-0.5">{m.supplier.contact_person} • {m.supplier.phone}</div>
                          {m.supplier.payment_terms && (
                            <div className="text-gray-400 mt-0.5">Termin: {m.supplier.payment_terms}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Belum di-set</span>
                      )}
                    </td>
                    
                    {/* 6. Form Request */}
                    <td className="p-3 bg-blue-50/30 text-center">
                      <input 
                        type="number" 
                        min="0"
                        className="w-16 border rounded text-center p-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                        value={requestQtys[m.id] || ''}
                        onChange={(e) => handleRequestQtyChange(m.id, e.target.value)}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketlistExcelView;
