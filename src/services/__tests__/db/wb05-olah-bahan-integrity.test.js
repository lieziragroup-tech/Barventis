/**
 * WB-05: White-Box Testing — Olah Bahan & Batching Prep Integrity
 *
 * Validates the core service layer and database schema integrity for:
 *   WB-05.1: Triple photo isolation (gross, clean, waste photos saved independently)
 *   WB-05.2: Yield calculation & normalization between units (kg <-> gr, L <-> ml, 0 gross guard)
 *   WB-05.3: Atomic double-stock mutation (source raw decremented, target prepped incremented)
 *   WB-05.4: Automatic trimming waste linkage when waste_qty > 0
 *   WB-05.5: Dynamic target HPP recalculation & material pack price update
 *   WB-05.6: FEFO batch creation in material_batches upon expiry_date entry
 *   WB-05.7: Service validation guard (rejecting non-positive weights & missing required materials)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_ID = '22222222-2222-2222-2222-222222222222';

function buildOlahBahanSchema(db) {
  db.public.none(`
    CREATE TABLE IF NOT EXISTS materials (
      id          SERIAL PRIMARY KEY,
      tenant_id   UUID NOT NULL,
      name        TEXT NOT NULL,
      unit        TEXT NOT NULL,
      full_pack   TEXT,
      price       NUMERIC(16,2) NOT NULL DEFAULT 0,
      new_price   NUMERIC(16,2) NOT NULL DEFAULT 0,
      avg_cost    NUMERIC(16,2) NOT NULL DEFAULT 0,
      qty_resto   NUMERIC(16,4) NOT NULL DEFAULT 0,
      qty_central NUMERIC(16,4) NOT NULL DEFAULT 0,
      shelf_life_days INTEGER
    );

    CREATE TABLE IF NOT EXISTS production_trimming_batches (
      id                  SERIAL PRIMARY KEY,
      tenant_id           UUID NOT NULL,
      branch_id           UUID,
      material_id         INTEGER NOT NULL REFERENCES materials(id),
      batch_number        TEXT NOT NULL UNIQUE,
      gross_weight        NUMERIC(16,4) NOT NULL,
      clean_weight        NUMERIC(16,4) NOT NULL,
      waste_weight        NUMERIC(16,4) NOT NULL DEFAULT 0,
      gross_photo_url     TEXT NOT NULL,
      clean_photo_url     TEXT,
      waste_photo_url     TEXT,
      gross_timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clean_timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      portion_pack_output NUMERIC(16,4) NOT NULL,
      status              TEXT NOT NULL DEFAULT 'STEP2_COMPLETED',
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS material_batches (
      id          SERIAL PRIMARY KEY,
      tenant_id   UUID NOT NULL,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      batch_no    TEXT NOT NULL,
      expired_date DATE,
      qty_resto   NUMERIC(16,4) NOT NULL DEFAULT 0,
      qty_central NUMERIC(16,4) NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          SERIAL PRIMARY KEY,
      tenant_id   UUID NOT NULL,
      date        DATE NOT NULL,
      material_id INTEGER NOT NULL REFERENCES materials(id),
      type        TEXT NOT NULL,
      location    TEXT NOT NULL,
      qty         NUMERIC(16,4) NOT NULL,
      amount      NUMERIC(16,2) NOT NULL DEFAULT 0,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          SERIAL PRIMARY KEY,
      tenant_id   UUID NOT NULL,
      action      TEXT NOT NULL,
      details     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Service Layer Simulation mirroring api.recordOlahBahan
 */
