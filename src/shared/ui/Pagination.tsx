import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

type PaginationProps = {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    itemLabel?: string;
    className?: string;
};

/** Small responsive pagination footer shared by data-heavy list pages. */
export function Pagination({
    page,
    pageSize,
    totalItems,
    onPageChange,
    itemLabel = "data",
    className = "",
}: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const end = Math.min(safePage * pageSize, totalItems);

    const buttonClass = "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-white px-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30";
    const goTo = (nextPage: number) => onPageChange(Math.min(Math.max(nextPage, 1), totalPages));

    return (
        <div className={`flex flex-col gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${className}`}>
            <p className="text-center text-xs text-[var(--text-secondary)] sm:text-left">
                Menampilkan <span className="font-semibold tabular-nums">{start}–{end}</span> dari{" "}
                <span className="font-semibold tabular-nums">{totalItems}</span> {itemLabel}
            </p>
            {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-1" aria-label={`Navigasi halaman ${itemLabel}`}>
                    <button type="button" className={`${buttonClass} hidden sm:inline-flex`} onClick={() => goTo(1)} disabled={safePage === 1} aria-label="Halaman pertama" title="Halaman pertama">
                        <ChevronsLeft size={14} />
                    </button>
                    <button type="button" className={buttonClass} onClick={() => goTo(safePage - 1)} disabled={safePage === 1} aria-label="Halaman sebelumnya" title="Halaman sebelumnya">
                        <ChevronLeft size={14} /> <span className="sm:hidden">Sebelumnya</span>
                    </button>
                    <span className="px-2 text-xs font-semibold tabular-nums text-[var(--text-primary)]" aria-live="polite">
                        {safePage} / {totalPages}
                    </span>
                    <button type="button" className={buttonClass} onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages} aria-label="Halaman berikutnya" title="Halaman berikutnya">
                        <span className="sm:hidden">Berikutnya</span> <ChevronRight size={14} />
                    </button>
                    <button type="button" className={`${buttonClass} hidden sm:inline-flex`} onClick={() => goTo(totalPages)} disabled={safePage === totalPages} aria-label="Halaman terakhir" title="Halaman terakhir">
                        <ChevronsRight size={14} />
                    </button>
                </nav>
            )}
        </div>
    );
}
