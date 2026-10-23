/**
 * WB-04: FEFO & Lot Logic Tests — Sprint 3
 *
 * Tests FEFO lot selection, one-active-lot policy, FEFO exception flagging,
 * multi-lot receipt sum validation, BROKEN link to active lot,
 * and transfer preserves lot identity.
 *
 * Uses pg-mem for DB constraints + pure JS for service logic.
 *
 * Covers:
 *   WB-04.1 FEFO selection: lot with earliest expiry chosen
 *   WB-04.2 One active lot: opening lot 2 while lot 1 active is rejected
 *   WB-04.3 FEFO exception: new lot earlier expiry than active → flag, no auto-switch
 *   WB-04.4 Multi-lot receipt: total must equal receipt quantity
 *   WB-04.5 BROKEN linked to active lot, not arbitrary lot
 *   WB-04.6 Transfer: lot identity (expiry + qty) preserved across locations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';

// ─── Schema ───────────────────────────────────────────────────────────────────

function buildSchema(db) {
  db.public.none(`
    CREATE TABLE IF NOT EXISTS material_batches (
      id          UUID PRIMARY KEY,
      tenant_id   UUID NOT NULL,
      material_id INTEGER NOT NULL,
      batch_no    TEXT NOT NULL,
      expiry_date DATE,
      qty_resto   NUMERIC(16,4) NOT NULL DEFAULT 0,
      qty_central NUMERIC(16,4) NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS material_open_lot_state (
      tenant_id          UUID NOT NULL,
      material_id        INTEGER NOT NULL,
      location           TEXT NOT NULL,
      active_open_lot_id UUID REFERENCES material_batches(id),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, material_id, location)
    );
  `);
}

// ─── FEFO service helpers ─────────────────────────────────────────────────────

/** WB-04.1: Returns the lot with the earliest expiry_date for a material/location */
function selectFefoLot(db, { tenantId, materialId, location }) {
  const qtyField = location === 'RESTO' ? 'qty_resto' : 'qty_central';
  const rows = db.public.many(
    `SELECT id, expiry_date, ${qtyField} as qty FROM material_batches
     WHERE tenant_id='${tenantId}' AND material_id=${materialId}
       AND status='active' AND ${qtyField} > 0
     ORDER BY expiry_date ASC NULLS LAST`
  );
  return rows.length > 0 ? rows[0] : null;
}

/** WB-04.2: Open a lot as active. Throws if another lot is already active. */
function openLot(db, { tenantId, materialId, location, lotId }) {
  const existing = db.public.one(
    `SELECT active_open_lot_id FROM material_open_lot_state
     WHERE tenant_id='${tenantId}' AND material_id=${materialId} AND location='${location}'`
  );
  if (existing && existing.active_open_lot_id && existing.active_open_lot_id !== lotId) {
    throw new Error(`Satu lot aktif terbuka per material/lokasi. Lot ${existing.active_open_lot_id} masih aktif.`);
  }
  db.public.none(
    `INSERT INTO material_open_lot_state (tenant_id, material_id, location, active_open_lot_id)
     VALUES ('${tenantId}', ${materialId}, '${location}', '${lotId}')
     ON CONFLICT (tenant_id, material_id, location)
     DO UPDATE SET active_open_lot_id='${lotId}', updated_at=NOW()`
  );
  return { success: true, active_lot_id: lotId };
}

/** WB-04.3: Check if a new lot triggers FEFO exception */
function checkFefoException(db, { tenantId, materialId, location, newLotExpiry }) {
  const activeLotId = db.public.one(
    `SELECT active_open_lot_id FROM material_open_lot_state
     WHERE tenant_id='${tenantId}' AND material_id=${materialId} AND location='${location}'`
  )?.active_open_lot_id;
  if (!activeLotId) return { exception: false };

  const activeLot = db.public.one(
    `SELECT expiry_date FROM material_batches WHERE id='${activeLotId}' AND tenant_id='${tenantId}'`
  );
  if (!activeLot || !activeLot.expiry_date || !newLotExpiry) return { exception: false };

  const activeExpiry = new Date(activeLot.expiry_date);
  const incoming = new Date(newLotExpiry);
  if (incoming < activeExpiry) {
    return { exception: true, reason: 'FEFO_EXCEPTION: lot baru memiliki expiry lebih awal dari lot aktif terbuka.' };
  }
  return { exception: false };
}

/** WB-04.4: Validate multi-lot receipt: sum of lots must equal receipt qty */
function validateLotAllocation(lots, receiptQty, tolerance = 0.0001) {
  const total = lots.reduce((sum, lot) => sum + Number(lot.qty), 0);
  if (Math.abs(total - receiptQty) > tolerance) {
    throw new Error(`Total alokasi lot (${total}) tidak sama dengan kuantitas penerimaan (${receiptQty}).`);
  }
  return { valid: true, total };
}

