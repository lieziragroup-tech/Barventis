import React, { useState, useMemo } from 'react';
import { Plus, X, FileText, CheckCircle, XCircle, Clock, Package, Search, Download, Eye } from 'lucide-react';

export default function Invoicing({ stock, invoices, onCreateInvoice, onReceiveInvoice, onCancelInvoice }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // New invoice form state
  const [invSupplier, setInvSupplier] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [invItems, setInvItems] = useState([{ item_name: '', qty: 1, unit_price: 0, unit: 'pck' }]);
  const [itemDropdown, setItemDropdown] = useState(null);

  const formatIDR = (num) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);

  // Unique suppliers from stock
  const suppliers = useMemo(() => [...new Set(stock.map(s => s.supplier).filter(Boolean))].sort(), [stock]);

  // Filtered invoices
  const filteredInvoices = invoices.filter(inv => {
    const matchSearch = inv.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
      inv.supplier.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Generate invoice number
  const genInvNo = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const seq = String(invoices.length + 1).padStart(3, '0');
    return `INV-${dateStr}-${seq}`;
  };

  // Add line item
  const addLineItem = () => {
    setInvItems([...invItems, { item_name: '', qty: 1, unit_price: 0, unit: 'pck' }]);
  };

  const removeLineItem = (idx) => {
    setInvItems(invItems.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx, field, value) => {
    const updated = [...invItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setInvItems(updated);
  };

  const selectStockItem = (idx, item) => {
    const updated = [...invItems];
    updated[idx] = { ...updated[idx], item_name: item.name, unit_price: item.new_price || item.price, unit: item.unit };
    setInvItems(updated);
    setItemDropdown(null);
  };

  // Calculate total
  const invTotal = invItems.reduce((acc, item) => acc + (item.qty * item.unit_price), 0);

  // Submit new invoice
  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!invSupplier.trim()) return;
    const validItems = invItems.filter(i => i.item_name && i.qty > 0);
    if (validItems.length === 0) return;

    const invoice = {
      id: `inv-${Date.now()}`,
      invoice_no: genInvNo(),
      supplier: invSupplier,
      date: new Date().toISOString().split('T')[0],
      items: validItems,
      total: validItems.reduce((a, i) => a + i.qty * i.unit_price, 0),
      status: 'DRAFT',
      notes: invNotes,
      received_date: null
    };

    onCreateInvoice(invoice);
    setShowCreateModal(false);
    setInvSupplier('');
    setInvNotes('');
    setInvItems([{ item_name: '', qty: 1, unit_price: 0, unit: 'pck' }]);
  };

  // Status badge
  const statusBadge = (status) => {
    const map = {
      DRAFT: 'badge-info',
      SENT: 'badge-warning',
      RECEIVED: 'badge-success',
      CANCELLED: 'badge-danger'
    };
    return <span className={`badge ${map[status] || 'badge-info'}`} style={{ fontSize: '0.65rem' }}>{status}</span>;
  };

  // Print invoice
  const handlePrintInvoice = (inv) => {
    const printContent = `
      <html><head><title>Invoice ${inv.invoice_no}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}
      h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border:1px solid #ddd;padding:10px;text-align:left}
      th{background:#f5f5f5}
      .total{font-size:18px;font-weight:bold;text-align:right;margin-top:20px}
      .header{display:flex;justify-content:space-between}
      </style></head><body>
      <h1>UMATIS RESTO & VENUE</h1>
      <h2>Purchase Invoice: ${inv.invoice_no}</h2>
      <p><strong>Supplier:</strong> ${inv.supplier}</p>
      <p><strong>Date:</strong> ${inv.date}</p>
      <p><strong>Status:</strong> ${inv.status}</p>
      ${inv.notes ? `<p><strong>Notes:</strong> ${inv.notes}</p>` : ''}
      <table>
        <thead><tr><th>#</th><th>Item Name</th><th>Qty</th><th>Unit</th><th>Price/Unit</th><th>Subtotal</th></tr></thead>
        <tbody>${inv.items.map((item, i) => `
          <tr><td>${i + 1}</td><td>${item.item_name}</td><td>${item.qty}</td><td>${item.unit}</td>
          <td>Rp ${(item.unit_price || 0).toLocaleString('id-ID')}</td>
          <td>Rp ${(item.qty * item.unit_price).toLocaleString('id-ID')}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="total">TOTAL: Rp ${inv.total.toLocaleString('id-ID')}</div>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(printContent);
    w.document.close();
    w.print();
  };

  return (
    <div>
      {/* Controls */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Search invoices..." className="form-control" style={{ paddingLeft: '44px' }} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: '160px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> Buat Invoice Baru
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Invoices</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}><FileText size={18} /></div>
          </div>
          <div className="kpi-value">{invoices.length}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Pending (Draft/Sent)</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--warning-glow)', color: 'var(--warning)' }}><Clock size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{invoices.filter(i => i.status === 'DRAFT' || i.status === 'SENT').length}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Received (Stocked)</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}><CheckCircle size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{invoices.filter(i => i.status === 'RECEIVED').length}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Value</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(132,94,247,0.1)', color: '#845ef7' }}><Package size={18} /></div>
          </div>
          <div className="kpi-value" style={{ fontSize: '1.3rem' }}>{formatIDR(invoices.reduce((a, i) => a + (i.total || 0), 0))}</div>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Supplier</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Items</th>
                <th style={{ textAlign: 'right' }}>Total (IDR)</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>{inv.invoice_no}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{inv.supplier}</td>
                  <td style={{ fontSize: '0.85rem' }}>{inv.date}</td>
                  <td style={{ textAlign: 'right' }}>{inv.items.length}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIDR(inv.total)}</td>
                  <td style={{ textAlign: 'center' }}>{statusBadge(inv.status)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: '6px' }} title="View Detail" onClick={() => setViewInvoice(inv)}>
                        <Eye size={13} />
                      </button>
                      {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                        <button className="btn btn-success" style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '0.7rem' }} title="Mark Received — Stock In" onClick={() => { if (confirm(`Terima invoice ${inv.invoice_no}?\nStock akan otomatis bertambah di Central Warehouse.`)) onReceiveInvoice(inv.id); }}>
                          <CheckCircle size={13} /> Terima
                        </button>
                      )}
                      {inv.status === 'DRAFT' && (
                        <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: '6px', color: 'var(--danger)' }} title="Cancel" onClick={() => {
                          if (window.confirm(`Batalkan invoice ${inv.invoice_no}?\nInvoice draft ini akan diarsip sebagai CANCELLED dan tidak dapat diubah kembali.`)) {
                            onCancelInvoice(inv.id);
                          }
                        }}>
                          <XCircle size={13} />
                        </button>
                      )}
                      <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: '6px' }} title="Print" onClick={() => handlePrintInvoice(inv)}>
                        <Download size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                  Belum ada invoice. Klik "Buat Invoice Baru" untuk memulai.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Invoice Detail Modal */}
      {viewInvoice && (
        <div className="modal-overlay">
          <div className="glass-card" style={{ width: '600px', padding: '24px', border: '1px solid var(--border-focus)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{viewInvoice.invoice_no}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{viewInvoice.supplier} · {viewInvoice.date}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {statusBadge(viewInvoice.status)}
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setViewInvoice(null)}><X size={18} /></button>
              </div>
            </div>
            {viewInvoice.notes && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', fontStyle: 'italic' }}>"{viewInvoice.notes}"</p>}
            <table className="custom-table">
              <thead>
                <tr><th>#</th><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th>Unit</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr>
              </thead>
              <tbody>
                {viewInvoice.items.map((item, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td>{item.unit}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{formatIDR(item.unit_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIDR(item.qty * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', fontSize: '1.1rem', fontWeight: 700 }}>
              Total: <span style={{ color: 'var(--accent)', marginLeft: '8px' }}>{formatIDR(viewInvoice.total)}</span>
            </div>
            {viewInvoice.received_date && (
              <div style={{ marginTop: '12px', padding: '8px 12px', background: 'var(--success-glow)', border: '1px solid rgba(81,207,102,0.18)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--success)' }}>
                ✓ Received on {viewInvoice.received_date} — Stock updated in Central Warehouse
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="glass-card" style={{ width: '650px', padding: '24px', border: '1px solid var(--border-focus)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Buat Purchase Invoice</h3>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Invoice No (auto)</label>
                  <input type="text" className="form-control" value={genInvNo()} readOnly style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Supplier</label>
                  <select className="form-control" value={invSupplier} onChange={e => setInvSupplier(e.target.value)} required>
                    <option value="">-- Pilih Supplier --</option>
                    {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Line Items */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Items</h4>
                  <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={addLineItem}>
                    <Plus size={12} /> Tambah Item
                  </button>
                </div>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '35%' }}>Material</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '10%' }}>Unit</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>Price/Unit</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Subtotal</th>
                      <th style={{ width: '5%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invItems.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ position: 'relative' }}>
                          <input type="text" className="form-control" style={{ padding: '6px 8px', fontSize: '0.8rem' }} placeholder="Pilih bahan..." value={item.item_name}
                            onFocus={() => setItemDropdown(idx)}
                            onChange={e => { updateLineItem(idx, 'item_name', e.target.value); setItemDropdown(idx); }}
                            onBlur={() => setTimeout(() => setItemDropdown(null), 200)}
                          />
                          {itemDropdown === idx && (
                            <ul className="search-results-list">
                              {stock.filter(s => invSupplier ? s.supplier === invSupplier : true)
                                .filter(s => s.name.toLowerCase().includes((item.item_name || '').toLowerCase()))
                                .slice(0, 6).map(s => (
                                  <li key={s.name} className="search-results-item" onMouseDown={() => selectStockItem(idx, s)}>
                                    <div style={{ fontWeight: 500, fontSize: '0.8rem' }}>{s.name}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{s.unit} · {formatIDR(s.new_price || s.price)}</div>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </td>
                        <td><input type="number" className="form-control" style={{ padding: '6px 8px', fontSize: '0.8rem', textAlign: 'right' }} value={item.qty} onChange={e => updateLineItem(idx, 'qty', parseInt(e.target.value) || 0)} /></td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.unit}</td>
                        <td><input type="number" className="form-control" style={{ padding: '6px 8px', fontSize: '0.8rem', textAlign: 'right' }} value={item.unit_price} onChange={e => updateLineItem(idx, 'unit_price', parseInt(e.target.value) || 0)} /></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>{formatIDR(item.qty * item.unit_price)}</td>
                        <td>
                          {invItems.length > 1 && <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }} onClick={() => removeLineItem(idx)}><X size={12} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '1rem', fontWeight: 700 }}>
                  Total: <span style={{ color: 'var(--accent)' }}>{formatIDR(invTotal)}</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (opsional)</label>
                <textarea className="form-control" rows="2" placeholder="Catatan untuk invoice ini..." value={invNotes} onChange={e => setInvNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Buat Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
