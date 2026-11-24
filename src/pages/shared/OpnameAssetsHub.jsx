import { lazyWithRetry } from '../../utils/lazyWithRetry';
import React, { Suspense, useMemo } from 'react';
import { Boxes, Warehouse, Wrench, FileText } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';
import { useAuth } from '../../contexts/AuthContext';

const StockOpname = lazyWithRetry(() => import('./StockOpname'));
const SoGlassAndTool = lazyWithRetry(() => import('./SoGlassAndTool'));
const StockAdjustments = lazyWithRetry(() => import('./StockAdjustments'));

const ALL_TABS = [
  { key: 'resto', label: 'Opname Resto', icon: Boxes },
  { key: 'central', label: 'Opname Central', icon: Warehouse },
  { key: 'glass-tool', label: 'Gelas & Alat Bar', icon: Wrench },
  { key: 'adjustments', label: 'Selisih Stok', icon: FileText },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function OpnameAssetsHub() {
  const { activeUser } = useAuth();
  const roleLower = String(activeUser?.role || '').trim().toLowerCase();
  const subRoleUpper = String(activeUser?.sub_role || '').trim().toUpperCase();
  const hasDedicatedGlassSidebar = subRoleUpper === 'HEAD_BAR' || roleLower === 'head bar' || roleLower === 'service';

  // Hide Gelas & Alat Bar tab when the role already has a dedicated Gelas & Alat menu in the sidebar
  const visibleTabs = useMemo(
    () => (hasDedicatedGlassSidebar ? ALL_TABS.filter((t) => t.key !== 'glass-tool') : ALL_TABS),
    [hasDedicatedGlassSidebar]
  );

  return (
    <TabContainer tabs={visibleTabs}>
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'resto' && <StockOpname defaultLocation="RESTO" />}
          {activeTab === 'central' && <StockOpname defaultLocation="CENTRAL" />}
          {activeTab === 'glass-tool' && <SoGlassAndTool />}
          {activeTab === 'adjustments' && <StockAdjustments />}
        </Suspense>
      )}
    </TabContainer>
  );
}
