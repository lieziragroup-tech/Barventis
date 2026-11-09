import React from 'react';

/**
 * Wraps React.lazy() with automatic one-time cache purge & page reload
 * when a dynamic ES module chunk fails to load after a new deployment
 * (e.g., old hash requested -> 404 or MIME text/html mismatch).
 */
export function lazyWithRetry(importer, chunkKey = 'chunk') {
  return React.lazy(async () => {
    const storageKey = `barventis_lazy_retry_${chunkKey}`;
    try {
      const mod = await importer();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(storageKey);
      }
      return mod;
    } catch (error) {
      if (typeof window !== 'undefined') {
        const hasRetried = sessionStorage.getItem(storageKey) === '1';
        if (!hasRetried) {
          sessionStorage.setItem(storageKey, '1');
          try {
            if ('caches' in window) {
              const keys = await window.caches.keys();
              await Promise.all(keys.map((k) => window.caches.delete(k)));
            }
          } catch (_) {
            // Ignore cache deletion errors
          }
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw error;
    }
  });
}

export default lazyWithRetry;
