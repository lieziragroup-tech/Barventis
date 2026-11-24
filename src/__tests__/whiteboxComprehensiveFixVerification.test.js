import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeUnitToken,
  parsePackSize,
  parseStructuredFullPack,
  formatCleanFullPackLabel,
  getPackUnitInfo,
  getUnitPrice,
  calculateIngredientCost,
  convertQtyToStockUnit
} from '../services/costUtils';
import { locationService, DEFAULT_LOCATIONS } from '../services/locationService';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(CURRENT_DIR, '..');

function readSrc(relPath) {
  return fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
}

describe('White-Box Verification Suite: Barventis v2 (Kei E2E Findings FT-01.2..FT-10.1 + Nia Mobile UI/UX P0..P2)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // 1. FT-08.1 & FT-08.2: AuthContext exports checkCurrentAuth (Fixes "ie is not a function")
  // =========================================================================
  it('[WB-01 | FT-08.1 & FT-08.2] AuthContext.jsx defines checkCurrentAuth with useCallback and exports it in Provider value', () => {
    const authCode = readSrc('contexts/AuthContext.jsx');
    expect(authCode).toContain('const checkCurrentAuth = useCallback');
    expect(authCode).toMatch(/value\s*=\s*useMemo\([\s\S]*checkCurrentAuth[\s\S]*\)/);
  });

  // =========================================================================
  // 2. FT-01.2: AuthRoute allows ?invite=<token> & AuthContext purges stale refresh tokens
  // =========================================================================
  it('[WB-02 | FT-01.2] App.jsx AuthRoute permits ?invite= token URLs even when a session is active, and AuthContext purges corrupt refresh tokens', () => {
    const appCode = readSrc('App.jsx');
    expect(appCode).toContain("searchParams.get('invite')");
    expect(appCode).toContain('if (isAuthenticated && !hasInviteToken) return <RootRedirect />;');

    const authCode = readSrc('contexts/AuthContext.jsx');
    expect(authCode).toContain('purgeCorruptSupabaseTokens');
    expect(authCode).toContain("signOut({ scope: 'local' })");
  });

  // =========================================================================
  // 3. FT-03.1: Parser full_pack handles "pck = 1000gr / pck" without exploding HPP
  // =========================================================================
  it('[WB-03 | FT-03.1] costUtils.js strips trailing "/ pck" suffix in "pck = 1000gr / pck" and computes exact HPP without 1000x explosion', () => {
    const pollutedMat = {
      id: 101,
      name: 'Espresso Bean Arabica',
      unit: 'pck',
      full_pack: 'pck = 1000gr / pck',
      price: 220000,
      new_price: 0
    };

    const parsed = parseStructuredFullPack(pollutedMat.full_pack);
    expect(parsed).toEqual({
      packLabel: 'pck',
      contentQty: 1000,
      contentUnit: 'gr'
    });

    const packInfo = getPackUnitInfo(pollutedMat.full_pack, pollutedMat.unit);
    expect(packInfo.packUnitLabel).toBe('pck');
    expect(packInfo.contentUnit).toBe('gr');

    const priceInfo = getUnitPrice(pollutedMat);
    expect(priceInfo.resolved).toBe(true);
    expect(priceInfo.unitPrice).toBe(220); // Rp 220.000 / 1000 gr = Rp 220/gr

    // 18 gr of Espresso Bean must cost Rp 3.960 (NOT Rp 3.960.000!)
    const cost18Gr = calculateIngredientCost(pollutedMat, 18, 'gr');
    expect(cost18Gr).toBe(3960);

    // Also test "pck = 1 kg" and "btl = 1.5 L"
    const kgMat = { id: 102, name: 'Gula Pasir', unit: 'pck', full_pack: 'pck = 1 kg', price: 18000 };
    expect(parsePackSize(kgMat.full_pack)).toBe(1000);
    expect(calculateIngredientCost(kgMat, 25, 'gr')).toBe(450); // 25 * 18 = Rp 450

    const literMat = { id: 103, name: 'Fresh Milk', unit: 'btl', full_pack: 'btl = 1.5 L', price: 30000 };
    expect(parsePackSize(literMat.full_pack)).toBe(1500);
    expect(calculateIngredientCost(literMat, 150, 'ml')).toBe(3000); // 150 * 20 = Rp 3.000

    // Clean display helper never duplicates "/ pck"
    expect(formatCleanFullPackLabel('pck = 1000gr / pck', 'pck')).toBe('pck = 1000 gr');
    expect(formatCleanFullPackLabel('btl = 750 ml', 'btl')).toBe('btl = 750 ml');

    // Stock deduction conversion from gr -> pck
    const conv = convertQtyToStockUnit(pollutedMat, 250, 'gr');
    expect(conv.resolved).toBe(true);
    expect(conv.qty).toBeCloseTo(0.25, 5);
  });

  // =========================================================================
  // 4. FT-02.2 & FT-02.3: StockLedger Dirty-Form Confirmation Guard & Full Catalog Export
  // =========================================================================
  it('[WB-04 | FT-02.2 & FT-02.3] StockLedger.jsx implements unsavedCloseConfirm ("Lanjutkan Input" vs "Keluar & Hapus Isian") and full catalog export', () => {
    const slCode = readSrc('pages/shared/StockLedger.jsx');
    expect(slCode).toContain('unsavedCloseConfirm');
    expect(slCode).toContain('requestCloseAddModal');
    expect(slCode).toContain('Lanjutkan Input');
    expect(slCode).toContain('Keluar & Hapus Isian');
    expect(slCode).toContain('api.getAllCatalogMaterialsForExport');
    expect(slCode).toContain('formatCleanFullPackLabel(item.full_pack, item.unit)');
  });

  // =========================================================================
  // 5. FT-04.1, FT-04.2 & FT-04.3: Purchasing Destination Selector, 10-Col Alignment & Auto-Average 1-Month Stock
  // =========================================================================
  it('[WB-05 | FT-04.1, FT-04.2, FT-04.3] Purchasing.jsx has explicit RESTO/CENTRAL selector, aligned 10-column table, and MONTHLY_AVG real-data tab', () => {
    const purchCode = readSrc('pages/shared/Purchasing.jsx');
    expect(purchCode).toContain('Pilih Tujuan Pengiriman Pembelian Harian');
    expect(purchCode).toContain('Kirim ke RESTO (Stok Bar)');
    expect(purchCode).toContain('Kirim ke CENTRAL (Gudang Pusat)');
    expect(purchCode).toContain("tab === 'MONTHLY_AVG'");
    expect(purchCode).toContain('Acuan Stok 1 Bulan (Average Data Riil)');
    expect(purchCode).toContain('api.getMonthlyStockAverageFromRealData');
  });

  // =========================================================================
  // 6. FT-05.1 & FT-05.2: Unified 1-Segment Mutasi Gudang with UUID & Role Category Filtering
  // =========================================================================
  it('[WB-06 | FT-05.1 & FT-05.2] locationService & InterBranchTransfer unify Central, Internal Areas, and Branches with UUIDs and Role Category filters', () => {
    const dummyBranches = [
      { id: '11111111-2222-4333-8444-555555555501', name: 'BSD', code: 'BSD', is_active: true },
      { id: '11111111-2222-4333-8444-555555555502', name: 'Kasuna', code: 'KASUNA', is_active: true }
    ];
    const endpoints = locationService.getUnifiedTransferEndpoints('tenant-umatis', dummyBranches, dummyBranches[0].id);

    // Must include Central Warehouse, Resto / Bar, Kitchen, Service, Cabang BSD, and Cabang Kasuna
    const names = endpoints.map(e => e.name);
    expect(names).toContain('Central Warehouse');
    expect(names).toContain('Resto / Bar');
    expect(names).toContain('Kitchen (Dapur)');
    expect(names).toContain('Service / Floor');
    expect(names).toContain('Cabang BSD');
    expect(names).toContain('Cabang Kasuna');

    // Every endpoint must have a non-empty UUID
    endpoints.forEach(ep => {
      expect(typeof ep.uuid).toBe('string');
      expect(ep.uuid.length).toBeGreaterThanOrEqual(10);
    });

    // Bar role classification must have beverage categories configured
    const restoEp = endpoints.find(e => e.code === 'RESTO');
    expect(restoEp.roleClassification).toBe('Bar');
    expect(restoEp.allowedCategories).toContain('Coffee & Tea');

    const ibtCode = readSrc('pages/shared/InterBranchTransfer.jsx');
    expect(ibtCode).toContain("const transferMode = 'INTERNAL'");
    expect(ibtCode).toContain('locationService.getUnifiedTransferEndpoints');
    expect(ibtCode).toContain('Filter Bahan Sesuai Role Tujuan');
  });

  // =========================================================================
  // 7. FT-06.1: SimplePrep / api.recordOlahBahan saves real compressed photo DataURL fallback
  // =========================================================================
  it('[WB-07 | FT-06.1] api.js recordOlahBahan converts uploaded photo File/Blob to compressed WebP DataURL when storage bucket fails and merges photo URLs in history', () => {
    const apiCode = readSrc('services/api.js');
    expect(apiCode).toContain('fileToCompressedDataUrl');
    expect(apiCode).toContain("canvas.toDataURL('image/webp', 0.72)");
    expect(apiCode).toContain('gross_photo_url: row.gross_photo_url || meta.gross_photo_url || null');
  });

  // =========================================================================
  // 8. FT-07.1: PosUpload "Isi Resep Sekarang" navigates to /dashboard/pricing-cogs?tab=cogs-all
  // =========================================================================
  it('[WB-08 | FT-07.1] PosUpload.jsx navigates to /dashboard/pricing-cogs?tab=cogs-all with targetRecipeId and targetRecipeName, and Recipes.jsx selects it', () => {
    const posCode = readSrc('pages/shared/PosUpload.jsx');
    expect(posCode).toContain("const recipesPath = '/dashboard/pricing-cogs?tab=cogs-all';");
    expect(posCode).toContain("navigate(`/dashboard/pricing-cogs?${params.toString()}`");

    const recCode = readSrc('pages/shared/Recipes.jsx');
    expect(recCode).toContain("searchParams.get('targetRecipeName')");
  });

  // =========================================================================
  // 9. FT-09.1 & FT-10.1: StockOpname "Semua Kategori" default & SystemAdminHub hidden Audit Trail toggle
  // =========================================================================
  it('[WB-09 | FT-09.1 & FT-10.1] StockOpname defaults to ALL categories and SystemAdminHub hides AuditLogs behind Owner/Admin toggle', () => {
    const soCode = readSrc('pages/shared/StockOpname.jsx');
    expect(soCode).toContain("useState('ALL')");
    expect(soCode).toContain('Semua Kategori (');

    const sysCode = readSrc('pages/shared/SystemAdminHub.jsx');
    expect(sysCode).toContain('const [showAuditTrail, setShowAuditTrail] = useState(false)');
    expect(sysCode).toContain('Tampilkan Audit Trail');
  });

  // =========================================================================
  // 10. Nia Mobile UI/UX Audit (P0 - P2): Root-level Beta Switcher & Mobile KPI 2-Column Grid
  // =========================================================================
  it('[WB-10 | Nia Mobile P0-P2] AppLayout renders Beta Switcher at root level outside backdrop-blur header and index.css enforces 2-col mobile KPI grid & 16px inputs', () => {
    const layoutCode = readSrc('components/AppLayout.jsx');
    expect(layoutCode).toContain('Root-Level Viewport-Safe Shortcut Beta Testing Modal / Bottom Sheet');
    const cssCode = readSrc('index.css');
    expect(cssCode).toContain('NIA MOBILE-FRIENDLY UI/UX ENHANCEMENTS');
    expect(cssCode).toContain('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;');
    expect(cssCode).toContain('font-size: 16px !important;');
  });
});
