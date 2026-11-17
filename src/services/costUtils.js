// F&B bulk metric conversion utilities (single source of truth — avoids HPP divergence)
//
// BUG-FIX 2026-11 (FT-03.1 Root-Cause Fix):
// 1. Strip trailing "/ <packUnit>" suffixes (e.g. "pck = 1000gr / pck" or "1000 gr / pck")
//    so `parseStructuredFullPack` and `normalizeUnitToken` always resolve the clean base
//    unit ('gr', 'ml', 'pcs') instead of "gr / pck".
// 2. When a structured full_pack uses "kg" or "L/liter" on the right-hand side with a small
//    multiplier (e.g. "pck = 1 kg" or "btl = 1.5 L"), convert to 1000 gr / 1500 ml consistently
//    with `normalizeUnitToken` so unitPrice never inflates 1000x.

export const normalizeUnitToken = (u) => {
  let x = (u || '').toString().toLowerCase().trim();
  if (x.includes('/')) {
    x = x.split('/')[0].trim();
  }
  if (x === 'grm' || x === 'gram' || x === 'grams' || x === 'g') x = 'gr';
  if (x === 'l' || x === 'liter' || x === 'ltr' || x === 'litre') x = 'ml';
  if (x === 'pack' || x === 'pak') x = 'pck';
  if (x === 'botol' || x === 'bottle') x = 'btl';
  if (x === 'karton' || x === 'ctn' || x === 'crtn' || x === 'dus' || x === 'box') x = 'carton';
  return x;
};

// Satuan dasar takaran — gr dan ml adalah SETARA secara F&B (air 1 ml ≈ 1 gr).
const BASE_WEIGHT_VOL_UNITS = new Set(['gr', 'ml']);

// Satuan kemasan beli — hanya ini yang boleh memicu perkalian packSize.
const PACKAGE_CONTAINER_UNITS = new Set([
  'pck', 'pack', 'pak', 'btl', 'botol', 'bottle', 'carton', 'karton', 'crtn', 'ctn',
  'dus', 'box', 'kaleng', 'can', 'galon', 'jerigen', 'drigen', 'sachet', 'jar',
]);

/**
 * Parse a pack-size string (e.g. "1000 gr", "1.5 L", "24 pcs", "pck = 1000gr / pck")
 * to a numeric value in the base content unit (gr, ml, or pcs).
 */
export function parsePackSize(fullPack) {
  if (!fullPack) return 0;
  // Strip any trailing "/ pck" display suffix first
  const cleanStr = String(fullPack).replace(/\/.*$/, '').toLowerCase().trim();

  // 1. Structured format: "Carton = 24 pcs", "pck = 1000gr", "btl = 1.5 L"
  if (cleanStr.includes('=')) {
    const rightSide = cleanStr.split('=')[1].trim();
    const m = rightSide.match(/^([\d.]+)\s*([a-zA-Z]+)?/);
    if (m) {
      const num = parseFloat(m[1]);
      const rawUnit = (m[2] || '').toLowerCase().trim();
      if (!isNaN(num) && num > 0) {
        if (['kg', 'kilogram'].includes(rawUnit) && num <= 50) return num * 1000;
        if (['l', 'ltr', 'liter', 'litre'].includes(rawUnit) && num <= 50) return num * 1000;
        return num;
      }
    }
  }

  // 2. Legacy / free-text fallback
  let grMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*(?:gr|grm|gram|grams|g)\b/);
  if (grMatch) return parseFloat(grMatch[1]);

  let mlMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (mlMatch) return parseFloat(mlMatch[1]);

  let lMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\b/);
  if (lMatch) return parseFloat(lMatch[1]) * 1000.0;

  let kgMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000.0;

  let pcsMatch = cleanStr.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pck|pack|btl|dus|carton|karton|ctn|drigen|jerigen|can|kaleng)\b/);
  if (pcsMatch) return parseFloat(pcsMatch[1]);

  return 0;
}

/**
 * Returns true if `fullPack`'s parsed unit is dimensionally compatible with `unit`.
 */
