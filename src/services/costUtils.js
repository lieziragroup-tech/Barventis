// F&B bulk metric conversion utilities (single source of truth — avoids HPP divergence)
// ponytail: extract more domain services from api.js when new code needs them

/**
 * Parse a pack-size string (e.g. "1000 gr", "1.5 L", "24 pcs") to a numeric value.
 * Returns the value in the smallest unit (gr for weight, ml for volume, pcs for count).
 */
export function parsePackSize(fullPack) {
  if (!fullPack) return 0;
  fullPack = fullPack.toLowerCase().trim();

  // Match: "1000 gr", "1000 grm", "1000 gram", "250.5 gr"
  let grMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:gr|grm|gram)\b/i);
  if (grMatch) return parseFloat(grMatch[1]);

  // Match: "1000 ml", "500 ml", "750 ml"
  let mlMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  // Match: "1 L", "1.5 liter", "19 L" -> convert to ml
  let lMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\b/i);
  if (lMatch) return parseFloat(lMatch[1]) * 1000.0;

  // Match: "24 pcs", "6 pcs", "12 pcs"
  let pcsMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*pcs\b/i);
  if (pcsMatch) return parseFloat(pcsMatch[1]);

  // Match: "1 kg", "2.5 kg" -> convert to gram
  let kgMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000.0;

  return 0;
}

/**
 * Calculate ingredient cost with automatic unit conversion.
 * If recipe unit matches pack unit, uses price directly.
 * Otherwise converts via full_pack size.
 */
export function calculateIngredientCost(material, qtyInUse, recipeUnit) {
  const price = parseFloat(material.new_price ?? material.price ?? 0);
  const packUnit = (material.unit || '').toLowerCase().trim();
  recipeUnit = (recipeUnit || '').toLowerCase().trim();

  if (recipeUnit === packUnit) {
    return qtyInUse * price;
  }

  const packSize = parsePackSize(material.full_pack);
  return packSize > 0 ? qtyInUse * (price / packSize) : qtyInUse * price;
}
