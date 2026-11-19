import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reusable tab container for Hub pages.
 * Responsive capsule navigation with momentum scrolling, auto-centering active tab,
 * and adaptive fade gradient indicators.
 * Automatically hides the tab bar when `hideTabs` is true or only 1 tab exists
 * (e.g., when navigation is already represented in the left sidebar).
 *
 * @param {{ tabs: { key: string, label: string, icon?: import('lucide-react').LucideIcon }[], hideTabs?: boolean, children: (activeTab: string) => React.ReactNode }} props
 */
export default function TabContainer({ tabs, hideTabs = false, children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get('tab');
  const activeTab = tabs.find(t => t.key === paramTab)?.key || tabs[0]?.key;

  const scrollContainerRef = useRef(null);
  const activeTabRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const shouldShowTabs = !hideTabs && tabs.length > 1;

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    if (!shouldShowTabs) return;
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;

    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, tabs, shouldShowTabs]);

  // Auto-center active tab into view smoothly
  useEffect(() => {
    if (!shouldShowTabs) return;
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
    const timer = setTimeout(checkScroll, 200);
    return () => clearTimeout(timer);
  }, [activeTab, checkScroll, shouldShowTabs]);

  const handleTabChange = (key) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {shouldShowTabs && (
        <div style={{ position: 'relative', width: '100%', marginBottom: '18px' }} className="shrink-0">
          {canScrollLeft && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                width: '28px',
                background: 'linear-gradient(to right, var(--bg-primary), transparent)',
                zIndex: 10,
                pointerEvents: 'none',
                transition: 'opacity 0.2s ease'
              }}
            />
          )}

          <div
            ref={scrollContainerRef}
            onScroll={checkScroll}
            style={{
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              padding: '2px 0'
            }}
            className="scrollbar-hide"
          >
            <div
              role="tablist"
              className="tab-capsule-nav"
              style={{
                display: 'inline-flex',
                width: 'max-content',
                background: 'var(--bg-tertiary)',
                padding: '3px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                gap: '3px'
              }}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    ref={isActive ? activeTabRef : null}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => handleTabChange(tab.key)}
                    className="tab-capsule-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      fontSize: '0.82rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      background: isActive ? 'var(--bg-secondary)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 0.15s ease',
                      minHeight: '32px'
                    }}
                  >
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {canScrollRight && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: '28px',
                background: 'linear-gradient(to left, var(--bg-primary), transparent)',
                zIndex: 10,
                pointerEvents: 'none',
                transition: 'opacity 0.2s ease'
              }}
            />
          )}
        </div>
      )}

      <div role="tabpanel" style={{ width: '100%' }}>
        {children(activeTab)}
      </div>
    </div>
  );
}
