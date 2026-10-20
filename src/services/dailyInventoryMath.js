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

export function getLocalDateISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
