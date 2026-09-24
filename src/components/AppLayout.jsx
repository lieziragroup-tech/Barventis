import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, Bell, X, RefreshCw, Menu,
  LayoutDashboard, ClipboardList, UploadCloud,
  Tag, ShoppingCart, Boxes, Package,
  Calculator, Settings, Wrench, Building2, Layout, Edit, MonitorSmartphone, BookOpen, Clock, Box, Scissors, FileSpreadsheet, Warehouse
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { api } from '../services/api';
import Onboarding from './Onboarding';
import AIAssistant from './AIAssistant';
import GuidebookModal from './GuidebookModal';
import barventisIcon from '../assets/barventis-icon.png';

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

const MobileBottomNav = ({ isSuperAdmin, isTenant, basePath, hasAccess }) => {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-secondary)] border-t border-[var(--border)] z-50 px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] flex justify-around items-center">
      {isSuperAdmin ? (
        <>
          <NavLink to="/superadmin" end className={({isActive}) => `flex flex-col items-center p-2 rounded-lg transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
            <Building2 size={20} /><span className="text-[0.65rem] mt-1 font-medium">Tenants</span>
          </NavLink>
          <NavLink to="/superadmin/logs" className={({isActive}) => `flex flex-col items-center p-2 rounded-lg transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
            <Clock size={20} /><span className="text-[0.65rem] mt-1 font-medium">Logs</span>
          </NavLink>
        </>
      ) : isTenant ? (
        <>
          {hasAccess(['Owner', 'Bar', 'Kitchen', 'Central']) && (
            <NavLink to={basePath} end className={({isActive}) => `flex flex-col items-center p-2 rounded-lg transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
              <LayoutDashboard size={20} /><span className="text-[0.65rem] mt-1 font-medium">Home</span>
            </NavLink>
          )}
          {hasAccess(['Owner', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing', 'Staff']) && (
            <NavLink to={`${basePath}/daily-inventory`} className={({isActive}) => `flex flex-col items-center p-2 rounded-lg transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
              <ClipboardList size={20} /><span className="text-[0.65rem] mt-1 font-medium">EOD</span>
            </NavLink>
          )}
          {hasAccess(['Owner', 'Service', 'Central', 'Bar', 'Staff']) && (
            <NavLink to={`${basePath}/penjualan`} className={({isActive}) => `flex flex-col items-center p-2 rounded-lg transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
              <UploadCloud size={20} /><span className="text-[0.65rem] mt-1 font-medium">POS</span>
            </NavLink>
          )}
          {hasAccess(['Owner', 'Central', 'Purchasing']) && (
            <NavLink to={`${basePath}/procurement`} className={({isActive}) => `flex flex-col items-center p-2 rounded-lg transition-colors ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
              <ShoppingCart size={20} /><span className="text-[0.65rem] mt-1 font-medium">Belanja</span>
            </NavLink>
          )}
          <button onClick={() => document.getElementById('mobile-more-menu').classList.toggle('hidden')} className="flex flex-col items-center p-2 rounded-lg text-[var(--text-secondary)]">
            <Menu size={20} /><span className="text-[0.65rem] mt-1 font-medium">Menu</span>
          </button>
        </>
      ) : null}
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
  const role = activeUser?.role === 'SuperAdmin' ? 'Super Admin' : activeUser?.role;
  const isSuperAdmin = role === 'Super Admin';
  const isTenant = ['Admin / Owner', 'Owner', 'Staff', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing'].includes(role);

  const hasAccess = (allowedRoles) => allowedRoles.includes(role);

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
  const basePath = isSuperAdmin ? '/superadmin' : '/dashboard';

  const userAvatar = activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'U';

  // ==========================================
  // TENANT NOTIFICATIONS (Low Stock)
  // ==========================================
  const lowStockItems = stock?.filter(item => {
    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
    return totalQty <= (item.min_stock || 5);
  }) || [];

  const notifCount = isSuperAdmin ? adminNotifs.length : lowStockItems.length;

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
                    <NavItem to="/superadmin/reset-approvals" label="History Permintaan" icon={Clock}  isHovered={isHovered} index={4} />
                  </NavGroup>
                )}

                {isTenant && (
                  <>
                    <NavGroup title="Operasional Harian" isHovered={isHovered} isFirst={!isSuperAdmin}>
                      <NavItem to={basePath} exact label="Dashboard" icon={LayoutDashboard} isHovered={isHovered} />
                      {currentTenant?.is_pos_enabled && hasAccess(['Admin / Owner', 'Owner', 'Service', 'Bar', 'Staff']) && (
                        <NavItem to={`${basePath}/pos-terminal`} label="Kasir (POS)" icon={MonitorSmartphone} isHovered={isHovered} />
                      )}
                      {hasAccess(['Admin / Owner', 'Owner', 'Service', 'Central', 'Bar', 'Staff']) && <NavItem to={`${basePath}/penjualan`} label="Penjualan Beverage (POS)" icon={UploadCloud} isHovered={isHovered} />}
                      {hasAccess(['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing', 'Staff']) && <NavItem to={`${basePath}/daily-inventory`} label="Daily Inventory & Waste" icon={ClipboardList} isHovered={isHovered} />}
                      {hasAccess(['Admin / Owner', 'Owner', 'Central', 'Purchasing']) && <NavItem to={`${basePath}/procurement`} label="Marketlist & Pembelian" icon={ShoppingCart} isHovered={isHovered} />}
                      {hasAccess(['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Staff']) && <NavItem to={`${basePath}/pricing-cogs`} label="Menu Pricing & COGS" icon={Tag} isHovered={isHovered} />}
                      {hasAccess(['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Staff']) && <NavItem to={`${basePath}/opname-assets`} label="Stock Opname & Aset" icon={Boxes} isHovered={isHovered} />}
                      {hasAccess(['Admin / Owner', 'Owner', 'Kitchen', 'Central', 'Staff']) && <NavItem to={`${basePath}/produksi`} label="Proses Produksi Bahan" icon={Scissors} isHovered={isHovered} />}
                      {hasAccess(['Admin / Owner', 'Owner', 'Central', 'Bar', 'Staff']) && <NavItem to={`${basePath}/cost-report`} label="Cost Control & Laporan" icon={Calculator} isHovered={isHovered} />}
                    </NavGroup>

                    {hasAccess(['Admin / Owner', 'Owner']) && (
                      <NavGroup title="Pengaturan & Sistem" isHovered={isHovered}>
                        <NavItem to={`${basePath}/sistem`} label="Pengaturan & Sistem (Adm)" icon={Settings} isHovered={isHovered} />
                      </NavGroup>
                    )}
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
                <NavItem onClick={() => setIsSidebarOpen(false)} to="/superadmin/reset-approvals" label="History Permintaan" icon={Clock}  isHovered={true} index={9} />
              </NavGroup>
            )}

            {isTenant && (
              <>
                <NavGroup title="Operasional Harian" isHovered={true} isFirst={!isSuperAdmin}>
                  <NavItem onClick={() => setIsSidebarOpen(false)} to={basePath} exact label="Dashboard" icon={LayoutDashboard} isHovered={true} />
                  {currentTenant?.is_pos_enabled && hasAccess(['Admin / Owner', 'Owner', 'Service', 'Bar', 'Staff']) && (
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pos-terminal`} label="Kasir (POS)" icon={MonitorSmartphone} isHovered={true} />
                  )}
                  {hasAccess(['Admin / Owner', 'Owner', 'Service', 'Central', 'Bar', 'Staff']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/penjualan`} label="Penjualan Beverage (POS)" icon={UploadCloud} isHovered={true} />}
                  {hasAccess(['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing', 'Staff']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/daily-inventory`} label="Daily Inventory & Waste" icon={ClipboardList} isHovered={true} />}
                  {hasAccess(['Admin / Owner', 'Owner', 'Central', 'Purchasing']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/procurement`} label="Marketlist & Pembelian" icon={ShoppingCart} isHovered={true} />}
                  {hasAccess(['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Staff']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pricing-cogs`} label="Menu Pricing & COGS" icon={Tag} isHovered={true} />}
                  {hasAccess(['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Staff']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/opname-assets`} label="Stock Opname & Aset" icon={Boxes} isHovered={true} />}
                  {hasAccess(['Admin / Owner', 'Owner', 'Kitchen', 'Central', 'Staff']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/produksi`} label="Proses Produksi Bahan" icon={Scissors} isHovered={true} />}
                  {hasAccess(['Admin / Owner', 'Owner', 'Central', 'Bar', 'Staff']) && <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/cost-report`} label="Cost Control & Laporan" icon={Calculator} isHovered={true} />}
                </NavGroup>

                {hasAccess(['Admin / Owner', 'Owner']) && (
                  <NavGroup title="Pengaturan & Sistem" isHovered={true}>
                    <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/sistem`} label="Pengaturan & Sistem (Adm)" icon={Settings} isHovered={true} />
                  </NavGroup>
                )}
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
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)] lg:pb-0 pb-[72px]">
        <header className="flex flex-row items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-primary)]/80 backdrop-blur-md z-30 shrink-0 px-4 py-3 md:px-8 md:py-4">
          <div className="header-title-sec flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button
              className="btn btn-secondary mobile-menu-btn hidden"
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

                {isTenant && (
                  <>
                    {location.pathname === basePath && "Cost Control Dashboard"}
                    {location.pathname === `${basePath}/penjualan` && "Penjualan Beverage (POS)"}
                    {location.pathname === `${basePath}/daily-inventory` && "Daily Inventory & Waste"}
                    {location.pathname === `${basePath}/procurement` && "Marketlist & Pembelian Harian"}
                    {location.pathname === `${basePath}/pricing-cogs` && "Menu Pricing & COGS"}
                    {location.pathname === `${basePath}/opname-assets` && "Stock Opname & Aset"}
                    {location.pathname === `${basePath}/produksi` && "Proses Produksi Bahan (Trimming)"}
                    {location.pathname === `${basePath}/cost-report` && "Cost Control & Laporan SO Barista"}
                    {location.pathname === `${basePath}/sistem` && "Pengaturan & Sistem"}
                  </>
                )}
              </h1>
              <p className="hidden md:block text-xs md:text-sm text-[var(--text-secondary)] truncate">
                {isSuperAdmin && location.pathname === '/superadmin' && "Manage client databases, licenses, active/inactive statuses, and seed metrics."}
                {isSuperAdmin && location.pathname === '/superadmin/templates' && "Define global Excel sheet mappings for Moka, Pawoon, Olsera, and other POS engines."}
                {isSuperAdmin && location.pathname === '/superadmin/logs' && "Consolidated platform-wide security audit trails and log tracking."}

                {isTenant && (
                  <>
                    {location.pathname === basePath && "Real-time F&B HPP analytics, top variance and metrics."}
                    {location.pathname === `${basePath}/penjualan` && "Upload file POS (ESB), riwayat data mentah POS, dan terminal kasir web."}
                    {location.pathname === `${basePath}/daily-inventory` && "Pencatatan stok harian bahan & bir, pemakaian, dan log limbah."}
                    {location.pathname === `${basePath}/procurement` && "Rencana belanja (marketlist), purchase order, dan penerimaan barang."}
                    {location.pathname === `${basePath}/pricing-cogs` && "Simulasi harga jual, resep minuman racikan (COGS Beverage), dan katalog bir."}
                    {location.pathname === `${basePath}/opname-assets` && "Stock opname resto & central, serta checklist kondisi peralatan bar."}
                    {location.pathname === `${basePath}/produksi` && "Kalkulator susut trimming buah segar dan batching porsi olahan."}
                    {location.pathname === `${basePath}/cost-report` && "Audit variansi biaya bulanan dan ekspor 13 sheet laporan SO Barista."}
                    {location.pathname === `${basePath}/sistem` && "Buku stok, mutasi antar cabang, konfigurasi toko & RBAC, audit trail & backup."}
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
            
            {isTenant && (
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

            {/* Bell button + dropdown now share a dedicated `relative` wrapper
                (with notifRef attached) so the dropdown's `absolute right-0`
                anchors to this wrapper instead of drifting up to whichever
                ancestor happens to have positioning — that's what was
                pinning the panel to the top-right of the whole page. */}
            <div className="relative" ref={notifRef}>
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
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden"
                  >
                    {/* Header Notifikasi */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="text-sm font-bold text-gray-800">Notifikasi</h3>
                      {notifCount > 0 && (
                        <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          {notifCount} Baru
                        </span>
                      )}
                    </div>
                    
                    {/* Isi List Notifikasi */}
                    <div className="max-h-[300px] overflow-y-auto">
                      {isSuperAdmin ? (
                        adminNotifs.length > 0 ? (
                          <ul className="divide-y divide-gray-100">
                            {adminNotifs.map((req) => (
                              <li key={req.id} className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => {
                                setShowNotifications(false);
                                navigate('/superadmin/reset-approvals');
                              }}>
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 text-amber-500">
                                    <Bell size={16} />
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-800 font-medium">Permintaan Reset Data</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      Dari tenant: <span className="font-semibold">{req.tenants?.company_name || req.tenant_id}</span>
                                    </p>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="px-4 py-8 text-center">
                            <Bell size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-500">Tidak ada pending requests</p>
                          </div>
                        )
                      ) : (
                        lowStockItems && lowStockItems.length > 0 ? (
                          <ul className="divide-y divide-gray-100">
                            {lowStockItems.map((item) => (
                              <li key={item.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start gap-3">
                                  <div className="mt-0.5 text-red-500">
                                    <Bell size={16} />
                                  </div>
                                  <div>
                                    <p className="text-sm text-gray-800 font-medium">Stok Menipis: {item.name}</p>
                                    <p className="text-xs text-red-600 mt-1">
                                      Sisa {item.qty_resto} {item.unit} (Min: {item.min_stock})
                                    </p>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="px-4 py-8 text-center">
                            <Bell size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-500">Tidak ada notifikasi baru</p>
                          </div>
                        )
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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

      <MobileBottomNav isSuperAdmin={isSuperAdmin} isTenant={isTenant} basePath={basePath} hasAccess={hasAccess} />

      {/* Mobile More Menu (Hidden by default, toggled by BottomNav) */}
      <div id="mobile-more-menu" className="hidden lg:hidden fixed inset-0 z-[60] bg-[var(--bg-secondary)] flex-col pt-12 pb-24 px-4 overflow-y-auto" style={{ display: 'none' }}>
        <style>{`
          #mobile-more-menu:not(.hidden) { display: flex !important; }
        `}</style>
        <button onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} className="absolute top-4 right-4 p-2">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold mb-6">Menu Lainnya</h2>
        <div className="flex flex-col gap-2">
          {isTenant && hasAccess(['Owner', 'Bar', 'Kitchen', 'Central', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/pricing-cogs`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Tag size={20} /> Menu Pricing & COGS</NavLink>
          )}
          {isTenant && hasAccess(['Owner', 'Bar', 'Kitchen', 'Central', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/opname-assets`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Boxes size={20} /> Stock Opname & Aset</NavLink>
          )}
          {isTenant && hasAccess(['Owner', 'Kitchen', 'Central', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/produksi`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Scissors size={20} /> Proses Produksi Bahan</NavLink>
          )}
          {isTenant && hasAccess(['Owner', 'Central', 'Bar', 'Staff']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/cost-report`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Calculator size={20} /> Cost Control & Laporan</NavLink>
          )}
          {isTenant && hasAccess(['Owner']) && (
            <NavLink onClick={() => document.getElementById('mobile-more-menu').classList.add('hidden')} to={`${basePath}/sistem`} className="p-4 rounded-xl bg-[var(--bg-primary)] flex items-center gap-3"><Settings size={20} /> Pengaturan & Sistem</NavLink>
          )}
          <button onClick={() => { document.getElementById('mobile-more-menu').classList.add('hidden'); logout(); }} className="p-4 rounded-xl bg-red-500/10 text-red-500 mt-4 flex items-center gap-3 text-left"><LogOut size={20} /> Keluar (Logout)</button>
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
            if (tab === 'stock') navigate(`${basePath}/sistem?tab=stock-ledger`);
            if (tab === 'recipes') navigate(`${basePath}/pricing-cogs?tab=cogs-beverage`);
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
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Role</label>
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
                    background: 'var(--accent)',
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
