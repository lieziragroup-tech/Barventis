import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBuilderOps = [];

vi.mock('@supabase/supabase-js', () => {
  const createBuilder = (table) => {
    const chain = {
      _table: table,
      _op: null,
      _eqs: [],
      _payload: null,
      select: vi.fn(() => {
        if (!chain._op) chain._op = 'select';
        return chain;
      }),
      insert: vi.fn((payload) => {
        chain._op = 'insert';
        chain._payload = payload;
        return chain;
      }),
      upsert: vi.fn((payload) => {
        chain._op = 'upsert';
        chain._payload = payload;
        return chain;
      }),
      update: vi.fn((payload) => {
        chain._op = 'update';
        chain._payload = payload;
        return chain;
      }),
      delete: vi.fn(() => {
        chain._op = 'delete';
        return chain;
      }),
      eq: vi.fn((col, val) => {
        chain._eqs.push([col, val]);
        return chain;
      }),
      neq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      ilike: vi.fn(() => chain),
      or: vi.fn(() => chain),
      not: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      range: vi.fn(() => chain),
      single: vi.fn(async () => ({
        data: Array.isArray(chain._payload)
          ? { id: 1, ...chain._payload[0] }
          : (chain._payload && typeof chain._payload === 'object'
            ? { id: 1, name: 'Mock Material', unit: 'pcs', price: 1000, new_price: 1000, qty_resto: 5, qty_central: 0, ...chain._payload }
            : { id: 1, name: 'Mock Material', unit: 'pcs', price: 1000, new_price: 1000, qty_resto: 5, qty_central: 0 }),
        error: null
      })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (resolve) => resolve({ data: [], error: null, count: 0 })
    };
    mockBuilderOps.push({ table, chain });
    return chain;
  };

  return {
    createClient: vi.fn(() => ({
      from: vi.fn((table) => createBuilder(table)),
      rpc: vi.fn(async () => ({ data: null, error: { message: 'not implemented' } })),
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })),
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
        signOut: vi.fn(async () => ({}))
      },
      storage: { from: vi.fn() },
      channel: vi.fn(),
      removeChannel: vi.fn(),
      removeAllChannels: vi.fn(),
      getChannels: vi.fn()
    }))
  };
});

import { supabase } from '../../lib/supabase';
import { materialsRepo } from '../../data/materialsRepo';
import { api } from '../api';
import { fefoApi, adjustmentApi } from '../upgradeModulesApi';

