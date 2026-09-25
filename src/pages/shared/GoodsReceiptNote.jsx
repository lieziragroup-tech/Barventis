import React, { useState } from 'react';
import { Truck, AlertTriangle, Calendar, CheckSquare } from 'lucide-react';
import DualPhotoCapture from '../../components/DualPhotoCapture';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * Komponen GoodsReceiptNote (GRN)
 * Digunakan saat barang fisik tiba di Bar/Central berdasarkan PO yang berstatus SHIPPED.
 */
const GoodsReceiptNote = ({ poData, onConfirmReceipt, onCancel }) => {
  const { activeUser } = useAuth();
  const toast = useToast();
  
  // State untuk item form
  const [items, setItems] = useState(
    poData?.items?.map(item => ({
      ...item,
      actual_qty: item.final_qty || item.request_qty || 0, // default to requested
      expiry_date: '',
      isPerishable: item.category === 'Bahan Mentah' || item.category === 'Dairy' || item.category === 'Meat' || item.is_perishable // sesuaikan
    })) || []
  );

  const [photosReady, setPhotosReady] = useState(false);
  const [photoBlobs, setPhotoBlobs] = useState(null);

  if (!poData) return null;

  const handleActualQtyChange = (id, val) => {
    const num = parseInt(val, 10);
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, actual_qty: isNaN(num) ? 0 : num } : item
    ));
  };

  const handleExpiryChange = (id, val) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, expiry_date: val } : item
    ));
  };

  const handlePhotoComplete = (blobs) => {
    setPhotosReady(true);
    setPhotoBlobs(blobs);
  };

  const validateForm = () => {
    for (const item of items) {
      if (item.isPerishable && !item.expiry_date) {
        return `Tanggal kedaluwarsa untuk ${item.material_name} wajib diisi.`;
      }
      if (item.actual_qty < 0) {
        return `Kuantitas aktual ${item.material_name} tidak valid.`;
      }
    }
    if (!photosReady) {
      return "Kedua foto bukti (Nota dan Fisik Barang) wajib dilampirkan.";
    }
    return null;
  };

  const handleSubmit = () => {
    const errorMsg = validateForm();
    if (errorMsg) {
      toast.showError(errorMsg);
      return;
    }

    const payload = {
      po_id: poData.id,
      po_number: poData.po_number,
      supplier_id: poData.supplier_id,
      received_items: items.map(item => ({
        material_id: item.material_id,
        ordered_qty: item.final_qty || item.request_qty,
        actual_qty: item.actual_qty,
        variance: item.actual_qty - (item.final_qty || item.request_qty),
        expiry_date: item.expiry_date || null
      })),
      photos: photoBlobs,
      received_by: activeUser?.name || activeUser?.email,
      received_location: activeUser?.branch_name || 'BAR_MAIN',
      status: 'RECEIVED'
    };

    if (onConfirmReceipt) {
      onConfirmReceipt(payload);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border overflow-hidden max-w-4xl mx-auto">
      <div className="bg-primary p-4 text-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <CheckSquare className="w-5 h-5" />
            Penerimaan Barang (GRN)
          </h2>
          <p className="text-primary-100 text-sm opacity-90">No. PO: {poData.po_number} • Supplier: {poData.supplier_name}</p>
        </div>
        <div className="bg-white/20 px-3 py-1 rounded text-sm font-medium">
          Status: <span className="font-bold text-yellow-300">SHIPPED</span>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* Step 1: Input Fisik & Kedaluwarsa */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
            Pengecekan Fisik & Kedaluwarsa
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border rounded-lg overflow-hidden">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="p-3">Item / Bahan</th>
                  <th className="p-3 text-center">Dipesan</th>
                  <th className="p-3 text-center">Aktual Fisik</th>
                  <th className="p-3 text-center">Selisih</th>
                  <th className="p-3 w-48">Tgl Kedaluwarsa</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(item => {
                  const ordered = item.final_qty || item.request_qty;
                  const variance = item.actual_qty - ordered;
                  const hasVariance = variance !== 0;

                  return (
                    <tr key={item.id} className={hasVariance ? 'bg-orange-50' : ''}>
                      <td className="p-3 font-medium text-gray-800">
                        {item.material_name}
                        {item.isPerishable && (
                          <span className="block text-[10px] text-red-500 uppercase tracking-wider mt-0.5 font-bold">
                            Perishable
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center text-gray-500">{ordered}</td>
                      <td className="p-3 text-center">
                        <input 
                          type="number"
                          min="0"
                          value={item.actual_qty}
                          onChange={(e) => handleActualQtyChange(item.id, e.target.value)}
                          className={`w-16 border rounded text-center p-1.5 focus:ring-2 focus:outline-none ${hasVariance ? 'border-orange-400 focus:ring-orange-200 bg-white' : 'border-gray-300 focus:ring-primary/20'}`}
                        />
                      </td>
                      <td className="p-3 text-center">
                        {hasVariance ? (
                          <span className="inline-flex items-center gap-1 text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded text-xs">
                            <AlertTriangle className="w-3 h-3" />
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        {item.isPerishable ? (
                          <div className="relative">
                            <input 
                              type="date"
                              required
                              value={item.expiry_date}
                              onChange={(e) => handleExpiryChange(item.id, e.target.value)}
                              className={`w-full border rounded p-1.5 text-xs focus:ring-2 focus:outline-none pl-8
                                ${!item.expiry_date ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-gray-300 focus:ring-primary/20'}`}
                            />
                            <Calendar className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">Tidak Wajib</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Step 2: Dual Photo Capture */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
            Lampiran Bukti (Wajib)
          </h3>
          <DualPhotoCapture onComplete={handlePhotoComplete} />
        </section>

      </div>
      
      {/* Footer Action */}
      <div className="bg-gray-50 p-6 border-t flex justify-end gap-3">
        <button 
          onClick={onCancel}
          className="px-6 py-2.5 border text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
        >
          Batal
        </button>
        <button 
          onClick={handleSubmit}
          disabled={!photosReady}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Truck className="w-4 h-4" />
          Konfirmasi Barang Masuk & Tambah Stok
        </button>
      </div>
    </div>
  );
};

export default GoodsReceiptNote;