export function isPackUnitConsistent(unit, fullPack) {
  const u = (unit || '').toLowerCase().trim();
  const fp = String(fullPack || '').replace(/\/.*$/, '').toLowerCase().trim();

  if (!fp) return false;

  if (fp.includes('=')) {
    return parsePackSize(fp) > 0;
  }

  const weightVolUnits = ['gr', 'grm', 'gram', 'grams', 'g', 'ml', 'kg', 'l', 'ltr', 'liter', 'litre'];
  const containerUnits = ['pcs', 'pck', 'pack', 'pak', 'btl', 'botol', 'bottle', 'carton', 'karton', 'crtn', 'ctn', 'dus', 'box', 'kaleng', 'can', 'galon', 'jerigen', 'drigen', 'sachet', 'jar'];

  const isWeightVolUnit = weightVolUnits.includes(u);
  const isContainerUnit = containerUnits.includes(u);

  const hasWeightVolInFullPack = /(?<![a-z])(gr|grm|gram|grams|g|ml|kg|ltr|liter|litre)\b/i.test(fp)
    || /\bl\b/i.test(fp);
  const hasCountInFullPack = /(pcs|pck|pack|btl|carton|karton|ctn|dus|box|kaleng|can)\b/i.test(fp);

  if (isWeightVolUnit) {
    return hasWeightVolInFullPack;
  }

  if (isContainerUnit) {
    return hasWeightVolInFullPack || hasCountInFullPack;
  }

  return /\d/.test(fp);
}

/**
 * Parse the structured "PackLabel = Qty Unit" `full_pack` format (including when
 * polluted with a trailing "/ pck" suffix like "pck = 1000gr / pck").
 */
export function parseStructuredFullPack(fullPack) {
  const str = String(fullPack || '').trim();
  if (!str.includes('=')) return null;
  const [left, right] = str.split('=');
  const packLabel = left.replace(/\/.*$/, '').trim();
  const rightClean = right.replace(/\/.*$/, '').trim();
  const m = rightClean.match(/^([\d.]+)\s*([a-zA-Z]+)?/);
  if (!m) return null;
  let contentQty = parseFloat(m[1]);
  if (isNaN(contentQty) || contentQty <= 0) return null;
  const rawUnit = m[2] ? m[2].trim().toLowerCase() : '';
  let contentUnit = normalizeUnitToken(rawUnit);
  if (['kg', 'kilogram'].includes(rawUnit)) {
    if (contentQty <= 50) contentQty = contentQty * 1000;
    contentUnit = 'gr';
  } else if (['l', 'ltr', 'liter', 'litre'].includes(rawUnit)) {
    if (contentQty <= 50) contentQty = contentQty * 1000;
    contentUnit = 'ml';
  }
  return { packLabel, contentQty, contentUnit };
}

/**
 * Format full_pack cleanly for display without duplicating "/ unit" when already structured.
 */
export function formatCleanFullPackLabel(fullPack, materialUnit) {
  const fp = String(fullPack || '').replace(/\/.*$/, '').trim();
  const u = String(materialUnit || 'pck').trim();
  const structured = parseStructuredFullPack(fp);
  if (structured) {
    return `${structured.packLabel || u} = ${structured.contentQty} ${structured.contentUnit || 'gr'}`;
  }
  if (!fp) return u;
  return `${fp} / ${u}`;
}

export function getPackUnitInfo(fullPack, materialUnit) {
  const structured = parseStructuredFullPack(fullPack);
  if (structured) {
    return {
      packUnitLabel: normalizeUnitToken(structured.packLabel) || normalizeUnitToken(materialUnit),
      contentUnit: normalizeUnitToken(structured.contentUnit) || normalizeUnitToken(materialUnit)
    };
  }
  const normMatUnit = normalizeUnitToken(materialUnit);
  const legacy = String(fullPack || '').replace(/\/.*$/, '').trim();
  const match = legacy.match(/([\d.]+)\s*(gr|grm|gram|grams|g|kg|ml|l|ltr|liter|litre|pcs|pck|can|btl)\b/i);
  if (match) {
    const rawMatched = match[2].toLowerCase();
    const parsedContentUnit = rawMatched === 'kg' ? 'gr' : normalizeUnitToken(rawMatched);
    if (BASE_WEIGHT_VOL_UNITS.has(normMatUnit) && BASE_WEIGHT_VOL_UNITS.has(parsedContentUnit)) {
      return { packUnitLabel: parsedContentUnit, contentUnit: parsedContentUnit };
    }
    return { packUnitLabel: normMatUnit, contentUnit: parsedContentUnit };
  }
  return { packUnitLabel: normMatUnit, contentUnit: normMatUnit };
}

