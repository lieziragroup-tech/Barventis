import { useState, useMemo } from 'react';
import { Search, Plus, X,  Check } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import Pagination from '../../components/shared/Pagination';

export default function InterBranchTransfer() {
  const { masterData, transactionLogs, addTransactionLog } = useData();
  const { activeUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const [transferForm, setTransferForm] = useState({
    item_id: '',
    quantity: '',
    source_branch: 'Central Warehouse',
    target_branch: 'Resto Bar',
    notes: ''
  });

  const transfers = useMemo(() => {
    return (transactionLogs || []).filter(log => log.type === 'TRANSFER').sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactionLogs]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      const item = masterData.find(m => m.id === t.item_id);
      const searchStr = `${t.id} ${item?.name || ''} ${t.source_branch} ${t.target_branch}`.toLowerCase();
      return searchStr.includes(searchTerm.toLowerCase());
    });
  }, [transfers, masterData, searchTerm]);

  const paginatedTransfers = filteredTransfers.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleTransfer = () => {
    if (!transferForm.item_id || !transferForm.quantity) return alert("Pilih item dan masukkan quantity");

    addTransactionLog({
      id: `TRF-${Date.now()}`,
      date: new Date().toISOString(),
      type: 'TRANSFER',
      item_id: transferForm.item_id,
      quantity: parseFloat(transferForm.quantity),
      source_branch: transferForm.source_branch,
      target_branch: transferForm.target_branch,
      notes: transferForm.notes,
      user_id: activeUser?.id,
      status: 'COMPLETED'
    });

    setShowModal(false);
    setTransferForm({ item_id: '', quantity: '', source_branch: 'Central Warehouse', target_branch: 'Resto Bar', notes: '' });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inter-branch Transfer</h1>
          <p className="page-subtitle">Transfer barang antara Central Warehouse dan Outlet</p>
        </div>
        <div className="header-actions">
          <div className="search-bar">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              placeholder="Cari transfer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            Buat Transfer
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tanggal</th>
                <th>Item</th>
                <th>Dari</th>
                <th>Ke</th>
                <th className="text-right">Qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransfers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-muted">Belum ada riwayat transfer.</td>
                </tr>
              ) : (
                paginatedTransfers.map(t => {
                  const item = masterData.find(m => m.id === t.item_id);
                  return (
                    <tr key={t.id}>
                      <td><span className="badge-outline">{t.id}</span></td>
                      <td>{new Date(t.date).toLocaleDateString('id-ID')}</td>
                      <td>
                        <div className="font-medium">{item?.name || 'Item Dihapus'}</div>
                        <div className="text-xs text-muted">{item?.sku || ''}</div>
                      </td>
                      <td><span className="badge badge-secondary">{t.source_branch}</span></td>
                      <td><span className="badge badge-primary">{t.target_branch}</span></td>
                      <td className="text-right font-medium">{t.quantity} {item?.unit || ''}</td>
                      <td>
                        <span className="badge badge-success" style={{display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content'}}>
                          <Check size={12} /> Selesai
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredTransfers.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(filteredTransfers.length / itemsPerPage)}
            onPageChange={setPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredTransfers.length}
          />
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2>Buat Transfer Baru</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div className="form-group">
                <label className="form-label">Item / Bahan Baku</label>
                <select
                  className="form-control"
                  value={transferForm.item_id}
                  onChange={e => setTransferForm({...transferForm, item_id: e.target.value})}
                >
                  <option value="">-- Pilih Item --</option>
                  {masterData.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.sku})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Dari Cabang</label>
                  <select
                    className="form-control"
                    value={transferForm.source_branch}
                    onChange={e => setTransferForm({...transferForm, source_branch: e.target.value})}
                  >
                    <option value="Central Warehouse">Central Warehouse</option>
                    <option value="Resto Bar">Resto Bar</option>
                    <option value="Kitchen">Kitchen</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ke Cabang</label>
                  <select
                    className="form-control"
                    value={transferForm.target_branch}
                    onChange={e => setTransferForm({...transferForm, target_branch: e.target.value})}
                  >
                    <option value="Resto Bar">Resto Bar</option>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Central Warehouse">Central Warehouse</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  min="0" step="any"
                  className="form-control"
                  value={transferForm.quantity}
                  onChange={e => setTransferForm({...transferForm, quantity: e.target.value})}
                  placeholder="0.00"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Catatan</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={transferForm.notes}
                  onChange={e => setTransferForm({...transferForm, notes: e.target.value})}
                  placeholder="Alasan transfer atau catatan khusus..."
                ></textarea>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleTransfer}>
                <Check size={18} />
                Konfirmasi Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
