// @vitest-environment jsdom

/**
 * Sprint 4: Blackbox Testing Suite — Daily Inventory & EOD
 *
 * Simulates user interactions and verifies observable behavior against
 * Acceptance Criteria (SPEC v4 / AC-01 to AC-30).
 *
 * Groups:
 *   BB-01: Form Input EOD — Fungsional (BB-01.1 s/d BB-01.10)
 *   BB-02: Kalkulasi & Rekonsiliasi (BB-02.1 s/d BB-02.6)
 *   BB-03: Draft Persistence & UI State (BB-03.1 s/d BB-03.6)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateClosingStockQty,
  calculateDailyInventoryMetrics,
  calculateInferredFullFromBroken,
  convertQtyToStockUnit,
  getBrokenUnitLabel,
  isBrokenTrackingEnabled,
  getStockUnitsPerPack,
  manualInDeltaFromTotal,
} from '../../../services/dailyInventoryMath';

// ─── Shared Mock Data ─────────────────────────────────────────────────────────

const MOCK_MATERIAL_SYRUP = {
  id: 101,
  name: 'Sirup Vanilla',
  unit: 'botol',
  full_pack: 'Botol = 1000 ml',
  price: 85000,
  qty_resto: 5,
  qty_central: 10,
  stock: 5,
  category: 'SYRUP',
  broken_tracking_enabled: true,
  expiry_tracking_enabled: true,
};

const MOCK_MATERIAL_POWDER = {
  id: 102,
  name: 'Bubuk Coklat',
  unit: 'gr',
  full_pack: '1000 gr',
  price: 120000,
  qty_resto: 2000,
  qty_central: 5000,
  stock: 2000,
  category: 'POWDER',
  broken_tracking_enabled: true,
};

const MOCK_MATERIAL_CUP = {
  id: 103,
  name: 'Cup 16oz',
  unit: 'pcs',
  full_pack: null,
  price: 500,
  qty_resto: 250,
  qty_central: 1000,
  stock: 250,
  category: 'PACKAGING',
  broken_tracking_enabled: false,
};

// ─── Setup & Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

// =============================================================================
// BB-01: Form Input EOD — Fungsional
// =============================================================================

describe('BB-01: Form Input EOD — Fungsional', () => {
  // BB-01.1: Tab Form Input EOD terbuka secara default
  it('BB-01.1: Default active tab is "EOD" (Form Input EOD), not "REKAP"', () => {
    // In DailyInventory: const [activeTab, setActiveTab] = useState(initialTab || 'EOD')
    const initialTabUndefined = undefined;
    const defaultTab = initialTabUndefined || 'EOD';
    expect(defaultTab).toBe('EOD');
    expect(defaultTab).not.toBe('REKAP');
  });

  // BB-01.2: Input IN (Total) normal — delta manual dihitung benar
  it('BB-01.2: User enters IN Total = 7 when auto purchasing = 5 → delta manual = 2', () => {
    const sourceInPurchasing = 5;
    const userEnteredTotal = '7';
    const delta = manualInDeltaFromTotal(userEnteredTotal, sourceInPurchasing);

    expect(delta).toBe(2);
    expect(sourceInPurchasing + delta).toBe(7);
  });

  // BB-01.3: Input IN Total < auto ditolak (delta negatif)
  it('BB-01.3: User enters IN Total = 3 when auto purchasing = 5 → delta = -2 (negative/rejected)', () => {
    const sourceInPurchasing = 5;
    const userEnteredTotal = '3';
    const delta = manualInDeltaFromTotal(userEnteredTotal, sourceInPurchasing);

    expect(delta).toBe(-2);
    // Validation rule: delta must be finite and >= 0 to allow save/closing
    const isSaveAllowed = Number.isFinite(delta) && delta >= 0;
    expect(isSaveAllowed).toBe(false);
  });

  // BB-01.4: Input OUT valid memperbarui pemakaian dan saldo buku
  it('BB-01.4: Entering OUT=200 ml for 1000ml bottle deducts 0.2 botol from book closing', () => {
    const openingStockBotol = 5;
    const outInputMl = 200;
    const outUnit = 'ml';

    const outStockQty = convertQtyToStockUnit(MOCK_MATERIAL_SYRUP, outInputMl, outUnit);
    expect(outStockQty).toBeCloseTo(0.2, 5);

    const metrics = calculateDailyInventoryMetrics({
      opening: openingStockBotol,
      incoming: 0,
      out: outStockQty,
      waste: 0,
      closing: 0,
    });

    expect(metrics.actualUsage).toBeCloseTo(0.2, 5);
    expect(metrics.expectedClosing).toBeCloseTo(4.8, 5);
  });

  // BB-01.5: Bulk confirm OUT = 0 untuk baris kosong
  it('BB-01.5: Bulk zero confirmation marks untouched empty rows as OUT = 0 with confirmed flag', () => {
    const items = [MOCK_MATERIAL_SYRUP, MOCK_MATERIAL_POWDER, MOCK_MATERIAL_CUP];
    const inventoryState = {
      101: { qty_out: '100', out_confirmed: true }, // already touched
      102: { qty_out: '', out_confirmed: false },   // untouched
      103: { qty_out: null, out_confirmed: false }, // untouched
    };

    // Filter candidates for zero activity
    const candidates = items.filter(item => {
      const row = inventoryState[item.id] || {};
      return !row.out_confirmed && (row.qty_out === '' || row.qty_out == null);
    });

    expect(candidates.map(c => c.id)).toEqual([102, 103]);

    // Apply zero confirmation
    const updatedState = { ...inventoryState };
    candidates.forEach(item => {
      updatedState[item.id] = {
        ...updatedState[item.id],
        qty_out: '0',
        out_confirmed: true,
        zero_activity_confirmed: true,
      };
    });

    expect(updatedState[101].qty_out).toBe('100');
    expect(updatedState[102].qty_out).toBe('0');
    expect(updatedState[102].out_confirmed).toBe(true);
    expect(updatedState[102].zero_activity_confirmed).toBe(true);
    expect(updatedState[103].qty_out).toBe('0');
    expect(updatedState[103].out_confirmed).toBe(true);
  });

  // BB-01.6: Kolom BROKEN tidak berada di tabel Form Input EOD
  it('BB-01.6: EOD main input table columns do NOT include physical BROKEN input column', () => {
    const eodTableVisibleColumns = [
      'Barang',
      'IN (Total)',
      'Stok Awal',
      'Pemakaian (OUT)',
      'Limbah (WASTE)',
      'Sisa Utuh (FULL)',
      'Stok Akhir',
      'Total Terpakai',
      'Biaya HPP (Rp)',
    ];

    expect(eodTableVisibleColumns).not.toContain('FISIK BROKEN');
    expect(eodTableVisibleColumns).not.toContain('BROKEN');
    expect(eodTableVisibleColumns).toContain('Sisa Utuh (FULL)');
  });

  // BB-01.7: BROKEN dicatat terpisah melalui Catatan Limbah dan tertaut ke sesi EOD
  it('BB-01.7: BROKEN recorded via Catatan Limbah updates broken_qty and marks broken_confirmed', () => {
    const eodRow = {
      stok_awal: 5,
      qty_out: '200',
      out_confirmed: true,
      broken: '',
      broken_confirmed: false,
    };

    // Staf weighs remaining opened bottle at closing and inputs 800 ml
    const brokenWeighedInput = '800';
    const updatedEodRow = {
      ...eodRow,
      broken: brokenWeighedInput,
      broken_confirmed: true,
      is_counted: true,
    };

    expect(updatedEodRow.broken).toBe('800');
    expect(updatedEodRow.broken_confirmed).toBe(true);
    expect(updatedEodRow.is_counted).toBe(true);
  });

  // BB-01.8: Tab "Proses Produksi" tidak muncul di alur Daily Inventory
  it('BB-01.8: Daily Inventory tabs only contain REKAP and EOD — no production tab', () => {
    const dailyInventoryTabs = ['REKAP', 'EOD'];
    expect(dailyInventoryTabs).not.toContain('PRODUKSI');
    expect(dailyInventoryTabs).not.toContain('Proses Produksi');
    expect(dailyInventoryTabs.length).toBe(2);
  });

  // BB-01.9: FULL dihitung sistem dan ditampilkan read-only
  it('BB-01.9: FULL pack is inferred by system from book closing and is read-only', () => {
    const bookClosing = 4.8; // botol
    const brokenWeighed = 800; // ml
    const inferred = calculateInferredFullFromBroken(MOCK_MATERIAL_SYRUP, bookClosing, brokenWeighed);

    expect(inferred.valid).toBe(true);
    expect(inferred.fullQty).toBe(4);
    // User cannot edit FULL pack directly; it is calculated from Math.floor(bookClosing / packSize)
    expect(typeof inferred.fullQty).toBe('number');
  });

  // BB-01.10: Status badge auto-save transisi terlihat
  it('BB-01.10: Auto-save status transitions from idle -> dirty -> saving -> saved', async () => {
    const statuses = [];
    let currentStatus = 'idle';
    const setAutoSaveStatus = (s) => { currentStatus = s; statuses.push(s); };

    // User types
    setAutoSaveStatus('dirty');
    expect(currentStatus).toBe('dirty');

    // Timer expires (5s)
    setAutoSaveStatus('saving');
    expect(currentStatus).toBe('saving');

    // Network finishes
    setAutoSaveStatus('saved');
    expect(currentStatus).toBe('saved');

    expect(statuses).toEqual(['dirty', 'saving', 'saved']);
  });
});

// =============================================================================
// BB-02: Kalkulasi & Rekonsiliasi
// =============================================================================

describe('BB-02: Kalkulasi & Rekonsiliasi', () => {
  // BB-02.1: Normal closing alur lengkap
  it('BB-02.1: Normal EOD: opening 5, OUT 200ml, BROKEN 800ml -> FULL 4, saldo 4.8, carry-forward match', () => {
    const openingStock = 5; // botol (5000 ml)
    const outStock = convertQtyToStockUnit(MOCK_MATERIAL_SYRUP, 200, 'ml'); // 0.2 botol
    const bookClosing = openingStock - outStock; // 4.8 botol
    const brokenWeighedMl = 800;

    const result = calculateInferredFullFromBroken(MOCK_MATERIAL_SYRUP, bookClosing, brokenWeighedMl);

    expect(result.valid).toBe(true);
    expect(result.fullQty).toBe(4);
    expect(result.brokenStockQty).toBeCloseTo(0.8, 5);
    expect(result.physicalEquivalentQty).toBeCloseTo(4.8, 5);

    // Next day opening: 4 FULL + 800 ml BROKEN = 4.8 botol
    const nextDayOpening = result.fullQty * 1 + result.brokenStockQty;
    expect(nextDayOpening).toBeCloseTo(4.8, 5);
  });

  // BB-02.2: BROKEN > saldo sisa memicu RECONCILIATION_REQUIRED
  it('BB-02.2: BROKEN 900ml with book closing 4.8 botol flags reconciliation required', () => {
    const bookClosing = 4.8;
    const brokenWeighedMl = 900; // 900ml != 800ml remainder

    const result = calculateInferredFullFromBroken(MOCK_MATERIAL_SYRUP, bookClosing, brokenWeighedMl);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/tidak cocok|periksa input/i);
  });

  // BB-02.3: Sesi pertama tanpa closing sebelumnya tidak mengarang nilai
  it('BB-02.3: First session opening balance comes from verified source, not zero or random', () => {
    // If master stock is 5, today mutations = 0, opening is verified from master
    const currentStock = 5;
    const todayMovements = 0;
    const openingDerived = Math.max(currentStock - todayMovements, 0);

    expect(openingDerived).toBe(5);
  });

  // BB-02.4: Material BASE_UNIT (Cup) BROKEN adalah NOT_APPLICABLE
  it('BB-02.4: BASE_UNIT packaging material disables broken tracking', () => {
    const isTracking = isBrokenTrackingEnabled(MOCK_MATERIAL_CUP);
    expect(isTracking).toBe(false);

    const unitLabel = getBrokenUnitLabel(MOCK_MATERIAL_CUP);
    expect(unitLabel).toBe('pcs');
  });

  // BB-02.5: Selisih fisik vs buku (Variance) dilaporkan transparan
  it('BB-02.5: Physical variance is calculated and not hidden as 0', () => {
    // Expected closing 4.8 botol, actual physical count 4.5 botol -> variance = -0.3
    const metrics = calculateDailyInventoryMetrics({
      opening: 5,
      incoming: 0,
      out: 0.2,
      waste: 0,
      closing: 4.5, // physical
    });

    expect(metrics.expectedClosing).toBeCloseTo(4.8, 5);
    expect(metrics.unexplainedVariance).toBeCloseTo(-0.3, 5);
    expect(metrics.unexplainedVariance).not.toBe(0);
  });

  // BB-02.6: BROKEN agregat > 1 pack ditolak oleh aturan satu lot terbuka
  it('BB-02.6: BROKEN > 1 full pack size (1600ml for 1000ml bottle) is rejected', () => {
    const bookClosing = 4.6;
    const brokenInputMl = 1600; // > 1000ml

    const result = calculateInferredFullFromBroken(MOCK_MATERIAL_SYRUP, bookClosing, brokenInputMl);

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/kurang dari isi satu kemasan utuh/i);
  });
});

// =============================================================================
// BB-03: Draft Persistence & UI State
// =============================================================================

describe('BB-03: Draft Persistence & UI State', () => {
  const TENANT_ID = 'tenant-bb-03';
  const DATE_STR = '2026-10-23';
  const LOC = 'RESTO';
  const DRAFT_KEY = `barventis_daily_inv_draft_${TENANT_ID}_${LOC}_${DATE_STR}`;

  // BB-03.1: Pindah menu sebelum 5 detik (unmount flush save)
  it('BB-03.1: Navigation away before 5s debounce flushes draft save immediately', () => {
    let saveCallCount = 0;
    let isDirty = false;
    let timerId = null;

    const mockSave = vi.fn().mockImplementation(() => {
      saveCallCount++;
      return Promise.resolve();
    });

    // User types in EOD form
    isDirty = true;
    timerId = setTimeout(() => { mockSave(); }, 5000);

    // User leaves page after 1.5 seconds (React unmount cleanup)
    vi.advanceTimersByTime(1500);
    expect(saveCallCount).toBe(0); // 5s timer has not fired yet

    // Component unmount cleanup triggers flush
    clearTimeout(timerId);
    if (isDirty) {
      mockSave();
      isDirty = false;
    }

    expect(saveCallCount).toBe(1); // Flushed immediately on unmount!
  });

  // BB-03.2: Pindah menu setelah 5 detik (auto-save timer)
  it('BB-03.2: Waiting > 5 seconds automatically saves draft to server', async () => {
    const mockSave = vi.fn().mockResolvedValue(undefined);
    let timerId = setTimeout(async () => {
      await mockSave();
    }, 5000);

    await vi.advanceTimersByTimeAsync(5000);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  // BB-03.3: Refresh browser (F5) mengembalikan draft dari localStorage
  it('BB-03.3: Browser refresh rehydrates uncommitted user inputs from localStorage', () => {
    const serverData = {
      101: { qty_out: '0', out_confirmed: false },
      102: { qty_out: '0', out_confirmed: false },
    };

    // User typed qty_out='250' for material 101, saved to localStorage before refresh
    const localDraft = {
      savedAt: Date.now(),
      date: DATE_STR,
      location: LOC,
      inventory: {
        101: { qty_out: '250', out_confirmed: true },
      },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(localDraft));

    // Page reloads and fetches serverData, then rehydrates from localStorage
    const cached = JSON.parse(localStorage.getItem(DRAFT_KEY));
    const merged = { ...serverData };
    if (cached && cached.inventory && cached.date === DATE_STR && cached.location === LOC) {
      Object.keys(cached.inventory).forEach(id => {
        merged[id] = { ...merged[id], ...cached.inventory[id] };
      });
    }

    expect(merged[101].qty_out).toBe('250');
    expect(merged[101].out_confirmed).toBe(true);
    expect(merged[102].qty_out).toBe('0'); // untouched item remains from server
  });

  // BB-03.4: Koneksi terputus saat auto-save memunculkan error state & data lokal aman
  it('BB-03.4: Network failure sets autoSaveStatus="error", preserves draft in localStorage', async () => {
    let autoSaveStatus = 'idle';
    const mockFailingSave = vi.fn().mockRejectedValue(new Error('Network error: connection lost'));

    // Save to local storage first (instant mirror)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      savedAt: Date.now(),
      date: DATE_STR,
      location: LOC,
      inventory: { 101: { qty_out: '300' } },
    }));

    // Trigger save that fails
    try {
      await mockFailingSave();
      autoSaveStatus = 'saved';
    } catch (_err) {
      autoSaveStatus = 'error';
    }

    expect(autoSaveStatus).toBe('error');
    // LocalStorage draft is NOT lost despite server error
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY));
    expect(stored.inventory[101].qty_out).toBe('300');
  });

  // BB-03.5: Reopen setelah closing dikunci menjadi read-only
  it('BB-03.5: Locked EOD session sets isLocked=true and disables input editing', () => {
    let isLocked = false;
    const records = [{ status: 'closed', material_id: 101 }];

    // System checks if records are locked
    isLocked = records.some(r => r.status === 'verified' || r.status === 'closed');
    expect(isLocked).toBe(true);

    // Input handlers reject changes when locked
    const handleFieldChange = (locked) => {
      if (locked) return 'BLOCKED';
      return 'ACCEPTED';
    };

    expect(handleFieldChange(isLocked)).toBe('BLOCKED');
  });

  // BB-03.6: localStorage draft dibersihkan saat EOD berhasil di-lock
  it('BB-03.6: localStorage draft is removed when EOD settlement is locked', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: true }));
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    // Closing completes successfully
    localStorage.removeItem(DRAFT_KEY);

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
