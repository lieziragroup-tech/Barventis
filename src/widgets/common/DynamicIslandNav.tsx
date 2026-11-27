import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { useVirtualKeyboard } from '@/shared/hooks/useVirtualKeyboard';

export interface NavItem {
    id: string;
    label: string;
    shortLabel?: string;
    icon: React.ElementType | React.ReactNode;
}

export interface DynamicIslandNavProps {
    items: NavItem[];
    activeTab: string;
    onTabChange: (id: string) => void;
}

function renderNavIcon(icon: React.ElementType | React.ReactNode, size = 14) {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function' || (typeof icon === 'object' && icon !== null)) {
        const IconComp = icon as React.ElementType;
        return <IconComp size={size} />;
    }
    return null;
}

/**
 * Dynamic Floating Bottom Pill bergaya Barventis (Compact Edition):
 * - Tampil melayang di tengah bawah layar (`fixed bottom-3.5 left-1/2 -translate-x-1/2`).
 * - Item yang sedang aktif tampil sebagai kapsul hijau solid (`bg-[var(--accent)] text-white`)
 *   lengkap dengan Ikon + Label Singkat (contoh: `[📋 Semua]`).
 */
export function DynamicIslandNav({ items, activeTab, onTabChange }: DynamicIslandNavProps) {
    const isKeyboardOpen = useVirtualKeyboard();

    if (!items || items.length === 0 || isKeyboardOpen) return null;

    return (
        <div
            className="fixed bottom-3.5 left-1/2 -translate-x-1/2 z-[70] pointer-events-auto max-w-[94vw]"
            role="navigation"
            aria-label="Navigasi Cepat Bawah"
        >
            <motion.div
                layout
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="bg-white/95 backdrop-blur-md border border-[#e8e5e0] shadow-[0_8px_24px_rgba(45,42,38,0.12)] rounded-full p-1 flex items-center gap-0.5 overflow-x-auto no-scrollbar"
            >
                {items.map(item => {
                    const isActive = activeTab === item.id;
                    const shortText = item.shortLabel || item.label.split(' ')[0];
                    return (
                        <motion.button
                            key={item.id}
                            layout
                            type="button"
                            onClick={() => onTabChange(item.id)}
                            title={item.label}
                            className={cn(
                                'relative flex items-center justify-center rounded-full transition-colors cursor-pointer select-none shrink-0',
                                isActive
                                    ? 'bg-[var(--accent)] text-white px-3 py-1.5 gap-1.5 font-semibold text-[11px] shadow-2xs'
                                    : 'w-8 h-8 text-[#5a554f] hover:bg-[#f5f3ef] hover:text-[var(--accent)]'
                            )}
                            style={{ touchAction: 'manipulation' }}
                        >
                            <span className="flex items-center justify-center shrink-0">
                                {renderNavIcon(item.icon, 14)}
                            </span>
                            {isActive && (
                                <motion.span
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    className="whitespace-nowrap tracking-tight"
                                >
                                    {shortText}
                                </motion.span>
                            )}
                        </motion.button>
                    );
                })}
            </motion.div>
        </div>
    );
}