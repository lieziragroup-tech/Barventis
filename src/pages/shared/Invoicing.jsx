/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus, X, FileText, CheckCircle, XCircle, Clock, Package, Search,
  Download, Eye, UploadCloud, Send, Camera, MapPin, ExternalLink
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { getUserDivisionScope, getMaterialDivision } from '../../services/locationService';
import ComparePriceModal from '../../components/modals/ComparePriceModal';
import CreatePoSlideOver from '../../components/modals/CreatePoSlideOver';
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
  const { stock, showToast: toast, handleCreateInvoice: onCreateInvoice, refreshData, activeBranchId } = useData();
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
  const [invLocation, setInvLocation] = useState(() => (String(activeUser?.role || '').toLowerCase().includes('central') ? 'CENTRAL' : 'RESTO'));
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

  const [searchParams, setSearchParams] = useSearchParams();
  const rawRole = String(activeUser?.role || '').trim().toLowerCase();
  const isOwner = ['admin / owner', 'admin  owner', 'owner', 'super admin', 'superadmin'].includes(rawRole);
  const isPurchasing = rawRole === 'purchasing';
  const isCentral = rawRole === 'central';
  const isHeadBar = rawRole === 'head bar' || String(activeUser?.name || '').toLowerCase().includes('irpan') || rawRole === 'supervisor';
  const isRekanBar = rawRole === 'rekan bar' || rawRole === 'bar' || rawRole === 'barista';
  const userDivisionScope = getUserDivisionScope(activeUser?.role);

  // Goods Receipt Modal States (Dual Photo: Physical Goods + Delivery Note / Surat Jalan / Resi)
  const [showGoodsReceiptModal, setShowGoodsReceiptModal] = useState(null);
  const [receiptPhoto, setReceiptPhoto] = useState(null);
  const [receiptPhotoPreview, setReceiptPhotoPreview] = useState(null);
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useState(null);
  const [deliveryNotePhotoPreview, setDeliveryNotePhotoPreview] = useState(null);
  const [deliveryNoteNo, setDeliveryNoteNo] = useState('');
  const [receiptGps, setReceiptGps] = useState('');
  const [isGettingGps, setIsGettingGps] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const sigCanvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [poActionDialog, setPoActionDialog] = useState(null);

  // Purchasing Review & Supplier Comparison / Replacement Modal State
  const [reviewPoModal, setReviewPoModal] = useState(null);
  const [compareItemForPo, setCompareItemForPo] = useState(null);
  const [savingReviewPo, setSavingReviewPo] = useState(false);
  const [showQuickAddSupplier, setShowQuickAddSupplier] = useState(false);
  const [quickSupForm, setQuickSupForm] = useState({ name: '', phone: '', contact_person: '' });
  const [savingQuickSup, setSavingQuickSup] = useState(false);
  const [poReminders, setPoReminders] = useState(() => {
    try {
      const raw = localStorage.getItem('bv_po_reminders_v4');
      return raw ? JSON.parse(raw).filter((r) => !r.done) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const onRemUpdated = () => {
      try {
        const raw = localStorage.getItem('bv_po_reminders_v4');
        setPoReminders(raw ? JSON.parse(raw).filter((r) => !r.done) : []);
      } catch {
        setPoReminders([]);
      }
    };
    window.addEventListener('barventis:po_reminders_updated', onRemUpdated);
    return () => window.removeEventListener('barventis:po_reminders_updated', onRemUpdated);
  }, []);

  const handleMarkReminderDone = (remId) => {
    try {
      const raw = localStorage.getItem('bv_po_reminders_v4');
      const all = raw ? JSON.parse(raw) : [];
      const next = all.map((r) => (r.id === remId ? { ...r, done: true } : r));
      localStorage.setItem('bv_po_reminders_v4', JSON.stringify(next));
      setPoReminders(next.filter((r) => !r.done));
    } catch {
      setPoReminders((prev) => prev.filter((r) => r.id !== remId));
    }
  };

  const handleQuickCreateSupplierInReview = async () => {
    const cleanName = String(quickSupForm.name || '').trim();
    if (!cleanName) {
      if (toast) toast('Isi nama supplier dulu.', 'warning');
      return;
    }
    setSavingQuickSup(true);
    try {
      const saved = await api.saveSupplier({
        name: cleanName,
        phone: String(quickSupForm.phone || '').trim(),
        contact_person: String(quickSupForm.contact_person || '').trim(),
        address: ''
      });
      await loadSuppliers();
      const finalName = saved?.name || cleanName;
      setReviewPoModal((prev) => (prev ? { ...prev, supplier: finalName } : prev));
      setQuickSupForm({ name: '', phone: '', contact_person: '' });
      setShowQuickAddSupplier(false);
      if (toast) toast(`Supplier "${finalName}" berhasil ditambahkan & langsung dipilih.`, 'success');
    } catch (err) {
      if (toast) toast(err.message || 'Gagal menambah supplier baru.', 'error');
    } finally {
      setSavingQuickSup(false);
    }
  };

  // Load suppliers list
  const loadSuppliers = useCallback(async () => {
    try {
      const data = await api.getSuppliers();
      setSuppliersList(data || []);
    } catch (e) {
      console.error('Failed to load suppliers:', e);
    }
  }, [activeBranchId]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // Auto-open Create PO Modal when navigated from "Lapor Stok Habis / Ajukan PO" (?prefillMaterial=...) or "+ Buat PO Baru" (?create=1)
  useEffect(() => {
    const createFlag = searchParams.get('create');
    if (createFlag === '1' || createFlag === 'true') {
      setShowCreateModal(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('create');
      setSearchParams(nextParams, { replace: true });
      return;
    }

    const prefillName = searchParams.get('prefillMaterial');
    if (prefillName && stock && stock.length > 0) {
      const mat = stock.find(s => (s.name || '').toLowerCase().trim() === prefillName.toLowerCase().trim())
        || stock.find(s => (s.name || '').toLowerCase().includes(prefillName.toLowerCase().trim()));
      if (mat) {
        const supName = mat.supplier || (suppliersList[0]?.name || 'Supplier Umum');
        const activePrice = Number(mat.new_price) > 0 ? Number(mat.new_price) : (Number(mat.price) || 0);
        const suggestedQty = Math.max(1, Number(mat.min_stock || 10) - Number(mat.qty_resto || 0));
        setInvSupplier(supName);
        setInvLocation('RESTO');
        setInvNotes(`Laporan Stok Habis / Menipis dari Divisi ${userDivisionScope !== 'ALL' ? userDivisionScope : 'Cabang'}: ${mat.name}`);
        setInvItems([{
          material_id: mat.id,
          item_name: mat.name,
          qty: suggestedQty,
          unit_price: activePrice,
          unit: mat.unit || 'pck',
          _uid: rowUid()
        }]);
        setShowCreateModal(true);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('prefillMaterial');
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [searchParams, stock, suppliersList, userDivisionScope, setSearchParams]);

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
  }, [invoicesPage, debouncedSearch, statusFilter, activeBranchId]);

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

  const applySupplierSwitch = (nextSupplierName) => {
    setInvSupplier(nextSupplierName);
    setInvItems([blankLineItem()]);
    setItemDropdown(null);
    setShowAssignPanel(false);
    setAssignSearch('');
    setPoActionDialog(null);
  };

  const handleSelectSupplierFocus = (newSupplierName) => {
    const trimmedNext = (newSupplierName || '').trim();
    const trimmedCurrent = (invSupplier || '').trim();
    if (trimmedCurrent && trimmedNext.toLowerCase() !== trimmedCurrent.toLowerCase() && hasFilledLineItems) {
      setPoActionDialog({
        type: 'SWITCH_SUPPLIER',
        title: 'Ganti Supplier?',
        message: `Ganti ke "${trimmedNext || 'Supplier Lain'}"? Daftar bahan pada PO saat ini akan di-reset.`,
        nextSupplierName: newSupplierName
      });
      return;
    }
    applySupplierSwitch(newSupplierName);
  };

  const handleResetSupplierFocus = () => {
    if (hasFilledLineItems) {
      setPoActionDialog({
        type: 'SWITCH_SUPPLIER',
        title: 'Ganti Supplier?',
        message: `Ganti supplier "${invSupplier}"? Baris bahan yang sudah dipilih akan dikosongkan.`,
        nextSupplierName: ''
      });
      return;
    }
    applySupplierSwitch('');
  };

  // Add & Manage line items (Bounded by supplierMaterials count)
  const addLineItem = () => {
    if (!normalizedActiveSupplier) {
      if (toast) toast('Pilih supplier terlebih dahulu.', 'warning');
      return;
    }
    if (supplierMaterials.length === 0) {
      setShowAssignPanel(true);
      if (toast) toast(`Supplier "${invSupplier}" belum memiliki bahan terdaftar.`, 'info');
      return;
    }
    if (invItems.length >= supplierMaterials.length) {
      if (toast) toast(`Maksimal ${supplierMaterials.length} bahan untuk "${invSupplier}".`, 'info');
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
        toast(`"${material.name}" ditambahkan ke "${targetSupplier}".`, 'success');
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

    if (invalidSupplierItem && invSupplier.trim().toLowerCase() !== 'pasar umum' && !isManualSupplier) {
      if (toast) {
        toast(
          `"${invalidSupplierItem.item_name}" belum terdaftar di "${invSupplier.trim()}".`,
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
      const enrichedInvoice = {
        ...invoiceToSubmit,
        division: userDivisionScope !== 'ALL' ? userDivisionScope : 'BAR',
        original_supplier: invoiceToSubmit.original_supplier || invoiceToSubmit.supplier,
        supplier_change_note: invoiceToSubmit.supplier_change_note || '',
        requested_by_role: activeUser?.role || 'Staff',
        requested_by_name: activeUser?.name || 'Staf Cabang',
        workflow_status: isOwner ? 'APPROVED' : (isCentral ? 'PENDING_HEADBAR' : (isPurchasing ? 'PENDING_APPROVAL' : 'REQUESTED'))
      };
      await onCreateInvoice(enrichedInvoice);
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
          toast(`PO "${savedSupplierName}" tersimpan. Pilih supplier berikutnya.`, 'success');
        }
      } else {
        setShowCreateModal(false);
        setCompletedSuppliersSession([]);
        if (toast) toast('PO baru berhasil dibuat.', 'success');
      }
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal membuat invoice', 'error');
    }
  };

  // Status Actions: Send PO
  const handleKirimPO = (inv) => {
    setPoActionDialog({
      type: 'SEND_PO',
      title: 'Kirim PO?',
      message: `Tandai PO ${inv.invoice_no} (${inv.supplier}) sebagai SENT (Terkirim)?`,
      invoice: inv
    });
  };

  const executeKirimPO = async (inv) => {
    try {
      await api.updateInvoiceStatus(inv.id, 'SENT');
      setPoActionDialog(null);
      if (toast) toast(`PO ${inv.invoice_no} ditandai terkirim.`, 'success');
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal mengirim PO', 'error');
    }
  };

  // Status Actions: Cancel PO
  const handleCancelPO = (inv) => {
    setPoActionDialog({
      type: 'CANCEL_PO',
      title: 'Batalkan PO?',
      message: `Batalkan PO ${inv.invoice_no} (${inv.supplier})?`,
      invoice: inv
    });
  };

  const executeCancelPO = async (inv) => {
    try {
      await api.updateInvoiceStatus(inv.id, 'CANCELLED');
      setPoActionDialog(null);
      if (toast) toast(`PO ${inv.invoice_no} dibatalkan.`, 'info');
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal membatalkan PO', 'error');
    }
  };

  // Purchasing Review & Supplier Comparison / Replacement Handlers
  const openReviewPoModal = (inv) => {
    setReviewPoModal({
      ...inv,
      original_supplier: inv.original_supplier || inv.supplier,
      supplier: inv.supplier,
      supplier_change_note: inv.supplier_change_note || '',
      notes: inv.notes || '',
      items: (inv.items || []).map(it => ({ ...it }))
    });
  };

  const handleSavePurchasingReview = async (e, submitForOwnerAcc = true) => {
    if (e) e.preventDefault();
    if (!reviewPoModal) return;
    const isSupplierChanged = (reviewPoModal.supplier || '').trim().toLowerCase() !== (reviewPoModal.original_supplier || '').trim().toLowerCase();
    if (isSupplierChanged && !String(reviewPoModal.supplier_change_note || '').trim()) {
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Karena Supplier diganti dari permintaan awal cabang, mohon isi Catatan Pergantian Supplier agar pembuat PO dan Owner mengetahui alasan efisiensinya.', type: 'warning' } }));
      return;
    }
    setSavingReviewPo(true);
    try {
      const nextStatus = submitForOwnerAcc ? 'APPROVED' : (reviewPoModal.workflow_status || 'REQUESTED');
      await api.updatePoWorkflowAndSupplier(reviewPoModal.id, {
        workflow_status: nextStatus,
        supplier: reviewPoModal.supplier,
        original_supplier: reviewPoModal.original_supplier,
        supplier_change_note: reviewPoModal.supplier_change_note,
        notes: reviewPoModal.notes,
        items: reviewPoModal.items
      });
      if (toast) {
        toast(
          submitForOwnerAcc
            ? `PO ${reviewPoModal.invoice_no} siap dipesan ke supplier ${reviewPoModal.supplier}.`
            : `Perubahan PO ${reviewPoModal.invoice_no} berhasil disimpan.`,
          'success'
        );
      }
      setReviewPoModal(null);
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal menyimpan review PO', 'error');
      else window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: err.message, type: 'warning' } }));
    } finally {
      setSavingReviewPo(false);
    }
  };

  const handleOwnerDecision = async (inv, decision) => {
    const isApprove = decision === 'APPROVED';
    let rejectionReason = '';
    if (!isApprove) {
      rejectionReason = 'Revisi sesuai catatan review' || '';
      if (!rejectionReason.trim()) return;
    }
    try {
      await api.updatePoWorkflowAndSupplier(inv.id, {
        workflow_status: isApprove ? 'APPROVED' : 'REJECTED',
        approved_by_name: activeUser?.name || 'Owner',
        rejection_reason: isApprove ? '' : rejectionReason.trim()
      });
      if (toast) {
        toast(
          isApprove
            ? `PO ${inv.invoice_no} telah di-ACC Owner. Purchasing kini dapat menghubungi supplier ${inv.supplier}.`
            : `PO ${inv.invoice_no} dikembalikan ke Purchasing untuk revisi.`,
          isApprove ? 'success' : 'info'
        );
      }
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal memproses keputusan Owner', 'error');
    }
  };

  const handleContactSupplierWA = (inv) => {
    const supObj = suppliersList.find(s => (s.name || '').toLowerCase().trim() === (inv.supplier || '').toLowerCase().trim());
    const rawPhone = String(supObj?.phone || supObj?.contact || '').replace(/[^0-9]/g, '');
    const waPhone = rawPhone.startsWith('0') ? ('62' + rawPhone.slice(1)) : rawPhone;
    const itemsLines = (inv.items || [])
      .map((it, i) => `${i + 1}. ${it.item_name} — ${it.qty} ${it.unit || 'pck'} (@ Rp ${Number(it.unit_price || 0).toLocaleString('id-ID')})`)
      .join('\n');
    const msg = `Halo *${inv.supplier}*,\nKami dari bagian Purchasing *Umatis Resto & Venue* ingin memesan Purchase Order yang telah disetujui:\n\n*No. PO:* ${inv.invoice_no}\n*Tanggal:* ${inv.date}\n*Tujuan Kirim:* Gudang ${inv.location || 'RESTO'}\n\n*Rincian Pesanan:*\n${itemsLines}\n\n*Total Nilai PO:* Rp ${Number(inv.total || 0).toLocaleString('id-ID')}\n\nMohon konfirmasi ketersediaan dan jadwal pengiriman beserta Surat Jalan. Terima kasih.`;
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Open Goods Receipt Modal
  const openReceiveModal = (inv) => {
    setShowGoodsReceiptModal(inv);
    setReceiptPhoto(null);
    setReceiptPhotoPreview(null);
    setDeliveryNotePhoto(null);
    setDeliveryNotePhotoPreview(null);
    setDeliveryNoteNo(inv.delivery_note_no || '');
    setReceiptGps('');
  };

  // Handle Photos & GPS
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptPhoto(file);
      const url = URL.createObjectURL(file);
      setReceiptPhotoPreview(url);
    }
  };

  const handleDeliveryNotePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setDeliveryNotePhoto(file);
      const url = URL.createObjectURL(file);
      setDeliveryNotePhotoPreview(url);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: "Geolocation tidak didukung browser ini", type: 'warning' } }));
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReceiptGps(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
        setIsGettingGps(false);
      },
      (err) => {
        window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: "Gagal mengambil GPS: " + err.message, type: 'warning' } }));
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

  // Confirm Receipt with Direct Photo of Received Goods + Delivery Note (Surat Jalan / Resi)
  const handleConfirmReceipt = async () => {
    if (!showGoodsReceiptModal) return;
    if (!receiptPhoto && !receiptPhotoPreview) {
      window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Wajib menyertakan Foto Fisik Barang yang Diterima sebagai bukti Goods Receipt.', type: 'warning' } }));
      return;
    }
    setIsReceiving(true);
    try {
      let photoUrl = null;
      let deliveryNotePhotoUrl = null;
      let signatureUrl = null;

      if (receiptPhoto) {
        try {
          const photoName = `receipt_goods_${showGoodsReceiptModal.id}_${Date.now()}.jpg`;
          const { error: photoErr } = await supabase.storage.from('signatures').upload(photoName, receiptPhoto);
          if (!photoErr) {
            photoUrl = supabase.storage.from('signatures').getPublicUrl(photoName).data.publicUrl;
          } else {
            photoUrl = receiptPhotoPreview;
          }
        } catch {
          photoUrl = receiptPhotoPreview;
        }
      }

      if (deliveryNotePhoto) {
        try {
          const sjName = `surat_jalan_${showGoodsReceiptModal.id}_${Date.now()}.jpg`;
          const { error: sjErr } = await supabase.storage.from('signatures').upload(sjName, deliveryNotePhoto);
          if (!sjErr) {
            deliveryNotePhotoUrl = supabase.storage.from('signatures').getPublicUrl(sjName).data.publicUrl;
          } else {
            deliveryNotePhotoUrl = deliveryNotePhotoPreview;
          }
        } catch {
          deliveryNotePhotoUrl = deliveryNotePhotoPreview;
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

      await api.receiveInvoice(showGoodsReceiptModal.id, {
        photoUrl,
        deliveryNotePhotoUrl,
        deliveryNoteNo: deliveryNoteNo.trim(),
        signatureUrl,
        gps: receiptGps || null,
        items: showGoodsReceiptModal.items || [],
        priceAdjustedOnReceipt: true
      });

      if (toast) toast(`PO ${showGoodsReceiptModal.invoice_no} diterima ke gudang ${showGoodsReceiptModal.location || 'CENTRAL'}.`, 'success');
      setShowGoodsReceiptModal(null);
      setReceiptPhoto(null);
      setReceiptPhotoPreview(null);
      setReceiptGps('');
      await reloadInvoices();
      await refreshData();
    } catch (err) {
      if (toast) toast(err.message || 'Gagal menerima barang', 'error');
      else window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Gagal menerima barang: ' + err.message, type: 'warning' } }));
    } finally {
      setIsReceiving(false);
    }
  };

  // Status badge supporting 4-stage PO workflow
  const statusBadge = (status, workflowStatus) => {
    const wf = workflowStatus || status;
    const map = {
      PENDING_HEADBAR: { label: 'MENUNGGU ACC HEAD BAR (IRPAN)', bg: 'rgba(139, 92, 246, 0.14)', color: '#7c3aed', border: 'rgba(139, 92, 246, 0.35)' },
      REQUESTED: { label: 'PERMINTAAN CABANG', bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)' },
      DRAFT: { label: 'PERMINTAAN CABANG', bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)' },
      PENDING_APPROVAL: { label: 'SIAP DIPROSES PURCHASING', bg: 'rgba(245, 158, 11, 0.14)', color: '#d97706', border: 'rgba(245, 158, 11, 0.35)' },
      APPROVED: { label: 'SIAP PESAN KE SUPPLIER', bg: 'rgba(16, 185, 129, 0.14)', color: '#059669', border: 'rgba(16, 185, 129, 0.35)' },
      REJECTED: { label: 'REVISI OWNER', bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' },
      SENT: { label: 'DIPESAN KE SUPPLIER', bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', border: 'rgba(59, 130, 246, 0.3)' },
      RECEIVED: { label: 'GOODS RECEIPT SELESAI', bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
      GOODS_RECEIVED: { label: 'GOODS RECEIPT SELESAI', bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: 'rgba(16, 185, 129, 0.3)' },
      CANCELLED: { label: 'DIBATALKAN', bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', border: 'rgba(239, 68, 68, 0.3)' }
    };
    const s = map[wf] || map[status] || { label: wf, bg: 'rgba(100, 116, 139, 0.12)', color: '#475569', border: 'rgba(100, 116, 139, 0.3)' };
    
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
Tanggal PO: ${inv.date || '-'}
Tanggal Kirim: ${inv.due_date || inv.delivery_date || (String(inv.notes || '').match(/Jadwal Kirim:\s*([^|]+)/)?.[1]?.trim()) || '-'}
Supplier: ${inv.supplier}
Gudang Tujuan: ${inv.location || 'CENTRAL'}
Status: ${inv.status}
Catatan: ${inv.notes || '-'}`,
        tenantName: 'BARVENTIS - Purchasing & Invoicing',
        columns,
        rows,
        orientation: 'portrait'
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
        else window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Tidak ada data invoice yang sesuai untuk diekspor.', type: 'warning' } }));
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
      else window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Gagal mengekspor: ' + err.message, type: 'warning' } }));
    }
  };

  const handleExportPDF = async () => {
    try {
      const allInvoices = await fetchAllInvoicesForExport();
      if (allInvoices.length === 0) {
        if (toast) toast('Tidak ada data invoice yang sesuai untuk diekspor.', 'info');
        else window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Tidak ada data invoice yang sesuai untuk diekspor.', type: 'warning' } }));
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
      else window.dispatchEvent(new CustomEvent('barventis:toast', { detail: { message: 'Gagal mengekspor PDF: ' + err.message, type: 'warning' } }));
    }
  };

  return (
    <div className="fade-in">
      {/* Pengingat Jadwal PO Purchasing (dari Kalender Lead Time) */}
      {poReminders.length > 0 && (
        <div className="glass-card no-print" style={{ marginBottom: '16px', padding: '12px 16px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)' }}>
            Pengingat Jadwal PO ({poReminders.length} jadwal aktif)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {poReminders.slice(0, 5).map((rem) => {
              const todayISO = new Date().toISOString().split('T')[0];
              const isDueOrLate = rem.delivery_date && rem.delivery_date <= todayISO;
              return (
                <div key={rem.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '6px 10px', borderRadius: '8px', background: isDueOrLate ? 'rgba(239,68,68,0.08)' : 'var(--bg-primary)', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                  <div>
                    <strong>{rem.item_name}</strong> · {rem.supplier_name} · Kirim: <strong style={{ color: isDueOrLate ? 'var(--danger)' : 'var(--accent)' }}>{rem.delivery_date} ({rem.h_label})</strong>
                    {isDueOrLate && <span style={{ marginLeft: '6px', color: 'var(--danger)', fontWeight: 700 }}>• Waktunya PO!</span>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.72rem', fontWeight: 700 }}
                    onClick={() => handleMarkReminderDone(rem.id)}
                  >
                    Sudah PO
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="glass-card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Cari nomor PO atau supplier..."
              className="form-control"
              style={{ paddingLeft: '40px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="form-control"
            style={{ width: '210px', fontWeight: 600 }}
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setInvoicesPage(1); }}
          >
            <option value="ALL">Semua Status PO</option>
            <option value="DRAFT">Permintaan Cabang &amp; Menunggu ACC</option>
            <option value="SENT">Sudah Dipesan ke Supplier (SENT)</option>
            <option value="RECEIVED">Sudah Diterima (RECEIVED)</option>
            <option value="CANCELLED">Dibatalkan</option>
          </select>
          <ExportButton
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            currentRole={activeUser?.role}
          />
          <PrintButton
            currentRole={activeUser?.role}
            title="Cetak daftar Purchase Order"
          />
          {(isOwner || isPurchasing) && (
            <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={() => setShowBulkImport(true)}>
              Import PO
            </button>
          )}
          <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }} data-tour="po-create-btn" onClick={() => setShowCreateModal(true)}>
            {isPurchasing
              ? '+ Buat PO Baru'
              : isCentral
                ? '+ Buat PO Central'
                : userDivisionScope !== 'ALL'
                  ? `+ Ajukan Permintaan PO (${userDivisionScope})`
                  : '+ Buat Permintaan PO'}
          </button>
        </div>
      </div>

      {/* Summary KPIs (Clean Typography without Decorative Icon Boxes) */}
      <div className="kpi-grid no-print" style={{ marginBottom: '24px' }}>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total PO</span>
          </div>
          <div className="kpi-value">{kpis.total}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Perlu Diproses</span>
          </div>
          <div className="kpi-value" style={{ color: '#d97706' }}>{kpis.pending}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Sudah Diterima</span>
          </div>
          <div className="kpi-value" style={{ color: '#059669' }}>{kpis.received}</div>
        </div>
        <div className="glass-card kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Total Belanja</span>
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
                <th style={{ textAlign: 'center', minWidth: '220px' }} className="no-print">Aksi</th>
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
                paginatedInvoices
                  .filter(inv => userDivisionScope === 'ALL' || !inv.division || inv.division === userDivisionScope)
                  .map(inv => {
                    const wf = inv.workflow_status || inv.status;
                    const supplierChanged = inv.original_supplier && inv.original_supplier.toLowerCase().trim() !== (inv.supplier || '').toLowerCase().trim();
                    return (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>
                          <div>{inv.invoice_no}</div>
                          {inv.division && (
                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>
                              Divisi: {inv.division}
                            </span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <div>{inv.supplier}</div>
                          {supplierChanged && (
                            <div style={{ fontSize: '0.72rem', color: '#d97706', marginTop: '2px' }} title={inv.supplier_change_note || ''}>
                              Diganti dari <strong>{inv.original_supplier}</strong>
                              {inv.supplier_change_note ? ` — "${inv.supplier_change_note}"` : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{inv.date}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          <span style={{ padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: '6px', fontWeight: 600 }}>
                            {inv.location || 'CENTRAL'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{inv.items?.length || 0} bahan</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatIDR(inv.total)}</td>
                        <td style={{ textAlign: 'center' }}>{statusBadge(inv.status, wf)}</td>
                        <td style={{ textAlign: 'center' }} className="no-print">
                          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap', justifyContent: 'center' }}>
                            {/* Detail Modal */}
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', fontWeight: 600 }}
                              title="Lihat Rincian PO & Catatan Supplier"
                              onClick={() => setViewInvoice(inv)}
                            >
                              Detail
                            </button>

                            {/* 1 Tombol Aksi Utama Sesuai Tahap PO (Ketat 1 Baris, Tidak Tumpang Tindih) */}
                            {(isHeadBar || isOwner) && wf === 'PENDING_HEADBAR' && inv.status === 'DRAFT' && (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.73rem', fontWeight: 700, background: '#7c3aed', borderColor: '#7c3aed', whiteSpace: 'nowrap' }}
                                title="Verifikasi kuantitas order Central sebelum diteruskan ke Purchasing"
                                onClick={async () => {
                                  await api.updatePoWorkflowAndSupplier(inv.id, {
                                    workflow_status: 'REQUESTED',
                                    notes: `${inv.notes ? inv.notes + ' | ' : ''}Diverifikasi Head Bar (${activeUser?.name || 'Head Bar'})`
                                  });
                                  if (toast) toast(`Order Central ${inv.invoice_no} sudah di-ACC Head Bar dan diteruskan ke Purchasing.`, 'success');
                                  await reloadInvoices();
                                }}
                              >
                                ACC Head Bar
                              </button>
                            )}

                            {(isPurchasing || isOwner) && wf !== 'PENDING_HEADBAR' && inv.status === 'DRAFT' && (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.73rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                                title="Edit supplier/harga, bandingkan harga, lalu simpan atau pesan ke supplier"
                                onClick={() => openReviewPoModal(inv)}
                              >
                                Proses PO
                              </button>
                            )}

                            {(inv.status === 'SENT' || wf === 'APPROVED') && inv.status !== 'RECEIVED' && inv.status !== 'CANCELLED' && (
                              <button
                                className="btn btn-success"
                                style={{ padding: '5px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.73rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                                title="Konfirmasi barang tiba dengan foto barang & surat jalan"
                                onClick={() => openReceiveModal(inv)}
                              >
                                Terima Barang
                              </button>
                            )}

                            {/* Unduh PDF Cepat */}
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                              title="Unduh / Cetak PDF PO"
                              onClick={() => handlePrintInvoice(inv)}
                            >
                              PDF
                            </button>

                            {/* Batalkan PO (hanya saat Draft / Sudah Dipesan) */}
                            {(isOwner || isPurchasing) && (inv.status === 'DRAFT' || inv.status === 'SENT') && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', color: 'var(--danger)', whiteSpace: 'nowrap' }}
                                title="Batalkan PO"
                                onClick={() => handleCancelPO(inv)}
                              >
                                Batal
                              </button>
                            )}

                            {/* Status: RECEIVED */}
                            {(inv.status === 'RECEIVED' || inv.status === 'GOODS_RECEIVED') && (
                              <span style={{ fontSize: '0.74rem', color: 'var(--success)', fontWeight: 700, padding: '4px 6px' }}>
                                Stok Masuk
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
                  Gudang Tujuan: <strong style={{ color: 'var(--text-primary)' }}>{viewInvoice.location || 'CENTRAL'}</strong> · Tanggal Kirim: <strong style={{ color: 'var(--accent)' }}>{viewInvoice.due_date || viewInvoice.delivery_date || (String(viewInvoice.notes || '').match(/Jadwal Kirim:\s*([^|]+)/)?.[1]?.trim()) || '-'}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {viewInvoice.status !== 'RECEIVED' && viewInvoice.status !== 'GOODS_RECEIVED' && viewInvoice.status !== 'CANCELLED' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      const targetPo = viewInvoice;
                      setViewInvoice(null);
                      openReviewPoModal(targetPo);
                    }}
                  >
                    Proses / Edit PO
                  </button>
                )}
                {(isPurchasing || isOwner) && viewInvoice.status !== 'RECEIVED' && viewInvoice.status !== 'CANCELLED' && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', fontWeight: 600, color: '#059669', borderColor: 'rgba(16,185,129,0.4)' }}
                    onClick={() => handleContactSupplierWA(viewInvoice)}
                  >
                    Chat WA
                  </button>
                )}
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => handlePrintInvoice(viewInvoice)}>
                  <Download size={14} /> Cetak / PDF
                </button>
                <button style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setViewInvoice(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Supplier Replacement & Approval Audit Banner */}
            {viewInvoice.original_supplier && viewInvoice.original_supplier.toLowerCase().trim() !== (viewInvoice.supplier || '').toLowerCase().trim() && (
              <div style={{ fontSize: '0.82rem', marginBottom: '14px', background: 'rgba(245, 158, 11, 0.08)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                <div style={{ fontWeight: 700, color: '#d97706', marginBottom: '4px' }}>
                  Pergantian Supplier oleh Purchasing (Efisiensi Harga/Kualitas)
                </div>
                <div>Supplier Permintaan Awal Cabang: <strong>{viewInvoice.original_supplier}</strong></div>
                <div>Supplier Terpilih (Purchasing): <strong style={{ color: 'var(--accent)' }}>{viewInvoice.supplier}</strong></div>
                {viewInvoice.supplier_change_note && (
                  <div style={{ marginTop: '4px' }}>Catatan ke Pembuat PO &amp; Owner: <strong>&ldquo;{viewInvoice.supplier_change_note}&rdquo;</strong></div>
                )}
              </div>
            )}

            {viewInvoice.approved_by_name && (
              <div style={{ fontSize: '0.8rem', marginBottom: '14px', background: 'rgba(16, 185, 129, 0.08)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#059669', fontWeight: 600 }}>
                Telah di-ACC oleh Owner ({viewInvoice.approved_by_name}) {viewInvoice.approved_at ? `pada ${new Date(viewInvoice.approved_at).toLocaleString('id-ID')}` : ''}
              </div>
            )}

            {viewInvoice.rejection_reason && (
              <div style={{ fontSize: '0.8rem', marginBottom: '14px', background: 'rgba(239, 68, 68, 0.08)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#dc2626', fontWeight: 600 }}>
                Catatan Revisi Owner: &ldquo;{viewInvoice.rejection_reason}&rdquo;
              </div>
            )}

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
                  {viewInvoice.delivery_note_no && (
                    <div>No. Surat Jalan / Resi Supplier: <strong style={{ color: 'var(--text-primary)' }}>{viewInvoice.delivery_note_no}</strong></div>
                  )}
                  {viewInvoice.delivery_note_photo_url && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>Foto Surat Jalan / Resi Supplier:</div>
                      <img src={viewInvoice.delivery_note_photo_url} alt="Surat Jalan Supplier" style={{ maxWidth: '240px', borderRadius: '8px', border: '1px solid var(--border)' }} />
                    </div>
                  )}
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '14px' }}>
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

      {/* Create PO Slide-over Modal (Material-First: Pilih Bahan -> Bandingkan Supplier & Shortcut Harga -> Tanggal Kirim) */}
      <CreatePoSlideOver
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        stock={stock}
        suppliersList={suppliersList}
        isCentral={isCentral}
        isRekanBar={isRekanBar}
        activeUser={activeUser}
        onSuppliersUpdated={loadSuppliers}
        onMaterialPriceUpdated={refreshData}
        toast={toast}
        onSubmitPo={(invoiceObj) => {
          setInvoiceToSubmit(invoiceObj);
          setShowCreateModal(false);
          setShowConfirmModal(true);
        }}
      />

      {/* Confirmation Modal */}
      {showConfirmModal && invoiceToSubmit && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={() => setShowConfirmModal(false)}>
          <div className="glass-card modal-card" style={{ width: '800px', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>Review Purchase Order</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
              Tinjau rincian pesanan ke supplier <strong>{invoiceToSubmit.supplier}</strong>.
            </p>

            <div data-tour="po-table" className="table-container" style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
              <table className="custom-table" style={{ fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th>Nama Bahan</th>
                    <th style={{ width: '135px', textAlign: 'center' }}>Kuantitas</th>
                    <th style={{ width: '170px', textAlign: 'right' }}>Harga Satuan</th>
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
                          className="form-control tabular-nums"
                          style={{ width: '100%', minWidth: '100px', padding: '7px 12px', fontSize: '0.9rem', fontWeight: 700, textAlign: 'center' }}
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
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 700 }}
                  onClick={() => handleFinalSubmit(true)}
                  title="Simpan PO dan lanjut supplier berikutnya"
                >
                  Simpan & Lanjut Supplier
                </button>
                <button type="button" className="btn btn-primary" onClick={() => handleFinalSubmit(false)}>
                  Simpan PO
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
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Terima Barang</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  PO: <strong style={{ color: 'var(--text-primary)' }}>{showGoodsReceiptModal.invoice_no}</strong> · {showGoodsReceiptModal.supplier}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Gudang: <strong style={{ color: 'var(--accent)' }}>{showGoodsReceiptModal.location || 'CENTRAL'}</strong>
                </p>
              </div>
              <button
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => !isReceiving && setShowGoodsReceiptModal(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '16px' }}>
              <strong>SOP Penerimaan Barang (Goods Receipt):</strong> Wajib menyertakan foto langsung fisik barang yang tiba di lokasi beserta foto Surat Jalan / Resi dari supplier (jika ada).
            </div>

            {/* REQ-SH-08: Verifikasi & Edit Harga Satuan Sesuai Bon Fisik saat Barang Tiba (Forward-Only Price Lock) */}
            {Array.isArray(showGoodsReceiptModal.items) && showGoodsReceiptModal.items.length > 0 && (
              <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: '4px', color: 'var(--text-primary)' }}>
                  Verifikasi Harga Satuan Sesuai Bon / Nota Fisik (Forward-Only Price Lock)
                </div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Jika harga di bon fisik berubah (mis. Jeruk Pontianak naik dari Rp 20.000 ke Rp 35.000/kg), ubah harga di bawah ini sebelum klik Simpan. Perubahan harga hanya berlaku ke depan dan tidak mengubah laporan historis bulan lalu.
                </div>
                <table className="custom-table" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Nama Barang</th>
                      <th style={{ textAlign: 'right', width: '75px' }}>Qty</th>
                      <th style={{ textAlign: 'right', width: '130px' }}>Harga Bon (Rp)</th>
                      <th style={{ textAlign: 'right', width: '110px' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showGoodsReceiptModal.items.map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                        <td style={{ textAlign: 'right' }}>{it.qty} {it.unit}</td>
                        <td>
                          <input
                            type="number"
                            className="form-control"
                            style={{ padding: '3px 6px', fontSize: '0.78rem', textAlign: 'right' }}
                            value={it.unit_price}
                            onChange={(e) => {
                              const nextPrice = parseFloat(e.target.value) || 0;
                              setShowGoodsReceiptModal((prev) => {
                                if (!prev) return prev;
                                const nextItems = [...(prev.items || [])];
                                nextItems[idx] = { ...nextItems[idx], unit_price: nextPrice };
                                const nextTotal = nextItems.reduce((a, row) => a + (Number(row.qty || 0) * Number(row.unit_price || 0)), 0);
                                return { ...prev, items: nextItems, total: nextTotal };
                              });
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {formatIDR(Number(it.qty || 0) * Number(it.unit_price || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Audit Section: Dual Photo (Goods + Surat Jalan/Resi), GPS, Signature */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 1. Foto Fisik Barang yang Diterima (Wajib) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  1. Foto Langsung Fisik Barang yang Diterima * (Wajib)
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
                    padding: '14px',
                    border: '2px dashed var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: receiptPhotoPreview ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-secondary)',
                    minHeight: '90px'
                  }}>
                    {receiptPhotoPreview ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={receiptPhotoPreview} alt="Foto Barang" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px' }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--success)' }}>Foto Fisik Barang Tercatat</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Klik untuk mengganti foto barang</div>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)' }}>
                        Klik untuk Ambil Foto Langsung Barang yang Diterima
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Nomor & Foto Surat Jalan / Resi Supplier */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                    2. Nomor Surat Jalan / Resi Pengiriman Supplier (Jika Ada)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    style={{ fontSize: '0.82rem', padding: '7px 10px' }}
                    placeholder="Contoh: SJ-2026-0891 / Resi Kurir..."
                    value={deliveryNoteNo}
                    onChange={e => setDeliveryNoteNo(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                    Foto Surat Jalan dari Supplier / Resi (Jika Ada)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
                      onChange={handleDeliveryNotePhotoChange}
                    />
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '12px',
                      border: '1px dashed var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      background: deliveryNotePhotoPreview ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-primary)'
                    }}>
                      {deliveryNotePhotoPreview ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img src={deliveryNotePhotoPreview} alt="Foto Surat Jalan" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--success)' }}>Foto Surat Jalan / Resi Terlampir (Klik untuk ganti)</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Klik untuk Upload / Foto Surat Jalan atau Resi Supplier
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. GPS Location */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '6px' }}>
                  2. Koordinat GPS
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
                    3. Tanda Tangan Penerima
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
                {isReceiving ? 'Menyimpan...' : 'Simpan & Tambah Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchasing Review, Supplier Comparison & Submit to Owner ACC Modal */}
      {reviewPoModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)', zIndex: 1150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={() => !savingReviewPo && setReviewPoModal(null)}
        >
          <div
            className="glass-card modal-card"
            style={{ width: '820px', maxWidth: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  Proses PO — {reviewPoModal.invoice_no}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: 0 }}>
                  Supplier awal: <strong>{reviewPoModal.original_supplier || reviewPoModal.supplier}</strong> · Divisi: <strong>{reviewPoModal.division || 'BAR'}</strong>
                </p>
              </div>
              <button
                type="button"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}
                onClick={() => !savingReviewPo && setReviewPoModal(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 0 }}>
                    Supplier
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddSupplier((prev) => !prev)}
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      background: 'rgba(16,185,129,0.1)',
                      border: '1px solid rgba(16,185,129,0.35)',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      cursor: 'pointer'
                    }}
                  >
                    {showQuickAddSupplier ? 'Tutup' : '+ Supplier Baru'}
                  </button>
                </div>

                {showQuickAddSupplier ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--accent)' }}>
                    <input
                      type="text"
                      className="form-control"
                      style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                      placeholder="Nama supplier baru *"
                      value={quickSupForm.name}
                      onChange={(e) => setQuickSupForm((p) => ({ ...p, name: e.target.value }))}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px' }}>
                      <input
                        type="text"
                        className="form-control"
                        style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                        placeholder="No. WA / HP"
                        value={quickSupForm.phone}
                        onChange={(e) => setQuickSupForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                      <input
                        type="text"
                        className="form-control"
                        style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                        placeholder="Nama kontak"
                        value={quickSupForm.contact_person}
                        onChange={(e) => setQuickSupForm((p) => ({ ...p, contact_person: e.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700 }}
                      onClick={handleQuickCreateSupplierInReview}
                      disabled={savingQuickSup}
                    >
                      {savingQuickSup ? 'Menyimpan...' : 'Simpan & Pakai Supplier'}
                    </button>
                  </div>
                ) : (
                  <select
                    className="form-control"
                    value={reviewPoModal.supplier}
                    onChange={e => setReviewPoModal(prev => ({ ...prev, supplier: e.target.value }))}
                  >
                    {suppliersList.map(s => (
                      <option key={s.id || s.name} value={s.name}>{s.name}</option>
                    ))}
                    {!suppliersList.some(s => s.name === reviewPoModal.supplier) && (
                      <option value={reviewPoModal.supplier}>{reviewPoModal.supplier}</option>
                    )}
                  </select>
                )}
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                  Alasan ganti supplier (jika diganti)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Mis. lebih murah atau stok lama kosong"
                  value={reviewPoModal.supplier_change_note || ''}
                  onChange={e => setReviewPoModal(prev => ({ ...prev, supplier_change_note: e.target.value }))}
                />
              </div>
            </div>

            {(reviewPoModal.supplier || '').trim().toLowerCase() !== (reviewPoModal.original_supplier || '').trim().toLowerCase() && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: '0.78rem', color: '#d97706', marginBottom: '14px', fontWeight: 600 }}>
                Perhatian: Supplier diubah dari permintaan awal cabang ({reviewPoModal.original_supplier}) menjadi ({reviewPoModal.supplier}). Catatan pergantian di atas akan ditampilkan kepada pembuat PO cabang dan kepada Owner saat ACC.
              </div>
            )}

            <div className="table-container" style={{ marginBottom: '16px', maxHeight: '320px', overflowY: 'auto' }}>
              <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Bahan Baku</th>
                    <th style={{ width: '130px', textAlign: 'center' }}>Qty</th>
                    <th style={{ width: '165px', textAlign: 'right' }}>Harga Beli / Unit (Rp)</th>
                    <th style={{ width: '130px', textAlign: 'right' }}>Subtotal</th>
                    <th style={{ width: '140px', textAlign: 'center' }}>Bandingkan</th>
                  </tr>
                </thead>
                <tbody>
                  {(reviewPoModal.items || []).map((it, idx) => {
                    const matObj = (stock || []).find(s => String(s.id) === String(it.material_id) || (s.name || '').toLowerCase() === (it.item_name || '').toLowerCase());
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            className="form-control tabular-nums"
                            style={{ width: '100%', minWidth: '96px', padding: '7px 12px', fontSize: '0.88rem', fontWeight: 700, textAlign: 'center' }}
                            value={it.qty}
                            onChange={e => {
                              const nextQty = parseFloat(e.target.value) || 0;
                              setReviewPoModal(prev => {
                                const nextItems = [...prev.items];
                                nextItems[idx] = { ...nextItems[idx], qty: nextQty };
                                return { ...prev, items: nextItems };
                              });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="form-control text-right font-mono"
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            value={it.unit_price}
                            onChange={e => {
                              const nextPrice = parseFloat(e.target.value) || 0;
                              setReviewPoModal(prev => {
                                const nextItems = [...prev.items];
                                nextItems[idx] = { ...nextItems[idx], unit_price: nextPrice };
                                return { ...prev, items: nextItems };
                              });
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                          {formatIDR((parseFloat(it.qty) || 0) * (parseFloat(it.unit_price) || 0))}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent)' }}
                            onClick={() => setCompareItemForPo({
                              idx,
                              material: matObj || { id: it.material_id, name: it.item_name, unit: it.unit || 'pck', price: it.unit_price, supplier: reviewPoModal.supplier }
                            })}
                          >
                            Bandingkan
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                Total Estimasi PO: <span style={{ color: 'var(--accent)' }}>
                  {formatIDR((reviewPoModal.items || []).reduce((a, i) => a + ((parseFloat(i.qty) || 0) * (parseFloat(i.unit_price) || 0)), 0))}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setReviewPoModal(null)} disabled={savingReviewPo}>
                  Batal
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={(e) => handleSavePurchasingReview(e, false)}
                  disabled={savingReviewPo}
                >
                  Simpan Draft
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontWeight: 700 }}
                  onClick={(e) => handleSavePurchasingReview(e, true)}
                  disabled={savingReviewPo}
                >
                  {savingReviewPo ? 'Memproses...' : 'Simpan & Pesan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Supplier Comparison Modal inside PO Review */}
      {compareItemForPo && (
        <ComparePriceModal
          item={compareItemForPo.material}
          suppliers={suppliersList}
          onClose={() => setCompareItemForPo(null)}
          onSelect={(offer) => {
            setReviewPoModal(prev => {
              if (!prev) return prev;
              const nextItems = [...prev.items];
              if (nextItems[compareItemForPo.idx]) {
                nextItems[compareItemForPo.idx] = {
                  ...nextItems[compareItemForPo.idx],
                  unit_price: Number(offer.price)
                };
              }
              return {
                ...prev,
                supplier: offer.supplier_name || prev.supplier,
                supplier_change_note: offer.change_note || prev.supplier_change_note,
                items: nextItems
              };
            });
          }}
        />
      )}

      {/* Bulk Import Modal */}
      <BulkImport
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        type="invoices"
        title="Import Purchase Order"
        description="Unggah baris Purchase Order dari Excel."
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

      {/* Custom In-App Double-Check Dialog for PO Actions */}
      {poActionDialog && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300,
            padding: '16px'
          }}
          onClick={() => setPoActionDialog(null)}
        >
          <div
            className="glass-card modal-card"
            style={{ width: '440px', maxWidth: 'calc(100vw - 32px)', padding: '24px' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '8px' }}>
              {poActionDialog.title}
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              {poActionDialog.message}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setPoActionDialog(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className={poActionDialog.type === 'CANCEL_PO' ? 'btn' : 'btn btn-primary'}
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  ...(poActionDialog.type === 'CANCEL_PO'
                    ? { background: 'var(--danger)', color: '#fff', fontWeight: 700 }
                    : { fontWeight: 700 })
                }}
                onClick={() => {
                  if (poActionDialog.type === 'SWITCH_SUPPLIER') {
                    applySupplierSwitch(poActionDialog.nextSupplierName);
                  } else if (poActionDialog.type === 'SEND_PO') {
                    executeKirimPO(poActionDialog.invoice);
                  } else if (poActionDialog.type === 'CANCEL_PO') {
                    executeCancelPO(poActionDialog.invoice);
                  }
                }}
              >
                {poActionDialog.type === 'CANCEL_PO' ? 'Batalkan PO' : 'Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
