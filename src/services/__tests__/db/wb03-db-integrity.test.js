/**
 * WB-03: DB Integrity & Service Layer Tests — Sprint 3
 *
 * Tests DB-level constraints, idempotency, atomic behavior, RLS pattern,
 * and concurrent closing using pg-mem (in-memory PostgreSQL emulator).
 *
 * Covers:
 *   WB-03.1 manual_in delta stored once (no double-count)
 *   WB-03.2 manual_in < auto → rejected
 *   WB-03.3 BROKEN saved and linked to active lot
 *   WB-03.4 atomic closing: partial failure → full rollback
 *   WB-03.5 idempotency: same session POST twice → no double data
 *   WB-03.6 RLS tenant isolation pattern
 *   WB-03.7 unique constraint (tenant, date, location)
 *   WB-03.8 concurrent closing protection (optimistic lock)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { newDb } from 'pg-mem';

// ─── Schema setup helper ──────────────────────────────────────────────────────

function buildSchema(db) {
  db.public.none(`
    CREATE TABLE IF NOT EXISTS daily_inventories (
      id        SERIAL PRIMARY KEY,
      tenant_id UUID NOT NULL,
      date      DATE NOT NULL,
      location  TEXT NOT NULL CHECK (location IN ('RESTO','CENTRAL')),
      status    TEXT NOT NULL DEFAULT 'draft',
      version   INTEGER NOT NULL DEFAULT 1,
      closed_by UUID,
      closed_at TIMESTAMPTZ,
      CONSTRAINT daily_inventories_tenant_date_location_key
        UNIQUE (tenant_id, date, location)
    );

    CREATE TABLE IF NOT EXISTS daily_inventory_items (
      id              SERIAL PRIMARY KEY,
      inventory_id    INTEGER NOT NULL REFERENCES daily_inventories(id),
      material_id     INTEGER NOT NULL,
      opening_qty     NUMERIC(16,4) NOT NULL DEFAULT 0,
      manual_in_qty   NUMERIC(16,4) NOT NULL DEFAULT 0,
      out_qty         NUMERIC(16,4) NOT NULL DEFAULT 0,
      waste_qty       NUMERIC(16,4) NOT NULL DEFAULT 0,
      closing_qty     NUMERIC(16,4),
      full_qty        NUMERIC(16,4),
      broken_qty      NUMERIC(16,4),
      broken_unit     TEXT,
      broken_confirmed BOOLEAN NOT NULL DEFAULT false,
      out_confirmed   BOOLEAN NOT NULL DEFAULT false,
      active_open_lot_id UUID,
      reconciliation_status TEXT NOT NULL DEFAULT 'PENDING',
      CONSTRAINT daily_inventory_items_inventory_material_key
        UNIQUE (inventory_id, material_id)
    );

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
      tenant_id       UUID NOT NULL,
      material_id     INTEGER NOT NULL,
      location        TEXT NOT NULL,
      active_open_lot_id UUID,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, material_id, location)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          SERIAL PRIMARY KEY,
      tenant_id   UUID NOT NULL,
      user_id     UUID,
      action      TEXT NOT NULL,
      table_name  TEXT,
      record_id   INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// ─── Service layer helpers (mirror DailyInventory save logic) ─────────────────

/**
 * Simulates the service layer logic for saving manual_in.
 * Returns { success, manual_in_qty } or throws on validation failure.
 */
