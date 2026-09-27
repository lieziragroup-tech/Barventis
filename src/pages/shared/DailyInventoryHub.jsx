import React, { useState, Suspense } from 'react';
import { ClipboardList, TrendingUp, Trash2, AlertTriangle, FileText, PlusCircle } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const DailyInventory = React.lazy(() => import('./DailyInventory'));
const UsageRecap = React.lazy(() => import('./UsageRecap'));
const WasteLogs = React.lazy(() => import('./WasteLogs'));
const ExpiryMonitor = React.lazy(() => import('./ExpiryMonitor'));

const TABS = [
  { key: 'inventory', label: 'Daily Inventory (Bahan & Beer)', icon: ClipboardList },
  { key: 'pemakaian', label: 'Pemakaian Harian', icon: TrendingUp },
  { key: 'waste', label: 'Buku Catatan Limbah (Waste Log)', icon: Trash2 },
  { key: 'expiry', label: 'Monitor Kedaluwarsa (FEFO)', icon: AlertTriangle },
];

const INVENTORY_MODES = [
  { key: 'REKAP', label: 'Rekap Harian', icon: FileText },
  { key: 'EOD', label: 'Input EOD', icon: PlusCircle }
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function DailyInventoryHub() {
  const [eodMode, setEodMode] = useState('REKAP');

  return (
    <TabContainer 
      tabs={TABS}
      title="Daily Inventory Hub"
      subModes={INVENTORY_MODES}
      activeSubMode={eodMode}
      onSelectSubMode={setEodMode}
    >
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {(activeTab === 'inventory' || activeTab === 'bahan' || activeTab === 'beer') && (
            <DailyInventory category="ALL" externalTab={eodMode} onTabChange={setEodMode} />
          )}
          {activeTab === 'pemakaian' && <UsageRecap />}
          {activeTab === 'waste' && <WasteLogs />}
          {activeTab === 'expiry' && <ExpiryMonitor />}
        </Suspense>
      )}
    </TabContainer>
  );
}
