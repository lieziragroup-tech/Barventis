import React, { useRef, useEffect, useState, useCallback } from 'react';
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

  const containerRef = useRef(null);
  const tabRefs = useRef({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  const handleTabChange = (key) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  // Center active tab smoothly on change or mount
  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
  }, [activeTab]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll, tabs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Sub-menu capsule navigation */}
      <div className="hub-nav-wrapper">
        {/* Left edge gradient fade indicator */}
        {canScrollLeft && (
          <div 
            className="pointer-events-none absolute left-0 top-0 bottom-[8px] md:bottom-[12px] w-6 z-10 bg-gradient-to-r from-[var(--bg-primary)] to-transparent transition-opacity duration-200"
            aria-hidden="true"
          />
        )}

        <div ref={containerRef} className="hub-nav-container">
          <div role="tablist" className="hub-tabs-pills">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  ref={(el) => { tabRefs.current[tab.key] = el; }}
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

        {/* Right edge gradient fade indicator */}
        {canScrollRight && (
          <div 
            className="pointer-events-none absolute right-0 top-0 bottom-[8px] md:bottom-[12px] w-8 z-10 bg-gradient-to-l from-[var(--bg-primary)] to-transparent transition-opacity duration-200"
            aria-hidden="true"
          />
        )}
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