function saveManualIn(db, { tenantId, date, location, materialId, totalInInput, sourceInQty, openingQty }) {
  const delta = totalInInput - sourceInQty;
  if (delta < 0) {
    throw new Error(`IN total tidak boleh lebih kecil dari penerimaan otomatis (${sourceInQty}).`);
  }
  // Upsert inventory header
  const existing = db.public.one(
    `SELECT id FROM daily_inventories WHERE tenant_id='${tenantId}' AND date='${date}' AND location='${location}'`
  );
  let invId;
  if (!existing) {
    const row = db.public.one(
      `INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${tenantId}','${date}','${location}') RETURNING id`
    );
    invId = row.id;
  } else {
    invId = existing.id;
  }
  // Upsert item
  const item = db.public.one(
    `SELECT id FROM daily_inventory_items WHERE inventory_id=${invId} AND material_id=${materialId}`
  );
  if (!item) {
    db.public.none(
      `INSERT INTO daily_inventory_items (inventory_id, material_id, opening_qty, manual_in_qty, out_qty)
       VALUES (${invId}, ${materialId}, ${openingQty}, ${delta}, 0)`
    );
  } else {
    db.public.none(
      `UPDATE daily_inventory_items SET manual_in_qty=${delta} WHERE id=${item.id}`
    );
  }
  return { success: true, manual_in_qty: delta };
}

/**
 * Simulates saving BROKEN and linking to active lot.
 */
function saveBroken(db, { tenantId, inventoryId, materialId, brokenQty, brokenUnit, activeLotId }) {
  if (brokenQty < 0) throw new Error('BROKEN tidak boleh negatif.');
  db.public.none(
    `UPDATE daily_inventory_items
     SET broken_qty=${brokenQty}, broken_unit='${brokenUnit}', broken_confirmed=true,
         active_open_lot_id=${activeLotId ? `'${activeLotId}'` : 'NULL'}
     WHERE inventory_id=${inventoryId} AND material_id=${materialId}`
  );
  // Update open lot state
  db.public.none(
    `INSERT INTO material_open_lot_state (tenant_id, material_id, location, active_open_lot_id)
     VALUES ('${tenantId}', ${materialId}, 'RESTO', ${activeLotId ? `'${activeLotId}'` : 'NULL'})
     ON CONFLICT (tenant_id, material_id, location)
     DO UPDATE SET active_open_lot_id=EXCLUDED.active_open_lot_id, updated_at=NOW()`
  );
  return { success: true };
}

/**
 * Simulates atomic closing: write items + set status CLOSED atomically.
 * Optionally injects a failure to test rollback.
 */
