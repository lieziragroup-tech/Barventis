import { Search, Plus, X, Trash2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import Pagination from '../../components/shared/Pagination';
import { formatIDR } from '../../services/costUtils';

export default function WasteLogs() {
  const { masterData, transactionLogs, addTransactionLog } = useData();
  const { activeUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const [wasteForm, setWasteForm] = useState({
    item_id: '',
    quantity: '',
    reason: '',
    notes: '',
    type: 'WASTE' // WASTE or BREAKAGE
  });

  const wasteLogs = useMemo(() => {
    return (transactionLogs || [])
      .filter(log => ['WASTE', 'BREAKAGE', 'TRIMMING_WASTE', 'COMP', 'EXPIRED'].includes(log.type))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactionLogs]);

  const filteredLogs = useMemo(() => {
    return wasteLogs.filter(t => {
      const item = masterData.find(m => m.id === t.item_id);
      const searchStr = `${t.id} ${item?.name || ''} ${t.notes || ''} ${t.reason || ''}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });
  }, [wasteLogs, masterData, searchTerm]);

  const paginatedLogs = filteredLogs.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const totalWasteValue = useMemo(() => {
    return filteredLogs.reduce((sum, log) => {
      const item = masterData.find(m => m.id === log.item_id);
      const cost = item ? (item.price || 0) * log.quantity : 0;
      return sum + cost;
    }, 0);
  }, [filteredLogs, masterData]);

  const handleSubmit = async () => {
    if (!wasteForm.item_id || !wasteForm.quantity || !wasteForm.reason) {
      return alert("Pilih item, quantity dan alasan waste!");
    }

    addTransactionLog({
      id: `WST-${Date.now()}`,
      date: new Date().toISOString(),
      type: wasteForm.type,
      item_id: wasteForm.item_id,
      quantity: parseFloat(wasteForm.quantity),
      reason: wasteForm.reason,
      notes: wasteForm.notes,
      user_id: activeUser?.id,
      status: 'COMPLETED'
    });

    setShowModal(false);
    setWasteForm({ item_id: '', quantity: '', reason: '', notes: '', type: 'WASTE' });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Consolidated Waste Logs</h1>
          <p className="page-subtitle">Pencatatan limbah Bar dan sisa Trimming Kitchen</p>
        </div>
        <div className="header-actions">
          <div className="search-bar">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Cari waste log..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            Input Manual Waste
          </button>
        </div>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Total Waste Value (Filtered)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--danger)' }}>{formatIDR(totalWasteValue)}</div>
        </div>
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Total Log Entries</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{filteredLogs.length} Records</div>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>ID Log</th>
                <th>Tanggal</th>
                <th>Tipe</th>
                <th>Item / Bahan</th>
                <th className="text-right">Qty Waste</th>
                <th>Alasan / Keterangan</th>
                <th className="text-right">Estimasi Kerugian</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-muted">Belum ada data waste.</td>
                </tr>
              ) : (
                paginatedLogs.map(t => {
                  const item = masterData.find(m => m.id === t.item_id);
                  const estValue = item ? (item.price || 0) * t.quantity : 0;
                  return (
                    <tr key={t.id}>
                      <td><span className="badge-outline">{t.id}</span></td>
                      <td>{new Date(t.date).toLocaleDateString('id-ID')}</td>
                      <td>
                        <span className={`badge ${t.type === 'TRIMMING_WASTE' ? 'badge-info' : 'badge-danger'}`}>
                          {t.type}
                        </span>
                      </td>
                      <td>
                        <div className="font-medium">{item?.name || 'Item Dihapus'}</div>
                      </td>
                      <td className="text-right font-medium text-danger">{t.quantity} {item?.unit || ''}</td>
                      <td>
                        <div>{t.reason || t.notes || '-'}</div>
                      </td>
                      <td className="text-right font-medium text-danger">{formatIDR(estValue)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(filteredLogs.length / itemsPerPage)}
            onPageChange={setPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredLogs.length}
          />
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2>Input Manual Waste</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Tipe Waste</label>
                <select
                  className="form-control"
                  value={wasteForm.type}
                  onChange={e => setWasteForm({...wasteForm, type: e.target.value})}
                >
                  <option value="WASTE">Basi / Expired (WASTE)</option>
                  <option value="BREAKAGE">Pecah / Rusak (BREAKAGE)</option>
                  <option value="COMP">Complimentary / Free (COMP)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Bahan Baku / Item</label>
                <select
                  className="form-control"
                  value={wasteForm.item_id}
                  onChange={e => setWasteForm({...wasteForm, item_id: e.target.value})}
                >
                  <option value="">-- Pilih Item --</option>
                  {masterData.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Quantity Terbuang</label>
                <input
                  type="number"
                  min="0" step="any"
                  className="form-control"
                  value={wasteForm.quantity}
                  onChange={e => setWasteForm({...wasteForm, quantity: e.target.value})}
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Alasan Singkat</label>
                <input
                  type="text"
                  className="form-control"
                  value={wasteForm.reason}
                  onChange={e => setWasteForm({...wasteForm, reason: e.target.value})}
                  placeholder="Cth: Jatuh, Basi, dsb."
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan Tambahan</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={wasteForm.notes}
                  onChange={e => setWasteForm({...wasteForm, notes: e.target.value})}
                  placeholder="..."
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleSubmit}>
                <Trash2 size={18} />
                Simpan Waste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
