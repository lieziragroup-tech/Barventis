import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getExpiryColor } from '../../utils/expiryColor';
import { Calendar, FileText, PlusCircle, Save, Loader2, Lock, Unlock, Info, Package, Camera, HelpCircle, ChevronDown, X, AlertCircle, Search, ChevronLeft, ChevronRight, CheckCheck, Eye, AlertTriangle, Plus, Check, Clock, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';
import PhotoUploaderModal from '../../components/shared/PhotoUploaderModal';
import { calculateDailyInventoryMetrics, calculateInferredFullFromBroken, convertQtyToStockUnit, getBrokenUnitLabel, isBrokenTrackingEnabled, getLocalDateISO, manualInDeltaFromTotal } from '../../services/dailyInventoryMath';

export default function DailyInventory({ category: _category, initialTab }) {
  const { activeUser } = useAuth();
  // Daily Inventory is primarily an input workflow. Open the editable EOD form by default;
  // users can switch to REKAP whenever they need historical output.
  const [activeTab, setActiveTab] = useState(initialTab || 'EOD');
  const [date, setDate] = useState(() => getLocalDateISO());
  const [location, setLocation] = useState('RESTO');
  const [showGuide, setShowGuide] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [photoModal, setPhotoModal] = useState({ isOpen: false, bucket: '', contextName: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [closingPreview, setClosingPreview] = useState(null);
  const [lotOverrideReason, setLotOverrideReason] = useState('');

  // Auto-save State (5 seconds debounce + Instant LocalStorage Mirror)
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const autoSaveTimerRef = useRef(null);
  const isDirtyRef = useRef(false);
  const inventoryRef = useRef({});
  const itemsRef = useRef([]);
  const dateRef = useRef(date);
  const locationRef = useRef(location);
  const isLockedRef = useRef(isLocked);
  const activeUserRef = useRef(activeUser);
  
  // Keep refs synchronized
  inventoryRef.current = inventory;
  itemsRef.current = items;
  dateRef.current = date;
  locationRef.current = location;
  isLockedRef.current = isLocked;
  activeUserRef.current = activeUser;

  const getLocalDraftKey = useCallback((d = date, loc = location) => {
    const tenantId = activeUser?.tenant_id || 'default';
    return `barventis_daily_inv_draft_${tenantId}_${loc}_${d}`;
  }, [activeUser?.tenant_id, date, location]);

  const saveDraftToLocalStorage = useCallback((invState, d = date, loc = location) => {
    try {
      const key = getLocalDraftKey(d, loc);
      localStorage.setItem(key, JSON.stringify({
        savedAt: Date.now(),
        date: d,
        location: loc,
        inventory: invState
      }));
    } catch (_e) {
      // ignore quota errors
    }
  }, [getLocalDraftKey, date, location]);

  const clearLocalDraft = useCallback((d = date, loc = location) => {
    try {
      localStorage.removeItem(getLocalDraftKey(d, loc));
    } catch (_e) {}
  }, [getLocalDraftKey, date, location]);
  // Quick Record Waste Modal State
  const [wasteModal, setWasteModal] = useState({
    isOpen: false,
    item: null,
    qty: '',
    type: 'WASTE',
    reason: 'Tumpah / Salah Racik (Spoilage)',
    notes: '',
    submitting: false,
    error: ''
  });

  // REKAP state
  const [records, setRecords] = useState([]);

  // EOD state
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, pageSize, date, location]);

  const filteredItems = useMemo(() => {
    if (!debouncedSearch) return items;
    return items.filter(item => [item.name, item.sku, item.item_code, item.category]
      .some(value => String(value || '').toLowerCase().includes(debouncedSearch)));
  }, [items, debouncedSearch]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (visiblePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, visiblePage, pageSize]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // REFACTOR: endpoint baru
      const data = await api.getDailyInventoryRecords(date, location);
      if (!data || !data.length) {
        setRecords([]);
        setIsLocked(false);
        return;
      }
      // Locking flag: jika ada yang verified/closed
      setIsLocked(data.some(r => r.status === 'verified' || r.status === 'closed'));
      // Map sama seperti sebelumnya + filtering ASSET
      setRecords(data.filter(r => (r.materials?.category || '').toUpperCase() !== 'ASSET'));
    } catch (err) {
      setError(err.message || 'Gagal memuat rekap harian');
    } finally {
      setLoading(false);
    }
  }, [date, location]);

  const fetchEodData = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // REFACTOR: endpoint baru
      const { items: materialsList, inventory: invMap, isLocked: lockFlag } = await api.getDailyInventoryEodData(date, location);
      setItems(materialsList);
      setIsLocked(!!lockFlag);
      
      let mergedInventory = invMap || {};
      // Rehydrate uncommitted changes from localStorage if available and not locked
      if (!lockFlag) {
        try {
          const key = getLocalDraftKey(date, location);
          const localRaw = localStorage.getItem(key);
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (parsed && parsed.inventory && parsed.date === date && parsed.location === location) {
              // Merge local modifications over server draft
              const localInv = parsed.inventory;
              const hydrated = { ...mergedInventory };
              Object.keys(localInv).forEach(matId => {
                if (hydrated[matId]) {
                  const locRow = localInv[matId];
                  hydrated[matId] = {
                    ...hydrated[matId],
                    ...(locRow.manual_in_total_input !== undefined ? { manual_in_total_input: locRow.manual_in_total_input } : {}),
                    ...(locRow.manual_in_qty !== undefined ? { manual_in_qty: locRow.manual_in_qty } : {}),
                    ...(locRow.manual_in_lots !== undefined ? { manual_in_lots: locRow.manual_in_lots } : {}),
                    ...(locRow.qty_out !== undefined ? { qty_out: locRow.qty_out } : {}),
                    ...(locRow.out_confirmed !== undefined ? { out_confirmed: locRow.out_confirmed } : {}),
                    ...(locRow.zero_activity_confirmed !== undefined ? { zero_activity_confirmed: locRow.zero_activity_confirmed } : {}),
                    ...(locRow.broken !== undefined ? { broken: locRow.broken } : {}),
                    ...(locRow.broken_confirmed !== undefined ? { broken_confirmed: locRow.broken_confirmed } : {}),
                  };
                } else {
                  hydrated[matId] = localInv[matId];
                }
              });
              mergedInventory = hydrated;
            }
          }
        } catch (_parseErr) {}
      }
      
      setInventory(mergedInventory);
    } catch (err) {
      setError(err.message || 'Gagal memuat form EOD');
    } finally {
      setLoading(false);
    }
  }, [date, location, getLocalDraftKey]);
  useEffect(() => {
    if (activeTab === 'REKAP') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchRecords();
    } else {
      fetchEodData();
    }
  }, [activeTab, fetchRecords, fetchEodData]);

  const handleChange = (itemId, field, value) => {
    if (isLocked) return;
    const initialItem = items.find(m => m.id === itemId);
    const fallbackStokAwal = location === 'CENTRAL' ? initialItem?.qty_central : (initialItem?.qty_resto ?? initialItem?.stock);
    setInventory(prev => {
      let parsedValue = value;
      if (field !== 'expiry_date') {
        if (value === '' || value === null || value === undefined) parsedValue = '';
        else parsedValue = String(value).replace(',', '.');
      }
      const existing = prev[itemId] || {
        stok_awal: Number(fallbackStokAwal) || 0,
        qty_in: 0,
        manual_in_qty: 0,
        qty_out: '',
        waste: 0,
        broken: '',
        out_confirmed: false,
        broken_confirmed: false,
        zero_activity_confirmed: false,
      };
      const nextRow = { ...existing, [field]: parsedValue };
      if (field === 'in_total_input') {
        // The visible IN field is the complete daily total. The database stores
        // only its manual delta because Purchasing/transfers already contribute
        // source-derived IN transactions; this prevents double-counting receipts.
        const sourceInQty = Number(existing.qty_in ?? initialItem?.qty_in) || 0;
        nextRow.manual_in_total_input = parsedValue;
        // Clearing the visible total must not silently erase source receipts.
        // A negative delta keeps the row invalid until the user restores a valid total.
        nextRow.manual_in_qty = parsedValue === ''
          ? -sourceInQty
          : manualInDeltaFromTotal(parsedValue, sourceInQty);
      }
      if (field === 'qty_out') {
        nextRow.out_confirmed = parsedValue !== '';
        nextRow.zero_activity_confirmed = parsedValue !== '' && Number(parsedValue) === 0;
        // For package-tracked materials, OUT is entered in the same content unit
        // as BROKEN (e.g. ml or g). Legacy rows keep their persisted unit.
        nextRow.out_unit = existing.out_unit || (isBrokenTrackingEnabled(initialItem) ? getBrokenUnitLabel(initialItem) : initialItem?.unit);
      }
      if (field === 'broken') {
        nextRow.broken_confirmed = parsedValue !== '' && parsedValue !== null && parsedValue !== undefined;
        nextRow.is_counted = nextRow.broken_confirmed;
      }
      saveDraftToLocalStorage({ ...prev, [itemId]: nextRow });
      return { ...prev, [itemId]: nextRow };
    });
    triggerAutoSaveDebounce();
  };

  const createManualInLot = () => ({
    lot_key: globalThis.crypto?.randomUUID?.() || `lot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    batch_no: '',
    expiry_date: '',
    qty: '',
  });

  const updateManualInLots = (itemId, updater) => {
    setInventory(prev => {
      const current = prev[itemId] || {};
      const lots = Array.isArray(current.manual_in_lots) ? current.manual_in_lots : [];
      const nextLots = updater(lots).map(lot => ({ ...lot }));
      const nextState = {
        ...prev,
        [itemId]: {
          ...current,
          manual_in_lots: nextLots,
        },
      };
      saveDraftToLocalStorage(nextState);
      return nextState;
    });
    triggerAutoSaveDebounce();
  };
  const addManualInLot = itemId => updateManualInLots(itemId, lots => [...lots, createManualInLot()]);
  const setManualInToLotTotal = itemId => {
    setInventory(prev => {
      const current = prev[itemId] || {};
      const lots = Array.isArray(current.manual_in_lots) ? current.manual_in_lots : [];
      const totalQty = lots.reduce((sum, lot) => sum + (Number(lot.qty) > 0 ? Number(lot.qty) : 0), 0);
      const sourceInQty = Number(current.qty_in) || 0;
      const manualQty = Number(totalQty.toFixed(4));
      const totalInQty = Number((sourceInQty + manualQty).toFixed(4));
      const nextState = { ...prev, [itemId]: { ...current, manual_in_qty: manualQty, manual_in_total_input: String(totalInQty) } };
      saveDraftToLocalStorage(nextState);
      return nextState;
    });
    triggerAutoSaveDebounce();
  };
  const changeManualInLot = (itemId, lotKey, field, value) => updateManualInLots(itemId, lots => lots.map(lot => {
    if (lot.lot_key !== lotKey) return lot;
    const normalized = field === 'qty' ? (value === '' ? '' : String(value).replace(',', '.')) : value;
    return { ...lot, [field]: normalized };
  }));
  const removeManualInLot = (itemId, lotKey) => updateManualInLots(itemId, lots => lots.filter(lot => lot.lot_key !== lotKey));
  const confirmZeroActivityForUntouched = () => {
    const candidates = items.filter(item => {
      const row = inventory[item.id] || {};
      return !row.out_confirmed && (row.qty_out === '' || row.qty_out === null || row.qty_out === undefined);
    });
    if (!candidates.length) {
      setSuccess('Tidak ada kolom OUT kosong yang perlu dikonfirmasi.');
      return;
    }
    const approved = window.confirm(`Konfirmasi OUT = 0 untuk ${candidates.length} material yang kolom OUT-nya belum diisi?`);
    if (!approved) return;
    setInventory(prev => {
      const next = { ...prev };
      candidates.forEach(item => {
        const current = next[item.id] || {};
        next[item.id] = { ...current, qty_out: '0', out_unit: current.out_unit || (isBrokenTrackingEnabled(item) ? getBrokenUnitLabel(item) : item.unit), out_confirmed: true, zero_activity_confirmed: true };
      });
      saveDraftToLocalStorage(next);
      return next;
    });
    triggerAutoSaveDebounce();
    setSuccess(`${candidates.length} material dikonfirmasi OUT = 0.`);
    setError('');
  };

  const getInventoryRowMetrics = (item, row = {}, strict = false) => {
    const opening = Number(row.stok_awal) || 0;
    const incoming = Number(row.qty_in) || 0; // IN sourced automatically from Purchasing/transfers
    const manualInInput = row.manual_in_qty === '' || row.manual_in_qty == null ? 0 : Number(row.manual_in_qty);
    const manualIn = Number.isFinite(manualInInput) ? manualInInput : Number.NaN;
    const brokenTracking = isBrokenTrackingEnabled(item);
    const inputOut = row.qty_out === '' || row.qty_out == null ? 0 : Number(row.qty_out) || 0;
    const outUnit = row.out_unit || (brokenTracking ? getBrokenUnitLabel(item) : item.unit);
    let out = 0;
    try {
      out = row.qty_out === '' || row.qty_out == null ? 0 : convertQtyToStockUnit(item, inputOut, outUnit);
    } catch (conversionError) {
      out = Number.NaN;
    }
    const productionUsage = Number(row.production_usage_qty) || 0; // retained for legacy transactions only
    const waste = Number(row.waste) || 0;
    let manualInStockQty = 0;
    try {
      manualInStockQty = Number.isFinite(manualIn) ? convertQtyToStockUnit(item, manualIn, item.unit) : Number.NaN;
    } catch { manualInStockQty = Number.NaN; }
    const baseMovement = row.net_stock_movement;
    const effectiveNetMovement = baseMovement !== null && baseMovement !== undefined
      ? Number(baseMovement) + (Number.isFinite(manualInStockQty) ? manualInStockQty : 0)
      : null;
    // FULL is inferred from book closing (opening + valid IN/movements - OUT/WASTE).
    // With no IN/WASTE/other movement this reduces to opening stock minus OUT.
    // FULL is not reduced by BROKEN; BROKEN is only checked against the book balance.
    const baseMetrics = calculateDailyInventoryMetrics({
      opening,
      incoming: incoming + (Number.isFinite(manualInStockQty) ? manualInStockQty : 0),
      netMovement: effectiveNetMovement,
      out: Number.isFinite(out) ? out : 0,
      productionUsage,
      waste,
      closing: 0,
    });
    const bookClosing = baseMetrics.expectedClosing;
    const brokenInput = row.broken === '' || row.broken === undefined || row.broken === null ? null : Number(row.broken);
    const brokenConfirmed = !brokenTracking || Boolean(row.broken_confirmed ?? row.is_counted);
    // FULL displays immediately from book closing. BROKEN is an independent
    // physical measurement and is only used to validate that candidate during closing.
    const brokenForValidation = brokenInput !== null && Number.isFinite(brokenInput) ? brokenInput : 0;
    const inferred = calculateInferredFullFromBroken(item, bookClosing, brokenForValidation);
    const closingValid = (!brokenTracking || (brokenConfirmed && inferred?.valid)) && Number.isFinite(out);
    const metrics = calculateDailyInventoryMetrics({
      opening,
      incoming: incoming + (Number.isFinite(manualInStockQty) ? manualInStockQty : 0),
      netMovement: effectiveNetMovement,
      out,
      productionUsage,
      waste,
      closing: bookClosing,
    });
    const unitCost = Number(row.cost_per_unit ?? row.unit_cost_snapshot ?? item.avg_cost ?? item.price) || 0;
    const reconciliationRequired = !Number.isFinite(out) || !Number.isFinite(manualInStockQty) || manualIn < 0 || bookClosing < -0.0001 || (brokenTracking && brokenConfirmed && inferred && !inferred.valid);
    if (strict && reconciliationRequired) {
      throw new Error(inferred?.reason || (Number.isFinite(out) ? `Saldo akhir buku untuk ${item?.name || 'material'} negatif. Periksa mutasi sebelum closing.` : `Satuan OUT untuk ${item?.name || 'material'} tidak dapat dikonversi.`));
    }
    return {
      ...metrics,
      stockBasedUsage: metrics.stockBasedUsage,
      usageVariance: metrics.usageVariance,
      outInput: inputOut,
      outUnit,
      closing: closingValid && bookClosing >= -0.0001 ? Math.max(0, bookClosing) : null,
      bookClosing,
      fullQty: inferred?.fullQty ?? null,
      rawFullQty: inferred?.rawFullQty ?? null,
      brokenStockQty: inferred?.brokenStockQty ?? null,
      inferredPhysicalQty: inferred?.physicalEquivalentQty ?? null,
      brokenUnit: getBrokenUnitLabel(item),
      brokenTracking,
      brokenConfirmed,
      reconciliationRequired,
      reconciliationReason: inferred?.reason || (bookClosing < -0.0001 ? 'Saldo buku akhir negatif.' : null),
      unitCost,
      usageValue: (Number.isFinite(out) ? out : 0) * unitCost, // production input is an internal conversion, not final consumption
      outStockQty: Number.isFinite(out) ? out : null,
      counted: brokenConfirmed,
    };
  };

  const canApproveLotOverride = ['admin / owner', 'owner', 'supervisor', 'super admin', 'superadmin'].includes(String(activeUser?.role || '').trim().toLowerCase());

  const buildClosingPreview = (overrideReason = lotOverrideReason) => {
    const rows = items.map(item => {
      const row = inventory[item.id] || {};
      const metrics = getInventoryRowMetrics(item, row);
      const outConfirmed = Boolean(row.out_confirmed) || row.zero_activity_confirmed === true || (row.qty_out !== '' && row.qty_out !== null && row.qty_out !== undefined);
      const brokenConfirmed = !metrics.brokenTracking || metrics.brokenConfirmed;
      const issues = [];
      const warnings = [];
      if (!outConfirmed) issues.push('OUT belum dikonfirmasi (isi pemakaian atau konfirmasi nol)');
      if (!brokenConfirmed) issues.push('BROKEN belum ditimbang');
      if (metrics.reconciliationRequired) issues.push(metrics.reconciliationReason || 'Perlu rekonsiliasi');
      const lotNeedsDecision = Boolean(item.fefo_exception || item.lot_reconciliation_required);
      if (item.fefo_exception) warnings.push('Lot terbuka bukan lot dengan expired date terdekat');
      if (item.lot_reconciliation_required) warnings.push('Saldo lot lama belum diverifikasi atau tidak sama dengan stok material');
      if (lotNeedsDecision && (!canApproveLotOverride || !String(overrideReason || '').trim())) {
        issues.push(canApproveLotOverride
          ? 'Alasan persetujuan exception lot wajib diisi di preview'
          : 'Exception lot memerlukan persetujuan manager/supervisor');
      }
      return { id: item.id, name: item.name, issues, warnings, metrics, row, item, outConfirmed, brokenConfirmed, lotNeedsDecision };
    });
    return {
      rows,
      total: rows.length,
      outConfirmed: rows.filter(row => row.outConfirmed).length,
      zeros: rows.filter(row => row.row.zero_activity_confirmed).length,
      brokenConfirmed: rows.filter(row => row.brokenConfirmed).length,
      reconciliationCount: rows.filter(row => row.metrics.reconciliationRequired).length,
      blockers: rows.filter(row => row.issues.length > 0),
      warnings: rows.filter(row => row.warnings.length > 0),
      lotExceptions: rows.filter(row => row.lotNeedsDecision),
    };
  };

  const handleUnlock = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await api.unlockDailyInventory(date, location);
      setIsLocked(false);
      setSuccess('Kunci EOD berhasil dibuka. Formulir kini dapat diedit kembali.');
      if (activeTab === 'REKAP') {
        fetchRecords();
      } else {
        fetchEodData();
      }
    } catch (err) {
      setError('Gagal membuka kunci EOD: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e, rowIndex, colIndex) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const nextRow = rowIndex + (e.key === 'ArrowUp' ? -1 : 1);
      const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${colIndex}"]`);
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    }
  };

  const performSave = async (isClosing = false) => {
    const itemsToSave = items.map(item => {
      const row = inventory[item.id] || {};
      const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
      const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
      const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal }, isClosing);
      const brokenTracking = isBrokenTrackingEnabled(item);
      const manualIn = row.manual_in_qty === '' || row.manual_in_qty == null ? 0 : Number(row.manual_in_qty);
      if (!Number.isFinite(manualIn) || manualIn < 0) throw new Error(`${item.name}: IN total tidak boleh lebih kecil dari penerimaan otomatis (${Number(row.qty_in) || 0} ${item.unit || ''}).`);
      const manualInLotsInput = Array.isArray(row.manual_in_lots) ? row.manual_in_lots : [];
      const manualInLots = manualInLotsInput.filter(lot => Number(lot.qty) > 0 || String(lot.expiry_date || '').trim() || String(lot.batch_no || '').trim());
      if (isClosing && item.expiry_tracking_enabled && manualIn > 0) {
        if (!manualInLots.length) throw new Error(`${item.name}: tambahkan minimal satu rincian lot beserta expired date untuk IN.`);
        const lotTotal = manualInLots.reduce((sum, lot) => sum + (Number(lot.qty) > 0 ? Number(lot.qty) : 0), 0);
        if (manualInLots.some(lot => !lot.expiry_date || !(Number(lot.qty) > 0))) {
          throw new Error(`${item.name}: setiap lot IN wajib memiliki qty > 0 dan expired date.`);
        }
        if (Math.abs(lotTotal - manualIn) > 0.0001) {
          throw new Error(`${item.name}: total rincian lot (${lotTotal}) tidak sama dengan total IN (${manualIn}).`);
        }
      } else if (isClosing && item.expiry_tracking_enabled && manualIn <= 0 && manualInLots.length) {
        throw new Error(`${item.name}: rincian lot terisi tetapi total IN nol. Lengkapi jumlah IN atau hapus rincian lot tersebut.`);
      }
      const outEntered = row.qty_out !== '' && row.qty_out !== null && row.qty_out !== undefined;
      const outConfirmed = Boolean(row.out_confirmed) || row.zero_activity_confirmed === true || outEntered;
      const outUnit = row.out_unit || (brokenTracking ? getBrokenUnitLabel(item) : item.unit);
      const outInput = outEntered ? Number(row.qty_out) : null;
      const outStockQty = outEntered ? convertQtyToStockUnit(item, outInput, outUnit) : 0;
      const brokenEntered = row.broken !== '' && row.broken !== null && row.broken !== undefined;
      const brokenConfirmed = !brokenTracking || Boolean(row.broken_confirmed ?? row.is_counted) || brokenEntered;
      if (isClosing && !outConfirmed) {
        throw new Error(`${item.name}: OUT belum dikonfirmasi. Isi pemakaian aktual atau gunakan “Konfirmasi OUT = 0”.`);
      }
      if (isClosing && brokenTracking && !brokenConfirmed) {
        throw new Error(`${item.name}: BROKEN belum ditimbang saat closing.`);
      }
      if (isClosing && metrics.reconciliationRequired) {
        throw new Error(`${item.name}: ${metrics.reconciliationReason || 'perlu rekonsiliasi sebelum closing'}`);
      }
      return {
        material_id: Number(item.id),
        opening_qty: stokAwal,
        manual_in_qty: manualIn,
        manual_in_lots: manualInLots,
        out_qty: outStockQty,
        out_qty_input: outInput,
        out_unit: outUnit,
        fefo_override_reason: item.fefo_exception || item.lot_reconciliation_required ? lotOverrideReason.trim() : null,
        out_confirmed: outConfirmed,
        zero_activity_confirmed: Boolean(row.zero_activity_confirmed),
        broken_qty: brokenEntered ? Number(row.broken) : null,
        broken_unit: getBrokenUnitLabel(item),
        broken_confirmed: brokenConfirmed,
        full_qty: metrics.fullQty,
        closing_qty: Number.isFinite(metrics.bookClosing) ? Math.max(0, metrics.bookClosing) : 0,
        is_counted: brokenConfirmed,
        opening_full_qty: row.opening_full_qty ?? null,
        opening_broken_qty: row.opening_broken_qty ?? null,
        opening_qty_source: row.opening_qty_source || 'CLIENT_OR_LEGACY_FALLBACK',
      };
    });
    await api.saveDailyInventory(date, itemsToSave, !!isClosing, activeUser?.id, location);
  };

  const performSaveRef = useRef(null);
  performSaveRef.current = performSave;

  const triggerAutoSaveDebounce = useCallback(() => {
    if (isLocked) return;
    isDirtyRef.current = true;
    setAutoSaveStatus('dirty');
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (isDirtyRef.current && !isLocked && !saving && performSaveRef.current) {
        setAutoSaveStatus('saving');
        try {
          await performSaveRef.current(false);
          isDirtyRef.current = false;
          setAutoSaveStatus('saved');
          const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          setLastSavedTime(nowStr);
        } catch (err) {
          console.error('[DailyInventory] AutoSave error:', err);
          setAutoSaveStatus('error');
        }
      }
    }, 5000);
  }, [isLocked, saving]);

  // Unmount / Navigation Flush: pastikan perubahan yang tertunda langsung dikirim ke DB saat pindah menu
  useEffect(() => {
    return () => {
      clearTimeout(autoSaveTimerRef.current);
      if (isDirtyRef.current && !isLockedRef.current && performSaveRef.current) {
        // Execute immediate flush save to server before unmount
        performSaveRef.current(false).catch(err => {
          console.warn('[DailyInventory] Unmount flush failed, fallback kept in localStorage:', err);
        });
      }
    };
  }, []);

  const handleSave = async () => {
    if (isLocked) return;
    clearTimeout(autoSaveTimerRef.current);
    setError('');
    setSuccess('');
    try {
      await performSave(false);
      isDirtyRef.current = false;
      setAutoSaveStatus('saved');
      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(nowStr);
      setSuccess('Berhasil menyimpan draft stok harian.');
    } catch (err) {
      setAutoSaveStatus('error');
      setError(err.message || 'Gagal menyimpan draft.');
    } finally {
      setSaving(false);
    }
  };

  // Quick Waste Modal Handlers
  const openWasteModal = (item) => {
    if (isLocked) return;
    setWasteModal({
      isOpen: true,
      item,
      qty: '',
      type: 'WASTE',
      reason: 'Tumpah / Salah Racik (Spoilage)',
      notes: '',
      submitting: false,
      error: ''
    });
  };

  const closeWasteModal = () => {
    if (wasteModal.submitting) return;
    setWasteModal({
      isOpen: false,
      item: null,
      qty: '',
      type: 'WASTE',
      reason: 'Tumpah / Salah Racik (Spoilage)',
      notes: '',
      submitting: false,
      error: ''
    });
  };

  const handleSaveWasteFromModal = async (e) => {
    e?.preventDefault();
    if (!wasteModal.item) return;
    const qtyNum = parseFloat(wasteModal.qty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setWasteModal(prev => ({ ...prev, error: 'Jumlah limbah/waste harus lebih dari 0.' }));
      return;
    }
    setWasteModal(prev => ({ ...prev, submitting: true, error: '' }));
    try {
      await api.recordWaste({
        material_id: wasteModal.item.id,
        quantity: qtyNum,
        type: wasteModal.type,
        location,
        reason: wasteModal.reason || 'Limbah Harian Operasional',
        notes: wasteModal.notes || '',
        date
      });

      // Update local row in inventory state so it reflects immediately
      const matId = wasteModal.item.id;
      setInventory(prev => {
        const cur = prev[matId] || {};
        const oldWaste = Number(cur.waste) || 0;
        return {
          ...prev,
          [matId]: {
            ...cur,
            waste: Number((oldWaste + qtyNum).toFixed(4))
          }
        };
      });

      setSuccess(`Limbah untuk ${wasteModal.item.name} (${qtyNum} ${wasteModal.item.unit}) berhasil dicatat dan masuk ke Catatan Limbah!`);
      closeWasteModal();
      triggerAutoSaveDebounce();
    } catch (err) {
      setWasteModal(prev => ({ ...prev, submitting: false, error: err.message || 'Gagal mencatat limbah.' }));
    }
  };

  const submitEODSettlement = () => {
    setLotOverrideReason('');
    const preview = buildClosingPreview('');
    setClosingPreview(preview);
    setShowClosingPreview(true);
  };

  const confirmClosingFromPreview = async () => {
    const preview = buildClosingPreview();
    setClosingPreview(preview);
    if (preview.blockers.length) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await performSave(true);
      clearLocalDraft(date, location);
      setIsLocked(true);
      setShowClosingPreview(false);
      setSuccess('Closing EOD berhasil disimpan dan dikunci. Stok akhir menjadi saldo awal operasional berikutnya.');
    } catch (err) {
      setError('Gagal closing EOD: ' + (err.message || 'Terjadi kesalahan'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      let rows = [];
      if (activeTab === 'REKAP') {
        if (!records || records.length === 0) {
          alert('Tidak ada data rekap untuk tanggal yang dipilih.');
          return;
        }
        rows = records.map((row, idx) => ({
          'NO': idx + 1,
          'NAMA BARANG': row.materials?.name || 'Item Terhapus',
          'SATUAN': row.materials?.unit || 'unit',
          'HARGA SATUAN (RP)': Number(row.materials?.price) || 0,
          'STOK AWAL': row.stok_awal ?? 0,
          'MASUK OTOMATIS (IN)': row.qty_in ?? 0,
          'IN TAMBAHAN MANUAL': row.manual_in_qty ?? 0,
          'KELUAR (OUT MANUAL)': row.qty_out ?? 0,
          'WASTE / RUSAK': row.waste ?? 0,
          'FISIK FULL': row.full_qty ?? 0,
          'FISIK BROKEN': row.broken ?? 0,
          'STOK AKHIR': row.stok_akhir ?? 0,
          'QTY TERPAKAI': row.qty_terpakai ?? 0,
          'NILAI PEMAKAIAN (RP)': Number(row.nilai_rupiah) || 0
        }));
      } else {
        if (!items || items.length === 0) {
          alert('Tidak ada data item untuk diekspor.');
          return;
        }
        rows = items.map((item, idx) => {
          const row = inventory[item.id] || {};
          const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
          const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
          const qtyIn = Number(row.qty_in) || 0;
          const qtyOut = Number(row.qty_out) || 0;
          const waste = Number(row.waste) || 0;
          const broken = Number(row.broken) || 0;
          const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
          const fullQty = metrics.fullQty == null ? '' : Number(metrics.fullQty);
          const stokAkhir = metrics.closing ?? '';
          const qtyTerpakai = qtyOut;
          const unitPrice = metrics.unitCost;
          const nilaiRupiah = metrics.usageValue;

          return {
            'NO': idx + 1,
            'NAMA BARANG': item.name,
            'SATUAN': item.unit || 'unit',
            'HARGA SATUAN (RP)': unitPrice,
            'STOK AWAL': stokAwal,
            'MASUK OTOMATIS (IN)': qtyIn,
            'IN TAMBAHAN MANUAL': Number(row.manual_in_qty) || 0,
            'KELUAR (OUT MANUAL)': qtyOut,
            'WASTE / RUSAK': waste,
            'FISIK FULL': fullQty,
            'FISIK BROKEN': broken,
            'STOK AKHIR': stokAkhir,
            'QTY TERPAKAI': qtyTerpakai,
            'STOCK-BASED USAGE': metrics.stockBasedUsage,
            'SELISIH PEMAKAIAN': metrics.usageVariance,
            'SUDAH DIHITUNG': metrics.counted ? 'YA' : 'BELUM',
            'NILAI PEMAKAIAN (RP)': nilaiRupiah
          };
        });
      }

      await exportWithAudit({
        format: 'excel',
        filename: `Inventaris_Harian_${activeTab}_${date}`,
        sheets: [{ name: `Inventaris ${date}`, rows }],
        actionName: `Daily Inventory Export Excel (${activeTab})`,
        role: activeUser?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error('Export Excel failed:', err);
      alert('Gagal mengekspor data: ' + err.message);
    }
  };

  const handleExportPDF = async () => {
    try {
      let rows = [];
      const columns = [
        { key: 'no', label: '#' },
        { key: 'name', label: 'Nama Barang' },
        { key: 'stok_awal', label: 'Stok Awal' },
        { key: 'in', label: 'IN' },
        { key: 'out', label: 'OUT' },
        { key: 'waste', label: 'Waste' },
        { key: 'full', label: 'Full' },
        { key: 'broken', label: 'Broken' },
        { key: 'stok_akhir', label: 'Stok Akhir' },
        { key: 'terpakai', label: 'Terpakai' },
        { key: 'nilai', label: 'Nilai (Rp)' }
      ];

      if (activeTab === 'REKAP') {
        if (!records || records.length === 0) {
          alert('Tidak ada data rekap untuk tanggal yang dipilih.');
          return;
        }
        rows = records.map((row, idx) => ({
          no: idx + 1,
          name: `${row.materials?.name || 'Item Terhapus'} (${row.materials?.unit || 'unit'})`,
          stok_awal: row.stok_awal ?? 0,
          in: row.qty_in ?? 0,
          out: row.qty_out ?? 0,
          waste: row.waste ?? 0,
          full: row.full_qty ?? 0,
          broken: row.broken ?? 0,
          stok_akhir: row.stok_akhir ?? 0,
          terpakai: row.qty_terpakai ?? 0,
          nilai: `Rp ${Number(row.nilai_rupiah || 0).toLocaleString('id-ID')}`
        }));
      } else {
        if (!items || items.length === 0) {
          alert('Tidak ada data item untuk diekspor.');
          return;
        }
        rows = items.map((item, idx) => {
          const row = inventory[item.id] || {};
          const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
          const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
          const qtyIn = Number(row.qty_in) || 0;
          const qtyOut = Number(row.qty_out) || 0;
          const waste = Number(row.waste) || 0;
          const broken = Number(row.broken) || 0;
          const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
          const fullQty = metrics.fullQty == null ? '' : Number(metrics.fullQty);
          const stokAkhir = metrics.closing ?? '';
          const qtyTerpakai = qtyOut;
          const unitPrice = metrics.unitCost;
          const nilaiRupiah = metrics.usageValue;

          return {
            no: idx + 1,
            name: `${item.name} (${item.unit || 'unit'})`,
            stok_awal: stokAwal,
            in: qtyIn,
            out: qtyOut,
            waste: waste,
            full: fullQty,
            broken: broken,
            stok_akhir: stokAkhir,
            terpakai: qtyTerpakai,
            nilai: `Rp ${nilaiRupiah.toLocaleString('id-ID')}`
          };
        });
      }

      const modeTitle = activeTab === 'REKAP' ? 'Rekap Historis EOD' : 'Form EOD Berjalan';
      await exportWithAudit({
        format: 'pdf',
        filename: `Inventaris_Harian_${activeTab}_${date}`,
        title: `Laporan Inventaris Harian — Tanggal: ${date} — Lokasi: ${location} (${modeTitle})`,
        tenantName: 'BARVENTIS - Sistem Manajemen Gudang',
        columns,
        rows,
        actionName: `Daily Inventory Export PDF (${activeTab})`,
        role: activeUser?.role || 'SuperAdmin'
      });
    } catch (err) {
      console.error('Export PDF failed:', err);
      alert('Gagal mengekspor PDF: ' + err.message);
    }
  };

  return (
    <div className="fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
              Daily Inventory
            </h1>
            {isLocked && (
              <span style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                TERKUNCI
              </span>
            )}
          </div>
          <p className="hidden md:block" style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '2px 0 0 0' }}>
            Rekapitulasi stok akhir hari dan nilai terpakai
          </p>
        </div>

        {/* Action Controls: Compact Mode Switcher + Interactive Guide Button */}
        <div className="no-print flex items-center gap-2 flex-wrap">
          <div style={{ display: 'inline-flex', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
            <button
              className="btn"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                border: 'none',
                background: activeTab === 'REKAP' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'REKAP' ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '6px',
                fontWeight: activeTab === 'REKAP' ? 700 : 500,
                boxShadow: activeTab === 'REKAP' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setActiveTab('REKAP')}
            >
              <FileText size={14} style={{ marginRight: '5px' }} />
              Rekap Harian
            </button>
            <button
              className="btn"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                border: 'none',
                background: activeTab === 'EOD' ? 'var(--accent)' : 'transparent',
                color: activeTab === 'EOD' ? '#ffffff' : 'var(--text-secondary)',
                borderRadius: '6px',
                fontWeight: activeTab === 'EOD' ? 700 : 500,
                boxShadow: activeTab === 'EOD' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
              onClick={() => setActiveTab('EOD')}
            >
              <PlusCircle size={14} style={{ marginRight: '5px' }} />
              Form Input EOD
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{
              padding: '6px 10px',
              fontSize: '0.78rem',
              borderRadius: 'var(--radius-sm)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: showGuide ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: showGuide ? 'var(--accent)' : 'var(--border)'
            }}
            onClick={() => setShowGuide(prev => !prev)}
            title="Tampilkan / Sembunyikan Panduan"
          >
            <HelpCircle size={14} />
            <span>Panduan</span>
            <ChevronDown size={13} className={`transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Interactive Collapsible Guide Card (Progressive Disclosure) */}
      {showGuide && (
        <div
          className="rounded-xl border p-3.5 text-xs transition-all no-print"
          style={{
            background: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(245, 158, 11, 0.06)',
            borderColor: activeTab === 'REKAP' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(245, 158, 11, 0.25)',
            color: 'var(--text-primary)',
            marginBottom: '10px'
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 flex-1">
              <Info size={16} className={activeTab === 'REKAP' ? 'text-blue-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
              <div className="space-y-1">
                <div className="font-bold" style={{ color: activeTab === 'REKAP' ? '#2563eb' : '#d97706' }}>
                  {activeTab === 'REKAP' ? '📊 Panduan: Rekap Harian (Audit & Tinjauan)' : '📝 Panduan: Form Input EOD (Closing Shift)'}
                </div>
                <p className="m-0 leading-relaxed text-[var(--text-secondary)]">
                  {activeTab === 'REKAP' 
                    ? 'Rekap Harian meninjau stok awal, IN, OUT aktual staf, waste, stok fisik, pemakaian harian, dan selisih rekonsiliasi untuk kebutuhan audit manajerial.'
                    : 'Form EOD diisi staf setiap hari. IN menampilkan total harian, OUT dikonfirmasi staf, WASTE berasal dari Catatan Limbah, BROKEN diinput dari hasil timbang melalui Catatan Limbah, dan FULL dihitung otomatis dari saldo awal serta mutasi hari ini. Stok akhir closing menjadi stok awal hari berikutnya.'
                  }
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md"
              title="Tutup panduan"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px' }}>
        {/* Print-only Document Header */}
        <div className="print-only print-header">
          <div className="print-header-brand">BARVENTIS — SISTEM MANAJEMEN GUDANG</div>
          <div style={{ fontSize: '13pt', fontWeight: 700, margin: '2px 0' }}>
            {activeTab === 'REKAP' ? 'Laporan Rekapitulasi Inventaris Harian' : 'Lembar Kerja Input EOD (End of Day)'}
          </div>
          <div className="print-header-meta">
            Tanggal: {date} | Lokasi: {location} | Status: {isLocked ? 'Terkunci (EOD Closed)' : 'Draft / Terbuka'} | Tanggal Cetak: {new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Filter Tanggal:</label>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto' }}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
            <label style={{ fontWeight: 600 }}>Lokasi:</label>
            <select
              className="form-control"
              style={{ width: 'auto', minWidth: '145px' }}
              value={location}
              onChange={e => setLocation(e.target.value)}
              disabled={saving || loading}
            >
              <option value="RESTO">Resto</option>
              <option value="CENTRAL">Central</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <ExportButton
              onExportExcel={handleExportExcel}
              onExportPDF={handleExportPDF}
              currentRole={activeUser?.role}
              disabled={loading || (activeTab === 'REKAP' ? records.length === 0 : items.length === 0)}
            />
            <PrintButton
              currentRole={activeUser?.role}
              disabled={loading || (activeTab === 'REKAP' ? records.length === 0 : items.length === 0)}
              title="Cetak lembar inventaris harian"
            />

            {isLocked && (
              <button
                type="button"
                className="btn btn-secondary border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={handleUnlock}
                disabled={saving || loading}
                title="Buka kunci formulir EOD untuk revisi"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Unlock size={16} />}
                Buka Kunci (Revisi EOD)
              </button>
            )}

            {activeTab === 'EOD' && !isLocked && (
              <>
                <button
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={handleSave}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Progress (Draf)
                </button>
                <button
                  className="btn"
                  style={{ background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => setPhotoModal({ isOpen: true, bucket: 'closing-photos', contextName: `Closing_EOD_${date}` })}
                >
                  <Camera size={16} />
                  Bukti Closing
                </button>
                <button
                  className="btn"
                  style={{ background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={submitEODSettlement}
                  disabled={saving || loading}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  Kunci Closing EOD
                </button>
              </>
            )}
          </div>
        </div>

        {isLocked && (
          <div className="flex items-center justify-between p-3.5 mb-4 rounded-xl border border-amber-300 bg-amber-50/90 text-amber-900 text-xs">
            <div className="flex items-center gap-2.5">
              <Lock size={16} className="text-amber-600 shrink-0" />
              <div>
                <span className="font-bold">Formulir Terkunci (EOD Closed / Verified).</span> Kolom input dinonaktifkan untuk melindungi data closing akhir hari.
              </div>
            </div>
            <button
              type="button"
              onClick={handleUnlock}
              disabled={saving || loading}
              className="ml-3 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
            >
              <Unlock size={13} />
              Buka Kunci untuk Edit
            </button>
          </div>
        )}

        {error && (
          <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            {success}
          </div>
        )}

        {activeTab === 'EOD' && (
          <div className="no-print mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-1 flex-wrap items-center gap-2" style={{ minWidth: 260 }}>
                <div className="relative flex-1" style={{ minWidth: 220, maxWidth: 460 }}>
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="search"
                    className="form-control w-full pl-9"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Cari nama, SKU, atau kode barang..."
                    aria-label="Cari material Daily Inventory"
                    disabled={loading}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Per halaman
                  <select className="form-control" value={pageSize} onChange={e => setPageSize(Number(e.target.value))} style={{ width: 86 }}>
                    <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                  </select>
                </label>
              </div>
              <button type="button" className="btn btn-secondary" onClick={confirmZeroActivityForUntouched} disabled={isLocked || loading || saving}>
                <CheckCheck size={15} style={{ marginRight: 6 }} /> Konfirmasi OUT = 0 untuk baris kosong
              </button>
            </div>
          </div>
        )}

        <div className="table-container relative" style={{ background: 'var(--bg-secondary)', borderRadius: '8px' }}>
          <TableLoadingOverlay
            loading={loading && (activeTab === 'REKAP' ? records.length > 0 : items.length > 0)}
            message="Menyinkronkan data inventaris harian..."
          />
          {activeTab === 'REKAP' ? (
            <table className="custom-table" style={{ width: '100%', minWidth: '1240px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', minWidth: '220px' }} className="whitespace-nowrap">Barang</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">Stok Awal</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">IN</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">OUT Manual</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">WASTE</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">FULL</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '95px' }} className="whitespace-nowrap">BROKEN</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '100px' }} className="whitespace-nowrap">Stok Akhir</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: '100px' }} className="whitespace-nowrap">Terpakai</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', minWidth: '130px' }} className="whitespace-nowrap">Nilai (Rp)</th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 ? (
                  <TableSkeletonRows
                    rows={6}
                    columns={[
                      { width: '220px', type: 'dual-text' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '130px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  records.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: '12px 16px' }}>
                        <div className="font-semibold text-sm text-[var(--text-primary)]">{row.materials?.name || 'Item Terhapus'}</div>
                        <div className="text-xs text-[var(--text-muted)] whitespace-nowrap mt-0.5">
                          Harga: Rp {(Number(row.materials?.price) || 0).toLocaleString('id-ID')} / {row.materials?.unit || 'unit'}
                        </div>
                      </td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.stok_awal}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.qty_in}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>
                        <div>{row.qty_out}</div>
                      </td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px', color: Number(row.waste) > 0 ? '#dc2626' : 'inherit' }}>{row.waste}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.full_qty}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap" style={{ padding: '12px 10px' }}>{row.broken}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap font-bold" style={{ padding: '12px 10px' }}>{row.stok_akhir}</td>
                      <td className="text-center font-mono tabular-nums whitespace-nowrap font-bold" style={{ padding: '12px 10px', color: row.qty_terpakai < 0 ? '#ef4444' : 'inherit' }}>
                        {row.qty_terpakai}
                      </td>
                      <td className="text-right font-mono tabular-nums whitespace-nowrap font-semibold" style={{ padding: '12px 16px' }}>
                        Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                      <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                      <p style={{ fontWeight: 500, margin: 0 }}>Tidak ada data rekap untuk tanggal ini</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="custom-table" style={{ width: '100%', minWidth: '1120px' }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 16px', textAlign: 'left', minWidth: '220px' }} className="whitespace-nowrap">
                    Bahan Baku
                    <div className="text-[10px] font-normal text-[var(--text-muted)]">Nama & Satuan</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '110px', width: '110px' }} className="whitespace-nowrap">
                    Stok Awal
                    <div className="text-[10px] font-normal text-[var(--text-muted)]">Kemasan Utuh (Full)</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '125px', width: '125px' }} className="whitespace-nowrap">
                    Barang Masuk
                    <div className="text-[10px] font-normal text-[var(--text-muted)]">Total IN (PO/Beli)</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '110px', width: '110px' }} className="whitespace-nowrap">
                    Pemakaian
                    <div className="text-[10px] font-normal text-[var(--text-muted)]">OUT Barista/Dapur</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '135px', width: '135px', background: 'rgba(239,68,68,0.06)' }} className="whitespace-nowrap">
                    Limbah / Rusak
                    <div className="text-[10px] font-normal text-red-600">Catatan Waste</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '105px', width: '105px', background: 'rgba(245,158,11,0.06)' }} className="whitespace-nowrap">
                    Sisa Utuh
                    <div className="text-[10px] font-normal text-amber-700">Kemasan (Full)</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '110px', width: '110px', background: 'rgba(16,185,129,0.06)' }} className="whitespace-nowrap">
                    Stok Akhir
                    <div className="text-[10px] font-normal text-emerald-700">Estimasi Sistem</div>
                  </th>
                  <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: '105px', width: '105px', background: 'rgba(139,92,246,0.06)' }} className="whitespace-nowrap">
                    Total Terpakai
                    <div className="text-[10px] font-normal text-purple-700">Hari Ini</div>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', minWidth: '140px', width: '140px' }} className="whitespace-nowrap">
                    Biaya HPP (Rp)
                    <div className="text-[10px] font-normal text-[var(--text-muted)]">Nilai Pemakaian</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <TableSkeletonRows
                    rows={8}
                    columns={[
                      { width: '220px', type: 'dual-text' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '125px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '130px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '100px', type: 'text', align: 'center' },
                      { width: '105px', type: 'text', align: 'center' },
                      { width: '135px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  paginatedItems.map((item, idx) => {
                    const row = inventory[item.id] || {};
                    const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
                    const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
                    const qtyOut = Number(row.qty_out) || 0;
                    // Keep this value in the row-render scope; it is used by the OUT input placeholder.
                    // A zero value is only considered confirmed when the explicit zero-confirmation flag is set.
                    const outConfirmed = Boolean(row.out_confirmed)
                      || row.zero_activity_confirmed === true
                      || (row.qty_out !== '' && row.qty_out !== null && row.qty_out !== undefined);
                    const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
                    const stokAkhir = metrics.closing;
                    const qtyTerpakai = qtyOut;
                    const openingBroken = row.opening_broken_qty == null ? 0 : Number(row.opening_broken_qty) || 0;
                    const inferredOpening = calculateInferredFullFromBroken(item, stokAwal, openingBroken);
                    const savedOpeningFull = row.opening_full_qty === null || row.opening_full_qty === undefined || row.opening_full_qty === ''
                      ? null : Number(row.opening_full_qty);
                    // Both opening FULL and current FULL use package-count units. Never
                    // fall back to raw ml/g stock balance, which made the two columns
                    // show incomparable values such as 1450 versus 1.
                    const displayOpeningFull = inferredOpening?.fullQty ?? (Number.isFinite(savedOpeningFull) ? savedOpeningFull : 0);
                    const unitPrice = metrics.unitCost;
                    const nilaiRupiah = metrics.usageValue;

                    // FEFO Expiry (H-3)
                    const expDate = item.next_expiry_date || '';
                    const fefo = getExpiryColor(expDate);
                    const isExpiringSoon = fefo?.color === 'red';

                    return (
                      <tr key={item.id} style={{ background: fefo?.color === 'red' ? 'rgba(239,68,68,0.1)' : fefo?.color === 'yellow' ? 'rgba(245,158,11,0.1)' : fefo?.color === 'green' ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[var(--text-primary)]">{item.name}</span>
                            {fefo && (
                              <span style={{ fontWeight: 700, fontSize: '10px', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', background: fefo.color === 'red' ? '#fee2e2' : fefo.color === 'yellow' ? '#fef08a' : '#bbf7d0', color: fefo.color === 'red' ? '#b91c1c' : fefo.color === 'yellow' ? '#854d0e' : '#166534' }}>
                                {fefo.label} {fefo.days} hari
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] whitespace-nowrap mt-0.5">
                            Rp {unitPrice.toLocaleString('id-ID')} / {item.unit || 'unit'}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled
                            className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2"
                            style={{ width: '100%', minWidth: '75px' }}
                            value={displayOpeningFull}
                            readOnly
                            aria-label={`Stok awal dalam FULL untuk ${item.name}`}
                            title="Jumlah kemasan utuh dari saldo awal; dihitung berdasarkan ukuran kemasan master."
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, idx, 1, 'stok_awal')}
                            data-row={idx}
                            data-col={1}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            disabled={isLocked}
                            className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2"
                            style={{ width: '100%', minWidth: '70px' }}
                            title="Masukkan total IN hari ini. Penerimaan Purchasing/transfer sudah termasuk; sistem hanya menyimpan selisih manualnya."
                            value={row.manual_in_total_input ?? String(Number(((Number(row.qty_in) || 0) + (Number(row.manual_in_qty) || 0)).toFixed(4)))}
                            onChange={e => handleChange(item.id, 'in_total_input', e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, idx, 2, 'manual_in_qty')}
                            data-row={idx}
                            data-col={2}
                            placeholder="0"
                            aria-label={`Total IN ${item.name}`}
                          />
                          {item.expiry_tracking_enabled && (
                            <details className="text-left mt-1" style={{ fontSize: '11px' }}>
                              <summary className="cursor-pointer font-semibold text-amber-700 select-none">Kelola lot IN ({(row.manual_in_lots || []).length})</summary>
                              <div className="mt-2 rounded-md border p-2 flex flex-col gap-2" style={{ minWidth: '250px', background: 'var(--surface-card, white)' }}>
                                {(row.manual_in_lots || []).map((lot, lotIdx) => (
                                  <div key={lot.lot_key || lotIdx} className="rounded border p-2 flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold">Lot {lotIdx + 1}</span>
                                      <button type="button" disabled={isLocked} className="text-red-600" onClick={() => removeManualInLot(item.id, lot.lot_key)} aria-label={`Hapus lot ${lotIdx + 1}`}><X size={14}/></button>
                                    </div>
                                    <input type="text" className="form-control text-xs py-1 px-2" placeholder="Nomor batch (opsional)" value={lot.batch_no || ''} disabled={isLocked} onChange={e => changeManualInLot(item.id, lot.lot_key, 'batch_no', e.target.value)} aria-label={`Nomor batch ${lotIdx + 1}`}/>
                                    <input type="date" className="form-control text-xs py-1 px-2" value={lot.expiry_date || ''} disabled={isLocked} onChange={e => changeManualInLot(item.id, lot.lot_key, 'expiry_date', e.target.value)} aria-label={`Expired date lot ${lotIdx + 1}`} />
                                    <input type="number" min="0" step="any" className="form-control text-xs py-1 px-2 text-right" placeholder={`Qty (${item.unit || 'unit'})`} value={lot.qty ?? ''} disabled={isLocked} onChange={e => changeManualInLot(item.id, lot.lot_key, 'qty', e.target.value)} aria-label={`Kuantitas lot ${lotIdx + 1}`} />
                                  </div>
                                ))}
                                <button type="button" className="btn btn-secondary text-xs py-1.5" disabled={isLocked} onClick={() => addManualInLot(item.id)}>+ Tambah lot</button>
                                <div className="text-right text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Total lot: {(row.manual_in_lots || []).reduce((sum, lot) => sum + (Number(lot.qty) > 0 ? Number(lot.qty) : 0), 0).toLocaleString('id-ID')} {item.unit || ''}</div>
                                <button type="button" className="btn btn-secondary text-xs py-1.5" disabled={isLocked} onClick={() => setManualInToLotTotal(item.id)}>Gunakan total lot</button>
                              </div>
                            </details>
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={isLocked}
                            className="form-control text-center font-mono tabular-nums text-sm py-1.5 px-2"
                            style={{ width: '100%', minWidth: '75px' }}
                            value={row.qty_out ?? ''}
                            onChange={e => handleChange(item.id, 'qty_out', e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, idx, 3, 'qty_out')}
                            data-row={idx}
                            data-col={3}
                            placeholder={outConfirmed ? 'Terkonfirmasi' : '0'}
                          />
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(239,68,68,0.05)' }}>
                          <div className="flex items-center justify-center gap-1.5 w-full flex-wrap">
                            <span className="font-mono tabular-nums text-sm font-bold text-red-600">
                              {row.waste ? Number(row.waste).toLocaleString('id-ID') : '0'}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">{item.unit || ''}</span>
                            {!isLocked && (
                              <button
                                type="button"
                                onClick={() => openWasteModal(item)}
                                title={`Catat limbah / waste untuk ${item.name}`}
                                className="px-2 py-1 rounded-md text-[11px] font-bold text-red-700 bg-red-100 hover:bg-red-200 transition-colors shadow-xs ml-1 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <Plus size={12} /> Catat
                              </button>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px', background: 'rgba(245,158,11,0.05)' }}>
                          <div className="text-center font-mono tabular-nums text-sm py-2 font-bold text-amber-800">
                            {metrics.fullQty === null ? '—' : metrics.fullQty.toLocaleString('id-ID')}
                          </div>
                        </td>
                        <td className="text-center font-mono tabular-nums font-bold whitespace-nowrap" style={{ padding: '12px 10px', background: 'rgba(16,185,129,0.05)', color: metrics.reconciliationRequired ? '#b45309' : '#047857' }}>
                          {stokAkhir === null ? 'Perlu tinjau' : Number(stokAkhir).toLocaleString('id-ID')}
                        </td>
                        <td className="text-center font-mono tabular-nums font-bold whitespace-nowrap" style={{ padding: '12px 10px', background: 'rgba(139,92,246,0.05)', color: qtyTerpakai < 0 ? '#ef4444' : '#6d28d9' }}>
                          <div>{qtyTerpakai}</div>
                        </td>
                        <td className="text-right font-mono tabular-nums font-semibold whitespace-nowrap" style={{ padding: '12px 16px' }}>
                          Rp {nilaiRupiah.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })
                )}
                {!loading && items.length > 0 && filteredItems.length === 0 && (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Tidak ada material yang cocok dengan pencarian “{searchTerm}”.</td></tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
                      <div style={{ maxWidth: '420px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Package size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '6px', color: 'var(--text-primary)' }}>
                          Belum Ada Master Bahan Baku
                        </p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                          Daftar material dimuat dari Master Bahan Baku. Penerimaan yang sudah tercatat di Purchasing atau transfer ikut terhitung otomatis.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination di Bawah Tabel */}
        {activeTab === 'EOD' && filteredItems.length > 0 && (
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-xl border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Menampilkan <strong>{(visiblePage - 1) * pageSize + 1}–{Math.min(visiblePage * pageSize, filteredItems.length)}</strong> dari <strong>{filteredItems.length}</strong> bahan baku
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={visiblePage <= 1}
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft size={14} /> Sebelumnya
              </button>
              <span className="text-xs font-semibold px-2">Halaman {visiblePage} / {totalPages}</span>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                style={{ padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={visiblePage >= totalPages}
                aria-label="Halaman berikutnya"
              >
                Selanjutnya <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Sticky Floating Action Bar di Bawah */}
        {activeTab === 'EOD' && !isLocked && (
          <div className="no-print sticky bottom-3 z-30 mt-4 p-3.5 rounded-2xl border shadow-xl flex flex-wrap items-center justify-between gap-3" style={{ background: 'rgba(255, 255, 255, 0.96)', backdropFilter: 'blur(10px)', borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2 text-xs">
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                  <Loader2 size={15} className="animate-spin" /> Menyimpan draft otomatis...
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <Check size={14} /> Draft tersimpan otomatis {lastSavedTime ? `(pk ${lastSavedTime})` : ''}
                </span>
              )}
              {autoSaveStatus === 'dirty' && (
                <span className="flex items-center gap-1.5 text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  <Clock size={14} /> Ada perubahan baru (auto-save dalam 5 dtk)...
                </span>
              )}
              {(autoSaveStatus === 'idle' || autoSaveStatus === 'error') && (
                <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                  <Clock size={14} /> {lastSavedTime ? `Draft terakhir tersimpan pk ${lastSavedTime}` : 'Otomatis menyimpan draft tiap 5 detik jeda input'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="btn btn-secondary text-xs font-semibold"
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleSave}
                disabled={saving || loading}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Simpan Draft
              </button>
              <button
                type="button"
                className="btn text-xs font-semibold"
                style={{ background: '#059669', color: '#fff', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={submitEODSettlement}
                disabled={saving || loading}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                Closing Harian (EOD)
              </button>
            </div>
          </div>
        )}

        {showClosingPreview && closingPreview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-labelledby="closing-preview-title">
            <div className="w-full max-w-3xl rounded-2xl bg-[var(--bg-secondary)] shadow-2xl" style={{ maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
              <div className="sticky top-0 flex items-start justify-between gap-3 border-b p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <div>
                  <h2 id="closing-preview-title" className="text-lg font-bold">Preview Closing EOD</h2>
                  <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{date} · {location} · {closingPreview.total} material</p>
                </div>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowClosingPreview(false); setLotOverrideReason(''); }} aria-label="Tutup preview"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4">
                {[{ label: 'OUT dikonfirmasi', value: `${closingPreview.outConfirmed}/${closingPreview.total}` }, { label: 'OUT nol', value: closingPreview.zeros }, { label: 'BROKEN lengkap', value: `${closingPreview.brokenConfirmed}/${closingPreview.total}` }, { label: 'Butuh pemeriksaan', value: closingPreview.blockers.length }].map(card => (
                  <div key={card.label} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{card.label}</div>
                    <div className="mt-1 text-xl font-bold tabular-nums">{card.value}</div>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Eye size={16} /> Hasil yang akan disimpan</div>
                <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-3"><span>Nilai pemakaian OUT aktual</span><strong>Rp {closingPreview.rows.reduce((sum, row) => sum + (Number(row.metrics.usageValue) || 0), 0).toLocaleString('id-ID')}</strong></div>
                  <div className="mt-2 flex items-center justify-between gap-3"><span>Total WASTE (nilai qty di sini, bukan nilai rupiah)</span><strong>{closingPreview.rows.reduce((sum, row) => sum + (Number(row.row.waste) || 0), 0).toLocaleString('id-ID')}</strong></div>
                  <div className="mt-2 flex items-center justify-between gap-3"><span>Material dengan selisih/exception</span><strong>{closingPreview.reconciliationCount}</strong></div>
                </div>
              </div>
              {closingPreview.lotExceptions?.length > 0 && (
                <div className="px-4 pb-4">
                  <div className="rounded-xl border p-3" style={{ borderColor: '#f59e0b', background: 'rgba(245,158,11,0.08)' }}>
                    <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} /> Exception lot / FEFO</div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {canApproveLotOverride ? 'Sebagai manager/supervisor, tinjau daftar lot di bawah dan isi alasan bila menyetujui penutupan dengan data lot yang belum terverifikasi atau lot aktif yang bukan expiry terdekat.' : 'Closing memerlukan manager/supervisor untuk meninjau dan menyetujui exception lot.'}
                    </p>
                    {canApproveLotOverride && (
                      <textarea className="form-control mt-2 w-full" rows={2} value={lotOverrideReason} onChange={e => setLotOverrideReason(e.target.value)} placeholder="Alasan persetujuan / hasil verifikasi lot wajib diisi..." aria-label="Alasan persetujuan exception lot" />
                    )}
                    <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                      {closingPreview.lotExceptions.map(entry => (
                        <div key={entry.id} className="flex items-start justify-between gap-3 text-xs">
                          <span className="font-semibold">{entry.name}</span>
                          <span className="text-right" style={{ color: 'var(--text-secondary)' }}>{entry.warnings.join(' · ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="px-4 pb-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} /> Item yang harus ditangani</div>
                {closingPreview.blockers.length === 0 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Semua konfirmasi wajib terisi dan perhitungan FULL/BROKEN lolos validasi. Kamu dapat melanjutkan closing.</div>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {closingPreview.blockers.slice(0, 50).map(row => (
                      <div key={row.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border)' }}>
                        <div className="text-sm font-semibold">{row.name}</div>
                        <div className="mt-1 text-xs text-amber-700">{row.issues.join(' · ')}</div>
                      </div>
                    ))}
                    {closingPreview.blockers.length > 50 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Dan {closingPreview.blockers.length - 50} item lainnya.</div>}
                  </div>
                )}
              </div>
              <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t p-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowClosingPreview(false)} disabled={saving}>Kembali ke input</button>
                <button type="button" className="btn" style={{ background: closingPreview.blockers.length ? '#9ca3af' : '#059669', color: '#fff' }} onClick={confirmClosingFromPreview} disabled={saving || loading || closingPreview.blockers.length > 0}>
                  {saving ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Lock size={15} className="mr-2" />} Sahkan & Kunci EOD
                </button>
              </div>
            </div>
          </div>
        )}

        <PhotoUploaderModal 
          isOpen={photoModal.isOpen} 
          onClose={() => setPhotoModal({ isOpen: false, bucket: '', contextName: '' })} 
          bucket={photoModal.bucket}
          contextName={photoModal.contextName}
        />

        {/* Quick Record Waste Modal */}
        {wasteModal.isOpen && wasteModal.item && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-2xl bg-[var(--bg-secondary)] shadow-2xl p-5 border" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h3 className="text-base font-bold text-red-600 flex items-center gap-2 m-0">
                    <Trash2 size={18} /> Catat Limbah / Waste
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 mb-0">
                    Bahan: <strong>{wasteModal.item.name}</strong> ({wasteModal.item.unit})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeWasteModal}
                  disabled={wasteModal.submitting}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {wasteModal.error && (
                <div className="mt-3 p-2.5 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200">
                  {wasteModal.error}
                </div>
              )}

              <form onSubmit={handleSaveWasteFromModal} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                    Jumlah Limbah / Terbuang ({wasteModal.item.unit}) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    autoFocus
                    placeholder="Contoh: 150 atau 2"
                    value={wasteModal.qty}
                    onChange={e => setWasteModal(prev => ({ ...prev, qty: e.target.value }))}
                    className="form-control w-full text-base font-bold py-2 px-3 text-red-600 font-mono"
                    disabled={wasteModal.submitting}
                  />
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                    Masukkan jumlah bahan yang terbuang dalam satuan <strong>{wasteModal.item.unit}</strong>.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                    Kategori Limbah
                  </label>
                  <select
                    value={wasteModal.type}
                    onChange={e => setWasteModal(prev => ({ ...prev, type: e.target.value }))}
                    className="form-control w-full text-xs py-2 px-2.5"
                    disabled={wasteModal.submitting}
                  >
                    <option value="WASTE">Basi / Penurunan Kualitas (Spoilage)</option>
                    <option value="BREAKAGE">Pecah / Rusak Fisik (Breakage)</option>
                    <option value="EXPIRED">Kadaluarsa (Expired)</option>
                    <option value="COMP">Tester / Complimentary (Comp)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                    Penyebab / Alasan
                  </label>
                  <select
                    value={wasteModal.reason}
                    onChange={e => setWasteModal(prev => ({ ...prev, reason: e.target.value }))}
                    className="form-control w-full text-xs py-2 px-2.5"
                    disabled={wasteModal.submitting}
                  >
                    <option value="Tumpah / Salah Racik (Spoilage)">Tumpah / Salah Racik (Spoilage)</option>
                    <option value="Basi / Bau Asam">Basi / Bau Asam</option>
                    <option value="Lewat Expired Date">Lewat Expired Date</option>
                    <option value="Pecah Saat Handling">Pecah Saat Handling</option>
                    <option value="Susut Trimming Kitchen">Susut Trimming Kitchen</option>
                    <option value="Kualitas Drop dari Supplier">Kualitas Drop dari Supplier</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-[var(--text-secondary)]">
                    Catatan Tambahan (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Contoh: Tumpah saat rush hour siang..."
                    value={wasteModal.notes}
                    onChange={e => setWasteModal(prev => ({ ...prev, notes: e.target.value }))}
                    className="form-control w-full text-xs py-1.5 px-2.5"
                    disabled={wasteModal.submitting}
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button
                    type="button"
                    onClick={closeWasteModal}
                    disabled={wasteModal.submitting}
                    className="btn btn-secondary text-xs px-3.5 py-2 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={wasteModal.submitting || !wasteModal.qty || Number(wasteModal.qty) <= 0}
                    className="btn text-xs font-semibold px-4 py-2 flex items-center gap-1.5 cursor-pointer"
                    style={{ background: '#dc2626', color: '#fff' }}
                  >
                    {wasteModal.submitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {wasteModal.submitting ? 'Menyimpan...' : 'Simpan ke Catatan Limbah'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
