import React, { Suspense } from 'react';
import { BookOpen, ArrowRightLeft, Settings, History } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const StockLedger = React.lazy(() => import('./StockLedger'));
const InterBranchTransfer = React.lazy(() => import('./InterBranchTransfer'));
const TenantAdminPanel = React.lazy(() => import('../owner/TenantAdminPanel'));
const AuditLogs = React.lazy(() => import('./AuditLogs'));
const BackupCenter = React.lazy(() => import('./BackupCenter'));
const Maintenance = React.lazy(() => import('./Maintenance'));

const TABS = [
  { key: 'stock-ledger', label: 'Buku Stok (Stock Ledger)', icon: BookOpen },
  { key: 'transfer', label: 'Mutasi Antar Cabang', icon: ArrowRightLeft },
  { key: 'config', label: 'Konfigurasi Toko & Role RBAC', icon: Settings },
  { key: 'audit-backup', label: 'Audit Trail & Backup Data', icon: History },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function SystemAdminHub() {
  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'stock-ledger' && <StockLedger />}
          {activeTab === 'transfer' && <InterBranchTransfer />}
          {activeTab === 'config' && <TenantAdminPanel />}
          {activeTab === 'audit-backup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              <AuditLogs />
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <BackupCenter />
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '24px' }}>
                <Maintenance />
              </div>
            </div>
          )}
        </Suspense>
      )}
    </TabContainer>
  );
}
