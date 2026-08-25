// UMATIS Serverless API Service Client for Supabase Backend Integration
import { supabase } from '../lib/supabase';
import { parsePackSize, calculateIngredientCost, getUnitPrice, computeRecipeCosts, convertQtyToStockUnit, DEFAULT_ROUNDING_DIRECTION, DEFAULT_ROUNDING_INCREMENT, DEFAULT_PRICE_ADJUSTMENT } from './costUtils';
// NOTE: DEFAULT_FIX_COST_PCT intentionally NOT imported here — per PRD §4.2
// Opsi B, a new recipe's fix_cost_pct falls back to the tenant's existing
// `overhead_pct` setting (activeOverheadPct below), not a hardcoded 5%.
// This preserves current behavior for tenants who already changed their
// Overhead % away from 5%.
import { storeLog } from './activityLogService';
import { calculateUsageVariance } from './varianceCalculator';

let activeTenantId = null;
let activeUserId = null;
let activeOverheadPct = 0.05;
let activeWhatsappNumber = null;
let activeWhatsappToken = null;
let activeWhatsappEnabled = false;

// Helper to sanitize search strings for PostgREST .or() filters to prevent injection
const sanitizePostgrest = (str) => String(str).replace(/[,.()"'\\]/g, ' ').trim();

// Helper to get active tenant info — uses cached memory first, falls back to Supabase session (KRITIS-01 fix)
const getActiveTenantId = async () => {
  if (activeTenantId !== null) return activeTenantId;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: user } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle();

  activeTenantId = user?.tenant_id ?? null;
  return activeTenantId;
};

// Helper to get authenticated user ID — uses cached memory first, falls back to Supabase session
const getActiveUserId = async () => {
  if (activeUserId !== null) return activeUserId;

  const { data: { session } } = await supabase.auth.getSession();
  activeUserId = session?.user?.id ?? null;
  return activeUserId;
};

// Helper for Audit Logging — stores locally, batch-synced to Supabase
const logAudit = async (action, description) => {
  try {
    storeLog({ action, description });
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
};

// Re-export from costUtils for backward compatibility
export { parsePackSize, calculateIngredientCost };

export const api = {
  // ═══════════════════════════════════════════════════════════════════
  // FIX (root cause hasil reverse-engineering SO BARISTA):
  // Versi lama fungsi ini LANGSUNG mengurangi `materials.qty_resto` sebesar
  // usage TEORITIS (qty terjual x qty resep), seolah itu adalah stok fisik
  // yang sebenarnya. Trace formula di Excel asli ("Daily Iventory Bahan",
  // "STOCK OPNAME RESTO/CENTRAL") menunjukkan stok sebenarnya SELALU berasal
  // dari hitungan fisik manual (TERPAKAI = OUT + WASTE, Sisa Stok = hard
  // value hasil hitung), sedangkan resep (COGS All Beverage) hanya dipakai
  // sbg BENCHMARK teoritis untuk menghitung food cost % / variance -- bukan
  // sumber kebenaran stok. Auto-deduct qty_resto pakai angka teoritis inilah
  // yang membuat stok di sistem lama-lama menyimpang dari hasil stock opname
  // fisik, dan menjadi penyebab paling mungkin SO Barista sistem tidak match
  // dengan SO Barista Excel manual.
  //
  // Perbaikan: qty_resto TIDAK disentuh oleh fungsi ini sama sekali. Usage
  // teoritis ditulis ke tabel `expected_usage` (sudah ada di schema, tapi
  // sebelumnya tidak pernah dipakai oleh kode manapun) untuk dibandingkan
  // dengan usage AKTUAL (`daily_inventory_items.terpakai_qty`, diisi dari
  // input fisik harian) lewat VarianceCalculator -- lihat services/varianceCalculator.js.
  // ═══════════════════════════════════════════════════════════════════
  processPOSSync: async (posDataArray, options = {}) => {
    try {
      if (!activeTenantId || !activeUserId) throw new Error("Missing active session.");

      const recipeIds = posDataArray.map(p => p.recipe_id);
      const { data: recipes, error: recipesErr } = await supabase
        .from('recipes')
        .select('id, recipe_ingredients(material_id, qty_in_use, materials(id, price, new_price))')
        .in('id', recipeIds);

      if (recipesErr) throw recipesErr;
      const recipeMap = new Map((recipes || []).map(r => [r.id, r]));
      const materialTheoretical = new Map(); // usage TEORITIS saja, bukan deduksi stok riil
      const salesByDate = new Map();
      const today = new Date().toISOString().split('T')[0];
      let minDate = today;
      let maxDate = today;

      // FIX: Paksa minDate/maxDate ke awal-akhir bulan jika periodMonth/Year tersedia.
      // Ini mencegah double-counting ketika user upload 2 file berbeda (Senin vs Selasa)
      // di bulan yang sama — keduanya sekarang di-aggregate ke satu periode yang sama.
      if (options.periodMonth && options.periodYear) {
        const m = options.periodMonth.toString().padStart(2, '0');
        const lastDay = new Date(parseInt(options.periodYear), parseInt(options.periodMonth), 0).getDate();
        minDate = `${options.periodYear}-${m}-01`;
        maxDate = `${options.periodYear}-${m}-${String(lastDay).padStart(2, '0')}`;
      }

      // Override handling
      if (options.mode === 'overwrite' && options.periodMonth && options.periodYear) {
         const m = options.periodMonth.toString().padStart(2, '0');
         const startDate = `${options.periodYear}-${m}-01`;
         const lastDay = new Date(parseInt(options.periodYear), parseInt(m), 0).getDate();
         const endDate = `${options.periodYear}-${m}-${String(lastDay).padStart(2, '0')}`;

         await supabase.from('transactions')
           .delete()
           .eq('tenant_id', activeTenantId)
           .in('type', ['POS_SALE', 'POS_DEDUCTION'])
           .gte('date', startDate)
           .lte('date', endDate);

         // FIX: bersihkan juga expected_usage periode ini supaya tidak dobel
         // dengan re-upload/overwrite bulan yang sama.
         await supabase.from('expected_usage')
           .delete()
           .eq('tenant_id', activeTenantId)
           .gte('week_start', startDate)
           .lte('week_end', endDate);
      }

      for (const item of posDataArray) {
        // Collect Sales Revenue. FIX: qty/total negatif (void/refund/cancel)
        // sebelumnya dibuang (`sTotal > 0` saja) — sekarang tetap dihitung
        // supaya void benar-benar mengurangi revenue & usage teoritis,
        // bukan menghilang tanpa jejak (lihat edge case "Sales minus/Void").
        const sDate = item.salesDate || today;
        if (sDate < minDate) minDate = sDate;
        if (sDate > maxDate) maxDate = sDate;
        const sTotal = parseFloat(item.total || 0);
        if (sTotal !== 0) {
           salesByDate.set(sDate, (salesByDate.get(sDate) || 0) + sTotal);
        }

        const recipe = recipeMap.get(item.recipe_id);
        if (!recipe || !recipe.recipe_ingredients) continue;

        const qtySold = parseFloat(item.qty) || 0;
        for (const ing of recipe.recipe_ingredients) {
           const matId = ing.material_id;
           const qtyTheoretical = parseFloat(ing.qty_in_use) * qtySold;

           if (materialTheoretical.has(matId)) {
             const m = materialTheoretical.get(matId);
             m.qty += qtyTheoretical;
             m.totalSold += qtySold;
           } else {
             materialTheoretical.set(matId, { qty: qtyTheoretical, totalSold: qtySold });
           }
        }
      }

      // Simpan usage teoritis sbg benchmark (BUKAN mengubah qty_resto)
      const expectedUsageRows = [];
      for (const [matId, data] of materialTheoretical.entries()) {
        expectedUsageRows.push({
           tenant_id: activeTenantId,
           week_start: minDate,
           week_end: maxDate,
           material_id: matId,
           expected_qty: data.qty,
           total_sold: data.totalSold,
           created_by: activeUserId
        });
      }
      if (expectedUsageRows.length > 0) {
        // BUG-FIX 2026-08: `onConflict: 'tenant_id, week_start, material_id'` has
        // no confirmed matching unique constraint/index in any migration for this
        // project (analysis Bagian 3.4) — if it's actually missing, every upsert()
        // here fails outright with a Postgres "no unique or exclusion constraint"
        // error. Resolve existing rows explicitly instead (all rows in this batch
        // share the same week_start), so this never depends on that constraint.
        const { data: existingUsageRows } = await supabase
          .from('expected_usage')
          .select('id, material_id')
          .eq('tenant_id', activeTenantId)
          .eq('week_start', minDate);

        const existingUsageByMaterial = new Map((existingUsageRows || []).map(u => [u.material_id, u.id]));
        const usageRowsToInsert = [];
        const usageUpdateOps = [];

        for (const usageRow of expectedUsageRows) {
          const existingId = existingUsageByMaterial.get(usageRow.material_id);
          if (existingId) {
            usageUpdateOps.push(supabase.from('expected_usage').update(usageRow).eq('id', existingId));
          } else {
            usageRowsToInsert.push(usageRow);
          }
        }

        if (usageUpdateOps.length > 0) {
          const updateResults = await Promise.all(usageUpdateOps);
          const updateErr = updateResults.find(r => r.error)?.error;
          if (updateErr) console.warn('Failed to update expected_usage:', updateErr);
        }
        if (usageRowsToInsert.length > 0) {
          const { error: euErr } = await supabase.from('expected_usage').insert(usageRowsToInsert);
          if (euErr) console.warn('Failed to save expected_usage:', euErr);
        }
      }

      const transactions = [];
      for (const [sDate, sTotal] of salesByDate.entries()) {
        transactions.push({
           tenant_id: activeTenantId,
           date: sDate,
           type: 'POS_SALE',
           location: 'RESTO',
           qty: 1,
           amount: sTotal,
           notes: 'POS Sync Revenue',
           created_by: activeUserId
        });
      }

      if (transactions.length > 0) {
        const { error: txErr } = await supabase.from('transactions').insert(transactions);
        if (txErr) throw txErr;
      }

      // GAP-FIX 2026-07: pos_upload_logs existed in the schema (branch_name,
      // company_name, category_filter, branch_mismatch, period_start/end) but the
      // live sync path never wrote to it — only the dead `syncPos` function did.
      // Log it here so there's an actual audit trail of which branch/category filter
      // was used per upload (relevant now that "Kasuna by Umatis" uploads are
      // deliberately merged into this tenant rather than rejected).
      try {
        await supabase.from('pos_upload_logs').insert({
          tenant_id: activeTenantId,
          filename: options.filename || 'unknown',
          file_hash: options.filename || String(Date.now()),
          period: `${options.periodMonth || ''}/${options.periodYear || ''}`,
          total_rows: options.totalRows ?? posDataArray.length,
          branch_name: options.branchName || null,
          company_name: options.companyName || null,
          period_start: minDate,
          period_end: maxDate,
          category_filter: options.categoryFilter || 'MINUMAN',
          branch_mismatch: !!options.branchMismatch
        });
      } catch (logErr) {
        // Non-critical — don't fail the whole sync just because the audit log failed.
        console.warn('[processPOSSync] Failed to write pos_upload_logs:', logErr?.message || logErr);
      }

      return { success: true, theoretical_usage_materials: expectedUsageRows.length };
    } catch (err) {
      console.error('POS Sync error:', err);
      throw err;
    }
  },

  // FIX/NEW: laporan variance usage teoritis (dari sales x resep, tabel
  // expected_usage) vs usage aktual (dari input fisik harian, tabel
  // daily_inventory_items.terpakai_qty). Ini yang sebelumnya tidak ada sama
  // sekali sbg data tersimpan/queryable -- padahal ini inti dari "Cost
  // Control" di SO Barista asli. Lihat services/varianceCalculator.js.
  getUsageVariance: async (month, year) => {
    const tenantId = await getActiveTenantId();
    const m = month.toString().padStart(2, '0');
    const startDate = `${year}-${m}-01`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;

    const [{ data: expectedUsageRows, error: euErr }, { data: dailyInventories, error: diErr }, { data: materials, error: matErr }] =
      await Promise.all([
        supabase.from('expected_usage').select('*')
          .eq('tenant_id', tenantId)
          .gte('week_start', startDate).lte('week_end', endDate),
        supabase.from('daily_inventories').select('*, daily_inventory_items(*)')
          .eq('tenant_id', tenantId)
          .gte('date', startDate).lte('date', endDate),
        supabase.from('materials').select('id, name, price, unit, full_pack').eq('tenant_id', tenantId),
      ]);

    if (euErr) throw euErr;
    if (diErr) throw diErr;
    if (matErr) throw matErr;

    const unitConversionMap = await api._loadUnitConversionMap(tenantId);
    return calculateUsageVariance(expectedUsageRows || [], dailyInventories || [], materials || [], unitConversionMap);
  },

  // Set memory cache to avoid async locks in browser
  getPOSOrders: async () => {
    try {
      const tenantId = await getActiveTenantId();
      const { data, error } = await supabase
        .from('pos_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('getPOSOrders error:', err);
      throw err;
    }
  },

  getPOSOrderItems: async (orderId) => {
    try {
      const tenantId = await getActiveTenantId();
      // Verify the order belongs to the active tenant before returning items
      const { data: order } = await supabase.from('pos_orders').select('id').eq('id', orderId).eq('tenant_id', tenantId).maybeSingle();
      if (!order) throw new Error('Order tidak ditemukan atau akses ditolak.');
      const { data, error } = await supabase
        .from('pos_order_items')
        .select('*, recipes(menu_name)')
        .eq('order_id', orderId);
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('getPOSOrderItems error:', err);
      throw err;
    }
  },

  setSessionData: (tenantId, userId, overheadPct, whatsappNumber, whatsappToken, whatsappEnabled) => {
    activeTenantId = tenantId;
    activeUserId = userId;
    if (overheadPct !== undefined && overheadPct !== null) {
      activeOverheadPct = parseFloat(overheadPct);
    }
    activeWhatsappNumber = whatsappNumber || null;
    activeWhatsappToken = whatsappToken || null;
    activeWhatsappEnabled = !!whatsappEnabled;
  },

  getOverheadPct: () => activeOverheadPct,

  getActiveTenantId: async () => {
    return await getActiveTenantId();
  },

  getActiveUserId: async () => {
    return await getActiveUserId();
  },

  // --- AUTHENTICATION ---
  login: async (email, password) => {
    // 1. Perform Supabase authentication first (so RLS policies will be satisfied for profile and tenant queries)
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authErr || !authData.user) {
      throw new Error(authErr?.message || 'Email atau password salah.');
    }

    // 2. Fetch user profile
    let { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (!userProfile) {
      // SEC-001 Fix: Removed unsafe auto-recovery that trusted client metadata and created phantom tenants.
      // If profile is missing, it means registration failed halfway or was deleted. Must re-register or fix in DB.
      throw new Error("Profile pengguna tidak ditemukan. Silakan hubungi admin atau daftar ulang.");
    }

    if (profileErr || !userProfile) {
      await supabase.auth.signOut();
      throw new Error('Profil user tidak ditemukan: ' + (profileErr?.message || 'Data kosong dan gagal dipulihkan otomatis.'));
    }

    let tenant;
    // H-4: Super Admin status is determined by the DB role on the authenticated
    // profile - NOT by a hardcoded email. The real boundary is the user's role
    // (also enforced by RLS is_super_admin()), so no magic email is needed.
    const roleLower = (userProfile.role || '').toLowerCase().replace(/\s+/g, '');
    const isSALogin = roleLower === 'superadmin';

    // Explicitly validate UUID to avoid 400 bad request
    const isValidUUID = (id) => typeof id === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

    if (isSALogin) {
      // Bypass database tenant query for Super Admin (since tenant_id is null in public.users)
      tenant = { name: 'superadmin', company_name: 'Barventis System Management', id: null, status: 'active' };
    } else {
      // 3. Fetch tenant details (now that we're authenticated, RLS allows selecting our own tenant)
      if (!isValidUUID(userProfile.tenant_id)) {
        await supabase.auth.signOut();
        throw new Error('Tenant ID tidak valid atau korup.');
      }
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();

      if (tenantErr || !tenantData) {
        await supabase.auth.signOut();
        throw new Error('Tenant / ID Resto tidak terdaftar.');
      }
      tenant = tenantData;
    }

    if (tenant.status !== 'active') {
      await supabase.auth.signOut();
      throw new Error('Tenant Resto sedang dinonaktifkan.');
    }

    // 4. Session is managed by Supabase Auth (no localStorage write needed)
    // Audit log is handled after onAuthStateChange fires in App.jsx
    try { await logAudit('LOGIN', `User ${userProfile.name} berhasil login ke resto.`); } catch { /* ignore: best-effort */ }

    return {
      token: authData.session.access_token,
      tenant: { name: tenant.name, company_name: tenant.company_name },
      user: {
        id: userProfile.id,
        tenant_id: userProfile.tenant_id,
        name: userProfile.name,
        email: userProfile.email,
        role: userProfile.role,
        tenant_name: tenant.name
      }
    };
  },

  register: async (name, companyName, adminName, email, password) => {
    const formattedTenantName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Cek duplikasi tenant terlebih dahulu
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('name', formattedTenantName)
      .maybeSingle();

    if (existingTenant) {
      throw new Error('Nama ID Resto / Tenant ini sudah digunakan. Coba nama lain.');
    }

    // 2. Buat akun Auth DULU! (mencegah unauthenticated table pollution - SEC-002)
    const { data: authData, error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: adminName,
          tenant_name: formattedTenantName,
          company_name: companyName,
          role: 'Admin / Owner'
        }
      }
    });

    if (signupErr || !authData.user) {
      throw new Error('Gagal mendaftarkan admin: ' + (signupErr?.message || 'Menunggu verifikasi email'));
    }

    // 3. Panggil RPC untuk membentuk Tenant dan menautkan Profile (atomic operation)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('register_new_tenant_with_profile', {
      p_name: formattedTenantName,
      p_company_name: companyName,
      p_admin_name: adminName
    });

    if (rpcErr) {
      throw new Error('Auth berhasil, tetapi gagal setup data Resto: ' + rpcErr.message + '. Anda mungkin butuh eksekusi script FEATURE_register_tenant_rpc.sql di server.');
    }

    try { await logAudit('REGISTER', `Pendaftaran akun resto baru ${companyName} berhasil oleh ${adminName}.`); } catch { /* ignore: best-effort */ }

    return {
      token: authData.session?.access_token,
      tenant: { name: rpcData.tenant_name, company_name: rpcData.company_name },
      user: { id: rpcData.user_id, name: adminName, email: email, role: 'Admin / Owner', tenant_id: rpcData.tenant_id, tenant_name: rpcData.tenant_name }
    };
  },

  registerWithToken: async (name, email, password, token) => {
    // 1. Re-validate the invitation server-side (client SDK) right before using it,
    //    and grab tenant_id so we can fallback-create the profile below.
    const { data: invite, error: inviteErr } = await supabase
      .from('invitations')
      .select('id, tenant_id, is_used, expires_at, invite_role')
      .eq('token', token)
      .single();

    if (inviteErr || !invite) {
      throw new Error('Undangan tidak ditemukan atau tidak valid.');
    }
    if (invite.is_used) {
      throw new Error('Undangan ini sudah pernah dipakai.');
    }
    if (new Date(invite.expires_at) < new Date()) {
      throw new Error('Undangan ini sudah kadaluarsa.');
    }

    const assignedRole = invite.invite_role || 'Staff';

    // 2. Create the Supabase Auth user (passing full metadata including tenant_id and role to prevent database trigger failures)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          tenant_id: invite.tenant_id,
          role: assignedRole,
          invite_token: token,
        }
      }
    });
    if (error || !data.user) {
      console.error("Detailed Supabase signUp error:", error);
      throw new Error(
        error?.message ||
        'Terjadi kesalahan internal (500) di Supabase atau menunggu verifikasi email.'
      );
    }

    // 3. Fallback: insert into public.users in case the DB trigger didn't
    //    (mirrors the same fallback already used in register() — KRITIS-01 fix pattern)
    const { data: profileCheck } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();
    if (!profileCheck) {
      const { error: insertErr } = await supabase.from('users').insert({
        id: data.user.id,
        tenant_id: invite.tenant_id,
        name: name,
        email: email,
        role: assignedRole
      });
      if (insertErr) {
        throw new Error('Akun berhasil dibuat, tapi gagal menyimpan profil: ' + insertErr.message);
      }
    }

    // 4. Mark the invitation as used so the same link can't be reused
    await supabase.from('invitations').update({ is_used: true }).eq('id', invite.id);

    return data.user;
  },

  logout: async () => {
    try { await logAudit('LOGOUT', 'User melakukan logout dari sistem.'); } catch { /* ignore: best-effort */ }
    // Clear any legacy localStorage keys (backward compat cleanup)
    localStorage.removeItem('umatis_token');
    localStorage.removeItem('umatis_tenant_name');
    localStorage.removeItem('umatis_user');

    // SEC-01: Clear module-level cache
    activeTenantId = null;
    activeUserId = null;
    activeOverheadPct = 0.05;
    activeWhatsappNumber = null;
    activeWhatsappToken = null;
    activeWhatsappEnabled = false;

    await supabase.auth.signOut();
    // onAuthStateChange in App.jsx will handle state reset
  },

  updateProfileName: async (newName) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No active session.');
    const { error } = await supabase
      .from('users')
      .update({ name: newName })
      .eq('id', session.user.id);
    if (error) throw new Error('Failed to update name: ' + error.message);
  },

  // getProfile — reads from Supabase DB, not localStorage (KRITIS-01 fix)
  getProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('No active session.');

    let { data: userProfile, error } = await supabase
      .from('users')
      .select('id, tenant_id, name, email, role')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !userProfile) {
      throw new Error('Profil tidak ditemukan.');
    }

    // Also fetch tenant name
    let tenantName = '';
    let companyName = '';
    const roleLower = (userProfile.role || '').toLowerCase().replace(/\s+/g, '');
    
    // Explicitly validate UUID format to prevent 400 Bad Request from Supabase on malformed UUIDs
    const isValidUUID = (id) => typeof id === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

    if (roleLower === 'superadmin') {
      tenantName = 'superadmin';
      companyName = 'Barventis System Management';
    } else if (userProfile.tenant_id && isValidUUID(userProfile.tenant_id)) {
      try {
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', userProfile.tenant_id)
          .maybeSingle();
        if (tenantData) {
          tenantName = tenantData.name;
          companyName = tenantData.company_name;
          userProfile.is_pos_enabled = tenantData.is_pos_enabled;
          userProfile.pos_tax_rate = tenantData.pos_tax_rate;
          userProfile.pos_service_charge = tenantData.pos_service_charge;
          userProfile.locked_until_month = tenantData.locked_until_month;
          userProfile.locked_until_year = tenantData.locked_until_year;
        }
      } catch (e) {
        console.warn("Could not fetch tenant data:", e);
      }
    }

    return {
      ...userProfile,
      tenant_name: tenantName,
      company_name: companyName,
      overhead_pct: 0.05,
      whatsapp_number: null,
      whatsapp_token: null,
      whatsapp_enabled: false
    };
  },

  // 1.5 Tenant Invitations
  generateTenantInvite: async (tenantId, role = 'Admin / Owner') => {
    // Generate expires_at 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        tenant_id: tenantId,
        expires_at: expiresAt.toISOString(),
        created_by: userId,
        invite_role: role
      })
      .select('token')
      .single();

    if (error) throw new Error("Gagal membuat link undangan: " + error.message);

    // Return full URL
    const baseUrl = window.location.origin;
    return `${baseUrl}/login?token=${data.token}`;
  },

  // --- LEDGER TRANSACTIONS ---
  getTransactions: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const { data, error } = await supabase
      .from('transactions')
      .select('*, materials(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw new Error("Gagal mengambil transaksi: " + error.message);

    return data.map(tx => ({
      id: 'tx-' + tx.id,
      date: tx.date,
      item_name: tx.materials ? tx.materials.name : 'Bahan Terhapus',
      type: tx.type,
      location: tx.location,
      qty: parseFloat(tx.qty),
      amount: parseFloat(tx.amount),
      notes: tx.notes
    }));
  },

  // Paginated version for Stock Ledger's transaction history panel.
  // Uses server-side LIMIT/OFFSET (.range) + optional search so we don't
  // pull hundreds of rows just to show one page.
  getTransactionsPaged: async ({ page = 1, pageSize = 20, search = '', materialName = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('transactions')
      .select('*, materials(name)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (materialName) {
      const { data: mat } = await supabase.from('materials').select('id').eq('tenant_id', tenantId).eq('name', materialName).maybeSingle();
      query = query.eq('material_id', mat ? mat.id : -1);
    }
    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`notes.ilike.%${s}%,type.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal mengambil transaksi: " + error.message);

    return {
      data: data.map(tx => ({
        id: 'tx-' + tx.id,
        date: tx.date,
        item_name: tx.materials ? tx.materials.name : 'Bahan Terhapus',
        type: tx.type,
        location: tx.location,
        qty: parseFloat(tx.qty),
        amount: parseFloat(tx.amount),
        notes: tx.notes
      })),
      totalCount: count || 0
    };
  },

  // --- STOCK / MATERIALS ---
  getMaterials: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('category')
      .order('name');

    if (error) throw new Error("Gagal memuat bahan baku: " + error.message);
    return data;
  },

  // Paginated + searchable version for the Stock Ledger table. The full
  // getMaterials() above is kept as-is since other forms (recipe/invoice
  // ingredient pickers) still need the complete unpaginated list.
  getMaterialsPaged: async ({ page = 1, pageSize = 20, search = '' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('materials')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`name.ilike.%${s}%,category.ilike.%${s}%,supplier.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('category')
      .order('name')
      .range(from, to);

    if (error) throw new Error("Gagal memuat bahan baku: " + error.message);
    return { data, totalCount: count || 0 };
  },
  
  createMaterial: async (materialData) => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('materials')
      .insert({
        tenant_id: tenantId,
        name: materialData.name,
        category: materialData.category,
        supplier: materialData.supplier,
        unit: materialData.unit,
        full_pack: materialData.full_pack,
        sku: materialData.sku || null,
        price: parseFloat(materialData.price || 0),
        new_price: parseFloat(materialData.price || 0),
        qty_resto: 0.00,
        qty_central: 0.00,
        min_stock: parseFloat(materialData.min_stock || 15.00),
        is_active: true
      })
      .select('*')
      .single();

    if (error) throw new Error("Gagal menambah bahan: " + error.message);
    await logAudit('CREATE_MATERIAL', `Menambahkan bahan baku baru: "${data.name}" ke kategori "${data.category}".`);
    return data;
  },

  updateMaterial: async (id, materialData) => {
    const tenantId = await getActiveTenantId();
    const { data: oldMaterial } = await supabase.from('materials').select('*').eq('id', id).eq('tenant_id', tenantId).single();

    const { data, error } = await supabase
      .from('materials')
      .update({
        name: materialData.name,
        category: materialData.category,
        supplier: materialData.supplier,
        unit: materialData.unit,
        full_pack: materialData.full_pack,
        sku: materialData.sku !== undefined ? (materialData.sku || null) : oldMaterial?.sku,
        price: parseFloat(materialData.price || 0),
        new_price: parseFloat(materialData.new_price ?? materialData.price ?? 0),
        min_stock: parseFloat(materialData.min_stock || 15.00)
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal memperbarui bahan: " + error.message);

    if (oldMaterial.price !== data.price || oldMaterial.new_price !== data.new_price) {
      const formattedOld = new Intl.NumberFormat('id-ID').format(oldMaterial.new_price || oldMaterial.price);
      const formattedNew = new Intl.NumberFormat('id-ID').format(data.new_price);
      await logAudit('UPDATE_PRICE', `Mengubah harga bahan "${data.name}" dari Rp${formattedOld} menjadi Rp${formattedNew}.`);
    } else {
      await logAudit('UPDATE_MATERIAL', `Memperbarui detail bahan mentah: "${data.name}".`);
    }

    return data;
  },

  deleteMaterial: async (id, force = false) => {
    const tenantId = await getActiveTenantId();
    // Check if ingredient is used in recipes
    const { count, error: countErr } = await supabase
      .from('recipe_ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('material_id', id);

    if (!countErr && count > 0) {
      if (!force) {
        const err = new Error(`Tidak bisa menonaktifkan: bahan baku ini masih digunakan di ${count} resep aktif. Hapus dari resep terlebih dahulu.`);
        err.hasDependencies = true;
        err.dependencyCount = count;
        throw err;
      } else {
        // Force delete: remove dependencies first
        await supabase.from('recipe_ingredients').delete().eq('material_id', id);
      }
    }

    const { data, error } = await supabase
      .from('materials')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal menonaktifkan bahan: " + error.message);
    await logAudit('DELETE_MATERIAL', `Menonaktifkan bahan mentah: "${data.name}" dari database inventory.`);
    return data;
  },

  adjustStock: async (id, adjustData) => {
    const tenantId = await getActiveTenantId();
    const { location, type, qty, notes } = adjustData;

    // Call RPC to guarantee atomic stock updates (prevent TOCTOU race conditions)
    const { data, error } = await supabase.rpc('adjust_material_stock', {
      p_material_id: id,
      p_tenant_id: tenantId,
      p_type: type,
      p_location: location,
      p_qty: parseFloat(qty),
      p_notes: notes
    });

    if (error) {
      throw new Error("Gagal adjust stok: " + error.message);
    }

    const actionLabel = type === 'TRANSFER' ? 'Transfer' : (type === 'IN' ? 'Stock In' : 'Stock Out');
    await logAudit('ADJUST_STOCK', `Menyesuaikan stok (${actionLabel}) sebesar ${qty} di ${location}. Catatan: "${notes || 'Tidak ada'}".`);

    return data;
  },

  // --- RECIPES ---
  getRecipes: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const { data, error } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId)
      .order('menu_name');

    if (error) throw new Error("Gagal memuat resep: " + error.message);

    // Map ingredients structures to match UI expectations
    return data.map(r => ({
      id: r.id,
      menu_name: r.menu_name,
      pos_code: r.pos_code,
      category: r.category || 'NON-KOPI',
      selling_price: parseFloat(r.selling_price),
      basic_cost: parseFloat(r.basic_cost),
      fix_cost: parseFloat(r.fix_cost),
      subtotal: parseFloat(r.subtotal),
      food_cost_pct: parseFloat(r.food_cost_pct),
      fix_cost_pct: r.fix_cost_pct != null ? parseFloat(r.fix_cost_pct) : activeOverheadPct,
      selling_price_raw: r.selling_price_raw != null ? parseFloat(r.selling_price_raw) : 0,
      rounding_direction: r.rounding_direction || DEFAULT_ROUNDING_DIRECTION,
      rounding_increment: r.rounding_increment != null ? parseFloat(r.rounding_increment) : DEFAULT_ROUNDING_INCREMENT,
      price_adjustment: r.price_adjustment != null ? parseFloat(r.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT,
      ingredients: (r.recipe_ingredients || []).map(ing => ({
        material_id: ing.material_id,
        item_name: ing.materials ? ing.materials.name : 'Bahan Terhapus',
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: parseFloat(ing.unit_price),
        amount: parseFloat(ing.amount)
      }))
    }));
  },

  // Paginated + searchable (by menu name / category) version for the
  // Recipes list panel.
  getRecipesPaged: async ({ page = 1, pageSize = 15, search = '' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`menu_name.ilike.%${s}%,category.ilike.%${s}%,pos_code.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('menu_name')
      .range(from, to);

    if (error) throw new Error("Gagal memuat resep: " + error.message);

    return {
      data: data.map(r => ({
        id: r.id,
        menu_name: r.menu_name,
        pos_code: r.pos_code,
        category: r.category || 'NON-KOPI',
        selling_price: parseFloat(r.selling_price),
        basic_cost: parseFloat(r.basic_cost),
        fix_cost: parseFloat(r.fix_cost),
        subtotal: parseFloat(r.subtotal),
        food_cost_pct: parseFloat(r.food_cost_pct),
        fix_cost_pct: r.fix_cost_pct != null ? parseFloat(r.fix_cost_pct) : activeOverheadPct,
        selling_price_raw: r.selling_price_raw != null ? parseFloat(r.selling_price_raw) : 0,
        rounding_direction: r.rounding_direction || DEFAULT_ROUNDING_DIRECTION,
        rounding_increment: r.rounding_increment != null ? parseFloat(r.rounding_increment) : DEFAULT_ROUNDING_INCREMENT,
        price_adjustment: r.price_adjustment != null ? parseFloat(r.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT,
        ingredients: (r.recipe_ingredients || []).map(ing => ({
          material_id: ing.material_id,
          item_name: ing.materials ? ing.materials.name : 'Bahan Terhapus',
          qty_in_use: parseFloat(ing.qty_in_use),
          unit: ing.unit,
          unit_price: parseFloat(ing.unit_price),
          amount: parseFloat(ing.amount)
        }))
      })),
      totalCount: count || 0
    };
  },
  
  createRecipe: async (recipeData) => {
    const tenantId = await getActiveTenantId();
    
    // 1. Process calculations using ported controller logic
    let subtotal = 0.00;
    const ingredientRows = [];

    // Pre-fetch all materials for this recipe
    const matIds = recipeData.ingredients.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    for (const ing of recipeData.ingredients) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
      const amount = calculateIngredientCost(material, parseFloat(ing.qty_in_use), ing.unit, unitConversionMap);
      subtotal += amount;

      ingredientRows.push({
        material_id: ing.material_id,
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: unitPrice,
        amount: parseFloat(amount.toFixed(2))
      });
    }

    // Recipe pricing engine (merged from barventis-vercel-repo, PRD §4.2 Opsi B):
    // fix_cost_pct defaults to this tenant's existing Overhead % setting
    // (activeOverheadPct) rather than a hardcoded 5%, unless the caller
    // explicitly passes one. selling_price_override (sent by the unchanged
    // Recipes.jsx form via DataContext.jsx) wins over the computed target
    // price, so manual price entry keeps working exactly as before.
    const fixCostPct = recipeData.fix_cost_pct != null ? parseFloat(recipeData.fix_cost_pct) : activeOverheadPct;
    const roundingDirection = recipeData.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
    const roundingIncrement = recipeData.rounding_increment != null ? parseFloat(recipeData.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
    const priceAdjustment = recipeData.price_adjustment != null ? parseFloat(recipeData.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
    const foodCostPctTarget = parseFloat(recipeData.food_cost_pct || 0);

    const { fixCost, basicCost, sellingPriceRaw, sellingPriceFinal } = computeRecipeCosts({
      subtotal, fixCostPct, foodCostPct: foodCostPctTarget,
      roundingDirection, roundingIncrement, priceAdjustment
    });
    const sellingPrice = recipeData.selling_price_override != null
      ? parseFloat(recipeData.selling_price_override)
      : (sellingPriceFinal || parseFloat(recipeData.selling_price || 0));

    // 2. Insert Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .insert({
        tenant_id: tenantId,
        menu_name: recipeData.menu_name,
        category: recipeData.category || 'NON-KOPI',
        image_url: recipeData.image_url || null,
        selling_price: sellingPrice,
        subtotal: parseFloat(subtotal.toFixed(2)),
        fix_cost_pct: fixCostPct,
        fix_cost: parseFloat(fixCost.toFixed(2)),
        basic_cost: parseFloat(basicCost.toFixed(2)),
        food_cost_pct: parseFloat(foodCostPctTarget.toFixed(4)),
        selling_price_raw: parseFloat((sellingPriceRaw || 0).toFixed(2)),
        rounding_direction: roundingDirection,
        rounding_increment: roundingIncrement,
        price_adjustment: priceAdjustment
      })
      .select('*')
      .single();

    if (recipeErr) throw new Error("Gagal membuat resep: " + recipeErr.message);

    // 3. Insert Ingredients
    const rowsToInsert = ingredientRows.map(row => ({
      recipe_id: recipe.id,
      ...row
    }));

    const { error: ingErr } = await supabase.from('recipe_ingredients').insert(rowsToInsert);
    if (ingErr) {
      // Rollback
      await supabase.from('recipes').delete().eq('id', recipe.id);
      throw new Error("Gagal menyimpan bahan resep: " + ingErr.message);
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    const formattedPrice = new Intl.NumberFormat('id-ID').format(recipe.selling_price);
    await logAudit('CREATE_RECIPE', `Membuat resep menu baru: "${recipe.menu_name}" dengan HPP Rp${formattedHpp} dan Harga Jual Rp${formattedPrice}.`);

    return recipe;
  },

  updateRecipe: async (id, recipeData) => {
    const tenantId = await getActiveTenantId();
    // 1. Process calculations
    let subtotal = 0.00;
    const ingredientRows = [];

    const matIds = recipeData.ingredients.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    for (const ing of recipeData.ingredients) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
      const amount = calculateIngredientCost(material, parseFloat(ing.qty_in_use), ing.unit, unitConversionMap);
      subtotal += amount;

      ingredientRows.push({
        recipe_id: id,
        material_id: ing.material_id,
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: unitPrice,
        amount: parseFloat(amount.toFixed(2))
      });
    }

    // Recipe pricing engine (merged from barventis-vercel-repo, PRD §4.2 Opsi B) —
    // see createRecipe above for the full rationale.
    const fixCostPct = recipeData.fix_cost_pct != null ? parseFloat(recipeData.fix_cost_pct) : activeOverheadPct;
    const roundingDirection = recipeData.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
    const roundingIncrement = recipeData.rounding_increment != null ? parseFloat(recipeData.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
    const priceAdjustment = recipeData.price_adjustment != null ? parseFloat(recipeData.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
    const foodCostPctTarget = parseFloat(recipeData.food_cost_pct || 0);

    const { fixCost, basicCost, sellingPriceRaw, sellingPriceFinal } = computeRecipeCosts({
      subtotal, fixCostPct, foodCostPct: foodCostPctTarget,
      roundingDirection, roundingIncrement, priceAdjustment
    });
    const sellingPrice = recipeData.selling_price_override != null
      ? parseFloat(recipeData.selling_price_override)
      : (sellingPriceFinal || parseFloat(recipeData.selling_price || 0));

    // 2. Update Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .update({
        menu_name: recipeData.menu_name,
        // Only touch category when explicitly provided, so recalc (which omits it)
        // never clobbers an existing category. (M-2)
        ...(recipeData.category !== undefined ? { category: recipeData.category } : {}),
        ...(recipeData.image_url !== undefined ? { image_url: recipeData.image_url } : {}),
        selling_price: sellingPrice,
        subtotal: parseFloat(subtotal.toFixed(2)),
        fix_cost_pct: fixCostPct,
        fix_cost: parseFloat(fixCost.toFixed(2)),
        basic_cost: parseFloat(basicCost.toFixed(2)),
        food_cost_pct: parseFloat(foodCostPctTarget.toFixed(4)),
        selling_price_raw: parseFloat((sellingPriceRaw || 0).toFixed(2)),
        rounding_direction: roundingDirection,
        rounding_increment: roundingIncrement,
        price_adjustment: priceAdjustment
      })
      .eq('id', id)
      .select('*')
      .single();

    if (recipeErr) throw new Error("Gagal update resep: " + recipeErr.message);

    // 3. Replace Ingredients (Delete old, insert new)
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientRows);
    
    if (ingErr) throw new Error("Gagal menyimpan bahan resep baru: " + ingErr.message);

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    await logAudit('UPDATE_RECIPE', `Memperbarui resep menu: "${recipe.menu_name}" dengan HPP baru Rp${formattedHpp}.`);

    return recipe;
  },

  deleteRecipe: async (id) => {
    const { data: recipe } = await supabase.from('recipes').select('*').eq('id', id).single();

    // Harus hapus dependencies dulu karena tidak ada ON DELETE CASCADE
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    await supabase.from('pos_order_items').delete().eq('recipe_id', id);
    await supabase.from('pos_transaction_items').delete().eq('recipe_id', id);
    await supabase.from('recipe_versions').delete().eq('recipe_id', id);

    const { error } = await supabase.from('recipes').delete().eq('id', id);

    if (error) throw new Error("Gagal menghapus resep: " + error.message);
    await logAudit('DELETE_RECIPE', `Menghapus resep menu: "${recipe.menu_name}" dari database COGS.`);
    return true;
  },

  // GAP-FIX 2026-07: recipes.basic_cost/food_cost_pct/subtotal/fix_cost are only
  // ever recomputed when a HUMAN opens a specific recipe and clicks "Simpan Resep"
  // (createRecipe/updateRecipe). The Recipe Builder's detail panel looks correct
  // regardless, because it recomputes live from the current ingredient list on every
  // render — but that live number is NEVER what the sidebar list, Menu Pricing page,
  // or the generated SO Barista COGS sheet read; those all read the STORED column.
  // So after any master-data fix (like the Ice Cube / pack-size corrections), every
  // recipe's stored numbers stay stale at whatever they were computed as during the
  // last manual save — until someone reopens and re-saves each of the 56 recipes one
  // by one. This function does that in one shot: recompute + persist for every
  // recipe in the tenant, using the exact same calculateIngredientCost() the Recipe
  // Builder itself uses, so the stored values are guaranteed consistent with what
  // the UI already shows live.
  recalculateAllRecipes: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { updated: 0, results: [] };

    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId);
    if (error) throw new Error("Gagal memuat resep: " + error.message);

    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    const results = [];
    for (const r of (recipes || [])) {
      const ings = r.recipe_ingredients || [];
      const subtotal = ings.reduce((sum, ing) => {
        const mat = ing.materials;
        const unit = ing.unit || mat?.unit || 'gr';
        return sum + calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit, unitConversionMap);
      }, 0);

      // BUG-FIX 2026-08: this used to hardcode fixCostPct=0.05 and derive
      // food_cost_pct as basic_cost/selling_price directly — ignoring this
      // recipe's own fix_cost_pct/rounding_direction/rounding_increment/
      // price_adjustment columns entirely, and reusing the SAME formula
      // createRecipe/updateRecipe/bulkImportRecipes all funnel through
      // computeRecipeCosts() for. That mismatch meant "Hitung Ulang Semua"
      // could silently override a recipe's custom Fix Cost % back to 5%.
      // It also never fixed `selling_price` — so a recipe imported while
      // basic_cost was still 0 (see the bulkImportRecipes full_pack fix
      // below) recalculated a correct basic_cost here, but selling_price
      // stayed stuck at 0 and food_cost_pct got overwritten to 0 right
      // along with it (worse than before: the badge used to at least show
      // the original FOOD COST % TARGET from the import).
      const fixCostPct = r.fix_cost_pct != null ? parseFloat(r.fix_cost_pct) : activeOverheadPct;
      const roundingDirection = r.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
      const roundingIncrement = r.rounding_increment != null ? parseFloat(r.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
      const priceAdjustment = r.price_adjustment != null ? parseFloat(r.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
      // `food_cost_pct` as stored is this recipe's TARGET at the time it was
      // priced (same convention bulkImportRecipes/createRecipe/updateRecipe
      // use to derive an initial selling price) — reuse it ONLY to fill in a
      // selling_price that's still missing; a selling_price that's already
      // set (manual or previously computed) is a business decision and is
      // never overwritten here.
      const targetPct = parseFloat(r.food_cost_pct || 0);

      const { fixCost, basicCost, sellingPriceFinal } = computeRecipeCosts({
        subtotal, fixCostPct, foodCostPct: targetPct,
        roundingDirection, roundingIncrement, priceAdjustment
      });

      const currentSellingPrice = parseFloat(r.selling_price || 0);
      const sellingPrice = currentSellingPrice > 0 ? currentSellingPrice : (sellingPriceFinal || 0);
      // Once a selling price exists, food_cost_pct going forward represents
      // the ACTUAL ratio at that price — matching how Recipes.jsx's own
      // "M-5" badge/list logic already interprets this field.
      const foodCostPct = sellingPrice > 0 ? basicCost / sellingPrice : 0;

      const before = {
        subtotal: parseFloat(r.subtotal || 0),
        basic_cost: parseFloat(r.basic_cost || 0),
        selling_price: currentSellingPrice
      };
      const changed = Math.abs(before.basic_cost - basicCost) > 1 || Math.abs(before.selling_price - sellingPrice) > 1;

      if (changed) {
        const { error: updErr } = await supabase
          .from('recipes')
          .update({ subtotal, fix_cost: fixCost, basic_cost: basicCost, selling_price: sellingPrice, food_cost_pct: foodCostPct, updated_at: new Date().toISOString() })
          .eq('id', r.id);
        if (updErr) {
          results.push({ menu_name: r.menu_name, status: 'error', message: updErr.message });
          continue;
        }
        // Also refresh each ingredient row's stored amount/unit_price for consistency
        // with reportGenerator.js's buildCOGSSheet, which reads recipe_ingredients.amount
        // directly rather than recomputing it.
        for (const ing of ings) {
          const mat = ing.materials;
          const unit = ing.unit || mat?.unit || 'gr';
          const qty = parseFloat(ing.qty_in_use || 0);
          const amount = calculateIngredientCost(mat, qty, unit, unitConversionMap);
          const { unitPrice } = getUnitPrice(mat, unitConversionMap);
          await supabase.from('recipe_ingredients').update({ unit_price: unitPrice, amount }).eq('id', ing.id);
        }
      }
      results.push({
        menu_name: r.menu_name,
        status: changed ? 'updated' : 'unchanged',
        before_basic_cost: before.basic_cost,
        after_basic_cost: basicCost,
      });
    }

    const updatedCount = results.filter(r => r.status === 'updated').length;
    await logAudit('RECALC_ALL_RECIPES', `Menjalankan recompute massal ${recipes.length} resep — ${updatedCount} resep angkanya diperbarui.`);
    return { updated: updatedCount, total: recipes.length, results };
  },

  // --- INVOICES ---
  getInvoices: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return []; // H-2: Super Admin / no-tenant — avoid malformed .eq('tenant_id', null) query
    const { data, error } = await supabase
      .from('invoices')
      .select('*, invoice_items(*, materials(*))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error("Gagal memuat invoices: " + error.message);

    return data.map(inv => ({
      id: inv.id,
      invoice_no: inv.invoice_no,
      supplier: inv.supplier,
      date: inv.date,
      total: parseFloat(inv.total),
      status: inv.status,
      location: inv.location,
      notes: inv.notes,
      received_date: inv.received_date,
      items: (inv.invoice_items || []).map(item => ({
        material_id: item.material_id,
        item_name: item.materials ? item.materials.name : 'Bahan Terhapus',
        qty: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price),
        unit: item.materials ? item.materials.unit : 'pck'
      }))
    }));
  },

  // Paginated + searchable (by invoice no / supplier) version for
  // the Invoicing list page.
  getInvoicesPaged: async ({ page = 1, pageSize = 15, search = '' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('invoices')
      .select('*, invoice_items(*, materials(*))', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`invoice_no.ilike.%${s}%,supplier.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal memuat invoices: " + error.message);

    return {
      data: data.map(inv => ({
        id: inv.id,
        invoice_no: inv.invoice_no,
        supplier: inv.supplier,
        date: inv.date,
        total: parseFloat(inv.total),
        status: inv.status,
        location: inv.location,
        notes: inv.notes,
        received_date: inv.received_date,
        items: (inv.invoice_items || []).map(item => ({
          material_id: item.material_id,
          item_name: item.materials ? item.materials.name : 'Bahan Terhapus',
          qty: parseFloat(item.qty),
          unit_price: parseFloat(item.unit_price),
          unit: item.materials ? item.materials.unit : 'pck'
        }))
      })),
      totalCount: count || 0
    };
  },
  
  createInvoice: async (invoiceData) => {
    const tenantId = await getActiveTenantId();

    // 1. Generate Invoice Number: INV-YYYYMMDD-XXX
    const dateToday = new Date();
    const dateStr = dateToday.getFullYear() + 
                    String(dateToday.getMonth() + 1).padStart(2, '0') + 
                    String(dateToday.getDate()).padStart(2, '0');

    // Count PO created today
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .like('invoice_no', `INV-${dateStr}-%`);

    const serial = String((count || 0) + 1).padStart(3, '0');
    const invoiceNo = `INV-${dateStr}-${serial}`;

    // 2. Calculate dynamic PO Total
    let total = 0.00;
    const lineItems = [];

    for (const item of invoiceData.items) {
      const itemTotal = parseFloat(item.qty) * parseFloat(item.unit_price);
      total += itemTotal;
      lineItems.push({
        material_id: item.material_id,
        qty: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price)
      });
    }

    // 3. Create PO Invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        invoice_no: invoiceNo,
        supplier: invoiceData.supplier,
        date: dateToday.toISOString().split('T')[0],
        total: parseFloat(total.toFixed(2)),
        status: 'DRAFT',
        location: invoiceData.location || 'CENTRAL',
        notes: invoiceData.notes || ''
      })
      .select('*')
      .single();

    if (invErr) throw new Error("Gagal membuat PO: " + invErr.message);

    // 4. Save Invoice Line Items
    const itemsToInsert = lineItems.map(item => ({
      invoice_id: invoice.id,
      ...item
    }));

    const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
    if (itemsErr) {
      await supabase.from('invoices').delete().eq('id', invoice.id);
      throw new Error("Gagal menyimpan rincian barang PO: " + itemsErr.message);
    }

    const formattedTotal = new Intl.NumberFormat('id-ID').format(invoice.total);
    await logAudit('CREATE_PO', `Membuat Purchase Order (PO) baru: ${invoice.invoice_no} untuk Supplier "${invoice.supplier}" senilai Rp${formattedTotal}. Lokasi: ${invoice.location}. Status: DRAFT.`);

    return invoice;
  },

  updateInvoiceStatus: async (id, status) => {
    const tenantId = await getActiveTenantId();
    const { data: oldInvoice } = await supabase.from('invoices').select('*').eq('id', id).eq('tenant_id', tenantId).single();
    if (oldInvoice.status === 'RECEIVED') {
      throw new Error('Tidak bisa mengubah status invoice PO yang sudah diterima (RECEIVED).');
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal update status PO: " + error.message);

    const formattedTotal = new Intl.NumberFormat('id-ID').format(data.total);
    if (status === 'CANCELLED') {
      await logAudit('CANCEL_PO', `Membatalkan Purchase Order (PO): ${data.invoice_no} untuk Supplier "${data.supplier}" senilai Rp${formattedTotal}.`);
    } else if (status === 'SENT') {
      await logAudit('SENT_PO', `Mengirim Purchase Order (PO): ${data.invoice_no} untuk Supplier "${data.supplier}" senilai Rp${formattedTotal}. Status: SENT.`);
    }

    return data;
  },

  receiveInvoice: async (id) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();

    const { error: rpcErr } = await supabase.rpc('receive_invoice_atomic', {
      p_invoice_id: id,
      p_tenant_id: tenantId,
      p_user_id: userId
    });

    if (rpcErr) throw new Error("Gagal menerima PO secara atomik: " + rpcErr.message);

    // Fetch the updated invoice to return to the UI
    const { data: updatedInvoice, error: fetchErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !updatedInvoice) throw new Error("Gagal memuat invoice yang diperbarui.");

    try {
      const formattedTotal = new Intl.NumberFormat('id-ID').format(updatedInvoice.total);
      await logAudit('RECEIVE_PO', `Menerima barang untuk Purchase Order (PO): ${updatedInvoice.invoice_no} dari Supplier "${updatedInvoice.supplier}" senilai Rp${formattedTotal}. Stok gudang ${updatedInvoice.location || 'CENTRAL'} bertambah.`);
    } catch (e) {
      console.warn("Failed to log audit for receive PO:", e);
    }

    return updatedInvoice;
  },

  // --- POS SYNCHRONIZATION ---
  checkPosSalesDuplicate: async (month, year) => {
    const tenantId = await getActiveTenantId();
    // Assuming transactions stores date, we can check if there's any POS_DEDUCTION in that month
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, parseInt(month), 0).toISOString().split('T')[0];
    
    // BUG-FIX 2026-07: this used to check for type='POS_DEDUCTION' — but the live
    // sync function (processPOSSync) was deliberately redesigned to NEVER create
    // POS_DEDUCTION transactions (see its header comment: qty_resto must only move
    // from real physical counts, not theoretical POS usage). That silently made
    // duplicate-upload detection dead — re-uploading the same file would never be
    // flagged, double-counting POS_SALE revenue. Check POS_SALE instead, since
    // that's what processPOSSync actually inserts.
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('type', 'POS_SALE')
      .gte('date', startDate)
      .lte('date', endDate);
      
    if (error) throw error;
    if (count > 0) {
      return { isDuplicate: true, message: `AI mendeteksi kemungkinan duplikat: Terdapat ${count} transaksi POS Sale pada periode ${month}/${year}. Apakah Anda yakin ingin mengunggah file ini (Data akan di-Append / Ditambahkan)?` };
    }
    return { isDuplicate: false };
  },

  // JANGAN DIPAKAI: dead code — no caller anywhere in the app (verified by
  // reference search, analysis Bagian 3.3). The active POS upload path is
  // `processPOSSync` above, which intentionally does NOT deduct qty_resto
  // in real time. This function calls `deduct_stock_atomic` and DOES deduct
  // stock immediately — a materially different behavior. Do not wire this up
  // without confirming that's actually the intended design change.
  syncPos: async (filename, salesData) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];

    // 1. Calculate File Hash for deduplication (SHA-256)
    const fileHashRaw = filename + JSON.stringify(salesData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileHashRaw));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 2. Check if already processed
    const { data: existingLog } = await supabase
      .from('pos_upload_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existingLog) {
      console.warn(`File POS "${filename}" ini sudah pernah diproses pada ${new Date(existingLog.created_at).toLocaleString('id-ID')}. (Warning only, AI duplicate modal will handle confirmation)`);
    }

    // 3. Pre-load all recipes with ingredients and materials
    const { data: recipes, error: recipesErr } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId);

    if (recipesErr) throw new Error("Gagal mengambil data resep: " + recipesErr.message);

    const recipesMapByName = new Map(recipes.map(r => [r.menu_name.toLowerCase().trim(), r]));
    const recipesMapByCode = new Map(recipes.filter(r => r.pos_code).map(r => [r.pos_code.toLowerCase().trim(), r]));

    let processedRecords = 0;
    let skippedRecords = 0;
    let deductionLogsCount = 0;
    const negativeWarnings = [];
    const deductionErrors = []; 

    const transactionRows = [];
    const deductionMap = {}; // Memory aggregation for materials
    const salesMap = {}; // Memory aggregation for gross revenue
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';

    // 1. Loop through each POS sale row (Pre-Aggregation Phase)
    for (const sale of salesData) {
      // Basic extraction
      const menuName = sale.menuName.toLowerCase().trim();
      const menuCode = sale.menuCode ? sale.menuCode.toLowerCase().trim() : null;
      const saleQty = parseInt(sale.qty || 1);
      const salesDate = sale.salesDate || nowStr;
      const totalRevenue = parseFloat(sale.total || 0);

      // Track date bounds for expected_usage
      if (salesDate < minDate) minDate = salesDate;
      if (salesDate > maxDate) maxDate = salesDate;

      processedRecords++;

      // BUGFIX: Aggregate Gross Revenue by Menu and Date regardless of recipe matching
      // So revenue is not lost if a recipe is not yet created in the system!
      const salesKey = `${salesDate}_${sale.menuName}`;
      if (!salesMap[salesKey]) {
        salesMap[salesKey] = { menuName: sale.menuName, date: salesDate, qty: 0, revenue: 0 };
      }
      salesMap[salesKey].qty += saleQty;
      salesMap[salesKey].revenue += totalRevenue;

      let recipe = null;

      // Priority 1: Match by POS code
      if (menuCode && recipesMapByCode.has(menuCode)) {
        recipe = recipesMapByCode.get(menuCode);
      }

      // Priority 2: Match by exact name
      if (!recipe && recipesMapByName.has(menuName)) {
        recipe = recipesMapByName.get(menuName);
      }

      // Priority 3: Fuzzy name match
      if (!recipe) {
        recipe = recipes.find(r => {
          const rName = r.menu_name.toLowerCase();
          return rName.includes(menuName) || menuName.includes(rName);
        });
      }

      if (!recipe) {
        skippedRecords++;
        continue;
      }

      // Aggregate Deductions in memory ONLY if recipe exists
      for (const ing of recipe.recipe_ingredients) {
        const material = ing.materials;
        if (material) {
          const matUnit = (material.unit || '').toLowerCase().trim();
          const ingUnit = (ing.unit || '').toLowerCase().trim();
          
          let factor = 1.00;
          if (ingUnit !== matUnit) {
            const isIngGramMl = (ingUnit === 'gr' || ingUnit === 'ml' || ingUnit === 'grm');
            const isMatKgL = (matUnit === 'kg' || matUnit === 'l' || matUnit === 'liter' || matUnit === 'ltr');
            if (isIngGramMl && isMatKgL) {
              factor = 1000.00;
            }
          }

          const deductQty = (parseFloat(ing.qty_in_use) * saleQty) / factor;
          
          if (!deductionMap[material.id]) {
            deductionMap[material.id] = { material, totalDeduct: 0, saleDates: new Set(), totalSold: 0 };
          }
          deductionMap[material.id].totalDeduct += deductQty;
          deductionMap[material.id].saleDates.add(salesDate);
          deductionMap[material.id].totalSold += saleQty;
        }
      }
    }

    // Prepare expected usage rows
    const expectedUsageRows = [];
    // If no valid dates were found, default to today
    if (minDate === '9999-12-31') minDate = nowStr;
    if (maxDate === '0000-01-01') maxDate = nowStr;

    // 2. Perform Atomic Deductions per UNIQUE material (Parallel Batching API Optimization)
    const deductionEntries = Object.entries(deductionMap);
    const BATCH_SIZE = 20; // Concurrent requests limit

    for (let i = 0; i < deductionEntries.length; i += BATCH_SIZE) {
      const batch = deductionEntries.slice(i, i + BATCH_SIZE);
      const unitConversionMap = await api._loadUnitConversionMap(tenantId);

      await Promise.all(batch.map(async ([, data]) => {
        const material = data.material;
        const deductQty = data.totalDeduct;
        const currentResto = parseFloat(material.qty_resto);
        const newQty = currentResto - deductQty;

        if (newQty < 0) {
          negativeWarnings.push(`Stok ${material.name} tidak cukup. Butuh ${deductQty.toFixed(2)}, tersedia ${currentResto.toFixed(2)}.`);
        }

        const { error: deductErr } = await supabase.rpc('deduct_stock_atomic', {
          p_material_id: material.id,
          p_deduct_qty: deductQty
        });
        
        if (deductErr) {
          deductionErrors.push(`${material.name}: ${deductErr.message}`);
          console.error('[syncPos] deduct_stock_atomic failed for', material.name, deductErr.message);
          return;
        }

        // BUG-FIX 2026-07: `unitPrice = material.price` was being multiplied straight
        // by deductQty (a base-unit qty, e.g. grams) — but material.price is a per-PACK
        // price, so this inflated every POS_DEDUCTION amount by the pack-size factor.
        // deduct_stock_atomic itself is fine (deducts qty_resto in base units correctly);
        // only the Rupiah valuation here was wrong. Route through the shared calculator.
        const deductionAmount = calculateIngredientCost(material, deductQty, material.unit, unitConversionMap);
        const datesArray = Array.from(data.saleDates).sort();
        const primaryDate = datesArray[datesArray.length - 1] || nowStr;

        transactionRows.push({
          tenant_id: tenantId,
          date: primaryDate,
          material_id: material.id,
          type: 'POS_DEDUCTION',
          location: 'RESTO',
          qty: -deductQty,
          amount: -deductionAmount,
          notes: `POS Sync Bulk Deduction (Total item terjual via file ${filename})`,
          created_by: userId
        });

        deductionLogsCount++;
        
        expectedUsageRows.push({
          tenant_id: tenantId,
          week_start: minDate,
          week_end: maxDate,
          material_id: material.id,
          expected_qty: deductQty,
          total_sold: data.totalSold,
          last_pos_filename: filename,
          created_by: userId
        });
      }));
    }

    // 2b. Push aggregated Sales Revenue to transactions
    for (const [, data] of Object.entries(salesMap)) {
      transactionRows.push({
        tenant_id: tenantId,
        date: data.date,
        material_id: null,
        type: 'POS_SALE',
        location: 'RESTO',
        qty: data.qty,
        amount: data.revenue,
        notes: `POS revenue: "${data.menuName}" (Total Qty: ${data.qty}) via file ${filename}`,
        created_by: userId
      });
    }

    // 3. Insert all transactions in batch chunks to prevent payload too large errors
    const INSERT_CHUNK = 500;
    for (let i = 0; i < transactionRows.length; i += INSERT_CHUNK) {
      const chunk = transactionRows.slice(i, i + INSERT_CHUNK);
      const { error: txsErr } = await supabase.from('transactions').insert(chunk);
      if (txsErr) console.warn("Failed to save POS synced transactions chunk:", txsErr);
    }

    // 4. Upsert expected usage
    for (let i = 0; i < expectedUsageRows.length; i += INSERT_CHUNK) {
      const chunk = expectedUsageRows.slice(i, i + INSERT_CHUNK);
      const { error: euErr } = await supabase.from('expected_usage').upsert(chunk, {
        onConflict: 'tenant_id, week_start, material_id'
      });
      if (euErr) console.warn("Failed to save expected usage chunk:", euErr);
    }

    // Record upload log
    await supabase.from('pos_upload_logs').insert({
      tenant_id: tenantId,
      filename,
      file_hash: fileHash,
      period: 'POS Upload ' + nowStr,
      total_rows: salesData.length
    });

    const warningMsg = negativeWarnings.length > 0 ? ` (Terdapat ${negativeWarnings.length} peringatan stok habis)` : "";
    const errorMsg = deductionErrors.length > 0 ? ` (${deductionErrors.length} pengurangan stok GAGAL diterapkan — perlu ditinjau)` : "";
    await logAudit('POS_SYNC', `Sinkronisasi POS berhasil dari file "${filename}". Memproses ${processedRecords} penjualan, ${skippedRecords} dilewati. Mencatat ${deductionLogsCount} mutasi stok RESTO${warningMsg}${errorMsg}.`);

    return {
      message: 'POS synchronization completed successfully.',
      summary: {
        filename,
        processed_sales_rows: processedRecords,
        unmapped_recipes_skipped: skippedRecords,
        stock_deduction_ledger_entries: deductionLogsCount,
        negative_stock_warnings: negativeWarnings,
        deduction_errors: deductionErrors,
        status: deductionErrors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'
      }
    };
  },

  // --- NATIVE POS CHECKOUT ---
  processPosCheckout: async (cartItems, paymentMethod = 'CASH', customerName = '') => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];

    // Check transaction limit (Maks 50 transaksi / hari)
    const { count, error: countErr } = await supabase
      .from('pos_orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', `${nowStr}T00:00:00Z`)
      .lte('created_at', `${nowStr}T23:59:59Z`);
      
    if (!countErr && count >= 50) {
      throw new Error('Batas transaksi POS harian (50) telah tercapai untuk paket Langkah Awal. Silakan upgrade paket atau beli Add-On untuk limit yang lebih besar.');
    }

    const orderNo = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    // 1. Fetch recipes & ingredients for deduction calculation
    const recipeIds = cartItems.map(item => item.id);
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, menu_name, selling_price, recipe_ingredients(material_id, qty_in_use, unit, materials(id, name, unit, full_pack, qty_resto, price, new_price))')
      .in('id', recipeIds);

    const recipeMap = new Map((recipes || []).map(r => [r.id, r]));

    // 1b. Securely recalculate totalAmount based on DB prices
    let subtotalAmount = 0;
    const orderItems = [];

    for (const item of cartItems) {
      const dbRecipe = recipeMap.get(item.id);
      if (dbRecipe) {
        const dbPrice = parseFloat(dbRecipe.selling_price || 0);
        subtotalAmount += (dbPrice * item.qty);
        orderItems.push({
          recipe_id: item.id,
          qty: item.qty,
          unit_price: dbPrice,
          subtotal: dbPrice * item.qty,
          salesDate: nowStr,
          total: dbPrice * item.qty
        });
      }
    }

    // Apply tax and service charge
    const { data: tenantData } = await supabase.from('tenants').select('pos_tax_rate, pos_service_charge').eq('id', tenantId).single();
    const taxRate = tenantData?.pos_tax_rate ? parseFloat(tenantData.pos_tax_rate) : 0;
    const serviceChargeRate = tenantData?.pos_service_charge ? parseFloat(tenantData.pos_service_charge) : 0;
    
    const serviceChargeAmount = (subtotalAmount * serviceChargeRate) / 100;
    const taxAmount = ((subtotalAmount + serviceChargeAmount) * taxRate) / 100;
    let totalAmount = subtotalAmount + serviceChargeAmount + taxAmount;

    // 2. Aggregate deductions & revenue
    const deductionMap = {};
    let totalSalesQty = 0;
    
    for (const cartItem of cartItems) {
      totalSalesQty += cartItem.qty;
      const recipe = recipeMap.get(cartItem.id);
      if (!recipe || !recipe.recipe_ingredients) continue;

      for (const ing of recipe.recipe_ingredients) {
        const material = ing.materials;
        if (!material) continue;

        // BUG-FIX 2026-08: replaced the ad hoc "gr/ml usage vs kg/l-tracked material
        // -> divide by 1000" special case (a duplicate, narrower reimplementation of
        // a unit conversion that lived here only) with the shared
        // convertQtyToStockUnit() from costUtils.js. Same behavior for the legacy
        // kg/l case, PLUS it now also understands the manual "Carton = 24 pcs"
        // pack/content conversion (StockLedger.jsx "Konversi Isi"), so a recipe
        // using "pcs" against a Carton-tracked material deducts stock correctly too.
        const { qty: deductQty } = convertQtyToStockUnit(material, parseFloat(ing.qty_in_use) * cartItem.qty, ing.unit);
        if (!deductionMap[material.id]) {
          deductionMap[material.id] = { material, totalDeduct: 0 };
        }
        deductionMap[material.id].totalDeduct += deductQty;
      }
    }

    // 3. Prepare payload for Atomic Deductions & Transactions
    const transactionRows = [];
    const deductionsPayload = [];
    const negativeWarnings = [];
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    // Revenue transaction
    transactionRows.push({
      date: nowStr,
      material_id: null,
      type: 'POS_SALE',
      location: 'RESTO',
      qty: totalSalesQty,
      amount: totalAmount,
      notes: `POS Kasir (Native) - Order: ${orderNo} (${paymentMethod})`
    });

    for (const [, data] of Object.entries(deductionMap)) {
      const material = data.material;
      const deductQty = data.totalDeduct;
      const currentResto = parseFloat(material.qty_resto);

      // FIX: izinkan stok negatif. Di realitas, fisik kopi tetap terpotong walau sistem bilangnya habis
      // (biasanya karena telat catat stok masuk). Supaya di akhir bulan kelihatan minusnya pas opname.
      if (currentResto - deductQty < 0) {
        negativeWarnings.push(`Stok ${material.name} tersisa ${currentResto.toFixed(2)}, tapi order butuh ${deductQty.toFixed(2)}. (Stok akan jadi minus)`);
        // continue; // HAPUS SKIP INI
      }

        deductionsPayload.push({
        material_id: material.id,
        deduct_qty: deductQty
      });

      // FIX: jangan kali lurus deductQty (bisa dalam gram) dengan unitPrice (harga per pack)
      const exactCost = calculateIngredientCost(material, deductQty, material.unit, unitConversionMap);

      transactionRows.push({
        date: nowStr,
        material_id: material.id,
        type: 'POS_DEDUCTION',
        location: 'RESTO',
        qty: -deductQty,
        amount: -exactCost,
        notes: `POS Kasir (Native) Deduction - Order: ${orderNo}`
      });
    }

    // 4. Execute atomic checkout
    const { error: checkoutErr } = await supabase.rpc('checkout_pos_atomic', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_order_no: orderNo,
      p_total_amount: totalAmount,
      p_payment_method: paymentMethod,
      p_order_items: orderItems,
      p_deductions: deductionsPayload,
      p_transactions: transactionRows
    });

    
    if (checkoutErr) {
      console.error("Checkout failed:", checkoutErr);
      return { success: false, error: checkoutErr.message };
    }

    if (customerName) {
      await supabase.from('pos_orders').update({ customer_name: customerName }).eq('order_no', orderNo);
    }


    await logAudit('POS_CHECKOUT', `Transaksi POS Kasir ${orderNo} berhasil (Rp ${totalAmount.toLocaleString('id-ID')}).`);

    return {
      success: true,
      orderNo,
      warnings: negativeWarnings
    };
  },

  // --- STOCK OPNAME ---
  completeOpname: async (opnameData) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    
    const location = opnameData.location;
    const items = opnameData.items;
    // FIX: Gunakan bulan/tahun dari UI jika user pilih backdate. Jangan kunci ke waktu sekarang.
    const currentMonth = opnameData.period_month ? parseInt(opnameData.period_month, 10) : new Date().getMonth() + 1;
    const currentYear = opnameData.period_year ? parseInt(opnameData.period_year, 10) : new Date().getFullYear();

    // 1. Delete existing opname for this period & location to prevent unique constraint crash
    const { data: oldOpname } = await supabase
      .from('stock_opnames')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_month', currentMonth)
      .eq('period_year', currentYear)
      .eq('location', location)
      .maybeSingle();

    if (oldOpname) {
      await supabase.from('stock_opname_items').delete().eq('opname_id', oldOpname.id);
      await supabase.from('stock_opnames').delete().eq('id', oldOpname.id);
    }

    // 2. Create Persistent Stock Opname record as DRAFT first
    const { data: opname, error: opnameErr } = await supabase
      .from('stock_opnames')
      .insert({
        tenant_id: tenantId,
        period_month: currentMonth,
        period_year: currentYear,
        location,
        status: 'DRAFT',
        signature_svg: opnameData.signature_svg || '',
        created_by: userId,
        submitted_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (opnameErr) throw new Error("Gagal membuat data audit opname: " + opnameErr.message);

    const opnameItems = [];

    // Pre-fetch materials system book quantities
    const matIds = items.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    for (const item of items) {
      const material = materialsMap.get(item.material_id);
      if (!material) continue;

      const physicalQty = parseFloat(item.physical_qty || 0);
      const systemQty = location === 'RESTO' ? parseFloat(material.qty_resto) : parseFloat(material.qty_central);

      opnameItems.push({
        opname_id: opname.id,
        material_id: material.id,
        book_qty: systemQty,
        physical_qty: physicalQty,
        notes: item.notes || null
      });
    }

    // Insert stock opname items
    if (opnameItems.length > 0) {
      const { error: itemsErr } = await supabase.from('stock_opname_items').insert(opnameItems);
      if (itemsErr) {
        await supabase.from('stock_opnames').delete().eq('id', opname.id);
        throw new Error("Gagal menyimpan rincian item opname: " + itemsErr.message);
      }
    }

    // 3. Call the atomic RPC to complete and adjust stock!
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('complete_opname_atomic', {
      p_opname_id: opname.id,
      p_tenant_id: tenantId,
      p_location: location,
      p_user_id: userId
    });

    if (rpcErr) {
      // Rollback
      await supabase.from('stock_opname_items').delete().eq('opname_id', opname.id);
      await supabase.from('stock_opnames').delete().eq('id', opname.id);
      throw new Error("Gagal menyelesaikan opname secara atomik: " + rpcErr.message);
    }

    const adjustmentsCount = rpcRes.adjustments_made || 0;

    await logAudit('COMPLETE_OPNAME', `Menyelesaikan Stock Opname di gudang ${location}. Menyesuaikan ${adjustmentsCount} item.`);

    return {
      message: `Stock opname berhasil diselesaikan untuk gudang ${location}.`,
      summary: {
        opname_id: opname.id,
        location,
        items_audited: items.length,
        adjustments_made: adjustmentsCount
      }
    };
  },

  // --- REPORTS ---
  getCostControlReport: async (month) => {
    // month is "YYYY-MM"
    const tenantId = await getActiveTenantId();
    await logAudit('VIEW_COST_CONTROL', `Membuka lembar laporan bulanan Cost Control periode: ${month}.`);

    const startDate = `${month}-01`;
    // Calculate last date of month in JS
    const parts = month.split('-');
    const year = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    // 1. Fetch closing valuation from this month's opnames if they exist (RESTO + CENTRAL)
    const { data: thisOpnames } = await supabase
      .from('stock_opnames')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_month', m)
      .eq('period_year', year);

    let closingValuation = 0.00;
    let categoryValuation = [];
    let hasThisMonthOpname = false;
    let detailedOpnameItems = [];

    if (thisOpnames && thisOpnames.length > 0) {
      const opnameIds = thisOpnames.map(o => o.id);
      const { data: opnameItems } = await supabase
        .from('stock_opname_items')
        .select('physical_qty, book_qty, material_id, materials(name, new_price, price, category, unit, full_pack, supplier)')
        .in('opname_id', opnameIds);

      if (opnameItems && opnameItems.length > 0) {
        hasThisMonthOpname = true;
        const matValuationMap = {};
        
        opnameItems.forEach(item => {
          const matId = item.material_id;
          const physicalQty = parseFloat(item.physical_qty || 0);
          const bookQty = parseFloat(item.book_qty || 0);
          const price = parseFloat(item.materials?.price ?? 0);
          // BUG-FIX 2026-07: `physicalQty * price` used price as if it were already a
          // per-base-unit price — but materials.price is a per-PACK price. This is the
          // core reason monthly Cost Control HPP was inflated even when Recipe Builder
          // looked fine. Route through the shared, pack-size-aware calculator.
          const val = calculateIngredientCost(item.materials, physicalQty, item.materials?.unit, unitConversionMap);
          const cat = item.materials?.category || 'Lain-lain';

          if (!matValuationMap[matId]) {
            matValuationMap[matId] = {
              name: item.materials?.name || 'Unknown',
              unit: item.materials?.unit || '-',
              full_pack: item.materials?.full_pack || '-',
              supplier: item.materials?.supplier || '-',
              systemQty: 0,
              physicalQty: 0,
              val: 0,
              price,
              cat
            };
          }
          matValuationMap[matId].systemQty += bookQty;
          matValuationMap[matId].physicalQty += physicalQty;
          matValuationMap[matId].val += val;
        });

        // Build detailed list
        detailedOpnameItems = Object.values(matValuationMap).map(m => ({
          name: m.name,
          category: m.cat,
          unit: m.unit,
          full_pack: m.full_pack,
          systemQty: m.systemQty,
          physicalQty: m.physicalQty,
          variance: m.physicalQty - m.systemQty,
          price: m.price,
          totalValuation: m.val,
          supplier: m.supplier
        }));
        // Sort by category then name
        detailedOpnameItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

        const categoryGroup = {};
        for (const item of Object.values(matValuationMap)) {
          closingValuation += item.val;
          categoryGroup[item.cat] = (categoryGroup[item.cat] || 0) + item.val;
        }

        categoryValuation = Object.entries(categoryGroup).map(([name, value]) => ({
          name,
          value: parseFloat(value.toFixed(2))
        }));
      }
    }

    if (!hasThisMonthOpname) {
      const { data: materials } = await supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true);
      const categoryGroup = {};
      for (const mat of (materials || [])) {
        const price = parseFloat(mat.price ?? 0);
        const qtySistem = parseFloat(mat.qty_resto) + parseFloat(mat.qty_central);
        // BUG-FIX 2026-07: same pack-size issue as above — route through the shared calculator.
        const val = calculateIngredientCost(mat, qtySistem, mat.unit, unitConversionMap);
        closingValuation += val;

        const cat = mat.category || 'Lain-lain';
        categoryGroup[cat] = (categoryGroup[cat] || 0) + val;
        
        detailedOpnameItems.push({
          name: mat.name,
          category: cat,
          unit: mat.unit,
          full_pack: mat.full_pack,
          systemQty: qtySistem,
          physicalQty: qtySistem, // assuming matched if no opname
          variance: 0,
          price: price,
          totalValuation: val,
          supplier: mat.supplier || '-'
        });
      }
      
      detailedOpnameItems.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      
      categoryValuation = Object.entries(categoryGroup).map(([name, value]) => ({
        name,
        value: parseFloat(value.toFixed(2))
      }));
    }

    // 2. Query Transactions for calculations
    const { data: transactions } = await supabase
      .from('transactions')
      .select('type, amount, date, notes')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate);

    let purchasesValuation = 0.00;
    let cogsIngredientsCost = 0.00;
    let salesRevenue = 0.00;
    let wasteValuation = 0.00;

    const wasteTypes = ['WASTE', 'BREAKAGE', 'EXPIRED', 'COMP'];

    for (const tx of (transactions || [])) {
      const amt = parseFloat(tx.amount || 0);
      if (tx.type === 'PURCHASE_IN') {
        purchasesValuation += amt;
      } else if (tx.type === 'POS_DEDUCTION') {
        cogsIngredientsCost += Math.abs(amt);
      } else if (tx.type === 'POS_SALE') {
        salesRevenue += amt;
      } else if (wasteTypes.includes(tx.type)) {
        wasteValuation += Math.abs(amt);
      }
    }

    // 3. Opening Stock: Query last month's opname or use derivation as fallback
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? year - 1 : year;
    const { data: prevOpnames } = await supabase
      .from('stock_opnames')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_month', prevMonth)
      .eq('period_year', prevYear);

    let openingValuation = 0;
    if (prevOpnames && prevOpnames.length > 0) {
      const prevOpnameIds = prevOpnames.map(o => o.id);
      const { data: prevOpnameItems } = await supabase
        .from('stock_opname_items')
        .select('physical_qty, material_id, materials(new_price, price, unit, full_pack, name)')
        .in('opname_id', prevOpnameIds);
      
      if (prevOpnameItems && prevOpnameItems.length > 0) {
        // BUG-FIX 2026-07: same pack-size issue as the closing-stock valuation above.
        openingValuation = prevOpnameItems.reduce((sum, item) => {
          return sum + calculateIngredientCost(item.materials, parseFloat(item.physical_qty || 0), item.materials?.unit, unitConversionMap);
        }, 0);
      }
    }
    // Fallback to derivation if no previous opname exists
    if (openingValuation <= 0) {
      openingValuation = Math.max(0.00, cogsIngredientsCost + closingValuation - purchasesValuation + wasteValuation);
    }

    // COGS = Opening + Purchases - Closing (Excel SO_BARISTA formula, NO waste deducted)
    let actualCogs = openingValuation + purchasesValuation - closingValuation;
    if (actualCogs < 0) actualCogs = 0;
    const totalCogs = actualCogs;
    const beverageCostPct = salesRevenue > 0 ? (totalCogs / salesRevenue) * 100 : 0.00;

    // ponytail: swap to supabase.rpc('get_hpp_metrics') once SQL patch is deployed

    return {
      month,
      period: { start_date: startDate, end_date: endDate },
      metrics: {
        opening_stock: parseFloat(openingValuation.toFixed(2)),
        purchases: parseFloat(purchasesValuation.toFixed(2)),
        closing_stock: parseFloat(closingValuation.toFixed(2)),
        ingredients_cost: parseFloat(cogsIngredientsCost.toFixed(2)),
        overhead_cost: 0.00,
        waste_valuation: parseFloat(wasteValuation.toFixed(2)),
        total_cogs: parseFloat(totalCogs.toFixed(2)),
        sales_revenue: parseFloat(salesRevenue.toFixed(2)),
        beverage_cost_pct: parseFloat(beverageCostPct.toFixed(2)),
        target_cost_pct: 27.00,
        status: beverageCostPct <= 27.00 ? 'SAFE' : (beverageCostPct <= 30.00 ? 'WARNING' : 'DANGER')
      },
      category_valuation: categoryValuation
    };
  },

  // --- SUPPLIERS ---
  getSuppliers: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) throw new Error("Gagal memuat supplier: " + error.message);
    return data;
  },

  saveSupplier: async (supplierData) => {
    const tenantId = await getActiveTenantId();
    const payload = {
      tenant_id: tenantId,
      name: supplierData.name,
      phone: supplierData.phone || null,
      address: supplierData.address || null,
      contact_person: supplierData.contact_person || null
    };

    if (supplierData.id) {
      const { data, error } = await supabase.from('suppliers').update(payload).eq('id', supplierData.id).select().single();
      if (error) throw new Error("Gagal menyimpan supplier: " + error.message);
      await logAudit('UPDATE_SUPPLIER', `Mengubah data supplier "${data.name}".`);
      return data;
    }
    const { data, error } = await supabase.from('suppliers').insert(payload).select().single();
    if (error) throw new Error("Gagal menyimpan supplier: " + error.message);
    await logAudit('CREATE_SUPPLIER', `Menambahkan supplier baru "${data.name}".`);
    return data;
  },

  // --- PURCHASE ENTRIES (Daily Purchasing) ---
  // Paginated + searchable (search matches purchase notes or the linked
  // material's name) so the history table never has to pull hundreds of
  // rows at once — fixes the previous unbounded 400/embedding issue too,
  // since this goes through a single well-formed query with FK embeds.
  getPurchaseEntriesPaged: async ({ page = 1, pageSize = 15, search = '', material_id = null } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('purchase_entries')
      .select('*, materials(name, unit), suppliers(name)', { count: 'exact' })
      .eq('tenant_id', tenantId);
      
    if (material_id) {
      query = query.eq('material_id', material_id);
    }

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      const { data: matMatches } = await supabase
        .from('materials')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('name', `%${s}%`);
      const matIds = (matMatches || []).map(m => m.id);
      if (matIds.length > 0) {
        query = query.or(`notes.ilike.%${s}%,material_id.in.(${matIds.join(',')})`);
      } else {
        query = query.ilike('notes', `%${s}%`);
      }
    }

    const { data, error, count } = await query
      .order('date', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal memuat riwayat pembelian: " + error.message);
    return { data: data || [], totalCount: count || 0 };
  },

  createPurchaseEntry: async (purchaseData) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();

    const payload = {
      tenant_id: tenantId,
      material_id: purchaseData.material_id,
      supplier_id: purchaseData.supplier_id || null,
      qty: parseFloat(purchaseData.qty),
      unit: purchaseData.unit,
      unit_price: parseFloat(purchaseData.unit_price),
      date: purchaseData.date,
      input_by: userId,
      notes: purchaseData.notes || null
    };

    const { error: pErr } = await supabase.from('purchase_entries').insert(payload);
    if (pErr) throw new Error("Gagal menyimpan pembelian: " + pErr.message);

    const { error: rpcErr } = await supabase.rpc('deduct_stock_atomic', {
      p_material_id: payload.material_id,
      p_deduct_qty: -payload.qty // negative qty = tambah stok ke central
    });
    if (rpcErr) throw new Error("Gagal update stok: " + rpcErr.message);

    const { error: txErr } = await supabase.from('transactions').insert({
      tenant_id: tenantId,
      date: payload.date,
      material_id: payload.material_id,
      type: 'PURCHASE_IN',
      location: 'CENTRAL',
      qty: payload.qty,
      amount: payload.qty * payload.unit_price,
      notes: 'Daily Purchase Entry',
      created_by: userId
    });
    if (txErr) throw new Error("Gagal mencatat transaksi: " + txErr.message);

    await logAudit('CREATE_PURCHASE_ENTRY', `Mencatat pembelian ${payload.qty} ${payload.unit} (Rp ${(payload.qty * payload.unit_price).toLocaleString('id-ID')}).`);
  },

  // Lightweight aggregate stats for the Audit Logs KPI cards — uses
  // count-only queries (head: true) so these stay accurate across the
  // whole log history without pulling every row just for a number.
  getAuditLogsStats: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { total: 0, uniqueUsers: 0, securityAlerts: 0, syncs: 0 };

    const [totalRes, alertsRes, syncsRes, userIdsRes] = await Promise.all([
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).or('action.ilike.%DELETE%,action.ilike.%CANCEL%'),
      supabase.from('audit_logs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).ilike('action', '%SYNC%'),
      supabase.from('audit_logs').select('user_id').eq('tenant_id', tenantId)
    ]);

    const uniqueUsers = new Set((userIdsRes.data || []).map(r => r.user_id).filter(Boolean)).size;

    return {
      total: totalRes.count || 0,
      uniqueUsers,
      securityAlerts: alertsRes.count || 0,
      syncs: syncsRes.count || 0
    };
  },

  // --- AUDIT LOGS ---
  getAuditLogs: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*, users(name, role)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error("Gagal mengambil log audit: " + error.message);

    return data.map(log => ({
      id: log.id,
      action: log.action,
      description: log.description,
      ip_address: log.ip_address,
      username: log.users ? log.users.name : 'System',
      role: log.users ? log.users.role : 'System',
      created_at: log.created_at
    }));
  },

  // Paginated + searchable (by action / description) version for the
  // Audit Logs page. `category` mirrors the frontend's getActionCategory()
  // grouping (AUTH/MATERIAL/RECIPE/INVOICING/POS/OTHER) so filtering by
  // category still happens server-side instead of pulling everything.
  getSuperAdminAuditLogsPaged: async ({ page = 1, pageSize = 20, search = '', tenantFilter = '', actionFilter = '' } = {}) => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('audit_logs')
      .select('*, tenants(name, company_name), users(name, role)', { count: 'exact' });

    if (tenantFilter) {
      query = query.eq('tenant_id', tenantFilter);
    }

    if (actionFilter) {
      query = query.eq('action', actionFilter);
    }

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      // Supabase text search on jsonb is complicated. We'll search action & description for simple ilike,
      // and unfortunately filtering by user name on joined tables with 'or' is tricky in PostgREST without a view.
      // We will just filter by action/description for now.
      query = query.or(`action.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal mengambil log audit superadmin: " + error.message);

    return {
      data,
      totalCount: count || 0
    };
  },

  getAuditLogsPaged: async ({ page = 1, pageSize = 20, search = '', category = 'ALL' } = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return { data: [], totalCount: 0 };
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const CATEGORY_KEYWORDS = {
      AUTH: ['LOGIN', 'REGISTER'],
      MATERIAL: ['MATERIAL', 'PRICE', 'ADJUST'],
      RECIPE: ['RECIPE'],
      INVOICING: ['PO', 'INVOICE'],
      POS: ['POS', 'SYNC'],
    };

    let query = supabase
      .from('audit_logs')
      .select('*, users(name, role)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (search && search.trim()) {
      const s = sanitizePostgrest(search);
      query = query.or(`action.ilike.%${s}%,description.ilike.%${s}%`);
    }

    if (category && category !== 'ALL') {
      if (category === 'OTHER') {
        // Doesn't match any known category keyword
        const allKeywords = Object.values(CATEGORY_KEYWORDS).flat();
        for (const kw of allKeywords) {
          query = query.not('action', 'ilike', `%${kw}%`);
        }
      } else if (CATEGORY_KEYWORDS[category]) {
        const orExpr = CATEGORY_KEYWORDS[category].map(kw => `action.ilike.%${kw}%`).join(',');
        query = query.or(orExpr);
      }
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error("Gagal mengambil log audit: " + error.message);

    return {
      data: data.map(log => ({
        id: log.id,
        action: log.action,
        description: log.description,
        ip_address: log.ip_address,
        username: log.users ? log.users.name : 'System',
        role: log.users ? log.users.role : 'System',
        created_at: log.created_at
      })),
      totalCount: count || 0
    };
  },

  // --- BACKUP & RESTORE SERVERLESS SYSTEM ---
  getBackups: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('backups')
      .select('id, filename, size_bytes, size_formatted, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error("Gagal mengambil cadangan: " + error.message);
    return data;
  },

  createBackup: async () => {
    const tenantId = await getActiveTenantId();
    
    // 1. Fetch entire tenant tables
    const { data: materials } = await supabase.from('materials').select('*').eq('tenant_id', tenantId);
    const { data: recipes } = await supabase.from('recipes').select('*').eq('tenant_id', tenantId);
    const { data: recipe_ingredients } = await supabase.from('recipe_ingredients').select('*, recipes(tenant_id)').filter('recipes.tenant_id', 'eq', tenantId);
    const { data: transactions } = await supabase.from('transactions').select('*').eq('tenant_id', tenantId);
    const { data: invoices } = await supabase.from('invoices').select('*').eq('tenant_id', tenantId);
    const { data: invoice_items } = await supabase.from('invoice_items').select('*, invoices(tenant_id)').filter('invoices.tenant_id', 'eq', tenantId);
    const { data: audit_logs } = await supabase.from('audit_logs').select('*').eq('tenant_id', tenantId);
    const { data: pos_upload_logs } = await supabase.from('pos_upload_logs').select('*').eq('tenant_id', tenantId);
    const { data: stock_opnames } = await supabase.from('stock_opnames').select('*').eq('tenant_id', tenantId);
    const { data: stock_opname_items } = await supabase.from('stock_opname_items').select('*, stock_opnames(tenant_id)').filter('stock_opnames.tenant_id', 'eq', tenantId);

    const backupPayload = {
      materials: materials || [],
      recipes: recipes || [],
      recipe_ingredients: recipe_ingredients || [],
      transactions: transactions || [],
      invoices: invoices || [],
      invoice_items: invoice_items || [],
      audit_logs: audit_logs || [],
      pos_upload_logs: pos_upload_logs || [],
      stock_opnames: stock_opnames || [],
      stock_opname_items: stock_opname_items || []
    };

    const dataJson = JSON.stringify(backupPayload);
    const sizeBytes = dataJson.length;
    const sizeFormatted = (sizeBytes / 1024).toFixed(2) + ' KB';
    const filename = `umatis_backup_${Date.now()}.zip`; // Mocked zip extension for client side verification compatibility

    const { data: backup, error } = await supabase
      .from('backups')
      .insert({
        tenant_id: tenantId,
        filename,
        size_bytes: sizeBytes,
        size_formatted: sizeFormatted,
        data_json: dataJson
      })
      .select('*')
      .single();

    if (error) throw new Error("Gagal membuat file cadangan: " + error.message);
    await logAudit('CREATE_BACKUP', `Berhasil membuat arsip database cadangan: "${filename}".`);

    return { backup };
  },

  deleteBackup: async (id) => {
    const tenantId = await getActiveTenantId();
    const { data: backup } = await supabase.from('backups').select('filename').eq('id', id).eq('tenant_id', tenantId).single();
    if (!backup) throw new Error("Cadangan tidak ditemukan.");
    const { error } = await supabase.from('backups').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw new Error("Gagal menghapus cadangan: " + error.message);
    await logAudit('DELETE_BACKUP', `Menghapus arsip cadangan: "${backup.filename}".`);
    return true;
  },

  restoreBackup: async (formDataOrFilename) => {
    const tenantId = await getActiveTenantId();
    let backupPayload;

    // 1. Resolve payload either from DB select or uploaded File text parsing
    if (typeof formDataOrFilename === 'string') {
      const { data, error } = await supabase
        .from('backups')
        .select('data_json, filename')
        .eq('filename', formDataOrFilename)
        .eq('tenant_id', tenantId)
        .single();

      if (error || !data) throw new Error("Gagal memuat arsip pemulihan: " + error.message);
      backupPayload = JSON.parse(data.data_json);
      await logAudit('RESTORE_BACKUP', `Melakukan restorasi database dari arsip internal: "${data.filename}".`);
    } else {
      const file = formDataOrFilename.get('backup_file');
      const text = await file.text();
      backupPayload = JSON.parse(text);
      await logAudit('RESTORE_BACKUP', `Melakukan restorasi database dari unggah file cadangan luar: "${file.name}".`);
    }

    if (!backupPayload) throw new Error("Data pemulihan kosong atau rusak.");

    // 2. Perform Atomic Tenant Data Wipe and Restore via RPC
    const { error: rpcErr } = await supabase.rpc('restore_tenant_backup_atomic', {
      p_tenant_id: tenantId,
      p_payload: backupPayload
    });

    if (rpcErr) throw new Error("Gagal memulihkan database secara atomik: " + rpcErr.message);

    await logAudit('RESTORE_COMPLETE', 'Database pemulihan berhasil dipasang penuh.');
    return true;
  },

  downloadBackup: async (filename) => {
    const tenantId = await getActiveTenantId();
    // 1. Fetch file record from Supabase backups table
    const { data, error } = await supabase
      .from('backups')
      .select('data_json')
      .eq('filename', filename)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) throw new Error("Gagal mengunduh backup: " + error.message);

    // 2. Trigger browser download of raw text representation (mocking a zip file extension)
    const blob = new Blob([data.data_json], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    await logAudit('DOWNLOAD_BACKUP', `Mengunduh berkas cadangan: "${filename}".`);
  },

  // --- POS CUSTOM TEMPLATES ---
  getPosTemplates: async () => {
    const { data, error } = await supabase
      .from('pos_templates')
      .select('*')
      .order('display_name');

    if (error) throw new Error("Gagal memuat template POS: " + error.message);
    return data;
  },

  createPosTemplate: async (templateData) => {
    const { data, error } = await supabase
      .from('pos_templates')
      .insert({
        name: templateData.name.toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_'),
        display_name: templateData.display_name,
        column_mapping: templateData.column_mapping
      })
      .select('*')
      .single();

    if (error) throw new Error("Gagal membuat template POS: " + error.message);
    await logAudit('CREATE_POS_TEMPLATE', `Membuat template kasir baru: "${data.display_name}".`);
    return data;
  },

  updateTenantTemplate: async (templateId) => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('tenants')
      .update({ pos_template_id: templateId })
      .eq('id', tenantId)
      .select('*, pos_templates(display_name)')
      .single();

    if (error) throw new Error("Gagal memperbarui template outlet: " + error.message);
    
    const displayName = data.pos_templates ? data.pos_templates.display_name : 'Default Umatis';
    await logAudit('UPDATE_TENANT_TEMPLATE', `Mengubah template pembacaan POS aktif outlet menjadi: "${displayName}".`);
    return data;
  },

  getActiveTenantTemplate: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('tenants')
      .select('*, pos_templates(*)')
      .eq('id', tenantId)
      .single();

    if (error || !data) {
      return {
        header_row_index: 12,
        branch_col: "branch",
        sales_date_col: "sales date",
        menu_name_col: "menu name",
        menu_code_col: "menu code",
        qty_col: "qty",
        total_col: "total"
      };
    }

    if (!data.pos_templates) {
      return {
        header_row_index: 12,
        branch_col: "branch",
        sales_date_col: "sales date",
        menu_name_col: "menu name",
        menu_code_col: "menu code",
        qty_col: "qty",
        total_col: "total"
      };
    }

    return data.pos_templates.column_mapping;
  },

  getActiveTenantTemplateDetails: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('tenants')
      .select('pos_template_id, pos_templates(*)')
      .eq('id', tenantId)
      .single();

    if (error || !data) return null;
    return data;
  },

  // --- BULK IMPORT ---
  bulkImportMaterials: async (rows) => {
    const tenantId = await getActiveTenantId();
    let success = 0;
    let failed = 0;
    const errors = [];

    // Pre-fetch all existing suppliers to avoid duplicates
    const { data: allSuppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('tenant_id', tenantId);

    // Track known suppliers by name (case-insensitive)
    const suppliersMap = new Map((allSuppliers || []).map(s => [s.name.toLowerCase().trim(), s]));

    // BUG-FIX 2026-08: previously upserted with `onConflict: 'tenant_id, name'`,
    // so re-importing after a name fix/rename (KODE ITEM unchanged) inserted a
    // NEW orphaned row instead of updating the existing one — see analysis
    // Bagian 1.1. Pre-fetch existing materials by sku AND name, resolve the
    // target row ourselves (sku wins over name), then use an explicit
    // update()/insert() instead of upsert()+onConflict — this also sidesteps
    // needing a DB unique constraint on (tenant_id, sku) (analysis Bagian 3.4).
    const { data: allMaterialsForImport } = await supabase
      .from('materials')
      .select('id, name, sku')
      .eq('tenant_id', tenantId);

    const materialsBySkuForImport = new Map(
      (allMaterialsForImport || []).filter(m => m.sku).map(m => [String(m.sku).toLowerCase().trim(), m])
    );
    const materialsByNameForImport = new Map(
      (allMaterialsForImport || []).map(m => [m.name.toLowerCase().trim(), m])
    );

    for (const row of rows) {
      try {
        let supplierName = row.supplier ? String(row.supplier).trim() : 'Default Supplier';
        if (supplierName === '') supplierName = 'Default Supplier';
        
        let supplierKey = supplierName.toLowerCase();
        
        // Auto-create supplier if it doesn't exist
        if (!suppliersMap.has(supplierKey)) {
          const { data: newSupplier, error: suppErr } = await supabase.from('suppliers').insert({
            tenant_id: tenantId,
            name: supplierName,
            status: 'active',
            address: '',
            phone: '',
            contact_person: ''
          }).select('id, name').single();
          
          if (!suppErr && newSupplier) {
            suppliersMap.set(supplierKey, newSupplier);
          }
        }

        const insertData = {
          tenant_id: tenantId,
          name: row.name,
          category: row.category || 'Others',
          supplier: supplierName,
          unit: row.unit || 'pck',
          full_pack: row.full_pack || '',
          price: parseFloat(row.price || 0),
          new_price: parseFloat(row.price || 0),
          min_stock: parseFloat(row.min_stock || 15),
          is_active: true
        };

        // Stable code (KODE ITEM) for cross-referencing this material from
        // recipe bulk imports and any external backend/POS integration,
        // instead of matching by name text alone.
        const rowSku = row.sku !== undefined && row.sku !== '' ? String(row.sku).trim() : '';
        if (rowSku) {
          insertData.sku = rowSku;
        }
        
        // If they provided initial stock, set it (optional)
        if (row.qty_resto !== undefined && row.qty_resto !== '') {
          insertData.qty_resto = parseFloat(row.qty_resto || 0);
        }

        // Resolve the existing row this import row refers to: KODE ITEM (sku)
        // wins over name, so editing the name on re-import (typo fix, rename)
        // still updates the SAME material instead of creating an orphan.
        let existingMaterial = null;
        if (rowSku) existingMaterial = materialsBySkuForImport.get(rowSku.toLowerCase());
        if (!existingMaterial && row.name) {
          existingMaterial = materialsByNameForImport.get(String(row.name).toLowerCase().trim());
        }

        let error;
        if (existingMaterial) {
          ({ error } = await supabase.from('materials').update(insertData).eq('id', existingMaterial.id));
        } else {
          const { data: insertedMaterial, error: insErr } = await supabase
            .from('materials')
            .insert(insertData)
            .select('id, name, sku')
            .single();
          error = insErr;
          // Keep local maps in sync so later rows in this same import batch
          // (e.g. duplicate sku typo'd twice) resolve against it too.
          if (!insErr && insertedMaterial) {
            materialsByNameForImport.set(insertedMaterial.name.toLowerCase().trim(), insertedMaterial);
            if (insertedMaterial.sku) {
              materialsBySkuForImport.set(String(insertedMaterial.sku).toLowerCase().trim(), insertedMaterial);
            }
          }
        }

        if (error) { failed++; errors.push({ row: row.name, error: error.message }); }
        else success++;
      } catch (e) {
        failed++;
        errors.push({ row: row.name, error: e.message });
      }
    }

    await logAudit('BULK_IMPORT_MATERIALS', `Bulk import ${success} bahan baku berhasil, ${failed} gagal.`);
    return { success, failed, errors };
  },

  bulkImportRecipes: async (rows) => {
    const tenantId = await getActiveTenantId();
    const unitConversionMap = await api._loadUnitConversionMap(tenantId);

    let success = 0;
    let failed = 0;
    const errors = [];
    const warnings = [];

    // Pre-fetch all materials for the tenant, indexed by both name AND sku
    // (kode item) so ingredient references can be resolved deterministically
    // by code when given, instead of relying purely on exact name matching.
    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name, sku, unit, full_pack, price, new_price')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const materialsMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase().trim(), m]));
    const materialsBySku = new Map((allMaterials || []).filter(m => m.sku).map(m => [m.sku.toLowerCase().trim(), m]));

    // BUG-FIX 2026-08: previously upserted with `onConflict: 'menu_name,tenant_id'`,
    // so re-importing after a menu name fix/rename (KODE MENU/pos_code unchanged)
    // inserted a NEW recipe row with the SAME pos_code as the old one — see
    // analysis Bagian 1.2, which then breaks POS matching (Bagian 1.3) because
    // two recipes share one pos_code. Pre-fetch existing recipes by pos_code AND
    // menu_name, resolve the target row ourselves (pos_code wins over name), then
    // use an explicit update()/insert() instead of upsert()+onConflict — this also
    // sidesteps needing a DB unique constraint on (tenant_id, pos_code) (Bagian 3.4).
    const { data: allRecipesForImport } = await supabase
      .from('recipes')
      .select('id, menu_name, pos_code')
      .eq('tenant_id', tenantId);

    const recipesByCodeForImport = new Map(
      (allRecipesForImport || []).filter(r => r.pos_code).map(r => [String(r.pos_code).toLowerCase().trim(), r])
    );
    const recipesByNameForImport = new Map(
      (allRecipesForImport || []).map(r => [r.menu_name.toLowerCase().trim(), r])
    );

    const resolveMaterial = (itemCode, itemName) => {
      if (itemCode) {
        const bySku = materialsBySku.get(itemCode.toLowerCase().trim());
        if (bySku) return bySku;
      }
      if (itemName) {
        const byName = materialsMap.get(itemName.toLowerCase().trim());
        if (byName) return byName;
      }
      return null;
    };

    // rows format: { menu_name, selling_price, bahan_1, qty_1, kode_bahan_1, ... }
    for (const row of rows) {
      try {
        let ingredients = [];
        
        // Extract up to 10 ingredient columns from the flat row. kode_bahan_N
        // (material SKU/kode item) is optional and, when present, wins over
        // bahan_N (name) when resolving which material the row refers to —
        // deterministic ID-based matching instead of fuzzy name matching.
        for (let i = 1; i <= 10; i++) {
          const bahanKey = `bahan_${i}`;
          const qtyKey = `qty_${i}`;
          const kodeKey = `kode_bahan_${i}`;
          const hasName = row[bahanKey] && String(row[bahanKey]).trim() !== '';
          const hasCode = row[kodeKey] && String(row[kodeKey]).trim() !== '';

          if (hasName || hasCode) {
            ingredients.push({
              item_name: hasName ? String(row[bahanKey]).trim() : '',
              item_code: hasCode ? String(row[kodeKey]).trim() : '',
              qty_in_use: parseFloat(row[qtyKey] || 0)
            });
          }
        }

        const VALID_CATEGORIES = ['KOPI', 'NON-KOPI', 'MOCKTAIL', 'JUICE', 'TEA', 'BEER'];
        const rawCategory = row.category ? row.category.toString().trim().toUpperCase() : '';
        const category = VALID_CATEGORIES.includes(rawCategory) ? rawCategory : 'NON-KOPI';
        let subtotal = 0;

        // Simple subtotal calculation from ingredients if available
        if (ingredients.length > 0) {
          subtotal = ingredients.reduce((sum, ing) => {
            const mat = resolveMaterial(ing.item_code, ing.item_name);
            if (mat) {
              const unit = ing.unit || mat.unit || 'gr';
              return sum + calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit, unitConversionMap);
            }
            return sum;
          }, 0);
        }

        // Full recipe pricing engine, same as createRecipe/updateRecipe (PRD §4.2
        // Opsi B). row.fix_cost_pct / row.food_cost_pct are expected as FRACTIONS
        // (0.05 = 5%) — Recipes.jsx's onCommit handler converts the Excel sheet's
        // human-friendly percent numbers (5, 18, ...) before this function is
        // called. Any of these being unset/undefined (old-style templates without
        // these columns) falls back to the pre-existing bulk-import behavior.
        const fixCostPct = row.fix_cost_pct != null && row.fix_cost_pct !== ''
          ? parseFloat(row.fix_cost_pct) : activeOverheadPct;
        const roundingDirection = row.rounding_direction || DEFAULT_ROUNDING_DIRECTION;
        const roundingIncrement = row.rounding_increment != null && row.rounding_increment !== ''
          ? parseFloat(row.rounding_increment) : DEFAULT_ROUNDING_INCREMENT;
        const priceAdjustment = row.price_adjustment != null && row.price_adjustment !== ''
          ? parseFloat(row.price_adjustment) : DEFAULT_PRICE_ADJUSTMENT;
        const foodCostPctTarget = row.food_cost_pct != null && row.food_cost_pct !== ''
          ? parseFloat(row.food_cost_pct) : 0;

        // Flexible-but-guarded: catch an obviously wrong percentage (e.g. a
        // stray value >100% or a raw "50" that should've been "0.5") with a
        // clear per-row error instead of silently saving a nonsense HPP.
        if (isNaN(fixCostPct) || fixCostPct < 0 || fixCostPct > 1) {
          throw new Error(`FIX COST % tidak valid (${(fixCostPct * 100).toFixed(1)}%) — harus 0-100%`);
        }
        if (isNaN(foodCostPctTarget) || foodCostPctTarget < 0 || foodCostPctTarget > 1) {
          throw new Error(`FOOD COST % TARGET tidak valid (${(foodCostPctTarget * 100).toFixed(1)}%) — harus 0-100%`);
        }

        const { fixCost, basicCost, sellingPriceRaw, sellingPriceFinal } = computeRecipeCosts({
          subtotal, fixCostPct, foodCostPct: foodCostPctTarget,
          roundingDirection, roundingIncrement, priceAdjustment
        });

        // A manually-typed HARGA JUAL always wins over the target-driven price —
        // same "selling_price_override wins" rule as createRecipe/updateRecipe.
        // Only when it's blank/0 do we fall back to the computed target price.
        const manualSellingPrice = parseFloat(row.selling_price || 0);
        const sellingPrice = manualSellingPrice > 0 ? manualSellingPrice : (sellingPriceFinal || 0);

        // food_cost_pct stored value: prefer the explicit target (consistent with
        // createRecipe/updateRecipe — this column means "target", not "achieved
        // ratio"). Rows with no target column but a manual selling price fall back
        // to the achieved ratio, matching bulk import's original pre-merge
        // behavior so old-style templates keep working exactly as before.
        let foodCostPct = foodCostPctTarget > 0
          ? foodCostPctTarget
          : (sellingPrice > 0 ? basicCost / sellingPrice : 0);
        if (foodCostPct > 99.9999) foodCostPct = 99.9999;

        // Recipe code (KODE MENU) — reuses the existing pos_code column, which
        // PosTerminal.jsx already matches sales against, so a code assigned here
        // is immediately usable for POS/back-end integration.
        const recipeCode = row.recipe_code || row.pos_code || row.menu_code || null;
        const normalizedRecipeCode = recipeCode ? String(recipeCode).trim() : null;

        const recipePayload = {
          tenant_id: tenantId,
          menu_name: row.menu_name,
          pos_code: normalizedRecipeCode,
          category: category,
          selling_price: sellingPrice,
          subtotal: parseFloat(subtotal.toFixed(2)),
          fix_cost_pct: fixCostPct,
          fix_cost: parseFloat(fixCost.toFixed(2)),
          basic_cost: parseFloat(basicCost.toFixed(2)),
          food_cost_pct: parseFloat(foodCostPct.toFixed(4)),
          selling_price_raw: parseFloat((sellingPriceRaw || 0).toFixed(2)),
          rounding_direction: roundingDirection,
          rounding_increment: roundingIncrement,
          price_adjustment: priceAdjustment
        };

        // Resolve the existing row this import row refers to: KODE MENU
        // (pos_code) wins over menu_name, so editing the name on re-import
        // still updates the SAME recipe instead of creating a pos_code-colliding
        // duplicate.
        let existingRecipe = null;
        if (normalizedRecipeCode) {
          existingRecipe = recipesByCodeForImport.get(normalizedRecipeCode.toLowerCase());
        }
        if (!existingRecipe && row.menu_name) {
          existingRecipe = recipesByNameForImport.get(String(row.menu_name).toLowerCase().trim());
        }

        let recipeData, recipeErr;
        if (existingRecipe) {
          ({ data: recipeData, error: recipeErr } = await supabase
            .from('recipes')
            .update(recipePayload)
            .eq('id', existingRecipe.id)
            .select('id')
            .single());
        } else {
          ({ data: recipeData, error: recipeErr } = await supabase
            .from('recipes')
            .insert(recipePayload)
            .select('id')
            .single());
        }

        if (recipeErr) throw new Error(recipeErr.message);

        // Keep local maps in sync so later rows in this same import batch
        // resolve against the row we just wrote.
        if (recipeData?.id) {
          const rec = { id: recipeData.id, menu_name: row.menu_name, pos_code: normalizedRecipeCode };
          if (normalizedRecipeCode) recipesByCodeForImport.set(normalizedRecipeCode.toLowerCase(), rec);
          if (row.menu_name) recipesByNameForImport.set(String(row.menu_name).toLowerCase().trim(), rec);
        }

        // Link ingredients if recipe was successfully upserted
        if (ingredients.length > 0 && recipeData?.id) {
          const ingredientsToInsert = [];
          for (const ing of ingredients) {
            if (!ing.item_name && !ing.item_code) continue;

            let mat = resolveMaterial(ing.item_code, ing.item_name);
            
            // AUTO-CREATE MATERIAL IF NOT FOUND (by kode or nama) — kept as a
            // convenience default so an import never hard-fails over a missing
            // material, but now tracked and surfaced via `warnings` so it's
            // visible and fixable instead of a silent Rp0 material quietly
            // skewing this and every other recipe's HPP.
            if (!mat) {
              const newName = ing.item_name || ing.item_code;
              const { data: newMat, error: newMatErr } = await supabase.from('materials').insert({
                tenant_id: tenantId,
                name: newName,
                sku: ing.item_code || null,
                category: 'Others',
                supplier: 'Default Supplier',
                unit: 'gr',
                full_pack: '',
                price: 0,
                new_price: 0,
                min_stock: 15,
                is_active: true
              }).select('id, name, sku, unit, full_pack, price, new_price').single();
              
              if (!newMatErr && newMat) {
                materialsMap.set(newName.toLowerCase(), newMat);
                if (newMat.sku) materialsBySku.set(newMat.sku.toLowerCase(), newMat);
                mat = newMat;
                warnings.push(`Bahan baru "${newName}" dibuat otomatis dengan harga Rp0 (dipakai di resep "${row.menu_name}") — mohon cek & lengkapi harganya di halaman Materials.`);
              }
            }

            if (mat) {
              const unit = ing.unit || mat.unit || 'gr';
              const unitPrice = parseFloat(mat.new_price ?? mat.price ?? 0);
              const amount = calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit, unitConversionMap);
              
              ingredientsToInsert.push({
                recipe_id: recipeData.id,
                material_id: mat.id,
                qty_in_use: parseFloat(ing.qty_in_use || 0),
                unit: unit,
                unit_price: unitPrice,
                amount: parseFloat(amount.toFixed(2))
              });
            }
          }

          if (ingredientsToInsert.length > 0) {
            // Delete old ingredients first before inserting new ones
            await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeData.id);
            const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientsToInsert);
            if (ingErr) throw new Error("Gagal menyimpan detail bahan resep: " + ingErr.message);
          }
        }

        success++;
      } catch (e) {
        failed++;
        errors.push({ row: row.menu_name, error: e.message });
      }
    }

    await logAudit('BULK_IMPORT_RECIPES', `Bulk import ${success} resep berhasil, ${failed} gagal.`);
    return { success, failed, errors, warnings };
  },

  bulkImportOpnameItems: async (opnameId, rows) => {
    let success = 0;
    let failed = 0;
    const tenantId = await getActiveTenantId();

    // Verify ownership of the opnameId
    const { data: opnameCheck } = await supabase.from('stock_opnames').select('id').eq('id', opnameId).eq('tenant_id', tenantId).maybeSingle();
    if (!opnameCheck) throw new Error("Akses ditolak: Opname tidak valid atau bukan milik tenant ini.");

    // rows: { material_name, physical_qty, notes }
    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const materialMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase(), m.id]));

    for (const row of rows) {
      try {
        const materialId = materialMap.get((row.material_name || '').toLowerCase());
        if (!materialId) { failed++; continue; }

        const { error } = await supabase
          .from('stock_opname_items')
          .upsert({
            opname_id: opnameId,
            material_id: materialId,
            physical_qty: parseFloat(row.physical_qty || 0),
            notes: row.notes || ''
          }, { onConflict: 'opname_id,material_id' });

        if (error) failed++;
        else success++;
      } catch {
        failed++;
      }
    }

    await logAudit('BULK_IMPORT_OPNAME', `Bulk import ${success} item opname berhasil, ${failed} gagal.`);
    return { success, failed };
  },

  getTenantSettings: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant ID tidak ditemukan.");

    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error) throw new Error("Gagal memuat pengaturan resto: " + error.message);
    return {
      ...data,
      overhead_pct: 0.05,
      whatsapp_number: '',
      whatsapp_token: '',
      whatsapp_enabled: false
    };
  },

  updateTenantSettings: async (settings) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant ID tidak ditemukan.");

    const { data, error } = await supabase
      .from('tenants')
      .update({
        company_name: settings.company_name || undefined,
        is_pos_enabled: settings.is_pos_enabled !== undefined ? settings.is_pos_enabled : undefined,
        pos_tax_rate: settings.pos_tax_rate !== undefined ? settings.pos_tax_rate : undefined,
        pos_service_charge: settings.pos_service_charge !== undefined ? settings.pos_service_charge : undefined,
        locked_until_month: settings.locked_until_month !== undefined ? (settings.locked_until_month ? parseInt(settings.locked_until_month) : null) : undefined,
        locked_until_year: settings.locked_until_year !== undefined ? (settings.locked_until_year ? parseInt(settings.locked_until_year) : null) : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal memperbarui pengaturan resto: " + error.message);

    // Update active cache in memory as well!
    activeOverheadPct = 0.05;
    activeWhatsappNumber = null;
    activeWhatsappToken = null;
    activeWhatsappEnabled = false;

    await logAudit('UPDATE_TENANT_SETTINGS', `Memperbarui pengaturan outlet. Overhead: 5.0%, Locked: ${data.locked_until_month || '-'}/${data.locked_until_year || '-'}.`);
    return {
      ...data,
      overhead_pct: 0.05,
      whatsapp_number: '',
      whatsapp_token: '',
      whatsapp_enabled: false
    };
  },

  sendWhatsappNotification: async (message) => {
    if (!activeWhatsappEnabled || !activeWhatsappToken || !activeWhatsappNumber) {
      return { success: false, reason: "WhatsApp disabled or missing config." };
    }

    try {
      const response = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          'Authorization': activeWhatsappToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: activeWhatsappNumber,
          message: message
        })
      });

      const result = await response.json();
      console.log("[Fonnte WA] Status:", result.status, result.detail || "");
      return { success: !!result.status, detail: result.detail || "" };
    } catch (e) {
      console.error("[Fonnte WA] Error:", e);
      return { success: false, error: e.message };
    }
  },

  // ── Barista Report: bulk fetch all data for a given month ──
  getBaristaReportData: async (month, year) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error('Tenant not found');

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Parallel fetch all needed data
    const [
      materialsRes,
      recipesRes,
      purchaseRes,
      opnameRestoRes,
      opnameCentralRes,
      dailyInvRes,
      transactionsRes,
      unitConversionsRes
    ] = await Promise.all([
      // 1. Materials (marketlist)
      supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('category').order('name'),
      // 2. Recipes + ingredients + materials
      supabase.from('recipes').select('*, recipe_ingredients(*, materials(*))').eq('tenant_id', tenantId).order('category').order('menu_name'),
      // 3. Purchase entries for the month
      supabase.from('purchase_entries').select('*, materials(name, unit), suppliers(name)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate).order('date'),
      // 4. Stock Opname RESTO
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', month).eq('period_year', year).eq('location', 'RESTO').maybeSingle(),
      // 5. Stock Opname CENTRAL
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', month).eq('period_year', year).eq('location', 'CENTRAL').maybeSingle(),
      // 6. Daily Inventories for the month
      // BUG-FIX 2026-07: added full_pack + id — computeDailyUsage/buildDailyInventorySheet
      // now need these to compute a correct pack-size-aware valuation (was missing before,
      // which is part of why usage values were wrong even before the multiplication bug
      // itself is considered).
      supabase.from('daily_inventories').select('*, daily_inventory_items(*, materials:material_id(id, name, unit, category, price, full_pack))').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate).order('date'),
      // 7. Transactions (for pemakaian/cost control)
      supabase.from('transactions').select('*, materials(name, category)').eq('tenant_id', tenantId).gte('date', startDate).lte('date', endDate).order('date'),
      // 8. GAP-FIX 2026-07: unit_conversions was in the schema but never fetched/used
      // anywhere — needed by validateUnitConversion() to know which unit mismatches
      // have an explicit, human-confirmed conversion factor rather than flagging them.
      supabase.from('unit_conversions').select('*').eq('tenant_id', tenantId)
    ]);

    // Also fetch previous month's opname for opening stock
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const [prevOpnameRestoRes, prevOpnameCentralRes] = await Promise.all([
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', prevMonth).eq('period_year', prevYear).eq('location', 'RESTO').maybeSingle(),
      supabase.from('stock_opnames').select('*, stock_opname_items(*, materials(*))').eq('tenant_id', tenantId).eq('period_month', prevMonth).eq('period_year', prevYear).eq('location', 'CENTRAL').maybeSingle()
    ]);

    return {
      period: { month, year, startDate, endDate, lastDay },
      materials: materialsRes.data || [],
      recipes: recipesRes.data || [],
      purchases: purchaseRes.data || [],
      opnameResto: opnameRestoRes.data,
      opnameCentral: opnameCentralRes.data,
      prevOpnameResto: prevOpnameRestoRes.data,
      prevOpnameCentral: prevOpnameCentralRes.data,
      dailyInventories: dailyInvRes.data || [],
      transactions: transactionsRes.data || [],
      unitConversions: unitConversionsRes.data || []
    };
  },

  // SEC-FIX 2026-08: factoryReset() (direct execution) has been removed.
  // The underlying `factory_reset_atomic` RPC is now REVOKEd from client
  // roles entirely (see FEATURE_reset_approval_workflow.sql) — it can only
  // be invoked from inside approve_tenant_reset(), and only after a Super
  // Admin approves. This closes a real hole: previously any authenticated
  // user of any role could call factory_reset_atomic directly (e.g. via
  // devtools) with an arbitrary tenant_id, since the RPC itself never
  // checked who was calling it or which tenant they belonged to.

  // --- UNIT CONVERSIONS (manual pack-size overrides) ---
  // Secondary/optional path — the PRIMARY way to set a material's pack/content
  // conversion is now the structured `full_pack` field ("Carton = 24 pcs",
  // see costUtils.js getPackUnitInfo()/StockLedger.jsx's "Konversi Isi"
  // fields), which every call site already reads with zero extra wiring.
  // This table exists for the Settings page's central list/override view and
  // for any material where editing Full Pack directly isn't wanted. getUnitPrice()
  // checks this FIRST, then falls back to parsing full_pack.
  getUnitConversions: async () => {
    const tenantId = await getActiveTenantId();
    const { data, error } = await supabase
      .from('unit_conversions')
      .select('*, materials(id, name, unit, full_pack)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Internal helper — builds the Map<material_id, factor> shape that
  // getUnitPrice()/calculateIngredientCost() expect. Used by every other
  // function in this file that computes a Rupiah cost from a material, so a
  // conversion saved here actually takes effect everywhere, not just in the
  // Settings page that lists it.
  async _loadUnitConversionMap(tenantId) {
    const { data, error } = await supabase
      .from('unit_conversions')
      .select('material_id, factor')
      .eq('tenant_id', tenantId);
    if (error) { console.warn('Gagal memuat unit_conversions:', error.message); return new Map(); }
    return new Map((data || []).map(c => [c.material_id, parseFloat(c.factor)]));
  },

  upsertUnitConversion: async ({ id, material_id, from_unit, to_unit, factor }) => {
    const tenantId = await getActiveTenantId();
    const payload = {
      tenant_id: tenantId,
      material_id,
      from_unit,
      to_unit,
      factor: parseFloat(factor)
    };
    if (id) {
      const { error } = await supabase.from('unit_conversions').update(payload).eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('unit_conversions').insert(payload);
      if (error) throw error;
    }
    await logAudit('UPSERT_UNIT_CONVERSION', `Konversi satuan disimpan: 1 ${to_unit} = ${factor} ${from_unit}.`);
  },

  deleteUnitConversion: async (id) => {
    const tenantId = await getActiveTenantId();
    const { error } = await supabase.from('unit_conversions').delete().eq('id', id).eq('tenant_id', tenantId);
    if (error) throw error;
    await logAudit('DELETE_UNIT_CONVERSION', `Konversi satuan (id: ${id}) dihapus.`);
  },

  async requestTenantReset(tenantId, options = {}) {
    const {
      resetPos = true,
      resetStockHistory = true,
      resetPurchasing = true,
      resetRecipes = false,
      resetMaterials = false
    } = options;

    const { data, error } = await supabase.rpc('request_tenant_reset', {
      p_tenant_id: tenantId,
      p_reset_pos: resetPos,
      p_reset_stock_history: resetStockHistory,
      p_reset_purchasing: resetPurchasing,
      p_reset_recipes: resetRecipes,
      p_reset_materials: resetMaterials
    });

    if (error) {
      if (error.code === 'PGRST202' || error.message.includes('Could not find the function')) {
        throw new Error('SYSTEM_UPDATE_REQUIRED: Fitur ini memerlukan update database. Jalankan FEATURE_reset_approval_workflow.sql terlebih dahulu.');
      }
      throw new Error(error.message.replace('AUTH: ', ''));
    }
    return data; // request id
  },

  // Owner: list this tenant's own reset requests (pending + history).
  async getTenantResetRequests(tenantId) {
    const { data, error } = await supabase
      .from('tenant_reset_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('requested_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  },

  // Super Admin: list all reset requests across every tenant.
  async getAllResetRequests() {
    const { data, error } = await supabase
      .from('tenant_reset_requests')
      .select('*, tenants(company_name, name), requester:requested_by(name, email)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  },

  // Super Admin: approve or reject a pending request. Only on approve does
  // the actual data deletion happen (server-side, inside the RPC).
  async reviewTenantResetRequest(requestId, approve, rejectionReason = null) {
    const { data, error } = await supabase.rpc('approve_tenant_reset', {
      p_request_id: requestId,
      p_approve: approve,
      p_rejection_reason: rejectionReason
    });
    if (error) {
      if (error.code === 'PGRST202' || error.message.includes('Could not find the function')) {
        throw new Error('SYSTEM_UPDATE_REQUIRED: Fitur ini memerlukan update database. Jalankan FEATURE_reset_approval_workflow.sql terlebih dahulu.');
      }
      throw new Error(error.message.replace('AUTH: ', ''));
    }
    return data;
  }
};
