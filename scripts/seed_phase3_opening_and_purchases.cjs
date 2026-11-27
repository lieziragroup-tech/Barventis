const fs = require('fs');
const XLSX = require('xlsx');

// 1. Baca File Excel
const wb = XLSX.readFile('Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx');

// Ekstrak Saldo Awal (Dari Sheet COST CONTROL & Sheet Opname Juli)
// Nilai Baku Terverifikasi:
// Saldo Awal Resto: Rp 27.032.848
// Saldo Awal Central: Rp 21.608.886
// Total: Rp 48.641.734

// 2. Ekstrak Pembelian Harian (Sheet 2)
const ph = XLSX.utils.sheet_to_json(wb.Sheets['Pembelian Harian'], { header: 1 });
const purchases = [];

for (let i = 2; i < ph.length; i++) {
  const row = ph[i];
  if (!row || !row[1] || typeof row[6] !== 'number' || row[6] <= 0) continue;

  const dateSerial = row[0];
  let txDate = '2026-08-01';
  if (typeof dateSerial === 'number' && dateSerial > 40000) {
    const d = new Date(Math.round((dateSerial - 25569) * 86400 * 1000));
    txDate = d.toISOString().split('T')[0];
  } else if (typeof dateSerial === 'string' && dateSerial.includes('-')) {
    txDate = dateSerial.trim();
  }

  const itemName = String(row[1]).trim();
  const qty = typeof row[2] === 'number' ? row[2] : (parseFloat(String(row[2]).replace(/[^0-9.-]+/g, '')) || 1);
  const unit = row[3] ? String(row[3]).trim().toLowerCase() : 'pck';
  const unitPrice = typeof row[4] === 'number' ? Math.round(row[4]) : 0;
  const supplier = row[5] ? String(row[5]).trim() : 'Tanpa Supplier';
  const totalAmount = Math.round(row[6]);

  purchases.push({
    date: txDate,
    name: itemName,
    qty,
    unit,
    unit_price: unitPrice,
    supplier,
    amount: totalAmount
  });
}

const totalBelanjaEkstrak = purchases.reduce((acc, curr) => acc + curr.amount, 0);
console.log(`[FASE 3 EKSTRAKSI]`);
console.log(`- Total Baris Pembelian Valid: ${purchases.length}`);
console.log(`- Total Nominal Belanja Terhitung: Rp ${totalBelanjaEkstrak.toLocaleString('id-ID')}`);

// 3. Generate SQL Script
const sql = [];
sql.push(`-- ==============================================================================`);
sql.push(`-- FASE 3: SALDO AWAL PERSEDIAAN & PEMBELIAN HARIAN (AGUSTUS 2026)`);
sql.push(`-- Target: Saldo Awal Rp 48.641.734 | Total Belanja Riil Rp 30.786.478`);
sql.push(`-- ==============================================================================\n`);

sql.push(`DO $$`);
sql.push(`DECLARE`);
sql.push(`    v_tenant_id uuid;`);
sql.push(`    v_user_id uuid;`);
sql.push(`    v_mat_id bigint;`);
sql.push(`BEGIN`);
sql.push(`    SELECT id INTO v_tenant_id FROM public.tenants LIMIT 1;`);
sql.push(`    SELECT id INTO v_user_id FROM public.users WHERE tenant_id = v_tenant_id LIMIT 1;\n`);

    sql.push(`    -- 1. SEED TRANSAKSI SALDO AWAL (OPENING STOCK 1 AGUSTUS 2026)`);
    sql.push(`    -- Menggunakan enum sah: 'OPNAME_ADJ'`);
    sql.push(`    -- Saldo Awal Resto`);
    sql.push(`    INSERT INTO public.transactions (tenant_id, date, type, location, qty, amount, notes, created_by)`);
    sql.push(`    VALUES (v_tenant_id, '2026-08-01', 'OPNAME_ADJ', 'RESTO', 1, 27032848, 'Saldo Awal Resto per 1 Agustus 2026 (Sheet COST CONTROL J8)', v_user_id);\n`);
    sql.push(`    -- Saldo Awal Central`);
    sql.push(`    INSERT INTO public.transactions (tenant_id, date, type, location, qty, amount, notes, created_by)`);
    sql.push(`    VALUES (v_tenant_id, '2026-08-01', 'OPNAME_ADJ', 'CENTRAL', 1, 21608886, 'Saldo Awal Central per 1 Agustus 2026 (Sheet COST CONTROL J9)', v_user_id);\n`);
sql.push(`    -- 2. SEED PEMBELIAN HARIAN AGUSTUS (INBOUND TRANSACTIONS)`);
for (const p of purchases) {
  const safeName = p.name.replace(/'/g, "''");
  const safeSup = p.supplier.replace(/'/g, "''");

  sql.push(`    -- Item: ${safeName} (Rp ${p.amount.toLocaleString('id-ID')})`);
  sql.push(`    SELECT id INTO v_mat_id FROM public.materials WHERE tenant_id = v_tenant_id AND (name ILIKE '%${safeName}%' OR name ILIKE '%${safeName.split(' ')[0]}%') LIMIT 1;`);
  sql.push(`    IF v_mat_id IS NOT NULL THEN`);
  sql.push(`        INSERT INTO public.transactions (tenant_id, date, material_id, type, location, qty, amount, notes, created_by, unit_cost_snapshot)`);
  sql.push(`        VALUES (v_tenant_id, '${p.date}', v_mat_id, 'IN', 'RESTO', ${p.qty}, ${p.amount}, 'Faktur Belanja: ${safeSup}', v_user_id, ${p.unit_price});`);
  sql.push(`        UPDATE public.materials SET qty_resto = qty_resto + ${p.qty} WHERE id = v_mat_id;`);
  sql.push(`    ELSE`);
  sql.push(`        INSERT INTO public.transactions (tenant_id, date, type, location, qty, amount, notes, created_by)`);
  sql.push(`        VALUES (v_tenant_id, '${p.date}', 'IN', 'RESTO', ${p.qty}, ${p.amount}, 'Belanja Non-Master: ${safeName} (${safeSup})', v_user_id);`);
  sql.push(`    END IF;\n`);
}

sql.push(`    RAISE NOTICE 'Seeding Fase 3 Selesai: Saldo Awal & Pembelian berhasil di-insert.';`);
sql.push(`END $$;\n`);

fs.writeFileSync('db/seed_phase3_opening_and_purchases.sql', sql.join('\n'), 'utf-8');
console.log(`[FILE GENERATED] -> db/seed_phase3_opening_and_purchases.sql`);
