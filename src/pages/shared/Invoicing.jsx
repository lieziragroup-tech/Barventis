/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus, X, FileText, CheckCircle, XCircle, Clock, Package, Search,
  Download, Eye, UploadCloud, Send, Camera, MapPin, ExternalLink
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import BulkImport from '../../components/BulkImport';
import Pagination from '../../components/shared/Pagination';
import { api } from '../../services/api';
import { formatIDR } from '../../services/costUtils';
import useDebounce from '../../hooks/useDebounce';
import { exportToPDF } from '../../services/export/pdfExporter';
import { exportWithAudit } from '../../services/export/exportAudit';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';

const rowUid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `r${Date.now()}${Math.random()}`);
const blankLineItem = () => ({ material_id: null, item_name: '', qty: 1, unit_price: 0, unit: 'pck', _uid: rowUid() });

export default function Invoicing() {
  const { stock, showToast: toast, handleCreateInvoice: onCreateInvoice, refreshData } = useData();
  const { activeUser, tenantName } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [invoiceToSubmit, setInvoiceToSubmit] = useState(null);

  // Suppliers Master
  const [suppliersList, setSuppliersList] = useState([]);
  const [isManualSupplier, setIsManualSupplier] = useState(false);

  // Create Form State
  const [search, setSearch] = useState('');
  const [invSupplier, setInvSupplier] = useState('');
  const [invLocation, setInvLocation] = useState('CENTRAL');
  const [invNotes, setInvNotes] = useState('');
  const [invItems, setInvItems] = useState([blankLineItem()]);
  const [itemDropdown, setItemDropdown] = useState(null);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assigningMaterialId, setAssigningMaterialId] = useState(null);
  const [completedSuppliersSession, setCompletedSuppliersSession] = useState([]);

  // Filter & Pagination
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const INVOICES_PAGE_SIZE = 15;
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [paginatedInvoices, setPaginatedInvoices] = useState([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [kpis, setKpis] = useState({ total: 0, pending: 0, received: 0, totalValue: 0 });
  const [loadingList, setLoadingList] = useState(false);

  // Goods Receipt Modal States
  const [showGoodsReceiptModal, setShowGoodsReceiptModal] = useState(null);
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [receiptPhotoPreview, setReceiptPhotoPreview] = useState(null);
  const [receiptGps, setReceiptGps] = useState('');
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const sigCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Load suppliers list
  const loadSuppliers = useCallback(async () => {
    try {
      const data = await api.getSuppliers();
      setSuppliersList(data || []);
    } catch (e) {
      console.error('Failed to load suppliers:', e);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Load invoices and KPIs
  const reloadInvoices = useCallback(async () => {
    setLoadingList(true);
    try {
      const [invRes, stats] = await Promise.all([
        api.getInvoicesPaged({ page: invoicesPage, pageSize: INVOICES_PAGE_SIZE, search: debouncedSearch, status: statusFilter }),
        api.getInvoicesStats()
      ]);
      setPaginatedInvoices(invRes.data);
      setTotalInvoices(invRes.totalCount);
      setKpis(stats);
    } catch (err) {
      console.error('Failed to reload invoices:', err);
    } finally {
      setLoadingList(false);
    }
  }, [invoicesPage, debouncedSearch, statusFilter]);

  useEffect(() => {
    setInvoicesPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    reloadInvoices();
  }, [reloadInvoices]);

  const normalizedActiveSupplier = useMemo(
    () => (invSupplier || '').trim().toLowerCase(),
    [invSupplier]
  );

  // Materials strictly belonging to the currently selected supplier
  const supplierMaterials = useMemo(() => {
    if (!normalizedActiveSupplier) return [];
    return (stock || []).filter(
      (s) => (s.supplier || '').trim().toLowerCase() === normalizedActiveSupplier
    );
  }, [stock, normalizedActiveSupplier]);

  // Materials in master stock not yet assigned to the active supplier
  const otherMaterials = useMemo(() => {
    if (!normalizedActiveSupplier) return [];
    return (stock || []).filter(
      (s) => (s.supplier || '').trim().toLowerCase() !== normalizedActiveSupplier
    );
  }, [stock, normalizedActiveSupplier]);

  // Set of material IDs already selected in current PO rows to prevent duplicate rows
  const selectedMaterialIds = useMemo(() => {
    const ids = new Set();
    invItems.forEach((item) => {
      if (item.material_id != null) ids.add(String(item.material_id));
    });
    return ids;
  }, [invItems]);

  const hasFilledLineItems = useMemo(
    () => invItems.some((i) => i.material_id != null || (i.item_name || '').trim() !== ''),
    [invItems]
  );

  const canAddMoreSupplierItems = useMemo(() => {
    if (!normalizedActiveSupplier) return false;
    if (supplierMaterials.length === 0) return false;
    return invItems.length < supplierMaterials.length;
  }, [normalizedActiveSupplier, supplierMaterials.length, invItems.length]);

  const handleSelectSupplierFocus = (newSupplierName) => {
    const trimmedNext = (newSupplierName || '').trim();
    const trimmedCurrent = (invSupplier || '').trim();
    if (trimmedCurrent && trimmedNext.toLowerCase() !== trimmedCurrent.toLowerCase() && hasFilledLineItems) {
      const ok = window.confirm(
        `Ganti fokus supplier dari "${trimmedCurrent}" ke "${trimmedNext || 'Supplier Lain'}"?\n\nDaftar bahan pada PO saat ini akan di-reset agar tidak tercampur antar supplier.`
      );
      if (!ok) return;
    }
    setInvSupplier(newSupplierName);
    setInvItems([blankLineItem()]);
    setItemDropdown(null);
    setShowAssignPanel(false);
    setAssignSearch('');
  };

  const handleResetSupplierFocus = () => {
    if (hasFilledLineItems) {
      const ok = window.confirm(
        `Ganti supplier saat ini ("${invSupplier}")?\n\nBaris bahan yang sudah dipilih akan dikosongkan agar fokus ke supplier berikutnya.`
      );
      if (!ok) return;
    }
    setInvSupplier('');
    setInvItems([blankLineItem()]);
    setItemDropdown(null);
    setShowAssignPanel(false);
    setAssignSearch('');
  };

  // Add & Manage line items (Bounded by supplierMaterials count)
  const addLineItem = () => {
    if (!normalizedActiveSupplier) {
      if (toast) toast('Pilih supplier terlebih dahulu sebelum menambah bahan.', 'warning');
      return;
    }
    if (supplierMaterials.length === 0) {
      setShowAssignPanel(true);
      if (toast) toast(`Belum ada bahan terdaftar untuk supplier "${invSupplier}". Gunakan fitur "+ Masukkan Bahan ke Supplier Ini".`, 'info');
      return;
    }
    if (invItems.length >= supplierMaterials.length) {
      if (toast) toast(`Batas maksimum tercapai: Supplier "${invSupplier}" hanya memiliki ${supplierMaterials.length} bahan terdaftar.`, 'info');
      return;
    }
    setInvItems([...invItems, blankLineItem()]);
  };

  const handleFillAllSupplierMaterials = () => {
    if (!normalizedActiveSupplier || supplierMaterials.length === 0) return;
    const allRows = supplierMaterials.map((mat) => ({
      material_id: mat.id,
      item_name: mat.name,
      qty: 1,
      unit_price: Number(mat.new_price) > 0 ? Number(mat.new_price) : Number(mat.price || 0),
      unit: mat.unit || 'pck',
      _uid: rowUid(),
    }));
    setInvItems(allRows);
    setItemDropdown(null);
  };

  const removeLineItem = (idx) => {
    if (invItems.length <= 1) {
      setInvItems([blankLineItem()]);
      return;
    }
    setInvItems(invItems.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx, field, value) => {
    const updated = [...invItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setInvItems(updated);
  };

  const selectStockItem = (idx, item) => {
    const updated = [...invItems];
    updated[idx] = {
      ...updated[idx],
      material_id: item.id,
      item_name: item.name,
      unit_price: Number(item.new_price) > 0 ? Number(item.new_price) : Number(item.price || 0),
      unit: item.unit || 'pck'
    };
    setInvItems(updated);
    setItemDropdown(null);
  };

  // Trigger: Assign an existing material from stock to the currently focused supplier & add to PO
  const handleAssignMaterialToSupplier = async (material, targetRowIdx = null) => {
    const targetSupplier = (invSupplier || '').trim();
    if (!targetSupplier || !material?.id) return;
    setAssigningMaterialId(material.id);
    try {
      await api.updateMaterial(material.id, { supplier: targetSupplier }, activeUser?.id);
      await refreshData();

      const newLine = {
        material_id: material.id,
        item_name: material.name,
        qty: 1,
        unit_price: Number(material.new_price) > 0 ? Number(material.new_price) : Number(material.price || 0),
        unit: material.unit || 'pck',
        _uid: rowUid(),
      };

      setInvItems((prev) => {
        if (targetRowIdx !== null && prev[targetRowIdx]) {
          const next = [...prev];
          next[targetRowIdx] = { ...next[targetRowIdx], ...newLine, _uid: next[targetRowIdx]._uid };
          return next;
        }
        // Replace first blank row if available, otherwise append new row
        const emptyIdx = prev.findIndex((r) => !r.material_id && !(r.item_name || '').trim());
        if (emptyIdx !== -1) {
          const next = [...prev];
          next[emptyIdx] = { ...next[emptyIdx], ...newLine, _uid: next[emptyIdx]._uid };
          return next;
        }
        return [...prev, newLine];
      });

      setItemDropdown(null);
      setAssignSearch('');
      if (toast) {
        toast(`Bahan "${material.name}" resmi didaftarkan ke supplier "${targetSupplier}" & ditambahkan ke PO.`, 'success');
      }
    } catch (err) {
      if (toast) toast(err.message || 'Gagal mengaitkan bahan ke supplier', 'error');
    } finally {
      setAssigningMaterialId(null);
    }
  };

  // Calculate total
  const invTotal = useMemo(() => invItems.reduce((acc, item) => acc + (item.qty * item.unit_price), 0), [invItems]);

  // Submit new invoice / PO
  const handlePrepareSubmit = (e) => {
    e.preventDefault();
    if (!invSupplier.trim()) {
      if (toast) toast('Pilih atau masukkan nama supplier terlebih dahulu.', 'warning');
      return;
    }
    const validItems = invItems.filter(i => i.item_name && i.qty > 0);
    if (validItems.length === 0) {
      if (toast) toast('Tambahkan minimal 1 bahan dengan kuantitas lebih dari 0.', 'warning');
      return;
    }

    // Validate boundary: every item in PO must belong to the selected supplier
    const invalidSupplierItem = validItems.find((item) => {
      const match = supplierMaterials.find(
        (s) => String(s.id) === String(item.material_id) || s.name.trim().toLowerCase() === item.item_name.trim().toLowerCase()
      );
      return !match;
    });

    if (invalidSupplierItem) {
      if (toast) {
        toast(
          `Bahan "${invalidSupplierItem.item_name}" belum terdaftar pada supplier "${invSupplier.trim()}". Pilih bahan milik supplier ini atau klik trigger "+ Masukkan ke Supplier" terlebih dahulu.`,
          'error'
        );
      }
      return;
    }

    const formattedItems = validItems.map(item => {
      const match = supplierMaterials.find(
        s => String(s.id) === String(item.material_id) || s.name.trim().toLowerCase() === item.item_name.trim().toLowerCase()
      );
      return {
        material_id: item.material_id || (match ? match.id : null),
        item_name: match ? match.name : item.item_name,
        qty: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price),
        unit: item.unit || (match ? match.unit : 'pck')
      };
    });

    const invoice = {
      supplier: invSupplier.trim(),
      date: new Date().toISOString().split('T')[0],
      items: formattedItems,
      location: invLocation || 'CENTRAL',
      total: formattedItems.reduce((a, i) => a + (i.qty * i.unit_price), 0),
      status: 'DRAFT',
      notes: invNotes,
      received_date: null
    };

    setInvoiceToSubmit(invoice);
    setShowConfirmModal(true);
  };

  const handleFinalSubmit = async (continueToNextSupplier = false) => {
    if (!invoiceToSubmit) return;
    try {
      const savedSupplierName = invoiceToSubmit.supplier;
      await onCreateInvoice(invoiceToSubmit);
      setShowConfirmModal(false);
      setInvSupplier('');
      setInvNotes('');
      setIsManualSupplier(false);
      setInvItems([blankLineItem()]);
      setInvoiceToSubmit(null);
      setShowAssignPanel(false);
      setAssignSearch('');

      if (continueToNextSupplier) {
        setCompletedSuppliersSession((prev) =>
          prev.includes(savedSupplierName) ? prev : [...prev, savedSupplierName]
        );
        if (toast) {
          toast(
            `PO untuk "${savedSupplierName}" berhasil disimpan! Silakan pilih supplier berikutnya.`,
            'success'
          );
        }
      } else {
        setShowCreateModal(false);
        setCompletedSuppliersSession([]);
        if (toast) toast('Purchase Order / Invoice berhasil dibuat (Status: DRAFT).', 'success');
      }
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal membuat invoice', 'error');
    }
  };

  // Status Actions: Send PO
  const handleKirimPO = async (inv) => {
    if (!window.confirm(`Kirim Purchase Order ${inv.invoice_no} ke supplier "${inv.supplier}"?\n\nStatus PO akan berubah menjadi SENT.`)) return;
    try {
      await api.updateInvoiceStatus(inv.id, 'SENT');
      if (toast) toast(`PO ${inv.invoice_no} berhasil ditandai SENT (Terkirim).`, 'success');
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal mengirim PO', 'error');
      else alert('Gagal mengirim PO: ' + err.message);
    }
  };

  // Status Actions: Cancel PO
  const handleCancelPO = async (inv) => {
    if (!window.confirm(`Batalkan Purchase Order ${inv.invoice_no}?\n\nInvoice/PO ini akan diubah statusnya menjadi CANCELLED dan tidak dapat diubah kembali.`)) return;
    try {
      await api.updateInvoiceStatus(inv.id, 'CANCELLED');
      if (toast) toast(`PO ${inv.invoice_no} berhasil dibatalkan.`, 'info');
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal membatalkan PO', 'error');
      else alert('Gagal membatalkan PO: ' + err.message);
    }
  };

  // Open Goods Receipt Modal
  const openReceiveModal = (inv) => {
    setShowGoodsReceiptModal(inv);
    setReceiptPhoto(null);
    setReceiptPhotoPreview(null);
    setReceiptGps('');
  };

  // Handle Photo & GPS
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptPhoto(file);
      const url = URL.createObjectURL(file);
      setReceiptPhotoPreview(url);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation tidak didukung browser ini");
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReceiptGps(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
        setIsGettingGps(false);
      },
      (err) => {
        alert("Gagal mengambil GPS: " + err.message);
        setIsGettingGps(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Signature Canvas Helpers
  const getCoordinates = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Confirm Receipt
  const handleConfirmReceipt = async (isQuick = false) => {
    if (!showGoodsReceiptModal) return;
    setIsReceiving(true);
    try {
      let photoUrl = null;
      let signatureUrl = null;

      if (!isQuick) {
        if (receiptPhoto) {
          try {
            const photoName = `receipt_${showGoodsReceiptModal.id}_${Date.now()}.jpg`;
            const { error: photoErr } = await supabase.storage.from('signatures').upload(photoName, receiptPhoto);
            if (!photoErr) {
              photoUrl = supabase.storage.from('signatures').getPublicUrl(photoName).data.publicUrl;
            }
          } catch (uploadErr) {
            console.warn('Upload foto receipt warning:', uploadErr);
          }
        }

        const canvas = sigCanvasRef.current;
        if (canvas) {
          try {
            const sigData = canvas.toDataURL('image/png');
            const isBlank = !canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(channel => channel !== 0);
            if (!isBlank) {
              const sigBlob = await (await fetch(sigData)).blob();
              const sigName = `sig_${showGoodsReceiptModal.id}_${Date.now()}.png`;
              const { error: sigErr } = await supabase.storage.from('signatures').upload(sigName, sigBlob);
              if (!sigErr) {
                signatureUrl = supabase.storage.from('signatures').getPublicUrl(sigName).data.publicUrl;
              } else {
                signatureUrl = sigData;
              }
            }
          } catch (uploadSigErr) {
            console.warn('Upload signature warning:', uploadSigErr);
          }
        }
      }

      await api.receiveInvoice(showGoodsReceiptModal.id, {
        photoUrl,
        signatureUrl,
        gps: receiptGps || null
      });

      if (toast) toast(`PO ${showGoodsReceiptModal.invoice_no} berhasil diterima! Stok otomatis bertambah di ${showGoodsReceiptModal.location || 'CENTRAL'}.`, 'success');
      setShowGoodsReceiptModal(null);
      setReceiptPhoto(null);
      setReceiptPhotoPreview(null);
      setReceiptGps('');
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal menerima barang', 'error');
      else alert('Gagal menerima barang: ' + err.message);
    } finally {
      setIsReceiving(false);
    }
  };

  // Status badge
  const statusBadge = (status) => {
    const map = {
      DRAFT: { label: 'DRAFT', bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)' },
      SENT: { label: 'SENT', bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', border: 'rgba(59, 130, 246, 0.3)' },
      RECEIVED: { label: 'RECEIVED', bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
      GOODS_RECEIVED: { label: 'RECEIVED', bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
      CANCELLED: { label: 'CANCELLED', bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' }
    };
    const s = map[status] || { label: status, bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)' };
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.03em',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`
      }}>
        {s.label}
      </span>
    );
  };

  // Print PO / Invoice
  const handlePrintInvoice = async (inv) => {
    try {
      const columns = [
        { key: 'no', label: '#' },
        { key: 'item', label: 'Nama Item' },
        { key: 'qty', label: 'Kuantiti' },
        { key: 'price', label: 'Harga Satuan' },
        { key: 'subtotal', label: 'Subtotal' }
      ];
      const rows = (inv.items || []).map((item, i) => ({
        no: i + 1,
        item: item.item_name || '-',
        qty: `${item.qty} ${item.unit || ''}`,
        price: `Rp ${(item.unit_price || 0).toLocaleString('id-ID')}`,
        subtotal: `Rp ${((item.qty || 0) * (item.unit_price || 0)).toLocaleString('id-ID')}`
      }));
      rows.push({
        no: '',
        item: 'TOTAL PEMBELIAN',
        qty: '',
        price: '',
        subtotal: `Rp ${(inv.total || 0).toLocaleString('id-ID')}`
      });

      await exportToPDF({
        filename: `PO_${inv.invoice_no}`,
        title: `Purchase Order - ${inv.invoice_no}
Tanggal: ${inv.date}
Supplier: ${inv.supplier}
Lokasi Gudang: ${inv.location || 'CENTRAL'}
Status: ${inv.status}

Catatan: ${inv.notes || '-'}`,
        tenantName: 'BARVENTIS - Sistem Manajemen Purchasing & Invoicing',
        columns,
        rows
      });
    } catch (err) {
      console.error(err);
      toast('Gagal mencetak PO.', 'error');
    }
  };

  // Export handlers adhering to current filter/search state
  const fetchAllInvoicesForExport = async () => {
    const sizeNeeded = totalInvoices > 0 ? totalInvoices : 10000;
    const res = await api.getInvoicesPaged({
      page: 1,
      pageSize: sizeNeeded,
      search: debouncedSearch,
      status: statusFilter
    });
    return res.data || [];
  };

  const handleExportExcel = async () => {
    try {
      const allInvoices = await fetchAllInvoicesForExport();
      if (allInvoices.length === 0) {
        if (toast) toast('Tidak ada data invoice yang sesuai untuk diekspor.', 'info');
        else alert('Tidak ada data invoice yang sesuai untuk diekspor.');
        return;
      }

      const rows = allInvoices.map((inv, idx) => {
        const itemsSummary = (inv.items || [])
          .map(i => `${i.item_name} (${i.qty} ${i.unit || 'unit'} @ Rp ${(i.unit_price || 0).toLocaleString('id-ID')})`)
          .join('; ');

        return {
          'NO': idx + 1,
          'NO PO / INVOICE': inv.invoice_no || '-',
          'SUPPLIER': inv.supplier || '-',
          'TANGGAL PO': inv.date || '-',
          'LOKASI GUDANG': inv.location || 'CENTRAL',
          'STATUS PO': inv.status || 'DRAFT',
          'JUMLAH ITEM': inv.items?.length || 0,
          'TOTAL NILAI (RP)': inv.total || 0,
          'TANGGAL TERIMA': inv.received_date ? new Date(inv.received_date).toLocaleDateString('id-ID') : '-',
          'TITIK GPS PENERIMAAN': inv.receipt_gps || '-',
          'CATATAN / NOTES': inv.notes || '-',
          'RINCIAN ITEM': itemsSummary || '-'
        };
      });

      const filterLabel = statusFilter === 'ALL' ? 'Semua_Status' : statusFilter;
      const searchTag = debouncedSearch ? `_query_${debouncedSearch.slice(0, 10).replace(/[^a-zA-Z0-9]/g, '')}` : '';

      await exportWithAudit({
        format: 'excel',
        filename: `Laporan_PO_Invoicing_${filterLabel}${searchTag}`,
        sheets: [{ name: 'Purchase Orders & Invoices', rows }],
        actionName: 'Invoicing PO Export Excel',
        role: activeUser?.role || 'SuperAdmin'
      });
      if (toast) toast(`Berhasil mengekspor ${rows.length} invoice ke Excel.`, 'success');
    } catch (err) {
      console.error('Export Excel Invoicing failed:', err);
      if (toast) toast('Gagal mengekspor data invoice ke Excel: ' + err.message, 'error');
      else alert('Gagal mengekspor: ' + err.message);
    }
  };

  const handleExportPDF = async () => {
    try {
      const allInvoices = await fetchAllInvoicesForExport();
      if (allInvoices.length === 0) {
        if (toast) toast('Tidak ada data invoice yang sesuai untuk diekspor.', 'info');
        else alert('Tidak ada data invoice yang sesuai untuk diekspor.');
        return;
      }

      const columns = [
        { key: 'no', label: '#' },
        { key: 'invoice_no', label: 'No PO / Invoice' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'date', label: 'Tanggal' },
        { key: 'location', label: 'Lokasi' },
        { key: 'items_count', label: 'Item' },
        { key: 'total', label: 'Total Nilai' },
        { key: 'status', label: 'Status' },
        { key: 'received_date', label: 'Tgl Terima' }
      ];

      const rows = allInvoices.map((inv, idx) => ({
        no: idx + 1,
        invoice_no: inv.invoice_no || '-',
        supplier: inv.supplier || '-',
        date: inv.date || '-',
        location: inv.location || 'CENTRAL',
        items_count: `${inv.items?.length || 0} item`,
        total: `Rp ${(inv.total || 0).toLocaleString('id-ID')}`,
        status: inv.status || 'DRAFT',
        received_date: inv.received_date ? new Date(inv.received_date).toLocaleDateString('id-ID') : '-'
      }));

      const filterStatusText = statusFilter === 'ALL' ? 'Semua Status' : statusFilter;
      const searchSubtext = debouncedSearch ? ` | Pencarian: "${debouncedSearch}"` : '';

      await exportWithAudit({
        format: 'pdf',
        filename: `Laporan_PO_Invoicing_${statusFilter}`,
        title: `Laporan Purchase Order & Invoicing\nFilter: Status ${filterStatusText}${searchSubtext} (${rows.length} transaksi)`,
        tenantName: tenantName || 'BARVENTIS - Sistem Manajemen Purchasing & Invoicing',
        columns,
        rows,
        actionName: 'Invoicing PO Export PDF',
        role: activeUser?.role || 'SuperAdmin'
      });
      if (toast) toast(`Berhasil mengekspor ${rows.length} invoice ke PDF.`, 'success');
    } catch (err) {
      console.error('Export PDF Invoicing failed:', err);
      if (toast) toast('Gagal mengekspor data invoice ke PDF: ' + err.message, 'error');
      else alert('Gagal mengekspor PDF: ' + err.message);
    }
  };

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Purchase Orders & Invoicing
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Siklus lengkap pengadaan bahan baku: Buat PO, kirim ke Supplier, dan verifikasi penerimaan barang (Goods Receipt) langsung ke stok gudang.
        </p>
      </div>

      {/* Controls */}
      <div className="glass-card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Cari nomor PO atau nama supplier..."
              className="form-control"
              style={{ paddingLeft: '40px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: '160px' }}
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setInvoicesPage(1); }}
          >
            <option value="ALL">Semua Status</option>
            <option value="DRAFT">DRAFT (Baru)</option>
            <option value="SENT">SENT (Terkirim)</option>
            <option value="RECEIVED">RECEIVED (Diterima)</option>
            <option value="CANCELLED">CANCELLED (Batal)</option>
          </select>
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            currentRole={activeUser?.role}
          />
          <PrintButton
            currentRole={activeUser?.role}
            title="Cetak daftar Purchase Order & Invoicing"
          />
          <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowBulkImport(true)}>
            <UploadCloud size={15} style={{ marginRight: '6px' }} /> Bulk Import PO
          </button>
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowCreateModal(true)}>
            <Plus size={15} style={{ marginRight: '6px' }} /> Buat PO Baru
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid no-print" style={{ marginBottom: '24px' }}>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total PO / Invoices</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}><FileText size={18} /></div>
          </div>
          <div className="kpi-value">{kpis.total}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Pending (Draft / Sent)</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}><Clock size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: '#d97706' }}>{kpis.pending}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Received (Stok Masuk)</span>
            <div className="kpi-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669' }}><CheckCircle size={18} /></div>
          </div>
          <div className="kpi-value" style={{ color: '#059669' }}>{kpis.received}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Nilai Pengadaan</span>
            <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}><Package size={18} /></div>
          </div>
          <div className="kpi-value" style={{ fontSize: '1.25rem' }}>{formatIDR(kpis.totalValue)}</div>
        </div>
      </div>

      {/* Print-only Document Header */}
      <div className="print-only print-header">
        <div className="print-header-brand">BARVENTIS — SISTEM MANAJEMEN GUDANG</div>
        <div style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>Daftar Purchase Order & Invoicing</div>
        <div className="print-header-meta">
          Status: {statusFilter} | Pencarian: {search || 'Semua'} | Dicetak pada: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
        </div>
      </div>

      {/* Invoices Table */}
      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container relative">
          <TableLoadingOverlay loading={loadingList && paginatedInvoices.length > 0} message="Menyinkronkan daftar PO..." />
          <table className="custom-table">
            <thead>
              <tr>
                <th>No PO / Invoice</th>
                <th>Supplier</th>
                <th>Tanggal</th>
                <th style={{ textAlign: 'center' }}>Lokasi</th>
                <th style={{ textAlign: 'right' }}>Item</th>
                <th style={{ textAlign: 'right' }}>Total Nilai</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'center', minWidth: '220px' }} className="no-print">Aksi Siklus PO</th>
              </tr>
            </thead>
            <tbody>
              {loadingList && paginatedInvoices.length === 0 ? (
                <TableSkeletonRows
                  rows={6}
                  columns={[
                    { width: '140px', type: 'text' },
                    { width: '160px', type: 'text' },
                    { width: '110px', type: 'text' },
                    { width: '90px', type: 'badge' },
                    { width: '80px', type: 'text', align: 'right' },
                    { width: '120px', type: 'text', align: 'right' },
                    { width: '100px', type: 'badge' },
                    { width: '220px', type: 'actions' }
                  ]}
                />
              ) : (
                paginatedInvoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>
                      {inv.invoice_no}
                    </td>
                    <td style={{ fontWeight: 500 }}>{inv.supplier}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{inv.date}</td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                        {inv.location || 'CENTRAL'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{inv.items?.length || 0} bahan</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatIDR(inv.total)}</td>
                    <td style={{ textAlign: 'center' }}>{statusBadge(inv.status)}</td>
                    <td style={{ textAlign: 'center' }} className="no-print">
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        {/* Detail Modal */}
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)' }}
                          title="Lihat Rincian PO"
                          onClick={() => setViewInvoice(inv)}
                        >
                          <Eye size={14} />
                        </button>

                        {/* Cetak PDF */}
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)' }}
                          title="Cetak Purchase Order PDF"
                          onClick={() => handlePrintInvoice(inv)}
                        >
                          <Download size={14} />
                        </button>

                        {/* Status: DRAFT -> Kirim PO */}
                        {inv.status === 'DRAFT' && (
                          <button
                            className="btn btn-primary"
                            style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Tandai PO Terkirim ke Supplier"
                            onClick={() => handleKirimPO(inv)}
                          >
                            <Send size={12} /> Kirim PO
                          </button>
                        )}

                        {/* Status: DRAFT or SENT -> Terima Barang (Goods Receipt) */}
                        {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                          <button
                            className="btn btn-success"
                            style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Terima Barang & Tambah Stok Gudang"
                            onClick={() => openReceiveModal(inv)}
                          >
                            <CheckCircle size={12} /> Terima Barang
                          </button>
                        )}

                        {/* Status: DRAFT or SENT -> Batalkan PO */}
                        {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }}
                            title="Batalkan PO"
                            onClick={() => handleCancelPO(inv)}
                          >
                            <XCircle size={14} />
                          </button>
                        )}

                        {/* Status: RECEIVED */}
                        {(inv.status === 'RECEIVED' || inv.status === 'GOODS_RECEIVED') && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, padding: '4px 6px' }}>
                            ✓ Stok Masuk
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}

              {!loadingList && totalInvoices === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    Belum ada Purchase Order. Klik "Buat PO Baru" untuk membuat pesanan pembelian baru.
                  </td>
                </tr>
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
            itemLabel="PO"
          />
        </div>
      </div>

      {/* View PO Detail Slide-over Modal */}
      {viewInvoice && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }} onClick={() => setViewInvoice(null)}>
          <div style={{ width: '100%', maxWidth: '650px', background: 'var(--bg-primary)', height: '100vh', padding: '28px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.2)', animation: 'slideInRight 0.3s ease' }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{viewInvoice.invoice_no}</h3>
                  {statusBadge(viewInvoice.status)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  Supplier: <strong style={{ color: 'var(--text-primary)' }}>{viewInvoice.supplier}</strong> · Tanggal: {viewInvoice.date}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Tujuan Gudang: <strong style={{ color: 'var(--text-primary)' }}>{viewInvoice.location || 'CENTRAL'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handlePrintInvoice(viewInvoice)}>
                  <Download size={14} /> Cetak / PDF
                </button>
                <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setViewInvoice(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notes if any */}
            {viewInvoice.notes && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px', background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <strong>Catatan PO:</strong> {viewInvoice.notes}
              </div>
            )}

            {/* Line Items Table */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px' }}>Daftar Bahan / Barang</h4>
              <table className="custom-table" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '10px 12px' }}>#</th>
                    <th>Nama Bahan</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th>Unit</th>
                    <th style={{ textAlign: 'right' }}>Harga Satuan</th>
                    <th style={{ textAlign: 'right', paddingRight: '12px' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewInvoice.items || []).map((item, i) => (
                    <tr key={i}>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.qty}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.unit || 'pck'}</td>
                      <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{formatIDR(item.unit_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '12px' }}>{formatIDR(item.qty * item.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', fontSize: '1.15rem', fontWeight: 800 }}>
                Total Order: <span style={{ color: 'var(--accent)', marginLeft: '12px' }}>{formatIDR(viewInvoice.total)}</span>
              </div>
            </div>

            {/* Goods Receipt Audit Details (if Received) */}
            {(viewInvoice.status === 'RECEIVED' || viewInvoice.status === 'GOODS_RECEIVED') && (
              <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '10px' }}>
                  <CheckCircle size={18} /> Informasi Penerimaan Barang (Goods Receipt)
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div>Waktu Penerimaan: <strong style={{ color: 'var(--text-primary)' }}>{viewInvoice.received_date || 'Tercatat'}</strong></div>
                  <div>Gudang Penyimpanan: <strong style={{ color: 'var(--text-primary)' }}>{viewInvoice.location || 'CENTRAL'}</strong></div>
                  {viewInvoice.receipt_gps && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={14} className="text-emerald-600" />
                      <span>Koordinat GPS: <strong>{viewInvoice.receipt_gps}</strong></span>
                      <a
                        href={`https://www.google.com/maps?q=${viewInvoice.receipt_gps}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '0.75rem', color: 'var(--accent)', marginLeft: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                      >
                        Buka Peta <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>

                {/* Photo & Signature Preview if available */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '14px' }}>
                  {viewInvoice.receipt_photo_url && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px', background: 'var(--bg-primary)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>Foto Bukti / Surat Jalan:</div>
                      <a href={viewInvoice.receipt_photo_url} target="_blank" rel="noreferrer">
                        <img
                          src={viewInvoice.receipt_photo_url}
                          alt="Bukti Penerimaan"
                          style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }}
                        />
                      </a>
                    </div>
                  )}
                  {viewInvoice.receipt_signature_url && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '8px', background: 'var(--bg-primary)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>Tanda Tangan Penerima:</div>
                      <img
                        src={viewInvoice.receipt_signature_url}
                        alt="Tanda Tangan"
                        style={{ width: '100%', height: '120px', objectFit: 'contain', background: '#f8fafc', borderRadius: '4px' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create PO Slide-over Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.2s ease' }} onClick={() => setShowCreateModal(false)}>
          <div style={{ width: '100%', maxWidth: '780px', background: 'var(--bg-primary)', height: '100vh', padding: '28px 24px', overflowY: 'auto', borderLeft: '1px solid var(--border)', boxShadow: '-10px 0 30px rgba(0,0,0,0.2)', animation: 'slideInRight 0.3s ease' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Buat Purchase Order Baru</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Buat PO draft untuk supplier. PO dapat dikirim atau langsung diterima ke stok gudang.
                </p>
              </div>
              <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowCreateModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handlePrepareSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Session Progress Banner when creating multiple POs sequentially */}
              {completedSuppliersSession.length > 0 && (
                <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: 'var(--success)' }}>✓ PO Selesai di Sesi Ini ({completedSuppliersSession.length} Supplier):</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{completedSuppliersSession.join(', ')}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pilih supplier berikutnya di bawah</span>
                </div>
              )}

              {/* Step 1: Supplier & Warehouse Focus Section */}
              <div style={{ border: '1px solid var(--border)', padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: normalizedActiveSupplier ? 'rgba(5, 150, 105, 0.04)' : 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: normalizedActiveSupplier ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    Langkah 1 — Tentukan Fokus Supplier
                  </div>
                  {normalizedActiveSupplier && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)' }}>
                        {supplierMaterials.length} Bahan Terdaftar pada Supplier Ini
                      </span>
                      <button
                        type="button"
                        onClick={handleResetSupplierFocus}
                        style={{ fontSize: '0.74rem', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Ganti Supplier
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Supplier *</label>
                      <button
                        type="button"
                        style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        onClick={() => {
                          setIsManualSupplier(!isManualSupplier);
                          handleSelectSupplierFocus('');
                        }}
                      >
                        {isManualSupplier ? '← Pilih dari Daftar Supplier' : '+ Input Supplier Manual'}
                      </button>
                    </div>
                    {isManualSupplier ? (
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ketik nama supplier..."
                        value={invSupplier}
                        onChange={e => handleSelectSupplierFocus(e.target.value)}
                        required
                      />
                    ) : (
                      <select
                        className="form-control"
                        value={invSupplier}
                        onChange={e => handleSelectSupplierFocus(e.target.value)}
                        required
                      >
                        <option value="">-- Pilih Supplier Master --</option>
                        {suppliersList.map(s => {
                          const matCount = (stock || []).filter(
                            m => (m.supplier || '').trim().toLowerCase() === (s.name || '').trim().toLowerCase()
                          ).length;
                          const isDoneInSession = completedSuppliersSession.includes(s.name);
                          return (
                            <option key={s.id || s.name} value={s.name}>
                              {isDoneInSession ? '✓ ' : ''}{s.name} ({matCount} bahan)
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Tujuan Gudang Masuk</label>
                    <select className="form-control" value={invLocation} onChange={e => setInvLocation(e.target.value)}>
                      <option value="CENTRAL">CENTRAL (Gudang Utama)</option>
                      <option value="RESTO">RESTO (Dapur / Outlet)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 2: Line Items Table (Strictly Bounded by Selected Supplier) */}
              <div style={{ border: '1px solid var(--border)', padding: '16px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-secondary)', opacity: normalizedActiveSupplier ? 1 : 0.65 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>
                      Langkah 2 — Rincian Bahan {normalizedActiveSupplier ? `(${invSupplier})` : ''}
                    </h4>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {normalizedActiveSupplier
                        ? `Menampilkan khusus bahan milik supplier "${invSupplier}" (${invItems.filter(i => i.material_id || i.item_name).length}/${supplierMaterials.length} bahan dipilih).`
                        : 'Pilih supplier pada Langkah 1 terlebih dahulu untuk membuka daftar bahan.'}
                    </div>
                  </div>

                  {normalizedActiveSupplier && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {supplierMaterials.length > 1 && invItems.length < supplierMaterials.length && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.76rem', background: 'var(--bg-primary)' }}
                          onClick={handleFillAllSupplierMaterials}
                          title="Masukkan seluruh bahan terdaftar dari supplier ini sekaligus"
                        >
                          Muat Semua ({supplierMaterials.length})
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          background: showAssignPanel ? 'var(--accent-glow)' : 'var(--bg-primary)',
                          color: 'var(--accent)',
                          borderColor: 'var(--accent)',
                          fontWeight: 600
                        }}
                        onClick={() => setShowAssignPanel(!showAssignPanel)}
                        title="Daftarkan bahan baku lain dari Master ke supplier ini"
                      >
                        <Plus size={13} style={{ marginRight: '4px' }} />
                        Masukkan Bahan Baru ke Supplier Ini
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.8rem',
                          background: 'var(--bg-primary)',
                          opacity: canAddMoreSupplierItems ? 1 : 0.5,
                          cursor: canAddMoreSupplierItems ? 'pointer' : 'not-allowed'
                        }}
                        disabled={!canAddMoreSupplierItems}
                        onClick={addLineItem}
                        title={
                          supplierMaterials.length === 0
                            ? 'Supplier ini belum memiliki bahan terdaftar'
                            : canAddMoreSupplierItems
                            ? `Tambah baris bahan dari supplier ${invSupplier}`
                            : `Seluruh ${supplierMaterials.length} bahan dari supplier ${invSupplier} sudah ditampilkan`
                        }
                      >
                        <Plus size={14} style={{ marginRight: '4px' }} /> Tambah Bahan ({invItems.length}/{supplierMaterials.length})
                      </button>
                    </div>
                  )}
                </div>

                {/* Trigger Panel: Assign / Link Material from Master Stock into Current Supplier */}
                {normalizedActiveSupplier && showAssignPanel && (
                  <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)', border: '1px solid var(--accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Daftarkan Material ke Supplier &ldquo;{invSupplier}&rdquo;
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          Pilih bahan dari master di bawah untuk dikaitkan permanen ke supplier <strong>{invSupplier}</strong> sekaligus dimasukkan ke PO ini.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAssignPanel(false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      >
                        <X size={15} />
                      </button>
                    </div>

                    <input
                      type="text"
                      className="form-control"
                      style={{ padding: '7px 10px', fontSize: '0.82rem', marginBottom: '8px' }}
                      placeholder={`Cari nama bahan di luar supplier ${invSupplier}...`}
                      value={assignSearch}
                      onChange={e => setAssignSearch(e.target.value)}
                    />

                    <div style={{ maxHeight: '165px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {otherMaterials
                        .filter(m => (m.name || '').toLowerCase().includes((assignSearch || '').toLowerCase()))
                        .slice(0, 12)
                        .map(mat => (
                          <div
                            key={mat.id}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-secondary)', fontSize: '0.8rem' }}
                          >
                            <div>
                              <span style={{ fontWeight: 600 }}>{mat.name}</span>{' '}
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                ({mat.unit} · {formatIDR(mat.new_price || mat.price || 0)} · Supplier saat ini: {mat.supplier && mat.supplier !== '-' ? mat.supplier : 'Belum ada'})
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.74rem', fontWeight: 600 }}
                              disabled={assigningMaterialId === mat.id}
                              onClick={() => handleAssignMaterialToSupplier(mat)}
                            >
                              {assigningMaterialId === mat.id ? 'Menyimpan...' : `+ Masukkan ke ${invSupplier}`}
                            </button>
                          </div>
                        ))}
                      {otherMaterials.filter(m => (m.name || '').toLowerCase().includes((assignSearch || '').toLowerCase())).length === 0 && (
                        <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Tidak ada bahan lain yang cocok dengan pencarian.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!normalizedActiveSupplier ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Silakan pilih <strong>Supplier</strong> terlebih dahulu pada Langkah 1 di atas untuk menampilkan bahan baku khusus supplier tersebut.
                  </div>
                ) : (
                  <>
                    {supplierMaterials.length === 0 && (
                      <div style={{ padding: '14px 16px', marginBottom: '12px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.8rem', color: '#b45309', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span>
                          Belum ada bahan yang terdaftar pada supplier <strong>{invSupplier}</strong>. Klik tombol <strong>&ldquo;+ Masukkan Bahan Baru ke Supplier Ini&rdquo;</strong> untuk mendaftarkan bahan ke supplier ini.
                        </span>
                        {!showAssignPanel && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}
                            onClick={() => setShowAssignPanel(true)}
                          >
                            + Daftarkan Bahan Sekarang
                          </button>
                        )}
                      </div>
                    )}

                    <table className="custom-table" style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '38%' }}>Bahan Baku ({invSupplier})</th>
                          <th style={{ width: '14%', textAlign: 'right' }}>Qty</th>
                          <th style={{ width: '10%' }}>Unit</th>
                          <th style={{ width: '18%', textAlign: 'right' }}>Harga Satuan</th>
                          <th style={{ width: '16%', textAlign: 'right' }}>Subtotal</th>
                          <th style={{ width: '4%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {invItems.map((item, idx) => {
                          const queryText = (item.item_name || '').toLowerCase().trim();
                          // Materials belonging to this supplier (excluding ones already chosen in other rows)
                          const availableSupplierMatches = supplierMaterials.filter(s => {
                            const isSelectedElsewhere =
                              selectedMaterialIds.has(String(s.id)) && String(item.material_id) !== String(s.id);
                            if (isSelectedElsewhere) return false;
                            return (s.name || '').toLowerCase().includes(queryText);
                          });

                          // Trigger candidates from other materials when user types a name not in this supplier
                          const triggerOtherMatches = queryText.length > 0
                            ? otherMaterials
                                .filter(s => (s.name || '').toLowerCase().includes(queryText))
                                .slice(0, 4)
                            : [];

                          return (
                            <tr key={item._uid ?? idx}>
                              <td style={{ position: 'relative' }}>
                                <input
                                  type="text"
                                  className="form-control"
                                  style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                                  placeholder={`Pilih bahan dari ${invSupplier}...`}
                                  value={item.item_name}
                                  onFocus={() => setItemDropdown(idx)}
                                  onChange={e => {
                                    const updated = [...invItems];
                                    updated[idx] = { ...updated[idx], material_id: null, item_name: e.target.value };
                                    setInvItems(updated);
                                    setItemDropdown(idx);
                                  }}
                                  onBlur={() => setTimeout(() => setItemDropdown(null), 220)}
                                />
                                {itemDropdown === idx && (
                                  <ul className="search-results-list" style={{ zIndex: 2000, maxHeight: '240px', overflowY: 'auto' }}>
                                    {availableSupplierMatches.slice(0, 10).map(s => (
                                      <li
                                        key={s.id || s.name}
                                        className="search-results-item"
                                        onMouseDown={() => selectStockItem(idx, s)}
                                        style={{ padding: '8px 12px', cursor: 'pointer' }}
                                      >
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                          Unit: {s.unit} · Harga: {formatIDR(s.new_price || s.price || 0)}
                                        </div>
                                      </li>
                                    ))}
                                    {availableSupplierMatches.length === 0 && (
                                      <li style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                        Tidak ada bahan tambahan milik supplier <strong>{invSupplier}</strong> yang cocok.
                                      </li>
                                    )}

                                    {/* Inline Trigger to assign a searched material to this supplier */}
                                    {triggerOtherMatches.length > 0 && (
                                      <>
                                        <li style={{ padding: '6px 12px', background: 'var(--bg-secondary)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', borderTop: '1px solid var(--border)' }}>
                                          Bahan di Luar Supplier Ini (Klik untuk Daftarkan ke {invSupplier}):
                                        </li>
                                        {triggerOtherMatches.map(otherMat => (
                                          <li
                                            key={`assign-${otherMat.id}`}
                                            className="search-results-item"
                                            onMouseDown={() => handleAssignMaterialToSupplier(otherMat, idx)}
                                            style={{ padding: '8px 12px', cursor: 'pointer', background: 'rgba(5, 150, 105, 0.04)' }}
                                          >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                              <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{otherMat.name}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                  Supplier saat ini: {otherMat.supplier && otherMat.supplier !== '-' ? otherMat.supplier : 'Belum ada'} · {formatIDR(otherMat.new_price || otherMat.price || 0)}
                                                </div>
                                              </div>
                                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                                                + Masukkan ke {invSupplier}
                                              </span>
                                            </div>
                                          </li>
                                        ))}
                                      </>
                                    )}
                                  </ul>
                                )}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.01"
                                  className="form-control"
                                  style={{ padding: '8px 10px', fontSize: '0.85rem', textAlign: 'right' }}
                                  value={item.qty}
                                  onChange={e => updateLineItem(idx, 'qty', parseFloat(e.target.value) || 0)}
                                />
                              </td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.unit || 'pck'}</td>
                              <td>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  className="form-control"
                                  style={{ padding: '8px 10px', fontSize: '0.85rem', textAlign: 'right' }}
                                  value={item.unit_price}
                                  onChange={e => updateLineItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                                />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>
                                {formatIDR(item.qty * item.unit_price)}
                              </td>
                              <td>
                                {invItems.length > 1 && (
                                  <button
                                    type="button"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                    onClick={() => removeLineItem(idx)}
                                    title="Hapus bahan"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div style={{ textAlign: 'right', marginTop: '16px', fontSize: '1.15rem', fontWeight: 800 }}>
                      Total Estimasi: <span style={{ color: 'var(--accent)', marginLeft: '12px' }}>{formatIDR(invTotal)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Catatan PO (Opsional)</label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Catatan pengiriman atau instruksi khusus untuk supplier..."
                  value={invNotes}
                  onChange={e => setInvNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px' }}
                  onClick={() => {
                    setShowCreateModal(false);
                    setCompletedSuppliersSession([]);
                  }}
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={!normalizedActiveSupplier}
                  className="btn btn-primary"
                  style={{ flex: 2, padding: '12px', fontWeight: 700, opacity: normalizedActiveSupplier ? 1 : 0.5 }}
                >
                  Review & Buat PO ({invSupplier || 'Pilih Supplier'})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && invoiceToSubmit && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowConfirmModal(false)}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>Review Final Purchase Order</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
              Tinjau rincian pemesanan khusus ke supplier <strong>{invoiceToSubmit.supplier}</strong> sebelum menyimpan PO DRAFT.
            </p>

            <div className="table-container" style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              <table className="custom-table" style={{ fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th>Nama Bahan</th>
                    <th style={{ width: '110px' }}>Kuantitas</th>
                    <th style={{ width: '160px' }}>Harga Satuan</th>
                    <th style={{ textAlign: 'right' }}>Total (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceToSubmit.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          style={{ padding: '4px 8px' }}
                          value={item.qty}
                          onChange={(e) => {
                            const newQty = parseFloat(e.target.value) || 0;
                            setInvoiceToSubmit(prev => {
                              const newItems = [...prev.items];
                              newItems[idx].qty = newQty;
                              const newTotal = newItems.reduce((a, i) => a + (i.qty * i.unit_price), 0);
                              return { ...prev, items: newItems, total: newTotal };
                            });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          className="form-control"
                          style={{ padding: '4px 8px' }}
                          value={item.unit_price}
                          onChange={(e) => {
                            const newPrice = parseFloat(e.target.value) || 0;
                            setInvoiceToSubmit(prev => {
                              const newItems = [...prev.items];
                              newItems[idx].unit_price = newPrice;
                              const newTotal = newItems.reduce((a, i) => a + (i.qty * i.unit_price), 0);
                              return { ...prev, items: newItems, total: newTotal };
                            });
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {formatIDR(item.qty * item.unit_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                Total Nilai PO: <span style={{ color: 'var(--accent)' }}>{formatIDR(invoiceToSubmit.total)}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>
                  Kembali Edit
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}
                  onClick={() => handleFinalSubmit(true)}
                  title="Simpan PO supplier ini dan langsung lanjut memilih supplier berikutnya"
                >
                  Simpan & Lanjut Supplier Berikutnya →
                </button>
                <button type="button" className="btn btn-primary" onClick={() => handleFinalSubmit(false)}>
                  Konfirmasi & Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Goods Receipt Modal (Verifikasi Penerimaan Barang) */}
      {showGoodsReceiptModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => !isReceiving && setShowGoodsReceiptModal(null)}
        >
          <div
            className="glass-card modal-card"
            style={{ width: '560px', maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Terima Barang (Goods Receipt)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  PO: <strong style={{ color: 'var(--text-primary)' }}>{showGoodsReceiptModal.invoice_no}</strong> · Supplier: {showGoodsReceiptModal.supplier}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Lokasi Gudang Masuk: <strong style={{ color: 'var(--accent)' }}>{showGoodsReceiptModal.location || 'CENTRAL'}</strong>
                </p>
              </div>
              <button
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => !isReceiving && setShowGoodsReceiptModal(null)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Quick Receive Banner */}
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '14px 16px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--success)' }}>Penerimaan Cepat (Quick Receive)</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Terima langsung & tambah stok gudang tanpa foto/TTD.</div>
                </div>
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                  onClick={() => handleConfirmReceipt(true)}
                  disabled={isReceiving}
                >
                  {isReceiving ? 'Memproses...' : '✓ Terima Cepat'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Atau Lengkapi Bukti Audit Fisik
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>

            {/* Audit Section: Photo, GPS, Signature */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 1. Photo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  1. Foto Bukti Surat Jalan / Fisik Barang
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
                    onChange={handlePhotoChange}
                  />
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: receiptPhotoPreview ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-secondary)',
                    minHeight: '100px'
                  }}>
                    {receiptPhotoPreview ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={receiptPhotoPreview} alt="Preview" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--success)' }}>Foto Berhasil Dipilih</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Klik untuk ganti foto</div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Camera size={24} style={{ color: 'var(--accent)', marginBottom: '6px' }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Klik untuk Buka Kamera / Pilih File</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. GPS Location */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  2. Rekam Titik GPS (Lokasi Gudang)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={handleGetLocation}
                    disabled={isGettingGps}
                  >
                    <MapPin size={14} style={{ color: 'var(--accent)' }} />
                    {isGettingGps ? 'Mencari...' : 'Ambil Koordinat'}
                  </button>
                  <div style={{ flex: 1, fontSize: '0.82rem', color: receiptGps ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: receiptGps ? 'monospace' : 'inherit' }}>
                    {receiptGps || 'Belum direkam'}
                  </div>
                </div>
              </div>

              {/* 3. Receiver Signature */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>
                    3. Tanda Tangan Digital Penerima
                  </label>
                  <button
                    type="button"
                    style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }}
                    onClick={clearSignature}
                  >
                    Hapus TTD
                  </button>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#ffffff' }}>
                  <canvas
                    ref={sigCanvasRef}
                    width={500}
                    height={130}
                    style={{ width: '100%', height: '130px', touchAction: 'none', cursor: 'crosshair', display: 'block' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => setShowGoodsReceiptModal(null)}
                disabled={isReceiving}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 2, padding: '10px', fontWeight: 700 }}
                onClick={() => handleConfirmReceipt(false)}
                disabled={isReceiving}
              >
                {isReceiving ? 'Menyimpan...' : 'Simpan Penerimaan & Tambah Stok'}
              </button>
            </div>
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
          await reloadInvoices();
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
    </div>
  );
}
