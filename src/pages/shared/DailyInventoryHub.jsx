import React, { Suspense } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ClipboardList, Trash2, AlertTriangle, Factory } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const DailyInventory = React.lazy(() => import('./DailyInventory'));
const UsageRecap = React.lazy(() => import('./UsageRecap'));
const WasteLogs = React.lazy(() => import('./WasteLogs'));
const ExpiryMonitor = React.lazy(() => import('./ExpiryMonitor'));
const MaterialProduction = React.lazy(() => import('./MaterialProduction'));


const TABS = [
  { key: 'bahan', label: 'Semua Bahan', icon: ClipboardList },
  { key: 'pemakaian', label: 'Rekap Pemakaian', icon: ClipboardList },
  { key: 'waste', label: 'Catatan Limbah', icon: Trash2 },
  { key: 'expiry', label: 'Pantau Kedaluwarsa', icon: AlertTriangle },
  { key: 'production', label: 'Proses Produksi', icon: Factory },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function DailyInventoryHub() {
  const { activeUser } = useAuth();
  const role = activeUser?.role === 'SuperAdmin' ? 'Super Admin' : activeUser?.role;
  const canUseProduction = ['Admin / Owner', 'Owner', 'Supervisor', 'Bar', 'Kitchen', 'Central'].includes(role);
  const visibleTabs = canUseProduction ? TABS : TABS.filter(tab => tab.key !== 'production');

  return (
    <TabContainer tabs={visibleTabs}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'bahan' && <DailyInventory />}
          {activeTab === 'pemakaian' && <UsageRecap />}
          {activeTab === 'waste' && <WasteLogs />}
          {activeTab === 'expiry' && <ExpiryMonitor />}
          {activeTab === 'production' && <MaterialProduction />}
        </Suspense>
      )}
    </TabContainer>
  );
}
