// ═══════════════════════════════════════════════════════════════════
// validationService.js
//
// Kumpulan validation rules (lihat §J dokumen reverse-engineering
// "Barventis_SO_Barista_Reverse_Engineering.md") sebagai pure function
// yang bisa dipanggil dari mana saja (PosUpload, generate pipeline, dst)
// tanpa duplikasi logic. Semua fungsi di sini TIDAK melakukan network
// call — mereka menerima data yang sudah di-fetch dan mengembalikan
// hasil validasi terstruktur { level, code, message, meta }.
// ═══════════════════════════════════════════════════════════════════

const LEVEL = { INFO: 'info', WARNING: 'warning', ERROR: 'error' };

/**
 * Rule: Branch/Company di file yang diupload harus cocok dengan tenant aktif.
 * Kasus nyata yang jadi alasan rule ini: file Daily Sales Menu Report Juni
 * ternyata dari branch "Kasuna by Umatis" padahal tenant terdaftar
 * "UMATIS RESTO & VENUE" — sebelumnya tidak ada validasi apapun.
 */
export function validateBranchMatch({ detectedBranch, detectedCompany, expectedBranch }) {
  if (!expectedBranch || !detectedBranch) {
    return {
      level: LEVEL.WARNING,
      code: 'BRANCH_NOT_VERIFIABLE',
      message: 'Branch tidak terdeteksi di file atau belum diset di profil tenant — dilewati tanpa validasi.',
    };
  }
  const match = detectedBranch.toLowerCase().trim() === expectedBranch.toLowerCase().trim();
  if (!match) {
    return {
      level: LEVEL.ERROR,
      code: 'BRANCH_MISMATCH',
      message: `File ini dari branch "${detectedBranch}"${detectedCompany ? ` (${detectedCompany})` : ''}, bukan "${expectedBranch}". Kemungkinan salah upload file outlet lain.`,
      meta: { detectedBranch, detectedCompany, expectedBranch },
    };
  }
  return { level: LEVEL.INFO, code: 'BRANCH_OK', message: 'Branch cocok.' };
}

/**
 * Rule: setiap menu di sales report harus ketemu recipe-nya.
 * Menu yang tidak match TIDAK menghentikan proses (report tetap dibuat
 * parsial), tapi harus masuk daftar review manual.
 */
export function validateMenuMapping(salesRows, recipes) {
  const nameMap = new Map((recipes || []).map(r => [String(r.menu_name).toLowerCase().trim(), r]));
  const codeMap = new Map((recipes || []).filter(r => r.pos_code).map(r => [String(r.pos_code).toLowerCase().trim(), r]));

  const unmapped = new Set();
  for (const row of salesRows) {
    // Tolerate both naming conventions: PosUpload.jsx's bulk-import rows use
    // menu_name/menu_code, reportGenerator.js's parseSalesReport uses menuName/menuCode.
    const rawName = row.menu_name ?? row.menuName ?? '';
    const rawCode = row.menu_code ?? row.menuCode ?? '';
    const name = String(rawName).toLowerCase().trim();
    const code = String(rawCode).toLowerCase().trim();
    const found = (code && code !== '-' && codeMap.has(code)) || nameMap.has(name);
    if (!found) unmapped.add(rawName);
  }

  if (unmapped.size === 0) {
    return { level: LEVEL.INFO, code: 'MENU_MAPPING_OK', message: 'Semua menu ketemu resepnya.' };
  }
  return {
    level: LEVEL.WARNING,
    code: 'MENU_NOT_FOUND',
    message: `${unmapped.size} menu belum punya resep: ${Array.from(unmapped).slice(0, 5).join(', ')}${unmapped.size > 5 ? ', ...' : ''}`,
    meta: { unmappedMenus: Array.from(unmapped) },
  };
}

/**
 * Rule: recipe yang ada tapi tanpa ingredient sama sekali -> cost akan 0,
 * yang menyesatkan (bukan berarti menu itu gratis).
 */
export function validateRecipeCompleteness(recipes) {
  const empty = (recipes || []).filter(r => !r.recipe_ingredients || r.recipe_ingredients.length === 0);
  if (empty.length === 0) {
    return { level: LEVEL.INFO, code: 'RECIPES_OK', message: 'Semua resep punya ingredient.' };
  }
  return {
    level: LEVEL.WARNING,
    code: 'RECIPE_EMPTY',
    message: `${empty.length} resep tanpa ingredient: ${empty.slice(0, 5).map(r => r.menu_name).join(', ')}${empty.length > 5 ? ', ...' : ''}`,
    meta: { emptyRecipes: empty.map(r => r.menu_name) },
  };
}