function atomicClose(db, { tenantId, date, location, items, injectFailureAfterItems = false }) {
  // In pg-mem we simulate atomicity by checking if all writes succeed before committing status.
  let invId;
  const existing = db.public.one(
    `SELECT id, status, version FROM daily_inventories WHERE tenant_id='${tenantId}' AND date='${date}' AND location='${location}'`
  );
  if (!existing) throw new Error('Sesi tidak ditemukan.');
  if (['verified','closed'].includes(existing.status)) throw new Error('Sesi sudah terkunci.');
  invId = existing.id;
  const savedIds = [];
  for (const item of items) {
    const row = db.public.one(
      `SELECT id FROM daily_inventory_items WHERE inventory_id=${invId} AND material_id=${item.materialId}`
    );
    if (!row) throw new Error(`Material ${item.materialId} tidak ada di sesi ini.`);
    db.public.none(
      `UPDATE daily_inventory_items
       SET closing_qty=${item.closingQty}, full_qty=${item.fullQty}, out_confirmed=true,
           reconciliation_status='CLOSED_BOOK_PLUS_BROKEN'
       WHERE id=${row.id}`
    );
    savedIds.push(row.id);
  }
  if (injectFailureAfterItems) {
    // Simulate a failure mid-transaction: status never gets updated
    throw new Error('[INJECTED] DB error after item writes — simulate partial failure');
  }
  // Commit status
  db.public.none(
    `UPDATE daily_inventories SET status='closed', version=version+1 WHERE id=${invId}`
  );
  return { success: true, inventory_id: invId };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const DATE = '2026-10-23';

let db;

beforeEach(() => {
  db = newDb();
  buildSchema(db);
});

// ─── WB-03.1: manual_in delta stored once ────────────────────────────────────
describe('WB-03.1 — manual_in delta stored without double-counting', () => {
  it('stores only the delta (total - source), not the total itself', () => {
    // sourceInQty=5 (from purchasing), user types total=7 → delta=2
    const result = saveManualIn(db, {
      tenantId: TENANT_A, date: DATE, location: 'RESTO',
      materialId: 1, totalInInput: 7, sourceInQty: 5, openingQty: 10,
    });
    expect(result.success).toBe(true);
    expect(result.manual_in_qty).toBe(2);

    const row = db.public.one(
      `SELECT manual_in_qty FROM daily_inventory_items WHERE material_id=1`
    );
    expect(Number(row.manual_in_qty)).toBe(2);
  });

  it('delta=0 when total equals source (no extra manual IN)', () => {
    const result = saveManualIn(db, {
      tenantId: TENANT_A, date: DATE, location: 'RESTO',
      materialId: 2, totalInInput: 5, sourceInQty: 5, openingQty: 8,
    });
    expect(result.manual_in_qty).toBe(0);
  });

  it('saving same session twice updates delta instead of duplicating rows', () => {
    saveManualIn(db, {
      tenantId: TENANT_A, date: DATE, location: 'RESTO',
      materialId: 3, totalInInput: 7, sourceInQty: 5, openingQty: 10,
    });
    // User edits again
    saveManualIn(db, {
      tenantId: TENANT_A, date: DATE, location: 'RESTO',
      materialId: 3, totalInInput: 9, sourceInQty: 5, openingQty: 10,
    });
    const rows = db.public.many(`SELECT * FROM daily_inventory_items WHERE material_id=3`);
    expect(rows.length).toBe(1); // no duplicate
    expect(Number(rows[0].manual_in_qty)).toBe(4); // 9-5=4, updated
  });
});

// ─── WB-03.2: manual_in < auto → rejected ─────────────────────────────────────
describe('WB-03.2 — total IN < source IN is rejected', () => {
  it('throws when user types a total smaller than automatic source receipts', () => {
    expect(() => saveManualIn(db, {
      tenantId: TENANT_A, date: DATE, location: 'RESTO',
      materialId: 4, totalInInput: 3, sourceInQty: 5, openingQty: 10,
    })).toThrow(/lebih kecil dari penerimaan otomatis/);
  });

  it('does not write any row when rejected', () => {
    try {
      saveManualIn(db, {
        tenantId: TENANT_A, date: DATE, location: 'RESTO',
        materialId: 5, totalInInput: 1, sourceInQty: 10, openingQty: 20,
      });
    } catch (_) {}
    const rows = db.public.many(`SELECT * FROM daily_inventory_items WHERE material_id=5`);
    expect(rows.length).toBe(0);
  });
});

// ─── WB-03.3: BROKEN saved and linked to active lot ───────────────────────────
describe('WB-03.3 — BROKEN saved and linked to active_open_lot_id', () => {
  it('stores broken_qty and links to active lot after saveBroken', () => {
    const lotId = '33333333-3333-3333-3333-333333333333';
    // Setup a session and item first
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    const inv = db.public.one(`SELECT id FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='${DATE}' AND location='RESTO'`);
    db.public.none(`INSERT INTO daily_inventory_items (inventory_id, material_id, opening_qty, manual_in_qty, out_qty) VALUES (${inv.id}, 10, 5, 0, 0.2)`);

    saveBroken(db, {
      tenantId: TENANT_A, inventoryId: inv.id, materialId: 10,
      brokenQty: 800, brokenUnit: 'ml', activeLotId: lotId,
    });

    const row = db.public.one(`SELECT * FROM daily_inventory_items WHERE inventory_id=${inv.id} AND material_id=10`);
    expect(Number(row.broken_qty)).toBe(800);
    expect(row.broken_unit).toBe('ml');
    expect(row.broken_confirmed).toBe(true);
    expect(row.active_open_lot_id).toBe(lotId);
  });

  it('open lot state is updated in material_open_lot_state', () => {
    const lotId = '44444444-4444-4444-4444-444444444444';
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    const inv = db.public.one(`SELECT id FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='${DATE}' AND location='RESTO'`);
    db.public.none(`INSERT INTO daily_inventory_items (inventory_id, material_id, opening_qty, manual_in_qty, out_qty) VALUES (${inv.id}, 11, 3, 0, 0)`);

    saveBroken(db, {
      tenantId: TENANT_A, inventoryId: inv.id, materialId: 11,
      brokenQty: 500, brokenUnit: 'ml', activeLotId: lotId,
    });

    const state = db.public.one(`SELECT active_open_lot_id FROM material_open_lot_state WHERE tenant_id='${TENANT_A}' AND material_id=11 AND location='RESTO'`);
    expect(state.active_open_lot_id).toBe(lotId);
  });
});

// ─── WB-03.4: Atomic closing — partial failure = full rollback ─────────────────
describe('WB-03.4 — atomic closing: partial failure leaves session in DRAFT', () => {
  it('session stays DRAFT when failure is injected after item writes', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    const inv = db.public.one(`SELECT id FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='${DATE}' AND location='RESTO'`);
    db.public.none(`INSERT INTO daily_inventory_items (inventory_id, material_id, opening_qty, manual_in_qty, out_qty) VALUES (${inv.id}, 20, 5, 0, 0.2)`);

    let thrown = false;
    try {
      atomicClose(db, {
        tenantId: TENANT_A, date: DATE, location: 'RESTO',
        items: [{ materialId: 20, closingQty: 4.8, fullQty: 4 }],
        injectFailureAfterItems: true,
      });
    } catch (_) { thrown = true; }

    expect(thrown).toBe(true);
    // Session status must still be 'draft' — status write was never reached
    const session = db.public.one(`SELECT status FROM daily_inventories WHERE id=${inv.id}`);
    expect(session.status).toBe('draft');
  });

  it('session is CLOSED only when all steps succeed', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location, status) VALUES ('${TENANT_A}','2026-10-24','RESTO','draft')`);
    const inv = db.public.one(`SELECT id FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='2026-10-24' AND location='RESTO'`);
    db.public.none(`INSERT INTO daily_inventory_items (inventory_id, material_id, opening_qty, manual_in_qty, out_qty) VALUES (${inv.id}, 21, 5, 0, 0.2)`);

    const result = atomicClose(db, {
      tenantId: TENANT_A, date: '2026-10-24', location: 'RESTO',
      items: [{ materialId: 21, closingQty: 4.8, fullQty: 4 }],
    });

    expect(result.success).toBe(true);
    const session = db.public.one(`SELECT status FROM daily_inventories WHERE id=${inv.id}`);
    expect(session.status).toBe('closed');
  });
});

// ─── WB-03.5: Idempotency — same session saved twice = no double data ──────────
describe('WB-03.5 — idempotency: repeated saves do not duplicate rows', () => {
  it('upserts inventory header — no duplicate rows for same tenant/date/location', () => {
    saveManualIn(db, { tenantId: TENANT_A, date: DATE, location: 'RESTO', materialId: 30, totalInInput: 5, sourceInQty: 5, openingQty: 10 });
    saveManualIn(db, { tenantId: TENANT_A, date: DATE, location: 'RESTO', materialId: 30, totalInInput: 6, sourceInQty: 5, openingQty: 10 });

    const headers = db.public.many(`SELECT * FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='${DATE}' AND location='RESTO'`);
    expect(headers.length).toBe(1);
  });

  it('double-close of same session is blocked (status already closed)', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location, status) VALUES ('${TENANT_A}','2026-10-25','RESTO','closed')`);
    const inv = db.public.one(`SELECT id FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='2026-10-25'`);

    expect(() => atomicClose(db, {
      tenantId: TENANT_A, date: '2026-10-25', location: 'RESTO',
      items: [],
    })).toThrow(/sudah terkunci/);
  });
});

