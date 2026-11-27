const fs = require('fs');
const XLSX = require('xlsx');

const wb = XLSX.readFile('Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx');
const ws = wb.Sheets['COGS All Beverage '];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

const cols = [
  { offset: 0, cat: 'KOPI' },
  { offset: 6, cat: 'NON-KOPI' },
  { offset: 12, cat: 'NON-KOPI' },
  { offset: 18, cat: 'MOCKTAIL' },
  { offset: 24, cat: 'MOCKTAIL' },
  { offset: 30, cat: 'ARTISAN TEA' }
];

let allRecipes = [];

cols.forEach(({ offset, cat }) => {
  let i = 0;
  while (i < data.length) {
    const row = data[i];
    if (!row) { i++; continue; }
    
    const menuName = row[offset];
    const nextRow = data[i + 1];
    
    if (menuName && typeof menuName === 'string' && 
        !menuName.startsWith('FORM COGS') && 
        nextRow && typeof nextRow[offset] === 'string' && 
        nextRow[offset].includes('Total Cost Price')) {
      
      const recipe = {
        name: menuName.trim(),
        category: cat,
        totalCost: typeof nextRow[offset + 1] === 'number' ? Math.round(nextRow[offset + 1]) : 0,
        ingredients: []
      };
      
      let r = i + 3;
      while (r < data.length) {
        const itemRow = data[r];
        if (!itemRow) { r++; continue; }
        
        const itemName = itemRow[offset];
        const qty = itemRow[offset + 1];
        const unit = itemRow[offset + 2];
        const unitPrice = itemRow[offset + 3];
        const amount = itemRow[offset + 4];
        
        if (typeof unit === 'string' && unit.toLowerCase().includes('subtotal')) break;
        if (typeof itemName === 'string' && itemName.toLowerCase().includes('subtotal')) break;
        
        if (itemName && typeof itemName === 'string' && qty !== undefined && typeof qty === 'number') {
          recipe.ingredients.push({
            name: itemName.trim(),
            qty: qty,
            unit: unit ? String(unit).trim() : 'gr',
            unit_price: typeof unitPrice === 'number' ? Math.round(unitPrice) : 0,
            amount: typeof amount === 'number' ? Math.round(amount) : 0
          });
        }
        r++;
      }
      allRecipes.push(recipe);
      i = r + 4;
    } else {
      i++;
    }
  }
});

console.log(`[EKSTRAKSI RESEP SUKSES] Total Menu: ${allRecipes.length}`);

// Generate SQL
const sql = [];
sql.push(`-- ==============================================================================`);
sql.push(`-- FASE 2: SEEDING RESEP & BILL OF MATERIALS (BOM 54 MENU)`);
sql.push(`-- Di-generate otomatis dari Sheet COGS All Beverage`);
sql.push(`-- ==============================================================================\n`);

sql.push(`DO $$`);
sqlOutput_var = `DECLARE
    v_tenant_id uuid;
    v_recipe_id bigint;
    v_mat_id bigint;
BEGIN
    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;\n`;
sql.push(sqlOutput_var);

for (const r of allRecipes) {
  const safeName = r.name.replace(/'/g, "''");
  const safeCat = r.category.replace(/'/g, "''");
  const basicCost = r.totalCost;
  const subtotal = Math.round(basicCost / 1.05);
  const fixCost = basicCost - subtotal;
  
  sql.push(`    -- -------------------------------------------------------------`);
  sql.push(`    -- Menu: ${safeName} (${safeCat})`);
  sql.push(`    -- -------------------------------------------------------------`);
  sql.push(`    INSERT INTO public.recipes (tenant_id, menu_name, category, subtotal, fix_cost, basic_cost, selling_price, food_cost_pct)`);
  sql.push(`    VALUES (v_tenant_id, '${safeName}', '${safeCat}', ${subtotal}, ${fixCost}, ${basicCost}, ${basicCost * 3}, 0.33)`);
  sql.push(`    ON CONFLICT (tenant_id, menu_name) DO UPDATE SET basic_cost = ${basicCost}, subtotal = ${subtotal}, fix_cost = ${fixCost}`);
  sql.push(`    RETURNING id INTO v_recipe_id;\n`);
  
  if (r.ingredients.length > 0) {
    sql.push(`    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_recipe_id;\n`);
    for (const ing of r.ingredients) {
      const safeIngName = ing.name.replace(/'/g, "''");
      const safeUnit = ing.unit.replace(/'/g, "''");
      
      sql.push(`    -- Ingredient: ${safeIngName}`);
      sql.push(`    SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND (name ILIKE '%${safeIngName}%' OR name ILIKE '${safeIngName}%') ORDER BY CASE WHEN name ILIKE '%${safeIngName}%' THEN 0 ELSE 1 END LIMIT 1;`);
      sql.push(`    IF v_mat_id IS NOT NULL THEN`);
      sql.push(`        INSERT INTO public.recipe_ingredients (recipe_id, material_id, qty_in_use, unit, unit_price, amount, tenant_id)`);
      sql.push(`        VALUES (v_recipe_id, v_mat_id, ${ing.qty}, '${safeUnit}', ${ing.unit_price}, ${ing.amount}, v_tenant_id)`);
      sql.push(`        ON CONFLICT (recipe_id, material_id) DO UPDATE SET qty_in_use = recipe_ingredients.qty_in_use + ${ing.qty}, amount = recipe_ingredients.amount + ${ing.amount};`);
      sql.push(`    END IF;\n`);
    }
  }
}

sql.push(`    RAISE NOTICE 'Seeding Fase 2 Selesai: 54 Menu Resep & BOM berhasil di-insert.';`);
sql.push(`END $$;\n`);

fs.writeFileSync('db/seed_phase2_recipes.sql', sql.join('\n'), 'utf-8');
console.log(`[FILE GENERATED] -> db/seed_phase2_recipes.sql`);
