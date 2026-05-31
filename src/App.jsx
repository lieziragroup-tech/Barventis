import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, Package, UploadCloud, ClipboardCheck, 
  ChefHat, DollarSign, LogOut, Bell, FileText, History, Database, X
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

// Import API service & Supabase client
import { api } from './services/api';
import { supabase } from './lib/supabase';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const realtimeChannelRef = useRef(null);

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
    backup:         ['Admin / Owner']        // KRITIS
  };

  const isTabAllowed = (tab) => {
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

  // 2. Auth State Listener (replaces localStorage pattern — KRITIS-01 fix)
  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsAuthenticated(true);
        // Fetch user profile from DB
        api.getProfile().then(profile => {
          if (profile) {
            setActiveUser(profile);
            setTenantName(profile.tenant_name || '');
            if (profile.tenant_id) subscribeToLowStockAlerts(profile.tenant_id);
          }
        }).catch(console.warn);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        try {
          const profile = await api.getProfile();
          if (profile) {
            setActiveUser(profile);
            setTenantName(profile.tenant_name || '');
            if (profile.tenant_id) subscribeToLowStockAlerts(profile.tenant_id);
          }
        } catch (e) { console.warn('Profile fetch failed:', e); }
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setActiveUser(null);
        setTenantName('');
        setStock([]); setRecipes([]); setTransactions([]); setInvoices([]);
        if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (realtimeChannelRef.current) supabase.removeChannel(realtimeChannelRef.current);
    };
  }, []);

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
          item_name: ing.material ? ing.material.name : 'Bahan Terhapus',
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
      if (materialsData.length === 0) {
        setShowOnboarding(true);
      }
    } catch (e) {
      console.error('fetchAllData error:', e);
      showToast('Gagal memuat data: ' + e.message);
    }

    setLoading(false);
  };

  // Trigger data fetch when authenticated
  useEffect(() => {
    if (isAuthenticated) fetchAllData();
  }, [isAuthenticated]);

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

  // If not authenticated, render beautiful Login/Signup Screen
  if (!isAuthenticated) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
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
              {activeTab === 'dashboard' && "Cost Control Dashboard"}
              {activeTab === 'stock' && "Warehouse Stocks & Ledgers"}
              {activeTab === 'pos' && "POS Kasir Integration"}
              {activeTab === 'recipes' && "Menu COGS & Recipe Builder"}
              {activeTab === 'invoicing' && "Purchase Invoicing"}
              {activeTab === 'opname' && "Stock Opname & Auditing"}
              {activeTab === 'audit' && "Jejak Audit Sistem (Audit Logs)"}
              {activeTab === 'cost-control' && "Monthly Cost Control Sheet"}
              {activeTab === 'backup' && "Backup & Restore Center"}
            </h1>
            <p>
              {activeTab === 'dashboard' && "Real-time F&B Beverage HPP analytics, top variance and metrics."}
              {activeTab === 'stock' && "Manage raw materials — edit supplier, price, stock levels. Dual-unit display."}
              {activeTab === 'pos' && "Browser-side Excel parser. Drag and drop POS reports to deduct raw stock."}
              {activeTab === 'recipes' && "Configure ingredients, fixed costs, and selling HPP percentages."}
              {activeTab === 'invoicing' && "Create purchase orders, track invoices, auto stock-in on receive."}
              {activeTab === 'opname' && "Wizard-style month-end counting sheet with digital signature."}
              {activeTab === 'audit' && "Linimasa riwayat log aktivitas, perubahan operasional dan parameter sistem."}
              {activeTab === 'cost-control' && "Compare opening, purchasing, and closing opnames to hit <27% target."}
              {activeTab === 'backup' && "Unduh, unggah, buat, dan kelola file cadangan database SQLite Barventis."}
            </p>
          </div>
          <div className="header-actions">
            <div style={{ position: 'relative', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <Bell size={20} />
              <div style={{ position: 'absolute', top: '-4px', right: '-2px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }}></div>
            </div>
            {activeTab !== 'pos' && (
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
                  onClick={() => setActiveTab('dashboard')}
                  style={{ padding: '10px 24px', fontWeight: '700', borderRadius: '8px' }}
                >
                  Kembali ke Dashboard
                </button>
              </div>
            </div>
          ) : (
            <ErrorBoundary label="Halaman ini">
              {activeTab === 'dashboard' && <Dashboard stock={stock} recipes={recipes} transactions={transactions} onNavigate={setActiveTab} />}
              {activeTab === 'stock' && <StockLedger stock={stock} transactions={transactions} onAdjustStock={handleAdjustStock} onUpdateItem={handleUpdateItem} onAddItem={handleAddItem} onDeleteItem={handleDeleteItem} />}
              {activeTab === 'pos' && <PosUpload stock={stock} recipes={recipes} transactions={transactions} onProcessPosSales={handleProcessPosSales} />}
              {activeTab === 'recipes' && <Recipes stock={stock} recipes={recipes} onSaveRecipe={handleSaveRecipe} onAddRecipe={handleAddRecipe} />}
              {activeTab === 'invoicing' && <Invoicing stock={stock} invoices={invoices} onCreateInvoice={handleCreateInvoice} onReceiveInvoice={handleReceiveInvoice} onCancelInvoice={handleCancelInvoice} />}
              {activeTab === 'opname' && <StockOpname stock={stock} transactions={transactions} onCompleteOpname={handleCompleteOpname} />}
              {activeTab === 'audit' && <AuditLogs activeUser={activeUser} />}
              {activeTab === 'cost-control' && <CostControl stock={stock} transactions={transactions} invoices={invoices} />}
              {activeTab === 'backup' && <BackupCenter activeUser={activeUser} />}
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
          onDismiss={() => setShowOnboarding(false)}
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
