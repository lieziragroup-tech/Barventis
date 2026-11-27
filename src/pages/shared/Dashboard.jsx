import { api } from '../../services/api';
import { useMemo, useState, useEffect } from 'react';
import {
  Package, ArrowRight, AlertTriangle,
  TrendingDown, DollarSign, CheckCircle, Calendar,
  ArrowRightLeft, ShoppingCart, Plus, Truck, ArrowDownLeft, ArrowUpRight,
  Building2, Tag, Search, FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatIDR, calculateIngredientCost } from '../../services/costUtils';
import WidgetErrorBoundary from '../../components/WidgetErrorBoundary';
import {
  DASHBOARD_ROLES,
  resolveDashboardRole,
  filterInvoicesForRole,
  isCentralTransfer,
  isCentralTransaction,
} from '../../services/modules/roleBoundaryUtils';
import { FocalActionBanner, StatusPill } from '../../components/dashboard/DashboardPrimitives';
import {
  CentralDashboardView,
  HeadBarDashboardView,
  RekanBarDashboardView,
} from '../../components/dashboard/RoleOperationalDashboards';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeUser } = useAuth();
  const { stock, unitConversionMap, branches, activeBranch, canSwitchBranch, switchBranch } = useData();

  const dashboardRole = resolveDashboardRole(activeUser);
  const isOwnerRole = dashboardRole === DASHBOARD_ROLES.OWNER;
  const isCentralRole = dashboardRole === DASHBOARD_ROLES.CENTRAL;
  const isPurchasingRole = dashboardRole === DASHBOARD_ROLES.PURCHASING;
  const isHeadBarRole = dashboardRole === DASHBOARD_ROLES.HEAD_BAR;
  const isRekanBarRole = dashboardRole === DASHBOARD_ROLES.REKAN_BAR;

  const [transactions, setTransactions] = useState([]);
  const [isLoadingTx, setIsLoadingTx] = useState(true);
  const [branchScope, setBranchScope] = useState('ACTIVE');
  const [multiBranchRows, setMultiBranchRows] = useState([]);
  const [loadingMultiBranch, setLoadingMultiBranch] = useState(false);

  // Role-specific state for Central & Purchasing Dashboards
  const [invoicesList, setInvoicesList] = useState([]);
  const [transfersList, setTransfersList] = useState([]);
  const [shipmentsList, setShipmentsList] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [loadingRoleData, setLoadingRoleData] = useState(false);

  // Filters for Central & Purchasing tables
  const [centralFlowFilter, setCentralFlowFilter] = useState('ALL');
  const [centralSearch, setCentralSearch] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('ALL');
  const [poSearch, setPoSearch] = useState('');

  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const periodOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
    }
    return opts;
  }, []);

  const periodLabel = useMemo(() => {
    return periodOptions.find(o => o.value === period)?.label || period;
  }, [periodOptions, period]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingTx(true);
    api.getTransactions(period)
      .then((data) => {
        if (isMounted) {
          setTransactions(data || []);
          setIsLoadingTx(false);
        }
      })
      .catch((err) => {
        console.error('Error fetching transactions:', err);
        if (isMounted) {
          setTransactions([]);
          setIsLoadingTx(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [period, activeBranch?.id]);

  useEffect(() => {
    if (isOwnerRole) return;
    let active = true;
    setLoadingRoleData(true);
    Promise.all([
      isRekanBarRole ? Promise.resolve([]) : api.getInvoices().catch(() => []),
      isCentralRole ? api.getTransfers().catch(() => []) : Promise.resolve([]),
      (isCentralRole || isHeadBarRole || isRekanBarRole) && typeof api.getInterBranchShipments === 'function' ? api.getInterBranchShipments().catch(() => []) : Promise.resolve([]),
      isPurchasingRole && typeof api.getSuppliers === 'function' ? api.getSuppliers().catch(() => []) : Promise.resolve([])
    ])
      .then(([invs, trfs, ships, sups]) => {
        if (!active) return;
        setInvoicesList(invs || []);
        setTransfersList(trfs || []);
        setShipmentsList(ships || []);
        setSuppliersList(sups || []);
      })
      .finally(() => {
        if (active) setLoadingRoleData(false);
      });
    return () => { active = false; };
  }, [isOwnerRole, isCentralRole, isPurchasingRole, isHeadBarRole, isRekanBarRole, period, activeBranch?.id]);

  useEffect(() => {
    if (!canSwitchBranch || branchScope !== 'ALL') return;
    let active = true;
    setLoadingMultiBranch(true);
    api.getMultiBranchSummary(period)
      .then(rows => {
        if (active) setMultiBranchRows(rows || []);
      })
      .catch(err => {
        console.warn('Multi-branch summary warning:', err);
        if (active) setMultiBranchRows([]);
      })
      .finally(() => {
        if (active) setLoadingMultiBranch(false);
      });
    return () => { active = false; };
  }, [canSwitchBranch, branchScope, period]);

  const branchNameById = useMemo(() => {
    const map = {};
    (branches || []).forEach(b => {
      map[b.id] = b.name;
    });
    return map;
  }, [branches]);

  const stockValuation = useMemo(() => stock.reduce((acc, item) => acc + calculateIngredientCost(item, (item.qty_resto || 0) + (item.qty_central || 0), item.unit, unitConversionMap), 0), [stock, unitConversionMap]);
  const centralStockValuation = useMemo(() => stock.reduce((acc, item) => acc + calculateIngredientCost(item, Number(item.qty_central) || 0, item.unit, unitConversionMap), 0), [stock, unitConversionMap]);
  const lowStockItems = useMemo(() => stock.filter(item => ((item.qty_resto || 0) + (item.qty_central || 0)) < (item.min_stock || 15)), [stock]);
  const centralLowStockItems = useMemo(() => stock.filter(item => Number(item.qty_central || 0) <= Number(item.min_stock || 15)), [stock]);

  // ============================================================================
  // COMPUTED METRICS FOR ROLE: CENTRAL (Mutasi ke Cabang, PO Central, Masuk/Keluar)
  // ============================================================================
  const centralMetrics = useMemo(() => {
    if (!isCentralRole) return null;

    // 1. Outbound Mutations (Central -> Which Branch / Unit)
    const periodTransfers = (transfersList || []).filter(t => String(t.date || t.created_at || '').startsWith(period));
    const periodShipments = (shipmentsList || []).filter(s => String(s.created_at || s.shipped_at || '').startsWith(period));

    const destinationMap = new Map();
    const unifiedMovements = [];

    // Internal & Location Transfers from Central
    periodTransfers.forEach(trf => {
      const src = String(trf.source_branch || 'Central Warehouse');
      const tgt = String(trf.target_branch || 'Resto Bar');
      if (!isCentralTransfer({ from_location: src, to_location: tgt })) return;
      const isFromCentral = src.toLowerCase().includes('central');
      const val = Number(trf.amount) || (Number(trf.qty || 0) * Number(trf.price || 0));

      if (isFromCentral) {
        const cur = destinationMap.get(tgt) || { destination: tgt, type: 'Unit / Outlet', count: 0, totalQty: 0, totalValue: 0, itemsSet: new Set() };
        cur.count += 1;
        cur.totalQty += Number(trf.qty || 0);
        cur.totalValue += val;
        if (trf.item_name) cur.itemsSet.add(trf.item_name);
        destinationMap.set(tgt, cur);
      }

      unifiedMovements.push({
        id: trf.id || `trf-${trf.raw_id}`,
        date: trf.date || (trf.created_at ? String(trf.created_at).slice(0, 10) : ''),
        direction: src.toLowerCase().includes('central') ? 'KELUAR' : 'MASUK',
        category: 'Mutasi Gudang',
        item_name: trf.item_name || 'Bahan Baku',
        qty: Number(trf.qty || 0),
        unit: trf.unit || 'unit',
        value: val,
        from_party: src,
        to_party: tgt,
        reference: trf.id || '-',
        notes: trf.notes || 'Distribusi mutasi stok',
        status: trf.status || 'COMPLETED'
      });
    });

    // Inter-Branch Shipments (Antar Cabang)
    periodShipments.forEach(ship => {
      const fromName = branchNameById[ship.from_branch_id] || 'Gudang Central';
      const toName = branchNameById[ship.to_branch_id] || 'Cabang Tujuan';
      if (!isCentralTransfer({ from_branch_name: fromName, to_branch_name: toName, from_is_central: !ship.from_branch_id })) return;
      const items = Array.isArray(ship.inter_branch_transfer_items) ? ship.inter_branch_transfer_items : [];
      const shipDate = String(ship.shipped_at || ship.created_at || '').slice(0, 10);

      let shipQty = 0;
      let shipVal = 0;
      items.forEach(it => {
        const q = Number(it.qty_sent || it.qty_requested || 0);
        const p = Number(it.unit_cost || it.materials?.price || 0);
        shipQty += q;
        shipVal += q * p;
      });

      const cur = destinationMap.get(`Cabang ${toName}`) || {
        destination: `Cabang ${toName}`,
        type: 'Antar Cabang',
        count: 0,
        totalQty: 0,
        totalValue: 0,
        itemsSet: new Set()
      };
      cur.count += 1;
      cur.totalQty += shipQty;
      cur.totalValue += shipVal;
      items.forEach(it => {
        if (it.materials?.name) cur.itemsSet.add(it.materials.name);
      });
      destinationMap.set(`Cabang ${toName}`, cur);

      unifiedMovements.push({
        id: ship.id || ship.transfer_number,
        date: shipDate,
        direction: 'KELUAR',
        category: 'Mutasi Antar Cabang',
        item_name: items.length > 0
          ? items.map(i => i.materials?.name || 'Bahan').slice(0, 2).join(', ') + (items.length > 2 ? ` (+${items.length - 2} lainnya)` : '')
          : 'Paket Distribusi Cabang',
        qty: shipQty,
        unit: `${items.length || 1} item`,
        value: shipVal,
        from_party: fromName,
        to_party: `Cabang ${toName}`,
        reference: ship.transfer_number || 'IBT',
        notes: ship.notes || 'Pengiriman stok antar cabang',
        status: ship.status || 'IN_TRANSIT'
      });
    });

    // 2. Inbound Sources (From PO Suppliers & Inbound Transactions)
    const sourceMap = new Map();
    const centralOnlyInvoices = filterInvoicesForRole(invoicesList, DASHBOARD_ROLES.CENTRAL);
    const periodInvoices = centralOnlyInvoices.filter(inv => String(inv.date || '').startsWith(period));
    const receivedPos = periodInvoices.filter(inv => String(inv.workflow_status || inv.status).toUpperCase() === 'RECEIVED');
    const pendingCentralPos = centralOnlyInvoices.filter(inv => !['RECEIVED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(String(inv.workflow_status || inv.status).toUpperCase()));

    receivedPos.forEach(inv => {
      const sup = inv.supplier || 'Supplier Umum';
      const cur = sourceMap.get(sup) || { source: sup, type: 'PO Supplier', count: 0, totalQty: 0, totalValue: 0 };
      const itemQty = (inv.items || []).reduce((s, i) => s + Number(i.qty || 0), 0);
      cur.count += 1;
      cur.totalQty += itemQty;
      cur.totalValue += Number(inv.total || 0);
      sourceMap.set(sup, cur);

      unifiedMovements.push({
        id: `po-${inv.id}`,
        date: inv.received_date || inv.date,
        direction: 'MASUK',
        category: 'Penerimaan PO',
        item_name: (inv.items || []).length > 0
          ? inv.items.map(i => i.item_name).slice(0, 2).join(', ') + (inv.items.length > 2 ? ` (+${inv.items.length - 2} item)` : '')
          : `PO ${inv.invoice_no}`,
        qty: itemQty,
        unit: `${(inv.items || []).length} item`,
        value: Number(inv.total || 0),
        from_party: `Supplier: ${sup}`,
        to_party: inv.location === 'RESTO' ? 'Cabang' : 'Gudang Central',
        reference: inv.invoice_no,
        notes: inv.notes || 'Penerimaan barang PO',
        status: 'RECEIVED'
      });
    });

    // Also include direct IN / PURCHASE_IN transactions in the period not already represented
    (transactions || []).forEach(tx => {
      if (!tx.date || !tx.date.startsWith(period)) return;
      if (!isCentralTransaction(tx)) return;
      if (['IN', 'PURCHASE_IN'].includes(tx.type) && Number(tx.qty) > 0) {
        const supName = tx.supplier || 'Pembelian / Barang Masuk';
        const val = Math.abs(Number(tx.amount || 0));
        const cur = sourceMap.get(supName) || { source: supName, type: 'Barang Masuk', count: 0, totalQty: 0, totalValue: 0 };
        cur.count += 1;
        cur.totalQty += Math.abs(Number(tx.qty || 0));
        cur.totalValue += val;
        sourceMap.set(supName, cur);

        unifiedMovements.push({
          id: `tx-in-${tx.id}`,
          date: tx.date,
          direction: 'MASUK',
          category: tx.type === 'PURCHASE_IN' ? 'Belanja Masuk' : 'Stok Masuk',
          item_name: tx.item_name || tx.materials?.name || 'Bahan Baku',
          qty: Math.abs(Number(tx.qty || 0)),
          unit: tx.unit || tx.materials?.unit || 'unit',
          value: val,
          from_party: supName,
          to_party: tx.location === 'RESTO' ? 'Resto / Unit' : 'Gudang Central',
          reference: `TX-${tx.id}`,
          notes: tx.notes || 'Penerimaan stok masuk',
          status: 'COMPLETED'
        });
      }
    });

    const destinations = Array.from(destinationMap.values())
      .map(d => ({ ...d, uniqueItems: d.itemsSet.size }))
      .sort((a, b) => b.totalValue - a.totalValue || b.count - a.count);

    const inboundSources = Array.from(sourceMap.values())
      .sort((a, b) => b.totalValue - a.totalValue || b.count - a.count);

    unifiedMovements.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const totalInboundValue = inboundSources.reduce((s, x) => s + x.totalValue, 0);
    const totalInboundCount = inboundSources.reduce((s, x) => s + x.count, 0);
    const totalInboundQty = inboundSources.reduce((s, x) => s + x.totalQty, 0);
    const totalOutboundValue = destinations.reduce((s, x) => s + x.totalValue, 0);
    const totalOutboundCount = destinations.reduce((s, x) => s + x.count, 0);
    const totalOutboundQty = destinations.reduce((s, x) => s + x.totalQty, 0);

    return {
      destinations,
      inboundSources,
      unifiedMovements,
      totalInboundValue,
      totalInboundCount,
      totalInboundQty,
      totalOutboundValue,
      totalOutboundCount,
      totalOutboundQty,
      pendingCentralPos,
      centralPos: periodInvoices,
      periodInvoices
    };
  }, [isCentralRole, transfersList, shipmentsList, invoicesList, transactions, period, branchNameById]);

  // ============================================================================
  // COMPUTED METRICS FOR ROLE: PURCHASING (Pembuatan PO & Total PO Bulan Ini)
  // ============================================================================
  const purchasingMetrics = useMemo(() => {
    if (!isPurchasingRole) return null;

    const monthlyPos = (invoicesList || []).filter(inv => String(inv.date || '').startsWith(period));
    const activeMonthlyPos = monthlyPos.filter(inv => String(inv.workflow_status || inv.status).toUpperCase() !== 'CANCELLED');

    const totalMonthlyPoValue = activeMonthlyPos.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const totalMonthlyPoCount = activeMonthlyPos.length;
    const avgPoValue = totalMonthlyPoCount > 0 ? totalMonthlyPoValue / totalMonthlyPoCount : 0;

    // Breakdown by workflow status in selected month
    let requestedCount = 0;
    let requestedValue = 0;
    let pendingAccCount = 0;
    let pendingAccValue = 0;
    let approvedSentCount = 0;
    let approvedSentValue = 0;
    let receivedCount = 0;
    let receivedValue = 0;

    const supplierSpendMap = new Map();

    activeMonthlyPos.forEach(inv => {
      const wf = String(inv.workflow_status || inv.status || 'DRAFT').toUpperCase();
      const val = Number(inv.total || 0);
      if (wf === 'REQUESTED' || wf === 'DRAFT') {
        requestedCount += 1;
        requestedValue += val;
      } else if (wf === 'PENDING_APPROVAL') {
        pendingAccCount += 1;
        pendingAccValue += val;
      } else if (wf === 'APPROVED' || wf === 'SENT') {
        approvedSentCount += 1;
        approvedSentValue += val;
      } else if (wf === 'RECEIVED') {
        receivedCount += 1;
        receivedValue += val;
      }

      const sup = inv.supplier || 'Supplier Umum';
      const cur = supplierSpendMap.get(sup) || { supplier: sup, poCount: 0, totalValue: 0, receivedCount: 0 };
      cur.poCount += 1;
      cur.totalValue += val;
      if (wf === 'RECEIVED') cur.receivedCount += 1;
      supplierSpendMap.set(sup, cur);
    });

    // Global action queue (POs needing Purchasing review or Owner ACC across any date)
    const actionQueueCount = (invoicesList || []).filter(inv =>
      ['REQUESTED', 'DRAFT', 'PENDING_APPROVAL'].includes(String(inv.workflow_status || inv.status || '').toUpperCase())
    ).length;

    const supplierBreakdown = Array.from(supplierSpendMap.values())
      .sort((a, b) => b.totalValue - a.totalValue);

    return {
      monthlyPos,
      totalMonthlyPoValue,
      totalMonthlyPoCount,
      avgPoValue,
      requestedCount,
      requestedValue,
      pendingAccCount,
      pendingAccValue,
      approvedSentCount,
      approvedSentValue,
      receivedCount,
      receivedValue,
      actionQueueCount,
      supplierBreakdown
    };
  }, [isPurchasingRole, invoicesList, period]);

  // ============================================================================
  // STANDARD DASHBOARD METRICS (Owner / Supervisor / Bar / Kitchen / Service)
  // ============================================================================
  const realSalesRevenue = useMemo(() => {
    return (transactions || [])
      .filter(tx => tx.type === 'POS_SALE' && tx.date && tx.date.startsWith(period))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  }, [transactions, period]);

  const realCogsCost = useMemo(() => {
    return (transactions || [])
      .filter(tx => tx.type === 'POS_DEDUCTION' && tx.date && tx.date.startsWith(period))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  }, [transactions, period]);

  const realCostPct = useMemo(() => realSalesRevenue > 0 ? (realCogsCost / realSalesRevenue) * 100 : 0, [realSalesRevenue, realCogsCost]);

  const realTrendData = useMemo(() => {
    const dayMap = {};
    const year = parseInt(period.split('-')[0], 10);
    const month = parseInt(period.split('-')[1], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const resultArr = [];

    for (let i = 1; i <= daysInMonth; i++) {
      const key = `${period}-${String(i).padStart(2, '0')}`;
      const label = `${period.split('-')[1]}/${String(i).padStart(2, '0')}`;
      dayMap[key] = { name: label, cost: 0, revenue: 0, target: 27 };
      resultArr.push(key);
    }

    (transactions || []).forEach(tx => {
      const dateStr = tx.date || '';
      if (dateStr && dateStr.startsWith(period) && dayMap[dateStr]) {
        if (tx.type === 'POS_DEDUCTION') dayMap[dateStr].cost += Math.abs(parseFloat(tx.amount || 0));
        if (tx.type === 'POS_SALE') dayMap[dateStr].revenue += Math.abs(parseFloat(tx.amount || 0));
      }
    });

    return resultArr.map(key => ({
      ...dayMap[key],
      cost: dayMap[key].revenue > 0 ? parseFloat(((dayMap[key].cost / dayMap[key].revenue) * 100).toFixed(1)) : 0
    }));
  }, [transactions, period]);

  const topContributors = useMemo(() => {
    return [...(stock || [])]
      .map(item => ({
        name: item.name,
        cost: calculateIngredientCost(item, (item.qty_resto || 0) + (item.qty_central || 0), item.unit, unitConversionMap)
      }))
      .filter(item => item.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);
  }, [stock, unitConversionMap]);

  const totalSalesBeverage = realSalesRevenue;
  const currentCostPct = realCostPct;
  const trendData = realTrendData;
  const contributorsData = topContributors;

  const pieData = useMemo(() => {
    const categoryVals = {};
    stock.forEach(item => {
      const val = calculateIngredientCost(item, (item.qty_resto || 0) + (item.qty_central || 0), item.unit, unitConversionMap);
      categoryVals[item.category] = (categoryVals[item.category] || 0) + val;
    });
    return Object.entries(categoryVals).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [stock, unitConversionMap]);

  const COLORS = ['#3b82f6', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0d9488'];
  const tooltipStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', boxShadow: 'var(--card-shadow)' };

  // ============================================================================
  // VIEW 1: DEDICATED CENTRAL ROLE DASHBOARD
  // ============================================================================
  if (isCentralRole && centralMetrics) {
    return (
      <CentralDashboardView
        period={period}
        setPeriod={setPeriod}
        periodOptions={periodOptions}
        periodLabel={periodLabel}
        centralMetrics={centralMetrics}
        centralLowStockItems={centralLowStockItems}
        loadingRoleData={loadingRoleData}
        navigate={navigate}
      />
    );
  }

  if (isHeadBarRole) {
    const branchLowStockItems = (stock || []).filter(item => Number(item.qty_resto || 0) < Number(item.min_stock || 15));
    const branchPos = filterInvoicesForRole(invoicesList, DASHBOARD_ROLES.HEAD_BAR, activeBranch?.id);
    const incomingTransfers = (shipmentsList || []).filter(
      s => (!activeBranch?.id || String(s.to_branch_id) === String(activeBranch.id)) && !['RECEIVED', 'COMPLETED', 'CANCELLED'].includes(String(s.status || '').toUpperCase())
    );
    return (
      <HeadBarDashboardView
        activeBranchName={activeBranch?.name || 'Aktif'}
        branchStockItems={stock || []}
        branchLowStockItems={branchLowStockItems}
        branchPos={branchPos}
        incomingTransfers={incomingTransfers}
        navigate={navigate}
      />
    );
  }

  if (isRekanBarRole) {
    const branchLowStockItems = (stock || []).filter(item => Number(item.qty_resto || 0) < Number(item.min_stock || 15));
    const incomingTransfers = (shipmentsList || []).filter(
      s => (!activeBranch?.id || String(s.to_branch_id) === String(activeBranch.id)) && !['RECEIVED', 'COMPLETED', 'CANCELLED'].includes(String(s.status || '').toUpperCase())
    );
    return (
      <RekanBarDashboardView
        activeBranchName={activeBranch?.name || 'Aktif'}
        branchLowStockItems={branchLowStockItems}
        incomingTransfers={incomingTransfers}
        navigate={navigate}
      />
    );
  }

  if (isPurchasingRole && purchasingMetrics) {
    const filteredMonthlyPos = purchasingMetrics.monthlyPos.filter(inv => {
      const wf = String(inv.workflow_status || inv.status || 'DRAFT').toUpperCase();
      const matchStatus =
        poStatusFilter === 'ALL'
          ? true
          : poStatusFilter === 'NEEDS_ACTION'
            ? ['REQUESTED', 'DRAFT', 'PENDING_APPROVAL'].includes(wf)
            : poStatusFilter === 'APPROVED_SENT'
              ? ['APPROVED', 'SENT'].includes(wf)
              : wf === 'RECEIVED';
      const q = poSearch.trim().toLowerCase();
      const matchQ = !q ||
        String(inv.invoice_no || '').toLowerCase().includes(q) ||
        String(inv.supplier || '').toLowerCase().includes(q) ||
        String(inv.division || '').toLowerCase().includes(q);
      return matchStatus && matchQ;
    });

    return (
      <div className="fade-in space-y-5">
        <FocalActionBanner
          eyebrow="Fokus Pengadaan & Supplier"
          title={purchasingMetrics.requestedCount > 0 ? `${purchasingMetrics.requestedCount} permintaan PO menunggu proses Purchasing` : `Seluruh antrean PO bulan ${periodLabel} terkendali`}
          description={`Total ${purchasingMetrics.totalMonthlyPoCount} PO aktif tercatat pada ${periodLabel} dengan nilai pengadaan ${formatIDR(purchasingMetrics.totalMonthlyPoValue)}.`}
          tone={purchasingMetrics.requestedCount > 0 ? 'warning' : 'success'}
          primaryAction={{
            label: '+ Buat PO Baru',
            icon: <Plus size={15} />,
            onClick: () => navigate('/dashboard/procurement?tab=invoicing&create=1'),
          }}
          secondaryActions={[
            {
              label: 'Komparasi Harga',
              icon: <Tag size={14} />,
              onClick: () => navigate('/dashboard/procurement?tab=marketlist'),
            },
          ]}
        />
        {/* Top Control Bar: Periode Bulan & Pintasan Utama Pembuatan PO */}
        <div className="glass-card p-3.5 sm:px-5 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <Calendar size={16} />
            </div>
            <span className="text-xs sm:text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap">Periode PO Bulanan:</span>
            <select
              className="form-control flex-1 sm:w-[190px]"
              style={{ padding: '7px 12px', fontSize: '0.85rem', fontWeight: 600 }}
              value={period}
              onChange={e => setPeriod(e.target.value)}
            >
              {periodOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard/procurement?tab=invoicing&create=1')}
              className="btn btn-primary flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 whitespace-nowrap shrink-0"
            >
              <Plus size={15} />
              <span>+ Buat PO Baru</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/procurement?tab=marketlist')}
              className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold px-3 py-2 whitespace-nowrap shrink-0"
            >
              <Tag size={15} />
              <span>Komparasi Harga & Bahan</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/dashboard/procurement?tab=pembelian')}
              className="btn btn-secondary flex items-center gap-1.5 text-xs font-semibold px-3 py-2 whitespace-nowrap shrink-0"
            >
              <Building2 size={15} />
              <span>Master Supplier & Belanja</span>
            </button>
          </div>
        </div>

        {/* 4 KPI Cards: Total Nilai PO Bulan Ini, Total Dokumen PO Bulan Ini, Antrean Review/ACC, Supplier & Stok Menipis */}
        <div className="kpi-grid">
          <div className="glass-card kpi-card" onClick={() => navigate('/dashboard/procurement?tab=invoicing')} style={{ cursor: 'pointer' }}>
            <div className="kpi-header">
              <span className="kpi-title">Total Nilai PO ({periodLabel})</span>
              <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                <DollarSign size={20} />
              </div>
            </div>
            <div className="kpi-value tabular-nums">{formatIDR(purchasingMetrics.totalMonthlyPoValue)}</div>
            <div className="kpi-footer">
              <span className="text-[var(--text-secondary)] tabular-nums">
                Diterima: {formatIDR(purchasingMetrics.receivedValue)} ({purchasingMetrics.receivedCount} PO)
              </span>
            </div>
          </div>

          <div className="glass-card kpi-card" onClick={() => navigate('/dashboard/procurement?tab=invoicing')} style={{ cursor: 'pointer' }}>
            <div className="kpi-header">
              <span className="kpi-title">Total Dokumen PO Bulan Ini</span>
              <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
                <FileText size={20} />
              </div>
            </div>
            <div className="kpi-value tabular-nums">{purchasingMetrics.totalMonthlyPoCount} PO</div>
            <div className="kpi-footer">
              <span className="text-[var(--text-secondary)] tabular-nums">
                Rata-rata {formatIDR(purchasingMetrics.avgPoValue)} / PO
              </span>
            </div>
          </div>

          <div className="glass-card kpi-card" onClick={() => navigate('/dashboard/procurement?tab=invoicing')} style={{ cursor: 'pointer' }}>
            <div className="kpi-header">
              <span className="kpi-title">Antrean Review & ACC Owner</span>
              <div className="kpi-icon-wrap" style={{ background: purchasingMetrics.actionQueueCount > 0 ? 'var(--warning-glow)' : 'var(--success-glow)', color: purchasingMetrics.actionQueueCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
                <ShoppingCart size={20} />
              </div>
            </div>
            <div className="kpi-value tabular-nums">{purchasingMetrics.actionQueueCount} PO</div>
            <div className="kpi-footer">
              <span className="text-[var(--text-secondary)] tabular-nums">
                Bulan ini: {purchasingMetrics.requestedCount + purchasingMetrics.pendingAccCount} PO menunggu proses
              </span>
            </div>
          </div>

          <div className="glass-card kpi-card" onClick={() => navigate('/dashboard/procurement?tab=pembelian')} style={{ cursor: 'pointer' }}>
            <div className="kpi-header">
              <span className="kpi-title">Supplier & Bahan Perlu Restock</span>
              <div className="kpi-icon-wrap" style={{ background: lowStockItems.length > 0 ? 'var(--danger-glow)' : 'var(--success-glow)', color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                <Building2 size={20} />
              </div>
            </div>
            <div className="kpi-value tabular-nums">{suppliersList.length || purchasingMetrics.supplierBreakdown.length} Supplier</div>
            <div className="kpi-footer">
              <span style={{ color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--text-secondary)' }} className="tabular-nums font-semibold">
                {lowStockItems.length} bahan stok menipis siap dibuatkan PO
              </span>
            </div>
          </div>
        </div>

        {/* 2-Column Split: Rekap Nilai PO per Supplier Bulan Ini & Status Tahapan PO + Bahan Kritis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          {/* Panel Kiri: Total PO Bulan Ini per Supplier */}
          <div className="glass-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] m-0">
                    Rekap Total PO per Supplier ({periodLabel})
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5">
                    Distribusi nilai pembelian Purchase Order bulan berjalan berdasarkan mitra supplier.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/procurement?tab=marketlist')}
                  className="btn btn-secondary text-xs font-semibold px-2.5 py-1.5 whitespace-nowrap shrink-0"
                >
                  Komparasi Harga
                </button>
              </div>

              {loadingRoleData ? (
                <div className="py-10 text-center text-xs text-[var(--text-muted)]">Memuat rekap PO supplier...</div>
              ) : purchasingMetrics.supplierBreakdown.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--text-muted)]">
                  Belum ada PO yang diterbitkan pada bulan {periodLabel}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="custom-table w-full text-xs">
                    <thead>
                      <tr>
                        <th>Nama Supplier</th>
                        <th className="text-right">Jumlah PO</th>
                        <th className="text-right">PO Selesai</th>
                        <th className="text-right">Total Nilai PO</th>
                        <th className="text-right">Porsi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasingMetrics.supplierBreakdown.slice(0, 8).map(sup => {
                        const sharePct = purchasingMetrics.totalMonthlyPoValue > 0
                          ? (sup.totalValue / purchasingMetrics.totalMonthlyPoValue) * 100
                          : 0;
                        return (
                          <tr key={sup.supplier} className="hover:bg-[var(--bg-tertiary)]/50">
                            <td className="font-bold text-[var(--text-primary)]">{sup.supplier}</td>
                            <td className="text-right font-mono tabular-nums">{sup.poCount} dokumen</td>
                            <td className="text-right font-mono tabular-nums">{sup.receivedCount} diterima</td>
                            <td className="text-right font-mono tabular-nums font-bold text-[var(--accent)]">
                              {formatIDR(sup.totalValue)}
                            </td>
                            <td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                              {sharePct.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Panel Kanan: Ringkasan Alur Status PO Bulan Ini & Bahan Stok Menipis (1-Klik Buat PO) */}
          <div className="glass-card p-5 flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] m-0">
                    Rincian Status PO Bulan Ini & Kebutuhan Restock
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5">
                    Tahapan penyelesaian PO periode {periodLabel} serta pintasan pembuatan PO bahan kritis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/procurement?tab=invoicing&create=1')}
                  className="btn btn-primary text-xs font-bold px-3 py-1.5 whitespace-nowrap shrink-0"
                >
                  + Buat PO
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Draft / Permintaan Cabang</div>
                  <div className="text-sm font-extrabold font-mono tabular-nums mt-1 text-[var(--text-primary)]">
                    {purchasingMetrics.requestedCount} PO · {formatIDR(purchasingMetrics.requestedValue)}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Menunggu ACC Owner</div>
                  <div className="text-sm font-extrabold font-mono tabular-nums mt-1" style={{ color: 'var(--warning)' }}>
                    {purchasingMetrics.pendingAccCount} PO · {formatIDR(purchasingMetrics.pendingAccValue)}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Disetujui / Dikirim ke Supplier</div>
                  <div className="text-sm font-extrabold font-mono tabular-nums mt-1 text-[var(--accent)]">
                    {purchasingMetrics.approvedSentCount} PO · {formatIDR(purchasingMetrics.approvedSentValue)}
                  </div>
                </div>
                <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
                  <div className="text-[11px] font-semibold text-[var(--text-secondary)]">Barang Diterima (Selesai)</div>
                  <div className="text-sm font-extrabold font-mono tabular-nums mt-1" style={{ color: 'var(--success)' }}>
                    {purchasingMetrics.receivedCount} PO · {formatIDR(purchasingMetrics.receivedValue)}
                  </div>
                </div>
              </div>

              <div className="text-xs font-bold text-[var(--text-secondary)] mb-2">
                Bahan Stok Menipis — Klik untuk Langsung Buat PO ({lowStockItems.length} item)
              </div>
              <div className="max-h-[165px] overflow-y-auto space-y-1.5 pr-1">
                {lowStockItems.length === 0 ? (
                  <div className="py-4 text-center text-xs text-[var(--text-muted)]">
                    Seluruh stok bahan berada di atas batas minimum.
                  </div>
                ) : (
                  lowStockItems.slice(0, 6).map(item => {
                    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
                    return (
                      <div
                        key={item.id ?? item.name}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">{item.name}</div>
                          <div className="text-[11px] text-[var(--text-secondary)] tabular-nums">
                            Sisa: <strong style={{ color: 'var(--danger)' }}>{totalQty.toFixed(0)} {item.unit}</strong> (Min: {item.min_stock || 15}) · {item.supplier || 'Tanpa Supplier'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/procurement?tab=invoicing&prefillMaterial=${encodeURIComponent(item.name)}`)}
                          className="btn btn-secondary text-[11px] font-bold px-2.5 py-1 whitespace-nowrap shrink-0"
                          style={{ color: 'var(--accent)' }}
                        >
                          + Buat PO
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabel Daftar Purchase Order (PO) Bulan Berjalan */}
        <div className="glass-card p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] m-0">
                Daftar Purchase Order (PO) Bulan {periodLabel}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5">
                Pantau seluruh pembuatan PO, penggantian supplier, status ACC Owner, dan total nilai PO bulan berjalan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
                {[
                  { key: 'ALL', label: 'Semua PO' },
                  { key: 'NEEDS_ACTION', label: 'Perlu Review / ACC' },
                  { key: 'APPROVED_SENT', label: 'Disetujui / Dikirim' },
                  { key: 'RECEIVED', label: 'Diterima' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setPoStatusFilter(tab.key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      poStatusFilter === tab.key
                        ? 'bg-[var(--bg-secondary)] text-[var(--accent)] shadow-2xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[200px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  className="form-control pl-8 py-1.5 text-xs"
                  placeholder="Cari No. PO, supplier, divisi..."
                  value={poSearch}
                  onChange={e => setPoSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {filteredMonthlyPos.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--text-muted)]">
              Belum ada dokumen PO yang sesuai filter pada bulan {periodLabel}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="custom-table w-full text-xs">
                <thead>
                  <tr>
                    <th>No. PO</th>
                    <th>Tanggal</th>
                    <th>Divisi</th>
                    <th>Supplier</th>
                    <th className="text-right">Item</th>
                    <th className="text-right">Total Nilai PO</th>
                    <th>Status Workflow</th>
                    <th className="text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMonthlyPos.map(inv => {
                    const wf = String(inv.workflow_status || inv.status || 'DRAFT').toUpperCase();
                    return (
                      <tr key={inv.id} className="hover:bg-[var(--bg-tertiary)]/50">
                        <td className="font-mono font-bold text-[var(--accent)] whitespace-nowrap">{inv.invoice_no}</td>
                        <td className="font-mono tabular-nums text-[var(--text-secondary)] whitespace-nowrap">{inv.date}</td>
                        <td className="text-[var(--text-secondary)]">{inv.division || 'BAR'}</td>
                        <td>
                          <div className="font-semibold text-[var(--text-primary)]">{inv.supplier}</div>
                          {inv.original_supplier && inv.original_supplier !== inv.supplier && (
                            <div className="text-[10px] text-[var(--text-muted)]">
                              Diganti dari: {inv.original_supplier}
                            </div>
                          )}
                        </td>
                        <td className="text-right font-mono tabular-nums">{(inv.items || []).length} bahan</td>
                        <td className="text-right font-mono tabular-nums font-bold">{formatIDR(inv.total || 0)}</td>
                        <td>
                          <StatusPill status={wf} />
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => navigate('/dashboard/procurement?tab=invoicing')}
                            className="btn btn-secondary text-[11px] font-semibold px-2.5 py-1 whitespace-nowrap"
                          >
                            Kelola PO
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW 3: STANDARD DASHBOARD (Owner / Supervisor / Bar / Kitchen / Service)
  // ============================================================================
  return (
    <div className="fade-in">
      {/* Filters and Tab Switcher (Mobile-Friendly & Comforting) */}
      <div className="glass-card mb-4 sm:mb-6 p-3.5 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center shrink-0">
            <Calendar size={16} />
          </div>
          <span className="text-xs sm:text-sm font-bold text-[var(--text-secondary)] whitespace-nowrap">Periode:</span>
          <select
            className="form-control flex-1 sm:w-[180px]"
            style={{ padding: '7px 12px', fontSize: '0.85rem', fontWeight: 600 }}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            {periodOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {canSwitchBranch && branches.length > 1 && (
          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setBranchScope('ACTIVE')}
              className={`px-3 py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap text-center cursor-pointer ${
                branchScope === 'ACTIVE'
                  ? 'bg-[var(--bg-secondary)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Cabang {activeBranch?.name || 'Aktif'}
            </button>
            <button
              type="button"
              onClick={() => setBranchScope('ALL')}
              className={`px-3 py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap text-center cursor-pointer ${
                branchScope === 'ALL'
                  ? 'bg-[var(--bg-secondary)] text-[var(--accent)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Semua Cabang ({branches.length})
            </button>
          </div>
        )}
      </div>

      <FocalActionBanner
        eyebrow={branchScope === 'ALL' ? `Ringkasan Eksekutif · Semua Cabang (${branches.length})` : `Ringkasan Eksekutif · Cabang ${activeBranch?.name || 'Aktif'}`}
        title={lowStockItems.length > 0 ? `${lowStockItems.length} item stok menipis · Rasio Biaya ${currentCostPct.toFixed(1)}%` : `Rasio Biaya F&B ${currentCostPct.toFixed(1)}% (Target < 27%)`}
        description={`Pantau kesehatan biaya, omzet penjualan, dan nilai persediaan pada periode ${periodLabel}. Pilih menu di samping untuk melihat rincian tiap bagian.`}
        tone={currentCostPct > 30 || lowStockItems.length > 20 ? 'warning' : 'success'}
        primaryAction={{
          label: 'Analisis Cost Control',
          icon: <TrendingDown size={15} />,
          onClick: () => navigate('/dashboard/cost-control'),
        }}
        secondaryActions={[
          {
            label: 'Kelola PO',
            icon: <ShoppingCart size={14} />,
            onClick: () => navigate('/dashboard/procurement?tab=invoicing'),
          },
        ]}
      />

      {canSwitchBranch && branchScope === 'ALL' ? (
        <div className="space-y-6">
          <div className="kpi-grid">
            {(() => {
              const totalSalesAll = multiBranchRows.reduce((s, r) => s + Number(r.pos_sales || 0), 0);
              const totalCogsAll = multiBranchRows.reduce((s, r) => s + Number(r.actual_cogs || 0), 0);
              const totalStockAll = multiBranchRows.reduce((s, r) => s + Number(r.stock_valuation || 0), 0);
              const totalLowAll = multiBranchRows.reduce((s, r) => s + Number(r.low_stock_count || 0), 0);
              const avgPct = totalSalesAll > 0 ? (totalCogsAll / totalSalesAll) * 100 : 0;
              return (
                <>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Rasio Biaya Gabungan</span>
                      <div className="kpi-icon-wrap" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
                        <TrendingDown size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums" style={{ color: avgPct <= 27 ? 'var(--success)' : 'var(--warning)' }}>{avgPct.toFixed(1)}%</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">{multiBranchRows.length} cabang</span></div>
                  </div>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Total Penjualan Gabungan</span>
                      <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                        <DollarSign size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums">{formatIDR(totalSalesAll)}</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">Periode {period.split('-')[1]}/{period.split('-')[0]}</span></div>
                  </div>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Total Nilai Stok</span>
                      <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
                        <Package size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums">{formatIDR(totalStockAll)}</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">Seluruh cabang</span></div>
                  </div>
                  <div className="glass-card kpi-card">
                    <div className="kpi-header">
                      <span className="kpi-title">Stok Menipis</span>
                      <div className="kpi-icon-wrap" style={{ background: totalLowAll > 0 ? 'var(--danger-glow)' : 'var(--success-glow)', color: totalLowAll > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        <AlertTriangle size={20} />
                      </div>
                    </div>
                    <div className="kpi-value tabular-nums" style={{ color: totalLowAll > 0 ? 'var(--danger)' : 'var(--success)' }}>{totalLowAll}</div>
                    <div className="kpi-footer"><span className="text-[var(--text-secondary)]">Total item kritis</span></div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] m-0">Performa Antar Cabang</h3>
                <p className="text-xs text-[var(--text-secondary)] m-0 mt-0.5">Pilih nama cabang untuk melihat detailnya.</p>
              </div>
            </div>
            {loadingMultiBranch ? (
              <div className="py-10 text-center text-xs text-[var(--text-muted)]">Memuat ringkasan cabang...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="custom-table w-full text-xs">
                  <thead>
                    <tr>
                      <th>Cabang</th>
                      <th>Tipe</th>
                      <th className="text-right">HPP Aktual</th>
                      <th className="text-right">Food Cost %</th>
                      <th className="text-right">Nilai Stok</th>
                      <th className="text-right">Stok Menipis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {multiBranchRows.map(row => (
                      <tr
                        key={row.branch_id}
                        className="cursor-pointer hover:bg-[var(--bg-tertiary)]/50"
                        onClick={() => {
                          switchBranch(row.branch_id);
                          setBranchScope('ACTIVE');
                        }}
                      >
                        <td className="font-bold text-[var(--text-primary)]">{row.branch_name}</td>
                        <td className="text-[var(--text-secondary)]">{row.is_central ? 'Central' : 'Outlet'}</td>
                        <td className="text-right font-mono tabular-nums">{formatIDR(row.actual_cogs || 0)}</td>
                        <td className="text-right font-mono tabular-nums font-bold" style={{ color: Number(row.food_cost_pct) > 30 ? 'var(--danger)' : 'var(--success)' }}>
                          {Number(row.food_cost_pct || 0).toFixed(1)}%
                        </td>
                        <td className="text-right font-mono tabular-nums">{formatIDR(row.stock_valuation || 0)}</td>
                        <td className="text-right font-mono tabular-nums font-semibold" style={{ color: Number(row.low_stock_count) > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                          {row.low_stock_count || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid">
            <div className="glass-card kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Rasio Biaya F&B</span>
                <div className="kpi-icon-wrap" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
                  <TrendingDown size={20} />
                </div>
              </div>
              <div className="kpi-value" style={{ color: 'var(--success)' }}>{currentCostPct.toFixed(1)}%</div>
              <div className="kpi-footer"><span className="trend-up">Target aman (&lt;27%)</span></div>
            </div>

            <div className="glass-card kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Total Penjualan</span>
                <div className="kpi-icon-wrap" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                  <DollarSign size={20} />
                </div>
              </div>
              <div className="kpi-value">{formatIDR(totalSalesBeverage)}</div>
              <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>Periode {period.split('-')[1]}/{period.split('-')[0]}</span></div>
            </div>

            <div className="glass-card kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Nilai Stok</span>
                <div className="kpi-icon-wrap" style={{ background: 'var(--info-glow)', color: 'var(--info)' }}>
                  <Package size={20} />
                </div>
              </div>
              <div className="kpi-value">{formatIDR(stockValuation)}</div>
              <div className="kpi-footer"><span style={{ color: 'var(--text-secondary)' }}>Resto + Central</span></div>
            </div>

            <div className="glass-card kpi-card" onClick={() => navigate('/dashboard/sistem?tab=stock-ledger')} style={{ cursor: 'pointer' }}>
              <div className="kpi-header">
                <span className="kpi-title">Stok Menipis</span>
                <div className="kpi-icon-wrap" style={{ background: lowStockItems.length > 0 ? 'var(--danger-glow)' : 'var(--success-glow)', color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div className="kpi-value" style={{ color: lowStockItems.length > 0 ? 'var(--danger)' : 'var(--success)' }}>{lowStockItems.length}</div>
              <div className="kpi-footer">
                {lowStockItems.length > 0
                  ? <span className="trend-down">Perlu restock <ArrowRight size={12} /></span>
                  : <span className="trend-up">Semua stok aman</span>}
              </div>
            </div>
          </div>

          {/* Row 1: Trend + Pie */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <div className="glass-card" style={{ padding: '20px' }}>
              <div className="chart-title" style={{ marginBottom: '16px' }}>
                <span>Tren Biaya ({period.split('-')[1]}/{period.split('-')[0]})</span>
                <span className="badge badge-info">Target: 27%</span>
              </div>
              <WidgetErrorBoundary name="Grafik Tren Biaya">
                {isLoadingTx ? (
                  <div style={{ width: '100%', height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                    <div style={{ width: '24px', height: '24px', border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Memuat grafik...</span>
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 300, minHeight: 300, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={300} minWidth={100} debounce={50}>
                      <LineChart data={trendData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                        <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 10 }} minTickGap={28} interval="preserveStartEnd" />
                        <YAxis domain={[0, (dataMax) => Math.max(35, Math.ceil((Number.isFinite(Number(dataMax)) ? Number(dataMax) : 0) + 5))]} stroke="var(--text-muted)" tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend verticalAlign="top" height={36} />
                        <Line
                          type="monotone"
                          dataKey="cost"
                          name={'Biaya F&B %'}
                          stroke="var(--accent)"
                          strokeWidth={2.5}
                          dot={(props) => {
                            if (!props?.payload || Number(props.payload.cost) <= 0) return null;
                            return (
                              <circle
                                key={`dot-${props.index}`}
                                cx={props.cx}
                                cy={props.cy}
                                r={3.5}
                                fill="var(--accent)"
                                stroke="#ffffff"
                                strokeWidth={1.5}
                              />
                            );
                          }}
                          activeDot={{ r: 5 }}
                        />
                        <Line type="monotone" dataKey="target" name="Target" stroke="var(--danger)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </WidgetErrorBoundary>
            </div>

            <div className="glass-card" style={{ padding: '20px' }}>
              <div className="chart-title" style={{ marginBottom: '16px' }}>Nilai Stok per Kategori</div>
              <WidgetErrorBoundary name="Grafik Valuasi Kategori">
                <div style={{ width: '100%', height: 260, minHeight: 260, position: 'relative' }}>
                  {pieData.length === 0 ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Belum ada data valuasi kategori
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260} minWidth={100} debounce={50}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} dataKey="value">
                          {pieData.map((entry, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatIDR(v)} contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </WidgetErrorBoundary>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '12px' }}>
                {pieData.map((entry, i) => (
                  <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Bar + Alerts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '20px' }}>
              <div className="chart-title" style={{ marginBottom: '16px' }}>5 Bahan Nilai Tertinggi</div>
              <WidgetErrorBoundary name="Grafik Kontributor Biaya">
                <div style={{ width: '100%', height: 300, minHeight: 300, position: 'relative' }}>
                  {contributorsData.length === 0 ? (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Belum ada data pemakaian.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300} minWidth={100} debounce={50}>
                      <BarChart data={contributorsData} layout="vertical" margin={{ top: 10, right: 15, left: -5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} />
                        <XAxis type="number" stroke="var(--text-muted)" tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 10 }} />
                        <YAxis dataKey="name" type="category" stroke="var(--text-muted)" tick={{ fontSize: 10 }} width={95} />
                        <Tooltip formatter={(v) => formatIDR(v)} contentStyle={tooltipStyle} />
                        <Bar dataKey="cost" fill="var(--warning)" radius={[0, 4, 4, 0]} name="Nilai (IDR)" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </WidgetErrorBoundary>
            </div>

            <div className="glass-card" style={{ padding: '24px' }}>
              <div className="chart-title">
                <span>Stok Menipis</span>
                {lowStockItems.length > 0 && <span className="badge badge-danger">{lowStockItems.length} bahan</span>}
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lowStockItems.length > 0 ? lowStockItems.slice(0, 8).map(item => {
                  const total = (item.qty_resto || 0) + (item.qty_central || 0);
                  return (
                    <div key={item.id ?? item.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--danger-glow)', border: '1px solid rgba(220, 38, 38, 0.12)', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                      <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.category}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '0.85rem' }}>{total.toFixed(0)} {item.unit}</div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="empty-state">
                    <CheckCircle size={40} style={{ color: 'var(--success)' }} />
                    <span>Semua stok aman</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
