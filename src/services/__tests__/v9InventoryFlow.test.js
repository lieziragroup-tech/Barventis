import { describe, it, expect } from 'vitest';
import {
  parseTwoTierConfig,
  formatTwoTierFullPack,
} from '../../components/shared/TwoTierConversionEditor';
import { resolvePackInfo } from '../costUtils';
import {
  convertQtyToStockUnit,
  calculateInferredFullFromBroken,
  getBrokenUnitLabel,
} from '../dailyInventoryMath';
import {
  evaluatePosComparison,
  isPrepOutputMaterial,
  computeVirtualWindow,
  resolveOutUnitCapabilities,
} from '../../pages/shared/DailyInventory';

describe('Barventis v9 — 4 Pilar Alur Inventaris & Konversi 2 Satuan', () => {
  describe('Pilar 1: Konfigurasi 2 Satuan Konversi & Keselarasan Marketlist <-> Stock Ledger', () => {
    it('memformat dan mem-parsing konfigurasi 2 satuan secara akurat', () => {
      const formatted = formatTwoTierFullPack('btl', 750, 'ml');
      expect(formatted).toBe('btl = 750 ml');

      const parsed = parseTwoTierConfig('btl', formatted);
      expect(parsed).toEqual({
        packUnit: 'btl',
        contentQty: 750,
        contentUnit: 'ml',
        hasTwoTier: true,
        fullPackString: 'btl = 750 ml',
        consistent: true,
      });
    });

    it('menghasilkan satuan dan konversi yang 100% identik antara Marketlist (parseTwoTierConfig) dan Stock Ledger (resolvePackInfo)', () => {
      const sampleItems = [
        { name: 'Almond Milk', unit: 'grm', full_pack: '1000 grm' },
        { name: 'Apple Juice', unit: 'Btl', full_pack: '1000 ml' },
        { name: 'Bali Hai Draft Beer', unit: 'Carton', full_pack: 'Carton = 24 pcs' },
        { name: 'Air Mineral', unit: 'pcs', full_pack: '1 pcs' },
        { name: 'Avocado Frozen', unit: 'pck', full_pack: '1000 gr' },
      ];

      sampleItems.forEach(item => {
        const ledgerPack = resolvePackInfo(item.full_pack, item.unit);
        const marketlistConv = parseTwoTierConfig(item.unit, item.full_pack);

        // Satuan pack tidak boleh berubah paksa (misal grm tidak boleh berubah jadi pck)
        expect(marketlistConv.packUnit).toBe(item.unit);
        // Jumlah isi (size) dan satuan isi (unit) harus sama persis dengan Stock Ledger
        expect(marketlistConv.contentQty).toBe(ledgerPack.size);
        expect(marketlistConv.contentUnit).toBe(ledgerPack.unit);
      });
    });

    it('mengonversi pemakaian satuan isi (gr/ml/pcs) ke satuan stok kemasan (btl/pck/Carton/kaleng/galon)', () => {
      const syrupBtl = { name: 'Syrup Vanilla', unit: 'btl', full_pack: 'btl = 750 ml' };
      expect(convertQtyToStockUnit(syrupBtl, 250, 'ml')).toBeCloseTo(1 / 3, 4);
      expect(convertQtyToStockUnit(syrupBtl, 1, 'btl')).toBe(1);

      const coffeePack = { name: 'Coffee Bean', unit: 'pck', full_pack: 'pck = 1000 gr' };
      expect(convertQtyToStockUnit(coffeePack, 500, 'gr')).toBeCloseTo(0.5, 4);
      expect(convertQtyToStockUnit(coffeePack, 2, 'pck')).toBe(2);

      const skmKaleng = { name: 'Susu Kental Manis', unit: 'kaleng', full_pack: 'kaleng = 370 gr' };
      expect(convertQtyToStockUnit(skmKaleng, 185, 'gr')).toBeCloseTo(0.5, 4);

      const galonAir = { name: 'Aqua Galon 19 L', unit: 'galon', full_pack: 'galon = 19000 ml' };
      expect(convertQtyToStockUnit(galonAir, 9500, 'ml')).toBeCloseTo(0.5, 4);
    });

    it('menghitung Sisa Utuh (full_qty) dari saldo buku dan terbuka (broken)', () => {
      const milkPack = { name: 'Fresh Milk', unit: 'pck', full_pack: 'pck = 1000 ml' };
      expect(getBrokenUnitLabel(milkPack)).toBe('ml');
      // Stok buku 4.5 pck, terbuka 500 ml -> Sisa utuh 4 pck
      const inferred = calculateInferredFullFromBroken(milkPack, 4.5, 500);
      expect(inferred.valid).toBe(true);
      expect(inferred.fullQty).toBe(4);
    });

    it('memvalidasi kapan toggle 2 satuan OUT aktif (resolveOutUnitCapabilities) agar tidak memunculkan konversi palsu pada satuan dasar', () => {
      // Satuan dasar atau full_pack lintas dimensi tanpa kemasan -> hasTwoUnits = false
      const airKelapa = resolveOutUnitCapabilities({ name: 'Air Kelapa', unit: 'gr', full_pack: '1000 ml' });
      expect(airKelapa.hasTwoUnits).toBe(false);
      expect(airKelapa.defaultOutUnit).toBe('gr');

      const airMineral = resolveOutUnitCapabilities({ name: 'Air Mineral', unit: 'pcs', full_pack: '1000 ml' });
      expect(airMineral.hasTwoUnits).toBe(false);
      expect(airMineral.defaultOutUnit).toBe('pcs');

      const almondMilk = resolveOutUnitCapabilities({ name: 'Almond Milk', unit: 'grm', full_pack: '1000 grm' });
      expect(almondMilk.hasTwoUnits).toBe(false);
      expect(almondMilk.defaultOutUnit).toBe('grm');

      // Satuan kemasan valid -> hasTwoUnits = true
      const appleJuice = resolveOutUnitCapabilities({ name: 'Apple Juice', unit: 'Btl', full_pack: '1000 ml' });
      expect(appleJuice.hasTwoUnits).toBe(true);
      expect(appleJuice.packUnit).toBe('Btl');
      expect(appleJuice.contentUnit).toBe('ml');

      const beerCarton = resolveOutUnitCapabilities({ name: 'Bali Hai Draft Beer', unit: 'Carton', full_pack: 'Carton = 24 pcs' });
      expect(beerCarton.hasTwoUnits).toBe(true);
      expect(beerCarton.packUnit).toBe('Carton');
      expect(beerCarton.contentUnit).toBe('pcs');
    });
  });

  describe('Pilar 2: Rekonsiliasi Input Manual Barista vs Penjualan POS ESB', () => {
    const syrupItem = { id: 10, name: 'Syrup Caramel', unit: 'btl', full_pack: 'btl = 750 ml' };

    it('mengembalikan NO_POS bila tidak ada penjualan di POS ESB', () => {
      const res = evaluatePosComparison(syrupItem, 0, null);
      expect(res.status).toBe('NO_POS');
      expect(res.hasPosSales).toBe(false);
    });

    it('mengembalikan MISSING_OUT bila ada penjualan di POS ESB tetapi Barista belum menginput OUT', () => {
      const posEntry = {
        theoretical_stock_qty: 0.5,
        theoretical_recipe_qty: 375,
        recipe_unit: 'ml',
        menu_breakdown: [{ menu_name: 'Caramel Latte', qty_sold: 15 }],
      };
      const res = evaluatePosComparison(syrupItem, 0, posEntry);
      expect(res.status).toBe('MISSING_OUT');
      expect(res.label).toBe('Terjual di POS, Belum Input OUT');
      expect(res.diffStockQty).toBeCloseTo(-0.5, 4);
    });

    it('mengembalikan MATCH bila input manual Barista cocok dengan kalkulasi resep POS ESB', () => {
      const posEntry = {
        theoretical_stock_qty: 1.2,
        theoretical_recipe_qty: 900,
        recipe_unit: 'ml',
      };
      const res = evaluatePosComparison(syrupItem, 1.21, posEntry);
      expect(res.status).toBe('MATCH');
      expect(res.label).toBe('Cocok POS');
    });

    it('mengembalikan DIFF beserta nilai selisih bila input manual Barista berbeda signifikan dari POS ESB', () => {
      const posEntry = {
        theoretical_stock_qty: 1.0,
        theoretical_recipe_qty: 750,
        recipe_unit: 'ml',
      };
      const res = evaluatePosComparison(syrupItem, 1.5, posEntry);
      expect(res.status).toBe('DIFF');
      expect(res.diffStockQty).toBeCloseTo(0.5, 4);
      expect(res.label).toContain('Selisih +0.5 btl');
    });
  });

  describe('Pilar 4: Deteksi Visibilitas Bahan Hasil Olahan / SimplePrep', () => {
    it('mendeteksi item dengan flag is_prep_output = true atau kategori Bahan Olahan / Prep', () => {
      expect(isPrepOutputMaterial({ name: 'Green Delight', is_prep_output: true, category: 'Juice' })).toBe(true);
      expect(isPrepOutputMaterial({ name: 'Gula Cair', is_prep_output: false, category: 'Bahan Olahan / Prep' })).toBe(true);
      expect(isPrepOutputMaterial({ name: 'Biji Kopi Arabica', is_prep_output: false, category: 'Coffee' })).toBe(false);
    });
  });

  describe('UI Optimization: Native Table Windowing / Virtual Scrolling (DailyInventory)', () => {
    it('tidak melakukan virtualisasi bila jumlah baris <= 15 atau mode cetak aktif', () => {
      const smallWindow = computeVirtualWindow({
        totalCount: 10,
        scrollTop: 0,
        viewportHeight: 560,
        rowHeight: 64,
        overscan: 6,
        enabled: true,
      });
      expect(smallWindow).toEqual({
        isVirtualized: false,
        startIndex: 0,
        endIndex: 10,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      });

      const printWindow = computeVirtualWindow({
        totalCount: 250,
        scrollTop: 1200,
        viewportHeight: 560,
        rowHeight: 64,
        overscan: 6,
        enabled: false,
      });
      expect(printWindow.isVirtualized).toBe(false);
      expect(printWindow.startIndex).toBe(0);
      expect(printWindow.endIndex).toBe(250);
    });

    it('menghitung windowing, topSpacerHeight, dan bottomSpacerHeight dengan akurat untuk dataset besar (250 baris)', () => {
      const midScrollWindow = computeVirtualWindow({
        totalCount: 250,
        scrollTop: 3200, // baris ke-50 (3200 / 64 = 50)
        viewportHeight: 560, // ceil(560 / 64) = 9 baris terlihat
        rowHeight: 64,
        overscan: 6,
        enabled: true,
      });

      expect(midScrollWindow.isVirtualized).toBe(true);
      expect(midScrollWindow.startIndex).toBe(44); // 50 - 6
      expect(midScrollWindow.endIndex).toBe(65); // 50 + 9 + 6
      expect(midScrollWindow.topSpacerHeight).toBe(44 * 64);
      expect(midScrollWindow.bottomSpacerHeight).toBe((250 - 65) * 64);
      // Total tinggi virtual tetap konsisten dengan 250 * 64
      const renderedRowsHeight = (midScrollWindow.endIndex - midScrollWindow.startIndex) * 64;
      expect(midScrollWindow.topSpacerHeight + renderedRowsHeight + midScrollWindow.bottomSpacerHeight).toBe(250 * 64);
    });
  });
});

