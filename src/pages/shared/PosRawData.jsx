import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Calendar, FileText as Database, FileText as FileSpreadsheet } from 'lucide-react';
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
    // eslint-disable-next-line
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
    <div className="fade-in" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={24} style={{ color: 'var(--primary)' }} />
            Data Mentah POS
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Lihat riwayat item transaksi (raw data) dari file POS yang diupload.
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', marginBottom: '24px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 250px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Cari Menu</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Ketik nama menu..."
              value={inputValue}
              onChange={handleSearchChange}
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Dari Tanggal</label>
          <div style={{ position: 'relative' }}>
            <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="date"
              className="form-control"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); handleDateChange(); }}
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div style={{ flex: '1 1 150px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Sampai Tanggal</label>
          <div style={{ position: 'relative' }}>
            <Calendar size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="date"
              className="form-control"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); handleDateChange(); }}
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div>
          <button className="btn btn-secondary" onClick={() => { setInputValue(''); setSearchTerm(''); setDateFrom(''); setDateTo(''); setPage(1); }} style={{ height: '42px', padding: '0 16px' }}>
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
