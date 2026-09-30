import { useSearchParams } from 'react-router-dom';

/**
 * Reusable tab container for Hub pages.
 * Syncs active tab with ?tab= query param for backward-compat redirects.
 *
 * @param {{ tabs: { key: string, label: string, icon?: import('lucide-react').LucideIcon }[], children: (activeTab: string) => React.ReactNode }} props
 */
export default function TabContainer({ tabs, children }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get('tab');
  const activeTab = tabs.find(t => t.key === paramTab)?.key || tabs[0]?.key;

  const handleTabChange = (key) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '4px',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0',
          marginBottom: '20px',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabChange(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                fontSize: '0.82rem',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                borderRadius: '6px 6px 0 0',
                transition: 'all 0.15s ease',
              }}
            >
              {Icon && <Icon size={15} />}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" style={{ flex: 1, minHeight: 0 }}>
        {children(activeTab)}
      </div>
    </div>
  );
}
