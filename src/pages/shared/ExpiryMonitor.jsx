import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getExpiryColor } from '../../utils/expiryColor';

export default function ExpiryMonitor() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchExpiry = async () => {
      try {
        const tenantId = profile?.tenant_id;
        if (!tenantId) return;

        // Primary: baca dari material_batches (FEFO source of truth)
        const { data: batches, error: batchErr } = await supabase
          .from('material_batches')
          .select('id, expired_date, qty_resto, qty_central, batch_no, material_id, status, materials(name, unit)')
          .eq('tenant_id', tenantId)
          .in('status', ['ACTIVE', 'active'])
          .order('expired_date', { ascending: true })
          .limit(100);

        if (!batchErr && batches && batches.length > 0) {
          // Normalisasi field names agar konsisten dengan UI
          setItems(batches.map(b => ({
            id: b.id,
            expiry_date: b.expired_date,
            qty: (Number(b.qty_resto) || 0) + (Number(b.qty_central) || 0),
            batch_no: b.batch_no,
            materials: b.materials
          })));
          return;
        }

        // Fallback: baca dari daily_inventory_items (legacy, jika belum ada batch)
        const { data, error } = await supabase
          .from('daily_inventory_items')
          .select('id, expiry_date, in_qty, material_id, materials(name, unit)')
          .eq('tenant_id', tenantId)
          .not('expiry_date', 'is', null)
          .gte('expiry_date', new Date().toISOString().split('T')[0])
          .order('expiry_date', { ascending: true })
          .limit(50);

        if (!error && data) {
          setItems(data.map(d => ({
            id: d.id,
            expiry_date: d.expiry_date,
            qty: d.in_qty,
            batch_no: null,
            materials: d.materials
          })));
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
        <h2 className="text-lg font-semibold text-gray-800">Monitor Kedaluwarsa (FEFO 3-Warna)</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Tidak ada barang dengan tanggal kedaluwarsa dalam waktu dekat.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-sm">
                <th className="p-4 font-medium text-gray-600">Nama Bahan</th>
                <th className="p-4 font-medium text-gray-600">Batch</th>
                <th className="p-4 font-medium text-gray-600">Sisa Qty</th>
                <th className="p-4 font-medium text-gray-600">Tanggal Expired</th>
                <th className="p-4 font-medium text-gray-600 text-right">Status FEFO</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {items.map((item) => {
                const fefo = getExpiryColor(item.expiry_date);
                return (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4 font-medium text-gray-800">{item.materials?.name || 'Unknown'}</td>
                    <td className="p-4 text-gray-500 font-mono text-xs">{item.batch_no || '-'}</td>
                    <td className="p-4 text-gray-600">{item.qty} {item.materials?.unit}</td>
                    <td className="p-4 text-gray-600 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      {item.expiry_date}
                    </td>
                    <td className="p-4 text-right">
                      {fefo?.color === 'red' && (
                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">Kritis ({fefo.days} hari)</span>
                      )}
                      {fefo?.color === 'yellow' && (
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">Perhatian ({fefo.days} hari)</span>
                      )}
                      {fefo?.color === 'green' && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Aman ({fefo.days} hari)</span>
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
