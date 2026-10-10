import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function ExpiryMonitor() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExpiry = async () => {
      try {
        const tenantId = profile?.tenant_id;
        if (!tenantId) return;

        // Fetch batches/items with expiry_date
        const { data, error } = await supabase
          .from('daily_inventory_items')
          .select('id, expiry_date, in_qty, material_id, materials(name, unit)')
          .eq('tenant_id', tenantId)
          .not('expiry_date', 'is', null)
          .gte('expiry_date', new Date().toISOString().split('T')[0])
          .order('expiry_date', { ascending: true })
          .limit(50);

        if (!error && data) {
          // Group or filter valid ones
          setItems(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchExpiry();
  }, [profile]);

  if (loading) return <div className="p-8 text-center text-gray-500">Memuat data kedaluwarsa...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-6 h-6 text-amber-500" />
        <h2 className="text-lg font-semibold text-gray-800">Monitor Kedaluwarsa (FEFO)</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Tidak ada barang dengan tanggal kedaluwarsa dalam waktu dekat.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-sm">
                <th className="p-4 font-medium text-gray-600">Nama Bahan</th>
                <th className="p-4 font-medium text-gray-600">Sisa Qty (Batch)</th>
                <th className="p-4 font-medium text-gray-600">Tanggal Expired</th>
                <th className="p-4 font-medium text-gray-600 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {items.map((item) => {
                const daysLeft = Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                const isUrgent = daysLeft <= 7;
                return (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-800">{item.materials?.name || 'Unknown'}</td>
                    <td className="p-4 text-gray-600">{item.in_qty} {item.materials?.unit}</td>
                    <td className="p-4 text-gray-600 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {item.expiry_date}
                    </td>
                    <td className="p-4 text-right">
                      {isUrgent ? (
                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Segera Habiskan ({daysLeft} hari)</span>
                      ) : (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Aman ({daysLeft} hari)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}