export function resolvePackInfo(fullPack, materialUnit) {
  const size = parsePackSize(fullPack);
  const consistent = isPackUnitConsistent(materialUnit, fullPack);
  const { contentUnit } = getPackUnitInfo(fullPack, materialUnit);
  return { size: size > 0 && consistent ? size : 0, unit: contentUnit, consistent };
}

export function getUnitPrice(material, unitConversionMap) {
  const price = Number(material?.new_price) > 0
    ? Number(material.new_price)
    : Number(material?.price ?? 0);

  if (unitConversionMap && material?.id != null && unitConversionMap.has(material.id)) {
    const rawFactor = Number(unitConversionMap.get(material.id));
    if (rawFactor > 0) {
      // Auto-guard: jika database menyimpan faktor konversi terbalik (1 / packSize, misal 0.001 untuk 1000 gr),
      // balikkan kembali menjadi packSize (1000) agar harga tidak membengkak.
      const factor = rawFactor < 1 ? Math.round(1 / rawFactor) : rawFactor;
      const { packUnitLabel, contentUnit } = getPackUnitInfo(material?.full_pack, material?.unit);
      return {
        unitPrice: price / factor,
        resolved: true,
        source: 'unit_conversions',
        packSize: factor,
        packUnitLabel: packUnitLabel || normalizeUnitToken(material?.unit),
        contentUnit: contentUnit || null
      };
    }
  }

  const packSize = parsePackSize(material?.full_pack);
  const consistent = isPackUnitConsistent(material?.unit, material?.full_pack);
  if (packSize > 0 && consistent) {
    const { packUnitLabel, contentUnit } = getPackUnitInfo(material?.full_pack, material?.unit);
    return { unitPrice: price / packSize, resolved: true, source: 'full_pack', packSize, packUnitLabel, contentUnit };
  }

  return {
    unitPrice: 0,
    resolved: false,
    source: 'unresolved',
    packSize: 0,
    reason: !packSize
      ? `Full Pack "${material?.full_pack ?? ''}" pada bahan "${material?.name ?? material?.id}" tidak bisa dibaca (kosong/format tidak dikenali).`
      : `Full Pack "${material?.full_pack}" pada bahan "${material?.name ?? material?.id}" tidak cocok satuannya dengan Unit "${material?.unit}".`,
  };
}

export function calculateIngredientCost(material, qtyInUse, recipeUnit, unitConversionMap) {
  const { unitPrice, resolved, packSize, packUnitLabel, contentUnit } = getUnitPrice(material, unitConversionMap);
  let qty = Number(qtyInUse ?? 0);
  if (!resolved) {
    return 0;
  }
  const ru = normalizeUnitToken(recipeUnit);
  const isRuContainer =
    PACKAGE_CONTAINER_UNITS.has(ru) ||
    (ru === 'pcs' && BASE_WEIGHT_VOL_UNITS.has(contentUnit));
  if (packUnitLabel && contentUnit && ru && ru === packUnitLabel && ru !== contentUnit && isRuContainer) {
    qty = qty * (packSize || 1);
  }
  return Math.round(qty * unitPrice);
}

