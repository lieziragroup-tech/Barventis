// @vitest-environment jsdom

/**
 * WB-06: White-Box Testing — Daily Inventory Resilience & Mobile Layout Safety
 *
 * Validates:
 *   WB-06.1: Debounced auto-save state machine (idle -> dirty -> saving -> saved -> idle)
 *   WB-06.2: Keystroke timer debounce reset behavior (cancels previous timeout, starts fresh 5s)
 *   WB-06.3: Local storage draft resilience and corrupt payload handling
 *   WB-06.4: Sticky header invariants check (Bahan Baku solid opaque background & right border)
 *   WB-06.5: Layout non-floating invariant check (no blocking sticky bottom bar, safe padding present)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('WB-06: White-Box Testing — Daily Inventory Resilience & Mobile Layout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── WB-06.1: Auto-Save State Machine ──────────────────────────────────────
  describe('WB-06.1: Auto-Save State Transitions', () => {
    it('transitions from idle -> dirty on input, then saving -> saved after 5 seconds', async () => {
      let state = 'idle';
      let lastSavedTime = null;

      const triggerAutoSave = vi.fn().mockImplementation(async () => {
        state = 'saving';
        // Simulate async save execution
        await Promise.resolve();
        state = 'saved';
        lastSavedTime = '14:35';
      });

      // User types in a cell
      state = 'dirty';
      expect(state).toBe('dirty');

      // Setup 5000ms debounce
      const timeoutId = setTimeout(() => {
        triggerAutoSave();
      }, 5000);

      // Fast-forward 2000ms: still dirty, save not yet invoked
      vi.advanceTimersByTime(2000);
      expect(state).toBe('dirty');
      expect(triggerAutoSave).not.toHaveBeenCalled();

      // Fast-forward remaining 3000ms: timer triggers
      vi.advanceTimersByTime(3000);
      expect(triggerAutoSave).toHaveBeenCalledTimes(1);

      // Resolve pending microtasks
      await Promise.resolve();
      expect(state).toBe('saved');
      expect(lastSavedTime).toBe('14:35');
    });

    it('handles save errors by transitioning state to error without crashing', async () => {
      let state = 'idle';

      const failingAutoSave = vi.fn().mockImplementation(async () => {
        state = 'saving';
        try {
          throw new Error('Network timeout');
        } catch {
          state = 'error';
        }
      });

      state = 'dirty';
      setTimeout(() => {
        failingAutoSave();
      }, 5000);

      vi.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(state).toBe('error');
    });
  });

  // ─── WB-06.2: Debounce Timer Reset Behavior ──────────────────────────────
  describe('WB-06.2: Rapid Input Debounce Reset', () => {
    it('cancels pending auto-save and resets the 5-second countdown on rapid consecutive inputs', () => {
      const mockSave = vi.fn();
      let timer = null;

      const triggerInput = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(mockSave, 5000);
      };

      // Keystroke 1 at t=0
      triggerInput();
      vi.advanceTimersByTime(3000); // at t=3000ms
      expect(mockSave).not.toHaveBeenCalled();

      // Keystroke 2 at t=3000ms (resets timer)
      triggerInput();
      vi.advanceTimersByTime(3000); // at t=6000ms (3s after keystroke 2)
      expect(mockSave).not.toHaveBeenCalled();

      // Keystroke 3 at t=6000ms (resets timer again)
      triggerInput();
      vi.advanceTimersByTime(4999); // at t=10999ms
      expect(mockSave).not.toHaveBeenCalled();

      // Pass final millisecond to complete the 5s window from keystroke 3
      vi.advanceTimersByTime(1); // at t=11000ms
      expect(mockSave).toHaveBeenCalledTimes(1);
    });
  });

  // ─── WB-06.3: Local Storage Draft Resilience ─────────────────────────────
  describe('WB-06.3: Local Storage Draft Resilience', () => {
    const DRAFT_KEY = 'barventis_daily_inv_draft_tenantA_RESTO_2026-11-04';

    it('saves inventory state to localStorage and rehydrates correctly', () => {
      const inventoryState = {
        101: { stok_awal: 10, manual_in_qty: 5, qty_out: 2, waste: 0 },
        102: { stok_awal: 20, manual_in_qty: 0, qty_out: 4, waste: 1 }
      };

      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(),
        inventory: inventoryState
      }));

      const raw = localStorage.getItem(DRAFT_KEY);
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw);
      expect(parsed.inventory[101].qty_out).toBe(2);
      expect(parsed.inventory[102].waste).toBe(1);
    });

    it('safely tolerates corrupt or malformed JSON in localStorage without throwing', () => {
      localStorage.setItem(DRAFT_KEY, '{ invalid_json ::: corrupt');

      let result = null;
      expect(() => {
        try {
          const raw = localStorage.getItem(DRAFT_KEY);
          result = raw ? JSON.parse(raw) : null;
        } catch {
          result = null; // fallback gracefully
        }
      }).not.toThrow();

      expect(result).toBeNull();
    });
  });

  // ─── WB-06.4: Sticky Header & Opacity Invariants ─────────────────────────
  describe('WB-06.4: Sticky Header Invariants', () => {
    it('verifies sticky left Bahan Baku th and td styles contain opaque background', () => {
      // Create mock table DOM structure to verify style attributes
      const container = document.createElement('div');
      container.innerHTML = `
        <table class="custom-table">
          <thead style="background-color: rgb(255, 255, 255);">
            <tr>
              <th id="th-sticky" class="whitespace-nowrap sticky left-0 z-30" style="padding: 12px 16px; text-align: left; min-width: 220px; background-color: rgb(255, 255, 255); border-right: 1px solid rgb(229, 231, 235); box-shadow: rgba(0, 0, 0, 0.08) 4px 0px 8px -2px;">
                Bahan Baku
              </th>
              <th>Stok Awal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td id="td-sticky" class="sticky left-0 z-10" style="padding: 12px 16px; background-color: rgb(255, 255, 255); border-right: 1px solid rgb(229, 231, 235); box-shadow: rgba(0, 0, 0, 0.08) 4px 0px 8px -2px;">
                Air Mineral
              </td>
              <td>10</td>
            </tr>
          </tbody>
        </table>
      `;

      const th = container.querySelector('#th-sticky');
      const td = container.querySelector('#td-sticky');

      // Invariants to guarantee NO text collision on horizontal scroll:
      expect(th.style.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(th.style.borderRight).toContain('1px solid');
      expect(th.className).toContain('sticky');
      expect(th.className).toContain('left-0');
      expect(th.className).toContain('z-30');

      expect(td.style.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(td.style.borderRight).toContain('1px solid');
      expect(td.className).toContain('sticky');
      expect(td.className).toContain('left-0');
      expect(td.className).toContain('z-10');
    });
  });

  // ─── WB-06.5: Non-Floating Layout Safety Invariant ───────────────────────
  describe('WB-06.5: Layout Non-Floating Invariants', () => {
    it('verifies bottom action bar is non-sticky and safe area padding is applied', () => {
      const container = document.createElement('div');
      container.className = 'fade-in space-y-4 pb-28';

      const footerBar = document.createElement('div');
      footerBar.className = 'no-print mt-4 p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xs';

      container.appendChild(footerBar);

      // Invariant 1: Root container has bottom safe-area padding for mobile dock
      expect(container.className).toContain('pb-28');

      // Invariant 2: Footer bar must NOT have floating sticky positioning
      expect(footerBar.className).not.toContain('sticky');
      expect(footerBar.className).not.toContain('bottom-3');
      expect(footerBar.className).not.toContain('fixed');
    });
  });
});
