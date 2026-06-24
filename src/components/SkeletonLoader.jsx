
// Single shimmer animation via CSS keyframes injected once
const shimmerStyle = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;
let shimmerInjected = false;
function injectShimmer() {
  if (shimmerInjected) return;
  const style = document.createElement('style');
  style.textContent = shimmerStyle;
  document.head.appendChild(style);
  shimmerInjected = true;
}

export function SkeletonBox({ width = '100%', height = '14px', borderRadius = '6px', style = {} }) {
  injectShimmer();
  return (
    <div style={{
      width, height, borderRadius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.6s infinite',
      ...style
    }} />
  );
}

export function SkeletonTableRows({ rows = 5, cols = 6 }) {
  injectShimmer();
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={rowIdx} style={{ borderBottom: '1px solid var(--border)' }}>
          {Array.from({ length: cols }).map((_, colIdx) => (
            <td key={colIdx} style={{ padding: '14px 16px' }}>
              <SkeletonBox height="13px" width={colIdx === 0 ? '75%' : colIdx === cols - 1 ? '50%' : '65%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCard({ height = '80px' }) {
  injectShimmer();
  return (
    <div className="glass-card kpi-card" style={{ padding: '20px' }}>
      <SkeletonBox height="12px" width="50%" style={{ marginBottom: '16px' }} />
      <SkeletonBox height={height} width="70%" style={{ marginBottom: '10px' }} />
      <SkeletonBox height="10px" width="40%" />
    </div>
  );
}

export function SkeletonKpiGrid({ count = 4 }) {
  return (
    <div className="kpi-grid" style={{ marginBottom: '24px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
