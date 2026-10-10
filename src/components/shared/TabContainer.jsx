import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reusable tab container for Hub pages.
 * Responsive capsule navigation with momentum scrolling, auto-centering active tab,
 * and adaptive fade gradient indicators.
 *
 * @param {{ tabs: { key: string, label: string, icon?: import('lucide-react').LucideIcon }[], children: (activeTab: string) => React.ReactNode }} props
 */
export default function TabContainer({ tabs, children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get('tab');
  const activeTab = tabs.find(t => t.key === paramTab)?.key || tabs[0]?.key;

  const scrollContainerRef = useRef(null);
  const activeTabRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;

    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll, tabs]);

  // Auto-center active tab into view smoothly
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
    // Re-check scroll indicators after tab switch
    const timer = setTimeout(checkScroll, 200);
    return () => clearTimeout(timer);
  }, [activeTab, checkScroll]);

  const handleTabChange = (key) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Scrollable Tab Bar with Fade Indicators */}
      <div style={{ position: 'relative', width: '100%', marginBottom: '18px' }} className="shrink-0">
        {/* Left Fade Gradient */}
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

        {/* Scrollable Container */}
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
              const Icon = tab.icon;
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
                  {Icon && <Icon size={15} style={{ flexShrink: 0 }} />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Fade Gradient */}
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

      <div role="tabpanel" style={{ width: '100%' }}>
        {children(activeTab)}
      </div>
    </div>
  );
}