export function convertQtyToStockUnit(material, qty, fromUnit) {
  const q = Number(qty ?? 0);
  const from = normalizeUnitToken(fromUnit);
  const matUnit = normalizeUnitToken(material?.unit);
  if (!from || from === matUnit) return { qty: q, resolved: true };

  const { packUnitLabel, contentUnit } = getPackUnitInfo(material?.full_pack, material?.unit);
  const packSize = parsePackSize(material?.full_pack);
  if (packSize > 0 && contentUnit && packUnitLabel && from === contentUnit && matUnit === packUnitLabel) {
    return { qty: q / packSize, resolved: true };
  }

  const isFromGramMl = ['gr', 'ml'].includes(from);
  const isMatKgL = ['kg', 'l'].includes(matUnit) || ['kg', 'liter', 'ltr'].includes((material?.unit || '').toLowerCase().trim());
  if (isFromGramMl && isMatKgL) return { qty: q / 1000, resolved: true };

  return { qty: q, resolved: false };
}

export const formatIDR = (value) => {
  const num = Math.round(Number(value) || 0);
  if (isNaN(num)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
};

export const calculatePhysicalUsage = (stockAwal, pembelian, stockAkhir) => {
  return Math.round((Number(stockAwal || 0) + Number(pembelian || 0)) - Number(stockAkhir || 0));
};

export const calculateVariance = (posUsage, physicalUsage) => {
  return Math.round(Number(posUsage || 0) - Number(physicalUsage || 0));
};

export const calculateHppPercentage = (totalPemakaian, totalPenjualan) => {
  const pemakaian = Number(totalPemakaian || 0);
  const penjualan = Number(totalPenjualan || 0);
  if (penjualan === 0) return 0;
  return (pemakaian / penjualan) * 100;
};

// ═══════════════════════════════════════════════════════════════════
// RECIPE PRICING ENGINE
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_FIX_COST_PCT = 0.05;
export const DEFAULT_ROUNDING_DIRECTION = 'down';
export const DEFAULT_ROUNDING_INCREMENT = 1;
export const DEFAULT_PRICE_ADJUSTMENT = 0;

export function roundSellingPrice(rawPrice, direction = DEFAULT_ROUNDING_DIRECTION, increment = DEFAULT_ROUNDING_INCREMENT) {
  const raw = Number(rawPrice) || 0;
  if (raw <= 0) return 0;
  const inc = Number(increment);
  if (!inc || inc <= 0) return Math.round(raw);
  if (direction === 'up') return Math.ceil(raw / inc) * inc;
  if (direction === 'nearest') return Math.round(raw / inc) * inc;
  return Math.floor(raw / inc) * inc;
}

export function computeRecipeCosts({
  subtotal = 0,
  fixCostPct = DEFAULT_FIX_COST_PCT,
  targetFoodCostPct = 0,
  foodCostPct = 0,
  roundingDirection = DEFAULT_ROUNDING_DIRECTION,
  roundingIncrement = DEFAULT_ROUNDING_INCREMENT,
  priceAdjustment = DEFAULT_PRICE_ADJUSTMENT,
} = {}) {
  const sub = Math.max(0, Math.round(Number(subtotal) || 0));
  const fcPct = Math.max(0, Number(fixCostPct) || 0);
  const fixCost = Math.round(sub * fcPct);
  const basicCost = sub + fixCost;

  const targetPct = Number(targetFoodCostPct || foodCostPct) || 0;
  const rawSellingPrice = targetPct > 0 && basicCost > 0 ? basicCost / targetPct : 0;
  const roundedSellingPrice = rawSellingPrice > 0
    ? roundSellingPrice(rawSellingPrice, roundingDirection, roundingIncrement)
    : 0;
  const adj = Math.round(Number(priceAdjustment) || 0);
  const sellingPrice = roundedSellingPrice > 0 ? Math.max(0, roundedSellingPrice + adj) : 0;
  const actualFoodCostPct = sellingPrice > 0 ? basicCost / sellingPrice : 0;

  return {
    subtotal: sub,
    fixCost,
    basicCost,
    rawSellingPrice,
    sellingPriceRaw: rawSellingPrice,
    roundedSellingPrice,
    sellingPrice,
    sellingPriceFinal: sellingPrice,
    actualFoodCostPct,
  };
}
