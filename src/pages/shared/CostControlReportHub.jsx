import React, { Suspense } from 'react';
const CostControl = React.lazy(() => import('./CostControl'));

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function CostControlReportHub() {
  return (
    <Suspense fallback={<Loading />}>
      <CostControl />
    </Suspense>
  );
}
