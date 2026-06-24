import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, Package, UploadCloud, ClipboardCheck, 
  ChefHat, DollarSign, LogOut, Bell, FileText, History, Database, X,
  FileSpreadsheet, Wrench
} from 'lucide-react';

// Import subcomponents
import Dashboard from './components/Dashboard';
import StockLedger from './components/StockLedger';
import PosUpload from './components/PosUpload';
import Recipes from './components/Recipes';
import StockOpname from './components/StockOpname';
import CostControl from './components/CostControl';
import Invoicing from './components/Invoicing';
import AuthScreen from './components/AuthScreen';
import AuditLogs from './components/AuditLogs';
import BackupCenter from './components/BackupCenter';
import ErrorBoundary from './components/ErrorBoundary';
import Onboarding from './components/Onboarding';
import Maintenance from './components/Maintenance';

// Lazy load SuperAdminPanel to avoid bundle bloat for regular users
const SuperAdminPanel = React.lazy(() => import('./components/SuperAdminPanel'));

// Import API service & Supabase client
import { api } from './services/api';
import { supabase } from './lib/supabase';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  
  // React Router replacements for activeTab state
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1);
  const setActiveTab = (tab) => {
    navigate(tab === 'dashboard' ? '/' : `/${tab}`);
  };
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const realtimeChannelRef = useRef(null);
  const isFetchingProfileRef = useRef(false);

  const showToast = (message, type = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  
  // 1. Core States
  const [stock, setStock] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const [tenantName, setTenantName] = useState('');

  // 1.5 Role-Based Access Control (RBAC) — Strict separation
  const TAB_ROLES = {
    dashboard:      ['Admin / Owner', 'Staff'],
    stock:          ['Admin / Owner', 'Staff'],
    pos:            ['Admin / Owner', 'Staff'],
    recipes:        ['Admin / Owner', 'Staff'],
    invoicing:      ['Admin / Owner'],       // Hanya Owner
    opname:         ['Admin / Owner'],       // Hanya Owner
    audit:          ['Admin / Owner'],       // Hanya Owner
    'cost-control': ['Admin / Owner'],       // Data keuangan
    backup:         ['Admin / Owner'],        // KRITIS
    maintenance:    ['Admin / Owner', 'Staff'] // Owner: full tools; Staff: read-only health
  };

  const isTabAllowed = (tab) => {
    if (activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin') {
      return tab === 'dashboard' || tab.startsWith('superadmin') || tab.startsWith('super-admin');
    }
    return TAB_ROLES[tab]?.includes(activeUser?.role);
  };

  // 1.6 Supabase Realtime — Low-Stock Alert Subscription
  const subscribeToLowStockAlerts = (tenantId) => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }
    const channel = supabase
      .channel(`low-stock-${tenantId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'materials',
        filter: `tenant_id=eq.${tenantId}`
      }, (payload) => {
        const mat = payload.new;
        const total = parseFloat(mat.qty_resto || 0) + parseFloat(mat.qty_central || 0);
        const minStock = parseFloat(mat.min_stock || 15);
        if (total <= 0) {
          showToast(`🔴 OUT OF STOCK: ${mat.name} habis! Segera lakukan pemesanan.`, 'error');
        } else if (total < minStock) {
          showToast(`⚠️ Low Stock Alert: ${mat.name} tersisa ${total.toFixed(1)} ${mat.unit}`, 'warning');
        }
      })
      .subscribe();
    realtimeChannelRef.current = channel;
  };

  // 2. Auth State Listener — Synchronous Event Listener to prevent Web Lock deadlocks
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[Auth Event] Triggered: ${event}`, session?.user?.email);
      // Only set session state synchronously (no async DB/auth calls inside the event listener!)
      setAuthSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2.1 Async Profile Loader — Runs outside the auth event listener context (no deadlocks)
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (authSession) {
        setIsAuthenticated(true);
        
        // Prevent concurrent duplicate profile fetches
        if (isFetchingProfileRef.current) {
          console.log("[Auth Flow] Profile fetch already in progress, skipping.");
          return;
        }
        isFetchingProfileRef.current = true;

        try {
          console.log("[Auth Flow] Starting profile fetch...");
          const profile = await api.getProfile();
          console.log("[Auth Flow] Profile fetch completed:", profile);
          
          if (profile && isMounted) {
            setActiveUser(profile);
            setTenantName(profile.tenant_name || '');
            // Initialize memory cache in api service
            api.setSessionData(profile.tenant_id, profile.id);
            if (profile.tenant_id) subscribeToLowStockAlerts(profile.tenant_id);
          } else if (isMounted) {
            console.warn("[Auth Flow] Profile not found, logging out...");
            setIsAuthenticated(false);
            setActiveUser(null);
            api.setSessionData(null, null);
            await supabase.auth.signOut();
          }
        } catch (e) {
          console.error('[Auth Flow] Profile fetch failed with error:', e);
          if (isMounted) {
            setIsAuthenticated(false);
            setActiveUser(null);
            api.setSessionData(null, null);
            await supabase.auth.signOut();
          }
        } finally {
          isFetchingProfileRef.current = false;
        }
      } else {
        console.log("[Auth Flow] No session active, clearing states.");
        setIsAuthenticated(false);
        setActiveUser(null);
        setTenantName('');
        setStock([]);
        setRecipes([]);
        setTransactions([]);
        setInvoices([]);
        api.setSessionData(null, null);
        if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
        sessionStorage.removeItem('barventis_onboarding_dismissed');
      }
    };

    loadProfile();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession]);

  // 2.5 Parallel Data Fetcher — uses Promise.all (LOW-02 fix)
  const fetchAllData = async () => {
    if (!isAuthenticated) return;
    setLoading(true);

    try {
      const [materialsData, recipesData, invoicesData, transactionsData] = await Promise.all([
        api.getMaterials().catch(e => { console.error('Materials:', e); return []; }),
        api.getRecipes().catch(e => { console.error('Recipes:', e); return []; }),
        api.getInvoices().catch(e => { console.error('Invoices:', e); return []; }),
        api.getTransactions().catch(e => { console.error('Transactions:', e); return []; })
      ]);

      setStock(materialsData);

      setRecipes(recipesData.map(r => ({
        ...r,
        total_cost: r.basic_cost,
        yield: "1",
        ingredients: (r.ingredients || []).map(ing => ({
          item_name: ing.item_name || (ing.material ? ing.material.name : 'Bahan Terhapus'),
          qty_in_use: parseFloat(ing.qty_in_use),
          unit: ing.unit,
          unit_price: parseFloat(ing.unit_price),
          amount: parseFloat(ing.amount)
        }))
      })));

      setInvoices(invoicesData.map(inv => ({
        ...inv,
        items: (inv.items || []).map(item => ({
          item_name: item.material ? item.material.name : 'Bahan Terhapus',
          qty: parseFloat(item.qty),
          unit_price: parseFloat(item.unit_price),
          unit: item.material ? item.material.unit : 'pck'
        }))
      })));

      const txData = Array.isArray(transactionsData) ? transactionsData : (transactionsData.data || []);
      setTransactions(txData);

      // Show onboarding for fresh tenants (no stock yet)
      const hasDismissed = sessionStorage.getItem('barventis_onboarding_dismissed') === 'true';
      if (materialsData.length === 0 && !hasDismissed) {
        setShowOnboarding(true);
      }
    } catch (e) {
      console.error('fetchAllData error:', e);
      showToast('Gagal memuat data: ' + e.message);
    }

    setLoading(false);
  };

  // Trigger data fetch when authenticated, activeUser profile is loaded, or when switching tabs
  useEffect(() => {
    if (isAuthenticated && activeUser) {
      if (activeUser.role === 'Super Admin' || activeUser.role === 'SuperAdmin') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(false);
      } else {
        fetchAllData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeUser, activeTab]);

  // Legacy auth handler (from AuthScreen)
  const handleAuthSuccess = (user, tenant) => {
    setActiveUser(user);
    setTenantName(tenant);
    setIsAuthenticated(true);
  };

  const handleLogout = () => handleLogoutAsync();
  const handleLogoutAsync = async () => {
    try {
      await api.logout();
    } catch (e) {
      console.warn('Logout error:', e);
      await supabase.auth.signOut();
      window.location.reload();
    }
  };

  // 3. Stock Adjustment Handler
  const handleAdjustStock = async (itemName, location, type, qty, notes) => {
    const match = stock.find(item => item.name === itemName);
    if (!match) return;
    try {
      await api.adjustStock(match.id, { location, type, qty, notes });
      showToast("Penyesuaian stok berhasil disimpan.", "success");
      await fetchAllData(); // Refresh all data from database
    } catch (e) {
      showToast("Adjustment gagal: " + e.message);
    }
  };

  // 4. Update Item Metadata
  const handleUpdateItem = async (updatedItem) => {
    const match = stock.find(item => item.name === updatedItem.originalName || item.name === updatedItem.name);
    if (!match) return;
    try {
      await api.updateMaterial(match.id, {
        name: updatedItem.name,
        category: updatedItem.category,
        supplier: updatedItem.supplier,
        unit: updatedItem.unit,
        full_pack: updatedItem.full_pack,
        price: updatedItem.price,
        new_price: updatedItem.new_price ?? updatedItem.price,
        min_stock: updatedItem.min_stock
      });
      showToast("Detail bahan baku berhasil diperbarui.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Update material gagal: " + e.message);
    }
  };

  // 5. Add New Material
  const handleAddItem = async (newItem) => {
    try {
      await api.createMaterial(newItem);
      showToast("Bahan baku baru berhasil ditambahkan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Tambah item gagal: " + e.message);
    }
  };

  // 6. Delete Material
  const handleDeleteItem = async (itemName) => {
    const match = stock.find(item => item.name === itemName);
    if (!match) return;
    try {
      await api.deleteMaterial(match.id);
      showToast("Bahan baku berhasil dinonaktifkan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Hapus item gagal: " + e.message);
    }
  };

  // 7. Process POS Excel Deductions
  const handleProcessPosSales = async (mappedSales, filename) => {
    try {
      await api.syncPos(filename, mappedSales);
      showToast("Sinkronisasi POS berhasil diselesaikan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Proses POS sync gagal: " + e.message);
    }
  };

  // 8. Recipe Handlers
  const handleSaveRecipe = async (updatedRecipe) => {
    const match = recipes.find(r => r.menu_name === updatedRecipe.menu_name);
    if (!match) return;
    try {
      const mappedIngredients = updatedRecipe.ingredients.map(ing => {
        const mat = stock.find(s => s.name === ing.item_name);
        return {
          material_id: mat ? mat.id : null,
          qty_in_use: ing.qty_in_use,
          unit: ing.unit
        };
      }).filter(ing => ing.material_id !== null);

      await api.updateRecipe(match.id, {
        menu_name: updatedRecipe.menu_name,
        category: updatedRecipe.category,
        selling_price: updatedRecipe.selling_price,
        ingredients: mappedIngredients
      });
      showToast("Resep COGS berhasil disimpan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Simpan resep gagal: " + e.message);
    }
  };

  const handleAddRecipe = async (newRecipe) => {
    try {
      const mappedIngredients = newRecipe.ingredients.map(ing => {
        const mat = stock.find(s => s.name === ing.item_name);
        return {
          material_id: mat ? mat.id : null,
          qty_in_use: ing.qty_in_use,
          unit: ing.unit
        };
      }).filter(ing => ing.material_id !== null);

      await api.createRecipe({
        menu_name: newRecipe.menu_name,
        category: newRecipe.category,
        selling_price: newRecipe.selling_price,
        ingredients: mappedIngredients
      });
      showToast("Resep baru berhasil ditambahkan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Tambah resep gagal: " + e.message);
    }
  };

  // 9. Stock Opname Handler
  const handleCompleteOpname = async (auditLoc, reconciliation, signatureData) => {
    try {
      const formattedItems = reconciliation.map(item => {
        const mat = stock.find(s => s.name === item.name);
        return {
          material_id: mat ? mat.id : null,
          physical_qty: item.physical_qty,
          notes: item.notes
        };
      }).filter(item => item.material_id !== null);

      await api.completeOpname({
        location: auditLoc,
        items: formattedItems,
        signature_svg: signatureData || ''
      });
      
      showToast("Stock opname berhasil diselesaikan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Stock opname gagal diselesaikan: " + e.message);
    }
  };

  // 10. Invoice Handlers
  const handleCreateInvoice = async (invoice) => {
    try {
      const formattedItems = invoice.items.map(item => {
        const mat = stock.find(s => s.name === item.item_name);
        return {
          material_id: mat ? mat.id : null,
          qty: item.qty,
          unit_price: item.unit_price
        };
      }).filter(item => item.material_id !== null);

      await api.createInvoice({
        supplier: invoice.supplier,
        notes: invoice.notes || '',
        location: invoice.location || 'CENTRAL',
        items: formattedItems
      });
      showToast("Invoice PO berhasil dibuat.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Buat invoice gagal: " + e.message);
    }
  };

  const handleReceiveInvoice = async (invoiceId) => {
    const match = invoices.find(inv => inv.id === invoiceId);
    if (!match) return;
    try {
      await api.receiveInvoice(match.id);
      showToast("Barang PO berhasil diterima ke gudang.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Terima barang invoice gagal: " + e.message);
    }
  };

  const handleCancelInvoice = async (invoiceId) => {
    const match = invoices.find(inv => inv.id === invoiceId);
    if (!match) return;
    try {
      await api.updateInvoiceStatus(match.id, 'CANCELLED');
      showToast("Invoice PO berhasil dibatalkan.", "success");
      await fetchAllData();
    } catch (e) {
      showToast("Batal invoice gagal: " + e.message);
    }
  };

  // If not authenticated, render Login Screen
  if (!isAuthenticated) {
    const isSA = location.pathname === '/superadmin' || location.pathname === '/super-admin';
    return <AuthScreen onAuthSuccess={handleAuthSuccess} isSuperAdminMode={isSA} />;
  }

  // Loading profile guard to prevent mounting routes or layouts before role is determined
  if (isAuthenticated && !activeUser) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#060913',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '16px'
        }}></div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>Memuat Profil Pengguna...</p>
        
        {/* Safe recovery action for user if connection hangs or session gets corrupted */}
        <button
          onClick={async () => {
            try {
              await supabase.auth.signOut();
            } catch { /* ignore: best-effort */ }
            setIsAuthenticated(false);
            setActiveUser(null);
            window.location.reload();
          }}
          style={{
            fontSize: '0.75rem',
            padding: '8px 14px',
            borderRadius: '6px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.08)'}
          onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.04)'}
        >
          Keluar & Kembali ke Login
        </button>
        
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Loading spinner during background fetch
  const renderLoadingOverlay = () => {
    if (!loading) return null;
    return (
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        background: 'rgba(30, 41, 59, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '12px 20px',
        color: '#fff',
        fontSize: '0.8rem',
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
        zIndex: 9999
      }}>
        <div style={{
          width: '14px',
          height: '14px',
          border: '2px solid rgba(255,255,255,0.3)',
          borderTopColor: '#3b82f6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }}></div>
        Sinkronisasi Database...
      </div>
    );
  };

  const userAvatar = activeUser?.name ? activeUser.name.charAt(0).toUpperCase() : 'G';
  const userName = activeUser?.name || 'User Resto';
  const userRole = activeUser?.role || 'Staff';

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
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
          RESTO ID: {tenantName.toUpperCase()}
        </div>

        <ul className="nav-links">
          {(activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin') ? (
            <>
              <li className={`nav-item ${(activeTab === 'superadmin' || activeTab === 'super-admin') ? 'active' : ''}`} onClick={() => setActiveTab('superadmin')}>
                <LayoutDashboard size={18} style={{ color: '#fbbf24' }} /> Kelola Tenant
              </li>
              <li className={`nav-item ${activeTab === 'superadmin/templates' ? 'active' : ''}`} onClick={() => setActiveTab('superadmin/templates')}>
                <FileSpreadsheet size={18} style={{ color: '#fbbf24' }} /> POS Templates
              </li>
              <li className={`nav-item ${activeTab === 'superadmin/logs' ? 'active' : ''}`} onClick={() => setActiveTab('superadmin/logs')}>
                <History size={18} style={{ color: '#fbbf24' }} /> Log Audit Global
              </li>
            </>
          ) : (
            <>
              {isTabAllowed('dashboard') && (
                <li className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                  <LayoutDashboard size={18} /> Dashboard
                </li>
              )}
              {isTabAllowed('stock') && (
                <li className={`nav-item ${activeTab === 'stock' ? 'active' : ''}`} onClick={() => setActiveTab('stock')}>
                  <Package size={18} /> Stock Materials
                </li>
              )}
              {isTabAllowed('pos') && (
                <li className={`nav-item ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>
                  <UploadCloud size={18} /> Upload POS Sales
                </li>
              )}
              {isTabAllowed('recipes') && (
                <li className={`nav-item ${activeTab === 'recipes' ? 'active' : ''}`} onClick={() => setActiveTab('recipes')}>
                  <ChefHat size={18} /> F&B Recipes (COGS)
                </li>
              )}
              {isTabAllowed('invoicing') && (
                <li className={`nav-item ${activeTab === 'invoicing' ? 'active' : ''}`} onClick={() => setActiveTab('invoicing')}>
                  <FileText size={18} /> Invoicing / PO
                </li>
              )}
              {isTabAllowed('opname') && (
                <li className={`nav-item ${activeTab === 'opname' ? 'active' : ''}`} onClick={() => setActiveTab('opname')}>
                  <ClipboardCheck size={18} /> Stock Opname
                </li>
              )}
              {isTabAllowed('audit') && (
                <li className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
                  <History size={18} /> Jejak Audit
                </li>
              )}
              {isTabAllowed('cost-control') && (
                <li className={`nav-item ${activeTab === 'cost-control' ? 'active' : ''}`} onClick={() => setActiveTab('cost-control')}>
                  <DollarSign size={18} /> Cost Control
                </li>
              )}
              {isTabAllowed('backup') && (
                <li className={`nav-item ${activeTab === 'backup' ? 'active' : ''}`} onClick={() => setActiveTab('backup')}>
                  <Database size={18} /> Backup & Restore
                </li>
              )}
              {isTabAllowed('maintenance') && (
                <li className={`nav-item ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => setActiveTab('maintenance')}>
                  <Wrench size={18} /> Maintenance
                </li>
              )}
            </>
          )}
        </ul>

        <div className="user-widget">
          <div className="user-avatar">{userAvatar}</div>
          <div className="user-info">
            <span className="user-name">{userName}</span>
            <span className="user-role">{userRole}</span>
          </div>
          <LogOut size={16} style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={handleLogout}
            title="Log Out dari Sistem"
          />
        </div>
      </aside>

      {/* Content */}
      <main className="main-content">
        <header className="content-header">
          <div className="header-title-sec">
            <h1>
              {(activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin') ? (
                <>
                  {(activeTab === 'superadmin' || activeTab === 'super-admin') && "Platform Tenants Management"}
                  {activeTab === 'superadmin/templates' && "Global POS Excel Templates"}
                  {activeTab === 'superadmin/logs' && "Global System Audit Trail"}
                </>
              ) : (
                <>
                  {activeTab === 'dashboard' && "Cost Control Dashboard"}
                  {activeTab === 'stock' && "Warehouse Stocks & Ledgers"}
                  {activeTab === 'pos' && "POS Kasir Integration"}
                  {activeTab === 'recipes' && "Menu COGS & Recipe Builder"}
                  {activeTab === 'invoicing' && "Purchase Invoicing"}
                  {activeTab === 'opname' && "Stock Opname & Auditing"}
                  {activeTab === 'audit' && "Jejak Audit Sistem (Audit Logs)"}
                  {activeTab === 'cost-control' && "Monthly Cost Control Sheet"}
                  {activeTab === 'backup' && "Backup & Restore Center"}
                  {activeTab === 'maintenance' && "System Maintenance"}
                </>
              )}
            </h1>
            <p>
              {(activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin') ? (
                <>
                  {(activeTab === 'superadmin' || activeTab === 'super-admin') && "Manage client databases, licenses, active/inactive statuses, and seed metrics."}
                  {activeTab === 'superadmin/templates' && "Define global Excel sheet mappings for Moka, Pawoon, Olsera, and other POS engines."}
                  {activeTab === 'superadmin/logs' && "Consolidated platform-wide security audit trails and log tracking."}
                </>
              ) : (
                <>
                  {activeTab === 'dashboard' && "Real-time F&B Beverage HPP analytics, top variance and metrics."}
                  {activeTab === 'stock' && "Manage raw materials — edit supplier, price, stock levels. Dual-unit display."}
                  {activeTab === 'pos' && "Browser-side Excel parser. Drag and drop POS reports to deduct raw stock."}
                  {activeTab === 'recipes' && "Configure ingredients, fixed costs, and selling HPP percentages."}
                  {activeTab === 'invoicing' && "Create purchase orders, track invoices, auto stock-in on receive."}
                  {activeTab === 'opname' && "Wizard-style month-end counting sheet with digital signature."}
                  {activeTab === 'audit' && "Linimasa riwayat log aktivitas, perubahan operasional dan parameter sistem."}
                  {activeTab === 'cost-control' && "Compare opening, purchasing, and closing opnames to hit <27% target."}
                  {activeTab === 'backup' && "Unduh, unggah, buat, dan kelola file cadangan database SQLite Barventis."}
                  {activeTab === 'maintenance' && "Status kesehatan sistem, pemeriksaan integritas data, hitung ulang HPP, dan manajemen role staff."}
                </>
              )}
            </p>
          </div>
          <div className="header-actions">
            <div style={{ position: 'relative', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <Bell size={20} />
              <div style={{ position: 'absolute', top: '-4px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></div>
            </div>
            {activeUser?.role !== 'Super Admin' && activeUser?.role !== 'SuperAdmin' && activeTab !== 'pos' && (
              <button className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '0.825rem', display: 'flex', gap: '6px', alignItems: 'center' }} onClick={() => setActiveTab('pos')}>
                <UploadCloud size={14} /> Quick POS Sync
              </button>
            )}
          </div>
        </header>

        <section>
          {!isTabAllowed(activeTab) ? (
            <div className="access-denied-wrapper" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 20px',
              color: '#fff',
            }}>
              <div style={{
                width: '100%',
                maxWidth: '480px',
                padding: '40px',
                background: 'rgba(30, 41, 59, 0.45)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: '16px',
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
              }}>
                <div style={{
                  fontSize: '4.5rem',
                  color: '#ef4444',
                  marginBottom: '16px',
                  fontWeight: '800',
                  lineHeight: '1'
                }}>403</div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '12px', color: '#f8fafc' }}>Akses Dibatasi</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '28px' }}>
                  Maaf, Anda login sebagai <strong>{activeUser?.role === 'Inventory Manager' ? 'Admin (Head Bar)' : activeUser?.role}</strong>. Halaman laporan keuangan HPP <strong>{activeTab.toUpperCase()}</strong> ini dikunci eksklusif untuk hak akses <strong>Owner</strong> saja.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin') {
                      setActiveTab('superadmin');
                    } else {
                      setActiveTab('dashboard');
                    }
                  }}
                  style={{ padding: '10px 24px', fontWeight: '700', borderRadius: '8px' }}
                >
                  Kembali ke Dashboard
                </button>
              </div>
            </div>
          ) : (
            <ErrorBoundary label="Halaman ini" role={activeUser?.role}>
              <Routes>
                {(activeUser?.role === 'Super Admin' || activeUser?.role === 'SuperAdmin') ? (
                  <>
                    <Route path="/superadmin" element={
                      <React.Suspense fallback={<div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Memuat Panel Sistem...</div>}>
                        <SuperAdminPanel tab="tenants" activeUser={activeUser} />
                      </React.Suspense>
                    } />
                    <Route path="/super-admin" element={
                      <React.Suspense fallback={<div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Memuat Panel Sistem...</div>}>
                        <SuperAdminPanel tab="tenants" activeUser={activeUser} />
                      </React.Suspense>
                    } />
                    <Route path="/superadmin/templates" element={
                      <React.Suspense fallback={<div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Memuat Panel Sistem...</div>}>
                        <SuperAdminPanel tab="templates" activeUser={activeUser} />
                      </React.Suspense>
                    } />
                    <Route path="/superadmin/logs" element={
                      <React.Suspense fallback={<div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: '#fff' }}>Memuat Panel Sistem...</div>}>
                        <SuperAdminPanel tab="logs" activeUser={activeUser} />
                      </React.Suspense>
                    } />
                    <Route path="/" element={<Navigate to="/superadmin" replace />} />
                    <Route path="*" element={<Navigate to="/superadmin" replace />} />
                  </>
                ) : (
                  <>
                    <Route path="/" element={<Dashboard stock={stock} recipes={recipes} transactions={transactions} onNavigate={setActiveTab} />} />
                    <Route path="/stock" element={<StockLedger stock={stock} transactions={transactions} onAdjustStock={handleAdjustStock} onUpdateItem={handleUpdateItem} onAddItem={handleAddItem} onDeleteItem={handleDeleteItem} />} />
                    <Route path="/pos" element={<PosUpload stock={stock} recipes={recipes} transactions={transactions} onProcessPosSales={handleProcessPosSales} />} />
                    <Route path="/recipes" element={<Recipes stock={stock} recipes={recipes} onSaveRecipe={handleSaveRecipe} onAddRecipe={handleAddRecipe} />} />
                    <Route path="/invoicing" element={<Invoicing stock={stock} invoices={invoices} onCreateInvoice={handleCreateInvoice} onReceiveInvoice={handleReceiveInvoice} onCancelInvoice={handleCancelInvoice} />} />
                    <Route path="/opname" element={<StockOpname stock={stock} transactions={transactions} onCompleteOpname={handleCompleteOpname} />} />
                    <Route path="/audit" element={<AuditLogs activeUser={activeUser} />} />
                    <Route path="/cost-control" element={<CostControl stock={stock} transactions={transactions} invoices={invoices} />} />
                    <Route path="/backup" element={<BackupCenter activeUser={activeUser} />} />
                    <Route path="/maintenance" element={<Maintenance activeUser={activeUser} />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </>
                )}
              </Routes>
            </ErrorBoundary>
          )}
        </section>
      </main>

      {renderLoadingOverlay()}

      {/* Onboarding Modal for new tenants */}
      {showOnboarding && (
        <Onboarding
          tenantName={tenantName}
          onNavigate={(tab) => setActiveTab(tab)}
          onDismiss={() => {
            setShowOnboarding(false);
            sessionStorage.setItem('barventis_onboarding_dismissed', 'true');
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          background: toast.type === 'success'
            ? 'rgba(34, 197, 94, 0.95)'
            : toast.type === 'warning'
            ? 'rgba(234, 179, 8, 0.95)'
            : 'rgba(239, 68, 68, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '12px 20px 12px 16px',
          color: '#fff',
          fontSize: '0.875rem',
          fontWeight: '600',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          maxWidth: '400px',
          backdropFilter: 'blur(10px)',
          animation: 'slideIn 0.3s ease'
        }}>
          <span style={{ fontSize: '1rem' }}>{toast.type === 'success' ? '✓' : toast.type === 'warning' ? '⚠️' : '⚠'}</span>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0 0 0 8px' }}>
            <X size={14} />
          </button>
        </div>
      )}
      
      {/* Dynamic spinner and animation CSS */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
