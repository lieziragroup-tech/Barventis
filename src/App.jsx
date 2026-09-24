import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import './App.css';

// Components & Pages
import ErrorBoundary from './components/ErrorBoundary';
import AuthScreen from './pages/auth/AuthScreen';

const AppLayout = React.lazy(() => import('./components/AppLayout'));
const Dashboard = React.lazy(() => import('./pages/shared/Dashboard'));

// === Hub Pages (Konsolidasi 7+1 Menu SO BARISTA 2026) ===
const BeverageSalesHub = React.lazy(() => import('./pages/shared/BeverageSalesHub'));
const DailyInventoryHub = React.lazy(() => import('./pages/shared/DailyInventoryHub'));
const ProcurementHub = React.lazy(() => import('./pages/shared/ProcurementHub'));
const PricingCogsHub = React.lazy(() => import('./pages/shared/PricingCogsHub'));
const OpnameAssetsHub = React.lazy(() => import('./pages/shared/OpnameAssetsHub'));
const ProductionHub = React.lazy(() => import('./pages/shared/ProductionHub'));
const CostControlReportHub = React.lazy(() => import('./pages/shared/CostControlReportHub'));
const SystemAdminHub = React.lazy(() => import('./pages/shared/SystemAdminHub'));

// === Legacy pages (masih dipakai langsung oleh Hub atau redirect) ===
const StockLedger = React.lazy(() => import('./pages/shared/StockLedger'));
const PosUpload = React.lazy(() => import('./pages/shared/PosUpload'));
const PosRawData = React.lazy(() => import('./pages/shared/PosRawData'));
const Recipes = React.lazy(() => import('./pages/shared/Recipes'));
const MenuPricing = React.lazy(() => import('./pages/shared/MenuPricing'));
const Marketlist = React.lazy(() => import('./pages/shared/Marketlist'));
const StockOpname = React.lazy(() => import('./pages/shared/StockOpname'));
const PhysicalCheck = React.lazy(() => import('./pages/shared/PhysicalCheck'));
const DailyInventory = React.lazy(() => import('./pages/shared/DailyInventory'));
const CostControl = React.lazy(() => import('./pages/shared/CostControl'));
const Invoicing = React.lazy(() => import('./pages/shared/Invoicing'));
const Purchasing = React.lazy(() => import('./pages/shared/Purchasing'));
const AuditLogs = React.lazy(() => import('./pages/shared/AuditLogs'));
const AssetManagement = React.lazy(() => import('./pages/shared/AssetManagement'));
const BackupCenter = React.lazy(() => import('./pages/shared/BackupCenter'));
const Maintenance = React.lazy(() => import('./pages/shared/Maintenance'));
const InterBranchTransfer = React.lazy(() => import('./pages/shared/InterBranchTransfer'));
const WasteLogs = React.lazy(() => import('./pages/shared/WasteLogs'));
const SuperAdminPanel = React.lazy(() => import('./pages/superadmin/SuperAdminPanel'));
const TenantAdminPanel = React.lazy(() => import('./pages/owner/TenantAdminPanel'));
const PosTerminal = React.lazy(() => import('./pages/pos/PosTerminal'));
const TrimmingProduction = React.lazy(() => import('./pages/shared/TrimmingProduction'));
const BaristaReport = React.lazy(() => import('./pages/shared/BaristaReport'));
const LandingPage = React.lazy(() => import('./pages/landing/NewLandingPage.tsx'));

const RouteErrorBoundary = ({ children }) => {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
};

const LoadingSpinner = () => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)'
  }}>
    <div style={{
      width: '36px', height: '36px', border: '3px solid var(--border)',
      borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '16px'
    }}></div>
    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Memuat Sistem...</p>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// Protected Route Component
