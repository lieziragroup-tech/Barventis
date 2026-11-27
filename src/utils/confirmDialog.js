/**
 * Global promise-based confirmation dialog dispatcher for Barventis v5.4.
 * Replaces native browser window.confirm() with a clean, minimalist, mobile-friendly modal.
 */

const CONFIRM_EVENT = 'barventis:confirm_dialog_request';

export function confirmAction(messageOrOptions) {
  const opts = typeof messageOrOptions === 'string'
    ? { message: messageOrOptions }
    : (messageOrOptions || {});

  if (typeof window === 'undefined') {
    return Promise.resolve(true);
  }
  if (!window.__bvConfirmHostMounted) {
    return Promise.resolve(window.confirm(opts.message || 'Apakah kamu yakin ingin melanjutkan tindakan ini?'));
  }

  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, {
      detail: {
        title: opts.title || 'Konfirmasi Tindakan',
        message: opts.message || 'Apakah kamu yakin ingin melanjutkan tindakan ini?',
        confirmLabel: opts.confirmLabel || 'Lanjutkan',
        cancelLabel: opts.cancelLabel || 'Batal',
        tone: opts.tone || 'warning',
        resolve,
      },
    }));
  });
}

export { CONFIRM_EVENT };
