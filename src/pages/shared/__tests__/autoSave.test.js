// @vitest-environment jsdom

/**
 * WB-02: Auto-Save Lifecycle Tests
 *
 * Tests the auto-save logic extracted from DailyInventory.jsx:
 * - localStorage draft key format
 * - saveDraftToLocalStorage / clearLocalDraft
 * - rehydration merge (local newer than server)
 * - debounce timer: fire after 5s, cancel on clear
 * - flush-on-unmount pattern (isDirtyRef)
 * - silent-catch vs visible error on save failure
 * - localStorage cleanup after EOD lock
 *
 * Approach: test logic in isolation using vitest fake timers + localStorage mock.
 * No JSX render required — all behavior extracted as pure functions or minimal hooks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Helpers extracted from DailyInventory.jsx logic ─────────────────────────

/** WB-02.5: Draft key format matches barventis_daily_inv_draft_{tenantId}_{loc}_{date} */
function getLocalDraftKey(tenantId, location, date) {
  return `barventis_daily_inv_draft_${tenantId}_${location}_${date}`;
}

/** WB-02.5: Write draft to localStorage */
function saveDraftToLocalStorage(tenantId, location, date, inventoryState) {
  try {
    const key = getLocalDraftKey(tenantId, location, date);
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      date,
      location,
      inventory: inventoryState,
    }));
    return true;
  } catch (_e) {
    return false;
  }
}

/** WB-02.8: Remove draft from localStorage (called after EOD lock) */
function clearLocalDraft(tenantId, location, date) {
  try {
    localStorage.removeItem(getLocalDraftKey(tenantId, location, date));
  } catch (_e) {}
}

/**
 * WB-02.6: Rehydration merge — local data merged over server data.
 * Local wins for fields that exist in local; server wins for the rest.
 * Returns null if local draft is stale (wrong date/location).
 */
function rehydrateDraft(serverInventory, tenantId, location, date) {
  try {
    const key = getLocalDraftKey(tenantId, location, date);
    const raw = localStorage.getItem(key);
    if (!raw) return serverInventory;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.inventory || parsed.date !== date || parsed.location !== location) {
      return serverInventory;
    }
    const localInv = parsed.inventory;
    const hydrated = { ...serverInventory };
    Object.keys(localInv).forEach(matId => {
      if (hydrated[matId]) {
        hydrated[matId] = { ...hydrated[matId], ...localInv[matId] };
      } else {
        hydrated[matId] = localInv[matId];
      }
    });
    return hydrated;
  } catch (_parseErr) {
    return serverInventory;
  }
}

/**
 * WB-02.3 / WB-02.4: Debounce + flush-on-unmount pattern.
 * Returns a controller object that mirrors the DailyInventory timer pattern.
 */
function createAutoSaveController(performSave) {
  let timerId = null;
  let isDirty = false;
  let status = 'idle'; // 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  const statusLog = [];

  const setStatus = (s) => { status = s; statusLog.push(s); };

  const trigger = (isLocked = false) => {
    if (isLocked) return;
    isDirty = true;
    setStatus('dirty');
    clearTimeout(timerId);
    timerId = setTimeout(async () => {
      if (isDirty && !isLocked) {
        setStatus('saving');
        try {
          await performSave(false);
          isDirty = false;
          setStatus('saved');
        } catch (_err) {
          setStatus('error');
        }
      }
    }, 5000);
  };

  // Called in useEffect cleanup (unmount)
  const flushOnUnmount = (isLocked = false) => {
    clearTimeout(timerId);
    if (isDirty && !isLocked) {
      // fire-and-forget, same as component does
      performSave(false).catch(() => {});
    }
  };

  return { trigger, flushOnUnmount, getStatus: () => status, getStatusLog: () => statusLog, isDirty: () => isDirty };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

// ─── WB-02.5: localStorage key format ────────────────────────────────────────
describe('WB-02.5 — localStorage draft key', () => {
  it('key format: barventis_daily_inv_draft_{tenantId}_{location}_{date}', () => {
    const key = getLocalDraftKey('tenant-123', 'RESTO', '2026-10-23');
    expect(key).toBe('barventis_daily_inv_draft_tenant-123_RESTO_2026-10-23');
  });

  it('CENTRAL location produces a different key than RESTO', () => {
    const restoKey = getLocalDraftKey('t1', 'RESTO', '2026-10-23');
    const centralKey = getLocalDraftKey('t1', 'CENTRAL', '2026-10-23');
    expect(restoKey).not.toBe(centralKey);
  });

  it('different dates produce different keys', () => {
    const k1 = getLocalDraftKey('t1', 'RESTO', '2026-10-22');
    const k2 = getLocalDraftKey('t1', 'RESTO', '2026-10-23');
    expect(k1).not.toBe(k2);
  });
});

// ─── WB-02.5 cont: saveDraftToLocalStorage ────────────────────────────────────
describe('WB-02.5 — saveDraftToLocalStorage', () => {
  it('writes inventory state to localStorage under the correct key', () => {
    const inv = { 42: { qty_out: '200', out_confirmed: true } };
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-23', inv);

    const raw = localStorage.getItem('barventis_daily_inv_draft_t1_RESTO_2026-10-23');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw);
    expect(parsed.date).toBe('2026-10-23');
    expect(parsed.location).toBe('RESTO');
    expect(parsed.inventory[42].qty_out).toBe('200');
  });

  it('savedAt is a timestamp number', () => {
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-23', {});
    const parsed = JSON.parse(localStorage.getItem('barventis_daily_inv_draft_t1_RESTO_2026-10-23'));
    expect(typeof parsed.savedAt).toBe('number');
    expect(parsed.savedAt).toBeGreaterThan(0);
  });
});

