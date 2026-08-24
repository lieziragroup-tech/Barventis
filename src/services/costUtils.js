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
// MANUAL UNIT CONVERSION (2026-08): materials.full_pack now supports a structured
// "PackLabel = Qty Unit" form (e.g. "Carton = 24 pcs"), editable via StockLedger.jsx's
// "Konversi Satuan" fields, on top of the free-text form ("1000 gr") it already
// supported. getPackUnitInfo() is the single place that reads which side is the
// purchase/pack unit vs. the recipe-facing content unit; calculateIngredientCost()
// and convertQtyToStockUnit() both use it so a recipe can express usage in EITHER
// unit ("1 Carton" or "24 pcs") and get the same cost / stock deduction either way.
// Because every call site already reads `full_pack`/`unit` off the material object
// it's handed (from getMaterials()/getRecipes(), which both select('*')), this reaches
// Recipe Builder, Cost Control, and Waste (Daily Inventory) with no other wiring.
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
  const str = String(fullPack).toLowerCase().trim();

  // 1. New structured format: "Carton = 24 pcs" or "Jerigen = 5000 ml"
  if (str.includes('=')) {
    const rightSide = str.split('=')[1].trim();
    const numMatch = rightSide.match(/^([\d.]+)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  // 2. Legacy fallback
  let grMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:gr|grm|gram)\b/);
  if (grMatch) return parseFloat(grMatch[1]);

  let mlMatch = str.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (mlMatch) return parseFloat(mlMatch[1]);

  let lMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\b/);
  if (lMatch) return parseFloat(lMatch[1]) * 1000.0;

  let kgMatch = str.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000.0;

  let pcsMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:pcs|pck|pack|btl|dus|carton|karton|ctn|drigen|jerigen|can|kaleng)\b/);
  if (pcsMatch) return parseFloat(pcsMatch[1]);

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
  
  if (fp.includes('=')) {
    return true; // We enforce consistency in the UI, so structured formats are always valid
  }

  const weightVolUnits = ['gr', 'grm', 'gram', 'ml', 'kg', 'l', 'ltr', 'liter', 'litre'];
  const isWeightVolUnit = weightVolUnits.includes(u);
  if (!isWeightVolUnit) return true; // pcs/pck/watt/etc — no strong convention to check yet
  const hasWeightVolInFullPack = /(gr|grm|gram|ml|kg|l|ltr|liter|litre)\b/i.test(fp);
  return hasWeightVolInFullPack;
}

const normalizeUnitToken = (u) => {
  let x = (u || '').toString().toLowerCase().trim();
  if (x === 'grm' || x === 'gram' || x === 'grams') x = 'gr';
  if (x === 'l' || x === 'liter' || x === 'ltr' || x === 'litre') x = 'ml';
  return x;
};

/**
 * MANUAL UNIT CONVERSION (2026-08): parse the structured "PackLabel = Qty Unit"
 * `full_pack` format (e.g. "Carton = 24 pcs") into its two sides, so callers can
 * tell apart the PURCHASE/pack-level unit ("Carton" — what `materials.unit` is
 * normally set to today) from the CONTENT/base unit recipes actually consume in
 * ("pcs"). Returns null when `fullPack` isn't in the structured form.
 */
export function parseStructuredFullPack(fullPack) {
  const str = String(fullPack || '').trim();
  if (!str.includes('=')) return null;
  const [left, right] = str.split('=');
  const packLabel = left.trim();
  const rightTrim = right.trim();
  const m = rightTrim.match(/^([\d.]+)\s*(\D+)?/);
  if (!m) return null;
  const contentQty = parseFloat(m[1]);
  if (isNaN(contentQty) || contentQty <= 0) return null;
  return { packLabel, contentQty, contentUnit: m[2] ? m[2].trim() : '' };
}

/**
 * MANUAL UNIT CONVERSION (2026-08): resolve, for any material, which unit
 * label is the PACK-level one (what "materials.unit" holds, e.g. "Carton")
 * and which is the CONTENT/base unit recipes should be able to enter usage
 * quantities in (e.g. "pcs") — read from the structured `full_pack` format
 * above when present ("Carton = 24 pcs" -> pack "carton", content "pcs").
 * Falls back to `materialUnit` for both when `full_pack` is the older
 * free-text form ("1000 gr") — matching the app's existing single-unit
 * behavior exactly, so nothing regresses for materials not yet re-entered
 * with the structured format. This is the ONE place that decides what a
 * material's "1 Carton = X pcs"-style conversion means — StockLedger.jsx's
 * Konversi Satuan fields and Recipes.jsx's ingredient-unit dropdown both
 * read it from here so they never disagree.
 */
