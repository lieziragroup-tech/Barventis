import { createClient } from '@supabase/supabase-js';

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

const branchTables = [
  'daily_inventories', 'stock_opnames', 'physical_checks',
  'transactions', 'purchase_entries', 'invoices', 'usage_variance',
  'production_batches', 'pos_orders', 'pos_transactions', 'pos_daily_aggregates'
];

export const supabase = {
  ...rawSupabase,
  from: (table) => {
    const builder = rawSupabase.from(table);

    const getBranch = () => window && window.__activeBranchId;
    const isBranchTarget = () => getBranch() && branchTables.includes(table);

    const originalSelect = builder.select.bind(builder);
    builder.select = (...args) => {
      let b = originalSelect(...args);
      if (isBranchTarget()) b = b.eq('branch_id', getBranch());
      return b;
    };

    const originalInsert = builder.insert.bind(builder);
    builder.insert = (payload, ...args) => {
      if (isBranchTarget()) {
        if (Array.isArray(payload)) {
          payload = payload.map(p => ({ ...p, branch_id: p.branch_id || getBranch() }));
        } else {
          payload = { ...payload, branch_id: payload.branch_id || getBranch() };
        }
      }
      return originalInsert(payload, ...args);
    };

    const originalUpdate = builder.update.bind(builder);
    builder.update = (payload, ...args) => {
      let b = originalUpdate(payload, ...args);
      if (isBranchTarget()) b = b.eq('branch_id', getBranch());
      return b;
    };

    const originalDelete = builder.delete.bind(builder);
    builder.delete = (...args) => {
      let b = originalDelete(...args);
      if (isBranchTarget()) b = b.eq('branch_id', getBranch());
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
