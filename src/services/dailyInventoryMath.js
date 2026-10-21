import { parsePackSize, parseStructuredFullPack } from './costUtils.js';

const normalizeUnit = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const unitScale = (unit) => {
  const normalized = normalizeUnit(unit);
  if (['g', 'gr', 'grm', 'gram', 'grams'].includes(normalized)) return 1;
  if (['kg', 'kilogram', 'kilograms'].includes(normalized)) return 1000;
  if (['ml', 'milliliter', 'millilitre'].includes(normalized)) return 1;
  if (['l', 'ltr', 'liter', 'litre', 'liters', 'litres'].includes(normalized)) return 1000;
  if (['pc', 'pcs', 'piece', 'pieces'].includes(normalized)) return 1;
  return null;
};

const parseLegacyPack = (fullPack) => {
  const text = String(fullPack || '').trim();
  const match = text.match(/([\d.]+)\s*(grm?|grams?|kg|ml|l|ltr|liters?|litres?|pcs?|pieces?)\b/i);
  if (!match) return null;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0
    ? { packLabel: null, contentQty: quantity, contentUnit: match[2] }
    : null;
};

export function calculateClosingStockQty(material, fullQty, brokenQty) {
  const full = Number(fullQty ?? 0);
  const broken = Number(brokenQty ?? 0);
  if (!Number.isFinite(full) || !Number.isFinite(broken) || full < 0 || broken < 0) {
    throw new Error(`Kuantitas fisik untuk ${material?.name || 'bahan'} harus berupa angka tidak negatif.`);
  }

  const trackedUnit = normalizeUnit(material?.unit);
  const structured = parseStructuredFullPack(material?.full_pack);
  const parsed = structured || parseLegacyPack(material?.full_pack);
  if (!parsed || !parsed.contentQty || !trackedUnit) {
    if (broken > 0) {
      throw new Error(`Konversi FULL/BROKEN untuk ${material?.name || 'bahan'} belum jelas. Perbarui Full Pack menjadi format "Kemasan = jumlah satuan dasar".`);
    }
    return full + broken;
  }

  const contentUnit = normalizeUnit(parsed.contentUnit);
  const packLabel = normalizeUnit(parsed.packLabel);
  const trackedScale = unitScale(trackedUnit);
  const contentScale = unitScale(contentUnit);

  if (structured && packLabel && trackedUnit === packLabel && trackedUnit !== contentUnit) {
    return full + (broken / parsed.contentQty);
  }

  if (trackedScale !== null && contentScale !== null) {
    const packQtyInTrackedUnits = parsed.contentQty * contentScale / trackedScale;
    const brokenInTrackedUnits = broken * contentScale / trackedScale;
    return full * packQtyInTrackedUnits + brokenInTrackedUnits;
  }

  if (trackedUnit === contentUnit || (structured && trackedUnit === packLabel && parsed.contentQty === 1)) {
    return full + broken;
  }

  if (!structured && parsed.contentQty > 0 && ['pack', 'pck', 'bottle', 'botol', 'carton', 'karton', 'dus', 'box', 'case'].includes(trackedUnit)) {
    return full + (broken / parsed.contentQty);
  }

  if (broken === 0 && parsePackSize(material?.full_pack) === 1) return full;
  throw new Error(`Satuan ${material?.unit || '-'} tidak dapat dikonversi dari ${material?.full_pack || 'Full Pack'} untuk ${material?.name || 'bahan'}. Periksa master satuan sebelum closing.`);
}

export function calculateDailyInventoryMetrics({ opening = 0, incoming = 0, netMovement = null, out = 0, productionUsage = 0, waste = 0, closing = 0 }) {
  const openingQty = Number(opening) || 0;
  const incomingQty = Number(incoming) || 0;
  const outQty = Number(out) || 0;
  const productionUsageQty = Number(productionUsage) || 0;
  const wasteQty = Number(waste) || 0;
  const closingQty = Number(closing) || 0;
  // Net movement contains non-consumption movement only; production input is a separate internal conversion.
  // Preserve the simple legacy fallback when the ledger does not provide movements.
  const netMovementQty = netMovement !== null && netMovement !== undefined && Number.isFinite(Number(netMovement))
    ? Number(netMovement) : incomingQty;
  // Production input is an internal conversion into semi-finished stock, not final consumption.
  const stockBasedUsage = openingQty + netMovementQty - closingQty - wasteQty - productionUsageQty;

  return {
    actualUsage: outQty,
    stockBasedUsage,
    expectedClosing: openingQty + netMovementQty - outQty - productionUsageQty - wasteQty,
    unexplainedVariance: closingQty - (openingQty + netMovementQty - outQty - productionUsageQty - wasteQty),
    usageVariance: stockBasedUsage - outQty
  };
}

