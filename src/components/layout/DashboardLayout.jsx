import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LogOut, Bell, AlertTriangle, X, RefreshCw, Menu,
  ChevronLeft, LayoutDashboard, ClipboardList, UploadCloud,
  Utensils, Tag, ShoppingCart, FileText, Boxes, Trash2, Package,
  Calculator, History, Settings, Archive, Wrench, Building2, Layout, Edit, MonitorSmartphone
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { api } from '../../services/api';
import Onboarding from '../Onboarding';
import AIAssistant from '../AIAssistant';
import GuidebookModal from '../GuidebookModal';
import { BookOpen } from 'lucide-react';
import barventisIcon from '../../assets/barventis-icon.png';

const NavItem = ({ to, exact, label, icon: Icon, collapsed }) => {
  return (
    <div style={{ display: 'block', width: '100%' }}>
      <NavLink
        to={to}
        end={exact}
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        style={{ textDecoration: 'none', justifyContent: collapsed ? 'center' : 'flex-start' }}
        title={collapsed ? label : undefined}
      >
        {({ isActive }) => (
          <>
            {isActive && <motion.div layoutId="active-bg" className="active-bg" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
            {isActive && <motion.div layoutId="active-ind" className="active-ind" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />}
            <div className="nav-item-content" style={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
              {Icon && <Icon size={16} style={{ flexShrink: 0 }} />}
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}
                >
                  {label}
                </motion.span>
              )}
            </div>
          </>
        )}
      </NavLink>
    </div>
  );
};

