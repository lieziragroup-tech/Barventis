import { lazyWithRetry } from '../../utils/lazyWithRetry';
import React, { Suspense } from 'react';
import { ClipboardList, Trash2, AlertTriangle, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const DailyInventory = lazyWithRetry(() => import('./DailyInventory'));
const UsageRecap = lazyWithRetry(() => import('./UsageRecap'));
const WasteLogs = lazyWithRetry(() => import('./WasteLogs'));
const ExpiryMonitor = lazyWithRetry(() => import('./ExpiryMonitor'));
const BeritaAcaraMonthly = lazyWithRetry(() => import('./BeritaAcaraMonthly'));

const TABS = [
  { key: 'bahan', label: 'Semua Bahan', icon: ClipboardList },
  { key: 'pemakaian', label: 'Rekap Pemakaian', icon: ClipboardList },
  { key: 'waste', label: 'Catatan Limbah', icon: Trash2 },
  { key: 'berita-acara', label: 'Berita Acara Bulanan (Waste & Gelas Pecah)', icon: FileText },
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
          {activeTab === 'bahan' && <DailyInventory />}
          {activeTab === 'pemakaian' && <UsageRecap />}
          {activeTab === 'waste' && <WasteLogs />}
          {activeTab === 'berita-acara' && <BeritaAcaraMonthly />}
          {activeTab === 'expiry' && <ExpiryMonitor />}
        </Suspense>
      )}
    </TabContainer>
  );
}