export function getPackUnitInfo(fullPack, materialUnit) {
  const structured = parseStructuredFullPack(fullPack);
  if (structured) {
    return {
      packUnitLabel: normalizeUnitToken(structured.packLabel) || normalizeUnitToken(materialUnit),
      contentUnit: normalizeUnitToken(structured.contentUnit) || normalizeUnitToken(materialUnit)
    };
  }
  const u = normalizeUnitToken(materialUnit);
  return { packUnitLabel: u, contentUnit: u };
}

/**
 * Resolve the price-per-CONTENT-unit for a material, in this priority order:
 *  1. Explicit override from the `unit_conversions` table (unitConversionMap), if supplied.
 *     Kept for callers/tests that already build this map directly; the manual
 *     conversion UI added 2026-08 (StockLedger.jsx "Konversi Satuan") instead writes
 *     the structured `full_pack` format below, since that already reaches every
 *     call site in the app without any extra plumbing.
 *  2. Parsed `full_pack` string (structured "PackLabel = Qty Unit" preferred, legacy
 *     free-text as fallback), only if dimensionally consistent with `material.unit`.
 *  3. Unresolvable -> returns { unitPrice: 0, resolved: false, reason } so callers can
 *     surface a warning instead of silently computing a wrong (or silently zero) cost.
 *
 * @param {object} material - material row (price, full_pack, unit, id)
 * @param {Map<number, number>=} unitConversionMap - optional Map<material_id, factor>
 *        where factor = how many content units are in ONE pack.
 */
