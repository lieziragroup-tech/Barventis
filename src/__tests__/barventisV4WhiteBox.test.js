import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const readSrc = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf-8');

describe('Barventis v4.0 White-Box Hardening Verification (DEF-01 .. DEF-10)', () => {
  it('DEF-01: Invoicing.jsx & api.js meneruskan dan menyimpan harga bon fisik saat Goods Receipt', () => {
    const inv = readSrc('src/pages/shared/Invoicing.jsx');
    const api = readSrc('src/services/api.js');
    expect(inv).toContain('priceAdjustedOnReceipt: true');
    expect(api).toContain('actual_receipt_total: adjustedTotal');
    expect(api).toContain('price_adjusted_on_receipt: true');
  });

  it('DEF-02 & DEF-04: BeritaAcara, CostControlDual, ZeroWasteSplit, & PettyCash terhubung ke stakeholderV4Service', () => {
    expect(readSrc('src/pages/shared/BeritaAcaraMonthly.jsx')).toContain('beritaAcaraService.saveDocument');
    expect(readSrc('src/components/shared/CostControlDualComparison.jsx')).toContain('costControlAdjustmentService');
    expect(readSrc('src/components/shared/ZeroWasteSplitAndBarcode.jsx')).toContain('zeroWasteSplitService.executeAtomicSplit');
    expect(readSrc('src/components/shared/PurchasingMatrixAndPettyCash.jsx')).toContain('pettyCashService');
  });

  it('DEF-06: api.js revalidateProfile memuat kolom sub_role dan nip', () => {
    const api = readSrc('src/services/api.js');
    expect(api).toContain(".select('id, tenant_id, branch_id, name, email, role, sub_role, nip')");
  });

  it('DEF-07: Nol pemanggilan native alert() dan window.prompt() pada seluruh halaman operasional', () => {
    const pages = [
      'src/pages/shared/Invoicing.jsx',
      'src/pages/shared/StockLedger.jsx',
      'src/pages/shared/DailyInventory.jsx',
      'src/pages/shared/CostControl.jsx',
      'src/pages/shared/Purchasing.jsx',
      'src/pages/shared/Recipes.jsx'
    ];
    for (const rel of pages) {
      const txt = readSrc(rel);
      expect(txt).not.toMatch(/(?<![.\w])(?:window\.)?alert\(/);
      expect(txt).not.toMatch(/window\.prompt\(/);
    }
  });

  it('DEF-08, DEF-09, DEF-10: Modern Web Guidance & Anti-AI-Slop & Native <dialog> terpasang', () => {
    const css = readSrc('src/index.css');
    const html = readSrc('index.html');
    const dialog = readSrc('src/components/shared/AppDialog.jsx');
    expect(css).toContain('content-visibility: auto');
    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('min-height: 44px');
    expect(html).toContain('fetchpriority="high"');
    expect(dialog).toContain('<dialog');
  });
});
