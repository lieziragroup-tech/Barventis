const fs = require('fs');
const XLSX = require('xlsx');

// Baca Sheet Daily Iventory Beer
const wb = XLSX.readFile('Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx');
const ws = wb.Sheets['Daily Iventory Beer'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

const rtdItems = [];

for (let i = 4; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[1] || typeof row[2] !== 'number') continue;
  
  const name = String(row[1]).trim();
  const unitPrice = Math.round(row[2]);
  
  // Format baku RTD Beer
  // Basic Cost = Modal Botol + Fix Cost (5% garnish/chilling/ice overhead)
  const fixCost = Math.round(unitPrice * 0.05);
  const basicCost = unitPrice + fixCost;
  const sellingPrice = Math.round(basicCost * 2.2); // Standar F&B pricing margin

  rtdItems.push({
    name,
    unitPrice,
    fixCost,
    basicCost,
    sellingPrice
  });
}

console.log(`[EKSTRAKSI RTD SELESAI] Terkumpul ${rtdItems.length} Item Bir/RTD.`);

// Generate SQL
const sql = [];
sql.push(`-- ==============================================================================`);
sql.push(`-- SEEDING RTD & BEER RECIPES (BOM 1:1 + OVERHEAD ES/CHILLING)`);
sql.push(`-- Di-generate dari Sheet Daily Iventory Beer`);
sql.push(`-- ==============================================================================\n`);

sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`    v_tenant_id uuid;`);
sql.push(`    v_recipe_id bigint;`);
sql.push(`    v_mat_id bigint;`);
sql.push(`    v_ice_id bigint;`);
sql.push(`BEGIN`);
sql.push(`    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;`);
sql.push(`    SELECT id INTO v_ice_id FROM public.materials WHERE tenant_id = v_tenant_id AND name ILIKE '%Ice%' LIMIT 1;\n`);

for (const item of rtdItems) {
  const safeName = item.name.replace(/'/g, "''");
  
  sql.push(`    -- -------------------------------------------------------------`);
  sql.push(`    -- Menu RTD: ${safeName}`);
  sql.push(`    -- -------------------------------------------------------------`);
  sql.push(`    INSERT INTO public.recipes (tenant_id, menu_name, category, subtotal, fix_cost, basic_cost, selling_price, food_cost_pct)`);
  sql.push(`    VALUES (v_tenant_id, '${safeName}', 'Drink & Beer', ${item.unitPrice}, ${item.fixCost}, ${item.basicCost}, ${item.sellingPrice}, 0.45)`);
  sql.push(`    ON CONFLICT (tenant_id, menu_name) DO UPDATE SET basic_cost = ${item.basicCost}, subtotal = ${item.unitPrice}, fix_cost = ${item.fixCost}`);
  sql.push(`    RETURNING id INTO v_recipe_id;\n`);

  sql.push(`    -- Cari bahan baku botolnya di materials`);
  sql.push(`    SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND name ILIKE '%${safeName.split(' ')[0]}%' LIMIT 1;`);
  sql.push(`    IF v_mat_id IS NOT NULL THEN`);
  sql.push(`        -- 1. Komponen Utama: 1 Botol Utuh (1:1)`);
  sql.push(`        INSERT INTO public.recipe_ingredients (recipe_id, material_id, qty_in_use, unit, unit_price, amount, tenant_id)`);
  sql.push(`        VALUES (v_recipe_id, v_mat_id, 1, 'btl', ${item.unitPrice}, ${item.unitPrice}, v_tenant_id)`);
  sql.push(`        ON CONFLICT (recipe_id, material_id) DO UPDATE SET qty_in_use = EXCLUDED.qty_in_use, amount = EXCLUDED.amount;`);
  sql.push(`    END IF;\n`);

  sql.push(`    -- 2. Komponen Pendukung: Ice Cube / Chilling (jika ada bahan es)`);
  sql.push(`    IF v_ice_id IS NOT NULL THEN`);
  sql.push(`        INSERT INTO public.recipe_ingredients (recipe_id, material_id, qty_in_use, unit, unit_price, amount, tenant_id)`);
  sql.push(`        VALUES (v_recipe_id, v_ice_id, 100, 'gr', 1000, 100, v_tenant_id)`);
  sql.push(`        ON CONFLICT (recipe_id, material_id) DO UPDATE SET qty_in_use = EXCLUDED.qty_in_use, amount = EXCLUDED.amount;`);
  sql.push(`    END IF;\n`);
}

sql.push(`    RAISE NOTICE 'Seeding Resep RTD Beer Selesai: % Item berhasil di-insert.', ${rtdItems.length};`);
sql.push(`END $$;\n`);

fs.writeFileSync('db/seed_rtd_beer_recipes.sql', sql.join('\n'), 'utf-8');
console.log(`[FILE GENERATED] -> db/seed_rtd_beer_recipes.sql`);