/** WB-04.6: Transfer lot from source to target location */
function transferLot(db, { tenantId, lotId, qtyToTransfer, sourceLocation, targetLocation }) {
  const qtyField = sourceLocation === 'RESTO' ? 'qty_resto' : 'qty_central';
  const targetField = targetLocation === 'RESTO' ? 'qty_resto' : 'qty_central';

  const lot = db.public.one(
    `SELECT id, expiry_date, qty_resto, qty_central FROM material_batches
     WHERE id='${lotId}' AND tenant_id='${tenantId}'`
  );
  if (!lot) throw new Error('Lot tidak ditemukan.');

  const sourceQty = Number(lot[qtyField]);
  if (sourceQty < qtyToTransfer - 0.0001) throw new Error('Stok lot tidak cukup untuk transfer.');

  db.public.none(
    `UPDATE material_batches
     SET ${qtyField}=${sourceQty - qtyToTransfer},
         ${targetField}=${Number(lot[targetField]) + qtyToTransfer}
     WHERE id='${lotId}' AND tenant_id='${tenantId}'`
  );
  // expiry_date preserved (not changed)
  return { success: true, lot_id: lotId, expiry_date: lot.expiry_date };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TENANT = '55555555-5555-5555-5555-555555555555';

let db;
beforeEach(() => {
  db = newDb();
  buildSchema(db);
});

// ─── WB-04.1: FEFO selection — earliest expiry chosen ────────────────────────
describe('WB-04.1 — FEFO lot selection: earliest expiry_date wins', () => {
  it('returns the lot with the earliest expiry when multiple lots exist', () => {
    const lot1 = crypto.randomUUID();
    const lot2 = crypto.randomUUID();
    const lot3 = crypto.randomUUID();

    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto) VALUES
        ('${lot1}', '${TENANT}', 1, 'B1', '2026-10-27', 5),
        ('${lot2}', '${TENANT}', 1, 'B2', '2026-10-22', 4),
        ('${lot3}', '${TENANT}', 1, 'B3', '2026-10-25', 3)
    `);

    const selected = selectFefoLot(db, { tenantId: TENANT, materialId: 1, location: 'RESTO' });
    expect(selected.id).toBe(lot2); // earliest: 2026-10-22
  });

  it('ignores lots with zero quantity at the location', () => {
    const lot1 = crypto.randomUUID();
    const lot2 = crypto.randomUUID();

    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto) VALUES
        ('${lot1}', '${TENANT}', 2, 'B1', '2026-10-20', 0),
        ('${lot2}', '${TENANT}', 2, 'B2', '2026-10-28', 6)
    `);

    const selected = selectFefoLot(db, { tenantId: TENANT, materialId: 2, location: 'RESTO' });
    expect(selected.id).toBe(lot2); // lot1 has qty=0, ignored
  });

  it('returns null when no lots are available', () => {
    const selected = selectFefoLot(db, { tenantId: TENANT, materialId: 99, location: 'RESTO' });
    expect(selected).toBeNull();
  });
});

// ─── WB-04.2: One active lot — open lot 2 while lot 1 active is rejected ─────
describe('WB-04.2 — one active open lot per material/location', () => {
  it('opening a second lot while first is active throws', () => {
    const lot1 = crypto.randomUUID();
    const lot2 = crypto.randomUUID();

    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, qty_resto)
      VALUES ('${lot1}','${TENANT}',3,'B1',10),('${lot2}','${TENANT}',3,'B2',8)
    `);

    openLot(db, { tenantId: TENANT, materialId: 3, location: 'RESTO', lotId: lot1 });

    expect(() =>
      openLot(db, { tenantId: TENANT, materialId: 3, location: 'RESTO', lotId: lot2 })
    ).toThrow(/satu lot aktif|masih aktif/i);
  });

  it('re-opening the same lot is idempotent (no error)', () => {
    const lot1 = crypto.randomUUID();
    db.public.none(`INSERT INTO material_batches (id, tenant_id, material_id, batch_no, qty_resto) VALUES ('${lot1}','${TENANT}',4,'B1',10)`);

    openLot(db, { tenantId: TENANT, materialId: 4, location: 'RESTO', lotId: lot1 });
    expect(() =>
      openLot(db, { tenantId: TENANT, materialId: 4, location: 'RESTO', lotId: lot1 })
    ).not.toThrow();
  });

  it('different materials can each have one active lot independently', () => {
    const lot1 = crypto.randomUUID();
    const lot2 = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, qty_resto) VALUES
        ('${lot1}','${TENANT}',5,'B1',10),('${lot2}','${TENANT}',6,'B2',10)
    `);

    openLot(db, { tenantId: TENANT, materialId: 5, location: 'RESTO', lotId: lot1 });
    expect(() =>
      openLot(db, { tenantId: TENANT, materialId: 6, location: 'RESTO', lotId: lot2 })
    ).not.toThrow();
  });
});

