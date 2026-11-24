import { describe, it, expect } from 'vitest';
import {
  parseTwoTierConfig,
  formatTwoTierFullPack
} from '../components/shared/TwoTierConversionEditor';
import {
  resolvePackInfo,
  getUnitPrice,
  calculateIngredientCost
} from '../services/costUtils';
import {
  convertQtyToStockUnit,
  getBrokenUnitLabel,
  isBrokenTrackingEnabled
} from '../services/dailyInventoryMath';
import {
  computeVirtualWindow,
  resolveOutUnitCapabilities,
  getInventoryRowMetrics,
  evaluatePosComparison
} from '../pages/shared/DailyInventory';

describe('Alpha End-to-End Operational Day Integration Suite (v9-v10)', () => {
  it('Step 1: Synchronizes 2-Tier Conversion between Marketlist and Stock Ledger with identical unit prices', () => {
    const fullPackStr = formatTwoTierFullPack('galon', 19000, 'ml');
    expect(fullPackStr).toBe('galon = 19000 ml');

    const material = {
      id: 'mat-galon-19l',
      name: 'Air Galon 19L',
      unit: 'galon',
      full_pack: fullPackStr,
      price: 19000,
      yield_rate: 100
    };

    const twoTier = parseTwoTierConfig(material.unit, material.full_pack);
    const ledgerPack = resolvePackInfo(material.full_pack, material.unit);

    expect(twoTier.packUnit).toBe('galon');
    expect(twoTier.contentQty).toBe(19000);
    expect(twoTier.contentUnit).toBe('ml');

    expect(ledgerPack.size).toBe(19000);
    expect(ledgerPack.unit).toBe('ml');

    // Verify unit price parity across ml and liter
    const priceInfo = getUnitPrice(material);
    expect(priceInfo.resolved).toBe(true);
    expect(priceInfo.unitPrice).toBe(1);
    const costFor2Liters = calculateIngredientCost(material, 2000, 'ml');
    expect(costFor2Liters).toBe(2000);
  });

  it('Step 2: Enforces single-unit vs dual-unit PAKAI (OUT) capabilities accurately across base and packaged materials', () => {
    const airKelapa = {
      id: 'mat-air-kelapa',
      name: 'Air Kelapa',
      unit: 'gr',
      full_pack: '1000 ml',
      price: 16000
    };

    const airMineral = {
      id: 'mat-air-mineral',
      name: 'Air Mineral',
      unit: 'pcs',
      full_pack: '1000 ml',
      price: 2300
    };

    const susuUht = {
      id: 'mat-susu-uht',
      name: 'Susu UHT 1L',
      unit: 'btl',
      full_pack: 'btl = 1000 ml',
      price: 20000
    };

    // Base units must NOT show false dual-unit toggles
    const capKelapa = resolveOutUnitCapabilities(airKelapa);
    expect(capKelapa.hasTwoUnits).toBe(false);
    expect(capKelapa.packUnit).toBe('gr');
    expect(isBrokenTrackingEnabled(airKelapa)).toBe(false);
    expect(getBrokenUnitLabel(airKelapa)).toBe('gr');

    const capMineral = resolveOutUnitCapabilities(airMineral);
    expect(capMineral.hasTwoUnits).toBe(false);
    expect(capMineral.packUnit).toBe('pcs');
    expect(isBrokenTrackingEnabled(airMineral)).toBe(false);

    // Packaged material with 1 btl = 1000 ml MUST enable dual-unit toggle (btl | ml)
    const capSusu = resolveOutUnitCapabilities(susuUht);
    expect(capSusu.hasTwoUnits).toBe(true);
    expect(capSusu.packUnit).toBe('btl');
    expect(capSusu.contentUnit).toBe('ml');
    expect(isBrokenTrackingEnabled(susuUht)).toBe(true);
  });

  it('Step 3: Computes real-time STOK AKHIR (bookClosing), Sisa Utuh, Terpakai, POS comparison, and Biaya HPP during EOD input', () => {
    const susuUht = {
      id: 'mat-susu-uht',
      name: 'Susu UHT 1L',
      unit: 'btl',
      full_pack: 'btl = 1000 ml',
      price: 20000
    };

    // Initial state before any input: STOK AKHIR immediately displays bookClosing (10) instead of 'Tinjau'
    const untouchedRow = {
      stok_awal: 10,
      qty_in: 0,
      qty_out: '',
      waste: 0
    };
    const initialMetrics = getInventoryRowMetrics(susuUht, untouchedRow);
    expect(initialMetrics.reconciliationRequired).toBe(false);
    expect(initialMetrics.closing).toBe(10);
    expect(initialMetrics.actualUsage).toBe(0);

    // Operational input: IN = 5 btl, OUT = 2500 ml (converted to 2.5 btl), Waste = 0.5 btl
    const outInStockUnit = convertQtyToStockUnit(susuUht, 2500, 'ml');
    expect(outInStockUnit).toBe(2.5);

    const activeRow = {
      stok_awal: 10,
      qty_in: 5,
      qty_out: '2500',
      out_unit: 'ml',
      waste: 0.5
    };
    const activeMetrics = getInventoryRowMetrics(susuUht, activeRow);

    // Book closing = 10 + 5 - 2.5 - 0.5 = 12 btl
    expect(activeMetrics.reconciliationRequired).toBe(false);
    expect(activeMetrics.bookClosing).toBe(12);
    expect(activeMetrics.closing).toBe(12);
    expect(activeMetrics.fullQty).toBe(12);
    expect(activeMetrics.actualUsage).toBe(2.5);
    expect(activeMetrics.usageValue).toBe(50000);

    // POS ESB comparison check
    const posCheck = evaluatePosComparison(susuUht, activeMetrics.actualUsage, {
      theoretical_stock_qty: 2.5,
      theoretical_recipe_qty: 2500,
      recipe_unit: 'ml'
    });
    expect(posCheck.status).toBe('MATCH');

    // Anomaly state: OUT exceeds available stock (opening 10 + in 0 - out 15 = -5) -> triggers 'Tinjau'
    const anomalyMetrics = getInventoryRowMetrics(susuUht, {
      stok_awal: 10,
      qty_in: 0,
      qty_out: '15',
      out_unit: 'btl',
      waste: 0
    });
    expect(anomalyMetrics.reconciliationRequired).toBe(true);
    expect(anomalyMetrics.closing).toBe(null);
  });

  it('Step 4: Maintains smooth Virtual Scrolling window calculations for large Daily Inventory datasets', () => {
    const windowState = computeVirtualWindow({
      totalCount: 500,
      scrollTop: 1440,
      viewportHeight: 680,
      rowHeight: 72,
      overscan: 8,
      enabled: true
    });

    expect(windowState.isVirtualized).toBe(true);
    expect(windowState.startIndex).toBe(12);
    expect(windowState.endIndex).toBeGreaterThan(25);
    expect(windowState.topSpacerHeight).toBe(12 * 72);
    expect(
      windowState.topSpacerHeight +
      windowState.bottomSpacerHeight +
      (windowState.endIndex - windowState.startIndex) * 72
    ).toBe(500 * 72);
  });
});
