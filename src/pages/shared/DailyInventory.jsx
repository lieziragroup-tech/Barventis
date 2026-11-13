import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getExpiryColor } from '../../utils/expiryColor';
import { Calendar, FileText, PlusCircle, Save, Loader2, Lock, Unlock, Info, Package, Camera, HelpCircle, ChevronDown, X, AlertCircle, Search, ChevronLeft, ChevronRight, CheckCheck, Eye, AlertTriangle, Plus, Check, Clock, Trash2, ArrowLeftRight, FlaskConical } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import ExportButton from '../../components/shared/ExportButton';
import PrintButton from '../../components/shared/PrintButton';
import { exportWithAudit } from '../../services/export/exportAudit';
import { TableSkeletonRows, TableLoadingOverlay } from '../../components/shared/TableSkeleton';
import PhotoUploaderModal from '../../components/shared/PhotoUploaderModal';
import { calculateDailyInventoryMetrics, calculateInferredFullFromBroken, convertQtyToStockUnit, getBrokenUnitLabel, isBrokenTrackingEnabled, getLocalDateISO, manualInDeltaFromTotal } from '../../services/dailyInventoryMath';
import { parseTwoTierConfig } from '../../components/shared/TwoTierConversionEditor';

export function isPrepOutputMaterial(item) {
  if (!item) return false;
  if (item.is_prep_output === true) return true;
  const cat = String(item.category || '').toLowerCase();
  if (cat.includes('olahan') || cat.includes('prep') || cat.includes('batching')) return true;
  return false;
}

const normalizeUnitFamilyKey = (u) => {
  const s = String(u || '').trim().toLowerCase();
  if (['g', 'gr', 'grm', 'gram', 'grams'].includes(s)) return 'gr';
  if (['l', 'ltr', 'liter', 'litre', 'liters', 'litres'].includes(s)) return 'l';
  if (['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres'].includes(s)) return 'ml';
  if (['pc', 'pcs', 'piece', 'pieces', 'unit', 'units'].includes(s)) return 'pcs';
  return s;
};

export function resolveOutUnitCapabilities(item) {
  const packUnit = String(item?.unit || 'unit').trim() || 'unit';
  const twoTier = parseTwoTierConfig(packUnit, item?.full_pack);
  const candidateContentUnit = getBrokenUnitLabel(item) || twoTier.contentUnit || packUnit;
  const sameUnit = normalizeUnitFamilyKey(packUnit) === normalizeUnitFamilyKey(candidateContentUnit);
  let hasTwoUnits = false;
  if (twoTier.hasTwoTier && candidateContentUnit && !sameUnit) {
    try {
      const converted = convertQtyToStockUnit(item, Number(twoTier.contentQty) || 1, candidateContentUnit);
      hasTwoUnits = Number.isFinite(converted) && converted > 0;
    } catch {
      hasTwoUnits = false;
    }
  }
  const contentUnit = hasTwoUnits ? candidateContentUnit : packUnit;
  const defaultOutUnit = hasTwoUnits && isBrokenTrackingEnabled(item) ? contentUnit : packUnit;
  return {
    packUnit,
    contentUnit,
    contentQty: twoTier.contentQty,
    hasTwoUnits,
    defaultOutUnit,
  };
}

export function evaluatePosComparison(item, actualOutStockQty, posEntry) {
  const posStockQty = Number(posEntry?.theoretical_stock_qty) || 0;
  const posRecipeQty = Number(posEntry?.theoretical_recipe_qty) || 0;
  const recipeUnit = posEntry?.recipe_unit || getBrokenUnitLabel(item) || item?.unit || 'unit';
  const stockUnit = item?.unit || 'unit';
  const actualStock = Number.isFinite(Number(actualOutStockQty)) ? Number(actualOutStockQty) : 0;

  if (posStockQty <= 0.0001) {
    return {
      hasPosSales: false,
      status: 'NO_POS',
      diffStockQty: 0,
      posStockQty: 0,
      posRecipeQty: 0,
      recipeUnit,
      stockUnit,
      label: 'POS: 0',
      menuBreakdown: [],
    };
  }

  if (actualStock <= 0.0001) {
    return {
      hasPosSales: true,
      status: 'MISSING_OUT',
      diffStockQty: Number((-posStockQty).toFixed(4)),
      posStockQty: Number(posStockQty.toFixed(4)),
      posRecipeQty: Number(posRecipeQty.toFixed(2)),
      recipeUnit,
      stockUnit,
      label: 'Terjual di POS, Belum Input OUT',
      menuBreakdown: posEntry?.menu_breakdown || [],
    };
  }

  const diffStockQty = Number((actualStock - posStockQty).toFixed(4));
  const tolerance = Math.max(0.02, posStockQty * 0.03);
  if (Math.abs(diffStockQty) <= tolerance) {
    return {
      hasPosSales: true,
      status: 'MATCH',
      diffStockQty,
      posStockQty: Number(posStockQty.toFixed(4)),
      posRecipeQty: Number(posRecipeQty.toFixed(2)),
      recipeUnit,
      stockUnit,
      label: 'Cocok POS',
      menuBreakdown: posEntry?.menu_breakdown || [],
    };
  }

  const sign = diffStockQty > 0 ? '+' : '';
  return {
    hasPosSales: true,
    status: 'DIFF',
    diffStockQty,
    posStockQty: Number(posStockQty.toFixed(4)),
    posRecipeQty: Number(posRecipeQty.toFixed(2)),
    recipeUnit,
    stockUnit,
    label: `Selisih ${sign}${Number(diffStockQty.toFixed(2))} ${stockUnit}`,
    menuBreakdown: posEntry?.menu_breakdown || [],
  };
}

