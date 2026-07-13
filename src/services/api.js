// UMATIS Serverless API Service Client for Supabase Backend Integration
import { supabase } from '../lib/supabase';
import { parsePackSize, calculateIngredientCost } from './costUtils';

let activeTenantId = null;
let activeUserId = null;
let activeOverheadPct = 0.05;
let activeWhatsappNumber = null;
let activeWhatsappToken = null;
let activeWhatsappEnabled = false;

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

// Re-export from costUtils for backward compatibility
export { parsePackSize, calculateIngredientCost };

export const api = {
  // Set memory cache to avoid async locks in browser
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

  // --- AUTHENTICATION ---
  login: async (email, password) => {
    // 1. Perform Supabase authentication first (so RLS policies will be satisfied for profile and tenant queries)
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authErr || !authData.user) {
      throw new Error(authErr.message || 'Email atau password salah.');
    }

    // 2. Fetch user profile
    const { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileErr || !userProfile) {
      await supabase.auth.signOut();
      throw new Error('Profil user tidak ditemukan: ' + (profileErr?.message || 'Data kosong'));
    }

    let tenant;
    // H-4: Super Admin status is determined by the DB role on the authenticated
    // profile — NOT by a hardcoded email. The real boundary is the user's role
    // (also enforced by RLS is_super_admin()), so no magic email is needed.
    const roleLower = (userProfile.role || '').toLowerCase().replace(/\s+/g, '');
    const isSALogin = roleLower === 'superadmin';

    if (isSALogin) {
      // Bypass database tenant query for Super Admin (since tenant_id is null in public.users)
      tenant = { name: 'superadmin', company_name: 'Barventis System Management', id: null, status: 'active' };
    } else {
      // 3. Fetch tenant details (now that we're authenticated, RLS allows selecting our own tenant)
      const { data: tenantData, error: tenantErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', userProfile.tenant_id)
        .single();

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
      throw new Error('Gagal mendaftarkan tenant baru: ' + createTenantErr.message);
    }

    // 3. Register user with Supabase auth (providing metadata for profile synchronization)
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
      throw new Error('Gagal mendaftarkan admin: ' + signupErr.message);
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

    // 5. Session managed by Supabase Auth — no localStorage writes
    try { await logAudit('REGISTER', `Pendaftaran akun resto baru ${companyName} berhasil oleh ${adminName}.`); } catch { /* ignore: best-effort */ }

    return {
      token: authData.session?.access_token,
      tenant: { name: newTenant.name, company_name: newTenant.company_name },
      user: { id: authData.user.id, name: adminName, email: email, role: 'Admin / Owner', tenant_id: newTenant.id, tenant_name: newTenant.name }
    };
  },

  registerWithToken: async (name, email, password, token) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            invite_token: token,
          }
        }
      });
      if (error) throw new Error(error.message);
      return data.user;
    } catch (e) {
      throw e;
    }
  },

  logout: async () => {
    try { await logAudit('LOGOUT', 'User melakukan logout dari sistem.'); } catch { /* ignore: best-effort */ }
    // Clear any legacy localStorage keys (backward compat cleanup)
    localStorage.removeItem('umatis_token');
    localStorage.removeItem('umatis_tenant_name');
    localStorage.removeItem('umatis_user');
    await supabase.auth.signOut();
    // onAuthStateChange in App.jsx will handle state reset
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
    let tenant = null;
    const roleLower = (userProfile.role || '').toLowerCase().replace(/\s+/g, '');
    const isValidUUID = (id) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

    if (roleLower === 'superadmin') {
      tenantName = 'superadmin';
      companyName = 'Barventis System Management';
    } else if (userProfile.tenant_id && isValidUUID(userProfile.tenant_id)) {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name, company_name, overhead_pct, whatsapp_number, whatsapp_token, whatsapp_enabled')
        .eq('id', userProfile.tenant_id)
        .maybeSingle();
      tenant = tenantData;
      if (tenant) {
        tenantName = tenant.name;
        companyName = tenant.company_name;
      }
    }

    return {
      ...userProfile,
      tenant_name: tenantName,
      company_name: companyName,
      overhead_pct: tenant ? parseFloat(tenant.overhead_pct ?? 0.05) : 0.05,
      whatsapp_number: tenant ? tenant.whatsapp_number : null,
      whatsapp_token: tenant ? tenant.whatsapp_token : null,
      whatsapp_enabled: tenant ? tenant.whatsapp_enabled : false
    };
  },

  // 1.5 Tenant Invitations
  generateTenantInvite: async (tenantId, role = 'Admin / Owner') => {
    // Generate expires_at 24 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data, error } = await supabase
      .from('invitations')
      .insert({
        tenant_id: tenantId,
        expires_at: expiresAt.toISOString(),
        invite_role: role
      })
      .select('token')
      .single();

    if (error) throw new Error("Gagal membuat link undangan: " + error.message);
    
    // Return full URL
    const baseUrl = window.location.origin;
    return `${baseUrl}/register?token=${data.token}`;
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
    const { data: oldMaterial } = await supabase.from('materials').select('*').eq('id', id).single();
    
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

    if (oldMaterial.price !== data.price || oldMaterial.new_price !== data.new_price) {
      const formattedOld = new Intl.NumberFormat('id-ID').format(oldMaterial.new_price || oldMaterial.price);
      const formattedNew = new Intl.NumberFormat('id-ID').format(data.new_price);
      await logAudit('UPDATE_PRICE', `Mengubah harga bahan "${data.name}" dari Rp${formattedOld} menjadi Rp${formattedNew}.`);
    } else {
      await logAudit('UPDATE_MATERIAL', `Memperbarui detail bahan mentah: "${data.name}".`);
    }

    return data;
  },

  deleteMaterial: async (id) => {
    // Check if ingredient is used in recipes
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
    const { data: material, error: matErr } = await supabase.from('materials').select('*').eq('id', id).single();
    if (matErr || !material) throw new Error("Bahan baku tidak ditemukan.");

    const { location, type, qty, notes } = adjustData;
    const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
    const parsedQty = parseFloat(qty);

    let finalQty;
    let newQtyResto = parseFloat(material.qty_resto);
    let newQtyCentral = parseFloat(material.qty_central);

    const outTypes = ['OUT', 'SPOILAGE', 'BROKEN', 'STOLEN', 'STAFF_MEAL'];

    if (type === 'IN') {
      finalQty = parsedQty;
      if (location === 'RESTO') {
        newQtyResto += parsedQty;
      } else {
        newQtyCentral += parsedQty;
      }
    } else if (outTypes.includes(type)) {
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

    // Perform updates in Supabase
    const { data: updatedMaterial, error: updateErr } = await supabase
      .from('materials')
      .update({ qty_resto: newQtyResto, qty_central: newQtyCentral })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) throw new Error("Gagal update stok: " + updateErr.message);

    // Save transaction
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
    
    // 1. Process calculations using ported controller logic
    let subtotal = 0.00;
    const ingredientRows = [];

    // Pre-fetch all materials for this recipe
    const matIds = recipeData.ingredients.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    for (const ing of recipeData.ingredients) {
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

    const fixCost = subtotal * activeOverheadPct; // Standard F&B Fixed Cost
    const basicCost = subtotal + fixCost;
    const sellingPrice = parseFloat(recipeData.selling_price || 0);
    const foodCostPct = sellingPrice > 0 ? (basicCost / sellingPrice) : 0.00;

    // 2. Insert Recipe
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
    // 1. Process calculations
    let subtotal = 0.00;
    const ingredientRows = [];

    const matIds = recipeData.ingredients.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    for (const ing of recipeData.ingredients) {
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

    const fixCost = subtotal * activeOverheadPct;
    const basicCost = subtotal + fixCost;
    const sellingPrice = parseFloat(recipeData.selling_price || 0);
    const foodCostPct = sellingPrice > 0 ? (basicCost / sellingPrice) : 0.00;

    // 2. Update Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .update({
        menu_name: recipeData.menu_name,
        // Only touch category when explicitly provided, so recalc (which omits it)
        // never clobbers an existing category. (M-2)
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
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    
    if (error) throw new Error("Gagal menghapus resep: " + error.message);
    await logAudit('DELETE_RECIPE', `Menghapus resep menu: "${recipe.menu_name}" dari database COGS.`);
    return true;
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
    const { data: oldInvoice } = await supabase.from('invoices').select('*').eq('id', id).single();
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
    
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('type', 'POS_DEDUCTION')
      .gte('date', startDate)
      .lte('date', endDate);
      
    if (error) throw error;
    if (count > 0) {
      return { isDuplicate: true, message: `AI mendeteksi kemungkinan duplikat: Terdapat ${count} transaksi POS (Stock Deduction) pada periode ${month}/${year}. Apakah Anda yakin ingin mengunggah file ini (Data akan di-Append / Ditambahkan)?` };
    }
    return { isDuplicate: false };
  },

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

    // 1. Loop through each POS sale row (Pre-Aggregation Phase)
    for (const sale of salesData) {
      const menuName = sale.menuName.toLowerCase().trim();
      const menuCode = sale.menuCode ? sale.menuCode.toLowerCase().trim() : null;
      const saleQty = parseInt(sale.qty || 1);
      const salesDate = sale.salesDate || nowStr;
      const totalRevenue = parseFloat(sale.total || 0);

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
            deductionMap[material.id] = { material, totalDeduct: 0, saleDates: new Set() };
          }
          deductionMap[material.id].totalDeduct += deductQty;
          deductionMap[material.id].saleDates.add(salesDate);
        }
      }
    }

    // 2. Perform Atomic Deductions per UNIQUE material (Parallel Batching API Optimization)
    const deductionEntries = Object.entries(deductionMap);
    const BATCH_SIZE = 20; // Concurrent requests limit

    for (let i = 0; i < deductionEntries.length; i += BATCH_SIZE) {
      const batch = deductionEntries.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async ([matId, data]) => {
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

        const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
        const datesArray = Array.from(data.saleDates).sort();
        const primaryDate = datesArray[datesArray.length - 1] || nowStr;

        transactionRows.push({
          tenant_id: tenantId,
          date: primaryDate,
          material_id: material.id,
          type: 'POS_DEDUCTION',
          location: 'RESTO',
          qty: -deductQty,
          amount: -deductQty * unitPrice,
          notes: `POS Sync Bulk Deduction (Total item terjual via file ${filename})`,
          created_by: userId
        });

        deductionLogsCount++;
      }));
    }

    // 2b. Push aggregated Sales Revenue to transactions
    for (const [key, data] of Object.entries(salesMap)) {
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
  processPosCheckout: async (cartItems, paymentMethod = 'CASH') => {
    const tenantId = await getActiveTenantId();
    const userId = await getActiveUserId();
    const nowStr = new Date().toISOString().split('T')[0];
    const orderNo = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    // 1. Fetch recipes & ingredients for deduction calculation
    const recipeIds = cartItems.map(item => item.id);
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, menu_name, selling_price, recipe_ingredients(material_id, qty_in_use, unit, materials(id, name, unit, qty_resto, price, new_price))')
      .in('id', recipeIds);

    const recipeMap = new Map((recipes || []).map(r => [r.id, r]));

    // 1b. Securely recalculate totalAmount based on DB prices
    let totalAmount = 0;
    const orderItems = [];

    for (const item of cartItems) {
      const dbRecipe = recipeMap.get(item.id);
      if (dbRecipe) {
        const dbPrice = parseFloat(dbRecipe.selling_price || 0);
        totalAmount += (dbPrice * item.qty);
        orderItems.push({
          // We will assign order_id later
          recipe_id: item.id,
          qty: item.qty,
          unit_price: dbPrice,
          subtotal: dbPrice * item.qty
        });
      }
    }

    // 2. Insert to pos_orders
    const { data: order, error: orderErr } = await supabase
      .from('pos_orders')
      .insert({
        tenant_id: tenantId,
        order_no: orderNo,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        created_by: userId
      })
      .select('id')
      .maybeSingle();

    if (orderErr) {
      console.warn("Table pos_orders may not exist or error:", orderErr);
    }

    if (order && orderItems.length > 0) {
      const mappedOrderItems = orderItems.map(oi => ({ ...oi, order_id: order.id }));
      await supabase.from('pos_order_items').insert(mappedOrderItems);
    }

    // 3. Aggregate deductions & revenue
    const deductionMap = {};
    let totalSalesQty = 0;
    
    for (const cartItem of cartItems) {
      totalSalesQty += cartItem.qty;
      const recipe = recipeMap.get(cartItem.id);
      if (!recipe || !recipe.recipe_ingredients) continue;

      for (const ing of recipe.recipe_ingredients) {
        const material = ing.materials;
        if (!material) continue;

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

        const deductQty = (parseFloat(ing.qty_in_use) * cartItem.qty) / factor;
        
        if (!deductionMap[material.id]) {
          deductionMap[material.id] = { material, totalDeduct: 0 };
        }
        deductionMap[material.id].totalDeduct += deductQty;
      }
    }

    // 4. Perform Atomic Deductions & insert Transactions
    const transactionRows = [];
    const negativeWarnings = [];

    // Revenue transaction
    transactionRows.push({
      tenant_id: tenantId,
      date: nowStr,
      material_id: null,
      type: 'POS_SALE',
      location: 'RESTO',
      qty: totalSalesQty,
      amount: totalAmount,
      notes: `POS Kasir (Native) - Order: ${orderNo} (${paymentMethod})`,
      created_by: userId
    });

    for (const [matId, data] of Object.entries(deductionMap)) {
      const material = data.material;
      const deductQty = data.totalDeduct;
      const currentResto = parseFloat(material.qty_resto);
      
      if (currentResto - deductQty < 0) {
        negativeWarnings.push(`Stok ${material.name} tersisa ${currentResto.toFixed(2)}, tapi order butuh ${deductQty.toFixed(2)}`);
      }

      const { error: deductErr } = await supabase.rpc('deduct_stock_atomic', {
        p_material_id: material.id,
        p_deduct_qty: deductQty
      });

      if (!deductErr) {
        const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
        transactionRows.push({
          tenant_id: tenantId,
          date: nowStr,
          material_id: material.id,
          type: 'POS_DEDUCTION',
          location: 'RESTO',
          qty: -deductQty,
          amount: -deductQty * unitPrice,
          notes: `POS Kasir (Native) Deduction - Order: ${orderNo}`,
          created_by: userId
        });
      }
    }

    // Insert transactions
    if (transactionRows.length > 0) {
      await supabase.from('transactions').insert(transactionRows);
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
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

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

    if (thisOpnames && thisOpnames.length > 0) {
      const opnameIds = thisOpnames.map(o => o.id);
      const { data: opnameItems } = await supabase
        .from('stock_opname_items')
        .select('physical_qty, material_id, materials(new_price, price, category)')
        .in('opname_id', opnameIds);

      if (opnameItems && opnameItems.length > 0) {
        hasThisMonthOpname = true;
        const matValuationMap = {};
        
        opnameItems.forEach(item => {
          const matId = item.material_id;
          const qty = parseFloat(item.physical_qty || 0);
          const price = parseFloat(item.materials?.new_price ?? item.materials?.price ?? 0);
          const val = qty * price;
          const cat = item.materials?.category || 'Lain-lain';

          if (!matValuationMap[matId]) {
            matValuationMap[matId] = { qty: 0, val: 0, price, cat };
          }
          matValuationMap[matId].qty += qty;
          matValuationMap[matId].val += val;
        });

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
        const price = parseFloat(mat.new_price ?? mat.price ?? 0);
        const val = (parseFloat(mat.qty_resto) + parseFloat(mat.qty_central)) * price;
        closingValuation += val;

        const cat = mat.category || 'Lain-lain';
        categoryGroup[cat] = (categoryGroup[cat] || 0) + val;
      }
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

    const wasteTypes = ['SPOILAGE', 'BROKEN', 'STOLEN', 'STAFF_MEAL'];

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
        .select('physical_qty, material_id, materials(new_price, price)')
        .in('opname_id', prevOpnameIds);
      
      if (prevOpnameItems && prevOpnameItems.length > 0) {
        openingValuation = prevOpnameItems.reduce((sum, item) => {
          const price = parseFloat(item.materials?.new_price ?? item.materials?.price ?? 0);
          return sum + (parseFloat(item.physical_qty || 0) * price);
        }, 0);
      }
    }
    // Fallback to derivation if no previous opname exists
    if (openingValuation <= 0) {
      openingValuation = Math.max(0.00, cogsIngredientsCost + closingValuation - purchasesValuation);
    }

    // Standard Overhead adjustments
    const overheadAdjustment = cogsIngredientsCost * activeOverheadPct;
    const totalCogs = cogsIngredientsCost + overheadAdjustment;
    const beverageCostPct = salesRevenue > 0 ? (totalCogs / salesRevenue) * 100 : 0.00;

    return {
      month,
      period: { start_date: startDate, end_date: endDate },
      metrics: {
        opening_stock: parseFloat(openingValuation.toFixed(2)),
        purchases: parseFloat(purchasesValuation.toFixed(2)),
        closing_stock: parseFloat(closingValuation.toFixed(2)),
        ingredients_cost: parseFloat(cogsIngredientsCost.toFixed(2)),
        overhead_cost: parseFloat(overheadAdjustment.toFixed(2)),
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

  deleteBackup: async (filename) => {
    const { error } = await supabase.from('backups').delete().eq('filename', filename);
    if (error) throw new Error("Gagal menghapus cadangan: " + error.message);
    await logAudit('DELETE_BACKUP', `Menghapus arsip cadangan: "${filename}".`);
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
    // 1. Fetch file record from Supabase backups table
    const { data, error } = await supabase
      .from('backups')
      .select('data_json')
      .eq('filename', filename)
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

    // Pre-fetch all materials for the tenant to resolve material_id by name
    const { data: allMaterials } = await supabase
      .from('materials')
      .select('id, name, unit, price, new_price')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    const materialsMap = new Map((allMaterials || []).map(m => [m.name.toLowerCase().trim(), m]));

    // rows format: { menu_name, selling_price, ingredients_json (stringified JSON array) }
    for (const row of rows) {
      try {
        let ingredients = [];
        try { ingredients = JSON.parse(row.ingredients_json || '[]'); } catch { /* ignore: best-effort */ }

        const sellingPrice = parseFloat(row.selling_price || 0);
        let subtotal = 0;

        // Simple subtotal calculation from ingredients if available
        if (ingredients.length > 0) {
          subtotal = ingredients.reduce((sum, ing) => {
            const mat = materialsMap.get((ing.item_name || ing.material_name || '').toLowerCase().trim());
            const price = mat ? parseFloat(mat.new_price ?? mat.price ?? 0) : parseFloat(ing.unit_price || 0);
            return sum + (parseFloat(ing.qty_in_use || 0) * price);
          }, 0);
        }
        const fixCost = subtotal * activeOverheadPct;
        const basicCost = subtotal + fixCost;
        const foodCostPct = sellingPrice > 0 ? basicCost / sellingPrice : 0;

        // Upsert recipe and retrieve the generated id
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

        // Link ingredients if recipe was successfully upserted
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
    return { success, failed, errors };
  },

  bulkImportOpnameItems: async (opnameId, rows) => {
    let success = 0;
    let failed = 0;

    // rows: { material_name, physical_qty, notes }
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

  getTenantSettings: async () => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant ID tidak ditemukan.");

    const { data, error } = await supabase
      .from('tenants')
      .select('name, company_name, overhead_pct, locked_until_month, locked_until_year, whatsapp_number, whatsapp_token, whatsapp_enabled')
      .eq('id', tenantId)
      .single();

    if (error) throw new Error("Gagal memuat pengaturan resto: " + error.message);
    return data;
  },

  updateTenantSettings: async (settings) => {
    const tenantId = await getActiveTenantId();
    if (!tenantId) throw new Error("Tenant ID tidak ditemukan.");

    const { data, error } = await supabase
      .from('tenants')
      .update({
        company_name: settings.company_name || undefined,
        overhead_pct: settings.overhead_pct !== undefined ? parseFloat(settings.overhead_pct) : undefined,
        locked_until_month: settings.locked_until_month !== undefined ? (settings.locked_until_month ? parseInt(settings.locked_until_month) : null) : undefined,
        locked_until_year: settings.locked_until_year !== undefined ? (settings.locked_until_year ? parseInt(settings.locked_until_year) : null) : undefined,
        whatsapp_number: settings.whatsapp_number !== undefined ? settings.whatsapp_number : undefined,
        whatsapp_token: settings.whatsapp_token !== undefined ? settings.whatsapp_token : undefined,
        whatsapp_enabled: settings.whatsapp_enabled !== undefined ? !!settings.whatsapp_enabled : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', tenantId)
      .select('*')
      .single();

    if (error) throw new Error("Gagal memperbarui pengaturan resto: " + error.message);

    // Update active cache in memory as well!
    if (data.overhead_pct !== null && data.overhead_pct !== undefined) {
      activeOverheadPct = parseFloat(data.overhead_pct);
    }
    activeWhatsappNumber = data.whatsapp_number || null;
    activeWhatsappToken = data.whatsapp_token || null;
    activeWhatsappEnabled = !!data.whatsapp_enabled;

    await logAudit('UPDATE_TENANT_SETTINGS', `Memperbarui pengaturan outlet. Overhead: ${(data.overhead_pct * 100).toFixed(1)}%, Locked: ${data.locked_until_month || '-'}/${data.locked_until_year || '-'}.`);
    return data;
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
  }
};

