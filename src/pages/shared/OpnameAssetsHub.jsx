import React, { Suspense } from 'react';
import { Boxes, Warehouse, Wrench, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const StockOpname = React.lazy(() => import('./StockOpname'));
const AssetManagement = React.lazy(() => import('./AssetManagement'));
const StockAdjustments = React.lazy(() => import('./StockAdjustments'));

const TABS = [
  { key: 'resto', label: 'Stock Opname Resto', icon: Boxes },
  { key: 'central', label: 'Stock Opname Central', icon: Warehouse },
  { key: 'glass-tool', label: 'SO Glass & Tool (Peralatan Bar)', icon: Wrench },
  { key: 'adjustments', label: 'Audit Selisih Stok', icon: FileText },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function OpnameAssetsHub() {
  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'resto' && <StockOpname defaultLocation="RESTO" />}
          {activeTab === 'central' && <StockOpname defaultLocation="CENTRAL" />}
          {activeTab === 'glass-tool' && <AssetManagement />}
          {activeTab === 'adjustments' && <StockAdjustments />}
        </Suspense>
      )}
    </TabContainer>
  );
}
