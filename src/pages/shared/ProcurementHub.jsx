import React, { Suspense } from 'react';
import { ClipboardList, ShoppingCart, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const Marketlist = React.lazy(() => import('./Marketlist'));
const Purchasing = React.lazy(() => import('./Purchasing'));
const Invoicing = React.lazy(() => import('./Invoicing'));

const TABS = [
  { key: 'marketlist', label: 'Marketlist (Daftar Belanja)', icon: ClipboardList },
  { key: 'pembelian', label: 'Pembelian Harian', icon: ShoppingCart },
  { key: 'invoicing', label: 'Penerimaan Barang & Invoicing', icon: FileText },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function ProcurementHub() {
  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'marketlist' && <Marketlist />}
          {activeTab === 'pembelian' && <Purchasing />}
          {activeTab === 'invoicing' && <Invoicing />}
        </Suspense>
      )}
    </TabContainer>
  );
}
