import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Calendar, FileText as Database, FileText as FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { formatIDR } from '../../services/costUtils';
import { translateDbError } from '../../utils/errorHandler';

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export default function PosRawData() {
  const { currentTenant } = useAuth();

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [searchTerm, setSearchTerm] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPosRawDataPaged(currentTenant.id, {
        page,
        pageSize,
        search: searchTerm,
        dateFrom,
        dateTo
      });
      setData(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(translateDbError(err));
    } finally {
      setLoading(false);
    }
  }, [currentTenant, page, pageSize, searchTerm, dateFrom, dateTo]);

  useEffect(() => {
     
    fetchData();
  }, [fetchData]);

  // Handle debounced search
  const debouncedSearch = useMemo(
    () => debounce((val) => {
      setSearchTerm(val);
      setPage(1); // Reset page on new search
    }, 500),
    []
  );

  const handleSearchChange = (e) => {
    setInputValue(e.target.value);
    debouncedSearch(e.target.value);
  };

  const handleDateChange = () => {
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-5 pb-3 sm:pb-4 border-b border-[var(--border)]/70">
        <div className="flex items-center gap-2.5">
          <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-xs shrink-0">
            <Database size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] m-0 tracking-tight">
                Riwayat & Data Mentah POS
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-400 font-bold border border-blue-500/30">
                <CheckCircle2 size={10} />
                <span>Raw Audit Logs</span>
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5 m-0">
              Lihat riwayat item transaksi (raw data) dari file POS yang diupload.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', marginBottom: '24px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-card p-3 sm:p-4 mb-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
        <div className="flex-1 min-w-[180px]">
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Cari Menu</label>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control w-full"
              placeholder="Ketik nama menu..."
              value={inputValue}
              onChange={handleSearchChange}
              style={{ paddingLeft: '34px' }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Dari Tanggal</label>
            <input
              type="date"
              className="form-control w-full"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); handleDateChange(); }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Sampai Tanggal</label>
            <input
              type="date"
              className="form-control w-full"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); handleDateChange(); }}
            />
          </div>
        </div>

        <div>
          <button
            className="btn btn-secondary w-full sm:w-auto justify-center"
            onClick={() => { setInputValue(''); setSearchTerm(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            style={{ padding: '8px 14px' }}
          >
            Reset Filter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%', minWidth: '800px', margin: 0 }}>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Order ID</th>
              <th>Nama Menu</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Harga Satuan</th>
              <th style={{ textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {loading && data.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '32px' }}>Memuat data...</td></tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  <FileSpreadsheet size={48} style={{ opacity: 0.2, margin: '0 auto 16px auto', display: 'block' }} />
                  Belum ada data mentah yang diupload atau cocok dengan filter.
                </td>
              </tr>
            ) : (
              data.map(item => (
                <tr key={item.id}>
                  <td>
                    {new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td>
                    {item.pos_transactions?.order_no ? (
                      <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                        {item.pos_transactions.order_no}
                      </span>
                    ) : '-'}
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.menu_name}</td>
                  <td style={{ textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatIDR(item.unit_price)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIDR(item.subtotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '0 8px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Menampilkan <strong>{(page - 1) * pageSize + 1}</strong> - <strong>{Math.min(page * pageSize, total)}</strong> dari <strong>{total}</strong> baris
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-secondary"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              Sebelumnya
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '0.85rem', fontWeight: 600 }}>
              {page} / {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={page === totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
