import React, { Suspense } from 'react';
import { Calculator, FileSpreadsheet } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const CostControl = React.lazy(() => import('./CostControl'));
const BaristaReport = React.lazy(() => import('./BaristaReport'));

const TABS = [
  { key: 'cost-control', label: 'Cost Control & Variansi Biaya', icon: Calculator },
  { key: 'laporan', label: 'Laporan SO Barista (13 Sheet Export)', icon: FileSpreadsheet },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function CostControlReportHub() {
  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'cost-control' && <CostControl />}
          {activeTab === 'laporan' && <BaristaReport />}
        </Suspense>
      )}
    </TabContainer>
  );
}
