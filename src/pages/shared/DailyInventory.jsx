import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, FileText, PlusCircle } from 'lucide-react';
import EndOfDayInventory from './EndOfDayInventory';

export default function DailyInventory() {
  const [activeTab, setActiveTab] = useState('REKAP');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeTab === 'REKAP') {
      fetchRecords();
    }
  }, [date, activeTab]);

  const fetchRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('daily_inventory')
        .select(`
          *,
          items (
            name,
            hpp,
            type,
            item_code
          )
        `)
        .eq('date', date)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setRecords(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Daily Inventory</h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '4px' }}>Rekapitulasi stok akhir hari dan nilai terpakai</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'REKAP' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setActiveTab('REKAP')}
          >
            <FileText size={16} />
            Rekap Harian
          </button>
          <button
            className={`btn ${activeTab === 'EOD' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setActiveTab('EOD')}
          >
            <PlusCircle size={16} />
            Form Input EOD
          </button>
        </div>
      </div>

      {activeTab === 'EOD' ? (
        <EndOfDayInventory />
      ) : (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <label style={{ fontWeight: 600 }}>Filter Tanggal:</label>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto' }}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Memuat...</div>
          ) : (
            <div className="table-container" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              {/* DESKTOP TABLE */}
              <table className="custom-table hidden md:table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px', textAlign: 'left' }}>Barang</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Stok Awal</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>IN</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>OUT</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>WASTE</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>FULL</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>BROKEN</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Stok Akhir</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Terpakai</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Nilai (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{row.items?.name || 'Item Terhapus'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          HPP: Rp {(row.items?.hpp || 0).toLocaleString('id-ID')}
                        </div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.stok_awal}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.qty_in}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.qty_out}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.waste}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.full_qty}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{row.broken}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600 }}>{row.stok_akhir}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: row.qty_terpakai < 0 ? '#ef4444' : 'inherit' }}>
                        {row.qty_terpakai}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 600 }}>
                        Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                        <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada data rekap untuk tanggal ini</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* MOBILE CARD LIST */}
              <div className="md:hidden flex flex-col gap-3 p-2">
                {records.map(row => (
                  <div key={row.id} className="bg-[var(--bg-primary)] p-4 rounded-xl border border-[var(--border)] shadow-sm flex flex-col gap-3 relative overflow-hidden">
                    <div className="flex justify-between items-start border-b border-[var(--border)] pb-2">
                      <div>
                        <div className="font-bold text-[var(--text-primary)] text-base">{row.items?.name || 'Item Terhapus'}</div>
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">HPP: Rp {(row.items?.hpp || 0).toLocaleString('id-ID')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-[var(--text-secondary)] mb-1">Nilai Terpakai</div>
                        <div className="font-bold text-[var(--accent)]">Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-blue-500/10 p-2 rounded-lg">
                        <div className="text-blue-500 font-bold">{row.stok_awal}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-1">AWAL</div>
                      </div>
                      <div className="bg-emerald-500/10 p-2 rounded-lg">
                        <div className="text-emerald-500 font-bold">+{row.qty_in}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-1">IN</div>
                      </div>
                      <div className="bg-orange-500/10 p-2 rounded-lg">
                        <div className="text-orange-500 font-bold">-{row.qty_out}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-1">OUT</div>
                      </div>
                      <div className="bg-red-500/10 p-2 rounded-lg">
                        <div className="text-red-500 font-bold">-{row.waste}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-1">WASTE</div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-1 bg-[var(--bg-secondary)] p-2 rounded-lg">
                      <div className="flex gap-4">
                        <div><span className="text-[10px] text-[var(--text-muted)]">FULL:</span> <span className="font-semibold text-sm">{row.full_qty}</span></div>
                        <div><span className="text-[10px] text-[var(--text-muted)]">BRK:</span> <span className="font-semibold text-sm">{row.broken}</span></div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-[var(--text-muted)]">Terpakai</div>
                        <div className={`font-bold text-sm ${row.qty_terpakai < 0 ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>{row.qty_terpakai}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {records.length === 0 && (
                  <div className="text-center p-6 text-[var(--text-muted)] text-sm flex flex-col items-center">
                    <Calendar size={36} className="mb-2 opacity-30" />
                    Belum ada catatan hari ini
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