describe('Multi-Branch Client Isolation (supabase.js interceptor)', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    mockBuilderOps.length = 0;
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = {};
    }
    globalThis.window.__activeBranchId = 'branch-bsd-uuid';
    delete globalThis.window.__activeUserRole;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window.__activeBranchId = null;
      delete globalThis.window.__activeUserRole;
    }
  });

  it('otomatis memfilter .select() dan menyuntikkan branch_id pada .insert()/.upsert() untuk tabel per cabang', () => {
    const matBuilder = supabase.from('materials');
    matBuilder.select('*');
    expect(matBuilder._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']);

    const insBuilder = supabase.from('purchase_entries');
    insBuilder.insert({ material_id: 10, qty: 2 });
    expect(insBuilder._payload).toEqual({
      material_id: 10,
      qty: 2,
      branch_id: 'branch-bsd-uuid'
    });

    const batchUpsertBuilder = supabase.from('recipes');
    batchUpsertBuilder.upsert([{ menu_name: 'Latte' }, { menu_name: 'Americano', branch_id: 'custom-id' }]);
    expect(batchUpsertBuilder._payload).toEqual([
      { menu_name: 'Latte', branch_id: 'branch-bsd-uuid' },
      { menu_name: 'Americano', branch_id: 'custom-id' }
    ]);

    const trimBuilder = supabase.from('production_trimming_batches');
    trimBuilder.update({ status: 'STEP2_COMPLETED' });
    expect(trimBuilder._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']);
  });

  it('tidak menyuntikkan filter cabang pada tabel global atau saat menggunakan unscopedFrom()', () => {
    const branchesBuilder = supabase.from('branches');
    branchesBuilder.select('*');
    expect(branchesBuilder._eqs).toEqual([]);

    const unscopedMat = supabase.unscopedFrom('materials');
    unscopedMat.select('*');
    expect(unscopedMat._eqs).toEqual([]);
  });

  it('tidak memfilter branch_id jika __activeBranchId kosong dan role belum disetel', () => {
    globalThis.window.__activeBranchId = null;
    const matBuilder = supabase.from('materials');
    matBuilder.select('*');
    matBuilder.insert({ name: 'Gula Aren' });
    expect(matBuilder._eqs).toEqual([]);
    expect(matBuilder._payload).toEqual({ name: 'Gula Aren' });
  });

  it('menolak operasi CRUD non-admin (fail-closed) jika __activeBranchId kosong', () => {
    globalThis.window.__activeBranchId = null;
    globalThis.window.__activeUserRole = 'Staff';

    for (const table of ['materials', 'recipes', 'recipe_ingredients', 'daily_inventories', 'stock_opnames']) {
      expect(() => supabase.from(table).select('*')).toThrow(/wajib memiliki branch_id aktif/i);
      expect(() => supabase.from(table).insert({ name: 'Test' })).toThrow(/wajib memiliki branch_id aktif/i);
      expect(() => supabase.from(table).upsert({ name: 'Test' })).toThrow(/wajib memiliki branch_id aktif/i);
      expect(() => supabase.from(table).update({ name: 'Test' })).toThrow(/wajib memiliki branch_id aktif/i);
      expect(() => supabase.from(table).delete()).toThrow(/wajib memiliki branch_id aktif/i);
    }
  });

  it('menolak mutasi lintas cabang dan unscopedFrom() untuk pengguna non-admin', () => {
    globalThis.window.__activeBranchId = 'branch-bsd-uuid';
    globalThis.window.__activeUserRole = 'Barista';

    expect(() => supabase.from('materials').insert({ name: 'Matcha', branch_id: 'branch-jkt-uuid' }))
      .toThrow(/tidak diizinkan mengubah data cabang lain/i);
    expect(() => supabase.from('recipes').upsert([{ menu_name: 'Matcha Latte', branch_id: 'branch-jkt-uuid' }]))
      .toThrow(/tidak diizinkan mengubah data cabang lain/i);
    expect(() => supabase.from('daily_inventories').update({ branch_id: 'branch-jkt-uuid' }))
      .toThrow(/tidak diizinkan mengubah data cabang lain/i);
    expect(() => supabase.unscopedFrom('materials'))
      .toThrow(/tidak diizinkan menjalankan query lintas cabang/i);
  });

  it('mengizinkan Admin / Owner melakukan query lintas cabang tanpa branch_id aktif', () => {
    globalThis.window.__activeBranchId = null;
    globalThis.window.__activeUserRole = 'Admin / Owner';

    const matBuilder = supabase.from('materials');
    matBuilder.select('*');
    expect(matBuilder._eqs).toEqual([]);

    const unscoped = supabase.unscopedFrom('recipes');
    unscoped.select('*');
    expect(unscoped._eqs).toEqual([]);
  });
});

