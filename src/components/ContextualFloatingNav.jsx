import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, ShoppingCart, FileText, Boxes, Warehouse, Wrench,
  Beer, TrendingUp, Trash2, AlertTriangle, Tag, Utensils, BarChart3,
  BookOpen, ArrowRightLeft, Settings, History, Calculator, FileSpreadsheet,
  Scissors, Package, UploadCloud, MonitorSmartphone
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
    { id: 'glass-tool', label: 'Alat', icon: Wrench },
    { id: 'adjustments', label: 'Audit', icon: FileText }
  ],
  '/dashboard/daily-inventory': [
    { id: 'bahan', label: 'Daily', icon: ClipboardList },
    { id: 'pemakaian', label: 'Pemakaian', icon: TrendingUp },
    { id: 'waste', label: 'Waste', icon: Trash2 },
    { id: 'expiry', label: 'Expiry', icon: AlertTriangle }
  ],
  '/dashboard/pricing-cogs': [
    { id: 'pricing', label: 'Pricing', icon: Tag },
    { id: 'cogs-beverage', label: 'Bev', icon: Utensils },
    { id: 'cogs-beer', label: 'Beer', icon: Beer },
    { id: 'engineering', label: 'Matrix', icon: BarChart3 }
  ],
  '/dashboard/sistem': [
    { id: 'stock-ledger', label: 'Ledger', icon: BookOpen },
    { id: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
    { id: 'config', label: 'Konfig', icon: Settings },
    { id: 'audit-backup', label: 'Audit', icon: History }
  ],
  '/dashboard/cost-report': [
    { id: 'cost-control', label: 'Cost', icon: Calculator },
    { id: 'laporan', label: 'Laporan', icon: FileSpreadsheet }
  ],
  '/dashboard/produksi': [
    { id: 'trimming', label: 'Trimming', icon: Scissors },
    { id: 'batching', label: 'Batching', icon: Package },
    { id: 'kalibrasi', label: 'Kalibrasi', icon: Scissors },
    { id: 'maintenance', label: 'Alat', icon: Wrench }
  ],
  '/dashboard/penjualan': [
    { id: 'upload', label: 'Upload', icon: UploadCloud },
    { id: 'raw', label: 'Raw Data', icon: FileText },
    { id: 'terminal', label: 'Terminal', icon: MonitorSmartphone }
  ]
};

export default function ContextualFloatingNav({ isSidebarOpen = false }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('');
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Detect virtual keyboard to avoid covering mobile keyboards
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

  // Do not show if no menu for this page
  if (!currentMenu) {
    return null;
  }

  const handleTabClick = (id) => {
    setActiveTab(id);
    const params = new URLSearchParams(location.search);
    params.set('tab', id);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  };

  return (
    <div className="lg:hidden pointer-events-none">
      <AnimatePresence>
        {!isSidebarOpen && !isKeyboardOpen && (
          <motion.nav
            layout
            key="morphing-dynamic-island"
            initial={{ opacity: 0, scale: 0.88, y: 32, x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.88, y: 28, x: '-50%' }}
            transition={{
              type: 'spring',
              stiffness: 420,
              damping: 30,
              mass: 0.6
            }}
            className="pointer-events-auto fixed bottom-6 left-1/2 z-[45] max-w-[94vw] bg-[var(--bg-secondary)]/95 backdrop-blur-2xl border border-[var(--border)]/80 shadow-[0_12px_36px_rgba(0,0,0,0.18)] rounded-full p-1.5 flex items-center gap-1.5 overflow-hidden select-none"
            style={{ touchAction: 'manipulation' }}
            aria-label="Navigasi Cepat Sub-Menu"
          >
            {currentMenu.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <motion.button
                  layout
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  whileTap={{ scale: 0.94 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 450, damping: 32 },
                    opacity: { duration: 0.2 }
                  }}
                  className={`relative flex items-center justify-center gap-2 rounded-full cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[var(--accent)] text-white font-bold shadow-md px-3.5 py-1.5 h-8.5'
                      : 'w-8.5 h-8.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/60'
                  }`}
                  title={item.label}
                  aria-label={item.label}
                >
                  <Icon size={16} className="shrink-0" />

                  <AnimatePresence mode="popLayout" initial={false}>
                    {isActive && (
                      <motion.span
                        key="label"
                        initial={{ opacity: 0, width: 0, scale: 0.9 }}
                        animate={{ opacity: 1, width: 'auto', scale: 1 }}
                        exit={{ opacity: 0, width: 0, scale: 0.9 }}
                        transition={{
                          type: 'spring',
                          stiffness: 450,
                          damping: 32
                        }}
                        className="text-xs tracking-tight whitespace-nowrap overflow-hidden inline-block"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