export function getUnitPrice(material, unitConversionMap) {
  const price = parseFloat(material?.price ?? 0);

  if (unitConversionMap && material?.id != null && unitConversionMap.has(material.id)) {
    const factor = unitConversionMap.get(material.id);
    if (factor > 0) {
      return {
        unitPrice: price / factor,
        resolved: true,
        source: 'unit_conversions',
        packSize: factor,
        packUnitLabel: normalizeUnitToken(material?.unit),
        contentUnit: null // unknown from a bare factor — pack-vs-content scaling stays off for this path
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

/**
 * Total cost of using `qtyInUse` of `material` in a recipe/transaction.
 *
 * MANUAL UNIT CONVERSION (2026-08): `recipeUnit` used to be accepted but never
 * actually used — `qtyInUse` was always assumed to already be in the material's
 * CONTENT unit, so picking the PACK-level unit in the ingredient dropdown (e.g.
 * "Carton" instead of "pcs") silently produced a cost far too low. Now, when
 * `recipeUnit` matches the material's pack-level label (from getPackUnitInfo,
 * e.g. materials.full_pack = "Carton = 24 pcs"), qty is scaled up by the pack
 * size first, so "1 Carton" and "24 pcs" of the same ingredient cost the same.
 */
export function calculateIngredientCost(material, qtyInUse, recipeUnit, unitConversionMap) {
  const { unitPrice, resolved, packSize, packUnitLabel, contentUnit } = getUnitPrice(material, unitConversionMap);
  let qty = parseFloat(qtyInUse ?? 0);
  if (!resolved) {
    // Never crash a report/import over one bad material — return 0. The
    // human-readable reason is available via getUnitPrice() directly for
    // callers that want it; validationService.js's validateMaterialPricing()
    // is the place that actually surfaces this to the user (BaristaReport.jsx's
    // "Data Quality Validation" panel), so this silent 0 is no longer a dead end.
    return 0;
  }
  const ru = (recipeUnit || '').toString().toLowerCase().trim();
  if (packUnitLabel && contentUnit && ru && ru === packUnitLabel && ru !== contentUnit) {
    qty = qty * (packSize || 1);
  }
  return qty * unitPrice;
}

/**
 * MANUAL UNIT CONVERSION (2026-08): convert a usage quantity expressed in
 * `fromUnit` into the unit `material`'s own stock quantity (qty_resto /
 * qty_central) is tracked in — needed when DEDUCTING physical stock (as
 * opposed to calculateIngredientCost(), which only needs a price). Generalizes
 * the old hardcoded "gr/ml usage against a kg/l-tracked material -> divide by
 * 1000" special case (previously duplicated ad-hoc in api.js processPosCheckout)
 * to also cover the new pack/content conversion (e.g. "pcs" usage against a
 * "Carton"-tracked material via full_pack "Carton = 24 pcs" -> divide by 24).
 * Returns `{ qty, resolved }`; `resolved:false` means the units couldn't be
 * related, so the caller should fall back to deducting the raw qty as-is.
 */
export function convertQtyToStockUnit(material, qty, fromUnit) {
  const q = parseFloat(qty ?? 0);
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

// ═══════════════════════════════════════════════════════════════════
// RECIPE PRICING ENGINE (merged from barventis-vercel-repo)
// Formula: Subtotal -> Fix Cost (per-recipe %) -> Basic Cost ->
// Selling Price (raw, from target Food Cost %) -> rounded -> + manual
// adjustment -> Selling Price (final) -> actual Food Cost % at that price.
// This file is the single source of truth for the whole formula — every
// place that computes a recipe's Fix Cost/Basic Cost/Selling Price
// (Recipes.jsx, api.js createRecipe/updateRecipe/bulkImportRecipes/
// recalcAllRecipeCosts, reportGenerator.js) must call this instead of
// re-deriving the formula inline.
// ═══════════════════════════════════════════════════════════════════

export const DEFAULT_FIX_COST_PCT = 0.05;
export const DEFAULT_ROUNDING_DIRECTION = 'down';
// Whole-rupiah rounding by default (increment=1) — NOT a fixed 500/1000/2000
// bucket. The increment is still configurable per-recipe for anyone who does
// want bucketed pricing, but nothing forces it anymore.
export const DEFAULT_ROUNDING_INCREMENT = 1;
export const DEFAULT_PRICE_ADJUSTMENT = 0;

/**
 * Round a raw selling price to the nearest `increment`, in the given
 * `direction` ('up' or 'down'). With the default increment of 1, this is
 * just "round to the nearest whole rupiah" (no decimals).
 * roundSellingPrice(39361.45, 'down', 2000) === 38000.
 */
export function roundSellingPrice(rawPrice, direction = DEFAULT_ROUNDING_DIRECTION, increment = DEFAULT_ROUNDING_INCREMENT) {
  const price = parseFloat(rawPrice || 0);
  const inc = parseFloat(increment || DEFAULT_ROUNDING_INCREMENT);
  if (inc <= 0) return Math.round(price);
  const steps = price / inc;
  const roundedSteps = direction === 'up' ? Math.ceil(steps) : Math.floor(steps);
  return roundedSteps * inc;
}

/**
 * Full recipe cost/pricing computation:
 *   Subtotal -> Fix Cost -> Basic Cost -> Selling Price (raw) ->
 *   Selling Price (rounded) -> + Penyesuaian Manual -> Selling Price (final)
 *   -> Food Cost % Aktual (basic_cost / Selling Price final)
 *
 * @param {object} params
 * @param {number} params.subtotal - SUM(Amount) of all ingredients
 * @param {number} params.fixCostPct - defaults to DEFAULT_FIX_COST_PCT (5%)
 * @param {number} params.foodCostPct - target Food Cost % (pass 0 explicitly
 *        if not set yet; sellingPriceRaw will come back 0)
 * @param {string} params.roundingDirection - 'up' | 'down', defaults to 'down'
 * @param {number} params.roundingIncrement - defaults to 1 (nearest whole rupiah)
 * @param {number} params.priceAdjustment - optional manual Rp nudge (+/-)
 *        applied after rounding, defaults to 0.
 */
export function computeRecipeCosts({
  subtotal,
  fixCostPct = DEFAULT_FIX_COST_PCT,
  foodCostPct = 0,
  roundingDirection = DEFAULT_ROUNDING_DIRECTION,
  roundingIncrement = DEFAULT_ROUNDING_INCREMENT,
  priceAdjustment = DEFAULT_PRICE_ADJUSTMENT,
}) {
  const sub = parseFloat(subtotal || 0);
  const fcPct = parseFloat(fixCostPct ?? DEFAULT_FIX_COST_PCT);
  const targetPct = parseFloat(foodCostPct || 0);
  const adjustment = parseFloat(priceAdjustment || 0);

  const fixCost = sub * fcPct;
  const basicCost = sub + fixCost;
  const sellingPriceRaw = targetPct > 0 ? basicCost / targetPct : 0;
  const sellingPriceRounded = sellingPriceRaw > 0
    ? roundSellingPrice(sellingPriceRaw, roundingDirection, roundingIncrement)
    : 0;
  const sellingPriceFinal = sellingPriceRounded > 0 ? sellingPriceRounded + adjustment : 0;
  // Reality-check ratio using the price actually charged (post-adjustment),
  // not the pre-adjustment target.
  const actualFoodCostPctAtFinalPrice = sellingPriceFinal > 0 ? basicCost / sellingPriceFinal : 0;

  return {
    subtotal: sub, fixCost, basicCost, sellingPriceRaw,
    sellingPriceRounded, sellingPriceFinal, actualFoodCostPctAtFinalPrice
  };
}