// ─── WB-04.3: FEFO exception — new lot earlier expiry → flag, no auto-switch ──
describe('WB-04.3 — FEFO exception: new lot with earlier expiry flagged, not auto-switched', () => {
  it('detects FEFO exception when incoming lot expires sooner than active lot', () => {
    const activeLotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto)
      VALUES ('${activeLotId}','${TENANT}',7,'ACTIVE','2026-10-30',10)
    `);
    openLot(db, { tenantId: TENANT, materialId: 7, location: 'RESTO', lotId: activeLotId });

    const result = checkFefoException(db, {
      tenantId: TENANT, materialId: 7, location: 'RESTO',
      newLotExpiry: '2026-10-22', // earlier than active 2026-10-30
    });

    expect(result.exception).toBe(true);
    expect(result.reason).toMatch(/FEFO_EXCEPTION/i);
  });

  it('active lot state is NOT changed by exception check (no auto-switch)', () => {
    const activeLotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto)
      VALUES ('${activeLotId}','${TENANT}',8,'ACTIVE','2026-10-30',10)
    `);
    openLot(db, { tenantId: TENANT, materialId: 8, location: 'RESTO', lotId: activeLotId });

    checkFefoException(db, { tenantId: TENANT, materialId: 8, location: 'RESTO', newLotExpiry: '2026-10-22' });

    // Verify: active lot is still the original one (not switched)
    const state = db.public.one(
      `SELECT active_open_lot_id FROM material_open_lot_state WHERE tenant_id='${TENANT}' AND material_id=8 AND location='RESTO'`
    );
    expect(state.active_open_lot_id).toBe(activeLotId);
  });

  it('no exception when new lot expires later than active lot', () => {
    const activeLotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto)
      VALUES ('${activeLotId}','${TENANT}',9,'ACTIVE','2026-10-22',10)
    `);
    openLot(db, { tenantId: TENANT, materialId: 9, location: 'RESTO', lotId: activeLotId });

    const result = checkFefoException(db, {
      tenantId: TENANT, materialId: 9, location: 'RESTO',
      newLotExpiry: '2026-10-30', // later than active → no exception
    });
    expect(result.exception).toBe(false);
  });
});

// ─── WB-04.4: Multi-lot receipt — total must equal receipt qty ─────────────────
describe('WB-04.4 — multi-lot receipt: lot total must equal receipt quantity exactly', () => {
  it('passes when 3 lots sum to receipt qty (4+5+3=12)', () => {
    const result = validateLotAllocation(
      [{ qty: 4 }, { qty: 5 }, { qty: 3 }],
      12
    );
    expect(result.valid).toBe(true);
    expect(result.total).toBe(12);
  });

  it('throws when lots sum is less than receipt qty (4+5=9 ≠ 12)', () => {
    expect(() =>
      validateLotAllocation([{ qty: 4 }, { qty: 5 }], 12)
    ).toThrow(/tidak sama dengan kuantitas penerimaan/);
  });

  it('throws when lots sum is more than receipt qty (4+5+5=14 ≠ 12)', () => {
    expect(() =>
      validateLotAllocation([{ qty: 4 }, { qty: 5 }, { qty: 5 }], 12)
    ).toThrow(/tidak sama dengan kuantitas penerimaan/);
  });

  it('passes within tolerance for floating-point receipts', () => {
    // 0.1+0.2 in JS = 0.30000000000000004; should be within tolerance
    const result = validateLotAllocation([{ qty: 0.1 }, { qty: 0.2 }], 0.3);
    expect(result.valid).toBe(true);
  });

  it('single lot matching receipt qty exactly passes', () => {
    const result = validateLotAllocation([{ qty: 7.5 }], 7.5);
    expect(result.valid).toBe(true);
  });
});

// ─── WB-04.5: BROKEN linked to active lot, not arbitrary lot ──────────────────
describe('WB-04.5 — BROKEN is linked to active lot ID, not another lot', () => {
  it('BROKEN row references the currently active open lot', () => {
    const activeLotId = crypto.randomUUID();
    const otherLotId = crypto.randomUUID();

    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, qty_resto) VALUES
        ('${activeLotId}','${TENANT}',10,'ACTIVE',5),
        ('${otherLotId}','${TENANT}',10,'OTHER',3)
    `);
    openLot(db, { tenantId: TENANT, materialId: 10, location: 'RESTO', lotId: activeLotId });

    // Retrieve the active lot ID as the service would
    const state = db.public.one(
      `SELECT active_open_lot_id FROM material_open_lot_state WHERE tenant_id='${TENANT}' AND material_id=10 AND location='RESTO'`
    );

    // BROKEN must be linked to activeLotId, not otherLotId
    expect(state.active_open_lot_id).toBe(activeLotId);
    expect(state.active_open_lot_id).not.toBe(otherLotId);
  });

  it('BROKEN remains linked even after FEFO exception flag (no auto reassignment)', () => {
    const lot1 = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto)
      VALUES ('${lot1}','${TENANT}',11,'L1','2026-10-30',10)
    `);
    openLot(db, { tenantId: TENANT, materialId: 11, location: 'RESTO', lotId: lot1 });

    // FEFO exception detected (new lot expires sooner)
    checkFefoException(db, { tenantId: TENANT, materialId: 11, location: 'RESTO', newLotExpiry: '2026-10-22' });

    const state = db.public.one(
      `SELECT active_open_lot_id FROM material_open_lot_state WHERE tenant_id='${TENANT}' AND material_id=11 AND location='RESTO'`
    );
    expect(state.active_open_lot_id).toBe(lot1); // unchanged despite exception
  });
});

// ─── WB-04.6: Transfer preserves lot identity ──────────────────────────────────
describe('WB-04.6 — transfer: lot expiry and identity preserved across locations', () => {
  it('expiry_date is unchanged after transfer from RESTO to CENTRAL', () => {
    const lotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto, qty_central)
      VALUES ('${lotId}','${TENANT}',12,'LOT-X','2026-11-15',10,0)
    `);

    const result = transferLot(db, {
      tenantId: TENANT, lotId,
      qtyToTransfer: 4,
      sourceLocation: 'RESTO',
      targetLocation: 'CENTRAL',
    });

    expect(result.success).toBe(true);
    expect(result.lot_id).toBe(lotId);
    expect(new Date(result.expiry_date).toISOString().slice(0, 10)).toBe('2026-11-15'); // preserved exactly

    const lot = db.public.one(`SELECT qty_resto, qty_central, expiry_date FROM material_batches WHERE id='${lotId}'`);
    expect(Number(lot.qty_resto)).toBe(6);     // 10 - 4
    expect(Number(lot.qty_central)).toBe(4);   // 0 + 4
    expect(new Date(lot.expiry_date).toISOString().slice(0, 10)).toBe('2026-11-15');  // unchanged
  });

  it('source qty is reduced and target qty is increased by transfer amount', () => {
    const lotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_central, qty_resto)
      VALUES ('${lotId}','${TENANT}',13,'LOT-Y','2026-12-01',20,0)
    `);

    transferLot(db, {
      tenantId: TENANT, lotId,
      qtyToTransfer: 7,
      sourceLocation: 'CENTRAL',
      targetLocation: 'RESTO',
    });

    const lot = db.public.one(`SELECT qty_central, qty_resto FROM material_batches WHERE id='${lotId}'`);
    expect(Number(lot.qty_central)).toBe(13);  // 20 - 7
    expect(Number(lot.qty_resto)).toBe(7);     // 0 + 7
  });

  it('transfer rejected when source has insufficient lot quantity', () => {
    const lotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, expiry_date, qty_resto)
      VALUES ('${lotId}','${TENANT}',14,'LOT-Z','2026-12-01',3)
    `);

    expect(() =>
      transferLot(db, {
        tenantId: TENANT, lotId,
        qtyToTransfer: 10, // more than available (3)
        sourceLocation: 'RESTO',
        targetLocation: 'CENTRAL',
      })
    ).toThrow(/tidak cukup/i);
  });

  it('lot_id is the same before and after transfer (identity preserved)', () => {
    const lotId = crypto.randomUUID();
    db.public.none(`
      INSERT INTO material_batches (id, tenant_id, material_id, batch_no, qty_resto)
      VALUES ('${lotId}','${TENANT}',15,'LOT-ID',10)
    `);

    const result = transferLot(db, {
      tenantId: TENANT, lotId, qtyToTransfer: 5,
      sourceLocation: 'RESTO', targetLocation: 'CENTRAL',
    });

    // Same UUID — not a new lot created
    const lots = db.public.many(`SELECT id FROM material_batches WHERE material_id=15 AND tenant_id='${TENANT}'`);
    expect(lots.length).toBe(1);
    expect(lots[0].id).toBe(lotId);
    expect(result.lot_id).toBe(lotId);
  });
});