const NavGroup = ({ title, defaultOpen = true, collapsed, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } }
  };

  if (collapsed) {
    return (
      <motion.div variants={itemVariants} className="nav-group" style={{ marginBottom: '4px' }}>
        <div style={{ height: '1px', background: 'var(--border)', margin: '10px 6px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {children}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={itemVariants} className="nav-group" style={{ marginBottom: '4px' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '6px 12px',
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          fontWeight: '600',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
          borderRadius: '4px',
          transition: 'color var(--ease)'
        }}
        onMouseOver={e => e.currentTarget.style.color = 'var(--text-secondary)'}
        onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
      >
        {title}
        <span style={{
          fontSize: '0.55rem',
          transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
          display: 'inline-block'
        }}>▾</span>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingTop: '2px' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function DashboardLayout() {
  const { activeUser, tenantName, logout } = useAuth();
  const { loadingData, stock, refreshData, currentTenant, showToast } = useData();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 992);
  const [collapsed, setCollapsed] = useState(false);
  const [showGuidebook, setShowGuidebook] = useState(false);
  
  const [showPosSetupModal, setShowPosSetupModal] = useState(false);
  const [posTaxRate, setPosTaxRate] = useState(11);
  const [posServiceCharge, setPosServiceCharge] = useState(5);
  const [isSavingPosSetup, setIsSavingPosSetup] = useState(false);
  
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editProfileName, setEditProfileName] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // The collapse-to-rail mode is desktop-only; if the window is resized
  // down to mobile width while collapsed, expand back so the mobile
  // off-canvas drawer behaves normally.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) setCollapsed(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenPos = () => {
    if (currentTenant?.pos_tax_rate === undefined || currentTenant?.pos_tax_rate === null) {
      setShowPosSetupModal(true);
    } else {
      navigate(`/${basePath}/pos-terminal`);
    }
  };

  const handleSavePosSetup = async (e) => {
    e.preventDefault();
    try {
      setIsSavingPosSetup(true);
      await api.updateTenantSettings({
        pos_tax_rate: parseFloat(posTaxRate),
        pos_service_charge: parseFloat(posServiceCharge)
      });
      showToast('Pengaturan POS berhasil disimpan.', 'success');
      setShowPosSetupModal(false);
      refreshData();
      navigate(`/${basePath}/pos-terminal`);
    } catch (err) {
      showToast('Gagal menyimpan pengaturan POS.', 'error');
    } finally {
      setIsSavingPosSetup(false);
    }
  };

  // Close sidebar on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsSidebarOpen(false);
  }, [location.pathname]);
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);

  // Close notification panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate low stock items for notifications
  const lowStockItems = stock.filter(item => {
    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
    return totalQty < (item.min_stock || 15);
  });
  const criticalItems = lowStockItems.filter(item => {
    const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
    return totalQty === 0;
  });
  const notifCount = lowStockItems.length;

  useEffect(() => {
    if (!loadingData && activeUser?.role !== 'Super Admin' && activeUser?.role !== 'SuperAdmin') {
      const hasDismissed = sessionStorage.getItem('barventis_onboarding_dismissed') === 'true';
      if (stock.length === 0 && !hasDismissed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowOnboarding(true);
      }
    }
  }, [loadingData, stock, activeUser]);

  const userAvatar = activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'G';
  const userName = activeUser?.name || 'User Resto';
  const userRole = activeUser?.role || 'Staff';

  const isSuperAdmin = activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin';
  const isOwner = activeUser?.role === 'Admin / Owner';
  const isStaff = activeUser?.role === 'Staff';

  // Helper to determine base path
  const getBasePath = () => {
    if (isSuperAdmin) return '/superadmin';
    if (isOwner) return '/owner';
    if (isStaff) return '/staff';
    return '';
  };

  const basePath = getBasePath();

  const handleUpdateProfile = async () => {
    if (!editProfileName.trim()) return;
    setIsUpdatingProfile(true);
    try {
      await api.updateProfileName(editProfileName.trim());
      setShowProfileModal(false);
      window.location.reload(); // Reload to refresh user info
    } catch (e) {
      alert(e.message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const openProfileModal = () => {
    setEditProfileName(userName);
    setShowProfileModal(true);
    setShowUserMenu(false);
  };

  return (
    <div className="app-container" style={{ '--sidebar-width': collapsed ? '64px' : '250px' }}>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="mobile-overlay" 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <motion.nav
        className={`sidebar ${isSidebarOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        initial={{ x: -280, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="logo-container" style={{ 
          display: 'flex', 
          flexDirection: collapsed ? 'column' : 'row',
          justifyContent: collapsed ? 'center' : 'space-between', 
          alignItems: 'center', 
          width: '100%', 
          marginBottom: '20px', 
          padding: collapsed ? '0' : '0 6px',
          gap: collapsed ? '16px' : '0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <img src={barventisIcon} alt="Barventis" className="logo-icon" style={{ flexShrink: 0, width: collapsed ? '28px' : '30px', height: collapsed ? '28px' : '30px' }} />
            <AnimatePresence>
              {!collapsed && (
                <motion.span
                  className="logo-text"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}
                >
                  BARVENTIS
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            <button
              className="sidebar-collapse-btn"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}
            >
              <ChevronLeft size={16} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', color: 'var(--text-secondary)' }} />
            </button>
            <button 
              className="mobile-close-btn"
              onClick={() => setIsSidebarOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--ease)'
              }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        
        {!collapsed && (
          <div style={{
            padding: '0 8px',
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            fontWeight: '500',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}>
            {(tenantName || 'SYSTEM').toUpperCase()}
          </div>
        )}

        <motion.div
          className="nav-links"
          style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
          variants={{
            visible: { transition: { staggerChildren: 0.04, delayChildren: 0.08 } }
          }}
          initial="hidden"
          whileInView="visible"
        >
          {isSuperAdmin && (
            <NavGroup title="Platform" defaultOpen={true} collapsed={collapsed}>
              <NavItem to="/superadmin" exact label="Kelola Tenant" icon={Building2} collapsed={collapsed} />
              <NavItem to="/superadmin/templates" label="POS Templates" icon={Layout} collapsed={collapsed} />
              <NavItem to="/superadmin/logs" label="Audit Logs" icon={History} collapsed={collapsed} />
            </NavGroup>
          )}

          {(isOwner || isStaff) && (
            <>
              <NavGroup title="Menu Utama" defaultOpen={true} collapsed={collapsed}>
                <NavItem to={basePath} exact label="Dashboard" icon={LayoutDashboard} collapsed={collapsed} />
                <NavItem to={`${basePath}/pos-terminal`} label="Kasir (POS)" icon={MonitorSmartphone} collapsed={collapsed} />
                <NavItem to={`${basePath}/stock`} label="Stock Ledger" icon={BookOpen} collapsed={collapsed} />
                <NavItem to={`${basePath}/daily-inventory`} label="Daily Inventory" icon={ClipboardList} collapsed={collapsed} />
                <NavItem to={`${basePath}/pos`} label="Upload POS Sales" icon={UploadCloud} collapsed={collapsed} />
                <NavItem to={`${basePath}/recipes`} label="F&B Recipes" icon={Utensils} collapsed={collapsed} />
                <NavItem to={`${basePath}/pricing`} label="Menu Pricing" icon={Tag} collapsed={collapsed} />
              </NavGroup>

              {isOwner && (
                <NavGroup title="Operasional" defaultOpen={true} collapsed={collapsed}>
                  <NavItem to={`${basePath}/purchasing`} label="Pembelian & Supplier" icon={ShoppingCart} collapsed={collapsed} />
                  <NavItem to={`${basePath}/invoicing`} label="Invoicing / PO" icon={FileText} collapsed={collapsed} />
                  <NavItem to={`${basePath}/opname`} label="Stock Opname" icon={Boxes} collapsed={collapsed} />
                  <NavItem to={`${basePath}/physical-check`} label="Cek Fisik & Waste" icon={Trash2} collapsed={collapsed} />
                  <NavItem to={`${basePath}/assets`} label="Asset & Equipment" icon={Package} collapsed={collapsed} />
                  <NavItem to={`${basePath}/cost-control`} label="Cost Control" icon={Calculator} collapsed={collapsed} />
                </NavGroup>
              )}

              <NavGroup title="System" defaultOpen={false} collapsed={collapsed}>
                {isOwner && (
                  <>
                    <NavItem to={`${basePath}/audit`} label="Audit Logs" icon={History} collapsed={collapsed} />
                    <NavItem to={`${basePath}/settings`} label="Tenant Settings" icon={Settings} collapsed={collapsed} />
                    <NavItem to={`${basePath}/backup`} label="Backup & Restore" icon={Archive} collapsed={collapsed} />
                  </>
                )}
                <NavItem to={`${basePath}/maintenance`} label="Maintenance" icon={Wrench} collapsed={collapsed} />
              </NavGroup>
            </>
          )}
        </motion.div>

        <div 
          className="user-widget" 
          ref={userMenuRef}
          style={{ 
            flexDirection: collapsed ? 'column' : 'row',
            justifyContent: collapsed ? 'center' : 'flex-start', 
            padding: collapsed ? '10px 4px' : '10px 12px',
            gap: collapsed ? '12px' : '10px',
            cursor: 'pointer',
            position: 'relative'
          }}
          onClick={() => setShowUserMenu(!showUserMenu)}
        >
          <div className="user-avatar" title={collapsed ? `${userName} · ${userRole}` : undefined} style={{ width: collapsed ? '28px' : '32px', height: collapsed ? '28px' : '32px', fontSize: collapsed ? '0.65rem' : '0.75rem', flexShrink: 0 }}>{userAvatar}</div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="user-info"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
              >
                <span className="user-name">{userName}</span>
                <span className="user-role">{userRole}</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 10px)',
                  left: collapsed ? '10px' : '0',
                  right: collapsed ? 'auto' : '0',
                  minWidth: collapsed ? '180px' : '100%',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  overflow: 'hidden',
                  zIndex: 100
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div 
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onClick={openProfileModal}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Edit size={14} color="var(--text-secondary)" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>Edit Profile</span>
                </div>
                <div 
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  onClick={logout}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <LogOut size={14} color="var(--danger)" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 500 }}>Log Out</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.nav>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="content-header">
          <div className="header-title-sec" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className="btn btn-secondary mobile-menu-btn" 
              style={{ padding: '8px', borderRadius: 'var(--radius-md)', display: 'none' }}
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 style={{ marginBottom: '4px' }}>
                {isSuperAdmin && location.pathname === '/superadmin' && "Platform Tenants Management"}
                {isSuperAdmin && location.pathname === '/superadmin/templates' && "Global POS Excel Templates"}
                {isSuperAdmin && location.pathname === '/superadmin/logs' && "Global System Audit Trail"}

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
            <p>
              {isSuperAdmin && location.pathname === '/superadmin' && "Manage client databases, licenses, active/inactive statuses, and seed metrics."}
              {isSuperAdmin && location.pathname === '/superadmin/templates' && "Define global Excel sheet mappings for Moka, Pawoon, Olsera, and other POS engines."}
              {isSuperAdmin && location.pathname === '/superadmin/logs' && "Consolidated platform-wide security audit trails and log tracking."}

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
          <div className="header-actions" style={{ flexWrap: 'wrap' }}>
            {currentTenant?.is_pos_enabled && (
              <button
                className="btn"
                onClick={handleOpenPos}
                title="Buka POS Terminal"
                style={{
                  background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 'var(--radius-md)',
                  padding: '7px 12px', color: '#3b82f6', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, transition: 'all var(--ease)',
                  flexShrink: 0
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'; e.currentTarget.style.color = '#3b82f6'; }}
              >
                <MonitorSmartphone size={15} /> <span className="hide-mobile">POS Terminal</span>
              </button>
            )}
            <button
              className="btn"
              onClick={() => setShowGuidebook(true)}
              title="Buku Panduan Sistem"
              style={{
                background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)',
                padding: '7px 12px', color: 'var(--accent)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, transition: 'all var(--ease)',
                flexShrink: 0
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = '#fff'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'var(--accent-glow)'; e.currentTarget.style.color = 'var(--accent)'; }}
            >
              <BookOpen size={15} /> <span className="hide-mobile">Buku Panduan</span>
            </button>
            {/* Refresh Button */}
            {(isOwner || isStaff) && (
              <button
                className="btn"
                onClick={refreshData}
                disabled={loadingData}
                title="Sinkronisasi ulang data"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  padding: '7px 10px', color: 'var(--text-secondary)', cursor: loadingData ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all var(--ease)',
                  flexShrink: 0
                }}
                onMouseOver={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseOut={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <RefreshCw size={15} style={{ animation: loadingData ? 'spin 0.8s linear infinite' : 'none' }} />
              </button>
            )}

            {/* Notification Bell */}
            {(isOwner || isStaff) && (
              <div ref={notifRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowNotifications(v => !v)}
                  title="Notifikasi"
                  style={{
                    background: showNotifications ? 'var(--accent-glow)' : 'none',
                    border: `1px solid ${showNotifications ? 'var(--border-focus)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)', padding: '7px 10px',
                    color: notifCount > 0 ? 'var(--danger)' : 'var(--text-secondary)',
                    cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center',
                    transition: 'all var(--ease)',
                  }}
                >
                  <Bell size={17} />
                  {notifCount > 0 && (
                    <span style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      background: 'var(--danger)',                        color: 'var(--text-inverse)',
                      fontSize: '0.6rem', fontWeight: '800',
                      borderRadius: 'var(--radius-lg)', minWidth: '16px', height: '16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px', boxShadow: '0 0 0 2px var(--bg-primary)',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>

                {/* Notification Dropdown Panel */}
                {showNotifications && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                    width: '340px', maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)', zIndex: 1000,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '14px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontWeight: '700', fontSize: '0.88rem' }}>Notifikasi</span>
                      <button onClick={() => setShowNotifications(false)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={14} />
                      </button>
                    </div>

                    <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                      {lowStockItems.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>✓</span>
                          Semua stok dalam kondisi aman
                        </div>
                      ) : (
                        <>
                          {criticalItems.length > 0 && (
                            <div style={{ padding: '8px 16px 4px', fontSize: '0.7rem', fontWeight: '700', color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Stok Habis ({criticalItems.length})
                            </div>
                          )}
                          {lowStockItems.map(item => {
                            const totalQty = (item.qty_resto || 0) + (item.qty_central || 0);
                            const isCritical = totalQty === 0;
                            return (
                              <div
                                key={item.id || item.name}
                                onClick={() => { navigate(`${basePath}/stock`); setShowNotifications(false); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '10px',
                                  padding: '10px 16px', cursor: 'pointer', transition: 'background 0.15s',
                                  borderBottom: '1px solid var(--border)',
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <AlertTriangle size={15} style={{ color: isCritical ? 'var(--danger)' : 'var(--warning)', flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '0.82rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.name}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    {item.category} · Sisa: {totalQty.toFixed(1)} {item.unit}
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: '0.68rem', fontWeight: '700',
                                  color: isCritical ? 'var(--danger)' : 'var(--warning)',
                                  background: isCritical ? 'rgba(255,107,107,0.1)' : 'rgba(252,196,25,0.1)',
                                  padding: '2px 7px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
                                }}>
                                  {isCritical ? 'HABIS' : 'RENDAH'}
                                </span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>

                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                      <button
                        onClick={() => { navigate(`${basePath}/stock`); setShowNotifications(false); }}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: '600' }}
                      >
                        Lihat semua stok →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <section>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
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