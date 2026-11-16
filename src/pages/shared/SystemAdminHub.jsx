import { lazyWithRetry } from '../../utils/lazyWithRetry';
import React, { Suspense, useState } from 'react';
import { BookOpen, ArrowRightLeft, Settings, Database, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';
import { useAuth } from '../../contexts/AuthContext';

const StockLedger = lazyWithRetry(() => import('./StockLedger'));
const InterBranchTransfer = lazyWithRetry(() => import('./InterBranchTransfer'));
const TenantAdminPanel = lazyWithRetry(() => import('../owner/TenantAdminPanel'));
const AuditLogs = lazyWithRetry(() => import('./AuditLogs'));
const BackupCenter = lazyWithRetry(() => import('./BackupCenter'));

const TABS = [
  { key: 'stock-ledger', label: 'Buku Stok', icon: BookOpen },
  { key: 'transfer', label: 'Mutasi Gudang', icon: ArrowRightLeft },
  { key: 'config', label: 'Akses & Toko', icon: Settings },
  { key: 'audit-backup', label: 'Backup & Keamanan', icon: Database },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function SystemAdminHub() {
  const { activeUser } = useAuth();
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  const rawRole = String(activeUser?.role || '').trim();
  const isOwnerOrAdmin = ['SuperAdmin', 'Super Admin', 'Admin / Owner', 'Admin  Owner', 'Owner'].includes(rawRole);

  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'stock-ledger' && <StockLedger />}
          {activeTab === 'transfer' && <InterBranchTransfer />}
          {activeTab === 'config' && <TenantAdminPanel />}
          {activeTab === 'audit-backup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <BackupCenter />

              {isOwnerOrAdmin && (
                <div className="glass-card" style={{ padding: '20px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ padding: '8px', borderRadius: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                        <ShieldAlert size={18} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Log Audit Sistem (Opsional — Khusus Owner / Admin)
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Disembunyikan secara default agar tampilan tetap bersih. Buka hanya saat perlu memeriksa jejak aktivitas.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`btn ${showAuditTrail ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '8px 14px' }}
                      onClick={() => setShowAuditTrail(prev => !prev)}
                    >
                      {showAuditTrail ? <EyeOff size={15} /> : <Eye size={15} />}
                      <span>{showAuditTrail ? 'Sembunyikan Audit Trail' : 'Tampilkan Audit Trail'}</span>
                    </button>
                  </div>

                  {showAuditTrail && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                      <AuditLogs />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Suspense>
      )}
    </TabContainer>
  );
}