/**
 * Rule: unit di recipe_ingredients harus bisa dikonversi ke unit materials.
 * Sebelumnya konversi cuma hardcode "gr/ml -> kg/l = factor 1000" di
 * processPOSSync — sekarang seharusnya divalidasi eksplisit & bisa
 * dilengkapi lewat tabel unit_conversions (lihat migration 0001).
 */
export function validateUnitConversion(recipes, unitConversionMap) {
  const missing = [];
  for (const r of recipes || []) {
    for (const ing of r.recipe_ingredients || []) {
      const matUnit = (ing.materials?.unit || '').toLowerCase().trim();
      const ingUnit = (ing.unit || '').toLowerCase().trim();
      if (matUnit && ingUnit && matUnit !== ingUnit) {
        const key = `${ing.material_id}:${ingUnit}:${matUnit}`;
        const hasHardcodedFallback =
          (['gr', 'ml', 'grm'].includes(ingUnit)) && (['kg', 'l', 'liter', 'ltr'].includes(matUnit));
        const hasExplicit = unitConversionMap?.has(key);
        if (!hasHardcodedFallback && !hasExplicit) {
          missing.push({ recipe: r.menu_name, material_id: ing.material_id, from: ingUnit, to: matUnit });
        }
      }
    }
  }
  if (missing.length === 0) {
    return { level: LEVEL.INFO, code: 'UNIT_CONVERSION_OK', message: 'Semua unit resep cocok/terkonversi.' };
  }
  return {
    level: LEVEL.ERROR,
    code: 'UNIT_CONVERSION_MISSING',
    message: `${missing.length} kombinasi unit belum ada faktor konversinya — cost akan salah tanpa ini.`,
    meta: { missing },
  };
}

/**
 * Rule: cek duplicate upload berdasarkan file hash (bukan cuma periode).
 */
export function validateDuplicateUpload(fileHash, existingLog) {
  if (!existingLog) {
    return { level: LEVEL.INFO, code: 'NOT_DUPLICATE', message: 'File belum pernah diupload.' };
  }
  return {
    level: LEVEL.WARNING,
    code: 'DUPLICATE_FILE',
    message: `File dengan isi identik sudah diupload pada ${new Date(existingLog.created_at).toLocaleString('id-ID')}.`,
    meta: { existingLog },
  };
}

/**
 * Rule: kelengkapan data manual sebelum generate SO Barista bulanan.
 * Karena sebagian besar angka SO Barista berasal dari input manual
 * (Daily Inventory, Purchases, Stock Opname), sistem HARUS bisa bilang
 * dengan jelas data mana yang masih kurang, bukan diam-diam menghasilkan
 * laporan yang salah/kosong.
 */
export function validateDataCompleteness({ daysInMonth, dailyInventories, purchases, opnameResto, opnameCentral }) {
  const issues = [];

  const daysWithInventory = new Set((dailyInventories || []).map(d => d.date));
  for (let d = 1; d <= daysInMonth; d++) {
    // Pengecekan tanggal sebenarnya sebaiknya pakai format penuh oleh caller;
    // di sini kita hanya hitung berapa hari yang ada datanya vs total hari.
  }
  if (daysWithInventory.size < daysInMonth) {
    issues.push({
      level: LEVEL.WARNING,
      code: 'DAILY_INVENTORY_INCOMPLETE',
      message: `Baru ${daysWithInventory.size} dari ${daysInMonth} hari yang ada input Daily Inventory.`,
    });
  }

  if (!purchases || purchases.length === 0) {
    issues.push({ level: LEVEL.WARNING, code: 'NO_PURCHASES', message: 'Belum ada data pembelian bulan ini.' });
  }

  if (!opnameResto) {
    issues.push({ level: LEVEL.ERROR, code: 'OPNAME_RESTO_MISSING', message: 'Stock Opname RESTO bulan ini belum ada.' });
  }
  if (!opnameCentral) {
    issues.push({ level: LEVEL.ERROR, code: 'OPNAME_CENTRAL_MISSING', message: 'Stock Opname CENTRAL bulan ini belum ada.' });
  }

  return issues.length === 0
    ? [{ level: LEVEL.INFO, code: 'DATA_COMPLETE', message: 'Semua data manual bulan ini lengkap.' }]
    : issues;
}

export const ValidationLevel = LEVEL;
