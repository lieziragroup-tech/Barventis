/**
 * Yields control back to the browser main thread during heavy loops
 * (e.g. BulkImport parsing) to keep Interaction to Next Paint (INP) responsive.
 * Uses native scheduler.yield() when available with a setTimeout(0) fallback.
 */
export function yieldToMain() {
  if (typeof globalThis !== 'undefined' && globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') {
    return globalThis.scheduler.yield();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
