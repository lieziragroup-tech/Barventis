import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { MOTION_EASE, MOTION_SPRING } from '@/shared/lib/motion';
import { X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { DynamicIslandNav, NavItem } from './DynamicIslandNav';

export interface SidebarItem {
    id: string;
    label: string;
    shortLabel?: string;
    group?: string;
    icon: React.ReactNode;
    danger?: boolean;
    badge?: number | string;
    keywords?: string[];
}

export interface AppLayoutProps {
    sidebarItems: SidebarItem[];
    activeTab: string;
    onTabChange: (id: string) => void;
    header: React.ReactNode;
    sidebarHeader: React.ReactNode;
    children: React.ReactNode;
    dynamicIslandItems?: NavItem[];
    isSidebarOpen?: boolean;
    onSidebarOpenChange?: (open: boolean) => void;
}

/**
 * AppLayout FieldWork — Mengadopsi Desain AdminShell RedesignFieldworkGuciMasLite (#173f30 Forest Green Sidebar):
 * - Desktop (>= 1280px): Rail 64px melebar ke 252px saat hover atau dapat dikunci terbuka.
 * - Tablet & mobile (< 1280px): Sidebar menggunakan drawer dengan tombol hamburger; tidak bergantung pada hover.
 * - Pencarian modul terpusat di Top Header (Ctrl+K) tanpa search bar ganda di dalam sidebar.
 */
export function AppLayout({
    sidebarItems,
    activeTab,
    onTabChange,
    header,
    sidebarHeader,
    children,
    dynamicIslandItems,
    isSidebarOpen: controlledOpen,
    onSidebarOpenChange,
}: AppLayoutProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [isDesktopLayout, setIsDesktopLayout] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1280);
    const [isPinnedDesktop, setIsPinnedDesktop] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('gep_sidebar_pinned');
            if (saved !== null) return saved === 'true';
            return true;
        } catch {
            return true;
        }
    });
    const hoverTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const updateDeviceHints = () => {
            if (typeof window.matchMedia === 'function') {
                setIsTouchDevice(window.matchMedia('(hover: none), (pointer: coarse)').matches);
            }
            setIsDesktopLayout(window.innerWidth >= 1280);
        };
        updateDeviceHints();
        window.addEventListener('resize', updateDeviceHints);
        return () => window.removeEventListener('resize', updateDeviceHints);
    }, []);

    const isSidebarOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const isExpanded = isSidebarOpen || isHovered || isPinnedDesktop;

    const setSidebarOpen = (val: boolean) => {
        setInternalOpen(val);
        onSidebarOpenChange?.(val);
    };

    useEffect(() => {
        if (!isSidebarOpen) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setInternalOpen(false);
                onSidebarOpenChange?.(false);
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isSidebarOpen, onSidebarOpenChange]);

    const togglePinDesktop = () => {
        const next = !isPinnedDesktop;
        setIsPinnedDesktop(next);
        try {
            localStorage.setItem('gep_sidebar_pinned', String(next));
        } catch {
            // ignore storage errors
        }
    };

    const handleMouseEnter = () => {
        if (typeof window !== 'undefined' && (window.innerWidth < 1280 || isTouchDevice)) return;
        if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = window.setTimeout(() => {
            setIsHovered(true);
        }, 35);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) {
            window.clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setIsHovered(false);
    };

    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        let isTracking = false;

        const handleTouchStart = (e: TouchEvent) => {
            if (window.innerWidth >= 1280 || isSidebarOpen) return;
            const touch = e.touches[0];
            if (!touch) return;
            if (touch.clientX < 28) {
                isTracking = true;
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                touchStartTime = Date.now();
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!isTracking) return;
            const touch = e.touches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStartX;
            const deltaY = Math.abs(touch.clientY - touchStartY);
            if (deltaY > 25 && deltaX < 30) {
                isTracking = false;
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!isTracking) return;
            const touch = e.changedTouches[0];
            if (!touch) return;
            const deltaX = touch.clientX - touchStartX;
            const deltaTime = Math.max(1, Date.now() - touchStartTime);
            const velocity = deltaX / deltaTime;
            if (deltaX > 65 || velocity > 0.45) {
                setSidebarOpen(true);
            }
            isTracking = false;
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: true });
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            document.removeEventListener('touchstart', handleTouchStart);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isSidebarOpen]);

    const handleTabClick = (id: string) => {
        if (isTouchDevice && !isExpanded && typeof window !== 'undefined' && window.innerWidth >= 1280) {
            setSidebarOpen(true);
            return;
        }
        onTabChange(id);
        setSidebarOpen(false);
    };

    const groupedItems = React.useMemo(() => {
        const groups: { name: string; items: SidebarItem[] }[] = [];
        for (const item of sidebarItems) {
            const gName = item.group || 'MENU UTAMA';
            let existing = groups.find(g => g.name === gName);
            if (!existing) {
                existing = { name: gName, items: [] };
                groups.push(existing);
            }
            existing.items.push(item);
        }
        return groups;
    }, [sidebarItems]);

    return (
        <div className="flex flex-col h-screen h-dvh min-h-[100dvh] bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-hidden">
            <div
                className={cn(
                    'transition-[padding] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0',
                    isPinnedDesktop ? 'xl:pl-[252px]' : 'xl:pl-[64px]'
                )}
            >
                {header}
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                <AnimatePresence>
                    {isSidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16, ease: MOTION_EASE.enter }}
                            className="fixed inset-0 z-40 bg-[#0d1c13]/45 backdrop-blur-[1.5px]"
                            aria-hidden="true"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar dengan Gaya RedesignFieldworkGuciMasLite (#173f30 Deep Forest Green) */}
                <motion.aside
                    aria-label="Navigasi Utama"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    initial={false}
                    animate={{
                        width: isExpanded ? 252 : 64,
                    }}
                    transition={{
                        type: 'tween',
                        duration: 0.2,
                        ease: MOTION_EASE.enter,
                    }}
                    className={cn(
                        'fixed inset-y-0 left-0 z-50 bg-[#173f30] text-white border-r border-white/10 flex flex-col select-none overflow-hidden',
                        'transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                        isSidebarOpen ? 'translate-x-0' : '-translate-x-full xl:translate-x-0',
                        isExpanded && !isPinnedDesktop
                            ? 'shadow-[10px_0_32px_rgba(13,28,19,0.28)]'
                            : 'shadow-none'
                    )}
                >
                    {/* Sidebar Head (Brand Mark 3 Batang Putih + Nama Perusahaan) */}
                    <div className="h-[64px] px-3.5 border-b border-white/10 flex items-center justify-between shrink-0">
                        <div className="flex items-center min-w-0">
                            <button
                                type="button"
                                onClick={() => setSidebarOpen(!isSidebarOpen)}
                                aria-label={isSidebarOpen ? 'Tutup navigasi sidebar' : 'Buka navigasi sidebar'}
                                aria-expanded={isSidebarOpen}
                                title="Buka / Tutup Detail Menu Sidebar"
                                className="brand-mark hover:opacity-95 transition-opacity cursor-pointer shrink-0"
                            >
                                <span />
                                <span />
                                <span />
                            </button>
                            <div
                                className={cn(
                                    'ml-3 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out [&_span]:!text-white [&_p]:!text-[#c9d8cf]',
                                    isExpanded
                                        ? 'opacity-100 translate-x-0 w-[166px]'
                                        : 'opacity-0 -translate-x-1.5 w-0 pointer-events-none'
                                )}
                            >
                                {sidebarHeader}
                            </div>
                        </div>

                        {isExpanded && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSidebarOpen(false);
                                    setIsHovered(false);
                                }}
                                className="xl:hidden w-8 h-8 rounded-lg border border-white/15 flex items-center justify-center text-[#c9d8cf] hover:bg-white/10 hover:text-white shrink-0"
                                aria-label="Tutup Menu"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>

                    <nav data-app-tour="sidebar-nav" className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 space-y-1 no-scrollbar" aria-label="Daftar modul aplikasi">
                        {sidebarItems.map(item => {
                            const active = activeTab === item.id;
                            const danger = item.danger;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleTabClick(item.id)}
                                    aria-current={active ? 'page' : undefined}
                                    aria-label={item.label}
                                    title={!isExpanded ? item.label : undefined}
                                    className={cn(
                                        'w-full min-h-[42px] flex items-center rounded-[10px] text-[13px] transition-colors duration-180 relative group/item cursor-pointer select-none',
                                        active
                                            ? 'bg-white/12 text-white font-semibold'
                                            : 'text-[#c9d8cf] hover:bg-white/8 hover:text-white font-medium'
                                    )}
                                >
                                    {active && (
                                        <>
                                            <motion.div
                                                layoutId="active-nav-indicator"
                                                transition={MOTION_SPRING.indicator}
                                                className="absolute inset-0 rounded-[10px] bg-white/10 pointer-events-none -z-10"
                                            />
                                            <span
                                                aria-hidden="true"
                                                className={cn(
                                                    'absolute left-1 top-2.5 bottom-2.5 w-[3px] rounded-full',
                                                    danger ? 'bg-rose-400' : 'bg-[#a9c9b4]'
                                                )}
                                            />
                                        </>
                                    )}

                                    <div
                                        className={cn(
                                            'w-10 h-10 flex items-center justify-center shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px] transition-transform duration-150',
                                            active
                                                ? danger
                                                    ? 'text-rose-300'
                                                    : 'text-white'
                                                : 'text-[#9bc4a9] group-hover/item:text-white'
                                        )}
                                    >
                                        {item.icon}
                                    </div>

                                    <div
                                        className={cn(
                                            'flex-1 flex items-center justify-between pr-2.5 min-w-0 overflow-hidden whitespace-nowrap transition-all duration-150 ease-out',
                                            isExpanded
                                                ? 'opacity-100 translate-x-0'
                                                : 'opacity-0 -translate-x-1.5 pointer-events-none'
                                        )}
                                    >
                                        <span className="truncate">{item.label}</span>

                                        {item.badge !== undefined && item.badge !== 0 && item.badge !== '0' && (
                                            <span
                                                className={cn(
                                                    'ml-1.5 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold shrink-0 leading-none tabular-nums',
                                                    danger
                                                        ? 'bg-rose-500/25 text-rose-200 border border-rose-400/30'
                                                        : active
                                                        ? 'bg-[#a9c9b4] text-[#173f30]'
                                                        : 'bg-white/12 text-[#dbe8df]'
                                                )}
                                            >
                                                {item.badge}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Sidebar Footer (Collapse / Stay Open Toggle) */}
                    <div className="flex h-12 px-2.5 border-t border-white/10 items-center bg-[#14372a] shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1280) {
                                    setSidebarOpen(!isSidebarOpen);
                                } else {
                                    togglePinDesktop();
                                }
                            }}
                            aria-label={!isDesktopLayout ? 'Tutup menu navigasi' : isPinnedDesktop ? 'Ciutkan sidebar' : 'Kunci Sidebar Agar Tetap Terbuka'}
                            title={!isDesktopLayout ? 'Tutup menu navigasi' : isPinnedDesktop ? 'Ciutkan sidebar (Mode Ringkas)' : 'Perluas & Kunci Sidebar'}
                            className="w-full h-9 flex items-center rounded-lg text-xs text-[#c9d8cf] hover:text-white hover:bg-white/8 transition-colors cursor-pointer overflow-hidden"
                        >
                            <div className="w-10 h-9 flex items-center justify-center shrink-0 text-[#9bc4a9]">
                                {isPinnedDesktop || isSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                            </div>
                            <span
                                className={cn(
                                    'whitespace-nowrap truncate transition-all duration-150 ease-out font-medium',
                                    isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1.5 pointer-events-none'
                                )}
                            >
                                {!isDesktopLayout ? 'Tutup Menu' : isPinnedDesktop ? 'Ciutkan Sidebar' : 'Kunci Sidebar Terbuka'}
                            </span>
                        </button>
                    </div>
                </motion.aside>

                <main
                    className={cn(
                        'flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative bg-[var(--bg-primary)] page-fade-in w-full pb-24 transition-[margin] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                        isPinnedDesktop ? 'xl:ml-[252px]' : 'xl:ml-[64px]'
                    )}
                >
                    {children}
                </main>
            </div>

            {dynamicIslandItems && dynamicIslandItems.length > 0 && (
                <DynamicIslandNav
                    items={dynamicIslandItems}
                    activeTab={activeTab}
                    onTabChange={handleTabClick}
                />
            )}
        </div>
    );
}
