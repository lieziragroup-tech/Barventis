import { lazyWithRetry } from '../../utils/lazyWithRetry';
import React, { Suspense, useMemo } from 'react';
import { ClipboardList, ShoppingCart, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';
import { useAuth } from '../../contexts/AuthContext';

const Marketlist = lazyWithRetry(() => import('./Marketlist'));
const Purchasing = lazyWithRetry(() => import('./Purchasing'));
const Invoicing = lazyWithRetry(() => import('./Invoicing'));

const ALL_TABS = [
  { key: 'invoicing', label: 'Pembuatan PO & Penerimaan', icon: FileText },
  { key: 'marketlist', label: 'Komparasi Harga & Efisiensi Bahan', icon: ClipboardList },
  { key: 'pembelian', label: 'Master Supplier & Belanja Harian', icon: ShoppingCart },
];

const CENTRAL_TABS = [
  { key: 'invoicing', label: 'PO Central & Penerimaan Barang (Goods Receipt)', icon: FileText },
];

const BRANCH_DIVISION_TABS = [
  { key: 'invoicing', label: 'Permintaan PO Cabang & Penerimaan Barang (Goods Receipt)', icon: FileText },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function ProcurementHub() {
  const { activeUser } = useAuth();
  const role = String(activeUser?.role || '').trim().toLowerCase();
  const isPurchasingRole = role === 'purchasing';
  const isCentralRole = role === 'central';
  const isBranchDivisionRole = ['bar', 'barista', 'head bar', 'rekan bar', 'kitchen', 'service', 'kasir', 'staff'].includes(role);
  const isSingleInvoicingView = isCentralRole || isBranchDivisionRole;

  // Hide top sub-menu tabs when all routes are already represented in the left sidebar
  // (Purchasing sidebar already exposes Pembuatan PO, Komparasi Harga, and Supplier directly)
  const hideDuplicateSidebarTabs = isPurchasingRole || isSingleInvoicingView;

  const visibleTabs = useMemo(() => {
    if (isCentralRole) return CENTRAL_TABS;
    if (isBranchDivisionRole) return BRANCH_DIVISION_TABS;
    return ALL_TABS;
  }, [isCentralRole, isBranchDivisionRole]);

  return (
    <TabContainer tabs={visibleTabs} hideTabs={hideDuplicateSidebarTabs} defaultTab="invoicing">
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'marketlist' && !isSingleInvoicingView && <Marketlist />}
          {activeTab === 'pembelian' && !isSingleInvoicingView && <Purchasing />}
          {(activeTab === 'invoicing' || isSingleInvoicingView) && <Invoicing />}
        </Suspense>
      )}
    </TabContainer>
  );
}
