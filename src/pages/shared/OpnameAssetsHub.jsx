import { lazyWithRetry } from '../../utils/lazyWithRetry';
import React, { Suspense } from 'react';
import { Boxes, Warehouse, Wrench, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const StockOpname = lazyWithRetry(() => import('./StockOpname'));
const StockAdjustments = lazyWithRetry(() => import('./StockAdjustments'));

const TABS = [
  { key: 'resto', label: 'Opname Resto', icon: Boxes },
  { key: 'central', label: 'Opname Central', icon: Warehouse },
  { key: 'adjustments', label: 'Audit Selisih', icon: FileText },
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
                    {activeTab === 'adjustments' && <StockAdjustments />}
        </Suspense>
      )}
    </TabContainer>
  );
}
