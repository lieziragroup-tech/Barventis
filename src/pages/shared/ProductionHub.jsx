import React, { Suspense } from 'react';
import { Scissors, Package, Wrench } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const TrimmingProduction = React.lazy(() => import('./TrimmingProduction'));
const GrinderCalibration = React.lazy(() => import('./GrinderCalibration'));
const EquipmentMaintenance = React.lazy(() => import('./EquipmentMaintenance'));

const TABS = [
  { key: 'trimming', label: 'Kalkulator Susut & Trimming', icon: Scissors },
  { key: 'batching', label: 'Batching Porsi & Kemasan', icon: Package },
  { key: 'kalibrasi', label: 'Kalibrasi Grinder', icon: Scissors },
  { key: 'maintenance', label: 'Pemeliharaan Alat', icon: Wrench },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function ProductionHub() {
  return (
    <TabContainer tabs={TABS}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'trimming' && <TrimmingProduction initialFilter="STEP1" />}
          {activeTab === 'batching' && <TrimmingProduction initialFilter="STEP2" />}
          {activeTab === 'kalibrasi' && <GrinderCalibration />}
          {activeTab === 'maintenance' && <EquipmentMaintenance />}
        </Suspense>
      )}
    </TabContainer>
  );
}
