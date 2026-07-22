import { useState, useMemo, useEffect } from 'react';
import { Plus, X, FileText, CheckCircle, XCircle, Clock, Package, Search, Download, Eye, UploadCloud } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import BulkImport from '../../components/BulkImport';
import Pagination from '../../components/shared/Pagination';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';

// Stable client-side id for editable line-item rows (stable React keys vs array index). (LOW #19)
const rowUid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `r${Date.now()}${Math.random()}`);
const blankLineItem = () => ({ item_name: '', qty: 1, unit_price: 0, unit: 'pck', _uid: rowUid() });

export default function Invoicing() {
  const { stock, invoices, showToast: toast, handleCreateInvoice: onCreateInvoice, handleReceiveInvoice: onReceiveInvoice, handleCancelInvoice: onCancelInvoice, refreshData } = useData();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // New invoice form state
  const [invSupplier, setInvSupplier] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [invItems, setInvItems] = useState([blankLineItem()]);
  const [itemDropdown, setItemDropdown] = useState(null);



  // Unique suppliers from stock
  const suppliers = useMemo(() => [...new Set(stock.map(s => s.supplier).filter(Boolean))].sort(), [stock]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => invoices.filter(inv => {
    const matchSearch = inv.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
      inv.supplier.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  }), [invoices, search, statusFilter]);

  const INVOICES_PAGE_SIZE = 15;
  const [invoicesPage, setInvoicesPage] = useState(1);
  useEffect(() => { setInvoicesPage(1); }, [search, statusFilter]);
  const paginatedInvoices = useMemo(() => {
    const start = (invoicesPage - 1) * INVOICES_PAGE_SIZE;
    return filteredInvoices.slice(start, start + INVOICES_PAGE_SIZE);
  }, [filteredInvoices, invoicesPage]);

  // Add line item
  const addLineItem = () => {
    setInvItems([...invItems, blankLineItem()]);
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
  const invTotal = useMemo(() => invItems.reduce((acc, item) => acc + (item.qty * item.unit_price), 0), [invItems]);

  // Submit new invoice
  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!invSupplier.trim()) return;
    const validItems = invItems.filter(i => i.item_name && i.qty > 0);
    if (validItems.length === 0) return;

    // Note: invoice_no, total, status & date are assigned authoritatively by the
    // server (api.createInvoice → INV-YYYYMMDD-XXX with a UNIQUE constraint), so we
    // do not generate a client-side number here (M-3). UI refreshes from DB after save.
    const invoice = {
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
    setInvItems([blankLineItem()]);
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
  // BUG-INV-01: window.open() returns null when browser blocks popups.
  // Dereferencing w.document on null throws TypeError. Added null guard with fallback.
  // Helper to prevent XSS during document.write
  const escapeHTML = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const handlePrintInvoice = (inv) => {
    const printContent = `
      <html><head><title>Invoice ${escapeHTML(inv.invoice_no)}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;color:#333}
      h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{border:1px solid #ddd;padding:10px;text-align:left}
      th{background:#f5f5f5}
      .total{font-size:18px;font-weight:bold;text-align:right;margin-top:20px}
      </style></head><body>
      <h1>BARVENTIS</h1>
      <h2>Purchase Invoice: ${escapeHTML(inv.invoice_no)}</h2>
      <p><strong>Supplier:</strong> ${escapeHTML(inv.supplier)}</p>
      <p><strong>Date:</strong> ${escapeHTML(inv.date)}</p>
      <p><strong>Status:</strong> ${escapeHTML(inv.status)}</p>
      ${inv.notes ? `<p><strong>Notes:</strong> ${escapeHTML(inv.notes)}</p>` : ''}
      <table>
        <thead><tr><th>#</th><th>Item Name</th><th>Qty</th><th>Unit</th><th>Price/Unit</th><th>Subtotal</th></tr></thead>
        <tbody>${(inv.items || []).map((item, i) => `
          <tr><td>${i + 1}</td><td>${escapeHTML(item.item_name || '-')}</td><td>${escapeHTML(item.qty)}</td><td>${escapeHTML(item.unit || '')}</td>
          <td>Rp ${(item.unit_price || 0).toLocaleString('id-ID')}</td>
          <td>Rp ${((item.qty || 0) * (item.unit_price || 0)).toLocaleString('id-ID')}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="total">TOTAL: Rp ${(inv.total || 0).toLocaleString('id-ID')}</div>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast('Browser memblokir popup. Izinkan popup untuk halaman ini agar bisa mencetak invoice.', 'warning');
      return;
    }
    w.document.write(printContent);
    w.document.close();
    w.print();
  };

  const pendingCount = useMemo(() => invoices.filter(i => i.status === 'DRAFT' || i.status === 'SENT').length, [invoices]);
  const receivedCount = useMemo(() => invoices.filter(i => i.status === 'RECEIVED').length, [invoices]);
  const totalValue = useMemo(() => invoices.reduce((a, i) => a + (i.total || 0), 0), [invoices]);

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
          <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowBulkImport(true)}>
            <UploadCloud size={14} /> Bulk Import PO
          </button>
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
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{pendingCount}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Received (Stocked)</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}><CheckCircle size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{receivedCount}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Value</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}><Package size={18} /></div>
          </div>
          <div className="kpi-value" style={{ fontSize: '1.3rem' }}>{formatIDR(totalValue)}</div>
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
              {paginatedInvoices.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>{inv.invoice_no}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{inv.supplier}</td>
                  <td style={{ fontSize: '0.85rem' }}>{inv.date}</td>
                  <td style={{ textAlign: 'right' }}>{inv.items.length}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatIDR(inv.total)}</td>
                  <td style={{ textAlign: 'center' }}>{statusBadge(inv.status)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="View Detail" onClick={() => setViewInvoice(inv)}>
                        <Eye size={13} />
                      </button>
                      {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                        <button className="btn btn-success" style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem' }} title="Mark Received — Stock In" onClick={() => { if (confirm(`Terima invoice ${inv.invoice_no}?\nStock akan otomatis bertambah di Central Warehouse.`)) onReceiveInvoice(inv.id); }}>
                          <CheckCircle size={13} /> Terima
                        </button>
                      )}
                      {inv.status === 'DRAFT' && (
                        <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }} title="Cancel" onClick={() => {
                          if (window.confirm(`Batalkan invoice ${inv.invoice_no}?\nInvoice draft ini akan diarsip sebagai CANCELLED dan tidak dapat diubah kembali.`)) {
                            onCancelInvoice(inv.id);
                          }
                        }}>
                          <XCircle size={13} />
                        </button>
                      )}
                      <button className="btn btn-secondary" style={{ padding: '5px', borderRadius: 'var(--radius-sm)' }} title="Print" onClick={() => handlePrintInvoice(inv)}>
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
        <div style={{ padding: '0 20px 16px' }}>
          <Pagination
            page={invoicesPage}
            pageSize={INVOICES_PAGE_SIZE}
            totalCount={filteredInvoices.length}
            onPageChange={setInvoicesPage}
            itemLabel="invoice"
          />
        </div>
      </div>

      {/* View Invoice Detail Slide-over Modal */}
      {viewInvoice && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{viewInvoice.invoice_no}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{viewInvoice.supplier} · {viewInvoice.date}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {statusBadge(viewInvoice.status)}
                <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setViewInvoice(null)}><X size={16} /></button>
              </div>
            </div>
            {viewInvoice.notes && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px', fontStyle: 'italic', background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>"{viewInvoice.notes}"</p>}
            <table className="custom-table" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <thead>
                <tr><th style={{ padding: '12px' }}>#</th><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th>Unit</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'right', paddingRight: '12px' }}>Subtotal</th></tr>
              </thead>
              <tbody>
                {viewInvoice.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ padding: '12px' }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{item.unit}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{formatIDR(item.unit_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, paddingRight: '12px' }}>{formatIDR(item.qty * item.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', fontSize: '1.2rem', fontWeight: 800 }}>
              Total: <span style={{ color: 'var(--accent)', marginLeft: '12px' }}>{formatIDR(viewInvoice.total)}</span>
            </div>
            {viewInvoice.received_date && (
              <div style={{ marginTop: '20px', padding: '12px 16px', background: 'rgba(81,207,102,0.05)', border: '1px solid rgba(81,207,102,0.2)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--success)' }}>
                ✓ Received on {viewInvoice.received_date} — Stock updated in Central Warehouse
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Invoice Slide-over Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '750px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Buat Purchase Invoice</h3>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowCreateModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Invoice No (auto)</label>
                  <input type="text" className="form-control" value="Otomatis dibuat server" readOnly style={{ color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--bg-secondary)' }} />
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
              <div style={{ border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Daftar Item</h4>
                  <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--bg-primary)' }} onClick={addLineItem}>
                    <Plus size={14} style={{ marginRight: '4px' }}/> Tambah Item
                  </button>
                </div>
                <table className="custom-table" style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
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
                      <tr key={item._uid ?? idx}>
                        <td style={{ position: 'relative' }}>
                          <input type="text" className="form-control" style={{ padding: '8px 10px', fontSize: '0.85rem' }} placeholder="Pilih bahan..." value={item.item_name}
                            onFocus={() => setItemDropdown(idx)}
                            onChange={e => { updateLineItem(idx, 'item_name', e.target.value); setItemDropdown(idx); }}
                            onBlur={() => setTimeout(() => setItemDropdown(null), 200)}
                          />
                          {itemDropdown === idx && (
                            <ul className="search-results-list" style={{ zIndex: 2000 }}>
                              {stock.filter(s => invSupplier ? (s.supplier || '').trim().toLowerCase() === invSupplier.trim().toLowerCase() : true)
                                .filter(s => (s.name || '').toLowerCase().includes((item.item_name || '').toLowerCase()))
                                .slice(0, 6).map(s => (
                                  <li key={s.name} className="search-results-item" onMouseDown={() => selectStockItem(idx, s)} style={{ padding: '8px 12px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.name}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.unit} · {formatIDR(s.new_price || s.price)}</div>
                                  </li>
                                ))}
                            </ul>
                          )}
                        </td>
                        <td><input type="number" className="form-control" style={{ padding: '8px 10px', fontSize: '0.85rem', textAlign: 'right' }} value={item.qty} onChange={e => updateLineItem(idx, 'qty', parseInt(e.target.value) || 0)} /></td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.unit}</td>
                        <td><input type="number" className="form-control" style={{ padding: '8px 10px', fontSize: '0.85rem', textAlign: 'right' }} value={item.unit_price} onChange={e => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} /></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.9rem' }}>{formatIDR(item.qty * item.unit_price)}</td>
                        <td>
                          {invItems.length > 1 && <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '6px' }} onClick={() => removeLineItem(idx)}><X size={14} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ textAlign: 'right', marginTop: '16px', fontSize: '1.2rem', fontWeight: 800 }}>
                  Total: <span style={{ color: 'var(--accent)', marginLeft: '12px' }}>{formatIDR(invTotal)}</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes (opsional)</label>
                <textarea className="form-control" rows="3" placeholder="Catatan untuk invoice ini..." value={invNotes} onChange={e => setInvNotes(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '14px' }} onClick={() => setShowCreateModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '14px', fontWeight: 700 }}>Buat Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="invoices"
        title="Bulk Import Purchase Order"
        description="Upload baris Purchase Order sekaligus dari file Excel. Baris dengan PO REF yang sama akan digabung jadi satu PO."
        onCommit={async (rows) => {
          const grouped = {};
          const unmatched = [];
          for (const row of rows) {
            const key = row.po_ref || `PO-${Date.now()}`;
            if (!grouped[key]) {
              grouped[key] = {
                supplier: row.supplier || '',
                notes: row.notes || '',
                location: row.location || 'CENTRAL',
                items: []
              };
            }
            const mat = stock.find(s => s.name.toLowerCase() === (row.item_name || '').toLowerCase().trim());
            if (!mat) {
              unmatched.push(row.item_name);
              continue;
            }
            grouped[key].items.push({
              material_id: mat.id,
              qty: parseFloat(row.qty || 0),
              unit_price: parseFloat(row.unit_price || 0)
            });
          }
          let success = 0;
          let failed = 0;
          for (const po of Object.values(grouped)) {
            if (po.items.length === 0) { failed++; continue; }
            try {
              await api.createInvoice({
                supplier: po.supplier,
                notes: po.notes,
                location: po.location,
                items: po.items
              });
              success++;
            } catch {
              failed++;
            }
          }
          await refreshData();
          if (unmatched.length > 0) {
            toast(`${unmatched.length} item tidak ditemukan di database: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '...' : ''}. PO tetap dibuat untuk item yang cocok.`, 'warning');
          }
          return { success, failed: failed + unmatched.length };
        }}
        expectedColumns={[
          { key: 'po_ref', label: 'PO REF', required: true, type: 'string', description: 'Referensi PO (Satu referensi akan digabung jadi satu PO)', sample: 'PO-2023-001' },
          { key: 'supplier', label: 'SUPPLIER', required: true, type: 'string', description: 'Nama supplier', sample: 'Vendor B' },
          { key: 'item_name', label: 'NAMA ITEM', required: true, type: 'string', description: 'Nama bahan baku (sama di sistem)', sample: 'Gula Pasir' },
          { key: 'qty', label: 'KUANTITI', required: true, type: 'number', description: 'Jumlah yang dipesan', sample: 5 },
          { key: 'unit_price', label: 'HARGA SATUAN', required: true, type: 'number', description: 'Harga satuan bahan', sample: 15000 },
          { key: 'location', label: 'LOKASI', required: false, type: 'string', description: 'Gudang tujuan (CENTRAL / RESTO)', sample: 'CENTRAL' },
          { key: 'notes', label: 'CATATAN', required: false, type: 'string', description: 'Catatan PO', sample: 'Urgent' }
        ]}
      />

    </div>
  );
}