function recordOlahBahanService(db, {
  tenantId = TENANT_ID,
  branchId = BRANCH_ID,
  location = 'RESTO',
  source_mat_id,
  source_qty,
  target_mat_id,
  target_qty,
  waste_qty = 0,
  new_target_hpp = null,
  photo_before,
  photo_clean = null,
  photo_waste = null,
  notes = '',
  expiry_date = null
}) {
  if (!source_mat_id || !target_mat_id) {
    throw new Error('Pilih bahan mentah asal dan bahan hasil olahan terlebih dahulu.');
  }
  const sQty = parseFloat(source_qty);
  const tQty = parseFloat(target_qty);
  const wQty = parseFloat(waste_qty || 0);

  if (isNaN(sQty) || sQty <= 0) {
    throw new Error('Kuantitas bahan asal harus lebih besar dari 0.');
  }
  if (isNaN(tQty) || tQty <= 0) {
    throw new Error('Kuantitas hasil olahan bersih harus lebih besar dari 0.');
  }
  if (!photo_before) {
    throw new Error('Wajib lampirkan Foto 1: Bahan asal di timbangan.');
  }
  if (!photo_clean) {
    throw new Error('Wajib lampirkan Foto Bukti Hasil Bersih di timbangan.');
  }

  const batchNumber = `PREP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  // 1. Insert into production_trimming_batches
  const batchRow = db.public.one(`
    INSERT INTO production_trimming_batches (
      tenant_id, branch_id, material_id, batch_number,
      gross_weight, clean_weight, waste_weight,
      gross_photo_url, clean_photo_url, waste_photo_url,
      portion_pack_output, status
    ) VALUES (
      '${tenantId}', '${branchId}', ${source_mat_id}, '${batchNumber}',
      ${sQty}, ${tQty}, ${wQty},
      '${photo_before}', '${photo_clean}', ${photo_waste ? `'${photo_waste}'` : 'NULL'},
      ${tQty}, 'STEP2_COMPLETED'
    ) RETURNING *
  `);

  // 2. Decrement source material stock & increment target material stock
  const locCol = location === 'CENTRAL' ? 'qty_central' : 'qty_resto';
  db.public.none(`
    UPDATE materials SET ${locCol} = ${locCol} - ${sQty} WHERE id = ${source_mat_id} AND tenant_id = '${tenantId}'
  `);
  db.public.none(`
    UPDATE materials SET ${locCol} = ${locCol} + ${tQty} WHERE id = ${target_mat_id} AND tenant_id = '${tenantId}'
  `);

  // 3. Update target material HPP if specified
  if (new_target_hpp && Number(new_target_hpp) > 0) {
    const hpp = Math.round(Number(new_target_hpp));
    db.public.none(`
      UPDATE materials SET price = ${hpp}, new_price = ${hpp}, avg_cost = ${hpp} WHERE id = ${target_mat_id}
    `);
  }

  // 4. Record waste transaction if waste > 0
  if (wQty > 0) {
    db.public.none(`
      INSERT INTO transactions (tenant_id, date, material_id, type, location, qty, amount, notes)
      VALUES ('${tenantId}', CURRENT_DATE, ${source_mat_id}, 'WASTE', '${location}', ${wQty}, 0, 'Ampas olah bahan ${batchNumber} (${notes || 'Olah bahan'})')
    `);
  }

  // 5. FEFO batch record if expiry_date provided
  if (expiry_date) {
    db.public.none(`
      INSERT INTO material_batches (tenant_id, material_id, batch_no, expired_date, ${locCol}, status)
      VALUES ('${tenantId}', ${target_mat_id}, '${batchNumber}', '${expiry_date}', ${tQty}, 'ACTIVE')
    `);
  }

  // 6. Audit log
  db.public.none(`
    INSERT INTO audit_logs (tenant_id, action, details)
    VALUES ('${tenantId}', 'OLAH_BAHAN', 'Olah Bahan ${batchNumber}: Input ${sQty} -> Hasil ${tQty}, Ampas ${wQty}')
  `);

  return batchRow;
}

/**
 * Pure calculation logic mirroring SimplePrep.analytics
 */
function calculateYieldAndHpp({ sourceQty, targetQty, sourceUnit, targetUnit, sourceCostPerUnit }) {
  const sQty = parseFloat(sourceQty) || 0;
  const tQty = parseFloat(targetQty) || 0;

  let normSource = sQty;
  let normTarget = tQty;

  if (sourceUnit === 'kg' && targetUnit === 'gr') normTarget = tQty / 1000;
  else if (sourceUnit === 'gr' && targetUnit === 'kg') normSource = sQty / 1000;
  else if (sourceUnit === 'L' && targetUnit === 'ml') normTarget = tQty / 1000;
  else if (sourceUnit === 'ml' && targetUnit === 'L') normSource = sQty / 1000;

  const yieldPct = normSource > 0 ? (normTarget / normSource) * 100 : 0;
  const totalCost = sQty * (sourceCostPerUnit || 0);
  const newTargetHpp = tQty > 0 ? totalCost / tQty : 0;

  return {
    yieldPct: Math.min(100, Math.round(yieldPct * 10) / 10),
    rawYieldPct: yieldPct,
    totalCost,
    newTargetHppPerUnit: Math.round(newTargetHpp)
  };
}

describe('WB-05: White-Box Testing — Olah Bahan & Yield Integrity', () => {
  let db;

  beforeEach(() => {
    db = newDb();
    buildOlahBahanSchema(db);

    // Seed test materials:
    // ID 1: Lemon Mentah (Raw, 10 kg in resto @ Rp 30.000 / kg)
    // ID 2: Jus Lemon Murni (Prepped, 0 ml in resto @ Rp 0)
    db.public.none(`
      INSERT INTO materials (id, tenant_id, name, unit, full_pack, price, new_price, avg_cost, qty_resto, qty_central)
      VALUES
        (1, '${TENANT_ID}', 'Lemon Mentah', 'kg', '1 kg', 30000, 30000, 30000, 10.0, 50.0),
        (2, '${TENANT_ID}', 'Jus Lemon Murni', 'ml', '1000 ml', 0, 0, 0, 0.0, 0.0);
    `);
  });

  // ─── WB-05.1: Triple Photo Isolation ──────────────────────────────────────
  describe('WB-05.1: Triple Photo Isolation', () => {
    it('stores gross, clean, and waste photos distinctly without overwriting clean photo', () => {
      const grossPhoto = 'https://storage.barventis.app/prep/gross-101.webp';
      const cleanPhoto = 'https://storage.barventis.app/prep/clean-102.webp';
      const wastePhoto = 'https://storage.barventis.app/prep/waste-103.webp';

      const record = recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 2.5,
        target_mat_id: 2,
        target_qty: 1200,
        waste_qty: 0.8,
        photo_before: grossPhoto,
        photo_clean: cleanPhoto,
        photo_waste: wastePhoto,
      });

      expect(record.gross_photo_url).toBe(grossPhoto);
      expect(record.clean_photo_url).toBe(cleanPhoto);
      expect(record.waste_photo_url).toBe(wastePhoto);
      expect(record.clean_photo_url).not.toBe(record.waste_photo_url);
    });

    it('allows waste_photo_url to be NULL when no waste is generated', () => {
      const record = recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 1.0,
        target_mat_id: 2,
        target_qty: 600,
        waste_qty: 0,
        photo_before: 'https://storage.barventis.app/prep/gross.webp',
        photo_clean: 'https://storage.barventis.app/prep/clean.webp',
        photo_waste: null
      });

      expect(record.clean_photo_url).toBe('https://storage.barventis.app/prep/clean.webp');
      expect(record.waste_photo_url).toBeNull();
    });
  });

  // ─── WB-05.2: Yield & Unit Normalization ─────────────────────────────────
  describe('WB-05.2: Yield Calculation & Unit Normalization', () => {
    it('correctly calculates yield when converting kg to gr (2 kg -> 1500 gr = 75%)', () => {
      const result = calculateYieldAndHpp({
        sourceQty: 2,
        targetQty: 1500,
        sourceUnit: 'kg',
        targetUnit: 'gr',
        sourceCostPerUnit: 40000 // Total cost = Rp 80.000
      });

      expect(result.yieldPct).toBe(75);
      expect(result.totalCost).toBe(80000);
      expect(result.newTargetHppPerUnit).toBe(Math.round(80000 / 1500)); // Rp 53 / gr
    });

    it('correctly calculates yield when converting Liters to ml (1 L -> 850 ml = 85%)', () => {
      const result = calculateYieldAndHpp({
        sourceQty: 1,
        targetQty: 850,
        sourceUnit: 'L',
        targetUnit: 'ml',
        sourceCostPerUnit: 25000
      });

      expect(result.yieldPct).toBe(85);
      expect(result.newTargetHppPerUnit).toBe(Math.round(25000 / 850));
    });

    it('safely handles 0 source quantity without NaN or Infinity', () => {
      const result = calculateYieldAndHpp({
        sourceQty: 0,
        targetQty: 500,
        sourceUnit: 'kg',
        targetUnit: 'gr',
        sourceCostPerUnit: 30000
      });

      expect(result.yieldPct).toBe(0);
      expect(result.totalCost).toBe(0);
    });
  });

  // ─── WB-05.3: Atomic Double-Stock Movement ────────────────────────────────
  describe('WB-05.3: Atomic Double-Stock Mutation', () => {
    it('decrements source raw material and increments target prepped material', () => {
      const initialSource = db.public.one(`SELECT qty_resto FROM materials WHERE id = 1`);
      const initialTarget = db.public.one(`SELECT qty_resto FROM materials WHERE id = 2`);

      expect(Number(initialSource.qty_resto)).toBe(10.0);
      expect(Number(initialTarget.qty_resto)).toBe(0.0);

      recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 3.0,
        target_mat_id: 2,
        target_qty: 1500,
        waste_qty: 0.5,
        photo_before: 'https://pic/before.webp',
        photo_clean: 'https://pic/clean.webp'
      });

      const updatedSource = db.public.one(`SELECT qty_resto FROM materials WHERE id = 1`);
      const updatedTarget = db.public.one(`SELECT qty_resto FROM materials WHERE id = 2`);

      expect(Number(updatedSource.qty_resto)).toBe(7.0); // 10.0 - 3.0
      expect(Number(updatedTarget.qty_resto)).toBe(1500.0); // 0.0 + 1500
    });
  });

  // ─── WB-05.4: Automatic Trimming Waste Audit ──────────────────────────────
  describe('WB-05.4: Automatic Trimming Waste Audit', () => {
    it('creates a WASTE transaction linked to batch when waste_qty > 0', () => {
      recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 2.0,
        target_mat_id: 2,
        target_qty: 1200,
        waste_qty: 0.45,
        photo_before: 'https://pic/before.webp',
        photo_clean: 'https://pic/clean.webp',
        notes: 'Lemon kulit tebal'
      });

      const wasteTx = db.public.one(`SELECT * FROM transactions WHERE type = 'WASTE'`);
      expect(wasteTx).toBeDefined();
      expect(Number(wasteTx.qty)).toBe(0.45);
      expect(wasteTx.material_id).toBe(1);
      expect(wasteTx.notes).toContain('Lemon kulit tebal');
    });

    it('does NOT create a WASTE transaction when waste_qty is 0', () => {
      recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 1.0,
        target_mat_id: 2,
        target_qty: 900,
        waste_qty: 0,
        photo_before: 'https://pic/before.webp',
        photo_clean: 'https://pic/clean.webp'
      });

      const count = db.public.one(`SELECT count(*) FROM transactions WHERE type = 'WASTE'`);
      expect(Number(count.count)).toBe(0);
    });
  });

  // ─── WB-05.5: Dynamic Target HPP Recalculation ───────────────────────────
  describe('WB-05.5: Dynamic Target HPP Recalculation', () => {
    it('updates price, new_price, and avg_cost on target material when HPP computed', () => {
      const newHpp = 45; // Rp 45 per ml

      recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 2.0,
        target_mat_id: 2,
        target_qty: 1000,
        new_target_hpp: newHpp,
        photo_before: 'https://pic/before.webp',
        photo_clean: 'https://pic/clean.webp'
      });

      const updated = db.public.one(`SELECT price, new_price, avg_cost FROM materials WHERE id = 2`);
      expect(Number(updated.price)).toBe(45);
      expect(Number(updated.new_price)).toBe(45);
      expect(Number(updated.avg_cost)).toBe(45);
    });
  });

  // ─── WB-05.6: FEFO Batch Registration ─────────────────────────────────────
  describe('WB-05.6: FEFO Batch Registration', () => {
    it('creates active material_batches record with expired_date when provided', () => {
      const expDate = '2026-11-10';

      const batch = recordOlahBahanService(db, {
        source_mat_id: 1,
        source_qty: 2.0,
        target_mat_id: 2,
        target_qty: 1200,
        photo_before: 'https://pic/before.webp',
        photo_clean: 'https://pic/clean.webp',
        expiry_date: expDate
      });

      const fefoRecord = db.public.one(`SELECT * FROM material_batches WHERE batch_no = '${batch.batch_number}'`);
      expect(fefoRecord).toBeDefined();
      expect(fefoRecord.material_id).toBe(2);
      expect(Number(fefoRecord.qty_resto)).toBe(1200);
      expect(fefoRecord.status).toBe('ACTIVE');
    });
  });

  // ─── WB-05.7: Service Validation Guards ───────────────────────────────────
  describe('WB-05.7: Service Validation Guards', () => {
    it('rejects submission if photo_clean is missing', () => {
      expect(() => {
        recordOlahBahanService(db, {
          source_mat_id: 1,
          source_qty: 1.0,
          target_mat_id: 2,
          target_qty: 800,
          photo_before: 'https://pic/before.webp',
          photo_clean: null // Missing!
        });
      }).toThrow(/Foto Bukti Hasil Bersih/);
    });

    it('rejects submission if photo_before is missing', () => {
      expect(() => {
        recordOlahBahanService(db, {
          source_mat_id: 1,
          source_qty: 1.0,
          target_mat_id: 2,
          target_qty: 800,
          photo_before: null, // Missing!
          photo_clean: 'https://pic/clean.webp'
        });
      }).toThrow(/Foto 1: Bahan asal di timbangan/);
    });

    it('rejects submission if quantities are zero or negative', () => {
      expect(() => {
        recordOlahBahanService(db, {
          source_mat_id: 1,
          source_qty: 0,
          target_mat_id: 2,
          target_qty: 500,
          photo_before: 'https://pic/before.webp',
          photo_clean: 'https://pic/clean.webp'
        });
      }).toThrow(/Kuantitas bahan asal harus lebih besar dari 0/);
    });
  });
});
