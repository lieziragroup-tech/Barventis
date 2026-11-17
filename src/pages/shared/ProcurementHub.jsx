import { lazyWithRetry } from '../../utils/lazyWithRetry';
import React, { Suspense, useMemo } from 'react';
import { ClipboardList, ShoppingCart, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';
import { useAuth } from '../../contexts/AuthContext';

const Marketlist = lazyWithRetry(() => import('./Marketlist'));
const Purchasing = lazyWithRetry(() => import('./Purchasing'));
const Invoicing = lazyWithRetry(() => import('./Invoicing'));

const ALL_TABS = [
  { key: 'invoicing', label: 'PO & Persetujuan Owner', icon: FileText },
  { key: 'marketlist', label: 'Katalog Bahan & Komparasi Efisiensi', icon: ClipboardList },
  { key: 'pembelian', label: 'Pembelian Harian & Master Supplier', icon: ShoppingCart },
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
  const isBranchDivisionRole = ['bar', 'barista', 'kitchen', 'service', 'kasir', 'staff'].includes(role);

  const visibleTabs = useMemo(() => {
    return isBranchDivisionRole ? BRANCH_DIVISION_TABS : ALL_TABS;
  }, [isBranchDivisionRole]);

  return (
    <TabContainer tabs={visibleTabs} defaultTab="invoicing">
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'marketlist' && !isBranchDivisionRole && <Marketlist />}
          {activeTab === 'pembelian' && !isBranchDivisionRole && <Purchasing />}
          {(activeTab === 'invoicing' || isBranchDivisionRole) && <Invoicing />}
        </Suspense>
      )}
    </TabContainer>
  );
}
