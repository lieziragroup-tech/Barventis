import React from 'react';

export interface PageHeaderProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    badge?: React.ReactNode;
    actions?: React.ReactNode;
}

/**
 * Komponen PageHeader bergaya RedesignFieldworkGuciMasLite:
 * Menampilkan judul halaman tegas (22px-26px, tracking -0.03em), deskripsi di bawahnya, dan tombol aksi di kanan.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    badge,
    actions,
}) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 mb-2 border-b border-[var(--border-subtle)]">
            <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-xl sm:text-[26px] font-bold text-[var(--text-primary)] tracking-[-0.03em] leading-[1.2] m-0">
                        {title}
                    </h1>
                    {badge}
                </div>
                {subtitle && (
                    <p className="text-xs sm:text-[13.5px] text-[var(--text-secondary)] mt-1.5 leading-normal m-0">
                        {subtitle}
                    </p>
                )}
            </div>
            {actions && (
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {actions}
                </div>
            )}
        </div>
    );
};
