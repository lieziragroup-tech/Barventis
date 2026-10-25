import React, { Suspense } from 'react';

const PosUpload = React.lazy(() => import('./PosUpload'));

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function BeverageSalesHub() {
  return (
    <Suspense fallback={<Loading />}>
      <PosUpload />
    </Suspense>
  );
}
