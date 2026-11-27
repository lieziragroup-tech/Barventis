import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/app/providers/AuthContext";
import { useVirtualKeyboard } from "@/shared/hooks/useVirtualKeyboard";
import { Home, ClipboardList, Clock, LogOut, BookOpen } from "lucide-react";
import { OfflineStatusBar } from "../../components/common/OfflineStatusBar";
import { RoleGuidebookModal } from "@/widgets/common/RoleGuidebookModal";

const FIELD_TABS = [
    { id: "dashboard", path: "/field/dashboard", label: "Beranda", icon: Home },
    { id: "jobs", path: "/field/jobs", label: "Tugas", icon: ClipboardList },
    { id: "history", path: "/field/history", label: "Riwayat", icon: Clock },
];

export function FieldLayout() {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const isKeyboardOpen = useVirtualKeyboard();
    const [showGuide, setShowGuide] = useState(false);

    const activeTabObj = FIELD_TABS.find(tab => location.pathname.startsWith(tab.path)) || FIELD_TABS[0];
    return (
        <div className="min-h-screen min-h-[100dvh] bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col font-sans select-none overflow-x-hidden">
            {/* Header bergaya Barventis Glassmorphism */}
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-black text-xs tracking-tight shadow-xs">
                        FW
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-[var(--text-primary)] leading-tight tracking-tight">
                            Fieldwork
                        </h1>
                        <p className="text-[10px] text-[var(--text-muted)] font-medium">
                            Teknisi Lapangan
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-secondary)] hidden sm:inline-block max-w-[120px] truncate">
                        {user?.name || "Teknisi"}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowGuide(true)}
                        title="Panduan Tugas Teknisi"
                        className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-emerald-50 transition-colors"
                        aria-label="Panduan Tugas"
                    >
                        <BookOpen size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={logout}
                        title="Keluar"
                        className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        aria-label="Logout"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* Offline Status Monitor */}
            <OfflineStatusBar />

            {/* Main Outlet dengan padding bawah ekstra agar form/konten tidak terpotong floating island */}
            <main className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 pb-28">
                <Outlet />
            </main>

            {/* Barventis-Style Dynamic Island Floating Navigation */}
            <AnimatePresence>
                {!isKeyboardOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.95 }}
                        transition={{
                            type: "spring",
                            stiffness: 450,
                            damping: 32,
                            mass: 0.7,
                        }}
                        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none max-w-[95vw]"
                        role="navigation"
                        aria-label="Navigasi Lapangan"
                    >
                        <nav
                            className="pointer-events-auto bg-white/95 text-[var(--text-primary)] backdrop-blur-2xl border border-[var(--border)] shadow-[0_8px_30px_rgba(45,42,38,0.12)] rounded-full p-1.5 flex items-center gap-1.5 overflow-hidden"
                            style={{ touchAction: "manipulation" }}
                        >
                            {FIELD_TABS.map(tab => {
                                const isActive = activeTabObj.id === tab.id;
                                const Icon = tab.icon;

                                return (
                                    <motion.button
                                        key={tab.id}
                                        layout
                                        type="button"
                                        onClick={() => navigate(tab.path)}
                                        whileTap={{ scale: 0.92 }}
                                        transition={{
                                            layout: { type: "spring", stiffness: 500, damping: 35 },
                                            opacity: { duration: 0.15 },
                                        }}
                                        className={`relative flex items-center justify-center gap-2 rounded-full cursor-pointer transition-colors ${
                                            isActive
                                                ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold shadow-[0_2px_10px_rgba(26,92,56,0.25)] px-4 py-2 h-10"
                                                : "w-10 h-10 text-[var(--text-secondary)] hover:text-[var(--accent)] hover:bg-[#f5f3ef]"
                                        }`}
                                        title={tab.label}
                                        aria-label={tab.label}
                                    >
                                        <Icon
                                            size={18}
                                            className={`shrink-0 ${isActive ? "text-white" : "text-[var(--text-secondary)]"}`}
                                        />

                                        <AnimatePresence mode="popLayout" initial={false}>
                                            {isActive && (
                                                <motion.span
                                                    key={`label-${tab.id}`}
                                                    initial={{ opacity: 0, width: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, width: "auto", scale: 1 }}
                                                    exit={{ opacity: 0, width: 0, scale: 0.9 }}
                                                    transition={{
                                                        type: "spring",
                                                        stiffness: 500,
                                                        damping: 35,
                                                    }}
                                                    className="text-xs font-semibold tracking-tight whitespace-nowrap overflow-hidden inline-block"
                                                >
                                                    {tab.label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </motion.button>
                                );
                            })}
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal Panduan Alur Kerja Teknisi Lapangan */}
            <RoleGuidebookModal
                isOpen={showGuide}
                onClose={() => setShowGuide(false)}
                initialRole="TEKNISI_LAPANGAN"
            />
        </div>
    );
}
