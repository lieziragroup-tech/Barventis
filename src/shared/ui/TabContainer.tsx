import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MOTION_SPRING } from '@/shared/lib/motion';

export interface CapsuleTabItem {
    id: string;
    label: string;
    shortLabel?: string;
    icon?: React.ReactNode;
    badge?: number | string;
    badgeTone?: 'default' | 'warning' | 'success' | 'danger';
}

export interface TabContainerProps {
    tabs: CapsuleTabItem[];
    activeTab: string;
    onChange: (tabId: string) => void;
    className?: string;
    /** Sembunyikan bar tab horizontal di bagian atas (gunakan ketika hanya ingin menampilkan Floating Bottom Pill). */
    hideTopBar?: boolean;
    /** Tampilkan kapsul melayang di bawah layar pada semua ukuran layar (termasuk desktop). */
    floatingOnAllScreens?: boolean;
    /** Tampilkan kapsul melayang di bawah layar khusus pada perangkat Mobile & Tablet (< 1024px). */
    showFloatingBottom?: boolean;
}

const BADGE_TONES: Record<NonNullable<CapsuleTabItem['badgeTone']>, string> = {
    default: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    warning: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
    success: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    danger:  'bg-rose-500/20 text-rose-800 dark:text-rose-300',
};

/**
 * Komponen TabContainer bergaya Barventis (mendukung penuh Tema Terang & Tema Gelap html.dark):
 * 1. Top Capsule Sub-Menu Bar: tampil konsisten sesuai menu pada grup sidebar role aktif (dapat disembunyikan via hideTopBar).
 * 2. Dynamic Floating Bottom Pill: tampil di bagian bawah layar dan otomatis bersembunyi saat modal/kamera aktif.
 */
export const TabContainer: React.FC<TabContainerProps> = ({
    tabs,
    activeTab,
    onChange,
    className = '',
    hideTopBar = false,
    floatingOnAllScreens = false,
    showFloatingBottom = true,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    useEffect(() => {
        if (hideTopBar) return;
        const el = tabRefs.current[activeTab];
        const container = containerRef.current;
        if (el && container) {
            const left = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
            container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        }
    }, [activeTab, hideTopBar]);

    return (
        <>
            {!hideTopBar && (
                <div
                    ref={containerRef}
                    role="tablist"
                    className={`inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] max-w-full overflow-x-auto no-scrollbar ${className}`}
                >
                    {tabs.map(tab => {
                        const isActive = tab.id === activeTab;
                        const tone = tab.badgeTone ?? 'default';
                        return (
                            <button
                                key={tab.id}
                                ref={el => { tabRefs.current[tab.id] = el; }}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                onClick={() => onChange(tab.id)}
                                className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                                    isActive
                                        ? 'text-[var(--accent)] font-bold'
                                        : 'text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/60'
                                }`}
                            >
                                {isActive && (
                                    <motion.span
                                        layoutId="tab-container-active"
                                        transition={MOTION_SPRING.indicator}
                                        aria-hidden="true"
                                        className="absolute inset-0 rounded-lg bg-[var(--bg-card)] shadow-2xs border border-[var(--border-subtle)] pointer-events-none"
                                    />
                                )}
                                {tab.icon && (
                                    <span className={`relative z-10 shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                                        {tab.icon}
                                    </span>
                                )}
                                <span className="relative z-10">{tab.label}</span>
                                {tab.badge !== undefined && tab.badge !== 0 && tab.badge !== '0' && (
                                    <span
                                        className={`relative z-10 px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums leading-none ${
                                            isActive && tone === 'default'
                                                ? 'bg-[var(--accent-glow)] text-[var(--accent)]'
                                                : BADGE_TONES[tone]
                                        }`}
                                    >
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {showFloatingBottom && tabs.length > 1 && (
                <div
                    className={`fixed bottom-3.5 left-1/2 -translate-x-1/2 z-[75] pointer-events-auto max-w-[94vw] ${
                        floatingOnAllScreens ? '' : 'lg:hidden'
                    }`}
                    role="navigation"
                    aria-label="Navigasi Sub-Menu Cepat"
                >
                    <motion.div
                        layout
                        transition={MOTION_SPRING.subtle}
                        className="floating-bottom-pill bg-[var(--bg-card)]/95 backdrop-blur-md border border-[var(--border-subtle)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] rounded-full p-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar"
                    >
                        {tabs.map(tab => {
                            const isActive = tab.id === activeTab;
                            const shortText = tab.shortLabel || tab.label.split(' ')[0];
                            return (
                                <motion.button
                                    key={tab.id}
                                    layout
                                    type="button"
                                    onClick={() => onChange(tab.id)}
                                    title={tab.label}
                                    className={`relative flex items-center justify-center rounded-full transition-colors cursor-pointer select-none shrink-0 ${
                                        isActive
                                            ? 'bg-[var(--accent)] text-white px-3 py-1.5 gap-1.5 font-semibold text-[11px] shadow-2xs'
                                            : 'w-8 h-8 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--accent)]'
                                    }`}
                                    style={{ touchAction: 'manipulation' }}
                                >
                                    {tab.icon && (
                                        <span className="flex items-center justify-center shrink-0">
                                            {tab.icon}
                                        </span>
                                    )}
                                    {isActive && (
                                        <span className="whitespace-nowrap tracking-tight">
                                            {shortText}
                                        </span>
                                    )}
                                </motion.button>
                            );
                        })}
                    </motion.div>
                </div>
            )}
        </>
    );
};
