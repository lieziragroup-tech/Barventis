import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Reusable classic pagination bar (Prev/Next + page numbers).
 * Responsive: shows full page-number list + "Showing X-Y of Z" on desktop,
 * collapses to compact "‹ Hal 2/8 ›" on mobile so it never crowds the UI.
 *
 * Props:
 *  - page: current page (1-indexed)
 *  - pageSize: rows per page
 *  - totalCount: total rows available on the server
 *  - onPageChange(nextPage): callback
 *  - itemLabel: e.g. "material", "transaksi" (for the info text)
 *  - loading: optional, disables controls while a page is being fetched
 */
export default function Pagination({ page, pageSize, totalCount, onPageChange, itemLabel = 'data', loading = false }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  if (totalCount === 0) return null;

  const from = (clampedPage - 1) * pageSize + 1;
  const to = Math.min(clampedPage * pageSize, totalCount);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    let start = Math.max(2, clampedPage - 1);
    let end = Math.min(totalPages - 1, clampedPage + 1);
    if (clampedPage <= 3) end = 4;
    if (clampedPage >= totalPages - 2) start = totalPages - 3;
    if (start > 2) pages.push('ellipsis-start');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis-end');
    pages.push(totalPages);
    return pages;
  };

  const goTo = (p) => {
    if (p < 1 || p > totalPages || p === clampedPage || loading) return;
    onPageChange(p);
  };

  return (
    <div className="pagination-bar">
      <span className="pagination-info">
        Menampilkan {from}-{to} dari {totalCount} {itemLabel}
      </span>

      <div className="pagination-controls">
        <button type="button" className="pagination-btn" onClick={() => goTo(1)} disabled={clampedPage === 1 || loading} aria-label="Halaman pertama">
          <ChevronsLeft size={15} />
        </button>
        <button type="button" className="pagination-btn" onClick={() => goTo(clampedPage - 1)} disabled={clampedPage === 1 || loading} aria-label="Sebelumnya">
          <ChevronLeft size={15} />
        </button>

        <span className="pagination-page-numbers">
          {getPageNumbers().map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="pagination-ellipsis">…</span>
            ) : (
              <button
                type="button"
                key={p}
                className={`pagination-btn pagination-page-btn${p === clampedPage ? ' active' : ''}`}
                onClick={() => goTo(p)}
                disabled={loading}
              >
                {p}
              </button>
            )
          )}
        </span>

        <span className="pagination-mobile-label">Hal {clampedPage}/{totalPages}</span>

        <button type="button" className="pagination-btn" onClick={() => goTo(clampedPage + 1)} disabled={clampedPage === totalPages || loading} aria-label="Selanjutnya">
          <ChevronRight size={15} />
        </button>
        <button type="button" className="pagination-btn" onClick={() => goTo(totalPages)} disabled={clampedPage === totalPages || loading} aria-label="Halaman terakhir">
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}
