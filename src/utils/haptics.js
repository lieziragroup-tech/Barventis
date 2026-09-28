/**
 * Subtle Haptic Feedback Simulation Utility
 * Supports native device vibration (Android/Chrome) and synthetic tactile
 * audio micro-pulses (iOS Safari / desktop browsers) to guarantee a satisfying tactile feel.
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a synthetic micro-click to simulate haptic sensation on devices without vibration motor (like iOS Safari)
 */
function playTactileMicroPulse(frequency = 160, duration = 0.015, gainVal = 0.05) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + duration);

    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

/**
 * Trigger subtle haptic feedback
 * @param {'light'|'medium'|'heavy'|'success'|'warning'|'error'} type
 */
export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined') return;

  const hasVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  switch (type) {
    case 'light':
      if (hasVibrate) {
        try { navigator.vibrate(10); } catch { /* ignore */ }
      }
      playTactileMicroPulse(180, 0.012, 0.04);
      break;

    case 'medium':
      if (hasVibrate) {
        try { navigator.vibrate(25); } catch { /* ignore */ }
      }
      playTactileMicroPulse(150, 0.02, 0.06);
      break;

    case 'heavy':
      if (hasVibrate) {
        try { navigator.vibrate([35, 20, 20]); } catch { /* ignore */ }
      }
      playTactileMicroPulse(110, 0.035, 0.08);
      break;

    case 'success':
      if (hasVibrate) {
        try { navigator.vibrate([15, 40, 25]); } catch { /* ignore */ }
      }
      playTactileMicroPulse(220, 0.015, 0.05);
      setTimeout(() => playTactileMicroPulse(280, 0.02, 0.05), 45);
      break;

    case 'warning':
    case 'error':
      if (hasVibrate) {
        try { navigator.vibrate([30, 40, 30]); } catch { /* ignore */ }
      }
      playTactileMicroPulse(90, 0.03, 0.08);
      setTimeout(() => playTactileMicroPulse(70, 0.03, 0.08), 50);
      break;

    default:
      if (hasVibrate) {
        try { navigator.vibrate(15); } catch { /* ignore */ }
      }
      playTactileMicroPulse(160, 0.015, 0.05);
  }
}

/**
 * Apply a subtle physical bounce/pulse animation to an HTML element
 */
export function pulseElement(element) {
  if (!element) return;
  element.style.transition = 'transform 0.12s cubic-bezier(0.2, 0, 0.2, 1)';
  element.style.transform = 'scale(0.97)';
  setTimeout(() => {
    if (element) element.style.transform = '';
  }, 120);
}
