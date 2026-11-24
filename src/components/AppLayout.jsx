import { getSidebarGroupsForRole } from '../config/sidebarMenuConfig';
import { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, Bell, X, RefreshCw, Menu,
  LayoutDashboard, ClipboardList, UploadCloud,
  Tag, ShoppingCart, Boxes, Package,
  Calculator, Settings, Wrench, Building2, Layout, Edit, MonitorSmartphone, BookOpen, Clock, Box, Scissors, FileSpreadsheet, Warehouse, Trash2, ArrowRightLeft, Store, Pin, PinOff
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { api } from '../services/api';
import Onboarding from './Onboarding';
import ContextualFloatingNav from './ContextualFloatingNav';
import GuidebookModal from './GuidebookModal';
import RoleSpotlightGuide from './RoleSpotlightGuide';
import UrgentRecapModal from './UrgentRecapModal';
import { buildUrgentRecap } from '../services/modules/urgentRecapUtils';
import WidgetErrorBoundary from './WidgetErrorBoundary';
import barventisIcon from '../assets/barventis-icon.png';

const DEFAULT_HUB_TABS = {
  '/dashboard/procurement': 'invoicing',
  '/dashboard/daily-inventory': 'bahan',
  '/dashboard/pricing-cogs': 'cogs-all',
  '/dashboard/sistem': 'stock-ledger',
};

const ROLE_SIDEBAR_CONFIG = {
  Central: {
    groupTitle: 'Divisi Central & Logistik',
    items: (basePath) => [
      { to: basePath, exact: true, label: 'Dashboard Central', subtitle: 'Arus barang masuk, keluar & tujuan mutasi', icon: LayoutDashboard },
      { to: `${basePath}/transfer`, label: 'Mutasi ke Cabang', subtitle: 'Distribusi stok dari Central ke cabang tujuan', icon: ArrowRightLeft },
      { to: `${basePath}/procurement?tab=invoicing`, label: 'PO Central', subtitle: 'Pantau PO Central & penerimaan barang', icon: ShoppingCart },
      { to: `${basePath}/sistem?tab=stock-ledger`, label: 'Stok', subtitle: 'Pantau stok Central & seluruh cabang', icon: Boxes },
    ],
  },
  Purchasing: {
    groupTitle: 'Divisi Purchasing & PO',
    items: (basePath) => [
      { to: `${basePath}/procurement?tab=invoicing`, label: 'Pembuatan PO', subtitle: 'Buat PO baru, review cabang & ACC Owner', icon: ShoppingCart },
      { to: basePath, exact: true, label: 'Total PO Bulanan', subtitle: 'Ringkasan total nilai & dokumen PO bulan ini', icon: LayoutDashboard },
      { to: `${basePath}/procurement?tab=marketlist`, label: 'Komparasi Harga', subtitle: 'Analisis efisiensi harga & kualitas supplier', icon: Tag },
      { to: `${basePath}/procurement?tab=pembelian`, label: 'Supplier', subtitle: 'Direktori master supplier & pencatatan belanja', icon: Building2 },
    ],
  },
};

const NavItem = ({ to, exact, label, subtitle, icon: Icon, isHovered, onClick }) => {
  const location = useLocation();
  const tooltipText = subtitle ? `${label} — ${subtitle}` : label;

  const [targetPathname, targetQuery = ''] = String(to || '').split('?');
  const targetParams = new URLSearchParams(targetQuery);
  const targetTab = targetParams.get('tab');

  const isQueryMatch = () => {
    if (!targetTab) {
      // If link has no ?tab=, avoid matching when current URL explicitly has ?tab=waste or ?tab=berita-acara on daily-inventory
      const currentTab = new URLSearchParams(location.search).get('tab');
      if (targetPathname.endsWith('/daily-inventory') && (currentTab === 'waste' || currentTab === 'berita-acara')) {
        return false;
      }
      return true;
    }
    const currentTab = new URLSearchParams(location.search).get('tab') || DEFAULT_HUB_TABS[targetPathname] || '';
    return currentTab === targetTab;
  };

  return (
    <div className="block w-full mb-0.5">
      <NavLink
        to={to}
        end={exact}
        onClick={onClick}
        className={({ isActive }) => {
          const active = isActive && isQueryMatch();
          return `group flex items-center px-3 py-2 rounded-lg transition-colors duration-150 outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            active
              ? 'bg-[var(--accent-glow)] text-[var(--accent)] font-semibold'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] font-medium'
          }`;
        }}
        style={{ textDecoration: 'none' }}
        title={tooltipText}
      >
        <div className="min-w-[22px] flex items-center justify-center flex-shrink-0">
          {Icon && <Icon size={17} strokeWidth={1.9} />}
        </div>
        <span
          className="whitespace-nowrap ml-3 text-[13px] leading-tight truncate"
          style={{
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'translateX(0)' : 'translateX(-6px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
            pointerEvents: isHovered ? 'auto' : 'none'
          }}
        >
          {label}
        </span>
      </NavLink>
    </div>
  );
};

const NavGroup = ({ title, children, isFirst, isHovered }) => {
  return (
    <div className="nav-group mb-1">
      {!isFirst && (
        <div className="px-3 my-1.5">
          <div className="border-t border-[var(--border)] opacity-60"></div>
        </div>
      )}
      {title && (
        <div
          className="px-3 pt-1 pb-1 overflow-hidden whitespace-nowrap"
          style={{
            height: isHovered ? '22px' : '0px',
            opacity: isHovered ? 1 : 0,
            transition: 'height 0.2s ease, opacity 0.18s ease'
          }}
        >
          <span className="text-[10px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
            {title}
          </span>
        </div>
      )}
      <div className="flex flex-col px-2">
        {children}
      </div>
    </div>
  );
};


export default function DashboardLayout() {
  const { activeUser, tenantName, logout, checkCurrentAuth } = useAuth();
  const {
    loadingData, stock, refreshData, currentTenant, showToast,
    branches, activeBranch, activeBranchId, canSwitchBranch, switchBranch
  } = useData();
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSidebarLocked, setIsSidebarLocked] = useState(() => {
    try {
      return localStorage.getItem('bv_sidebar_locked_v1') === 'true';
    } catch {
      return false;
    }
  });
  const toggleSidebarLock = () => {
    setIsSidebarLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('bv_sidebar_locked_v1', next ? 'true' : 'false');
      } catch {}
      return next;
    });
  };
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Show onboarding for non-Super-Admin users who haven't dismissed it
    // this session and have no stock data yet (first-time setup guidance).
    // Original rar condition checked `activeUser?.role === 'owner'`
    // (lowercase) — actual role values are 'Admin / Owner' / 'Staff' / etc,
    // so that comparison never matched anything and onboarding never showed
    // for anyone. Fixed to match barventis-vercel-repo's working logic.
    // Auto-open RoleSpotlightGuide 1x saat user baru pertama kali masuk (dilacak per activeUser.id)
    if (!loadingData && activeUser?.id && activeUser?.role !== 'Super Admin' && activeUser?.role !== 'SuperAdmin') {
      try {
        const seenKey = `barventis_spotlight_done_${activeUser.id}`;
        if (localStorage.getItem(seenKey) !== 'true') {
          setSpotlightMode((prev) => (prev === 'idle' ? 'prompt' : prev));
        }
      } catch {
        // ignore storage errors
      }
    }
  }, [loadingData, stock, activeUser]);

  const [showGuidebook, setShowGuidebook] = useState(false);
  const [spotlightMode, setSpotlightMode] = useState('idle');
  const isSidebarExpanded = isHovered || isSidebarLocked || spotlightMode === 'tour';
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [poReminders, setPoReminders] = useState([]);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [showBetaMenu, setShowBetaMenu] = useState(false);
  const [betaSwitchingKey, setBetaSwitchingKey] = useState('');
  const [seedingDummy, setSeedingDummy] = useState(false);

  const userMenuRef = useRef(null);
  const notifRef = useRef(null);
  const betaMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (betaMenuRef.current && !betaMenuRef.current.contains(event.target)) {
        setShowBetaMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Role-check logic merged from barventis-vercel-repo (exact match, not
  // substring match). rar's original `.includes('admin')` check made every
  // Super Admin ALSO match isOwner (since 'superadmin' contains 'admin'),
  // bleeding Owner-only nav items into the Super Admin sidebar. The actual
  // invite flow (TenantAdminPanel.jsx, AuthScreen.jsx) only ever assigns
  // 'Staff', 'Admin / Owner', or 'Super Admin' / 'SuperAdmin' — so exact
  // match here is not a behavior regression, it's the bug fix.
  const rawRole = String(activeUser?.role || '').trim();
  const rawRoleLower = rawRole.toLowerCase();
  const subRoleUpper = String(activeUser?.sub_role || '').trim().toUpperCase();
  const isRekanBarExplicit = rawRoleLower === 'rekan bar' || subRoleUpper === 'REKAN_BAR';
  const isHeadBarUser = !isRekanBarExplicit && (subRoleUpper === 'HEAD_BAR' || rawRoleLower === 'head bar');
  const role = (rawRole === 'SuperAdmin' || rawRoleLower === 'super admin')
    ? 'Super Admin'
    : (rawRole === 'Admin  Owner' || rawRoleLower.includes('owner'))
      ? 'Admin / Owner'
      : (rawRoleLower === 'barista' || rawRoleLower === 'bar' || rawRoleLower === 'head bar' || rawRoleLower === 'rekan bar')
        ? 'Bar'
        : rawRole;
  const isSuperAdmin = role === 'Super Admin';
  const isTenant = Boolean(role && role !== 'Super Admin' && role !== 'SuperAdmin');
  const basePath = isSuperAdmin ? '/superadmin' : '/dashboard';

  const hasAccess = (allowedRoles) => allowedRoles.includes(role) || allowedRoles.includes(rawRole);

  const sidebarGroups = useMemo(() => getSidebarGroupsForRole({
    role,
    isHeadBarUser,
    isSuperAdmin,
    isTenant,
    basePath,
    canAccessSettings: hasAccess(['Admin / Owner', 'Owner'])
  }), [role, isHeadBarUser, isSuperAdmin, isTenant, basePath, rawRole]);

  useEffect(() => {
    const readReminders = () => {
      try {
        const raw = localStorage.getItem('bv_po_reminders_v4');
        setPoReminders(raw ? JSON.parse(raw) : []);
      } catch {
        setPoReminders([]);
      }
    };
    readReminders();
    window.addEventListener('barventis:po_reminders_updated', readReminders);
    return () => window.removeEventListener('barventis:po_reminders_updated', readReminders);
  }, []);

  const urgentRecap = useMemo(() => buildUrgentRecap({
    poReminders,
    stockItems: stock || [],
    role,
    isHeadBarUser,
    basePath
  }), [poReminders, stock, role, isHeadBarUser, basePath]);

  // Auto-open Modal Rekap Urgent 1x saat login (menunggu Panduan Spotlight selesai agar tidak bertumpuk)
  useEffect(() => {
    if (loadingData || !activeUser?.id || isSuperAdmin) return;
    if (spotlightMode !== 'idle') return;
    if (urgentRecap.totalCount === 0) return;
    try {
      const seenUrgentKey = `bv_urgent_seen_${activeUser.id}`;
      if (sessionStorage.getItem(seenUrgentKey) !== 'true') {
        sessionStorage.setItem(seenUrgentKey, 'true');
        setShowUrgentModal(true);
      }
    } catch {
      // ignore storage errors
    }
  }, [loadingData, activeUser?.id, isSuperAdmin, spotlightMode, urgentRecap.totalCount]);

  const betaPresets = typeof api.getBetaTestingPresets === 'function' ? api.getBetaTestingPresets() : [];

  const handleQuickSwitchBeta = async (preset) => {
    if (!preset || betaSwitchingKey || seedingDummy) return;
    setBetaSwitchingKey(preset.key);
    try {
      await api.loginWithBetaShortcut(preset.key);
      await checkCurrentAuth();
      await refreshData();
      setShowBetaMenu(false);
      navigate('/dashboard');
      showToast(`Berpindah ke akun ${preset.label} (${preset.branchCode})`, 'success');
    } catch (err) {
      showToast(err?.message || 'Gagal berpindah akun Beta Testing', 'error');
    } finally {
      setBetaSwitchingKey('');
    }
  };

  const handleSeedDummyData = async () => {
    if (seedingDummy || betaSwitchingKey) return;
    setSeedingDummy(true);
    try {
      await api.seedBetaTestingDummyData();
      await refreshData();
      setShowBetaMenu(false);
      showToast('Data dummy Beta Testing (Resto Umatis: BSD & Kasuna) berhasil dimuat ulang!', 'success');
    } catch (err) {
      showToast(err?.message || 'Gagal memuat ulang data dummy Beta Testing', 'error');
    } finally {
      setSeedingDummy(false);
    }
  };

  // ==========================================
  // SUPERADMIN NOTIFICATIONS (Reset Requests)
  // ==========================================
  const [adminNotifs, setAdminNotifs] = useState([]);

  useEffect(() => {
    let mounted = true;

    async function fetchAdminNotifs() {
      if (!isSuperAdmin) return;
      try {
        const data = await api.getAllResetRequests();
        const pending = (data || []).filter(req => req.status?.toLowerCase() === 'pending');
        if (mounted) setAdminNotifs(pending);
      } catch (err) {
        console.error('Failed to fetch admin notifications:', err);
      }
    }

    fetchAdminNotifs();

    // Polling setiap 30 detik untuk superadmin
    let interval;
    if (isSuperAdmin) {
      interval = setInterval(fetchAdminNotifs, 30000);
    }

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [isSuperAdmin]);

  // Fallback kept as '/staff' (rar's original behavior) rather than vercel's
  // '' for any unrecognized role value, so navigation links never silently
  // break if a role string doesn't match any of the three above.

  const userAvatar = activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'U';

  // ==========================================
  // TENANT NOTIFICATIONS (Low Stock)
  // ==========================================
  const lowStockItems = stock?.filter(item => {
    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
    return totalQty <= (item.min_stock || 5);
  }) || [];

  const notifCount = isSuperAdmin ? adminNotifs.length : urgentRecap.totalCount;

  const openProfileModal = () => {
    setEditProfileName(activeUser?.name || '');
    setShowProfileModal(true);
    setShowUserMenu(false);
  };

  const handleUpdateProfile = async () => {
    if (!editProfileName.trim()) return;
    setIsUpdatingProfile(true);
    try {
      await api.updateProfileName(editProfileName);
      showToast('Profil berhasil diperbarui', 'success');
      setShowProfileModal(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error(error);
      showToast('Gagal memperbarui profil: ' + error.message, 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden font-sans relative">
      {/* Desktop Sidebar Container (Auto-expand saat Panduan atau saat di-Lock) */}
      <div 
        data-tour="sidebar-nav"
        className="hidden lg:block relative z-50 flex-shrink-0"
        style={{ width: (isSidebarLocked || spotlightMode === 'tour') ? '244px' : '72px', transition: 'width 0.28s ease' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Clipping Mask (Absolute) */}
        <motion.div 
          initial={false}
          animate={{ 
            width: isSidebarExpanded ? 244 : 72,
            boxShadow: (isHovered && !isSidebarLocked && spotlightMode !== 'tour')
              ? "0 16px 24px -6px rgba(0, 0, 0, 0.08), 0 6px 10px -4px rgba(0, 0, 0, 0.03)"
              : "none"
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.32 }}
          className="absolute top-0 left-0 h-screen bg-[var(--bg-secondary)] border-r border-[var(--border)] overflow-hidden z-50"
        >
          {/* Static Content Container */}
          <div className="flex flex-col h-full w-[244px]">
            <div className="flex items-center justify-between py-4 pl-5 pr-3 mb-1">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <img src={barventisIcon} alt="Barventis" className="w-7 h-7 flex-shrink-0" />
                <span 
                  className="font-bold text-[15px] tracking-wide whitespace-nowrap overflow-hidden"
                  style={{ 
                    opacity: isSidebarExpanded ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    width: '108px'
                  }}
                >
                  BARVENTIS
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 scrollbar-hide">
              <div className="flex flex-col gap-0.5">
                {sidebarGroups.map((group, gIdx) => (
                  <NavGroup key={group.id} title={group.title || undefined} isHovered={isSidebarExpanded} isFirst={gIdx === 0}>
                    {group.items.map((item, idx) => (
                      <NavItem
                        key={`${group.id}-${item.label}`}
                        to={item.to}
                        exact={item.exact}
                        label={item.label}
                        subtitle={item.subtitle}
                        icon={item.icon}
                        isHovered={isSidebarExpanded}
                        index={idx}
                      />
                    ))}
                  </NavGroup>
                ))}
              </div>
            </div>

            <div 
              className="mt-auto border-t border-[var(--border)] p-4 cursor-pointer relative"
              ref={userMenuRef}
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {userAvatar}
                </div>
                <div 
                  className="overflow-hidden whitespace-nowrap flex-1"
                  style={{
                    opacity: isSidebarExpanded ? 1 : 0,
                    transition: 'opacity 0.3s ease'
                  }}
                >
                  <div className="text-sm font-bold text-[var(--text-primary)] mb-0.5">{activeUser?.name || 'User'}</div>
                  <div className="text-xs text-[var(--text-muted)] font-medium">{tenantName || 'Tenant'}</div>
                </div>
              </div>

              <AnimatePresence>
                {showUserMenu && isSidebarExpanded && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-4 right-4 mb-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div 
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer border-b border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors"
                      onClick={openProfileModal}
                    >
                      <Edit size={14} className="text-[var(--text-secondary)]" />
                      <span className="text-sm font-medium">Edit Profil</span>
                    </div>
                    <div 
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors text-red-500"
                      onClick={logout}
                    >
                      <LogOut size={14} />
                      <span className="text-sm font-medium">Keluar</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Lock Sidebar Toggle — Di bawah Profile */}
            <div className="border-t border-[var(--border)] px-3 py-2.5">
              <button
                type="button"
                data-tour="sidebar-lock-btn"
                onClick={toggleSidebarLock}
                title={isSidebarLocked ? 'Buka kunci sidebar (auto-lipat)' : 'Kunci sidebar agar tetap terbuka'}
                aria-label={isSidebarLocked ? 'Buka kunci sidebar' : 'Kunci sidebar'}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  background: isSidebarLocked ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                  color: isSidebarLocked ? 'var(--accent)' : 'var(--text-secondary)',
                  border: isSidebarLocked ? '1px solid rgba(16, 185, 129, 0.32)' : '1px solid transparent'
                }}
              >
                <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isSidebarLocked ? <PinOff size={15} /> : <Pin size={15} />}
                </span>
                <span
                  className="text-xs font-semibold whitespace-nowrap overflow-hidden"
                  style={{
                    opacity: isSidebarExpanded ? 1 : 0,
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  {isSidebarLocked ? 'Lepas Kunci Sidebar' : 'Kunci Sidebar'}
                </span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
      {/* Invisible Touch Catch Zone (True Edge Bezel 24px) for Mobile & Tablet */}
      <div 
        className="fixed inset-y-0 left-0 w-6 z-30 pointer-events-none lg:hidden"
        aria-hidden="true" 
      />

      {/* Mobile Sidebar Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>
      {/* Mobile Sidebar (Slide-over) */}
      <motion.div 
        className="fixed inset-y-0 left-0 w-[285px] max-w-[85vw] bg-[var(--bg-secondary)] shadow-2xl z-50 lg:hidden flex flex-col will-change-transform"
        drag="x"
        dragConstraints={{ left: -285, right: 0 }}
        dragElastic={0.05}
        onDragEnd={(e, info) => { if (info.offset.x < -50 || info.velocity.x < -450) setIsSidebarOpen(false); }}
        initial={{ x: '-100%' }}
        animate={{ x: isSidebarOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 26, stiffness: 320, mass: 0.6 }}
      >
        <div className="flex items-center justify-between p-5 mb-2">
          <div className="flex items-center gap-3">
            <img src={barventisIcon} alt="Barventis" className="w-8 h-8" />
            <span className="font-bold text-lg tracking-wide">BARVENTIS</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1">
            <X size={20} />
          </button>
        </div>

        {isTenant && activeBranch && (
          <div className="mx-4 mb-3 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] flex items-center gap-2">
            <Store size={14} className="text-[var(--accent)] shrink-0" />
            <span className="text-[11px] font-medium text-[var(--text-muted)] shrink-0">
              {currentTenant?.company_name || 'Resto Umatis'} •
            </span>
            {canSwitchBranch ? (
              <select
                aria-label="Pilih Cabang Mobile"
                value={activeBranchId || ''}
                onChange={(e) => {
                  switchBranch(e.target.value);
                  setIsSidebarOpen(false);
                }}
                disabled={loadingData}
                className="bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-none flex-1 min-w-0 truncate"
              >
                {branches.filter(b => b.is_active !== false).map(b => (
                  <option key={b.id} value={b.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                    {b.name}{b.is_central ? ' (Central)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">
                {activeBranch.name}
              </span>
            )}
          </div>
        )}
        
        <div className="flex-1 overflow-y-auto px-2">
          <div className="flex flex-col gap-0.5">
            {sidebarGroups.map((group, gIdx) => (
              <NavGroup key={`m-${group.id}`} title={group.title || undefined} isHovered={true} isFirst={gIdx === 0}>
                {group.items.map((item, idx) => (
                  <NavItem
                    key={`m-${group.id}-${item.label}`}
                    onClick={() => setIsSidebarOpen(false)}
                    to={item.to}
                    exact={item.exact}
                    label={item.label}
                    subtitle={item.subtitle}
                    icon={item.icon}
                    isHovered={true}
                    index={idx}
                  />
                ))}
              </NavGroup>
            ))}
          </div>
        </div>

        <div className="mt-auto border-t border-[var(--border)] p-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={openProfileModal}>
            <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center font-bold text-sm">
              {userAvatar}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-bold truncate">{activeUser?.name || 'User'}</div>
              <div className="text-xs text-[var(--text-muted)] truncate">{activeUser?.role || 'Role'}</div>
            </div>
          </div>
          <button onClick={logout} className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-md border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors">
            <LogOut size={16} />
            <span className="text-sm font-semibold">Keluar</span>
          </button>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)]">
        <header data-tour="header-bar" className="flex flex-col border-b border-[var(--border)] bg-[var(--bg-primary)]/90 backdrop-blur-md z-30 shrink-0 px-3.5 py-2.5 sm:px-6 sm:py-3 md:px-8 md:py-4">
          {/* BARIS 1: Hamburger + Judul Halaman Utuh (Kiri) & Aksi Primer (Kanan) */}
          <div className="flex flex-row items-center justify-between gap-2 w-full">
            <div className="header-title-sec flex items-center gap-2.5 md:gap-4 flex-1 min-w-0">
              <button
                className="btn btn-secondary mobile-menu-btn flex lg:hidden items-center justify-center shrink-0"
                style={{ width: '38px', height: '38px', minHeight: '38px', padding: 0, borderRadius: '10px' }}
                onClick={() => setIsSidebarOpen(true)}
                aria-label="Buka Menu Sidebar"
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-[15px] sm:text-lg md:text-xl font-extrabold text-[var(--text-primary)] truncate m-0 leading-tight">
                  {isSuperAdmin && location.pathname === '/superadmin' && "Kelola Tenant"}
                  {isSuperAdmin && location.pathname === '/superadmin/templates' && "Template POS"}
                  {isSuperAdmin && location.pathname === '/superadmin/logs' && "Log Audit Sistem"}

                  {isTenant && (
                    <>
                      {location.pathname === basePath && (
                        role === 'Central'
                          ? "Dashboard Central & Distribusi"
                          : role === 'Purchasing'
                            ? "Dashboard Purchasing & PO"
                            : "Dashboard"
                      )}
                      {location.pathname === `${basePath}/daily-inventory` && "Daily Inventory"}
                      {location.pathname === `${basePath}/olah-bahan` && "Olah Bahan"}
                      {location.pathname === `${basePath}/procurement` && (role === 'Central' ? "PO & Penerimaan Central" : "Pengadaan & Supplier")}
                      {location.pathname === `${basePath}/transfer` && (role === 'Central' ? "Mutasi Central ke Cabang" : "Mutasi Gudang")}
                      {location.pathname === `${basePath}/pricing-cogs` && "Menu & COGS"}
                      {location.pathname === `${basePath}/opname-assets` && "Stock Opname & Aset"}
                      {location.pathname === `${basePath}/cost-report` && "Cost Control"}
                      {location.pathname === `${basePath}/sistem` && (role === 'Central' || role === 'Purchasing' ? "Data Materials & Stok" : "Pengaturan Sistem")}
                    </>
                  )}
                </h1>
                <p className="hidden md:block text-xs md:text-sm text-[var(--text-secondary)] truncate m-0 mt-0.5">
                  {isSuperAdmin && location.pathname === '/superadmin' && "Kelola database dan lisensi tenant."}
                  {isSuperAdmin && location.pathname === '/superadmin/logs' && "Pantau jejak audit keamanan sistem."}

                  {isTenant && (
                    <>
                      {location.pathname === basePath && (
                        role === 'Central'
                          ? "Pantau arus barang masuk, mutasi keluar ke cabang tujuan, dan PO Central."
                          : role === 'Purchasing'
                            ? "Fokus pembuatan PO, total nilai PO bulan berjalan, dan performa supplier."
                            : "Ringkasan HPP, variansi, dan inventaris."
                      )}
                      {location.pathname === `${basePath}/daily-inventory` && "Catat stok harian dan limbah."}
                      {location.pathname === `${basePath}/olah-bahan` && "Catat olahan bahan mentah."}
                      {location.pathname === `${basePath}/procurement` && "Katalog bahan, pembelian, dan PO."}
                      {location.pathname === `${basePath}/transfer` && "Distribusi stok dari Central ke cabang dan area tujuan."}
                      {location.pathname === `${basePath}/pricing-cogs` && "Simulasi harga dan resep minuman."}
                      {location.pathname === `${basePath}/opname-assets` && "Audit fisik stok resto dan central."}
                      {location.pathname === `${basePath}/cost-report` && "Laporan variansi dan rasio biaya."}
                      {location.pathname === `${basePath}/sistem` && "Buku stok, staf, dan cadangan data."}
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="header-actions flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Pemilih Cabang Desktop/Tablet (>= 640px) */}
              {isTenant && activeBranch && (
                canSwitchBranch ? (
                  <div
                    className="hidden sm:flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 shrink-0 shadow-2xs"
                    title="Pilih cabang aktif"
                  >
                    <Store size={14} className="text-[var(--accent)] shrink-0" />
                    <span className="hidden lg:inline text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap">
                      {currentTenant?.company_name || 'Resto Umatis'} • Cabang:
                    </span>
                    <select
                      aria-label="Pilih Cabang"
                      value={activeBranchId || ''}
                      onChange={(e) => switchBranch(e.target.value)}
                      disabled={loadingData}
                      className="bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none cursor-pointer max-w-[140px] md:max-w-[180px] truncate"
                    >
                      {branches.filter(b => b.is_active !== false).map(b => (
                        <option key={b.id} value={b.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                          {b.name}{b.is_central ? ' (Central)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div
                    className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap shrink-0"
                    title="Cabang tugas aktif"
                  >
                    <Store size={14} className="text-[var(--accent)] shrink-0" />
                    <span className="max-w-[150px] truncate">{activeBranch.name}</span>
                  </div>
                )
              )}


              {/* Tombol Shortcut Beta Testing (Viewport-Safe di Mobile & Desktop) */}
              {betaPresets.length > 0 && (
                <div className="relative" ref={betaMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBetaMenu(!showBetaMenu);
                      setShowNotifications(false);
                    }}
                    title="Shortcut Ganti Akun & Data Dummy Beta Testing"
                    aria-label="Shortcut Beta Testing"
                    className="btn hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
                    style={{
                      background: showBetaMenu ? 'var(--accent)' : 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      borderRadius: '10px',
                      padding: '6px 10px',
                      minHeight: '38px',
                      color: showBetaMenu ? '#ffffff' : '#059669',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    <Store size={15} />
                    <span className="inline sm:hidden text-[11px] font-bold">Beta</span>
                    <span className="hidden sm:inline">Shortcut Beta</span>
                  </button>

{/* Panel Shortcut Beta Testing dirender di level root agar bebas dari clipping backdrop-blur header (Nia P0 Fix) */}
                </div>
              )}

              {/* Tombol Panduan Desktop/Tablet (>= 640px) */}
              <button
                className="hidden sm:flex btn hover:opacity-85 transition-opacity items-center justify-center gap-1.5"
                onClick={() => setSpotlightMode('prompt')}
                title="Buku Panduan Sistem"
                style={{
                  background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: '10px',
                  padding: '6px 10px', color: 'var(--accent)', minHeight: '38px',
                  fontSize: '0.8rem', fontWeight: 600,
                  flexShrink: 0
                }}
              >
                <BookOpen size={16} /> <span className="hidden md:inline">Panduan</span>
              </button>

              {isTenant && (
                <button
                  className="btn hover:bg-[var(--bg-tertiary)] transition-colors flex items-center justify-center"
                  onClick={refreshData}
                  disabled={loadingData}
                  title="Sinkronisasi ulang data"
                  aria-label="Sinkronisasi ulang data"
                  style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px',
                    width: '38px', height: '38px', minHeight: '38px', padding: 0, color: 'var(--text-secondary)',
                    flexShrink: 0
                  }}
                >
                  <RefreshCw size={16} style={{ animation: loadingData ? 'spin 0.8s linear infinite' : 'none' }} />
                </button>
              )}

              {/* Tombol Notifikasi dengan Popover Aman-Viewport di Mobile */}
              <div className="relative" ref={notifRef}>
                <button
                  className="btn hover:bg-[var(--bg-tertiary)] transition-colors flex items-center justify-center relative"
                  onClick={() => {
                    if (isSuperAdmin) { setShowNotifications(!showNotifications); } else { setShowUrgentModal(true); }
                    setShowBetaMenu(false);
                  }}
                  title="Notifikasi Sistem"
                  aria-label="Notifikasi Sistem"
                  style={{
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px',
                    width: '38px', height: '38px', minHeight: '38px', padding: 0, color: 'var(--text-secondary)',
                    flexShrink: 0
                  }}
                >
                  <Bell size={16} />
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[var(--bg-primary)]"></span>
                  )}
                </button>
                <AnimatePresence>
                  {showNotifications && (
                    <>
                      <div
                        className="fixed inset-0 bg-black/25 backdrop-blur-[1px] z-40 sm:hidden"
                        onClick={() => setShowNotifications(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className="fixed left-3 right-3 top-[66px] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 max-w-[calc(100vw-24px)] bg-[var(--bg-secondary)] rounded-2xl shadow-2xl border border-[var(--border)] z-50 overflow-hidden"
                      >
                        <div className="px-4 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border)] flex justify-between items-center">
                          <h3 className="text-sm font-bold text-[var(--text-primary)] m-0">Notifikasi</h3>
                          <div className="flex items-center gap-2">
                            {notifCount > 0 && (
                              <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                {notifCount} Baru
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowNotifications(false)}
                              aria-label="Tutup Notifikasi"
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>

                        <div className="max-h-[55vh] sm:max-h-[300px] overflow-y-auto">
                          {isSuperAdmin ? (
                            adminNotifs.length > 0 ? (
                              <ul className="divide-y divide-[var(--border)]">
                                {adminNotifs.map((req) => (
                                  <li key={req.id} className="px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer" onClick={() => {
                                    setShowNotifications(false);
                                    navigate('/superadmin/reset-approvals');
                                  }}>
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 text-amber-500">
                                        <Bell size={16} />
                                      </div>
                                      <div>
                                        <p className="text-sm text-[var(--text-primary)] font-medium m-0">Permintaan Reset Data</p>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1 m-0">
                                          Dari tenant: <span className="font-semibold">{req.tenants?.company_name || req.tenant_id}</span>
                                        </p>
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="px-4 py-8 text-center">
                                <Bell size={32} className="mx-auto text-[var(--text-muted)] opacity-40 mb-2" />
                                <p className="text-sm text-[var(--text-secondary)] m-0">Tidak ada permintaan baru</p>
                              </div>
                            )
                          ) : (
                            lowStockItems && lowStockItems.length > 0 ? (
                              <ul className="divide-y divide-[var(--border)]">
                                {lowStockItems.map((item) => (
                                  <li key={item.id} className="px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors">
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5 text-red-500">
                                        <Bell size={16} />
                                      </div>
                                      <div>
                                        <p className="text-sm text-[var(--text-primary)] font-semibold m-0">Stok Menipis: {item.name}</p>
                                        <p className="text-xs text-red-600 mt-1 m-0">
                                          Sisa {item.qty_resto} {item.unit} (Min: {item.min_stock})
                                        </p>
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="px-4 py-8 text-center">
                                <Bell size={32} className="mx-auto text-[var(--text-muted)] opacity-40 mb-2" />
                                <p className="text-sm text-[var(--text-secondary)] m-0">Tidak ada notifikasi baru</p>
                              </div>
                            )
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* BARIS 2 KHUSUS MOBILE (< 640px): Context Strip Nyaman untuk Cabang Aktif, POS & Panduan */}
          {isTenant && (
            <div className="flex sm:hidden items-center justify-between gap-2 pt-2 mt-2 border-t border-[var(--border)]/70">
              {activeBranch ? (
                canSwitchBranch ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 min-w-0 flex-1">
                    <Store size={13} className="text-[var(--accent)] shrink-0" />
                    <span className="text-[11px] font-medium text-[var(--text-muted)] shrink-0">
                      {currentTenant?.company_name || 'Resto Umatis'} •
                    </span>
                    <select
                      aria-label="Pilih Cabang Mobile Header"
                      value={activeBranchId || ''}
                      onChange={(e) => switchBranch(e.target.value)}
                      disabled={loadingData}
                      className="bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none cursor-pointer flex-1 min-w-0 truncate"
                    >
                      {branches.filter(b => b.is_active !== false).map(b => (
                        <option key={b.id} value={b.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)]">
                          Cabang {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] truncate">
                    <Store size={13} className="text-[var(--accent)] shrink-0" />
                    <span className="truncate">{currentTenant?.company_name || 'Resto Umatis'} • Cabang {activeBranch.name}</span>
                  </div>
                )
              ) : <div />}

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSpotlightMode('prompt')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border"
                  style={{
                    background: 'var(--accent-glow)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)'
                  }}
                >
                  <BookOpen size={13} />
                  <span>Panduan</span>
                </button>
              </div>
            </div>
          )}
        </header>

        <section data-tour="main-workspace" className="flex-1 overflow-y-auto relative p-3 md:p-8 pb-32 md:pb-16">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="min-h-full"
            >
              <WidgetErrorBoundary>
                <Outlet />
              </WidgetErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

      {/* Root-Level Viewport-Safe Shortcut Beta Testing Modal / Bottom Sheet (Nia P0 Fix — Zero Left Clipping) */}
      {showBetaMenu && betaPresets.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(3px)',
            zIndex: 9998,
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'flex-start',
            justifyContent: isMobile ? 'center' : 'flex-end',
            padding: isMobile ? '12px 12px 78px 12px' : '68px 24px 24px 24px'
          }}
          onClick={() => setShowBetaMenu(false)}
        >
          <div
            ref={betaMenuRef}
            style={{
              width: '100%',
              maxWidth: isMobile ? '440px' : '360px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.28)',
              padding: '16px',
              zIndex: 9999
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[var(--border)]">
              <div>
                <div className="text-xs font-extrabold text-[var(--text-primary)] uppercase tracking-wide">
                  Shortcut Beta Testing
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Resto Umatis • Cabang BSD & Kasuna
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBetaMenu(false)}
                aria-label="Tutup Shortcut Beta"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-[52vh] overflow-y-auto pr-0.5">
              {betaPresets.map((p) => {
                const isCurrent =
                  activeUser?.preset_key === p.key ||
                  (activeUser?.email?.toLowerCase() === p.email.toLowerCase() &&
                    String(activeUser?.role || '').toLowerCase() === String(p.role || '').toLowerCase());
                const isBusy = betaSwitchingKey === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={Boolean(betaSwitchingKey) || seedingDummy}
                    onClick={() => handleQuickSwitchBeta(p)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                      isCurrent
                        ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
                        : 'border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {p.label}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--accent)] border border-[var(--border)]">
                          {p.branchCode}
                        </span>
                      </div>
                      {p.sublabel && (
                        <div className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                          {p.sublabel}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--text-inverse)] shrink-0">
                      {isBusy ? 'Masuk...' : isCurrent ? 'Aktif' : 'Masuk'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={seedingDummy || Boolean(betaSwitchingKey)}
                onClick={handleSeedDummyData}
                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold border border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)] hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={13} className={seedingDummy ? 'animate-spin' : ''} />
                {seedingDummy ? 'Memuat Data Dummy...' : 'Muat / Reset Data Dummy (BSD & Kasuna)'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ContextualFloatingNav isSidebarOpen={isSidebarOpen} />

      {/* Comforting Mobile Bottom Navigation Bar (< 1024px) */}
      {isTenant && (
        <nav
          aria-label="Navigasi Cepat Mobile"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-secondary)]/95 backdrop-blur-md border-t border-[var(--border)] px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(45,42,38,0.06)]"
        >
          <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
            <NavLink
              to={basePath}
              end
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                  isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                }`
              }
              style={{ textDecoration: 'none' }}
            >
              <LayoutDashboard size={18} strokeWidth={2} />
              <span className="text-[10px] mt-0.5 leading-tight truncate">
                {role === 'Central' ? 'Dashboard Central' : role === 'Purchasing' ? 'Total PO Bulanan' : 'Beranda'}
              </span>
            </NavLink>

            {role === 'Central' ? (
              <>
                <NavLink
                  to={`${basePath}/transfer`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <ArrowRightLeft size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Mutasi ke Cabang</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/procurement?tab=invoicing`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <ShoppingCart size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">PO Central</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/sistem?tab=stock-ledger`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <Boxes size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Stok</span>
                </NavLink>
              </>
            ) : role === 'Purchasing' ? (
              <>
                <NavLink
                  to={`${basePath}/procurement?tab=invoicing`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive && (new URLSearchParams(location.search).get('tab') || 'invoicing') === 'invoicing'
                        ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]'
                        : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <ShoppingCart size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Pembuatan PO</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/procurement?tab=marketlist`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive && new URLSearchParams(location.search).get('tab') === 'marketlist'
                        ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]'
                        : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <Tag size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Komparasi Harga</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/procurement?tab=pembelian`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive && new URLSearchParams(location.search).get('tab') === 'pembelian'
                        ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]'
                        : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <Building2 size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Supplier</span>
                </NavLink>
              </>
            ) : (role === 'Service' || role === 'Kasir') ? (
              <>
                <NavLink
                  to={`${basePath}/daily-inventory`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <ClipboardList size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Stok Harian</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/opname-assets`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <Boxes size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Opname</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/daily-inventory?tab=waste`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <Trash2 size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Limbah</span>
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  to={`${basePath}/daily-inventory`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <ClipboardList size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Stok Harian</span>
                </NavLink>
                <NavLink
                  to={`${basePath}/olah-bahan`}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                      isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                    }`
                  }
                  style={{ textDecoration: 'none' }}
                >
                  <Scissors size={18} strokeWidth={2} />
                  <span className="text-[10px] mt-0.5 leading-tight truncate">Olah Bahan</span>
                </NavLink>
                {role === 'Bar' ? (
                  <NavLink
                    to={`${basePath}/opname-assets`}
                    className={({ isActive }) =>
                      `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                        isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                      }`
                    }
                    style={{ textDecoration: 'none' }}
                  >
                    <Boxes size={18} strokeWidth={2} />
                    <span className="text-[10px] mt-0.5 leading-tight truncate">Opname</span>
                  </NavLink>
                ) : (
                  <NavLink
                    to={`${basePath}/procurement`}
                    className={({ isActive }) =>
                      `flex flex-col items-center justify-center py-1 rounded-xl transition-colors ${
                        isActive ? 'text-[var(--accent)] font-bold bg-[var(--accent-glow)]' : 'text-[var(--text-secondary)] font-medium'
                      }`
                    }
                    style={{ textDecoration: 'none' }}
                  >
                    <ShoppingCart size={18} strokeWidth={2} />
                    <span className="text-[10px] mt-0.5 leading-tight truncate">Belanja</span>
                  </NavLink>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex flex-col items-center justify-center py-1 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors"
            >
              <Menu size={18} strokeWidth={2} />
              <span className="text-[10px] mt-0.5 leading-tight truncate">Menu Lain</span>
            </button>
          </div>
        </nav>
      )}

      {/* Mobile More Menu (Hidden by default, toggled by BottomNav) */}
      <div id="mobile-more-menu" className="hidden lg:hidden fixed inset-0 z-[60] bg-[var(--bg-secondary)] flex-col pt-12 pb-24 px-4 overflow-y-auto" style={{ display: 'none' }}>
        <style>{`
          #mobile-more-menu:not(.hidden) { display: flex !important; }
        `}</style>
        
        <style>{`
  /* Bottom Navigation Styles (Mobile) */
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 65px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-around;
    align-items: center;
    z-index: 9999;
    padding-bottom: env(safe-area-inset-bottom); /* iPhone X+ support */
  }

  .bottom-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 0.65rem;
    font-weight: 600;
    gap: 4px;
    transition: all 0.2s ease;
  }

  .bottom-nav-item.active {
    color: var(--primary);
  }

  .bottom-nav-item.active .icon-wrap {
    background: var(--primary-light);
    color: var(--primary);
  }

  .bottom-nav-item .icon-wrap {
    padding: 6px 16px;
    border-radius: 16px;
    transition: all 0.2s ease;
  }
      `}</style>
        <button onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} className="absolute top-4 right-4 p-2">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold mb-6">Menu Lainnya</h2>
        <div className="flex flex-col gap-2">
          {isTenant && hasAccess(['Owner', 'Bar', 'Kitchen', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/pricing-cogs`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Tag size={20} /> Menu Pricing & COGS</NavLink>
          )}
          {isTenant && hasAccess(['Owner', 'Bar', 'Kitchen', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/opname-assets`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Boxes size={20} /> Stock Opname & Aset</NavLink>
          )}
          
          {isTenant && hasAccess(['Owner', 'Bar', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/cost-report`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Calculator size={20} /> Cost Control</NavLink>
          )}
          {isTenant && hasAccess(['Owner']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/sistem`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Settings size={20} /> Pengaturan & Sistem</NavLink>
          )}
          <button onClick={() => { document.getElementById('mobile-more-menu').classList.add('hidden'); logout(); }} className="p-4 rounded-xl bg-red-500/10 text-red-500 mt-4 flex items-center gap-3 text-left"><LogOut size={20} /> Keluar</button>
        </div>
      </div>

      {loadingData && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 20px',
          color: 'var(--text-primary)',
          fontSize: '0.8rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: 'var(--card-shadow)',
          zIndex: 9999
        }}>
          <div style={{
            width: '14px',
            height: '14px',
            border: '2px solid var(--border)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          Sinkronisasi Database...
        </div>
      )}
      
      {/* Onboarding Modal for new tenants */}

      {showOnboarding && (
        <Onboarding
          tenantName={tenantName}
          onNavigate={(tab) => {
            setShowOnboarding(false);
            sessionStorage.setItem('barventis_onboarding_dismissed', 'true');
            // Route dynamically based on Onboarding output
            if (tab === 'stock') navigate(`${basePath}/sistem?tab=stock-ledger`);
            if (tab === 'recipes') navigate(`${basePath}/pricing-cogs?tab=cogs-beverage`);
            if (tab === 'daily') navigate(`${basePath}/daily-inventory`);
            if (tab === 'cost-report') navigate(`${basePath}/cost-report`);
          }}
          onDismiss={() => {
            setShowOnboarding(false);
            sessionStorage.setItem('barventis_onboarding_dismissed', 'true');
          }}
        />
      )}

      {/* Floating AI Assistant */}
      <GuidebookModal isOpen={showGuidebook} onClose={() => setShowGuidebook(false)} />
      <UrgentRecapModal
        isOpen={showUrgentModal}
        urgentActions={urgentRecap.urgentActions}
        urgentMaterials={urgentRecap.urgentMaterials}
        onNavigate={(route) => navigate(route)}
        onClose={() => setShowUrgentModal(false)}
      />
      <RoleSpotlightGuide
        mode={spotlightMode}
        role={role}
        isHeadBarUser={isHeadBarUser}
        basePath={basePath}
        currentLocation={`${location.pathname}${location.search}`}
        onNavigateRoute={(route) => navigate(route)}
        onAcceptTour={() => setSpotlightMode('tour')}
        onDismiss={() => {
          setSpotlightMode('idle');
          try {
            if (activeUser?.id) localStorage.setItem(`barventis_spotlight_done_${activeUser.id}`, 'true');
          } catch {}
        }}
        onComplete={() => {
          setSpotlightMode('idle');
          try {
            if (activeUser?.id) localStorage.setItem(`barventis_spotlight_done_${activeUser.id}`, 'true');
          } catch {}
        }}
      />

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26,25,23,0.35)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              style={{
                background: 'var(--bg-primary)',
                width: '100%',
                maxWidth: '400px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Profil</h4>
                <button onClick={() => setShowProfileModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Peran</label>
                <div style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  cursor: 'not-allowed'
                }}>
                  {activeUser?.role || 'User'}
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email</label>
                <div style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                  fontSize: '0.9rem',
                  cursor: 'not-allowed'
                }}>
                  {activeUser?.email || '-'}
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Nama Tampilan</label>
                <input
                  type="text"
                  value={editProfileName}
                  onChange={(e) => setEditProfileName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem'
                  }}
                  placeholder="Masukkan nama..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
                <button
                  onClick={() => setShowProfileModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 500
                  }}
                >
                  Batal
                </button>
                <button
                  onClick={handleUpdateProfile}
                  disabled={isUpdatingProfile || !editProfileName.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--accent)',
                    border: 'none',
                    color: 'white',
                    cursor: (isUpdatingProfile || !editProfileName.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    opacity: (isUpdatingProfile || !editProfileName.trim()) ? 0.7 : 1
                  }}
                >
                  {isUpdatingProfile ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