/**
 * The IN field in Daily Inventory shows the total for the day. Purchasing/transfer
 * receipts are already included as sourceInQty; only the difference is saved as
 * a manual IN, so a user cannot accidentally duplicate source receipts.
 */
export function manualInDeltaFromTotal(totalInInput, sourceInQty = 0) {
  if (totalInInput === '' || totalInInput === null || totalInInput === undefined) return '';
  const total = Number(totalInInput);
  const source = Number(sourceInQty) || 0;
  if (!Number.isFinite(total) || !Number.isFinite(source)) return Number.NaN;
  return Number((total - source).toFixed(4));
}

export function getLocalDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


const normalizeUnitForBroken = (value) => normalizeUnit(value).replace(/[.]/g, '');

const getPackDetails = (material) => {
  const fullPack = String(material?.full_pack || '').trim();
  const parsed = parseStructuredFullPack(fullPack) || parseLegacyPack(fullPack);
  if (!parsed || !(Number(parsed.contentQty) > 0) || !parsed.contentUnit) return null;
  return {
    packLabel: normalizeUnitForBroken(parsed.packLabel),
    contentQty: Number(parsed.contentQty),
    contentUnit: normalizeUnitForBroken(parsed.contentUnit),
  };
};

const canonicalUnit = (value) => {
  const unit = normalizeUnitForBroken(value);
  if (['g', 'gr', 'grm', 'gram', 'grams'].includes(unit)) return { family: 'MASS', scale: 1, canonical: 'g' };
  if (['kg', 'kilogram', 'kilograms'].includes(unit)) return { family: 'MASS', scale: 1000, canonical: 'g' };
  if (['mg', 'milligram', 'milligrams'].includes(unit)) return { family: 'MASS', scale: 0.001, canonical: 'g' };
  if (['ml', 'milliliter', 'millilitre', 'milliliters', 'millilitres'].includes(unit)) return { family: 'VOLUME', scale: 1, canonical: 'ml' };
  if (['l', 'ltr', 'liter', 'litre', 'liters', 'litres'].includes(unit)) return { family: 'VOLUME', scale: 1000, canonical: 'ml' };
  if (['pc', 'pcs', 'piece', 'pieces', 'unit', 'units'].includes(unit)) return { family: 'COUNT', scale: 1, canonical: 'pcs' };
  return null;
};

const isPackageUnit = (value) => ['pack', 'pck', 'pck', 'bottle', 'btl', 'botol', 'carton', 'karton', 'dus', 'box', 'case', 'sachet', 'jar', 'can', 'cup', 'bag', '袋'].includes(normalizeUnitForBroken(value));

/**
 * Convert a quantity entered in `fromUnit` into the material's tracked stock unit.
 * For package-based material (e.g. stock unit=botol, full_pack="Botol = 1000 ml"),
 * 200 ml becomes 0.2 botol. This normalized quantity is what movements, stock
 * balances and WAC valuation use; the raw user input is kept separately for audit.
 */
export function convertQtyToStockUnit(material, quantity, fromUnit) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0) throw new Error(`Kuantitas untuk ${material?.name || 'material'} harus berupa angka tidak negatif.`);
  if (qty === 0) return 0;
  const from = normalizeUnitForBroken(fromUnit || material?.unit);
  const stock = normalizeUnitForBroken(material?.unit);
  if (!from || !stock) throw new Error(`Satuan OUT dan satuan stok untuk ${material?.name || 'material'} wajib diisi.`);
  if (from === stock) return qty;

  const fromDef = canonicalUnit(from);
  const stockDef = canonicalUnit(stock);
  if (fromDef && stockDef && fromDef.family === stockDef.family) {
    return qty * fromDef.scale / stockDef.scale;
  }

  const details = getPackDetails(material);
  if (details) {
    const contentDef = canonicalUnit(details.contentUnit);
    // Stock unit is a package (bottle/case) and input is the content unit (ml/g/pcs).
    const samePackageLabel = details.packLabel && (stock === details.packLabel || (isPackageUnit(stock) && isPackageUnit(details.packLabel)));
    if (samePackageLabel && fromDef && contentDef && fromDef.family === contentDef.family) {
      const contentInCanonical = details.contentQty * contentDef.scale;
      return qty * fromDef.scale / contentInCanonical;
    }

    // Stock unit is the base content unit while input is a package count.
    if (details.packLabel && (from === details.packLabel || (isPackageUnit(from) && isPackageUnit(details.packLabel))) && stockDef && contentDef && stockDef.family === contentDef.family) {
      return qty * details.contentQty * contentDef.scale / stockDef.scale;
    }

    // Legacy `full_pack="1000 ml"` with `unit="botol"` has no package label.
    if (!details.packLabel && isPackageUnit(stock) && fromDef && contentDef && fromDef.family === contentDef.family) {
      return qty * fromDef.scale / (details.contentQty * contentDef.scale);
    }
  }

  throw new Error(`Konversi satuan ${fromUnit || '-'} ke ${material?.unit || '-'} tidak tersedia untuk ${material?.name || 'material'}. Periksa Full Pack atau master konversi.`);
}

