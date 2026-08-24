import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, Bell, X, RefreshCw, Menu, 
  LayoutDashboard, ClipboardList, UploadCloud, 
  Utensils, Tag, ShoppingCart, FileText, Boxes, Trash2, Package, 
  Calculator, History, Settings, Archive, Wrench, Building2, Layout, Edit, MonitorSmartphone, BookOpen, ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { api } from '../../services/api';
import Onboarding from '../Onboarding';
import AIAssistant from '../AIAssistant';
import GuidebookModal from '../GuidebookModal';
import barventisIcon from '../../assets/barventis-icon.png';

const NavItem = ({ to, exact, label, icon: Icon, isHovered, onClick }) => {
  return (
    <div style={{ display: 'block', width: '100%', marginBottom: '2px' }}>
      <NavLink
        to={to}
        end={exact}
        onClick={onClick}
        className={({ isActive }) => 
          `flex items-center px-4 py-2.5 rounded-lg transition-colors duration-200 ${
            isActive 
              ? 'bg-[var(--accent-glow)] text-[var(--accent)] font-semibold' 
              : 'hover:bg-[var(--accent-glow)] text-[var(--text-secondary)] hover:text-[var(--accent)]'
          }`
        }
        style={{ textDecoration: 'none' }}
        title={!isHovered ? label : undefined}
      >
        <div className="min-w-[24px] flex items-center justify-center flex-shrink-0">
          {Icon && <Icon size={18} />}
        </div>
        <span 
          className="whitespace-nowrap ml-3 text-[0.85rem]"
          style={{ 
            opacity: isHovered ? 1 : 0, 
            transform: isHovered ? 'translateX(0)' : 'translateX(-8px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
            pointerEvents: isHovered ? 'auto' : 'none'
          }}
        >
          {label}
        </span>
      </NavLink>
    </div>
  );
};

const NavGroup = ({ children, isFirst }) => {
  return (
    <div className="nav-group mb-1">
      {!isFirst && (
        <div className="px-4 my-2">
          <div className="border-t border-[var(--border)] opacity-50"></div>
        </div>
      )}
      <div className="flex flex-col px-2">
        {children}
      </div>
    </div>
  );
};

