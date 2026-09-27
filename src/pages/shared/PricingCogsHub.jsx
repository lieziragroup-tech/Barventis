import React, { Suspense } from 'react';
import { Tag, Utensils, Beer, BarChart3 } from 'lucide-react';
import TabContainer from '../../components/shared/TabContainer';

const MenuPricing = React.lazy(() => import('./MenuPricing'));
const Recipes = React.lazy(() => import('./Recipes'));
const MenuEngineering = React.lazy(() => import('./MenuEngineering'));

const TABS = [
  { key: 'pricing', label: 'Menu Pricing & Simulasi Margin', icon: Tag },
  { key: 'cogs', label: 'COGS & Resep (Beverage & Beer)', icon: Utensils },
  { key: 'engineering', label: 'Menu Engineering Matrix', icon: BarChart3 },
];

const Loading = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
    Memuat...
  </div>
);

export default function PricingCogsHub() {
  return (
    <TabContainer tabs={TABS} title="Menu Pricing & COGS">
      {(activeTab) => (
        <Suspense fallback={<Loading />}>
          {activeTab === 'pricing' && <MenuPricing />}
          {(activeTab === 'cogs' || activeTab === 'cogs-beverage' || activeTab === 'cogs-beer') && (
            <Recipes categoryFilter="ALL" />
          )}
          {activeTab === 'engineering' && <MenuEngineering />}
        </Suspense>
      )}
    </TabContainer>
  );
}
