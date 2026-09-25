import React, { useState, useMemo } from 'react';
import { Package, Truck, FileText, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { formatIDR } from '../../services/costUtils';

const LeanProcurementDashboard = ({ requestedItems = [], materials = [], onIssuePO, suppliers = [] }) => {
  const { activeUser } = useAuth();
  const toast = useToast();
  const [adjustedQtys, setAdjustedQtys] = useState({});

  // Group requested items by supplier
  const supplierGroups = useMemo(() => {
    const groups = {};
    
    requestedItems.forEach(item => {
      // Find supplier details
      const supplierId = item.supplier_id || 'unknown';
      const supplierName = item.supplier_name || 'Vendor Tanpa Nama';
      
      if (!groups[supplierId]) {
        groups[supplierId] = {
          supplier_id: supplierId,
          supplier_name: supplierName,
          items: [],
          totalCost: 0
        };
      }
      
      // Calculate adjusted/final qty
      const finalQty = adjustedQtys[item.id] !== undefined ? adjustedQtys[item.id] : item.request_qty;
      const material = materials.find(m => m.id === item.material_id);
      const unitPrice = material?.price || 0;
      
      groups[supplierId].items.push({
        ...item,
        final_qty: finalQty,
        unit_price: unitPrice,
        subtotal: finalQty * unitPrice
      });
      
      groups[supplierId].totalCost += (finalQty * unitPrice);
    });
    
    return Object.values(groups);
  }, [requestedItems, adjustedQtys, materials]);

  const handleQtyAdjust = (itemId, val) => {
    const num = parseInt(val, 10);
    setAdjustedQtys(prev => ({
      ...prev,
      [itemId]: isNaN(num) ? 0 : num
    }));
  };

  const generatePONumber = () => {
    const date = new Date();
    const str = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PO-${str}-${random}`;
  };

  const handleIssuePO = (group) => {
    if (group.items.filter(i => i.final_qty > 0).length === 0) {
      toast.showError('Kuantitas tidak boleh 0');
      return;
    }

    const poNumber = generatePONumber();
    const poData = {
      po_number: poNumber,
      supplier_id: group.supplier_id,
      supplier_name: group.supplier_name,
      items: group.items.filter(i => i.final_qty > 0),
      total_amount: group.totalCost,
      status: 'ORDERED',
      issued_by: activeUser?.name || activeUser?.email,
      issued_at: new Date().toISOString()
    };

    // Panggil callback untuk menyimpan ke DB dan mungkin meng-generate PDF
    if (onIssuePO) {
      onIssuePO(poData);
      toast.showSuccess(`PO Resmi [${poNumber}] berhasil diterbitkan ke ${group.supplier_name}`);
      // Simulasi download PDF (di realita bisa panggil jsPDF)
      console.log('Generating PDF for:', poData);
    }
  };

  if (requestedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-dashed h-full">
        <Clock className="w-12 h-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-700">Tidak ada usulan belanja aktif</h3>
        <p className="text-gray-500 text-sm mt-1">Usulan dari Bar/Central akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Verifikasi & Konsolidasi Pesanan (Purchasing)</h2>
          <p className="text-sm text-gray-500">Sesuaikan kuantitas (MOQ) dan terbitkan PO per Supplier tanpa menunggu approval manajerial.</p>
        </div>
        <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2">
          <Truck className="w-4 h-4" />
          {supplierGroups.length} Supplier Tujuan
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {supplierGroups.map(group => (
          <div key={group.supplier_id} className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  {group.supplier_name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{group.items.length} item usulan</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Estimasi Total</div>
                <div className="font-bold text-gray-800">{formatIDR(group.totalCost)}</div>
              </div>
            </div>
            
            <div className="p-0 flex-1 overflow-auto max-h-80">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 text-xs">
                  <tr>
                    <th className="p-3 font-medium">Bahan</th>
                    <th className="p-3 font-medium text-center">Req. Qty</th>
                    <th className="p-3 font-medium text-center bg-blue-50">Final Qty</th>
                    <th className="p-3 font-medium text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {group.items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{item.material_name}</div>
                        <div className="text-xs text-gray-500">{formatIDR(item.unit_price)} / {item.pack_unit}</div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-block bg-gray-100 px-2 py-1 rounded text-gray-600">
                          {item.request_qty}
                        </span>
                      </td>
                      <td className="p-3 bg-blue-50/30 text-center">
                        <input 
                          type="number"
                          min="0"
                          value={item.final_qty}
                          onChange={(e) => handleQtyAdjust(item.id, e.target.value)}
                          className="w-16 border rounded text-center p-1 focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                      </td>
                      <td className="p-3 text-right font-medium text-gray-700">
                        {formatIDR(item.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 border-t bg-gray-50">
              <button 
                onClick={() => handleIssuePO(group)}
                className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Terbitkan PO Resmi ke Supplier
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeanProcurementDashboard;
