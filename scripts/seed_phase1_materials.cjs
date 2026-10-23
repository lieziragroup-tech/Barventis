const fs = require('fs');
const XLSX = require('xlsx');

// 1. Baca File Excel
const wb = XLSX.readFile('Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx');
const ml = XLSX.utils.sheet_to_json(wb.Sheets['MARKETLIST '], { header: 1 });

let currentCategory = 'Uncategorized';
const materials = [];
const suppliersMap = new Map(); // name -> normalized

for (let i = 4; i < ml.length; i++) {
  const row = ml[i];
  if (!row || row.length === 0) continue;

  // Deteksi Header Kategori
  if ((row[0] === null || row[0] === undefined || typeof row[0] === 'string') && row[1] && !row[2] && !row[5]) {
    currentCategory = String(row[1]).trim();
    continue;
  }

  // Baris Material Valid
  if (typeof row[0] === 'number' && row[1]) {
    const name = String(row[1]).trim();
    const unit = row[3] ? String(row[3]).trim().toLowerCase() : 'pck';
    const full_pack = row[4] ? String(row[4]).trim() : '';
    const price = typeof row[5] === 'number' ? Math.round(row[5]) : (Math.round(parseFloat(String(row[5]).replace(/[^0-9.-]+/g, ''))) || 0);
    const rawSupplier = row[6] ? String(row[6]).trim() : 'Tanpa Supplier';

    // Normalisasi Supplier (Kapitalisasi konsisten)
    let normSupplier = rawSupplier;
    if (rawSupplier.toLowerCase() === 'tokped' || rawSupplier.toLowerCase() === 'tokopedia') normSupplier = 'Tokopedia';
    else if (rawSupplier.toLowerCase().includes('elisa')) normSupplier = 'Toko Elisa';
    else if (rawSupplier.toLowerCase().includes('multibev')) normSupplier = 'Multibev';
    else if (rawSupplier.toLowerCase().includes('titik temu')) normSupplier = 'Titik Temu Roastery';

    suppliersMap.set(normSupplier, true);

    materials.push({
      item_no: row[0],
      name,
      category: currentCategory,
      unit,
      full_pack,
      price,
      supplier: normSupplier
    });
  }
}

console.log(`[EKSTRAKSI SUKSES]`);
console.log(`- Total Material: ${materials.length}`);
console.log(`- Total Supplier Unik: ${suppliersMap.size}`);

// 2. Generate SQL Script yang Kompatibel dengan Skema Supabase
const sqlOutput = [];
sqlOutput.push(`-- ==============================================================================`);
sqlOutput.push(`-- FASE 1: SEEDING MASTER BAHAN BAKU & SUPPLIERS (UMATIS AGUSTUS 2026)`);
sqlOutput.push(`-- Di-generate otomatis dari Sheet MARKETLIST (128 Item Baku)`);
sqlOutput.push(`-- ==============================================================================\n`);

sqlOutput.push(`DO $$`);
sqlOutput.push(`DECLARE`);
sqlOutput.push(`    v_tenant_id uuid;`);
sqlOutput.push(`    v_sup_id bigint;`);
sqlOutput.push(`BEGIN`);
sqlOutput.push(`    -- Ambil Tenant Pertama (atau Tenant Aktif)`);
sqlOutput.push(`    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;\n`);

sqlOutput.push(`    -- 1. SEED SUPPLIERS`);
for (const sup of suppliersMap.keys()) {
  const safeSup = sup.replace(/'/g, "''");
  sqlOutput.push(`    INSERT INTO public.suppliers (tenant_id, name, status)`);
  sqlOutput.push(`    VALUES (v_tenant_id, '${safeSup}', 'active')`);
  sqlOutput.push(`    ON CONFLICT DO NOTHING;\n`);
}

sqlOutput.push(`    -- 2. SEED MATERIALS (128 Items)`);
for (const m of materials) {
  const safeName = m.name.replace(/'/g, "''");
  const safeCat = m.category.replace(/'/g, "''");
  const safeUnit = m.unit.replace(/'/g, "''");
  const safePack = m.full_pack.replace(/'/g, "''");
  const safeSup = m.supplier.replace(/'/g, "''");

  sqlOutput.push(`    -- Item #${m.item_no}: ${safeName}`);
  sqlOutput.push(`    SELECT id INTO v_sup_id FROM public.suppliers WHERE tenant_id = v_tenant_id AND name = '${safeSup}' LIMIT 1;`);
  sqlOutput.push(`    INSERT INTO public.materials (`);
  sqlOutput.push(`        tenant_id, name, category, unit, full_pack, price, new_price, supplier, supplier_id, is_active, min_stock, par_stock, qty_resto, qty_central`);
  sqlOutput.push(`    ) VALUES (`);
  sqlOutput.push(`        v_tenant_id, '${safeName}', '${safeCat}', '${safeUnit}', '${safePack}', ${m.price}, ${m.price}, '${safeSup}', v_sup_id, true, 5, 10, 0, 0`);
  sqlOutput.push(`    ) ON CONFLICT DO NOTHING;\n`);
}

sqlOutput.push(`    RAISE NOTICE 'Seeding Fase 1 Selesai: 128 Material & Suppliers berhasil di-insert.';`);
sqlOutput.push(`END $$;\n`);

fs.writeFileSync('db/seed_phase1_materials.sql', sqlOutput.join('\n'), 'utf-8');
console.log(`[FILE GENERATED] -> db/seed_phase1_materials.sql`);
