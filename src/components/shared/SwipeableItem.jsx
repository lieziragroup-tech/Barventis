import { useState, useRef, useEffect } from 'react';
import { Trash2, Archive } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

/**
 * SwipeableItem - Mobile swipe gesture container for inventory items
 * Swipe Left  -> Delete action (Red)
 * Swipe Right -> Archive action (Amber)
 * Provides subtle haptic feedback simulation when threshold is passed or action is executed.
 */
export default function SwipeableItem({
  children,
  onDelete,
  onArchive,
  deleteLabel = 'Hapus',
  archiveLabel = 'Arsip',
  itemName = 'Item',
  disabled = false,
  className = '',
  style = {}
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [actionTriggered, setActionTriggered] = useState(null); // 'delete' | 'archive' | null

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isHorizontalSwipe = useRef(null);
  const hasTriggeredThresholdHaptic = useRef(false);
  const containerRef = useRef(null);

  const THRESHOLD = 80;
  const MAX_SWIPE = 120;

  // Reset offset if disabled or window resized
  useEffect(() => {
    if (disabled) setOffsetX(0);
  }, [disabled]);

  const handleTouchStart = (e) => {
    if (disabled) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isHorizontalSwipe.current = null;
    hasTriggeredThresholdHaptic.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (disabled || !isSwiping) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;

    // Detect gesture direction if not determined yet
    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    // Only handle horizontal swipe; let vertical scrolling work natively
    if (isHorizontalSwipe.current !== true) return;

    // Dampen drag past max limit
    let computedOffset = deltaX;
    if (computedOffset > MAX_SWIPE) {
      computedOffset = MAX_SWIPE + (computedOffset - MAX_SWIPE) * 0.25;
    } else if (computedOffset < -MAX_SWIPE) {
      computedOffset = -MAX_SWIPE + (computedOffset + MAX_SWIPE) * 0.25;
    }

    // If onArchive is not provided, disallow swipe right
    if (!onArchive && computedOffset > 0) {
      computedOffset = 0;
    }
    // If onDelete is not provided, disallow swipe left
    if (!onDelete && computedOffset < 0) {
      computedOffset = 0;
    }

    setOffsetX(computedOffset);

    // Subtle haptic tick when crossing activation threshold
    const crossedThreshold = Math.abs(computedOffset) >= THRESHOLD;
    if (crossedThreshold && !hasTriggeredThresholdHaptic.current) {
      triggerHaptic('light');
      hasTriggeredThresholdHaptic.current = true;
    } else if (!crossedThreshold && hasTriggeredThresholdHaptic.current) {
      hasTriggeredThresholdHaptic.current = false;
    }
  };

  const handleTouchEnd = () => {
    if (disabled || !isSwiping) return;
    setIsSwiping(false);

    if (isHorizontalSwipe.current !== true) {
      setOffsetX(0);
      return;
    }

    // Swiped left beyond threshold -> Trigger Delete
    if (offsetX <= -THRESHOLD && onDelete) {
      triggerHaptic('medium');
      setActionTriggered('delete');
      // Snap to full action button width for a moment or execute
      setOffsetX(-MAX_SWIPE);
    } 
    // Swiped right beyond threshold -> Trigger Archive
    else if (offsetX >= THRESHOLD && onArchive) {
      triggerHaptic('medium');
      setActionTriggered('archive');
      setOffsetX(MAX_SWIPE);
    } 
    // Otherwise smoothly spring back
    else {
      setOffsetX(0);
      setActionTriggered(null);
    }
  };

  const handleTouchCancel = () => {
    setIsSwiping(false);
    setOffsetX(0);
    setActionTriggered(null);
  };

  const confirmAction = (actionType) => {
    triggerHaptic('heavy');
    setOffsetX(0);
    setActionTriggered(null);
    if (actionType === 'delete' && onDelete) {
      onDelete();
    } else if (actionType === 'archive' && onArchive) {
      onArchive();
    }
  };

  const cancelSwipe = (e) => {
    if (e) e.stopPropagation();
    triggerHaptic('light');
    setOffsetX(0);
    setActionTriggered(null);
  };

  const isLeftRevealed = offsetX > 10;
  const isRightRevealed = offsetX < -10;
  const isPastArchiveThreshold = offsetX >= THRESHOLD;
  const isPastDeleteThreshold = offsetX <= -THRESHOLD;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden select-none rounded-xl ${className}`}
      style={{ touchAction: 'pan-y', ...style }}
    >
      {/* Background Action Layers */}
      <div className="absolute inset-0 flex items-stretch pointer-events-none z-0">
        {/* Left Side: Archive Action (Revealed on Swipe Right) */}
        {onArchive && (
          <div
            className={`flex items-center pl-4 pr-3 text-white transition-colors duration-200 pointer-events-auto ${
              isPastArchiveThreshold ? 'bg-amber-600' : 'bg-amber-500/90'
            }`}
            style={{
              width: `${Math.max(0, offsetX)}px`,
              opacity: isLeftRevealed ? 1 : 0,
              overflow: 'hidden'
            }}
            onClick={() => confirmAction('archive')}
            title={`Arsipkan ${itemName}`}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap font-bold text-xs">
              <Archive size={16} className={isPastArchiveThreshold ? 'scale-110' : ''} />
              <span className="text-[11px] uppercase tracking-wider">{archiveLabel}</span>
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right Side: Delete Action (Revealed on Swipe Left) */}
        {onDelete && (
          <div
            className={`flex items-center justify-end pr-4 pl-3 text-white transition-colors duration-200 pointer-events-auto ${
              isPastDeleteThreshold ? 'bg-red-700' : 'bg-red-600'
            }`}
            style={{
              width: `${Math.max(0, -offsetX)}px`,
              opacity: isRightRevealed ? 1 : 0,
              overflow: 'hidden'
            }}
            onClick={() => confirmAction('delete')}
            title={`Hapus ${itemName}`}
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap font-bold text-xs">
              <Trash2 size={16} className={isPastDeleteThreshold ? 'scale-110' : ''} />
              <span className="text-[11px] uppercase tracking-wider">{deleteLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* Foreground Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)',
          willChange: 'transform',
          position: 'relative',
          zIndex: 1
        }}
      >
        {children}

        {/* If an action is snapped open, show a subtle tap-to-confirm overlay */}
        {actionTriggered && (
          <div 
            className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-xs flex items-center justify-between px-3 z-10 animate-in fade-in duration-150"
            onClick={cancelSwipe}
          >
            {actionTriggered === 'archive' && (
              <button
                type="button"
                className="btn btn-warning text-xs font-bold py-1.5 px-3 flex items-center gap-1.5 shadow-md ml-1"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmAction('archive');
                }}
              >
                <Archive size={13} />
                <span>Konfirmasi Arsip</span>
              </button>
            )}

            {actionTriggered === 'delete' && (
              <button
                type="button"
                className="btn btn-danger text-xs font-bold py-1.5 px-3 flex items-center gap-1.5 shadow-md ml-auto mr-1"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmAction('delete');
                }}
              >
                <Trash2 size={13} />
                <span>Konfirmasi Hapus</span>
              </button>
            )}

            <button
              type="button"
              className="text-[11px] bg-[var(--bg-card)]/90 text-[var(--text-secondary)] px-2 py-1 rounded-md border border-[var(--border)] shadow-xs hover:text-[var(--text-primary)]"
              onClick={cancelSwipe}
            >
              Batal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
