import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, ShoppingCart, FileText, Boxes, Warehouse,
  Trash2, AlertTriangle, Tag, Utensils, BarChart3,
  BookOpen, ArrowRightLeft, Settings, History, Calculator, FileSpreadsheet,
  UploadCloud, MonitorSmartphone
} from 'lucide-react';

const MENU_MAP = {
  '/dashboard/procurement': [
    { id: 'marketlist', label: 'Marketlist', icon: ClipboardList },
    { id: 'pembelian', label: 'Pembelian', icon: ShoppingCart },
    { id: 'invoicing', label: 'Invoicing', icon: FileText }
  ],
  '/dashboard/opname-assets': [
    { id: 'resto', label: 'Resto', icon: Boxes },
    { id: 'central', label: 'Central', icon: Warehouse },
    { id: 'adjustments', label: 'Audit', icon: FileText }
  ],
  '/dashboard/daily-inventory': [
    { id: 'bahan', label: 'Semua', icon: ClipboardList },
    { id: 'pemakaian', label: 'Rekap', icon: ClipboardList },
    { id: 'waste', label: 'Limbah', icon: Trash2 },
    { id: 'expiry', label: 'Expired', icon: AlertTriangle }
  ],
  '/dashboard/pricing-cogs': [
    { id: 'pricing', label: 'Pricing', icon: Tag },
    { id: 'cogs-all', label: 'COGS', icon: Utensils },
    { id: 'engineering', label: 'Matrix', icon: BarChart3 }
  ],
  '/dashboard/sistem': [
    { id: 'stock-ledger', label: 'Ledger', icon: BookOpen },
    { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
    { id: 'config', label: 'Konfig', icon: Settings },
    { id: 'audit-backup', label: 'Audit', icon: History }
  ],
  '/dashboard/cost-report': [
    { id: 'cost-control', label: 'Cost Control', icon: Calculator }
  ],
  '/dashboard/penjualan': [
    { id: 'upload', label: 'Upload POS', icon: UploadCloud }
  ]
};

export default function ContextualFloatingNav({ isSidebarOpen = false }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Detect virtual keyboard on mobile to avoid overlapping
  useEffect(() => {
    const handleResize = () => {
      setIsKeyboardOpen(window.innerHeight < 500);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const path = location.pathname.endsWith('/') ? location.pathname.slice(0, -1) : location.pathname;
  const currentMenu = MENU_MAP[path];

  // Sync activeTab from URL search params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    } else if (currentMenu && currentMenu.length > 0) {
      setActiveTab(currentMenu[0].id);
    }
  }, [location.search, currentMenu]);

  // Do not show if no menu for this page, or if mobile sidebar is open, or if virtual keyboard is active
  if (!currentMenu || currentMenu.length <= 1 || isSidebarOpen || isKeyboardOpen) {
    return null;
  }

  const handleTabClick = (id) => {
    setActiveTab(id);
    const params = new URLSearchParams(location.search);
    params.set('tab', id);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  return (
    <div className="xl:hidden fixed bottom-16 md:bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none max-w-[95vw]">
      <motion.nav
        initial={{ opacity: 0, y: 16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.95 }}
        transition={{
          type: 'spring',
          stiffness: 450,
          damping: 32,
          mass: 0.7
        }}
        className="pointer-events-auto bg-white/95 dark:bg-[var(--bg-secondary)]/95 text-[var(--text-primary)] backdrop-blur-2xl border border-[var(--border)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.3)] rounded-full p-1.5 flex items-center gap-1 sm:gap-1.5 overflow-hidden"
        style={{ touchAction: 'manipulation' }}
        aria-label="Navigasi Dynamic Island Sub-Menu"
      >
        {currentMenu.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <motion.button
              key={item.id}
              layout
              type="button"
              onClick={() => handleTabClick(item.id)}
              whileTap={{ scale: 0.92 }}
              transition={{
                layout: { type: 'spring', stiffness: 500, damping: 35 },
                opacity: { duration: 0.15 }
              }}
              className={`relative flex items-center justify-center gap-2 rounded-full cursor-pointer transition-colors ${
                isActive
                  ? 'bg-[var(--accent,#059669)] hover:bg-[var(--accent-hover,#047857)] text-white font-semibold shadow-[0_2px_10px_rgba(5,150,105,0.25)] px-3.5 py-1.5 h-9 sm:h-9.5'
                  : 'w-9 h-9 sm:w-9.5 sm:h-9.5 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30'
              }`}
              title={item.label}
              aria-label={item.label}
            >
              <Icon size={17} className={`shrink-0 ${isActive ? 'text-white' : 'text-[var(--text-secondary)]'}`} />

              <AnimatePresence mode="popLayout" initial={false}>
                {isActive && (
                  <motion.span
                    key={`label-${item.id}`}
                    initial={{ opacity: 0, width: 0, scale: 0.9 }}
                    animate={{ opacity: 1, width: 'auto', scale: 1 }}
                    exit={{ opacity: 0, width: 0, scale: 0.9 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 35
                    }}
                    className="text-xs sm:text-sm font-medium tracking-tight whitespace-nowrap overflow-hidden inline-block"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </motion.nav>
    </div>
  );
}