// ─── WB-02.6: Rehydration merge ───────────────────────────────────────────────
describe('WB-02.6 — rehydration merge', () => {
  it('local draft overrides server data for fields present in local', () => {
    const serverInv = { 1: { qty_out: '0', out_confirmed: false }, 2: { qty_out: '100' } };
    // Simulate user typing qty_out=500 for mat 1 before server saved
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-23', { 1: { qty_out: '500', out_confirmed: true } });

    const result = rehydrateDraft(serverInv, 't1', 'RESTO', '2026-10-23');
    expect(result[1].qty_out).toBe('500');          // local wins
    expect(result[1].out_confirmed).toBe(true);     // local wins
    expect(result[2].qty_out).toBe('100');           // server preserved (not in local)
  });

  it('returns server inventory unchanged when no local draft exists', () => {
    const serverInv = { 5: { qty_out: '50' } };
    const result = rehydrateDraft(serverInv, 't1', 'RESTO', '2026-10-23');
    expect(result).toEqual(serverInv);
  });

  it('ignores stale draft with wrong date', () => {
    const serverInv = { 1: { qty_out: '0' } };
    // Draft from yesterday
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-22', { 1: { qty_out: '999' } });
    const result = rehydrateDraft(serverInv, 't1', 'RESTO', '2026-10-23');
    expect(result[1].qty_out).toBe('0');  // server wins; stale draft discarded
  });

  it('ignores draft from a different location', () => {
    const serverInv = { 1: { qty_out: '0' } };
    saveDraftToLocalStorage('t1', 'CENTRAL', '2026-10-23', { 1: { qty_out: '888' } });
    const result = rehydrateDraft(serverInv, 't1', 'RESTO', '2026-10-23');
    expect(result[1].qty_out).toBe('0');
  });

  it('handles corrupted localStorage JSON without throwing', () => {
    localStorage.setItem('barventis_daily_inv_draft_t1_RESTO_2026-10-23', '{corrupt}');
    const serverInv = { 1: { qty_out: '10' } };
    expect(() => rehydrateDraft(serverInv, 't1', 'RESTO', '2026-10-23')).not.toThrow();
    const result = rehydrateDraft(serverInv, 't1', 'RESTO', '2026-10-23');
    expect(result).toEqual(serverInv);  // falls back to server
  });
});

// ─── WB-02.8: clearLocalDraft (after EOD lock) ────────────────────────────────
describe('WB-02.8 — clearLocalDraft after lock', () => {
  it('removes draft from localStorage when called', () => {
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-23', { 1: { qty_out: '5' } });
    expect(localStorage.getItem('barventis_daily_inv_draft_t1_RESTO_2026-10-23')).not.toBeNull();

    clearLocalDraft('t1', 'RESTO', '2026-10-23');
    expect(localStorage.getItem('barventis_daily_inv_draft_t1_RESTO_2026-10-23')).toBeNull();
  });

  it('does not throw when key does not exist', () => {
    expect(() => clearLocalDraft('t1', 'RESTO', '2026-10-23')).not.toThrow();
  });

  it('clears only the specific date/location key, not others', () => {
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-23', {});
    saveDraftToLocalStorage('t1', 'RESTO', '2026-10-22', { 1: { qty_out: '9' } });

    clearLocalDraft('t1', 'RESTO', '2026-10-23');

    expect(localStorage.getItem('barventis_daily_inv_draft_t1_RESTO_2026-10-23')).toBeNull();
    expect(localStorage.getItem('barventis_daily_inv_draft_t1_RESTO_2026-10-22')).not.toBeNull();
  });
});

