import React, { Suspense } from 'react';
import { ClipboardList, Beer, TrendingUp, Trash2, AlertTriangle } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const DailyInventory = React.lazy(() => import('./DailyInventory'));
const UsageRecap = React.lazy(() => import('./UsageRecap'));
const WasteLogs = React.lazy(() => import('./WasteLogs'));
const ExpiryMonitor = React.lazy(() => import('./ExpiryMonitor'));

const TABS = [
  { key: 'bahan', label: 'Daily Inventory Bahan', icon: ClipboardList },
  { key: 'beer', label: 'Daily Inventory Beer', icon: Beer },
  { key: 'pemakaian', label: 'Pemakaian Harian', icon: TrendingUp },
  { key: 'waste', label: 'Buku Catatan Limbah (Waste Log)', icon: Trash2 },
  { key: 'expiry', label: 'Monitor Kedaluwarsa (FEFO)', icon: AlertTriangle },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function DailyInventoryHub() {
  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'bahan' && <DailyInventory category="BAHAN" />}
          {activeTab === 'beer' && <DailyInventory category="BEER" />}
          {activeTab === 'pemakaian' && <UsageRecap />}
          {activeTab === 'waste' && <WasteLogs />}
          {activeTab === 'expiry' && <ExpiryMonitor />}
        </Suspense>
      )}
    </TabContainer>
  );
}
