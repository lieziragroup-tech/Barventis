/**
 * Utility for Haptic Feedback
 */
export const triggerHaptic = (type = 'success') => {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  
  try {
    switch (type) {
      case 'success':
        navigator.vibrate(50); // Single short tap
        break;
      case 'warning':
        navigator.vibrate([30, 50, 30]); // Double short tap
        break;
      case 'error':
        navigator.vibrate([100, 50, 100]); // Heavy double tap
        break;
      case 'heavy':
        navigator.vibrate(100); // Heavy single tap
        break;
      default:
        navigator.vibrate(50);
    }
  } catch (e) {
    // Ignore if not supported/blocked
  }
};
