// Barventis Serverless API Service Client for Supabase Backend Integration
import { supabase } from '../lib/supabase';

let activeTenantId = null;
let activeUserId = null;

// Helper to get active tenant info — uses cached memory first, falls back to Supabase session
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

// Helper for Audit Logging — uses cached values to prevent lock deadlocks
const logAudit = async (action, description) => {
  try {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    if (!userId) return;

    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId,
      action,
      description
    });
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
};

// --- F&B BULK METRIC CONVERSION UTILITIES ---
export function parsePackSize(fullPack) {
  if (!fullPack) return 0;
  fullPack = fullPack.toLowerCase().trim();
  
  let grMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:gr|grm|gram)\b/i);
  if (grMatch) return parseFloat(grMatch[1]);

  let mlMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  let lMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\b/i);
  if (lMatch) return parseFloat(lMatch[1]) * 1000.0;

  let pcsMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*pcs\b/i);
  if (pcsMatch) return parseFloat(pcsMatch[1]);

  let kgMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000.0;

  return 0;
}

export function calculateIngredientCost(material, qtyInUse, recipeUnit) {
  const price = parseFloat(material.new_price ?? material.price ?? 0);
  const packUnit = (material.unit || '').toLowerCase().trim();
  recipeUnit = (recipeUnit || '').toLowerCase().trim();

  if (recipeUnit === packUnit) {
    return qtyInUse * price;
  }

  const packSize = parsePackSize(material.full_pack);
  return packSize > 0 ? qtyInUse * (price / packSize) : qtyInUse * price;
}

// ─── RETRY HELPER ────────────────────────────────────────────────────────────
// Supabase DB triggers that create the `users` row after signUp can be
// slightly slower than the immediately following profile query. This helper
// retries up to `maxAttempts` times with exponential back-off so we don't
// fail immediately on a race condition.
const retryWithBackoff = async (fn, maxAttempts = 3, baseDelayMs = 400) => {
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (result !== null && result !== undefined) return result;
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr || new Error('Max retry attempts reached.');
};

