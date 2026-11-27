import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AuthProvider, useAuth } from "@/app/providers/AuthContext";

const AdminDashboard = lazy(() =>
    import("@/widgets/admin/AdminDashboard").then(m => ({ default: m.AdminDashboard }))
);
const ExecutorHome = lazy(() =>
    import("@/widgets/executor/ExecutorHome").then(m => ({ default: m.ExecutorHome }))
);
const LoginForm = lazy(() =>
    import("@/widgets/auth/LoginForm").then(m => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() =>
    import("@/pages/auth/SignupPage").then(m => ({ default: m.SignupPage }))
);

const PageLoader = () => (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <span className="w-8 h-8 border-2 border-[var(--border-subtle)] border-t-[var(--accent)] rounded-full animate-spin" />
    </div>
);

const Shell = () => {
    const { user, status } = useAuth();

    if (status === 'checking') {
        return <PageLoader />;
    }

    if (status === 'unauthenticated' || !user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role === 'TEKNISI_LAPANGAN') {
        return <ExecutorHome />;
    }
    return <AdminDashboard />;
};

const AuthRoute = ({ component: Component }: { component: React.ComponentType }) => {
    const { user, status } = useAuth();
    if (status === 'checking') {
        return <PageLoader />;
    }
    if (status === 'authenticated' && user) {
        return <Navigate to="/" replace />;
    }
    return <Component />;
};

export function App() {
    return (
        <MotionConfig reducedMotion="user">
            <BrowserRouter>
                <AuthProvider>
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path="/login" element={<AuthRoute component={LoginForm} />} />
                            <Route path="/signup" element={<AuthRoute component={SignupPage} />} />
                            <Route path="/*" element={<Shell />} />
                        </Routes>
                    </Suspense>
                </AuthProvider>
            </BrowserRouter>
        </MotionConfig>
    );
}

export default App;