describe('Strict Branch Isolation on Materials, Recipes, and Stock API Services', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    mockBuilderOps.length = 0;
    if (typeof globalThis.window === 'undefined') {
      globalThis.window = {};
    }
  });

  afterEach(() => {
    api.setSessionData(null, null, 0.05, null, null, false, null, null);
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window.__activeBranchId = null;
      delete globalThis.window.__activeUserRole;
    }
  });

  it('menolak semua operasi CRUD non-admin pada Materials, Recipes, dan Stock saat branch_id kosong', async () => {
    api.setSessionData('tenant-1', 'user-1', 0.05, null, null, false, null, 'Staff');

    await expect(api.getMaterials()).rejects.toThrow(/branch_id aktif/i);
    await expect(api.createMaterial({ name: 'Susu Full Cream' })).rejects.toThrow(/branch_id aktif/i);
    await expect(api.updateMaterial(1, { name: 'Susu Low Fat' })).rejects.toThrow(/branch_id aktif/i);
    await expect(api.deleteMaterial(1)).rejects.toThrow(/branch_id aktif/i);

    await expect(api.getRecipes()).rejects.toThrow(/branch_id aktif/i);
    await expect(api.createRecipe({ menu_name: 'Latte', ingredients: [] })).rejects.toThrow(/branch_id aktif/i);
    await expect(api.updateRecipe(1, { menu_name: 'Latte V2', ingredients: [] })).rejects.toThrow(/branch_id aktif/i);
    await expect(api.deleteRecipe(1)).rejects.toThrow(/branch_id aktif/i);

    await expect(api.adjustStock(1, { location: 'RESTO', type: 'IN', qty: 5, notes: 'Koreksi' })).rejects.toThrow(/branch_id aktif/i);
    await expect(api.recordWaste({ material_id: 1, quantity: 1 })).rejects.toThrow(/branch_id aktif/i);
    await expect(api.getStockSnapshotAt('2026-11-13')).rejects.toThrow(/branch_id aktif/i);
    await expect(api.getDailyInventoryRecords('2026-11-13', 'RESTO')).rejects.toThrow(/branch_id aktif/i);
    await expect(fefoApi.getBatches()).rejects.toThrow(/branch_id aktif/i);
    await expect(adjustmentApi.createAdjustment({
      material_id: 1,
      opname_date: '2026-11-13',
      system_qty: 10,
      physical_qty: 8,
      variance_pct: -20,
      reason: 'Selisih'
    })).rejects.toThrow(/branch_id aktif/i);
  });

  it('menolak override lintas cabang bagi pengguna non-admin', async () => {
    api.setSessionData('tenant-1', 'user-1', 0.05, null, null, false, 'branch-bsd-uuid', 'Staff');

    await expect(api.getMaterials('branch-other-uuid')).rejects.toThrow(/cabang lain/i);
    await expect(api.createMaterial({ name: 'Kopi', branch_id: 'branch-other-uuid' })).rejects.toThrow(/cabang lain/i);
    await expect(api.createRecipe({ menu_name: 'Espresso', branch_id: 'branch-other-uuid', ingredients: [] })).rejects.toThrow(/cabang lain/i);
    await expect(api.adjustStock(1, { location: 'RESTO', type: 'IN', qty: 2, notes: 'Koreksi', branch_id: 'branch-other-uuid' })).rejects.toThrow(/cabang lain/i);
    await expect(fefoApi.getBatches(null, 'branch-other-uuid')).rejects.toThrow(/cabang lain/i);
  });

  it('menyertakan filter dan payload branch_id pada Materials, Recipes, dan Stock saat non-admin memiliki branch_id aktif', async () => {
    api.setSessionData('tenant-1', 'user-1', 0.05, null, null, false, 'branch-bsd-uuid', 'Staff');

    await api.getMaterials();
    const matSelectOp = mockBuilderOps.find(op => op.table === 'materials' && op.chain._op === 'select');
    expect(matSelectOp.chain._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']);

    await api.createMaterial({ name: 'Susu Oat', unit: 'L', price: 32000 });
    const matInsertOp = mockBuilderOps.find(op => op.table === 'materials' && op.chain._op === 'insert');
    expect(matInsertOp.chain._payload[0].branch_id).toBe('branch-bsd-uuid');

    await api.getRecipes();
    const recSelectOp = mockBuilderOps.find(op => op.table === 'recipes' && op.chain._op === 'select');
    expect(recSelectOp.chain._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']);

    await api.createRecipe({ menu_name: 'Oat Latte', selling_price_override: 35000, ingredients: [] });
    const recInsertOp = mockBuilderOps.find(op => op.table === 'recipes' && op.chain._op === 'insert');
    expect(recInsertOp.chain._payload.branch_id).toBe('branch-bsd-uuid');

    await api.adjustStock(10, { location: 'RESTO', type: 'IN', qty: 5, notes: 'Koreksi fisik' });
    const stockMatUpdateOp = mockBuilderOps.find(op => op.table === 'materials' && op.chain._op === 'update');
    expect(stockMatUpdateOp.chain._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']);
    const stockTxInsertOp = mockBuilderOps.find(op => op.table === 'transactions' && op.chain._op === 'insert');
    expect(stockTxInsertOp.chain._payload.branch_id).toBe('branch-bsd-uuid');

    await fefoApi.createBatch({ material_id: 10, batch_number: 'LOT-01', expiry_date: '2026-12-31', quantity: 5 });
    const batchInsertOp = mockBuilderOps.find(op => op.table === 'material_batches' && op.chain._op === 'insert');
    expect(batchInsertOp.chain._payload.branch_id).toBe('branch-bsd-uuid');

    await adjustmentApi.getAdjustments();
    const adjSelectOp = mockBuilderOps.find(op => op.table === 'stock_adjustments' && op.chain._op === 'select');
    expect(adjSelectOp.chain._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']);
  });

  it('materialsRepo meneruskan branchId filter pada getAll/getPaged/update/delete', async () => {
    api.setSessionData('tenant-1', 'user-1', 0.05, null, null, false, 'branch-bsd-uuid', 'Admin / Owner');

    await materialsRepo.getAll('tenant-1', 'branch-bsd-uuid');
    await materialsRepo.getPaged('tenant-1', { page: 1, pageSize: 10, branchId: 'branch-bsd-uuid' });
    await materialsRepo.update('tenant-1', 5, { name: 'Kopi Arabika' }, null, 'branch-bsd-uuid');
    await materialsRepo.delete('tenant-1', 5, 'branch-bsd-uuid');

    const selects = mockBuilderOps.filter(op => op.table === 'materials' && op.chain._op === 'select');
    expect(selects.length).toBe(2);
    selects.forEach(s => expect(s.chain._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']));

    const updates = mockBuilderOps.filter(op => op.table === 'materials' && op.chain._op === 'update');
    expect(updates.length).toBe(2);
    updates.forEach(u => expect(u.chain._eqs).toContainEqual(['branch_id', 'branch-bsd-uuid']));
  });
});