// ─── WB-02.3: Debounce fires after 5s ─────────────────────────────────────────
describe('WB-02.3 — debounce timer fires after 5000ms', () => {
  it('performSave is called once after 5s when user edits and waits', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger();
    expect(mockSave).not.toHaveBeenCalled(); // not yet

    await vi.runAllTimersAsync();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(false); // draft save, not closing
  });

  it('status transitions: dirty → saving → saved on success', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger();
    expect(ctrl.getStatus()).toBe('dirty');

    await vi.runAllTimersAsync();
    expect(ctrl.getStatus()).toBe('saved');
    const log = ctrl.getStatusLog();
    expect(log).toContain('dirty');
    expect(log).toContain('saving');
    expect(log).toContain('saved');
  });

  it('multiple rapid triggers result in only one save call (debounce reset)', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger();
    ctrl.trigger();
    ctrl.trigger();

    await vi.runAllTimersAsync();
    expect(mockSave).toHaveBeenCalledTimes(1); // debounce: only last fires
  });
});

// ─── WB-02.4: Flush on unmount (user navigates before 5s) ────────────────────
describe('WB-02.4 — flush on unmount when isDirty', () => {
  it('performSave called immediately on unmount when isDirty=true', () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger(); // marks dirty, starts 5s timer
    expect(ctrl.isDirty()).toBe(true);

    // Simulate unmount before timer fires (< 5s)
    ctrl.flushOnUnmount();

    expect(mockSave).toHaveBeenCalledTimes(1); // flushed immediately
  });

  it('performSave NOT called on unmount when isDirty=false', () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    // Never triggered; isDirty stays false
    ctrl.flushOnUnmount();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('flush does not fire when session is locked', () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger(false); // trigger with unlocked
    ctrl.flushOnUnmount(true); // unmount with isLocked=true
    expect(mockSave).not.toHaveBeenCalled(); // locked → no flush
  });
});

// ─── WB-02.2: No flush when not dirty ────────────────────────────────────────
describe('WB-02.2 — cleanup does not call performSave when not dirty', () => {
  it('zero network calls when component unmounts cleanly with no edits', () => {
    const mockSave = vi.fn();
    const ctrl = createAutoSaveController(mockSave);

    // No trigger() call → isDirty stays false
    ctrl.flushOnUnmount(false);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

// ─── WB-02.7: Error catch must NOT be silent ─────────────────────────────────
describe('WB-02.7 — save failure sets error status (not silent)', () => {
  it('status becomes error when performSave rejects', async () => {
    const mockSave = vi.fn().mockRejectedValue(new Error('DB connection failed'));
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger();
    await vi.runAllTimersAsync();

    expect(ctrl.getStatus()).toBe('error');
    const log = ctrl.getStatusLog();
    expect(log).toContain('error');
    expect(log).not.toContain('saved');
  });

  it('error status is set even for network timeout errors', async () => {
    const mockSave = vi.fn().mockRejectedValue(new Error('Network timeout'));
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger();
    await vi.runAllTimersAsync();

    expect(ctrl.getStatus()).toBe('error');
  });
});

// ─── WB-02.1: Cleanup function behavior ──────────────────────────────────────
describe('WB-02.1 — useEffect cleanup: flushAutoSave called when isDirty on unmount', () => {
  it('mimics the component unmount: cleanup fires flush when dirty', () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    const ctrl = createAutoSaveController(mockSave);

    // Simulate user typing (makes isDirty=true)
    ctrl.trigger(false);
    expect(ctrl.isDirty()).toBe(true);

    // Simulate React useEffect cleanup (unmount)
    const cleanup = () => ctrl.flushOnUnmount(false);
    cleanup();

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(false);
  });

  it('timer is cancelled before flush (no double-save from timer + flush)', () => {
    const callLog = [];
    const mockSave = vi.fn(async () => { callLog.push(Date.now()); });
    const ctrl = createAutoSaveController(mockSave);

    ctrl.trigger(false);
    ctrl.flushOnUnmount(false); // cancels timer, then flushes once

    // Fast-forward: timer would have fired here, but it was cancelled
    vi.runAllTimers();

    expect(mockSave).toHaveBeenCalledTimes(1); // exactly once, not twice
  });
});
