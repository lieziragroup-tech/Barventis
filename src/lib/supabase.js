import { createClient } from '@supabase/supabase-js';

let supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) || (typeof globalThis !== 'undefined' && globalThis.process?.env?.VITE_SUPABASE_URL);
const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) || (typeof globalThis !== 'undefined' && globalThis.process?.env?.VITE_SUPABASE_ANON_KEY);

// Sanitize Supabase URL to remove accidental trailing "/rest/v1/" suffix or slashes
if (supabaseUrl && typeof supabaseUrl === 'string') {
  supabaseUrl = supabaseUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

// Fail-fast validation: Cegah inisialisasi jika file .env belum disetup
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-supabase-project')) {
  console.warn(
    '⚠️ [UMATIS] Supabase URL atau Anon Key belum dikonfigurasi di .env.\n' +
    'Silakan buat file .env di root project Anda dengan kredensial yang valid:\n' +
    'VITE_SUPABASE_URL=https://xxxxx.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=eyJ...'
  );
}

const rawSupabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
);

export const BRANCH_SCOPED_TABLES = [
  'materials', 'recipes', 'recipe_ingredients', 'recipe_versions',
  'suppliers', 'supplier_materials',
  'purchase_orders', 'purchase_order_items', 'market_lists', 'market_list_items',
  'material_batches', 'material_location_costs', 'material_open_lot_state', 'material_lot_movements_v4',
  'stock_adjustments', 'unit_conversions', 'waste_logs',
  'daily_inventories', 'daily_inventory_items', 'stock_opnames', 'stock_opname_items',
  'physical_checks', 'physical_check_items',
  'transactions', 'purchase_entries', 'invoices', 'invoice_items',
  'expected_usage', 'usage_variance',
  'production_batches', 'production_trimming_batches',
  'pos_upload_logs', 'pos_orders', 'pos_order_items',
  'pos_transactions', 'pos_transaction_items', 'pos_daily_aggregates'
];

export const isAdminRole = (role) => {
  if (!role) return false;
  const norm = String(role).toLowerCase().trim().replace(/\s+/g, ' ');
  return (
    norm === 'admin / owner' ||
    norm === 'owner' ||
    norm === 'admin' ||
    norm === 'super admin' ||
    norm === 'superadmin' ||
    norm === 'super_admin'
  );
};

const getWindowBranch = () => (typeof window !== 'undefined' && window ? window.__activeBranchId || null : null);
const getWindowRole = () => (typeof window !== 'undefined' && window ? window.__activeUserRole || null : null);

const assertBranchRuleForOperation = (table, operation, payload = null) => {
  if (!BRANCH_SCOPED_TABLES.includes(table)) return null;

  const branchId = getWindowBranch();
  const role = getWindowRole();
  const nonAdminAuthenticated = Boolean(role) && !isAdminRole(role);

  if (nonAdminAuthenticated && !branchId) {
    throw new Error(`Akses cabang tidak valid: pengguna non-admin wajib memiliki branch_id aktif untuk ${operation} pada "${table}".`);
  }

  if (nonAdminAuthenticated && payload) {
    const items = Array.isArray(payload) ? payload : [payload];
    for (const item of items) {
      if (item && item.branch_id && item.branch_id !== branchId) {
        throw new Error(`Akses cabang ditolak: pengguna non-admin tidak diizinkan mengubah data cabang lain pada "${table}".`);
      }
    }
  }

  return branchId;
};

export const supabase = {
  ...rawSupabase,
  unscopedFrom: (table) => {
    const role = getWindowRole();
    if (BRANCH_SCOPED_TABLES.includes(table) && role && !isAdminRole(role)) {
      throw new Error(`Akses ditolak: pengguna non-admin tidak diizinkan menjalankan query lintas cabang pada "${table}".`);
    }
    return rawSupabase.from(table);
  },
  from: (table) => {
    const builder = rawSupabase.from(table);

    const isBranchTable = BRANCH_SCOPED_TABLES.includes(table);

    const originalSelect = builder.select.bind(builder);
    builder.select = (...args) => {
      const branchId = assertBranchRuleForOperation(table, 'membaca');
      let b = originalSelect(...args);
      if (isBranchTable && branchId) b = b.eq('branch_id', branchId);
      return b;
    };

    const originalInsert = builder.insert.bind(builder);
    builder.insert = (payload, ...args) => {
      const branchId = assertBranchRuleForOperation(table, 'menambah', payload);
      if (isBranchTable && branchId) {
        if (Array.isArray(payload)) {
          payload = payload.map(p => ({ ...p, branch_id: p.branch_id || branchId }));
        } else if (payload && typeof payload === 'object') {
          payload = { ...payload, branch_id: payload.branch_id || branchId };
        }
      }
      return originalInsert(payload, ...args);
    };

    const originalUpsert = builder.upsert.bind(builder);
    builder.upsert = (payload, ...args) => {
      const branchId = assertBranchRuleForOperation(table, 'menyimpan', payload);
      if (isBranchTable && branchId) {
        if (Array.isArray(payload)) {
          payload = payload.map(p => ({ ...p, branch_id: p.branch_id || branchId }));
        } else if (payload && typeof payload === 'object') {
          payload = { ...payload, branch_id: payload.branch_id || branchId };
        }
      }
      return originalUpsert(payload, ...args);
    };

    const originalUpdate = builder.update.bind(builder);
    builder.update = (payload, ...args) => {
      const branchId = assertBranchRuleForOperation(table, 'memperbarui', payload);
      let b = originalUpdate(payload, ...args);
      if (isBranchTable && branchId) b = b.eq('branch_id', branchId);
      return b;
    };

    const originalDelete = builder.delete.bind(builder);
    builder.delete = (...args) => {
      const branchId = assertBranchRuleForOperation(table, 'menghapus');
      let b = originalDelete(...args);
      if (isBranchTable && branchId) b = b.eq('branch_id', branchId);
      return b;
    };

    return builder;
  },
  auth: rawSupabase.auth,
  storage: rawSupabase.storage,
  rpc: rawSupabase.rpc,
  channel: rawSupabase.channel,
  removeChannel: rawSupabase.removeChannel,
  removeAllChannels: rawSupabase.removeAllChannels,
  getChannels: rawSupabase.getChannels
};
