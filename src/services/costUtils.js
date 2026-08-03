// F&B bulk metric conversion utilities (single source of truth — avoids HPP divergence)
//
// BUG-FIX 2026-07 (root-cause audit): `material.price` is ALWAYS a per-PACK price
// (see UI label "Harga/Pack"). Every quantity that gets multiplied by `material.price`
// MUST first be converted through the pack size, or the result is inflated by the
// pack-size factor (typically 1000x for gr/ml packs). This file is now the ONLY place
// that is allowed to read `material.price`/`material.full_pack` and turn them into a
// per-base-unit price. All other call sites (DailyInventory, POS sync deduction,
// getCostControlReport, reportGenerator) must import `calculateIngredientCost` /
// `getUnitPrice` from here instead of doing `qty * material.price` inline.
//
// ponytail: extract more domain services from api.js when new code needs them

/**
 * Parse a pack-size string (e.g. "1000 gr", "1.5 L", "24 pcs") to a numeric value.
 * Returns the value in the smallest unit (gr for weight, ml for volume, pcs for count).
 * Returns 0 if it cannot be parsed with confidence (caller should treat this as an
 * error, not silently fall back to price-as-is — see getUnitPrice()).
 */
export function parsePackSize(fullPack) {
  if (!fullPack) return 0;
  fullPack = String(fullPack).toLowerCase().trim();

  let grMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:gr|grm|gram)\b/i);
  if (grMatch) return parseFloat(grMatch[1]);

  let mlMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  let lMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\b/i);
  if (lMatch) return parseFloat(lMatch[1]) * 1000.0;

  let kgMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000.0;

  let pcsMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pck|pack|btl|dus)\b/i);
  if (pcsMatch) return parseFloat(pcsMatch[1]);

  // No recognizable unit keyword — do NOT guess. Returning the bare leading number
  // here is exactly what caused the Ice Cube-style bugs ("1 pcs" being silently
  // accepted as packSize=1 for a gram-tracked item). Treat as unresolved instead.
  return 0;
}

/**
 * Returns true if `fullPack`'s parsed unit is dimensionally compatible with `unit`
 * (both weight/volume-ish in gr/ml, or both count-ish in pcs). Used to catch the
 * "unit says gr but Full Pack says 1 pcs" class of master-data error explicitly,
 * instead of silently producing a wrong number.
 */
export function isPackUnitConsistent(unit, fullPack) {
  const u = (unit || '').toLowerCase().trim();
  const fp = (fullPack || '').toLowerCase().trim();
  const weightVolUnits = ['gr', 'grm', 'gram', 'ml', 'kg', 'l', 'ltr', 'liter', 'litre'];
  const isWeightVolUnit = weightVolUnits.includes(u);
  if (!isWeightVolUnit) return true; // pcs/pck/watt/etc — no strong convention to check yet
  const hasWeightVolInFullPack = /(gr|grm|gram|ml|kg|l|ltr|liter|litre)\b/i.test(fp);
  return hasWeightVolInFullPack;
}

/**
 * Resolve the price-per-base-unit for a material, in this priority order:
 *  1. Explicit override from the `unit_conversions` table (unitConversionMap), if supplied.
 *     This is the recommended long-term fix per validationService.js's own design note —
 *     lets a human specify "1 pcs Ice Cube = 5000 gr" explicitly instead of relying on
 *     regex-parsing a free-text Full Pack string.
 *  2. Parsed `full_pack` string, only if dimensionally consistent with `material.unit`.
 *  3. Unresolvable -> returns { unitPrice: 0, resolved: false, reason } so callers can
 *     surface a warning instead of silently computing a wrong (or silently zero) cost.
 *
 * @param {object} material - material row (price, full_pack, unit, id)
 * @param {Map<number, number>=} unitConversionMap - optional Map<material_id, factor>
 *        where factor = how many base units (gr/ml/pcs) are in ONE pack, sourced from
 *        the `unit_conversions` table (from_unit = material.unit, to_unit = pack unit).
 */
export function getUnitPrice(material, unitConversionMap) {
  const price = parseFloat(material?.price ?? 0);

  if (unitConversionMap && material?.id != null && unitConversionMap.has(material.id)) {
    const factor = unitConversionMap.get(material.id);
    if (factor > 0) return { unitPrice: price / factor, resolved: true, source: 'unit_conversions' };
  }

  const packSize = parsePackSize(material?.full_pack);
  const consistent = isPackUnitConsistent(material?.unit, material?.full_pack);
  if (packSize > 0 && consistent) {
    return { unitPrice: price / packSize, resolved: true, source: 'full_pack' };
  }

  return {
    unitPrice: 0,
    resolved: false,
    source: 'unresolved',
    reason: !packSize
      ? `Full Pack "${material?.full_pack ?? ''}" pada bahan "${material?.name ?? material?.id}" tidak bisa dibaca (kosong/format tidak dikenali).`
      : `Full Pack "${material?.full_pack}" pada bahan "${material?.name ?? material?.id}" tidak cocok satuannya dengan Unit "${material?.unit}".`,
  };
}

/**
 * Total cost of using `qtyInUse` of `material` in a recipe/transaction, in the
 * material's base unit (should match recipeUnit — mismatches are now flagged via
 * isPackUnitConsistent above rather than silently ignored like the old `recipeUnit`
 * parameter used to be).
 */
export function calculateIngredientCost(material, qtyInUse, recipeUnit, unitConversionMap) {
  const { unitPrice, resolved, reason } = getUnitPrice(material, unitConversionMap);
  const qty = parseFloat(qtyInUse ?? 0);
  if (!resolved) {
    // Fail loud in dev, but never crash a report/import over one bad material —
    // return 0 and let the caller's validation layer (validationService.js) surface it.
    if (typeof console !== 'undefined' && reason) console.warn('[calculateIngredientCost]', reason);
    return 0;
  }
  return qty * unitPrice;
}

export const formatIDR = (value) => {
  const num = parseFloat(value);
  if (isNaN(num)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
};

export const calculatePhysicalUsage = (stockAwal, pembelian, stockAkhir) => {
  return (parseFloat(stockAwal || 0) + parseFloat(pembelian || 0)) - parseFloat(stockAkhir || 0);
};

export const calculateVariance = (posUsage, physicalUsage) => {
  return parseFloat(posUsage || 0) - parseFloat(physicalUsage || 0);
};

export const calculateHppPercentage = (totalPemakaian, totalPenjualan) => {
  const pemakaian = parseFloat(totalPemakaian || 0);
  const penjualan = parseFloat(totalPenjualan || 0);
  if (penjualan === 0) return 0;
  return (pemakaian / penjualan) * 100;
};