export const api = {
  // Set memory cache to avoid async locks in browser
  setSessionData: (tenantId, userId) => {
    activeTenantId = tenantId;
    activeUserId = userId;
    console.log("[api.setSessionData] Cached tenant ID:", tenantId, "user ID:", userId);
  },

  // --- AUTHENTICATION ---
  login: async (tenantName, email, password) => {
    // 1. Perform Supabase authentication first
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authErr || !authData?.user) {
      throw new Error(authErr?.message || 'Email atau password salah.');
    }

    // 2. Fetch user profile — use maybeSingle() to avoid 406 when RLS returns
    //    0 rows (e.g. profile row not yet created) instead of crashing outright.
    //    We also retry a few times to handle the DB-trigger race condition.
    let userProfile = null;
    try {
      userProfile = await retryWithBackoff(async () => {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();                    // ← KEY FIX: was .single() → 406 on 0 rows
        if (error) throw new Error(error.message);
        return data;                         // null if not found yet; retried
      });
    } catch (e) {
      await supabase.auth.signOut();
      throw new Error('Profil user tidak ditemukan: ' + e.message);
    }

    if (!userProfile) {
      await supabase.auth.signOut();
      throw new Error('Profil user tidak ditemukan setelah beberapa percobaan. Hubungi administrator.');
    }

    let tenant;
    const isSALogin = userProfile.role === 'Super Admin' || userProfile.role === 'SuperAdmin';

    if (isSALogin) {
      tenant = { name: 'superadmin', company_name: 'Barventis System Management', id: null, status: 'active' };
    } else {
      // 3. Fetch tenant details
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();                      // ← KEY FIX: was .single() → 406 on miss

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

    if (!isSALogin) {
      if (tenant.name.toLowerCase() !== tenantName.toLowerCase()) {
        await supabase.auth.signOut();
        throw new Error('User ini tidak terdaftar di ID Resto ' + tenantName.toUpperCase() + '.');
      }
    }

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

    // 1. Verify if tenant already exists
    const { data: existingTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('name', formattedTenantName)
      .maybeSingle();

    if (existingTenant) {
      throw new Error('Nama ID Resto / Tenant ini sudah digunakan. Coba nama lain.');
    }

    // 2. Create the tenant first (to get UUID)
    const { data: newTenant, error: createTenantErr } = await supabase
      .from('tenants')
      .insert({
        name: formattedTenantName,
        company_name: companyName,
        status: 'active'
      })
      .select('*')
      .single();

    if (createTenantErr || !newTenant) {
      throw new Error('Gagal mendaftarkan tenant baru: ' + (createTenantErr?.message || 'Unknown error'));
    }

    // 3. Register user with Supabase auth
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
      // Cleanup created tenant
      await supabase.from('tenants').delete().eq('id', newTenant.id);
      throw new Error('Gagal mendaftarkan admin: ' + (signupErr?.message || 'Unknown error'));
    }

    // 4. Trigger database profile insertion manually in case of slow DB trigger sync
    const { data: profileCheck } = await supabase.from('users').select('id').eq('id', authData.user.id).maybeSingle();
    if (!profileCheck) {
      await supabase.from('users').insert({
        id: authData.user.id,
        tenant_id: newTenant.id,
        name: adminName,
        email: email,
        role: 'Admin / Owner'
      });
    }

    try { await logAudit('REGISTER', `Pendaftaran akun resto baru ${companyName} berhasil oleh ${adminName}.`); } catch { /* ignore: best-effort */ }

    return {
      token: authData.session?.access_token,
      tenant: { name: newTenant.name, company_name: newTenant.company_name },
      user: { id: authData.user.id, name: adminName, email: email, role: 'Admin / Owner', tenant_id: newTenant.id, tenant_name: newTenant.name }
    };
  },

  logout: async () => {
    try { await logAudit('LOGOUT', 'User melakukan logout dari sistem.'); } catch { /* ignore: best-effort */ }
    localStorage.removeItem('umatis_token');
    localStorage.removeItem('umatis_tenant_name');
    localStorage.removeItem('umatis_user');
    await supabase.auth.signOut();
  },

  // getProfile — reads from Supabase DB using maybeSingle() to safely handle
  // the case where the users row doesn't exist yet (DB trigger race condition).
  //
  // IF YOU SEE 406 HERE: The row exists in auth.users but NOT in public.users
  // (DB trigger not set up), OR RLS policy is blocking the SELECT.
  // Run SUPABASE_FIX.sql in Supabase Dashboard → SQL Editor to fix this.
  getProfile: async () => {
    console.log("[api.getProfile] getSession starting...");
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData?.session;
    console.log("[api.getProfile] getSession complete. Session user ID:", session?.user?.id);

    if (sessionErr) {
      console.error("[api.getProfile] getSession error:", sessionErr.message);
      throw new Error('Gagal membaca sesi aktif: ' + sessionErr.message);
    }
    if (!session?.user) throw new Error('No active session.');

    const userId = session.user.id;

    console.log("[api.getProfile] Querying users table...");
    const { data: userProfile, error } = await supabase
      .from('users')
      .select('id, tenant_id, name, email, role')
      .eq('id', userId)
      .maybeSingle();

    console.log("[api.getProfile] Querying users table complete. Error:", error ? error.message : "none", "Profile:", userProfile);

    // 406 from maybeSingle() means PostgREST got an unexpected response format —
    // almost always caused by an RLS policy blocking the row so PostgREST gets
    // an empty result it can't serialize, OR the row literally does not exist.
    if (error) {
      const is406 = error.code === 'PGRST116' || error.message?.includes('Cannot coerce') || error.message?.includes('406');
      if (is406) {
        // Try to determine whether it's an RLS issue or a missing row
        console.error(
          "[api.getProfile] 406 detected. This means either:\n" +
          "  1. Row missing in public.users (DB trigger not set up) → Run SUPABASE_FIX.sql\n" +
          "  2. RLS policy blocking SELECT on public.users → Check RLS policies in Supabase Dashboard\n" +
          "  User ID:", userId
        );
        throw new Error(
          'Profil tidak ditemukan di database. ' +
          'Kemungkinan penyebab: (1) trigger database belum dibuat, atau (2) RLS policy memblokir akses. ' +
          'Hubungi administrator untuk menjalankan SUPABASE_FIX.sql.'
        );
      }
      throw new Error('Error membaca profil: ' + error.message);
    }

    if (!userProfile) {
      // Row genuinely not found (maybeSingle returned null, no error) —
      // this means the DB trigger didn't fire when this auth user was created.
      console.error("[api.getProfile] User row missing in public.users for auth user:", userId,
        "\nFix: Run SUPABASE_FIX.sql → Step 2 (backfill) in Supabase Dashboard.");
      throw new Error(
        'Profil tidak ditemukan. ' +
        'Akun Anda belum terdaftar di tabel pengguna sistem. ' +
        'Hubungi administrator untuk menjalankan script perbaikan database.'
      );
    }

    let tenantName = '';
    let companyName = '';
    if (userProfile.role === 'Super Admin' || userProfile.role === 'SuperAdmin') {
      tenantName = 'superadmin';
      companyName = 'Barventis System Management';
      console.log("[api.getProfile] Super Admin detected, skipping tenant table query.");
    } else if (userProfile.tenant_id) {
      console.log("[api.getProfile] Querying tenants table for ID:", userProfile.tenant_id);
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, company_name')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();
      console.log("[api.getProfile] Querying tenants table complete. Tenant:", tenant);
      if (tenant) {
        tenantName = tenant.name;
        companyName = tenant.company_name;
      }
    }

    return {
      ...userProfile,
      tenant_name: tenantName,
      company_name: companyName
    };
  },

  // --- LEDGER TRANSACTIONS ---
  getTransactions: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
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

  // --- STOCK / MATERIALS ---
  getMaterials: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
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
    const { data: oldMaterial } = await supabase.from('materials').select('*').eq('id', id).maybeSingle();
    
    const { data, error } = await supabase
      .from('materials')
      .update({
        name: materialData.name,
        category: materialData.category,
        supplier: materialData.supplier,
        unit: materialData.unit,
        full_pack: materialData.full_pack,
        price: parseFloat(materialData.price || 0),
        new_price: parseFloat(materialData.new_price ?? materialData.price ?? 0),
        min_stock: parseFloat(materialData.min_stock || 15.00)
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error("Gagal memperbarui bahan: " + error.message);

    if (oldMaterial && (oldMaterial.price !== data.price || oldMaterial.new_price !== data.new_price)) {
      const formattedOld = new Intl.NumberFormat('id-ID').format(oldMaterial.new_price || oldMaterial.price);
      const formattedNew = new Intl.NumberFormat('id-ID').format(data.new_price);
      await logAudit('UPDATE_PRICE', `Mengubah harga bahan "${data.name}" dari Rp${formattedOld} menjadi Rp${formattedNew}.`);
    } else {
      await logAudit('UPDATE_MATERIAL', `Memperbarui detail bahan mentah: "${data.name}".`);
    }

    return data;
  },

  deleteMaterial: async (id) => {
    const { count, error: countErr } = await supabase
      .from('recipe_ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('material_id', id);

    if (!countErr && count > 0) {
      throw new Error(`Tidak bisa menonaktifkan: bahan baku ini masih digunakan di ${count} resep aktif. Hapus dari resep terlebih dahulu.`);
    }

    const { data, error } = await supabase
      .from('materials')
      .update({ is_active: false })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw new Error("Gagal menonaktifkan bahan: " + error.message);
    await logAudit('DELETE_MATERIAL', `Menonaktifkan bahan mentah: "${data.name}" dari database inventory.`);
    return data;
  },

  adjustStock: async (id, adjustData) => {
    const tenantId = await getActiveTenantId();
    const { data: material, error: matErr } = await supabase.from('materials').select('*').eq('id', id).maybeSingle();
    if (matErr || !material) throw new Error("Bahan baku tidak ditemukan.");

    const { location, type, qty, notes } = adjustData;
    const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
    const parsedQty = parseFloat(qty);

    let finalQty;
    let newQtyResto = parseFloat(material.qty_resto);
    let newQtyCentral = parseFloat(material.qty_central);

    if (type === 'IN') {
      finalQty = parsedQty;
      if (location === 'RESTO') {
        newQtyResto += parsedQty;
      } else {
        newQtyCentral += parsedQty;
      }
    } else if (type === 'OUT') {
      finalQty = -parsedQty;
      if (location === 'RESTO') {
        newQtyResto = Math.max(0, newQtyResto - parsedQty);
      } else {
        newQtyCentral = Math.max(0, newQtyCentral - parsedQty);
      }
    } else { // TRANSFER (Central -> Resto)
      if (location !== 'CENTRAL') {
        throw new Error('Transfer stock harus berasal dari gudang CENTRAL.');
      }
      if (newQtyCentral < parsedQty) {
        throw new Error('Stok di gudang CENTRAL tidak cukup.');
      }
      newQtyCentral -= parsedQty;
      newQtyResto += parsedQty;
      finalQty = parsedQty;
    }

    const { data: updatedMaterial, error: updateErr } = await supabase
      .from('materials')
      .update({ qty_resto: newQtyResto, qty_central: newQtyCentral })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) throw new Error("Gagal update stok: " + updateErr.message);

    const { data: transaction, error: txErr } = await supabase
      .from('transactions')
      .insert({
        tenant_id: tenantId,
        date: new Date().toISOString().split('T')[0],
        material_id: id,
        type,
        location,
        qty: finalQty,
        amount: finalQty * unitPrice,
        notes: notes || `Manual ${type} adjustment`
      })
      .select('*')
      .single();

    if (txErr) console.warn("Gagal mencatat ledger transaksi:", txErr);

    const actionLabel = type === 'TRANSFER' ? 'Transfer' : (type === 'IN' ? 'Stock In' : 'Stock Out');
    await logAudit('ADJUST_STOCK', `Menyesuaikan stok "${material.name}" (${actionLabel}) sebesar ${qty} ${material.unit} di ${location}. Catatan: "${notes || 'Tidak ada'}".`);

    return { material: updatedMaterial, transaction };
  },

  // --- RECIPES ---
  getRecipes: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('recipes')
      .select('*, recipe_ingredients(*, materials(*))')
      .eq('tenant_id', tenantId)
      .order('menu_name');

    if (error) throw new Error("Gagal memuat resep: " + error.message);

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
  
  createRecipe: async (recipeData) => {
    const tenantId = await getActiveTenantId();
    
    let subtotal = 0.00;
    const ingredientRows = [];

    const matIds = (recipeData.ingredients || []).map(i => i.material_id).filter(Boolean);
    const { data: materials } = matIds.length
      ? await supabase.from('materials').select('*').in('id', matIds)
      : { data: [] };
    const materialsMap = new Map((materials || []).map(m => [m.id, m]));

    for (const ing of (recipeData.ingredients || [])) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
      const amount = calculateIngredientCost(material, parseFloat(ing.qty_in_use), ing.unit);
      subtotal += amount;

      ingredientRows.push({
        material_id: ing.material_id,
        qty_in_use: parseFloat(ing.qty_in_use),
        unit: ing.unit,
        unit_price: unitPrice,
        amount: parseFloat(amount.toFixed(2))
      });
    }

    const fixCost = subtotal * 0.05;
    const basicCost = subtotal + fixCost;
    const sellingPrice = parseFloat(recipeData.selling_price || 0);
    const foodCostPct = sellingPrice > 0 ? (basicCost / sellingPrice) : 0.00;

    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .insert({
        tenant_id: tenantId,
        menu_name: recipeData.menu_name,
        category: recipeData.category || 'NON-KOPI',
        selling_price: sellingPrice,
        subtotal: parseFloat(subtotal.toFixed(2)),
        fix_cost: parseFloat(fixCost.toFixed(2)),
        basic_cost: parseFloat(basicCost.toFixed(2)),
        food_cost_pct: parseFloat(foodCostPct.toFixed(4))
      })
      .select('*')
      .single();

    if (recipeErr) throw new Error("Gagal membuat resep: " + recipeErr.message);

    if (ingredientRows.length > 0) {
      const rowsToInsert = ingredientRows.map(row => ({ recipe_id: recipe.id, ...row }));
      const { error: ingErr } = await supabase.from('recipe_ingredients').insert(rowsToInsert);
      if (ingErr) {
        // Rollback
        await supabase.from('recipes').delete().eq('id', recipe.id);
        throw new Error("Gagal menyimpan bahan resep: " + ingErr.message);
      }
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    const formattedPrice = new Intl.NumberFormat('id-ID').format(recipe.selling_price);
    await logAudit('CREATE_RECIPE', `Membuat resep menu baru: "${recipe.menu_name}" dengan HPP Rp${formattedHpp} dan Harga Jual Rp${formattedPrice}.`);

    return recipe;
  },

  updateRecipe: async (id, recipeData) => {
    let subtotal = 0.00;
    const ingredientRows = [];

    const matIds = (recipeData.ingredients || []).map(i => i.material_id).filter(Boolean);
    const { data: materials } = matIds.length
      ? await supabase.from('materials').select('*').in('id', matIds)
      : { data: [] };
    const materialsMap = new Map((materials || []).map(m => [m.id, m]));

    for (const ing of (recipeData.ingredients || [])) {
      const material = materialsMap.get(ing.material_id);
      if (!material) continue;

      const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
      const amount = calculateIngredientCost(material, parseFloat(ing.qty_in_use), ing.unit);
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

    const fixCost = subtotal * 0.05;
    const basicCost = subtotal + fixCost;
    const sellingPrice = parseFloat(recipeData.selling_price || 0);
    const foodCostPct = sellingPrice > 0 ? (basicCost / sellingPrice) : 0.00;

    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .update({
        menu_name: recipeData.menu_name,
        ...(recipeData.category !== undefined ? { category: recipeData.category } : {}),
        selling_price: sellingPrice,
        subtotal: parseFloat(subtotal.toFixed(2)),
        fix_cost: parseFloat(fixCost.toFixed(2)),
        basic_cost: parseFloat(basicCost.toFixed(2)),
        food_cost_pct: parseFloat(foodCostPct.toFixed(4))
      })
      .eq('id', id)
      .select('*')
      .single();

    if (recipeErr) throw new Error("Gagal update resep: " + recipeErr.message);

    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id);
    if (ingredientRows.length > 0) {
      const { error: ingErr } = await supabase.from('recipe_ingredients').insert(ingredientRows);
      if (ingErr) throw new Error("Gagal menyimpan bahan resep baru: " + ingErr.message);
    }

    const formattedHpp = new Intl.NumberFormat('id-ID').format(recipe.basic_cost);
    await logAudit('UPDATE_RECIPE', `Memperbarui resep menu: "${recipe.menu_name}" dengan HPP baru Rp${formattedHpp}.`);

    return recipe;
  },

  deleteRecipe: async (id) => {
    const { data: recipe } = await supabase.from('recipes').select('*').eq('id', id).maybeSingle();
    if (!recipe) throw new Error("Resep tidak ditemukan.");
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (error) throw new Error("Gagal menghapus resep: " + error.message);
    await logAudit('DELETE_RECIPE', `Menghapus resep menu: "${recipe.menu_name}" dari database COGS.`);
    return true;
  },

  // --- INVOICES ---
  getInvoices: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
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
  
  createInvoice: async (invoiceData) => {
    const tenantId = await getActiveTenantId();

    const dateToday = new Date();
    const dateStr = dateToday.getFullYear() + 
                    String(dateToday.getMonth() + 1).padStart(2, '0') + 
                    String(dateToday.getDate()).padStart(2, '0');

    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .like('invoice_no', `INV-${dateStr}-%`);

    const serial = String((count || 0) + 1).padStart(3, '0');
    const invoiceNo = `INV-${dateStr}-${serial}`;

    let total = 0.00;
    const lineItems = [];

    for (const item of (invoiceData.items || [])) {
      const itemTotal = parseFloat(item.qty) * parseFloat(item.unit_price);
      total += itemTotal;
      lineItems.push({
        material_id: item.material_id,
        qty: parseFloat(item.qty),
        unit_price: parseFloat(item.unit_price)
      });
    }

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

    if (lineItems.length > 0) {
      const itemsToInsert = lineItems.map(item => ({ invoice_id: invoice.id, ...item }));
      const { error: itemsErr } = await supabase.from('invoice_items').insert(itemsToInsert);
      if (itemsErr) {
        await supabase.from('invoices').delete().eq('id', invoice.id);
        throw new Error("Gagal menyimpan rincian barang PO: " + itemsErr.message);
      }
    }

    const formattedTotal = new Intl.NumberFormat('id-ID').format(invoice.total);
    await logAudit('CREATE_PO', `Membuat Purchase Order (PO) baru: ${invoice.invoice_no} untuk Supplier "${invoice.supplier}" senilai Rp${formattedTotal}. Lokasi: ${invoice.location}. Status: DRAFT.`);

    return invoice;
  },

  updateInvoiceStatus: async (id, status) => {
    const { data: oldInvoice } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
    if (!oldInvoice) throw new Error('Invoice tidak ditemukan.');
    if (oldInvoice.status === 'RECEIVED') {
      throw new Error('Tidak bisa mengubah status invoice PO yang sudah diterima (RECEIVED).');
    }

    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', id)
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

    const { data: rpcRes, error: rpcErr } = await supabase.rpc('receive_invoice_atomic', {
      p_invoice_id: id,
      p_tenant_id: tenantId,
      p_user_id: userId
    });

    if (rpcErr) throw new Error("Gagal menerima PO secara atomik: " + rpcErr.message);

    const { data: updatedInvoice, error: fetchErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();

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
  syncPos: async (filename, salesData) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];

    const fileHashRaw = filename + JSON.stringify(salesData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fileHashRaw));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fileHash = 'sha256-' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: existingLog } = await supabase
      .from('pos_upload_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existingLog) {
      throw new Error(`File POS "${filename}" ini sudah pernah diproses pada ${new Date(existingLog.created_at).toLocaleString('id-ID')}. Upload dibatalkan untuk mencegah double deduction.`);
    }

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

    for (const sale of salesData) {
      const menuName = (sale.menuName || '').toLowerCase().trim();
      const menuCode = sale.menuCode ? sale.menuCode.toLowerCase().trim() : null;
      const saleQty = parseInt(sale.qty || 1);
      const salesDate = sale.salesDate || nowStr;
      const totalRevenue = parseFloat(sale.total || 0);

      let recipe = null;

      if (menuCode && recipesMapByCode.has(menuCode)) {
        recipe = recipesMapByCode.get(menuCode);
      }

      if (!recipe && recipesMapByName.has(menuName)) {
        recipe = recipesMapByName.get(menuName);
      }

      if (!recipe) {
        skippedRecords++;
        continue;
      }

      const ingredients = recipe.recipe_ingredients || [];
      for (const ing of ingredients) {
        const material = ing.materials;
        if (!material) continue;

        const deductQty = parseFloat(ing.qty_in_use) * saleQty;
        const currentQty = parseFloat(material.qty_resto || 0);
        const newQty = currentQty - deductQty;

        if (newQty < 0) {
          negativeWarnings.push(`${material.name}: stok tidak cukup (perlu ${deductQty}, tersisa ${currentQty})`);
        }

        transactionRows.push({
          tenant_id: tenantId,
          date: salesDate,
          material_id: material.id,
          type: 'OUT',
          location: 'RESTO',
          qty: -deductQty,
          amount: -deductQty * parseFloat(material.new_price ?? material.price ?? 0),
          notes: `POS Sync: ${recipe.menu_name} x${saleQty}`
        });

        const safeNewQty = Math.max(0, newQty);
        const { error: updateErr } = await supabase
          .from('materials')
          .update({ qty_resto: safeNewQty })
          .eq('id', material.id);

        if (updateErr) {
          deductionErrors.push(`Gagal update stok ${material.name}: ${updateErr.message}`);
        } else {
          deductionLogsCount++;
        }
      }
      processedRecords++;
    }

    if (transactionRows.length > 0) {
      const { error: txBatchErr } = await supabase.from('transactions').insert(transactionRows);
      if (txBatchErr) console.warn("Gagal batch insert ledger POS:", txBatchErr.message);
    }

    const period = nowStr.substring(0, 7);
    await supabase.from('pos_upload_logs').insert({
      tenant_id: tenantId,
      filename,
      file_hash: fileHash,
      period,
      total_rows: salesData.length
    });

    const summary = `POS sync selesai: ${processedRecords} menu diproses, ${skippedRecords} dilewati, ${deductionLogsCount} deduction diterapkan.`;
    await logAudit('POS_SYNC', summary + (negativeWarnings.length > 0 ? ` Peringatan stok: ${negativeWarnings.slice(0, 3).join('; ')}.` : ''));

    return {
      processed: processedRecords,
      skipped: skippedRecords,
      deductions: deductionLogsCount,
      negativeWarnings,
      deductionErrors,
      summary
    };
  },

  // --- STOCK OPNAME ---
  getOpnames: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from('stock_opnames')
      .select('*, stock_opname_items(*, materials(name, unit))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error("Gagal memuat data opname: " + error.message);
    return data || [];
  },

  completeOpname: async (opnameData) => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const now = new Date();

    const { data: opname, error: opErr } = await supabase
      .from('stock_opnames')
      .insert({
        tenant_id: tenantId,
        period_month: now.getMonth() + 1,
        period_year: now.getFullYear(),
        location: opnameData.location,
        status: 'SUBMITTED',
        signature_svg: opnameData.signature_svg || null,
        created_by: userId,
        submitted_at: now.toISOString()
      })
      .select('*')
      .single();

    if (opErr) throw new Error("Gagal membuat opname: " + opErr.message);

    if (opnameData.items && opnameData.items.length > 0) {
      const itemsToInsert = opnameData.items
        .filter(item => item.material_id !== null)
        .map(item => ({
          opname_id: opname.id,
          material_id: item.material_id,
          book_qty: item.book_qty ?? 0,
          physical_qty: item.physical_qty,
          notes: item.notes || ''
        }));

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase.from('stock_opname_items').insert(itemsToInsert);
        if (itemsErr) throw new Error("Gagal menyimpan item opname: " + itemsErr.message);
      }
    }

    await logAudit('COMPLETE_OPNAME', `Stock opname ${opnameData.location} bulan ${now.getMonth() + 1}/${now.getFullYear()} berhasil diselesaikan.`);
    return opname;
  },

  // --- AUDIT LOGS ---
  getAuditLogs: async (filters = {}) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];

    let query = supabase
      .from('audit_logs')
      .select('*, users(name, email)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(filters.limit || 200);

    if (filters.action) query = query.eq('action', filters.action);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);

    const { data, error } = await query;
    if (error) throw new Error("Gagal memuat audit logs: " + error.message);
    return data || [];
  },

  // --- BACKUPS ---
  getBackups: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return [];

    const { data, error } = await supabase
      .from('backups')
      .select('id, filename, size_formatted, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error("Gagal memuat daftar backup: " + error.message);
    return data || [];
  },

  createBackup: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error('Tidak ada tenant aktif untuk di-backup.');

    const [materials, recipes, transactions, invoices] = await Promise.all([
      api.getMaterials().catch(() => []),
      api.getRecipes().catch(() => []),
      api.getTransactions().catch(() => []),
      api.getInvoices().catch(() => [])
    ]);

    const backupData = { materials, recipes, transactions, invoices, created_at: new Date().toISOString() };
    const dataJson = JSON.stringify(backupData);
    const sizeBytes = new Blob([dataJson]).size;
    const sizeFormatted = sizeBytes > 1048576
      ? (sizeBytes / 1048576).toFixed(2) + ' MB'
      : (sizeBytes / 1024).toFixed(2) + ' KB';

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `barventis_backup_${dateStr}.json`;

    const { data, error } = await supabase
      .from('backups')
      .insert({
        tenant_id: tenantId,
        filename,
        size_bytes: sizeBytes,
        size_formatted: sizeFormatted,
        data_json: dataJson
      })
      .select('id, filename, size_formatted, created_at')
      .single();

    if (error) throw new Error("Gagal menyimpan backup: " + error.message);

    await logAudit('CREATE_BACKUP', `Backup database berhasil dibuat: "${filename}" (${sizeFormatted}).`);
    return { ...data, data_json: dataJson };
  },

  downloadBackup: async (backupId) => {
    const tenantId = await getActiveTenantId();

    const { data, error } = await supabase
      .from('backups')
      .select('*')
      .eq('id', backupId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) throw new Error("Backup tidak ditemukan atau akses ditolak.");
    return data;
  },

  deleteBackup: async (backupId) => {
    const tenantId = await getActiveTenantId();

    const { data: backup } = await supabase
      .from('backups')
      .select('filename')
      .eq('id', backupId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!backup) throw new Error("Backup tidak ditemukan.");

    const { error } = await supabase.from('backups').delete().eq('id', backupId);
    if (error) throw new Error("Gagal menghapus backup: " + error.message);

    await logAudit('DELETE_BACKUP', `Backup "${backup.filename}" dihapus dari sistem.`);
    return true;
  },

  // --- SUPER ADMIN ---
  getAllTenants: async () => {
    const { data, error } = await supabase
      .from('tenants')
      .select('*, pos_templates(display_name)')
      .order('created_at', { ascending: false });

    if (error) throw new Error("Gagal memuat daftar tenant: " + error.message);
    return data || [];
  },

  updateTenantStatus: async (tenantId, status) => {
    const { data, error } = await supabase
      .from('tenants')
      .update({ status })
      .eq('id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal update status tenant: " + error.message);
    await logAudit('UPDATE_TENANT_STATUS', `Mengubah status tenant "${data.name}" menjadi "${status}".`);
    return data;
  },

  updateTenantLock: async (tenantId, lockedMonth, lockedYear) => {
    const { data, error } = await supabase
      .from('tenants')
      .update({ locked_until_month: lockedMonth, locked_until_year: lockedYear })
      .eq('id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal update kunci tenant: " + error.message);
    await logAudit('UPDATE_TENANT_LOCK', `Mengunci lisensi tenant "${data.name}" hingga ${lockedMonth}/${lockedYear}.`);
    return data;
  },

  getGlobalAuditLogs: async (filters = {}) => {
    let query = supabase
      .from('audit_logs')
      .select('*, users(name, email), tenants(company_name)')
      .order('created_at', { ascending: false })
      .limit(filters.limit || 300);

    if (filters.tenant_id) query = query.eq('tenant_id', filters.tenant_id);
    if (filters.action) query = query.eq('action', filters.action);

    const { data, error } = await query;
    if (error) throw new Error("Gagal memuat global audit logs: " + error.message);
    return data || [];
  },

  getPosTemplates: async () => {
    const { data, error } = await supabase
      .from('pos_templates')
      .select('*')
      .order('display_name');

    if (error) throw new Error("Gagal memuat POS templates: " + error.message);
    return data || [];
  },

  createPosTemplate: async (templateData) => {
    const { data, error } = await supabase
      .from('pos_templates')
      .insert({
        name: templateData.name,
        display_name: templateData.display_name,
        column_mapping: templateData.column_mapping
      })
      .select('*')
      .single();

    if (error) throw new Error("Gagal membuat template POS: " + error.message);
    await logAudit('CREATE_POS_TEMPLATE', `Membuat template POS baru: "${data.display_name}".`);
    return data;
  },

  updatePosTemplate: async (templateId, templateData) => {
    const { data, error } = await supabase
      .from('pos_templates')
      .update({
        display_name: templateData.display_name,
        column_mapping: templateData.column_mapping
      })
      .eq('id', templateId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal memperbarui template POS: " + error.message);
    await logAudit('UPDATE_POS_TEMPLATE', `Memperbarui template POS: "${data.display_name}".`);
    return data;
  },

  deletePosTemplate: async (templateId) => {
    const { data: template } = await supabase.from('pos_templates').select('display_name').eq('id', templateId).maybeSingle();
    const { error } = await supabase.from('pos_templates').delete().eq('id', templateId);
    if (error) throw new Error("Gagal menghapus template POS: " + error.message);
    if (template) await logAudit('DELETE_POS_TEMPLATE', `Menghapus template POS: "${template.display_name}".`);
    return true;
  },

  getSeedDataFiles: async () => {
    const { data, error } = await supabase
      .from('seed_data_files')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw new Error("Gagal memuat seed data files: " + error.message);
    return data || [];
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
    
    const displayName = data.pos_templates ? data.pos_templates.display_name : 'Default';
    await logAudit('UPDATE_TENANT_TEMPLATE', `Mengubah template pembacaan POS aktif outlet menjadi: "${displayName}".`);
    return data;
  },

  getActiveTenantTemplate: async () => {
    const tenantId = await getActiveTenantId();
    const defaultMapping = {
      header_row_index: 12,
      branch_col: "branch",
      sales_date_col: "sales date",
      menu_name_col: "menu name",
      menu_code_col: "menu code",
      qty_col: "qty",
      total_col: "total"
    };

    if (!tenantId) return defaultMapping;

    const { data, error } = await supabase
      .from('tenants')
      .select('*, pos_templates(*)')
      .eq('id', tenantId)
      .maybeSingle();

    if (error || !data || !data.pos_templates) return defaultMapping;

    return data.pos_templates.column_mapping;
  },

  getActiveTenantTemplateDetails: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) return null;

    const { data, error } = await supabase
      .from('tenants')
      .select('pos_template_id, pos_templates(*)')
      .eq('id', tenantId)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  },

  // --- BULK IMPORT ---
  bulkImportMaterials: async (rows) => {
    const tenantId = await getActiveTenantId();
    let success = 0;
    let failed = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const { error } = await supabase.from('materials').insert({
          tenant_id: tenantId,
          name: row.name,
          category: row.category || 'Others',
          supplier: row.supplier || '',
          unit: row.unit || 'pck',
          full_pack: row.full_pack || '',
          price: parseFloat(row.price || 0),
          new_price: parseFloat(row.price || 0),
          qty_resto: 0,
          qty_central: 0,
          min_stock: parseFloat(row.min_stock || 15),
          is_active: true
        });
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
    let success = 0;
    let failed = 0;
    const errors = [];

    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name, unit, price, new_price, full_pack')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const materialsMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase().trim(), m]));

    for (const row of rows) {
      try {
        let ingredients = [];
        try { ingredients = JSON.parse(row.ingredients_json || '[]'); } catch { /* ignore */ }

        const sellingPrice = parseFloat(row.selling_price || 0);
        let subtotal = 0;

        if (ingredients.length > 0) {
          subtotal = ingredients.reduce((sum, ing) => {
            const mat = materialsMap.get((ing.item_name || ing.material_name || '').toLowerCase().trim());
            if (!mat) return sum + (parseFloat(ing.qty_in_use || 0) * parseFloat(ing.unit_price || 0));
            return sum + calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), ing.unit || mat.unit);
          }, 0);
        }
        const fixCost = subtotal * 0.05;
        const basicCost = subtotal + fixCost;
        const foodCostPct = sellingPrice > 0 ? basicCost / sellingPrice : 0;

        const { data: recipeData, error: recipeErr } = await supabase
          .from('recipes')
          .upsert({
            tenant_id: tenantId,
            menu_name: row.menu_name,
            selling_price: sellingPrice,
            subtotal: parseFloat(subtotal.toFixed(2)),
            fix_cost: parseFloat(fixCost.toFixed(2)),
            basic_cost: parseFloat(basicCost.toFixed(2)),
            food_cost_pct: parseFloat(foodCostPct.toFixed(4))
          }, { onConflict: 'menu_name,tenant_id' })
          .select('id')
          .single();

        if (recipeErr) throw new Error(recipeErr.message);

        if (ingredients.length > 0 && recipeData?.id) {
          const ingredientsToInsert = [];
          for (const ing of ingredients) {
            const mat = materialsMap.get((ing.item_name || ing.material_name || '').toLowerCase().trim());
            if (mat) {
              const unit = ing.unit || mat.unit;
              const unitPrice = parseFloat(mat.new_price ?? mat.price ?? 0);
              const amount = calculateIngredientCost(mat, parseFloat(ing.qty_in_use || 0), unit);
              
              ingredientsToInsert.push({
                recipe_id: recipeData.id,
                material_id: mat.id,
                qty_in_use: parseFloat(ing.qty_in_use || 0),
                unit,
                unit_price: unitPrice,
                amount: parseFloat(amount.toFixed(2))
              });
            }
          }

          if (ingredientsToInsert.length > 0) {
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
    return { success, failed, errors };
  },

  bulkImportOpnameItems: async (opnameId, rows) => {
    let success = 0;
    let failed = 0;

    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name')
      .eq('tenant_id', await getActiveTenantId());

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

  // --- COST CONTROL REPORT ---
  // BUG-MISSING-01: This function existed in the original api.js but was omitted
  // in the previous rewrite, causing CostControl.jsx to crash on mount.
  getCostControlReport: async (month) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error('Tenant tidak aktif.');

    const parts = month.split('-');
    const year = parseInt(parts[0]);
    const m = parseInt(parts[1]);
    const startDate = `${month}-01`;
    const lastDay = new Date(year, m, 0).getDate();
    const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

    // 1. Closing stock: prefer this-month opname physical count; fallback to live stock
    const { data: thisOpnames } = await supabase
      .from('stock_opnames')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('period_month', m)
      .eq('period_year', year);

    let closingValuation = 0;
    let categoryValuation = [];
    let hasThisMonthOpname = false;

    if (thisOpnames && thisOpnames.length > 0) {
      const opnameIds = thisOpnames.map(o => o.id);
      const { data: opnameItems } = await supabase
        .from('stock_opname_items')
        .select('physical_qty, material_id, materials(new_price, price, category)')
        .in('opname_id', opnameIds);

      if (opnameItems && opnameItems.length > 0) {
        hasThisMonthOpname = true;
        const matMap = {};
        opnameItems.forEach(item => {
          const id = item.material_id;
          const qty = parseFloat(item.physical_qty || 0);
          const price = parseFloat(item.materials?.new_price ?? item.materials?.price ?? 0);
          const cat = item.materials?.category || 'Lain-lain';
          if (!matMap[id]) matMap[id] = { qty: 0, val: 0, price, cat };
          matMap[id].qty += qty;
          matMap[id].val += qty * price;
        });
        const catGroup = {};
        for (const v of Object.values(matMap)) {
          closingValuation += v.val;
          catGroup[v.cat] = (catGroup[v.cat] || 0) + v.val;
        }
        categoryValuation = Object.entries(catGroup).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
      }
    }

    if (!hasThisMonthOpname) {
      const { data: materials } = await supabase
        .from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true);
      const catGroup = {};
      for (const mat of (materials || [])) {
        const price = parseFloat(mat.new_price ?? mat.price ?? 0);
        const val = (parseFloat(mat.qty_resto || 0) + parseFloat(mat.qty_central || 0)) * price;
        closingValuation += val;
        const cat = mat.category || 'Lain-lain';
        catGroup[cat] = (catGroup[cat] || 0) + val;
      }
      categoryValuation = Object.entries(catGroup).map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
    }

    // 2. Transactions for the period
    const { data: txs } = await supabase
      .from('transactions').select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate).lte('date', endDate);

    let purchasesValuation = 0;
    let cogsIngredientsCost = 0;
    let salesRevenue = 0;
    for (const tx of (txs || [])) {
      const amt = parseFloat(tx.amount || 0);
      if (tx.type === 'PURCHASE_IN') purchasesValuation += amt;
      else if (tx.type === 'POS_DEDUCTION') cogsIngredientsCost += Math.abs(amt);
      else if (tx.type === 'POS_SALE') salesRevenue += amt;
      // Also handle the type 'OUT' from POS sync (written with type='OUT')
      else if (tx.type === 'OUT' && (tx.notes || '').startsWith('POS Sync:')) cogsIngredientsCost += Math.abs(amt);
    }

    // 3. Opening stock: last month's opname or formula derivation
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? year - 1 : year;
    const { data: prevOpnames } = await supabase
      .from('stock_opnames').select('id')
      .eq('tenant_id', tenantId)
      .eq('period_month', prevMonth).eq('period_year', prevYear);

    let openingValuation = 0;
    if (prevOpnames && prevOpnames.length > 0) {
      const prevIds = prevOpnames.map(o => o.id);
      const { data: prevItems } = await supabase
        .from('stock_opname_items')
        .select('physical_qty, materials(new_price, price)')
        .in('opname_id', prevIds);
      if (prevItems && prevItems.length > 0) {
        openingValuation = prevItems.reduce((s, item) => {
          const price = parseFloat(item.materials?.new_price ?? item.materials?.price ?? 0);
          return s + parseFloat(item.physical_qty || 0) * price;
        }, 0);
      }
    }
    // Fallback: accounting identity if no prior opname
    if (openingValuation <= 0) {
      openingValuation = Math.max(0, cogsIngredientsCost + closingValuation - purchasesValuation);
    }

    const overheadAdjustment = cogsIngredientsCost * 0.05;
    const totalCogs = cogsIngredientsCost + overheadAdjustment;
    const beverageCostPct = salesRevenue > 0 ? (totalCogs / salesRevenue) * 100 : 0;

    try { await logAudit('VIEW_COST_CONTROL', `Membuka laporan Cost Control periode: ${month}.`); } catch { /* best-effort */ }

    return {
      month,
      period: { start_date: startDate, end_date: endDate },
      metrics: {
        opening_stock: parseFloat(openingValuation.toFixed(2)),
        purchases: parseFloat(purchasesValuation.toFixed(2)),
        closing_stock: parseFloat(closingValuation.toFixed(2)),
        ingredients_cost: parseFloat(cogsIngredientsCost.toFixed(2)),
        overhead_cost: parseFloat(overheadAdjustment.toFixed(2)),
        total_cogs: parseFloat(totalCogs.toFixed(2)),
        sales_revenue: parseFloat(salesRevenue.toFixed(2)),
        beverage_cost_pct: parseFloat(beverageCostPct.toFixed(2)),
        target_cost_pct: 27.00,
        status: beverageCostPct <= 27 ? 'SAFE' : beverageCostPct <= 30 ? 'WARNING' : 'DANGER'
      },
      category_valuation: categoryValuation
    };
  }
};