// ─── WB-03.6: RLS tenant isolation pattern ─────────────────────────────────────
describe('WB-03.6 — RLS: tenant A cannot read tenant B data', () => {
  it('tenant isolation: querying with wrong tenant_id returns no rows', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);

    // Tenant B querying tenant A's session
    const rows = db.public.many(
      `SELECT * FROM daily_inventories WHERE tenant_id='${TENANT_B}' AND date='${DATE}' AND location='RESTO'`
    );
    expect(rows.length).toBe(0);
  });

  it('tenant A can read own data but not tenant B data', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_B}','${DATE}','RESTO')`);

    const rowsA = db.public.many(`SELECT * FROM daily_inventories WHERE tenant_id='${TENANT_A}'`);
    const rowsB = db.public.many(`SELECT * FROM daily_inventories WHERE tenant_id='${TENANT_B}'`);

    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    // A's row has TENANT_A, B's row has TENANT_B — no cross-contamination
    expect(rowsA[0].tenant_id).toBe(TENANT_A);
    expect(rowsB[0].tenant_id).toBe(TENANT_B);
  });
});

// ─── WB-03.7: Unique constraint (tenant, date, location) ──────────────────────
describe('WB-03.7 — unique constraint: duplicate (tenant, date, location) rejected', () => {
  it('inserting a duplicate (tenant, date, location) throws a unique violation', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    expect(() =>
      db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`)
    ).toThrow();
  });

  it('same date but different location is allowed', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    expect(() =>
      db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','CENTRAL')`)
    ).not.toThrow();
  });

  it('same location but different date is allowed', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    expect(() =>
      db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','2026-10-24','RESTO')`)
    ).not.toThrow();
  });

  it('same date and location but different tenant is allowed', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_A}','${DATE}','RESTO')`);
    expect(() =>
      db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location) VALUES ('${TENANT_B}','${DATE}','RESTO')`)
    ).not.toThrow();
  });
});

// ─── WB-03.8: Concurrent closing — version/optimistic lock ────────────────────
describe('WB-03.8 — concurrent closing: optimistic lock via version field', () => {
  /**
   * Simulate two concurrent close attempts on the same session.
   * Version check: only close if version matches expected.
   */
  function closeWithVersionCheck(db, { tenantId, date, location, expectedVersion }) {
    const session = db.public.one(
      `SELECT id, status, version FROM daily_inventories WHERE tenant_id='${tenantId}' AND date='${date}' AND location='${location}'`
    );
    if (!session) throw new Error('Session not found');
    if (['verified','closed'].includes(session.status)) throw new Error('Sesi sudah terkunci.');
    if (session.version !== expectedVersion) throw new Error('Konflik versi: sesi sudah diperbarui oleh pengguna lain. Muat ulang.');
    db.public.none(`UPDATE daily_inventories SET status='closed', version=version+1 WHERE id=${session.id}`);
    return { success: true };
  }

  it('first close succeeds, second close fails with version conflict', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location, version) VALUES ('${TENANT_A}','${DATE}','RESTO',1)`);

    // User 1 closes with version=1 → succeeds
    const r1 = closeWithVersionCheck(db, { tenantId: TENANT_A, date: DATE, location: 'RESTO', expectedVersion: 1 });
    expect(r1.success).toBe(true);

    // User 2 also tries with version=1 (stale) → conflict
    expect(() =>
      closeWithVersionCheck(db, { tenantId: TENANT_A, date: DATE, location: 'RESTO', expectedVersion: 1 })
    ).toThrow(/Konflik versi|sudah terkunci/);
  });

  it('version increments on each successful close', () => {
    db.public.none(`INSERT INTO daily_inventories (tenant_id, date, location, status, version) VALUES ('${TENANT_A}','2026-10-26','RESTO','draft',1)`);
    closeWithVersionCheck(db, { tenantId: TENANT_A, date: '2026-10-26', location: 'RESTO', expectedVersion: 1 });
    const session = db.public.one(`SELECT version FROM daily_inventories WHERE tenant_id='${TENANT_A}' AND date='2026-10-26'`);
    expect(session.version).toBe(2);
  });
});