export function computeVirtualWindow({
  totalCount,
  scrollTop = 0,
  viewportHeight = 560,
  rowHeight = 64,
  overscan = 6,
  enabled = true,
}) {
  const safeTotal = Math.max(0, Number(totalCount) || 0);
  if (!enabled || safeTotal <= 15) {
    return {
      isVirtualized: false,
      startIndex: 0,
      endIndex: safeTotal,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }
  const safeRowHeight = Math.max(24, Number(rowHeight) || 64);
  const safeScrollTop = Math.max(0, Number(scrollTop) || 0);
  const safeViewport = Math.max(200, Number(viewportHeight) || 560);
  const safeOverscan = Math.max(1, Number(overscan) || 6);

  const visibleCount = Math.ceil(safeViewport / safeRowHeight);
  const rawStart = Math.floor(safeScrollTop / safeRowHeight);
  const startIndex = Math.max(0, rawStart - safeOverscan);
  const endIndex = Math.min(safeTotal, rawStart + visibleCount + safeOverscan);
  const topSpacerHeight = startIndex * safeRowHeight;
  const bottomSpacerHeight = Math.max(0, (safeTotal - endIndex) * safeRowHeight);

  return {
    isVirtualized: true,
    startIndex,
    endIndex,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}

export function getInventoryRowMetrics(item, row = {}, strict = false) {
  const opening = Number(row.stok_awal) || 0;
  const incoming = Number(row.qty_in) || 0; // IN sourced automatically from Purchasing/transfers
  const manualInInput = row.manual_in_qty === '' || row.manual_in_qty == null ? 0 : Number(row.manual_in_qty);
  const manualIn = Number.isFinite(manualInInput) ? manualInInput : Number.NaN;
  const brokenTracking = isBrokenTrackingEnabled(item);
  const inputOut = row.qty_out === '' || row.qty_out == null ? 0 : Number(row.qty_out) || 0;
  const { packUnit, hasTwoUnits, defaultOutUnit } = resolveOutUnitCapabilities(item);
  const outUnit = (hasTwoUnits && row.out_unit) ? row.out_unit : defaultOutUnit;
  let out = 0;
  try {
    out = row.qty_out === '' || row.qty_out == null ? 0 : convertQtyToStockUnit(item, inputOut, outUnit);
  } catch {
    try {
      out = row.qty_out === '' || row.qty_out == null ? 0 : convertQtyToStockUnit(item, inputOut, packUnit);
    } catch {
      out = Number.NaN;
    }
  }
  const productionUsage = Number(row.production_usage_qty) || 0; // retained for legacy transactions only
  const waste = Number(row.waste) || 0;
  let manualInStockQty = 0;
  try {
    manualInStockQty = Number.isFinite(manualIn) ? convertQtyToStockUnit(item, manualIn, item?.unit) : Number.NaN;
  } catch {
    manualInStockQty = Number.NaN;
  }
  const baseMovement = row.net_stock_movement;
  const effectiveNetMovement = baseMovement !== null && baseMovement !== undefined
    ? Number(baseMovement) + (Number.isFinite(manualInStockQty) ? manualInStockQty : 0)
    : null;
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
  const brokenForValidation = brokenInput !== null && Number.isFinite(brokenInput) ? brokenInput : 0;
  const inferred = calculateInferredFullFromBroken(item, bookClosing, brokenForValidation);
  const reconciliationRequired = !Number.isFinite(out) || !Number.isFinite(manualInStockQty) || manualIn < 0 || bookClosing < -0.0001 || (brokenTracking && brokenConfirmed && inferred && !inferred.valid);
  const closingValid = !reconciliationRequired && Number.isFinite(out) && Number.isFinite(bookClosing) && bookClosing >= -0.0001;
  const metrics = calculateDailyInventoryMetrics({
    opening,
    incoming: incoming + (Number.isFinite(manualInStockQty) ? manualInStockQty : 0),
    netMovement: effectiveNetMovement,
    out,
    productionUsage,
    waste,
    closing: bookClosing,
  });
  const unitCost = Number(row.cost_per_unit ?? row.unit_cost_snapshot ?? item?.avg_cost ?? item?.price) || 0;
  if (strict && reconciliationRequired) {
    throw new Error(inferred?.reason || (Number.isFinite(out) ? `Saldo akhir buku untuk ${item?.name || 'material'} negatif. Periksa mutasi sebelum closing.` : `Satuan OUT untuk ${item?.name || 'material'} tidak dapat dikonversi.`));
  }
  return {
    ...metrics,
    stockBasedUsage: metrics.stockBasedUsage,
    usageVariance: metrics.usageVariance,
    outInput: inputOut,
    outUnit,
    closing: closingValid ? Number(Math.max(0, bookClosing).toFixed(4)) : null,
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
    usageValue: (Number.isFinite(out) ? out : 0) * unitCost,
    outStockQty: Number.isFinite(out) ? out : null,
    counted: brokenConfirmed,
  };
}

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
  const [quickFilter, setQuickFilter] = useState('ALL'); // 'ALL' | 'POS_DIFF' | 'PREP_ONLY'
  const [posUsageMap, setPosUsageMap] = useState({});
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [showClosingPreview, setShowClosingPreview] = useState(false);
  const [closingPreview, setClosingPreview] = useState(null);
  const [lotOverrideReason, setLotOverrideReason] = useState('');

  // Virtual Scrolling / Windowing State for Large Datasets
  const tableContainerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(560);
  const [isPrinting, setIsPrinting] = useState(false);

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
  const performSaveRef = useRef(null);
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

  // Keep refs synchronized
  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);
  useEffect(() => {
    activeUserRef.current = activeUser;
  }, [activeUser]);

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
    } catch (_e) {
      /* ignore localStorage removal errors */
    }
  }, [getLocalDraftKey, date, location]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, quickFilter, pageSize, date, location]);

  useEffect(() => {
    setScrollTop(0);
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [currentPage, debouncedSearch, quickFilter, pageSize, date, location, activeTab]);

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const getItemOutStockQty = useCallback((item) => {
    const row = inventory[item.id] || {};
    if (row.qty_out === '' || row.qty_out == null) return 0;
    const inputOut = Number(row.qty_out) || 0;
    const { packUnit, hasTwoUnits, defaultOutUnit } = resolveOutUnitCapabilities(item);
    const outUnit = (hasTwoUnits && row.out_unit) ? row.out_unit : defaultOutUnit;
    try {
      return convertQtyToStockUnit(item, inputOut, outUnit);
    } catch {
      try {
        return convertQtyToStockUnit(item, inputOut, packUnit);
      } catch {
        return inputOut;
      }
    }
  }, [inventory]);

  const posDiffCount = useMemo(() => {
    if (activeTab === 'REKAP') {
      return records.filter(row => {
        const mat = row.materials || {};
        const comp = evaluatePosComparison(mat, Number(row.qty_out) || 0, posUsageMap[row.material_id || mat.id]);
        return comp.status === 'MISSING_OUT' || comp.status === 'DIFF';
      }).length;
    }
    return items.filter(item => {
      const comp = evaluatePosComparison(item, getItemOutStockQty(item), posUsageMap[item.id]);
      return comp.status === 'MISSING_OUT' || comp.status === 'DIFF';
    }).length;
  }, [activeTab, records, items, posUsageMap, getItemOutStockQty]);

  const prepCount = useMemo(() => {
    if (activeTab === 'REKAP') {
      return records.filter(row => isPrepOutputMaterial(row.materials)).length;
    }
    return items.filter(item => isPrepOutputMaterial(item)).length;
  }, [activeTab, records, items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (debouncedSearch) {
        const matchesSearch = [item.name, item.sku, item.item_code, item.category]
          .some(value => String(value || '').toLowerCase().includes(debouncedSearch));
        if (!matchesSearch) return false;
      }
      if (quickFilter === 'PREP_ONLY') {
        return isPrepOutputMaterial(item);
      }
      if (quickFilter === 'POS_DIFF') {
        const comp = evaluatePosComparison(item, getItemOutStockQty(item), posUsageMap[item.id]);
        return comp.status === 'MISSING_OUT' || comp.status === 'DIFF';
      }
      return true;
    });
  }, [items, debouncedSearch, quickFilter, getItemOutStockQty, posUsageMap]);

  const filteredRecords = useMemo(() => {
    return records.filter(row => {
      if (debouncedSearch) {
        const matchesSearch = [row.materials?.name, row.materials?.sku, row.materials?.category]
          .some(value => String(value || '').toLowerCase().includes(debouncedSearch));
        if (!matchesSearch) return false;
      }
      if (quickFilter === 'PREP_ONLY') {
        return isPrepOutputMaterial(row.materials);
      }
      if (quickFilter === 'POS_DIFF') {
        const mat = row.materials || {};
        const comp = evaluatePosComparison(mat, Number(row.qty_out) || 0, posUsageMap[row.material_id || mat.id]);
        return comp.status === 'MISSING_OUT' || comp.status === 'DIFF';
      }
      return true;
    });
  }, [records, debouncedSearch, quickFilter, posUsageMap]);

  const activeTotalCount = activeTab === 'REKAP' ? filteredRecords.length : filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(activeTotalCount / pageSize));
  const visiblePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (visiblePage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, visiblePage, pageSize]);

  const paginatedRecords = useMemo(() => {
    const start = (visiblePage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, visiblePage, pageSize]);

  const eodVirtualWindow = useMemo(() => computeVirtualWindow({
    totalCount: paginatedItems.length,
    scrollTop,
    viewportHeight,
    rowHeight: 64,
    overscan: 6,
    enabled: !isPrinting,
  }), [paginatedItems.length, scrollTop, viewportHeight, isPrinting]);

  const rekapVirtualWindow = useMemo(() => computeVirtualWindow({
    totalCount: paginatedRecords.length,
    scrollTop,
    viewportHeight,
    rowHeight: 52,
    overscan: 6,
    enabled: !isPrinting,
  }), [paginatedRecords.length, scrollTop, viewportHeight, isPrinting]);

  const visibleEodItems = useMemo(
    () => paginatedItems.slice(eodVirtualWindow.startIndex, eodVirtualWindow.endIndex),
    [paginatedItems, eodVirtualWindow.startIndex, eodVirtualWindow.endIndex]
  );

  const visibleRekapRecords = useMemo(
    () => paginatedRecords.slice(rekapVirtualWindow.startIndex, rekapVirtualWindow.endIndex),
    [paginatedRecords, rekapVirtualWindow.startIndex, rekapVirtualWindow.endIndex]
  );

  const handleTableScroll = useCallback((e) => {
    const target = e.currentTarget;
    if (!target) return;
    setScrollTop(target.scrollTop);
    if (target.clientHeight && target.clientHeight !== viewportHeight) {
      setViewportHeight(target.clientHeight);
    }
  }, [viewportHeight]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, posMap] = await Promise.all([
        api.getDailyInventoryRecords(date, location),
        api.getDailyPosTheoreticalUsage ? api.getDailyPosTheoreticalUsage(date) : Promise.resolve({})
      ]);
      setPosUsageMap(posMap || {});
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
      const [{ items: materialsList, inventory: invMap, isLocked: lockFlag }, posMap] = await Promise.all([
        api.getDailyInventoryEodData(date, location),
        api.getDailyPosTheoreticalUsage ? api.getDailyPosTheoreticalUsage(date) : Promise.resolve({})
      ]);
      setPosUsageMap(posMap || {});
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
                    ...(locRow.out_unit !== undefined ? { out_unit: locRow.out_unit } : {}),
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
        } catch (_parseErr) {
          /* ignore malformed localStorage draft */
        }
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
        const sourceInQty = Number(existing.qty_in ?? initialItem?.qty_in) || 0;
        nextRow.manual_in_total_input = parsedValue;
        nextRow.manual_in_qty = parsedValue === ''
          ? -sourceInQty
          : manualInDeltaFromTotal(parsedValue, sourceInQty);
      }
      if (field === 'qty_out') {
        nextRow.out_confirmed = parsedValue !== '';
        nextRow.zero_activity_confirmed = parsedValue !== '' && Number(parsedValue) === 0;
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

  const handleToggleOutUnit = (item, targetUnit) => {
    if (isLocked || !item) return;
    setInventory(prev => {
      const existing = prev[item.id] || {};
      const nextRow = {
        ...existing,
        out_unit: targetUnit,
      };
      saveDraftToLocalStorage({ ...prev, [item.id]: nextRow });
      return { ...prev, [item.id]: nextRow };
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
      if (nextRow < 0 || nextRow >= paginatedItems.length) return;
      const focusTargetInput = () => {
        const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${colIndex}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
          return true;
        }
        return false;
      };
      if (focusTargetInput()) return;
      if (tableContainerRef.current) {
        const targetScrollTop = Math.max(0, nextRow * 64 - 160);
        tableContainerRef.current.scrollTop = targetScrollTop;
        setScrollTop(targetScrollTop);
        requestAnimationFrame(() => {
          focusTargetInput();
        });
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

        {/* Minimalist Search, Filter & Quick Pagination Toolbar */}
        <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2.5 py-2 px-3 rounded-xl border" style={{ borderColor: 'var(--border)', background: '#f8fafc' }}>
          <div className="flex flex-1 flex-wrap items-center gap-2" style={{ minWidth: 240 }}>
            <div className="relative flex-1" style={{ minWidth: 190, maxWidth: 320 }}>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="search"
                className="form-control w-full pl-8 py-1.5 text-xs"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari barang..."
                aria-label="Cari material Daily Inventory"
                disabled={loading}
              />
            </div>

            {/* Quick Filter Pills: Semua | Selisih vs POS ESB | Hasil Olahan / Prep */}
            <div className="inline-flex items-center gap-1 rounded-lg border bg-white p-0.5" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => setQuickFilter('ALL')}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                style={{
                  background: quickFilter === 'ALL' ? '#0f172a' : 'transparent',
                  color: quickFilter === 'ALL' ? '#ffffff' : '#475569'
                }}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter(prev => prev === 'POS_DIFF' ? 'ALL' : 'POS_DIFF')}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                style={{
                  background: quickFilter === 'POS_DIFF' ? '#dc2626' : 'transparent',
                  color: quickFilter === 'POS_DIFF' ? '#ffffff' : '#b91c1c'
                }}
                title="Filter barang yang memiliki selisih antara Input Manual Barista vs Penjualan POS ESB"
              >
                <span>Selisih vs POS ESB</span>
                <span
                  className="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  style={{
                    background: quickFilter === 'POS_DIFF' ? 'rgba(255,255,255,0.22)' : '#fee2e2',
                    color: quickFilter === 'POS_DIFF' ? '#ffffff' : '#991b1b'
                  }}
                >
                  {posDiffCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter(prev => prev === 'PREP_ONLY' ? 'ALL' : 'PREP_ONLY')}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                style={{
                  background: quickFilter === 'PREP_ONLY' ? '#2563eb' : 'transparent',
                  color: quickFilter === 'PREP_ONLY' ? '#ffffff' : '#1d4ed8'
                }}
                title="Tampilkan hanya bahan hasil olahan / SimplePrep (Batching Jus, Sirup, Base)"
              >
                <FlaskConical size={11} />
                <span>Hasil Olahan / Prep</span>
                <span
                  className="px-1.5 py-0.2 rounded-full text-[10px] font-bold"
                  style={{
                    background: quickFilter === 'PREP_ONLY' ? 'rgba(255,255,255,0.22)' : '#dbeafe',
                    color: quickFilter === 'PREP_ONLY' ? '#ffffff' : '#1e40af'
                  }}
                >
                  {prepCount}
                </span>
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>Tampil:</span>
              <select
                className="form-control py-1 px-2 text-xs font-semibold"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                style={{ width: '132px' }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100 (Virtual)</option>
                <option value={9999}>Semua (Virtual)</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'EOD' && !isLocked && (
              <button
                type="button"
                className="btn btn-secondary text-xs py-1.5 px-2.5"
                onClick={confirmZeroActivityForUntouched}
                disabled={isLocked || loading || saving}
              >
                <CheckCheck size={13} style={{ marginRight: 5 }} /> Isi OUT = 0 (Baris Kosong)
              </button>
            )}

            {activeTotalCount > 0 && (
              <div className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1 text-xs" style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={visiblePage <= 1}
                  className="p-0.5 text-gray-500 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                  title="Halaman sebelumnya"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono font-semibold text-[11px] px-1.5">
                  {visiblePage}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={visiblePage >= totalPages}
                  className="p-0.5 text-gray-500 hover:text-gray-900 disabled:opacity-30 cursor-pointer"
                  title="Halaman berikutnya"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Minimalist Table Container with Frozen Top Header & Frozen Left Column ("Barang") */}
        <div
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          className="table-container relative"
          style={{
            background: '#ffffff',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            maxHeight: '560px',
            overflow: 'auto',
            padding: 0,
            margin: 0,
            width: '100%'
          }}
        >
          <TableLoadingOverlay
            loading={loading && (activeTab === 'REKAP' ? records.length > 0 : items.length > 0)}
            message="Menyinkronkan data inventaris harian..."
          />
          {activeTab === 'REKAP' ? (
            <table className="custom-table" style={{ width: '100%', minWidth: '1020px', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      position: 'sticky',
                      top: 0,
                      left: 0,
                      zIndex: 40,
                      background: '#f8fafc',
                      padding: '8px 10px',
                      textAlign: 'left',
                      minWidth: '115px',
                      width: '125px',
                      maxWidth: '140px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      boxShadow: '2px 0 6px -2px rgba(0, 0, 0, 0.08)'
                    }}
                    className="whitespace-nowrap"
                  >
                    Barang
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '90px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Stok Awal</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '85px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Masuk (IN)</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '90px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Pakai (OUT)</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '125px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Compare POS ESB</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '85px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Limbah</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '85px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Sisa Utuh</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '85px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Terbuka</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '95px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Stok Akhir</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '90px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Terpakai</th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 14px', textAlign: 'right', minWidth: '120px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">Biaya HPP</th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 ? (
                  <TableSkeletonRows
                    rows={6}
                    columns={[
                      { width: '125px', type: 'dual-text' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '85px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '125px', type: 'text', align: 'center' },
                      { width: '85px', type: 'text', align: 'center' },
                      { width: '85px', type: 'text', align: 'center' },
                      { width: '85px', type: 'text', align: 'center' },
                      { width: '95px', type: 'text', align: 'center' },
                      { width: '90px', type: 'text', align: 'center' },
                      { width: '120px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  <>
                    {rekapVirtualWindow.topSpacerHeight > 0 && (
                      <tr aria-hidden="true" style={{ height: `${rekapVirtualWindow.topSpacerHeight}px` }}>
                        <td colSpan={11} style={{ padding: 0, border: 'none' }} />
                      </tr>
                    )}
                    {visibleRekapRecords.map(row => {
                      const mat = row.materials || {};
                      const isPrep = isPrepOutputMaterial(mat);
                      const posComp = evaluatePosComparison(mat, Number(row.qty_out) || 0, posUsageMap[row.material_id || mat.id]);
                      return (
                        <tr key={row.id} style={{ background: '#ffffff' }}>
                        <td
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 15,
                            background: '#ffffff',
                            padding: '8px 10px',
                            minWidth: '115px',
                            width: '125px',
                            maxWidth: '140px',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            borderBottom: '1px solid #f1f5f9',
                            borderRight: '1px solid #e2e8f0',
                            boxShadow: '2px 0 6px -2px rgba(0, 0, 0, 0.08)'
                          }}
                        >
                          <div className="font-semibold text-xs text-[var(--text-primary)] leading-snug break-words" style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }} title={mat.name || 'Item Terhapus'}>
                            {mat.name || 'Item Terhapus'}
                          </div>
                          {isPrep && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              Hasil Olah / Prep
                            </span>
                          )}
                          <div className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            Rp {(Number(mat.price) || 0).toLocaleString('id-ID')} / {mat.unit || 'unit'}
                          </div>
                        </td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9' }}>{row.stok_awal}</td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9' }}>{row.qty_in}</td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9' }}>{row.qty_out}</td>
                        <td className="text-center whitespace-nowrap text-xs" style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                          {posComp.status === 'NO_POS' ? (
                            <span className="text-[10px] text-gray-400 font-mono">POS: 0</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="font-mono text-[10px] text-slate-600">
                                POS: {posComp.posStockQty} {posComp.stockUnit}
                              </span>
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                style={{
                                  background: posComp.status === 'MATCH' ? '#dcfce7' : posComp.status === 'MISSING_OUT' ? '#fee2e2' : '#fef3c7',
                                  color: posComp.status === 'MATCH' ? '#166534' : posComp.status === 'MISSING_OUT' ? '#991b1b' : '#92400e',
                                }}
                              >
                                {posComp.label}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9', color: Number(row.waste) > 0 ? '#dc2626' : 'inherit' }}>{row.waste}</td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9' }}>{row.full_qty}</td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9' }}>{row.broken}</td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap font-bold text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9' }}>{row.stok_akhir}</td>
                        <td className="text-center font-mono tabular-nums whitespace-nowrap font-bold text-xs" style={{ padding: '9px 8px', borderBottom: '1px solid #f1f5f9', color: row.qty_terpakai < 0 ? '#ef4444' : 'inherit' }}>
                          {row.qty_terpakai}
                        </td>
                        <td className="text-right font-mono tabular-nums whitespace-nowrap font-semibold text-xs" style={{ padding: '9px 14px', borderBottom: '1px solid #f1f5f9' }}>
                          Rp {Number(row.nilai_rupiah).toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })}
                  {rekapVirtualWindow.bottomSpacerHeight > 0 && (
                    <tr aria-hidden="true" style={{ height: `${rekapVirtualWindow.bottomSpacerHeight}px` }}>
                      <td colSpan={11} style={{ padding: 0, border: 'none' }} />
                    </tr>
                  )}
                  </>
                )}
                {!loading && filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                      <p style={{ fontWeight: 500, margin: 0, fontSize: '0.85rem' }}>Tidak ada data rekap untuk tanggal ini.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="custom-table" style={{ width: '100%', minWidth: '1010px', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      position: 'sticky',
                      top: 0,
                      left: 0,
                      zIndex: 40,
                      background: '#f8fafc',
                      padding: '8px 10px',
                      textAlign: 'left',
                      minWidth: '115px',
                      width: '125px',
                      maxWidth: '140px',
                      borderBottom: '1px solid #e2e8f0',
                      borderRight: '1px solid #e2e8f0',
                      boxShadow: '2px 0 6px -2px rgba(0, 0, 0, 0.08)'
                    }}
                    className="whitespace-nowrap"
                  >
                    Barang
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '88px', width: '88px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Stok Awal
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '102px', width: '102px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Masuk (IN)
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '142px', width: '142px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Pakai (OUT)
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '130px', width: '130px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Compare POS ESB
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '128px', width: '128px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Limbah
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '86px', width: '86px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Sisa Utuh
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '94px', width: '94px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Stok Akhir
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 8px', textAlign: 'center', minWidth: '86px', width: '86px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Terpakai
                  </th>
                  <th style={{ position: 'sticky', top: 0, zIndex: 25, background: '#f8fafc', padding: '10px 14px', textAlign: 'right', minWidth: '118px', width: '118px', borderBottom: '1px solid #e2e8f0' }} className="whitespace-nowrap">
                    Biaya HPP
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <TableSkeletonRows
                    rows={8}
                    columns={[
                      { width: '125px', type: 'dual-text' },
                      { width: '88px', type: 'text', align: 'center' },
                      { width: '102px', type: 'text', align: 'center' },
                      { width: '118px', type: 'text', align: 'center' },
                      { width: '130px', type: 'text', align: 'center' },
                      { width: '128px', type: 'text', align: 'center' },
                      { width: '86px', type: 'text', align: 'center' },
                      { width: '94px', type: 'text', align: 'center' },
                      { width: '86px', type: 'text', align: 'center' },
                      { width: '118px', type: 'text', align: 'right' }
                    ]}
                  />
                ) : (
                  <>
                    {eodVirtualWindow.topSpacerHeight > 0 && (
                      <tr aria-hidden="true" style={{ height: `${eodVirtualWindow.topSpacerHeight}px` }}>
                        <td colSpan={10} style={{ padding: 0, border: 'none' }} />
                      </tr>
                    )}
                    {visibleEodItems.map((item, visibleIdx) => {
                      const actualIdx = eodVirtualWindow.startIndex + visibleIdx;
                      const row = inventory[item.id] || {};
                      const fallbackOpening = location === 'CENTRAL' ? item.qty_central : (item.qty_resto ?? item.stock);
                      const stokAwal = row.stok_awal !== undefined && row.stok_awal !== '' ? Number(row.stok_awal) : (Number(fallbackOpening) || 0);
                      const qtyOut = Number(row.qty_out) || 0;
                      const outConfirmed = Boolean(row.out_confirmed)
                        || row.zero_activity_confirmed === true
                        || (row.qty_out !== '' && row.qty_out !== null && row.qty_out !== undefined);
                      const metrics = getInventoryRowMetrics(item, { ...row, stok_awal: stokAwal });
                    const stokAkhir = metrics.closing;
                    const qtyTerpakai = Number.isFinite(metrics.outStockQty) ? Number(metrics.outStockQty.toFixed(4)) : qtyOut;
                    const openingBroken = row.opening_broken_qty == null ? 0 : Number(row.opening_broken_qty) || 0;
                    const inferredOpening = calculateInferredFullFromBroken(item, stokAwal, openingBroken);
                    const savedOpeningFull = row.opening_full_qty === null || row.opening_full_qty === undefined || row.opening_full_qty === ''
                      ? null : Number(row.opening_full_qty);
                    const displayOpeningFull = inferredOpening?.fullQty ?? (Number.isFinite(savedOpeningFull) ? savedOpeningFull : 0);
                    const unitPrice = metrics.unitCost;
                    const nilaiRupiah = metrics.usageValue;

                    const expDate = item.next_expiry_date || '';
                    const fefo = getExpiryColor(expDate);
                    const rowBg = fefo?.color === 'red' ? '#fef2f2' : fefo?.color === 'yellow' ? '#fffbeb' : '#ffffff';
                    const hasWaste = Number(row.waste) > 0;

                    // Pillar 1: 2-Tier Conversion Info (validated against actual mathematical convertibility)
                    const { packUnit, contentUnit, contentQty: twoTierContentQty, hasTwoUnits, defaultOutUnit } = resolveOutUnitCapabilities(item);
                    const activeOutUnit = (hasTwoUnits && row.out_unit) ? row.out_unit : defaultOutUnit;

                    // Pillar 2: Compare POS ESB
                    const posComp = evaluatePosComparison(item, metrics.outStockQty, posUsageMap[item.id]);

                    // Pillar 4: Visibilitas Bahan Hasil Olahan / Prep
                    const isPrep = isPrepOutputMaterial(item);
                    const prodUsageQty = Number(row.production_usage_qty) || 0;

                    return (
                      <tr key={item.id} style={{ background: rowBg }}>
                        {/* Frozen Left Column: Barang */}
                        <td
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 15,
                            background: rowBg,
                            padding: '8px 10px',
                            borderBottom: '1px solid #f1f5f9',
                            borderRight: '1px solid #e2e8f0',
                            minWidth: '115px',
                            width: '125px',
                            maxWidth: '140px',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            boxShadow: '2px 0 6px -2px rgba(0, 0, 0, 0.08)'
                          }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span
                              className="font-semibold text-xs text-[var(--text-primary)] leading-snug break-words"
                              style={{ whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3 }}
                              title={item.name}
                            >
                              {item.name}
                            </span>
                            {fefo && (
                              <span style={{ fontWeight: 700, fontSize: '9px', padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0, background: fefo.color === 'red' ? '#fee2e2' : fefo.color === 'yellow' ? '#fef08a' : '#bbf7d0', color: fefo.color === 'red' ? '#b91c1c' : fefo.color === 'yellow' ? '#854d0e' : '#166534' }}>
                                {fefo.days}h
                              </span>
                            )}
                          </div>
                          {isPrep && (
                            <div className="mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                Hasil Olah / Prep
                              </span>
                            </div>
                          )}
                          {prodUsageQty > 0 && (
                            <div className="mt-0.5">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Bahan mentah ini dipakai di Proses Produksi Bahan (SimplePrep) hari ini">
                                Diolah Prep: {Number(prodUsageQty.toFixed(2))} {packUnit}
                              </span>
                            </div>
                          )}
                          <div className="text-[10px] text-[var(--text-muted)] leading-tight mt-0.5" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            Rp {unitPrice.toLocaleString('id-ID')} / {packUnit}
                          </div>
                          {hasTwoUnits && (
                            <div className="text-[9px] text-emerald-700 font-semibold leading-tight mt-0.5" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                              1 {packUnit} = {Number(twoTierContentQty).toLocaleString('id-ID')} {contentUnit}
                            </div>
                          )}
                        </td>

                        {/* Stok Awal */}
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          <span className="font-mono tabular-nums text-xs font-semibold text-gray-600">
                            {displayOpeningFull}
                          </span>
                        </td>

                        {/* Barang Masuk (IN) */}
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            disabled={isLocked}
                            className="form-control text-center font-mono tabular-nums text-xs py-1.5 px-2"
                            style={{ width: '100%', minWidth: '72px', height: '34px' }}
                            title="Masukkan total IN hari ini."
                            value={row.manual_in_total_input ?? String(Number(((Number(row.qty_in) || 0) + (Number(row.manual_in_qty) || 0)).toFixed(4)))}
                            onChange={e => handleChange(item.id, 'in_total_input', e.target.value)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, actualIdx, 2, 'manual_in_qty')}
                            data-row={actualIdx}
                            data-col={2}
                            placeholder="0"
                            aria-label={`Total IN ${item.name}`}
                          />
                          {isPrep && Number(row.qty_in) > 0 && (
                            <div className="mt-0.5 text-center">
                              <span className="inline-block px-1 py-0.2 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200" title="Stok masuk otomatis dari Proses Produksi Bahan (SimplePrep)">
                                +Prep: {Number(Number(row.qty_in).toFixed(2))} {packUnit}
                              </span>
                            </div>
                          )}
                          {item.expiry_tracking_enabled && (
                            <details className="text-left mt-1" style={{ fontSize: '10px' }}>
                              <summary className="cursor-pointer font-semibold text-amber-700 select-none">Lot ({(row.manual_in_lots || []).length})</summary>
                              <div className="mt-1.5 rounded-md border p-2 flex flex-col gap-1.5" style={{ minWidth: '220px', background: '#ffffff' }}>
                                {(row.manual_in_lots || []).map((lot, lotIdx) => (
                                  <div key={lot.lot_key || lotIdx} className="rounded border p-1.5 flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold">Lot {lotIdx + 1}</span>
                                      <button type="button" disabled={isLocked} className="text-red-600" onClick={() => removeManualInLot(item.id, lot.lot_key)} aria-label={`Hapus lot ${lotIdx + 1}`}><X size={12}/></button>
                                    </div>
                                    <input type="text" className="form-control text-xs py-1 px-2" placeholder="No batch" value={lot.batch_no || ''} disabled={isLocked} onChange={e => changeManualInLot(item.id, lot.lot_key, 'batch_no', e.target.value)} />
                                    <input type="date" className="form-control text-xs py-1 px-2" value={lot.expiry_date || ''} disabled={isLocked} onChange={e => changeManualInLot(item.id, lot.lot_key, 'expiry_date', e.target.value)} />
                                    <input type="number" min="0" step="any" className="form-control text-xs py-1 px-2 text-right" placeholder={`Qty (${item.unit || 'unit'})`} value={lot.qty ?? ''} disabled={isLocked} onChange={e => changeManualInLot(item.id, lot.lot_key, 'qty', e.target.value)} />
                                  </div>
                                ))}
                                <button type="button" className="btn btn-secondary text-xs py-1" disabled={isLocked} onClick={() => addManualInLot(item.id)}>+ Tambah lot</button>
                                <button type="button" className="btn btn-secondary text-xs py-1" disabled={isLocked} onClick={() => setManualInToLotTotal(item.id)}>Pakai total lot</button>
                              </div>
                            </details>
                          )}
                        </td>

                        {/* Pemakaian (OUT): Unified Single-Line Input + Inline Unit Badge/Toggle */}
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          <div className="inline-flex flex-col items-center">
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                height: '34px',
                                width: '132px',
                                borderRadius: '8px',
                                border: outConfirmed && Number(row.qty_out) > 0 ? '1px solid #10b981' : '1px solid #cbd5e1',
                                background: isLocked ? '#f8fafc' : '#ffffff',
                                overflow: 'hidden',
                              }}
                            >
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                disabled={isLocked}
                                className="text-center font-mono tabular-nums text-xs font-semibold focus:outline-none"
                                style={{
                                  width: '100%',
                                  minWidth: '48px',
                                  height: '100%',
                                  border: 'none',
                                  background: 'transparent',
                                  padding: '0 6px',
                                  color: 'var(--text-primary)',
                                }}
                                value={row.qty_out ?? ''}
                                onChange={e => handleChange(item.id, 'qty_out', e.target.value)}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => handleKeyDown(e, actualIdx, 3, 'qty_out')}
                                data-row={actualIdx}
                                data-col={3}
                                placeholder={outConfirmed ? '0 (OK)' : '0'}
                                aria-label={`Pakai OUT ${item.name} (${activeOutUnit})`}
                              />
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  height: '100%',
                                  borderLeft: '1px solid #e2e8f0',
                                  background: '#f8fafc',
                                  padding: '0 3px',
                                  flexShrink: 0,
                                  gap: '2px',
                                }}
                                title={hasTwoUnits ? `Klik satuan untuk ubah input OUT (${packUnit} vs ${contentUnit})` : `Satuan pemakaian: ${packUnit}`}
                              >
                                {hasTwoUnits ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isLocked}
                                      onClick={() => handleToggleOutUnit(item, packUnit)}
                                      style={{
                                        height: '24px',
                                        padding: '0 5px',
                                        borderRadius: '5px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        border: 'none',
                                        cursor: isLocked ? 'default' : 'pointer',
                                        background: String(activeOutUnit).toLowerCase() === String(packUnit).toLowerCase() ? '#0f172a' : 'transparent',
                                        color: String(activeOutUnit).toLowerCase() === String(packUnit).toLowerCase() ? '#ffffff' : '#64748b',
                                      }}
                                    >
                                      {packUnit}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isLocked}
                                      onClick={() => handleToggleOutUnit(item, contentUnit)}
                                      style={{
                                        height: '24px',
                                        padding: '0 5px',
                                        borderRadius: '5px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        border: 'none',
                                        cursor: isLocked ? 'default' : 'pointer',
                                        background: String(activeOutUnit).toLowerCase() === String(contentUnit).toLowerCase() ? '#059669' : 'transparent',
                                        color: String(activeOutUnit).toLowerCase() === String(contentUnit).toLowerCase() ? '#ffffff' : '#64748b',
                                      }}
                                    >
                                      {contentUnit}
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    className="font-mono"
                                    style={{
                                      padding: '0 6px',
                                      fontSize: '10px',
                                      fontWeight: 600,
                                      color: '#64748b',
                                    }}
                                  >
                                    {packUnit}
                                  </span>
                                )}
                              </div>
                            </div>
                            {hasTwoUnits && qtyOut > 0 && Number.isFinite(metrics.outStockQty) && String(activeOutUnit).toLowerCase() !== String(packUnit).toLowerCase() && (
                              <span className="text-[9px] font-mono text-emerald-700 mt-0.5 leading-none">
                                ≈ {Number(metrics.outStockQty.toFixed(3))} {packUnit}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Compare POS ESB */}
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {posComp.status === 'NO_POS' ? (
                            <span className="text-[10px] text-gray-400 font-mono">POS: 0</span>
                          ) : (
                            <div
                              className="flex flex-col items-center gap-0.5"
                              title={(posComp.menuBreakdown || []).map(b => `${b.menu_name} (${b.qty_sold}x)`).join(', ')}
                            >
                              <span className="font-mono text-[10px] font-semibold text-slate-700">
                                POS: {posComp.posStockQty} {posComp.stockUnit}
                              </span>
                              {posComp.recipeUnit && String(posComp.recipeUnit).toLowerCase() !== String(posComp.stockUnit).toLowerCase() && (
                                <span className="font-mono text-[9px] text-slate-400">
                                  ({posComp.posRecipeQty} {posComp.recipeUnit})
                                </span>
                              )}
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                style={{
                                  background: posComp.status === 'MATCH' ? '#dcfce7' : posComp.status === 'MISSING_OUT' ? '#fee2e2' : '#fef3c7',
                                  color: posComp.status === 'MATCH' ? '#166534' : posComp.status === 'MISSING_OUT' ? '#991b1b' : '#92400e',
                                }}
                              >
                                {posComp.label}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Limbah / Rusak: Minimalist & 100% Consistent Single-Line Layout */}
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '6px',
                              width: '116px',
                              padding: '3px 4px 3px 8px',
                              borderRadius: '8px',
                              border: hasWaste ? '1px solid #fecaca' : '1px solid #e2e8f0',
                              background: hasWaste ? '#fef2f2' : '#f8fafc',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <span
                              className="font-mono tabular-nums text-xs font-bold truncate"
                              style={{ color: hasWaste ? '#dc2626' : '#64748b', maxWidth: '46px' }}
                              title={`${row.waste ? Number(row.waste).toLocaleString('id-ID') : '0'} ${item.unit || ''}`}
                            >
                              {row.waste ? Number(row.waste).toLocaleString('id-ID') : '0'}
                            </span>
                            {!isLocked && (
                              <button
                                type="button"
                                onClick={() => openWasteModal(item)}
                                title={`Catat limbah untuk ${item.name} (${item.unit || ''})`}
                                style={{
                                  height: '26px',
                                  minHeight: '26px',
                                  minWidth: '58px',
                                  padding: '0 8px',
                                  borderRadius: '6px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  background: '#ffffff',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '2px',
                                  cursor: 'pointer',
                                  flexShrink: 0
                                }}
                              >
                                + Catat
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Sisa Utuh */}
                        <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          <span className="font-mono tabular-nums text-xs font-semibold text-gray-800">
                            {metrics.fullQty === null ? '-' : metrics.fullQty.toLocaleString('id-ID')}
                          </span>
                        </td>

                        {/* Stok Akhir */}
                        <td
                          className="text-center font-mono tabular-nums font-semibold whitespace-nowrap text-xs"
                          style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: metrics.reconciliationRequired ? '#d97706' : '#059669' }}
                          title={metrics.reconciliationRequired ? (metrics.reconciliationReason || 'Perlu tinjauan rekonsiliasi stok akhir') : `Stok Akhir: ${Number(metrics.bookClosing || 0).toLocaleString('id-ID')} ${packUnit}`}
                        >
                          {stokAkhir === null ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                              Tinjau
                            </span>
                          ) : (
                            Number(stokAkhir).toLocaleString('id-ID')
                          )}
                        </td>

                        {/* Total Terpakai */}
                        <td className="text-center font-mono tabular-nums font-semibold whitespace-nowrap text-xs" style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: qtyTerpakai < 0 ? '#ef4444' : '#334155' }}>
                          {qtyTerpakai}
                        </td>

                        {/* Biaya HPP */}
                        <td className="text-right font-mono tabular-nums font-semibold whitespace-nowrap text-xs" style={{ padding: '6px 14px', borderBottom: '1px solid #f1f5f9' }}>
                          Rp {nilaiRupiah.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    );
                  })}
                  {eodVirtualWindow.bottomSpacerHeight > 0 && (
                    <tr aria-hidden="true" style={{ height: `${eodVirtualWindow.bottomSpacerHeight}px` }}>
                      <td colSpan={10} style={{ padding: 0, border: 'none' }} />
                    </tr>
                  )}
                  </>
                )}
                {!loading && items.length > 0 && filteredItems.length === 0 && (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Tidak ada barang yang cocok dengan filter / pencarian.</td></tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: '40px 24px', color: '#6b7280' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                        Belum Ada Data Barang
                      </p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                        Daftar barang dimuat otomatis dari Master Bahan Baku.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Minimalist Pagination Bar di Bawah Tabel (10 Barang per Halaman) */}
        {activeTotalCount > 0 && (
          <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border" style={{ background: '#f8fafc', borderColor: 'var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Menampilkan <strong>{(visiblePage - 1) * pageSize + 1} sampai {Math.min(visiblePage * pageSize, activeTotalCount)}</strong> dari <strong>{activeTotalCount}</strong> barang
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                style={{ padding: '4px 10px', minHeight: '30px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={visiblePage <= 1}
              >
                <ChevronLeft size={13} /> Sebelumnya
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - visiblePage) <= 1)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span key={`dots-${idx}`} className="px-1 text-xs text-gray-400">...</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCurrentPage(item)}
                      style={{
                        minWidth: '30px',
                        height: '30px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: visiblePage === item ? 700 : 500,
                        background: visiblePage === item ? 'var(--accent)' : '#ffffff',
                        color: visiblePage === item ? '#ffffff' : 'var(--text-primary)',
                        border: visiblePage === item ? '1px solid var(--accent)' : '1px solid var(--border)',
                        cursor: 'pointer'
                      }}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                type="button"
                className="btn btn-secondary text-xs"
                style={{ padding: '4px 10px', minHeight: '30px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={visiblePage >= totalPages}
              >
                Selanjutnya <ChevronRight size={13} />
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
