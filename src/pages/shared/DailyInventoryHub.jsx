import React, { Suspense } from 'react';
import { ClipboardList, Beer, TrendingUp, Trash2, AlertTriangle } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const DailyInventory = React.lazy(() => import('./DailyInventory'));
const QuickUsageLogger = React.lazy(() => import('../../components/shared/QuickUsageLogger'));
const UsageRecap = React.lazy(() => import('./UsageRecap'));
const WasteLogs = React.lazy(() => import('./WasteLogs'));
const ExpiryMonitor = React.lazy(() => import('./ExpiryMonitor'));


const TABS = [
  { key: 'quick-usage', label: 'Catat Pemakaian (Quick OUT)', icon: TrendingUp },
  { key: 'bahan', label: 'Semua Bahan', icon: ClipboardList },
  { key: 'pemakaian', label: 'Rekap Pemakaian', icon: ClipboardList },
  { key: 'waste', label: 'Catatan Limbah', icon: Trash2 },
  { key: 'expiry', label: 'Pantau Kedaluwarsa', icon: AlertTriangle },
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
          {activeTab === 'quick-usage' && <QuickUsageLogger />}
          {activeTab === 'bahan' && <DailyInventory />}
          {activeTab === 'pemakaian' && <UsageRecap />}
          {activeTab === 'waste' && <WasteLogs />}
          {activeTab === 'expiry' && <ExpiryMonitor />}
        </Suspense>
      )}
    </TabContainer>
  );
}