/** Unit shown beside the manually weighed BROKEN quantity (the pack content unit). */
export function getBrokenUnitLabel(material) {
  const details = getPackDetails(material);
  if (details?.contentUnit) return details.contentUnit;
  return material?.unit || '';
}

/** Whether a material is configured to require a partial/open-pack weigh-in at EOD. */
export function isBrokenTrackingEnabled(material) {
  if (typeof material?.broken_tracking_enabled === 'boolean') return material.broken_tracking_enabled;
  const details = getPackDetails(material);
  const contentDef = canonicalUnit(details?.contentUnit);
  return Boolean(details && contentDef && ['MASS', 'VOLUME', 'COUNT'].includes(contentDef.family));
}

/** Number of tracked stock units represented by one full package. */
export function getStockUnitsPerPack(material) {
  const details = getPackDetails(material);
  if (details) {
    try {
      return convertQtyToStockUnit(material, details.contentQty, details.contentUnit);
    } catch { /* fallback for unusual legacy package formats */ }
  }
  try {
    const result = calculateClosingStockQty(material, 1, 0);
    return Number.isFinite(result) && result > 0 ? result : 1;
  } catch {
    return 1;
  }
}

/** Infer FULL from book closing balance only; BROKEN is used solely for reconciliation. */
export function calculateInferredFullFromBroken(material, bookClosingQty, brokenQty, options = {}) {
  const tolerancePacks = Number(options.tolerancePacks ?? 0.005);
  const closing = Number(bookClosingQty);
  const broken = Number(brokenQty);
  if (!Number.isFinite(closing) || closing < -1e-8) {
    return { valid: false, fullQty: null, rawFullQty: null, brokenStockQty: null, physicalEquivalentQty: null, varianceQty: null, reason: 'Saldo stok akhir tidak valid.' };
  }

  // FULL is inferred from the book closing balance alone. In a no-movement day,
  // book closing is opening stock minus OUT. Valid IN/WASTE/transfer movements still
  // affect book closing so the inferred FULL and measured BROKEN can reconcile.
  // The weighed BROKEN value never affects the candidate FULL count.
  let packStockQty;
  try {
    packStockQty = getStockUnitsPerPack(material);
  } catch {
    packStockQty = null;
  }
  if (!Number.isFinite(packStockQty) || packStockQty <= 0) {
    return { valid: false, fullQty: null, rawFullQty: null, brokenStockQty: null, packStockQty: null, physicalEquivalentQty: null, varianceQty: null, reason: `Ukuran kemasan untuk ${material?.name || 'material'} belum valid.` };
  }
  const rawFullQty = closing / packStockQty;
  const fullQty = Math.max(0, Math.floor(rawFullQty + 1e-8));
  if (!Number.isFinite(broken) || broken < 0) {
    return { valid: false, fullQty, rawFullQty, brokenStockQty: null, packStockQty, physicalEquivalentQty: null, varianceQty: null, reason: 'Kuantitas BROKEN harus berupa angka tidak negatif.' };
  }

  let brokenStockQty;
  try {
    brokenStockQty = convertQtyToStockUnit(material, broken, getBrokenUnitLabel(material));
  } catch (error) {
    return { valid: false, fullQty, rawFullQty, brokenStockQty: null, packStockQty, physicalEquivalentQty: null, varianceQty: null, reason: error.message };
  }
  const physicalEquivalentQty = fullQty * packStockQty + brokenStockQty;
  const varianceQty = physicalEquivalentQty - closing;
  const toleranceQty = tolerancePacks * packStockQty;
  const brokenFitsOneOpenPack = brokenStockQty < packStockQty - 1e-8 || (brokenStockQty <= 1e-8 && closing <= 1e-8);
  const valid = brokenFitsOneOpenPack && Math.abs(varianceQty) <= toleranceQty;
  return {
    valid,
    fullQty,
    rawFullQty,
    brokenStockQty,
    packStockQty,
    physicalEquivalentQty,
    varianceQty: valid ? varianceQty : null,
    reason: valid ? null : (!brokenFitsOneOpenPack
      ? 'BROKEN harus kurang dari isi satu kemasan utuh; periksa satuan dan aturan satu lot terbuka.'
      : 'BROKEN hasil timbang tidak cocok dengan saldo akhir berdasarkan stok awal dan mutasi IN/OUT/WASTE. Periksa input dan penimbangan.'),
  };
}
