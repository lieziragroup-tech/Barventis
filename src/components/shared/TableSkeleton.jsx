import { Loader2 } from 'lucide-react';

/**
 * Skeleton rows for tabular layouts.
 * Can be placed directly inside <tbody> of any .custom-table or standard table.
 */
export function TableSkeletonRows({ rows = 5, columns = 6 }) {
  // Pre-configured random-looking natural widths for skeleton lines
  const lineWidths = ['75%', '50%', '85%', '65%', '90%', '40%', '80%', '60%'];

  const colsArray = Array.isArray(columns)
    ? columns
    : Array.from({ length: Number(columns) || 6 }, (_, idx) => ({
        type: idx === 0 ? 'checkbox-or-text' : idx === (Number(columns) || 6) - 1 ? 'action' : 'text',
        align: idx > 2 && idx < (Number(columns) || 6) - 1 ? 'right' : 'left'
      }));

  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={`skeleton-row-${rIdx}`} className="table-skeleton-row">
          {colsArray.map((col, cIdx) => {
            const widthPct = lineWidths[(rIdx * 3 + cIdx) % lineWidths.length];

            // Render based on column type
            if (col.type === 'checkbox') {
              return (
                <td key={`sc-${cIdx}`} style={{ width: col.width || '40px', textAlign: 'center' }}>
                  <div className="skeleton-shimmer skeleton-box" style={{ margin: '0 auto' }} />
                </td>
              );
            }

            if (col.type === 'badge') {
              return (
                <td key={`sc-${cIdx}`} style={{ width: col.width, textAlign: col.align || 'center' }}>
                  <div className="skeleton-shimmer skeleton-badge" style={{ margin: col.align === 'center' ? '0 auto' : undefined }} />
                </td>
              );
            }

            if (col.type === 'action' || col.type === 'actions') {
              return (
                <td key={`sc-${cIdx}`} style={{ width: col.width || '80px', textAlign: 'center' }}>
                  <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'center' }}>
                    <div className="skeleton-shimmer skeleton-btn" />
                    <div className="skeleton-shimmer skeleton-btn" />
                  </div>
                </td>
              );
            }

            if (col.type === 'dual-text') {
              return (
                <td key={`sc-${cIdx}`} style={{ width: col.width, textAlign: col.align || 'left' }}>
                  <div className="skeleton-shimmer skeleton-line" style={{ width: '80%', marginBottom: '6px' }} />
                  <div className="skeleton-shimmer skeleton-line-sm" style={{ width: '50%' }} />
                </td>
              );
            }

            // Default text cell
            return (
              <td key={`sc-${cIdx}`} style={{ width: col.width, textAlign: col.align || 'left' }}>
                <div
                  className="skeleton-shimmer skeleton-line"
                  style={{
                    width: col.widthPct || widthPct,
                    marginLeft: col.align === 'right' ? 'auto' : col.align === 'center' ? 'auto' : 0,
                    marginRight: col.align === 'center' ? 'auto' : 0
                  }}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/**
 * Subtle loading progress bar & overlay for tables.
 * Ideal for indicating background re-fetch, search/filter sync, or bulk updates.
 */
export function TableLoadingOverlay({
  loading = false,
  message = 'Sinkronisasi data...',
  showProgressBar = true,
  showBadge = true,
  blur = true
}) {
  if (!loading) return null;

  return (
    <>
      {showProgressBar && (
        <div className="table-progress-bar-container" aria-hidden="true">
          <div className="table-progress-bar-active" />
          <div className="table-progress-bar-active-secondary" />
        </div>
      )}

      {blur && (
        <div className="table-loading-overlay" aria-live="polite">
          {showBadge && (
            <div className="table-loading-badge">
              <Loader2 size={15} className="spin text-[var(--accent)]" />
              <span>{message}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Wrapper for table containers that automatically handles position relative
 * and attaches progress bar & overlay.
 */
export function TableContainer({
  loading = false,
  loadingMessage = 'Memperbarui data...',
  children,
  className = '',
  style = {}
}) {
  return (
    <div
      className={`table-container relative ${className}`}
      style={{ minHeight: loading ? '160px' : undefined, ...style }}
    >
      <TableLoadingOverlay loading={loading} message={loadingMessage} showBadge={true} />
      {children}
    </div>
  );
}

export default TableSkeletonRows;
