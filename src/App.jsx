import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useData } from './contexts/DataContext';
import { LanguageProvider } from './contexts/LanguageContext';
import './App.css';

// Components & Pages
import ErrorBoundary from './components/ErrorBoundary';

const AuthScreen = React.lazy(() => import('./pages/auth/AuthScreen'));
const DashboardLayout = React.lazy(() => import('./components/layout/DashboardLayout'));
const Dashboard = React.lazy(() => import('./pages/shared/Dashboard'));
const StockLedger = React.lazy(() => import('./pages/shared/StockLedger'));
const PosUpload = React.lazy(() => import('./pages/shared/PosUpload'));
const Recipes = React.lazy(() => import('./pages/shared/Recipes'));
const StockOpname = React.lazy(() => import('./pages/shared/StockOpname'));
const CostControl = React.lazy(() => import('./pages/shared/CostControl'));
const Invoicing = React.lazy(() => import('./pages/shared/Invoicing'));
const AuditLogs = React.lazy(() => import('./pages/shared/AuditLogs'));
const BackupCenter = React.lazy(() => import('./pages/shared/BackupCenter'));
const Maintenance = React.lazy(() => import('./pages/shared/Maintenance'));
const SuperAdminPanel = React.lazy(() => import('./pages/superadmin/SuperAdminPanel'));
const TenantAdminPanel = React.lazy(() => import('./pages/owner/TenantAdminPanel'));
const PosTerminal = React.lazy(() => import('./pages/pos/PosTerminal'));
const LandingPage = React.lazy(() => import('./pages/landing/LandingPage'));

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
  if (role === 'Admin / Owner') return <Navigate to="/owner" replace />;
  if (role === 'Staff') return <Navigate to="/staff" replace />;
  
  return <Navigate to="/unauthorized" replace />;
};

// Auth Guard Component
const AuthRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (isAuthenticated) return <RootRedirect />;
  return children;
};

export default function App() {
  const { activeUser } = useAuth();

  return (
    <LanguageProvider>
    <React.Suspense fallback={<LoadingSpinner />}>
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
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<SuperAdminPanel tab="tenants" activeUser={activeUser} />} />
          <Route path="templates" element={<SuperAdminPanel tab="templates" activeUser={activeUser} />} />
          <Route path="logs" element={<SuperAdminPanel tab="logs" activeUser={activeUser} />} />
        </Route>

        {/* OWNER */}
        <Route path="/owner" element={
          <ProtectedRoute allowedRoles={['Admin / Owner']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="stock" element={<ErrorBoundary><StockLedger /></ErrorBoundary>} />
          <Route path="pos" element={<ErrorBoundary><PosUpload /></ErrorBoundary>} />
          <Route path="recipes" element={<ErrorBoundary><Recipes /></ErrorBoundary>} />
          <Route path="invoicing" element={<ErrorBoundary><Invoicing /></ErrorBoundary>} />
          <Route path="opname" element={<ErrorBoundary><StockOpname /></ErrorBoundary>} />
          <Route path="audit" element={<ErrorBoundary><AuditLogs /></ErrorBoundary>} />
          <Route path="cost-control" element={<ErrorBoundary><CostControl /></ErrorBoundary>} />
          <Route path="backup" element={<ErrorBoundary><BackupCenter /></ErrorBoundary>} />
          <Route path="maintenance" element={<ErrorBoundary><Maintenance /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary><TenantAdminPanel /></ErrorBoundary>} />
        </Route>

        <Route path="/owner/pos-terminal" element={
          <ProtectedRoute allowedRoles={['Admin / Owner']}>
            <ErrorBoundary><PosTerminal /></ErrorBoundary>
          </ProtectedRoute>
        } />

        {/* STAFF */}
        <Route path="/staff" element={
          <ProtectedRoute allowedRoles={['Staff']}>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="stock" element={<ErrorBoundary><StockLedger /></ErrorBoundary>} />
          <Route path="pos" element={<ErrorBoundary><PosUpload /></ErrorBoundary>} />
          <Route path="recipes" element={<ErrorBoundary><Recipes /></ErrorBoundary>} />
          <Route path="maintenance" element={<ErrorBoundary><Maintenance /></ErrorBoundary>} />
        </Route>

        <Route path="/staff/pos-terminal" element={
          <ProtectedRoute allowedRoles={['Staff']}>
            <ErrorBoundary><PosTerminal /></ErrorBoundary>
          </ProtectedRoute>
        } />

        <Route path="/unauthorized" element={
          <div className="access-denied-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--card-shadow)' }}>
              <div style={{ fontSize: '4.5rem', color: 'var(--danger)', marginBottom: '16px', fontWeight: '800', lineHeight: '1' }}>403</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '12px' }}>Akses Dibatasi</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '28px' }}>Anda tidak memiliki izin ke halaman ini.</p>
              <a href="/" style={{ padding: '10px 24px', background: 'var(--accent)', color: 'var(--text-inverse)', borderRadius: '8px', textDecoration: 'none' }}>Kembali ke Dashboard</a>
            </div>
          </div>
        } />

        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </React.Suspense>
    </LanguageProvider>
  );
}