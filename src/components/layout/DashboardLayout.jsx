import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Package, UploadCloud, ClipboardCheck, 
  ChefHat, DollarSign, LogOut, Bell, FileText, History, Database,
  FileSpreadsheet, Wrench, Settings, AlertTriangle, X, RefreshCw, Menu, ShoppingCart
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import Onboarding from '../Onboarding';
import AIAssistant from '../AIAssistant';

// Custom NavItem to replicate the existing style
const NavItem = ({ to, exact, icon: Icon, label, iconColor }) => {
  return (
    <NavLink 
      to={to} 
      end={exact}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} 
      style={{ textDecoration: 'none' }}
    >
      <Icon size={18} style={iconColor ? { color: iconColor } : {}} /> {label}
    </NavLink>
  );
};

const NavGroup = ({ title, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="nav-group" style={{ marginBottom: '8px' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '8px 16px',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          fontWeight: '700',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none'
        }}
      >
        {title}
        <span style={{ fontSize: '0.6rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
      </div>
      <div style={{ 
        overflow: 'hidden', 
        maxHeight: isOpen ? '1000px' : '0',
        opacity: isOpen ? 1 : 0,
        transition: 'all 0.3s ease-in-out'
      }}>
        {children}
      </div>
    </div>
  );
};

export default function DashboardLayout() {
  const { activeUser, tenantName, logout } = useAuth();
  const { loadingData, stock, refreshData } = useData();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
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

  return (
    <div className="app-container">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="mobile-overlay" 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <nav className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="logo-container">
          <div className="logo-icon">B</div>
          <span className="logo-text">BARVENTIS</span>
        </div>
        
        <div style={{
          padding: '4px 16px',
          fontSize: '0.725rem',
          color: '#3b82f6',
          fontWeight: '700',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: '10px',
          opacity: 0.85
        }}>
          RESTO ID: {(tenantName || 'SYSTEM').toUpperCase()}
        </div>

        <div className="nav-links" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {isSuperAdmin && (
            <NavGroup title="SUPER ADMIN" defaultOpen={true}>
              <NavItem to="/superadmin" exact icon={LayoutDashboard} label="Kelola Tenant" iconColor="#fbbf24" />
              <NavItem to="/superadmin/templates" icon={FileSpreadsheet} label="POS Templates" iconColor="#fbbf24" />
              <NavItem to="/superadmin/logs" icon={History} label="Log Audit Global" iconColor="#fbbf24" />
            </NavGroup>
          )}

          {(isOwner || isStaff) && (
            <>
              <NavGroup title="Operasional Harian" defaultOpen={true}>
                <NavItem to={basePath} exact icon={LayoutDashboard} label="Dashboard" />
                <NavItem to={`${basePath}/pos-terminal`} icon={ShoppingCart} label="POS Kasir (Baru)" iconColor="#4ade80" />
                <NavItem to={`${basePath}/pos`} icon={UploadCloud} label="Upload POS Sales" />
                <NavItem to={`${basePath}/stock`} icon={Package} label="Stock Ledger" />
              </NavGroup>

              <NavGroup title="Perencanaan & Produksi" defaultOpen={true}>
                <NavItem to={`${basePath}/recipes`} icon={ChefHat} label="F&B Recipes (COGS)" />
                {isOwner && (
                  <NavItem to={`${basePath}/invoicing`} icon={FileText} label="Invoicing / PO" />
                )}
              </NavGroup>

              {isOwner && (
                <NavGroup title="Kepatuhan & Laporan" defaultOpen={true}>
                  <NavItem to={`${basePath}/opname`} icon={ClipboardCheck} label="Stock Opname" />
                  <NavItem to={`${basePath}/cost-control`} icon={DollarSign} label="Cost Control" />
                  <NavItem to={`${basePath}/audit`} icon={History} label="Audit Logs" />
                </NavGroup>
              )}

              <NavGroup title="Administrasi" defaultOpen={false}>
                {isOwner && (
                  <>
                    <NavItem to={`${basePath}/settings`} icon={Settings} label="Tenant Settings" />
                    <NavItem to={`${basePath}/backup`} icon={Database} label="Backup & Restore" />
                  </>
                )}
                <NavItem to={`${basePath}/maintenance`} icon={Wrench} label="Maintenance" />
              </NavGroup>
            </>
          )}
        </div>

        <div className="user-widget">
          <div className="user-avatar">{userAvatar}</div>
          <div className="user-info">
            <span className="user-name">{userName}</span>
            <span className="user-role">{userRole}</span>
          </div>
          <LogOut size={16} style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={logout}
            title="Log Out dari Sistem"
          />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="content-header">
          <div className="header-title-sec" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              className="btn btn-secondary mobile-menu-btn" 
              style={{ padding: '8px', borderRadius: '8px', display: 'none' }}
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
                    {location.pathname === `${basePath}/pos` && "POS Kasir Integration"}
                    {location.pathname === `${basePath}/recipes` && "Menu COGS & Recipe Builder"}
                    {location.pathname === `${basePath}/invoicing` && "Purchase Invoicing"}
                    {location.pathname === `${basePath}/opname` && "Stock Opname & Auditing"}
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
                  {location.pathname === `${basePath}/pos` && "Browser-side Excel parser. Drag and drop POS reports to deduct raw stock."}
                  {location.pathname === `${basePath}/recipes` && "Configure ingredients, fixed costs, and selling HPP percentages."}
                  {location.pathname === `${basePath}/invoicing` && "Create purchase orders, track invoices, auto stock-in on receive."}
                  {location.pathname === `${basePath}/opname` && "Wizard-style month-end counting sheet with digital signature."}
                  {location.pathname === `${basePath}/audit` && "Linimasa riwayat log aktivitas, perubahan operasional dan parameter sistem."}
                  {location.pathname === `${basePath}/cost-control` && "Compare opening, purchasing, and closing opnames to hit <27% target."}
                  {location.pathname === `${basePath}/backup` && "Unduh, unggah, buat, dan kelola file cadangan database SQLite Barventis."}
                  {location.pathname === `${basePath}/maintenance` && "Status kesehatan sistem, pemeriksaan integritas data, hitung ulang HPP, dan manajemen role staff."}
                </>
              )}
            </p>
          </div>
          </div>
          <div className="header-actions">
            {/* Refresh Button */}
            {(isOwner || isStaff) && (
              <button
                onClick={refreshData}
                disabled={loadingData}
                title="Sinkronisasi ulang data"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '7px 10px', color: 'var(--text-secondary)', cursor: loadingData ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', transition: 'all 0.2s',
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
                    borderRadius: '8px', padding: '7px 10px',
                    color: notifCount > 0 ? 'var(--danger)' : 'var(--text-secondary)',
                    cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center',
                    transition: 'all 0.2s',
                  }}
                >
                  <Bell size={17} />
                  {notifCount > 0 && (
                    <span style={{
                      position: 'absolute', top: '-6px', right: '-6px',
                      background: 'var(--danger)', color: '#fff',
                      fontSize: '0.6rem', fontWeight: '800',
                      borderRadius: '10px', minWidth: '16px', height: '16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px', boxShadow: '0 0 0 2px var(--bg-primary)',
                    }}>{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>

                {/* Notification Dropdown Panel */}
                {showNotifications && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                    width: '340px', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: '12px',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.4)', zIndex: 1000,
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
                                  padding: '2px 7px', borderRadius: '6px', flexShrink: 0,
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
          <Outlet />
        </section>
      </main>

        {loadingData && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
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

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
