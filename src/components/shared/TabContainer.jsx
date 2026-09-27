import React from 'react';
import { useSearchParams } from 'react-router-dom';
import OperaGXFloatingMenu from './OperaGXFloatingMenu';

/**
 * Reusable tab container for Hub pages.
 * Syncs active tab with ?tab= query param for backward-compat redirects.
 * Includes the Opera GX style floating menu as an on-click quick switcher alternative.
 *
 * @param {{ 
 *   tabs: { key: string, label: string, icon?: import('lucide-react').LucideIcon }[], 
 *   title?: string,
 *   subModes?: { key: string, label: string, icon?: import('lucide-react').LucideIcon }[],
 *   activeSubMode?: string,
 *   onSelectSubMode?: (key: string) => void,
 *   children: (activeTab: string, helpers?: { activeTab: string, handleTabChange: (key: string) => void }) => React.ReactNode 
 * }} props
 */
export default function TabContainer({ 
  tabs, 
  title, 
  subModes, 
  activeSubMode, 
  onSelectSubMode, 
  children 
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get('tab');
  const activeTab = tabs.find(t => t.key === paramTab)?.key || tabs[0]?.key;

  const handleTabChange = (key) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Sub-menu capsule navigation */}
      <div className="hub-nav-wrapper">
        <div className="hub-nav-container">
          <div role="tablist" className="hub-tabs-pills">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.key)}
                  className={`hub-tab-item ${isActive ? 'hub-tab-item-active' : ''}`}
                >
                  {Icon && (
                    <Icon
                      size={14}
                      className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                    />
                  )}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div role="tabpanel" style={{ flex: 1, minHeight: 0 }}>
        {typeof children === 'function' ? children(activeTab, { activeTab, handleTabChange }) : children}
      </div>

      {/* Opera GX Style Floating Sub-Header Quick Switcher */}
      <OperaGXFloatingMenu
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={handleTabChange}
        title={title || 'Pilih Sub-Header'}
        subModes={subModes}
        activeSubMode={activeSubMode}
        onSelectSubMode={onSelectSubMode}
      />
    </div>
  );
}
