import { useState, useMemo, useEffect } from 'react';
import { Plus, X, FileText, CheckCircle, XCircle, Clock, Package, Search, Download, Eye, UploadCloud } from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import BulkImport from '../../components/BulkImport';
import Pagination from '../../components/shared/Pagination';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';
import useDebounce from '../../hooks/useDebounce';

const rowUid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `r${Date.now()}${Math.random()}`);
const blankLineItem = () => ({ item_name: '', qty: 1, unit_price: 0, unit: 'pck', _uid: rowUid() });

export default function Invoicing() {
  const { stock, showToast: toast, handleCreateInvoice: onCreateInvoice, handleReceiveInvoice: onReceiveInvoice, handleCancelInvoice: onCancelInvoice, refreshData } = useData();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [invoiceToSubmit, setInvoiceToSubmit] = useState(null);
  
  const [search, setSearch] = useState('');
  const [invSupplier, setInvSupplier] = useState('');
  const [invNotes, setInvNotes] = useState('');
  const [invItems, setInvItems] = useState([blankLineItem()]);
  const [itemDropdown, setItemDropdown] = useState(null);

  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  const INVOICES_PAGE_SIZE = 15;
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [paginatedInvoices, setPaginatedInvoices] = useState([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [kpis, setKpis] = useState({ total: 0, pending: 0, received: 0, totalValue: 0 });
  

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInvoicesPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const { data, totalCount } = await api.getInvoicesPaged({ page: invoicesPage, pageSize: INVOICES_PAGE_SIZE, search: debouncedSearch, status: statusFilter });
        setPaginatedInvoices(data);
        setTotalInvoices(totalCount);
      } catch (err) {
        console.error('Failed to fetch invoices:', err);
      }
    };
    fetchInvoices();
  }, [invoicesPage, debouncedSearch, statusFilter]);

  useEffect(() => {
    const fetchKpis = async () => {
      try {
        const stats = await api.getInvoicesStats();
        setKpis(stats);
      } catch (err) {
        console.error('Failed to fetch invoice stats:', err);
      }
    };
    fetchKpis();
  }, []);

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
  const handlePrepareSubmit = (e) => {
    e.preventDefault();
    if (!invSupplier.trim()) return;
    const validItems = invItems.filter(i => i.item_name && i.qty > 0);
    if (validItems.length === 0) return;

    const invoice = {
      supplier: invSupplier,
      date: new Date().toISOString().split('T')[0],
      items: validItems,
      total: validItems.reduce((a, i) => a + i.qty * i.unit_price, 0),
      status: 'DRAFT',
      notes: invNotes,
      received_date: null
    };

    setInvoiceToSubmit(invoice);
    setShowConfirmModal(true);
  };

  const handleFinalSubmit = () => {
    if (!invoiceToSubmit) return;
    onCreateInvoice(invoiceToSubmit);
    setShowConfirmModal(false);
    setShowCreateModal(false);
    setInvSupplier('');
    setInvNotes('');
    setInvItems([blankLineItem()]);
    setInvoiceToSubmit(null);
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
      <style>
        body { font-family: 'Inter', Arial, sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
        .brand h1 { font-size: 28px; margin: 0; color: #059669; letter-spacing: -0.5px; }
        .brand p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
        .invoice-details { text-align: right; }
        .invoice-details h2 { margin: 0 0 5px 0; font-size: 20px; color: #0f172a; }
        .invoice-details p { margin: 2px 0; color: #475569; font-size: 14px; }
        .supplier-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .supplier-box h3 { margin: 0 0 10px 0; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .supplier-box p { margin: 0; font-size: 16px; font-weight: 600; color: #0f172a; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0 0 30px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 600; color: #475569; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
        td { font-size: 14px; color: #334155; }
        tr:last-child td { border-bottom: none; }
        .amount-col { text-align: right; }
        .total-box { display: flex; justify-content: flex-end; }
        .total-content { background: #f8fafc; padding: 20px 30px; border-radius: 8px; border: 1px solid #e2e8f0; min-width: 250px; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; color: #64748b; }
        .total-row.final { border-top: 2px solid #e2e8f0; margin-top: 10px; padding-top: 10px; font-size: 18px; font-weight: 700; color: #0f172a; }
        .notes { margin-top: 40px; font-size: 13px; color: #64748b; background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; }
        @media print { body { padding: 0; } .supplier-box, .total-content { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <div class="header">
        <div class="brand">
          <h1>BARVENTIS</h1>
          <p>Sistem Manajemen Gudang & HPP</p>
        </div>
        <div class="invoice-details">
          <h2>Purchase Order</h2>
          <p><strong>No:</strong> ${escapeHTML(inv.invoice_no)}</p>
          <p><strong>Date:</strong> ${escapeHTML(inv.date)}</p>
          <p><strong>Status:</strong> ${escapeHTML(inv.status)}</p>
        </div>
      </div>
      <div class="supplier-box">
        <h3>Kepada / Supplier</h3>
        <p>${escapeHTML(inv.supplier)}</p>
      </div>
      <table>
        <thead><tr>
          <th style="width: 5%">#</th>
          <th style="width: 40%">Nama Item</th>
          <th style="width: 15%">Kuantiti</th>
          <th style="width: 20%" class="amount-col">Harga Satuan</th>
          <th style="width: 20%" class="amount-col">Subtotal</th>
        </tr></thead>
        <tbody>${(inv.items || []).map((item, i) => `
          <tr>
            <td>${i + 1}</td>
            <td style="font-weight: 500">${escapeHTML(item.item_name || '-')}</td>
            <td>${escapeHTML(item.qty)} ${escapeHTML(item.unit || '')}</td>
            <td class="amount-col">Rp ${(item.unit_price || 0).toLocaleString('id-ID')}</td>
            <td class="amount-col" style="font-weight: 600">Rp ${((item.qty || 0) * (item.unit_price || 0)).toLocaleString('id-ID')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="total-box">
        <div class="total-content">
          <div class="total-row"><span>Subtotal:</span> <span>Rp ${(inv.total || 0).toLocaleString('id-ID')}</span></div>
          <div class="total-row final"><span>TOTAL:</span> <span>Rp ${(inv.total || 0).toLocaleString('id-ID')}</span></div>
        </div>
      </div>
      ${inv.notes ? `<div class="notes"><strong>Catatan:</strong><br/>${escapeHTML(inv.notes)}</div>` : ''}
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

  const pendingCount = kpis.pending;
  const receivedCount = kpis.received;
  const totalValue = kpis.totalValue;

  return (
    <div className="fade-in">
      {/* Controls */}
      <div className="glass-card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Search invoices..." className="form-control" style={{ paddingLeft: '44px' }} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-control" style={{ width: '160px' }} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setInvoicesPage(1); }}>
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
          <div className="kpi-value">{kpis.total}</div>
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
              {totalInvoices === 0 && (
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
            totalCount={totalInvoices}
            onPageChange={setInvoicesPage}
            itemLabel="invoice"
          />
        </div>
      </div>

      {/* View Invoice Detail Slide-over Modal */}
      {viewInvoice && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: '100%', maxWidth: '600px', background: 'var(--bg-primary)', height: '100vh', padding: '32px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.1)', animation: 'slideInRight 0.3s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{viewInvoice.invoice_no}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{viewInvoice.supplier} · {viewInvoice.date}</div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {statusBadge(viewInvoice.status)}
                <button className="btn btn-secondary" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handlePrintInvoice(viewInvoice)}>
                  <Download size={14} /> Cetak / PDF
                </button>
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
            <form onSubmit={handlePrepareSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Invoice No (auto)</label>
                  <input type="text" className="form-control" value="Otomatis dibuat server" readOnly style={{ color: 'var(--text-muted)', fontFamily: 'monospace', background: 'var(--bg-secondary)' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Supplier</label>
                  <select className="form-control" value={invSupplier} onChange={e => setInvSupplier(e.target.value)} required>
                    <option value="">-- Pilih Supplier --</option>
                    {stock.map(s => <option key={s} value={s}>{s}</option>)}
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
          const errors = [];
          for (const row of rows) {
            const key = row.po_ref || `PO-${Date.now()}`;
            if (!grouped[key]) {
              grouped[key] = {
                po_ref: key,
                supplier: row.supplier || '',
                notes: row.notes || '',
                location: row.location || 'CENTRAL',
                items: []
              };
            }
            const mat = stock.find(s => s.name.toLowerCase() === (row.item_name || '').toLowerCase().trim());
            if (!mat) {
              unmatched.push(row.item_name);
              errors.push({ row: row.item_name || 'Item Kosong', error: `Bahan ${row.item_name} tidak ditemukan di master data` });
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
            if (po.items.length === 0) {
              failed++;
              continue;
            }
            try {
              await api.createInvoice({
                supplier: po.supplier,
                notes: po.notes,
                location: po.location,
                items: po.items
              });
              success++;
            } catch (err) {
              failed++;
              errors.push({ row: po.po_ref, error: err.message || 'Gagal menyimpan ke database' });
            }
          }
          await refreshData();
          if (unmatched.length > 0) {
            toast(`${unmatched.length} item tidak ditemukan di database: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '...' : ''}. PO tetap dibuat untuk item yang cocok.`, 'warning');
          }
          return { success, failed: failed + unmatched.length, errors };
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


      {/* Confirmation Modal */}
      {showConfirmModal && invoiceToSubmit && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Review Finalisasi Invoice (Purchase Order)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Tinjau kembali rincian pemesanan untuk supplier <strong>{invoiceToSubmit.supplier}</strong> sebelum membuat invoice DRAFT.
            </p>
            
            <div className="table-container" style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
              <table className="custom-table" style={{ fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ width: '100px' }}>Kuantitas</th>
                    <th style={{ width: '150px' }}>Harga Satuan</th>
                    <th style={{ textAlign: 'right' }}>Total (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceToSubmit.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            type="number" step="any" min="0" className="form-control" style={{ width: '60px', padding: '4px' }} 
                            value={item.qty} 
                            onChange={(e) => {
                              const newQty = parseFloat(e.target.value) || 0;
                              setInvoiceToSubmit(prev => {
                                const newItems = [...prev.items];
                                newItems[idx].qty = newQty;
                                const newTotal = newItems.reduce((a, i) => a + i.qty * i.unit_price, 0);
                                return { ...prev, items: newItems, total: newTotal };
                              });
                            }} 
                          />
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Rp</span>
                          <input 
                            type="number" step="any" min="0" className="form-control" style={{ paddingLeft: '32px', paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px' }} 
                            value={item.unit_price} 
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0;
                              setInvoiceToSubmit(prev => {
                                const newItems = [...prev.items];
                                newItems[idx].unit_price = newPrice;
                                const newTotal = newItems.reduce((a, i) => a + i.qty * i.unit_price, 0);
                                return { ...prev, items: newItems, total: newTotal };
                              });
                            }} 
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {(item.qty * item.unit_price).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                Total Order: <span style={{ color: 'var(--primary)' }}>Rp {invoiceToSubmit.total.toLocaleString('id-ID')}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Batal</button>
                <button type="button" className="btn btn-primary" onClick={handleFinalSubmit}>
                  Finalisasi Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

