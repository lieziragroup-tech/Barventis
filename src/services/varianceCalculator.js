// ═══════════════════════════════════════════════════════════════════
// varianceCalculator.js
//
// Implementasi formula §B.5 dari dokumen reverse-engineering:
//   Variance_i = ActualUsage_i - TheoreticalUsage_i
//
// TheoreticalUsage_i  = SUM(expected_usage.expected_qty) per material,
//                       periode berjalan (ditulis oleh processPOSSync
//                       saat upload Daily Sales Menu Report).
// ActualUsage_i       = SUM(daily_inventory_items.terpakai_qty) per
//                       material, periode berjalan (OUT + WASTE, hasil
//                       input fisik harian staff).
//
// Ini pure function (tidak ada network call) supaya gampang dites dan
// dipakai ulang dari mana saja: halaman Cost Control, endpoint
// GET /variance, atau proses generate SO Barista.
// ═══════════════════════════════════════════════════════════════════
import { calculateIngredientCost } from './costUtils';

/**
 * @param {Array} expectedUsageRows  - baris dari tabel expected_usage
 *   (period berjalan), bentuk: [{ material_id, expected_qty, total_sold }]
 * @param {Array} dailyInventories   - daily_inventories + daily_inventory_items
 *   (period berjalan), bentuk: [{ date, daily_inventory_items: [{ material_id, terpakai_qty }] }]
 * @param {Array} materials          - master materials [{ id, name, price, unit }]
 * @returns {Array} variance per material, diurutkan dari variance value
 *   absolut terbesar (paling perlu diperhatikan duluan)
 */
export function calculateUsageVariance(expectedUsageRows, dailyInventories, materials) {
  const materialMap = new Map((materials || []).map(m => [m.id, m]));

  const theoretical = new Map(); // material_id -> qty
  for (const row of expectedUsageRows || []) {
    theoretical.set(row.material_id, (theoretical.get(row.material_id) || 0) + Number(row.expected_qty || 0));
  }

  const actual = new Map(); // material_id -> qty
  for (const inv of dailyInventories || []) {
    for (const item of inv.daily_inventory_items || []) {
      const qty = Number(item.terpakai_qty || 0);
      actual.set(item.material_id, (actual.get(item.material_id) || 0) + qty);
    }
  }

  const allMaterialIds = new Set([...theoretical.keys(), ...actual.keys()]);
  const result = [];

  for (const matId of allMaterialIds) {
    const material = materialMap.get(matId);
    const theoreticalQty = theoretical.get(matId) || 0;
    const actualQty = actual.get(matId) || 0;
    const varianceQty = actualQty - theoreticalQty;

    result.push({
      material_id: matId,
      material_name: material?.name || `(material #${matId} tidak ditemukan)`,
      unit: material?.unit || '',
      theoretical_qty: round2(theoreticalQty),
      actual_qty: round2(actualQty),
      variance_qty: round2(varianceQty),
      variance_pct: theoreticalQty > 0 ? round2((varianceQty / theoreticalQty) * 100) : null,
      // BUG-FIX 2026-07: `varianceQty * price` used material.price as if it were
      // already a per-base-unit price — same root cause as the other fixes in this
      // pass. Route through the shared, pack-size-aware calculator.
      variance_value: round2(material ? calculateIngredientCost(material, varianceQty, material.unit) : 0),
      // Interpretasi cepat: actual > theoretical => pemakaian fisik lebih besar
      // dari yang "seharusnya" dari resep (indikasi waste/porsi berlebih/pencurian
      // kalau konsisten). actual < theoretical => lebih hemat dari resep, atau
      // ada penjualan yang belum tercatat sbg physical usage.
      flag: interpretVariance(varianceQty, theoreticalQty),
    });
  }

  return result.sort((a, b) => Math.abs(b.variance_value) - Math.abs(a.variance_value));
}

function interpretVariance(varianceQty, theoreticalQty) {
  if (theoreticalQty === 0 && varianceQty === 0) return 'NO_ACTIVITY';
  if (theoreticalQty === 0 && varianceQty !== 0) return 'NO_RECIPE_BENCHMARK';
  const pct = Math.abs(varianceQty) / Math.max(theoreticalQty, 1e-9);
  if (pct <= 0.03) return 'NORMAL'; // toleransi wajar (spill, pembulatan)
  return varianceQty > 0 ? 'OVER_USAGE' : 'UNDER_USAGE';
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Formula §B.5 kedua: rekonsiliasi saldo stok (dipakai utk Stock Opname
 * variance, beda dari usage variance di atas).
 *   SystemQty = OpeningStock + Purchases - ActualUsage
 *   Variance  = PhysicalQty - SystemQty
 */
export function calculateStockOpnameVariance({ openingQty, purchasedQty, actualUsageQty, physicalQty }) {
  const systemQty = Number(openingQty || 0) + Number(purchasedQty || 0) - Number(actualUsageQty || 0);
  const variance = Number(physicalQty || 0) - systemQty;
  return { systemQty: round2(systemQty), variance: round2(variance) };
}