const ProtectedRoute = ({ allowedRoles, children }) => {
  const { isAuthenticated, activeUser, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const role = activeUser?.role === 'SuperAdmin' ? 'Super Admin' : activeUser?.role;
  if (!activeUser || !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

// Root Redirect Component — shows landing page for guests, redirects auth users
const RootRedirect = () => {
  const { activeUser, loading, isAuthenticated } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!isAuthenticated || !activeUser) return <LandingPage />;

  const role = activeUser.role === 'SuperAdmin' ? 'Super Admin' : activeUser.role;
  if (role === 'Super Admin') return <Navigate to="/superadmin" replace />;

  return <Navigate to="/dashboard" replace />;
};

// Auth Guard Component
const AuthRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (isAuthenticated) return <RootRedirect />;
  return children;
};

const ALL_TENANT = ['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing', 'Staff'];
const ADMIN_ROLES = ['Admin / Owner', 'Owner'];

export default function App() {
  const { activeUser } = useAuth();

  return (
    <LanguageProvider>
    <React.Suspense fallback={<LoadingSpinner />}>
      <ErrorBoundary>
        <Routes>
        <Route path="/login" element={
          <AuthRoute>
            <AuthScreen />
          </AuthRoute>
        } />

        <Route path="/register" element={
          <AuthRoute>
            <AuthScreen />
          </AuthRoute>
        } />

        <Route path="/" element={<RootRedirect />} />

        {/* SUPER ADMIN */}
        <Route path="/superadmin" element={
          <ProtectedRoute allowedRoles={['Super Admin']}>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<RouteErrorBoundary><SuperAdminPanel tab="tenants" activeUser={activeUser} /></RouteErrorBoundary>} />
          <Route path="templates" element={<RouteErrorBoundary><SuperAdminPanel tab="templates" activeUser={activeUser} /></RouteErrorBoundary>} />
          <Route path="logs" element={<RouteErrorBoundary><SuperAdminPanel tab="logs" activeUser={activeUser} /></RouteErrorBoundary>} />
          <Route path="reset-approvals" element={<RouteErrorBoundary><SuperAdminPanel tab="reset-approvals" activeUser={activeUser} /></RouteErrorBoundary>} />
        </Route>

        {/* TENANT DASHBOARD — Konsolidasi 7+1 Menu */}
        <Route path="/dashboard" element={
          <ProtectedRoute allowedRoles={ALL_TENANT}>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<RouteErrorBoundary><Dashboard /></RouteErrorBoundary>} />

          {/* ====== 7 MODUL OPERASIONAL INTI ====== */}

          {/* [1] Penjualan Beverage (POS) */}
          <Route path="penjualan" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Service', 'Central', 'Bar', 'Staff']}>
              <RouteErrorBoundary><BeverageSalesHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [2] Daily Inventory & Waste */}
          <Route path="daily-inventory" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Service', 'Purchasing', 'Staff']}>
              <RouteErrorBoundary><DailyInventoryHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [3] Marketlist & Pembelian */}
          <Route path="procurement" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Central', 'Purchasing']}>
              <RouteErrorBoundary><ProcurementHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [4] Menu Pricing & COGS */}
          <Route path="pricing-cogs" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Staff']}>
              <RouteErrorBoundary><PricingCogsHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [5] Stock Opname & Aset */}
          <Route path="opname-assets" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Bar', 'Kitchen', 'Central', 'Staff']}>
              <RouteErrorBoundary><OpnameAssetsHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [6] Proses Produksi Bahan */}
          <Route path="produksi" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Kitchen', 'Central', 'Staff']}>
              <RouteErrorBoundary><ProductionHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [7] Cost Control & Laporan */}
          <Route path="cost-report" element={
            <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Central', 'Bar', 'Staff']}>
              <RouteErrorBoundary><CostControlReportHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* [*] Pengaturan & Sistem (Admin/Owner) */}
          <Route path="sistem" element={
            <ProtectedRoute allowedRoles={ADMIN_ROLES}>
              <RouteErrorBoundary><SystemAdminHub /></RouteErrorBoundary>
            </ProtectedRoute>
          } />

          {/* ====== BACKWARD COMPATIBILITY REDIRECTS ====== */}
          <Route path="pos" element={<Navigate to="/dashboard/penjualan?tab=upload" replace />} />
          <Route path="pos-raw" element={<Navigate to="/dashboard/penjualan?tab=raw" replace />} />
          <Route path="waste" element={<Navigate to="/dashboard/daily-inventory?tab=waste" replace />} />
          <Route path="marketlist" element={<Navigate to="/dashboard/procurement?tab=marketlist" replace />} />
          <Route path="purchasing" element={<Navigate to="/dashboard/procurement?tab=pembelian" replace />} />
          <Route path="invoicing" element={<Navigate to="/dashboard/procurement?tab=invoicing" replace />} />
          <Route path="recipes" element={<Navigate to="/dashboard/pricing-cogs?tab=cogs-beverage" replace />} />
          <Route path="pricing" element={<Navigate to="/dashboard/pricing-cogs?tab=pricing" replace />} />
          <Route path="opname" element={<Navigate to="/dashboard/opname-assets?tab=resto" replace />} />
          <Route path="assets" element={<Navigate to="/dashboard/opname-assets?tab=glass-tool" replace />} />
          <Route path="trimming" element={<Navigate to="/dashboard/produksi?tab=trimming" replace />} />
          <Route path="cost-control" element={<Navigate to="/dashboard/cost-report?tab=cost-control" replace />} />
          <Route path="barista-report" element={<Navigate to="/dashboard/cost-report?tab=laporan" replace />} />
          <Route path="physical-check" element={<Navigate to="/dashboard/opname-assets?tab=resto" replace />} />
          <Route path="stock" element={<Navigate to="/dashboard/sistem?tab=stock-ledger" replace />} />
          <Route path="transfer" element={<Navigate to="/dashboard/sistem?tab=transfer" replace />} />
          <Route path="settings" element={<Navigate to="/dashboard/sistem?tab=config" replace />} />
          <Route path="audit" element={<Navigate to="/dashboard/sistem?tab=audit-backup" replace />} />
          <Route path="backup" element={<Navigate to="/dashboard/sistem?tab=audit-backup" replace />} />
          <Route path="maintenance" element={<Navigate to="/dashboard/sistem?tab=audit-backup" replace />} />
        </Route>

        <Route path="/dashboard/pos-terminal" element={
          <ProtectedRoute allowedRoles={['Admin / Owner', 'Owner', 'Service', 'Bar', 'Staff']}>
            <RouteErrorBoundary><PosTerminal /></RouteErrorBoundary>
          </ProtectedRoute>
        } />

        <Route path="/unauthorized" element={
          <div className="access-denied-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ fontSize: '4.5rem', color: 'var(--danger)', marginBottom: '16px', fontWeight: '800', lineHeight: '1' }}>403</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '12px' }}>Akses Dibatasi</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '28px' }}>Anda tidak memiliki izin ke halaman ini.</p>
              <a href="/" style={{ padding: '10px 24px', background: 'var(--accent)', color: 'var(--text-inverse)', borderRadius: 'var(--radius-md)', textDecoration: 'none' }}>Kembali ke Dashboard</a>
            </div>
          </div>
        } />

        <Route path="*" element={<RootRedirect />} />
      </Routes>
      </ErrorBoundary>
    </React.Suspense>
    </LanguageProvider>
  );
}
