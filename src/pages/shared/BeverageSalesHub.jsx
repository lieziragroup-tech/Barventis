import React, { Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, MonitorSmartphone } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';
import { useData } from '../../contexts/DataContext';

const PosUpload = React.lazy(() => import('./PosUpload'));
const PosRawData = React.lazy(() => import('./PosRawData'));

const TABS = [
  { key: 'upload', label: 'Upload File POS (ESB)', icon: UploadCloud },
  { key: 'raw', label: 'Riwayat & Data Mentah POS', icon: FileText },
  { key: 'terminal', label: 'Terminal Kasir (POS Web)', icon: MonitorSmartphone },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function BeverageSalesHub() {
  const navigate = useNavigate();
  const { currentTenant } = useData();

  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'upload' && <PosUpload />}
          {activeTab === 'raw' && <PosRawData />}
          {activeTab === 'terminal' && (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <MonitorSmartphone size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
              <h3 style={{ marginBottom: '8px', fontWeight: 700 }}>Terminal Kasir (POS Web)</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '20px', fontSize: '0.9rem' }}>
                Antarmuka kasir fullscreen untuk pencatatan transaksi manual.
              </p>
              <button
                onClick={() => navigate('/dashboard/pos-terminal')}
                disabled={!currentTenant?.is_pos_enabled}
                style={{
                  padding: '10px 24px',
                  background: 'var(--accent)',
                  color: 'var(--text-inverse)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: currentTenant?.is_pos_enabled ? 'pointer' : 'not-allowed',
                  opacity: currentTenant?.is_pos_enabled ? 1 : 0.5,
                }}
              >
                {currentTenant?.is_pos_enabled ? 'Buka Terminal Kasir' : 'POS Belum Diaktifkan'}
              </button>
            </div>
          )}
        </Suspense>
      )}
    </TabContainer>
  );
}
