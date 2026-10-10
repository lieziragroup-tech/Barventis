import React, { useState, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';

const SwipeableItem = ({ children, onDelete, threshold = -80 }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);
  const isMobile = window.innerWidth < 768;

  const handleTouchStart = (e) => {
    if (!isMobile) return;
    startX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwiping || !isMobile) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    
    // Only allow swipe left
    if (diff < 0) {
      setOffset(Math.max(diff, threshold * 1.5)); // Cap the visual swipe
      // Trigger haptic when crossing threshold
      if (diff <= threshold && offset > threshold) {
        triggerHaptic('warning');
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping || !isMobile) return;
    setIsSwiping(false);
    
    if (offset <= threshold) {
      triggerHaptic('heavy');
      onDelete();
      // Reset immediately after delete fires to avoid weird state if re-rendered
      setOffset(0); 
    } else {
      setOffset(0); // Snap back
    }
  };

  return (
    <div className="relative overflow-hidden w-full bg-red-500">
      {/* Background Delete Action */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end px-6 text-white bg-red-500 w-full" style={{ zIndex: 0 }}>
        <Trash2 size={20} />
      </div>

      {/* Foreground Content */}
      <div 
        className="relative bg-white w-full h-full transition-transform duration-200 ease-out"
        style={{ 
          transform: \`translateX(\${offset}px)\`,
          touchAction: 'pan-y', // Allow vertical scrolling, intercept horizontal
          zIndex: 1
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeableItem;