export default function DashboardLayout() {
  const { activeUser, tenantName, logout } = useAuth();
  const { loadingData, stock, refreshData, currentTenant, showToast } = useData();
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Show onboarding for non-Super-Admin users who haven't dismissed it
    // this session and have no stock data yet (first-time setup guidance).
    // Original rar condition checked `activeUser?.role === 'owner'`
    // (lowercase) — actual role values are 'Admin / Owner' / 'Staff' / etc,
    // so that comparison never matched anything and onboarding never showed
    // for anyone. Fixed to match barventis-vercel-repo's working logic.
    if (!loadingData && activeUser?.role !== 'Super Admin' && activeUser?.role !== 'SuperAdmin') {
      const hasDismissed = sessionStorage.getItem('barventis_onboarding_dismissed') === 'true';
      if (stock.length === 0 && !hasDismissed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowOnboarding(true);
      }
    }
  }, [loadingData, stock, activeUser]);

  const [showGuidebook, setShowGuidebook] = useState(false);
  const [showPosNotif, setShowPosNotif] = useState(false);

  useEffect(() => {
    if (currentTenant?.is_pos_enabled) {
      const hasSeenNotif = localStorage.getItem(`pos_notif_${currentTenant.id}`);
      if (!hasSeenNotif) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowPosNotif(true);
        localStorage.setItem(`pos_notif_${currentTenant.id}`, 'true');
      }
    }
  }, [currentTenant?.is_pos_enabled, currentTenant?.id]);
  
  const [showPosSetupModal, setShowPosSetupModal] = useState(false);
  const [posTaxRate, setPosTaxRate] = useState(11);
  const [posServiceCharge, setPosServiceCharge] = useState(5);
  const [isSavingPosSetup, setIsSavingPosSetup] = useState(false);
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  const [showNotifications, setShowNotifications] = useState(false);

  const userMenuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
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
  const isSuperAdmin = activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin';
  const isOwner = activeUser?.role === 'Admin / Owner';
  const isStaff = activeUser?.role === 'Staff';
  // Fallback kept as '/staff' (rar's original behavior) rather than vercel's
  // '' for any unrecognized role value, so navigation links never silently
  // break if a role string doesn't match any of the three above.
  const basePath = isSuperAdmin ? '/superadmin' : (isOwner ? '/owner' : '/staff');

  const userAvatar = activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'U';

  const lowStockItems = stock?.filter(item => {
    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
    return totalQty <= (item.min_stock || 5);
  }) || [];

  const notifCount = lowStockItems.length;

  const openProfileModal = () => {
    setEditProfileName(activeUser?.name || '');
    setShowProfileModal(true);
    setShowUserMenu(false);
  };

  const handleUpdateProfile = async () => {
    if (!editProfileName.trim()) return;
    setIsUpdatingProfile(true);
    try {
      await api.updateProfile(activeUser?.id, { name: editProfileName });
      showToast('Profil berhasil diperbarui', 'success');
      setShowProfileModal(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      showToast('Gagal memperbarui profil', 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // handleOpenPos was referenced by the "Buka POS" button below but its
  // definition was missing in the original rar codebase (ReferenceError on
  // click). Restored from barventis-vercel-repo, which has it correctly —
  // this is a straight logic fix, the surrounding modal/JSX is unchanged.
  const handleOpenPos = () => {
    if (currentTenant?.pos_tax_rate === undefined || currentTenant?.pos_tax_rate === null) {
      setShowPosSetupModal(true);
    } else {
      navigate(`/${basePath}/pos-terminal`);
    }
  };

  const handleSavePosSetup = async (e) => {
    e.preventDefault();
    setIsSavingPosSetup(true);
    try {
      await api.updateTenantSettings({ 
        pos_tax_rate: parseFloat(posTaxRate), 
        pos_service_charge: parseFloat(posServiceCharge) 
      });
      showToast('Pengaturan POS berhasil disimpan', 'success');
      setShowPosSetupModal(false);
      refreshData();
    } catch {
      showToast('Gagal menyimpan pengaturan', 'error');
    } finally {
      setIsSavingPosSetup(false);
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] overflow-hidden font-sans relative">
      {/* Desktop Sidebar Container (Transparent Spacer) */}
      <div 
        className="hidden lg:block relative z-50 flex-shrink-0"
        style={{ width: '80px' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Clipping Mask (Absolute) */}
        <motion.div 
          initial={false}
          animate={{ 
            width: isHovered ? 280 : 80,
            boxShadow: isHovered ? "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" : "none"
          }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="absolute top-0 left-0 h-screen bg-[var(--bg-secondary)] border-r border-[var(--border)] overflow-hidden z-50"
        >
          {/* Static Content Container */}
          <div className="flex flex-col h-full w-[280px]">
            <div className="flex items-center justify-between py-5 pl-6 pr-5 mb-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <img src={barventisIcon} alt="Barventis" className="w-8 h-8 flex-shrink-0" />
                <span 
                  className="font-bold text-lg tracking-wide whitespace-nowrap overflow-hidden"
                  style={{ 
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                    width: '120px'
                  }}
                >
                  BARVENTIS
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 scrollbar-hide">
              <div className="flex flex-col gap-1">
                {isSuperAdmin && (
                  <NavGroup title="Platform" isHovered={isHovered} isFirst={true}>
                    <NavItem to="/superadmin" exact label="Kelola Tenant" icon={Building2}  isHovered={isHovered} index={1} />
                    <NavItem to="/superadmin/templates" label="POS Templates" icon={Layout}  isHovered={isHovered} index={2} />
                    <NavItem to="/superadmin/logs" label="Audit Logs" icon={History}  isHovered={isHovered} index={3} />
                    <NavItem to="/superadmin/reset-approvals" label="Persetujuan Reset" icon={ShieldAlert}  isHovered={isHovered} index={4} />
                  </NavGroup>
                )}

                {(isOwner || isStaff) && (
                  <>
                    <NavGroup title="Menu Utama" isHovered={isHovered} isFirst={!isSuperAdmin}>
                      <NavItem to={basePath} exact label="Dashboard" icon={LayoutDashboard}  isHovered={isHovered} index={4} />
                      {currentTenant?.is_pos_enabled && (
                        <NavItem to={`${basePath}/pos-terminal`} label="Kasir (POS)" icon={MonitorSmartphone}  isHovered={isHovered} index={5} />
                      )}
                      <NavItem to={`${basePath}/stock`} label="Stock Ledger" icon={BookOpen}  isHovered={isHovered} index={6} />
                      <NavItem to={`${basePath}/daily-inventory`} label="Daily Inventory" icon={ClipboardList}  isHovered={isHovered} index={7} />
                      <NavItem to={`${basePath}/pos`} label="Upload POS Sales" icon={UploadCloud}  isHovered={isHovered} index={8} />
                      <NavItem to={`${basePath}/recipes`} label="F&B Recipes" icon={Utensils}  isHovered={isHovered} index={9} />
                      <NavItem to={`${basePath}/pricing`} label="Menu Pricing" icon={Tag}  isHovered={isHovered} index={10} />
                    </NavGroup>

                    {isOwner && (
                      <NavGroup title="Operasional" isHovered={isHovered}>
                        <NavItem to={`${basePath}/purchasing`} label="Pembelian & Supplier" icon={ShoppingCart}  isHovered={isHovered} index={11} />
                        <NavItem to={`${basePath}/invoicing`} label="Invoicing / PO" icon={FileText}  isHovered={isHovered} index={12} />
                        <NavItem to={`${basePath}/opname`} label="Stock Opname" icon={Boxes}  isHovered={isHovered} index={13} />
                        <NavItem to={`${basePath}/physical-check`} label="Cek Fisik & Waste" icon={Trash2}  isHovered={isHovered} index={14} />
                        <NavItem to={`${basePath}/assets`} label="Asset & Equipment" icon={Package}  isHovered={isHovered} index={0} />
                        <NavItem to={`${basePath}/cost-control`} label="Cost Control" icon={Calculator}  isHovered={isHovered} index={1} />
                      </NavGroup>
                    )}

                    <NavGroup title="System" isHovered={isHovered}>
                      {isOwner && (
                        <>
                          <NavItem to={`${basePath}/audit`} label="Audit Logs" icon={History}  isHovered={isHovered} index={2} />
                          <NavItem to={`${basePath}/settings`} label="Tenant Settings" icon={Settings}  isHovered={isHovered} index={3} />
                          <NavItem to={`${basePath}/backup`} label="Backup & Restore" icon={Archive}  isHovered={isHovered} index={4} />
                        </>
                      )}
                      <NavItem to={`${basePath}/maintenance`} label="Maintenance" icon={Wrench}  isHovered={isHovered} index={5} />
                    </NavGroup>
                  </>
                )}
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
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.3s ease'
                  }}
                >
                  <div className="text-sm font-bold text-[var(--text-primary)] mb-0.5">{activeUser?.name || 'User'}</div>
                  <div className="text-xs text-[var(--text-muted)] font-medium">{tenantName || 'Tenant'}</div>
                </div>
              </div>

              <AnimatePresence>
                {showUserMenu && isHovered && (
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
                      <span className="text-sm font-medium">Edit Profile</span>
                    </div>
                    <div 
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors text-red-500"
                      onClick={logout}
                    >
                      <LogOut size={14} />
                      <span className="text-sm font-medium">Log Out</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
      {/* Mobile Sidebar Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>
      {/* Mobile Sidebar (Slide-over) */}
      <motion.div 
        className="fixed inset-y-0 left-0 w-[280px] bg-[var(--bg-secondary)] shadow-2xl z-50 lg:hidden flex flex-col"
        drag="x"
        dragConstraints={{ left: -280, right: 0 }}
        dragElastic={0.05}
        onDragEnd={(e, info) => { if (info.offset.x < -75 || info.velocity.x < -500) setIsSidebarOpen(false); }}
        initial={{ x: '-100%' }}
        animate={{ x: isSidebarOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
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
        
        <div className="flex-1 overflow-y-auto px-3">
          <div className="flex flex-col gap-1">
            {isSuperAdmin && (
              <NavGroup title="Platform" isHovered={true} isFirst={true}>
                <NavItem onClick={() => setIsSidebarOpen(false)} to="/superadmin" exact label="Kelola Tenant" icon={Building2}  isHovered={true} index={6} />
                <NavItem onClick={() => setIsSidebarOpen(false)} to="/superadmin/templates" label="POS Templates" icon={Layout}  isHovered={true} index={7} />
                <NavItem onClick={() => setIsSidebarOpen(false)} to="/superadmin/logs" label="Audit Logs" icon={History}  isHovered={true} index={8} />
                <NavItem onClick={() => setIsSidebarOpen(false)} to="/superadmin/reset-approvals" label="Persetujuan Reset" icon={ShieldAlert}  isHovered={true} index={9} />
              </NavGroup>
            )}

            {(isOwner || isStaff) && (
              <>
                <NavGroup title="Menu Utama" isHovered={true} isFirst={!isSuperAdmin}>
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={basePath} exact label="Dashboard" icon={LayoutDashboard}  isHovered={true} index={9} />
                  {currentTenant?.is_pos_enabled && (
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pos-terminal`} label="Kasir (POS)" icon={MonitorSmartphone}  isHovered={true} index={10} />
                  )}
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/stock`} label="Stock Ledger" icon={BookOpen}  isHovered={true} index={11} />
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/daily-inventory`} label="Daily Inventory" icon={ClipboardList}  isHovered={true} index={12} />
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pos`} label="Upload POS Sales" icon={UploadCloud}  isHovered={true} index={13} />
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/recipes`} label="F&B Recipes" icon={Utensils}  isHovered={true} index={14} />
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pricing`} label="Menu Pricing" icon={Tag}  isHovered={true} index={0} />
                </NavGroup>

                {isOwner && (
                  <NavGroup title="Operasional" isHovered={true}>
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/purchasing`} label="Pembelian & Supplier" icon={ShoppingCart}  isHovered={true} index={1} />
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/invoicing`} label="Invoicing / PO" icon={FileText}  isHovered={true} index={2} />
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/opname`} label="Stock Opname" icon={Boxes}  isHovered={true} index={3} />
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/physical-check`} label="Cek Fisik & Waste" icon={Trash2}  isHovered={true} index={4} />
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/assets`} label="Asset & Equipment" icon={Package}  isHovered={true} index={5} />
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/cost-control`} label="Cost Control" icon={Calculator}  isHovered={true} index={6} />
                  </NavGroup>
                )}

                <NavGroup title="System" isHovered={true}>
                  {isOwner && (
                    <>
                      <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/audit`} label="Audit Logs" icon={History}  isHovered={true} index={7} />
                      <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/settings`} label="Tenant Settings" icon={Settings}  isHovered={true} index={8} />
                      <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/backup`} label="Backup & Restore" icon={Archive}  isHovered={true} index={9} />
                    </>
                  )}
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/maintenance`} label="Maintenance" icon={Wrench}  isHovered={true} index={10} />
                </NavGroup>
              </>
            )}
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
              <span className="text-sm font-semibold">Log Out</span>
           </button>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)]">
        <header className="flex flex-row items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-primary)]/80 backdrop-blur-md z-30 shrink-0 px-4 py-3 md:px-8 md:py-4">
          <div className="header-title-sec flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button 
              className="btn btn-secondary mobile-menu-btn" 
              style={{ padding: '6px', borderRadius: 'var(--radius-sm)' }}
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm md:text-xl font-bold truncate m-0">
                {isSuperAdmin && location.pathname === '/superadmin' && "Platform Tenants Management"}
                {isSuperAdmin && location.pathname === '/superadmin/templates' && "Global POS Excel Templates"}
                {isSuperAdmin && location.pathname === '/superadmin/logs' && "Global System Audit Trail"}
                {isSuperAdmin && location.pathname === '/superadmin/reset-approvals' && "Persetujuan Reset Data Tenant"}

                {(isOwner || isStaff) && (
                  <>
                    {location.pathname === basePath && "Cost Control Dashboard"}
                    {location.pathname === `${basePath}/stock` && "Warehouse Stocks & Ledgers"}
                    {location.pathname === `${basePath}/daily-inventory` && "Pencatatan Stok Harian"}
                    {location.pathname === `${basePath}/pos` && "POS Kasir Integration"}
                    {location.pathname === `${basePath}/recipes` && "Menu COGS & Recipe Builder"}
                    {location.pathname === `${basePath}/pricing` && "Menu Pricing Simulator"}
                    {location.pathname === `${basePath}/purchasing` && "Pembelian Harian & Supplier"}
                    {location.pathname === `${basePath}/invoicing` && "Purchase Invoicing"}
                    {location.pathname === `${basePath}/opname` && "Stock Opname & Auditing"}
                    {location.pathname === `${basePath}/physical-check` && "Pengecekan Fisik Mingguan"}
                    {location.pathname === `${basePath}/assets` && "Asset & Equipment Tracker"}
                    {location.pathname === `${basePath}/audit` && "Jejak Audit Sistem (Audit Logs)"}
                    {location.pathname === `${basePath}/cost-control` && "Monthly Cost Control Sheet"}
                    {location.pathname === `${basePath}/backup` && "Backup & Restore Center"}
                    {location.pathname === `${basePath}/settings` && "Pengaturan Profil & Akses Staf"}
                    {location.pathname === `${basePath}/maintenance` && "System Maintenance"}
                  </>
                )}
              </h1>
            <p className="hidden md:block text-xs md:text-sm text-[var(--text-secondary)] truncate">
              {isSuperAdmin && location.pathname === '/superadmin' && "Manage client databases, licenses, active/inactive statuses, and seed metrics."}
              {isSuperAdmin && location.pathname === '/superadmin/templates' && "Define global Excel sheet mappings for Moka, Pawoon, Olsera, and other POS engines."}
              {isSuperAdmin && location.pathname === '/superadmin/logs' && "Consolidated platform-wide security audit trails and log tracking."}
              {isSuperAdmin && location.pathname === '/superadmin/reset-approvals' && "Setiap permintaan Factory Reset dari Owner wajib disetujui di sini sebelum data benar-benar terhapus."}

              {(isOwner || isStaff) && (
                <>
                  {location.pathname === basePath && "Real-time F&B Beverage HPP analytics, top variance and metrics."}
                  {location.pathname === `${basePath}/stock` && "Manage raw materials — edit supplier, price, stock levels. Dual-unit display."}
                  {location.pathname === `${basePath}/daily-inventory` && "Daily stock count per shift, waste, and beer grouping."}
                  {location.pathname === `${basePath}/pos` && "Browser-side Excel parser. Drag and drop POS reports to deduct raw stock."}
                  {location.pathname === `${basePath}/recipes` && "Configure ingredients, fixed costs, and selling HPP percentages."}
                  {location.pathname === `${basePath}/pricing` && "Simulate selling price changes and see margin impact instantly."}
                  {location.pathname === `${basePath}/purchasing` && "Quick entry daily purchase and manage supplier data."}
                  {location.pathname === `${basePath}/invoicing` && "Create purchase orders, track invoices, auto stock-in on receive."}
                  {location.pathname === `${basePath}/opname` && "Wizard-style month-end counting sheet with digital signature."}
                  {location.pathname === `${basePath}/physical-check` && "Bandingkan pemakaian bahan di POS dengan stok fisik."}
                  {location.pathname === `${basePath}/assets` && "Track valuable restaurant assets and record breakages."}
                  {location.pathname === `${basePath}/audit` && "Linimasa riwayat log aktivitas, perubahan operasional dan parameter sistem."}
                  {location.pathname === `${basePath}/cost-control` && "Compare opening, purchasing, and closing opnames to hit <27% target."}
                  {location.pathname === `${basePath}/backup` && "Unduh, unggah, buat, dan kelola file cadangan database SQLite Barventis."}
                  {location.pathname === `${basePath}/maintenance` && "Status kesehatan sistem, pemeriksaan integritas data, hitung ulang HPP, dan manajemen role staff."}
                </>
              )}
            </p>
          </div>
          </div>
          <div className="header-actions flex items-center gap-2 shrink-0">
            {currentTenant?.is_pos_enabled && (
              <button
                className="btn hover:opacity-80 transition-opacity flex items-center justify-center gap-1.5"
                onClick={handleOpenPos}
                title="Buka POS Terminal"
                style={{
                  background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 'var(--radius-md)',
                  padding: '6px 10px', color: '#3b82f6',
                  fontSize: '0.85rem', fontWeight: 600,
                  flexShrink: 0
                }}
              >
                <MonitorSmartphone size={16} /> <span className="hidden md:inline">POS Terminal</span>
              </button>
            )}
            <button
              className="btn hover:opacity-80 transition-opacity flex items-center justify-center gap-1.5"
              onClick={() => setShowGuidebook(true)}
              title="Buku Panduan Sistem"
              style={{
                background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)',
                padding: '6px 10px', color: 'var(--accent)', 
                fontSize: '0.85rem', fontWeight: 600,
                flexShrink: 0
              }}
            >
              <BookOpen size={16} /> <span className="hidden md:inline">Panduan</span>
            </button>
            
            {(isOwner || isStaff) && (
              <button
                className="btn hover:bg-[var(--bg-tertiary)] transition-colors flex items-center justify-center"
                onClick={refreshData}
                disabled={loadingData}
                title="Sinkronisasi ulang data"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  padding: '6px 8px', color: 'var(--text-secondary)',
                  flexShrink: 0
                }}
              >
                <RefreshCw size={16} style={{ animation: loadingData ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            )}

            <button
              className="btn hover:bg-[var(--bg-tertiary)] transition-colors flex items-center justify-center relative"
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notifikasi Sistem"
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                padding: '6px 8px', color: 'var(--text-secondary)',
                flexShrink: 0
              }}
            >
              <Bell size={16} />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[var(--bg-primary)]"></span>
              )}
            </button>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto relative p-3 md:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </section>
      </main>

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
      {/* POS Notification Modal */}
      {showPosNotif && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(6, 9, 19, 0.88)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card animate-slide-up" style={{ width: '100%', maxWidth: '400px', padding: '32px', textAlign: 'center', position: 'relative' }}>
            <button onClick={() => setShowPosNotif(false)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <MonitorSmartphone size={32} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>POS Terminal Aktif!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '24px' }}>
              Modul Point of Sale (Kasir) internal kini telah aktif dan tersedia di sidebar kiri. Anda dapat langsung menggunakannya untuk mencatat transaksi penjualan.
            </p>
            <button 
              className="btn premium-btn-primary" 
              style={{ width: '100%', padding: '12px', fontSize: '0.9rem', justifyContent: 'center', color: '#ffffff', borderRadius: 'var(--radius-md)' }}
              onClick={() => {
                setShowPosNotif(false);
                navigate(`/${activeUser?.role === 'Super Admin' ? 'superadmin' : 'dashboard'}/pos-terminal`);
              }}
            >
              Buka POS Terminal
            </button>
          </div>
        </div>
      )}

      {showOnboarding && (
        <Onboarding
          tenantName={tenantName}
          onNavigate={(tab) => {
            setShowOnboarding(false);
            sessionStorage.setItem('barventis_onboarding_dismissed', 'true');
            // Route dynamically based on Onboarding output
            if (tab === 'stock') navigate(`${basePath}/stock`);
            if (tab === 'recipes') navigate(`${basePath}/recipes`);
          }}
          onDismiss={() => {
            setShowOnboarding(false);
            sessionStorage.setItem('barventis_onboarding_dismissed', 'true');
          }}
        />
      )}

      {/* Floating AI Assistant */}
      <AIAssistant />
      <GuidebookModal isOpen={showGuidebook} onClose={() => setShowGuidebook(false)} />

      {/* POS Setup Modal */}
      <AnimatePresence>
        {showPosSetupModal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(26,25,23,0.35)',
            backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 9999, padding: '16px'
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: 'var(--bg-primary)',
                width: '100%', maxWidth: '400px',
                maxHeight: '90vh', overflowY: 'auto',
                padding: '24px', borderRadius: 'var(--radius-lg)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                border: '1px solid var(--border)'
              }}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Setup Awal POS</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Tentukan pajak dan service charge untuk sistem kasir Anda. Nilai ini akan diterapkan otomatis pada setiap transaksi.
              </p>
              
              <form onSubmit={handleSavePosSetup}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Pajak (Tax) %</label>
                  <input
                    type="number"
                    className="form-control"
                    value={posTaxRate}
                    onChange={(e) => setPosTaxRate(e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Service Charge %</label>
                  <input
                    type="number"
                    className="form-control"
                    value={posServiceCharge}
                    onChange={(e) => setPosServiceCharge(e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    required
                    style={{ width: '100%' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowPosSetupModal(false)}
                    disabled={isSavingPosSetup}
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSavingPosSetup}
                  >
                    {isSavingPosSetup ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Profile</h4>
                <button onClick={() => setShowProfileModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Display Name</label>
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
                  placeholder="Enter your name"
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
                  Cancel
                </button>
                <button
                  onClick={handleUpdateProfile}
                  disabled={isUpdatingProfile || !editProfileName.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--primary)',
                    border: 'none',
                    color: 'white',
                    cursor: (isUpdatingProfile || !editProfileName.trim()) ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    opacity: (isUpdatingProfile || !editProfileName.trim()) ? 0.7 : 1
                  }}
                >
                  {isUpdatingProfile ? 'Saving...' : 'Save Changes'}
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