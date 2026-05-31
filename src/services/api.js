// UMATIS Serverless API Service Client for Supabase Backend Integration
import { supabase } from '../lib/supabase';

// Helper to get active tenant info — uses Supabase session (KRITIS-01 fix, no localStorage)
const getActiveTenantId = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  // Try users table first (fast lookup)
  const { data: user } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle();

  return user?.tenant_id ?? null;
};

// Helper for Audit Logging — session-based, no localStorage
const logAudit = async (action, description) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { data: user } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (!user?.tenant_id) return;

    await supabase.from('audit_logs').insert({
      tenant_id: user.tenant_id,
      user_id: session.user.id,
      action,
      description
    });
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
};

// --- F&B BULK METRIC CONVERSION UTILITIES (from Laravel RecipeController) ---
function parsePackSize(fullPack) {
  if (!fullPack) return 0;
  fullPack = fullPack.toLowerCase().trim();
  
  // Match: "1000 gr", "1000 grm", "1000 gram", "250.5 gr"
  let grMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:gr|grm|gram)\b/i);
  if (grMatch) return parseFloat(grMatch[1]);

  // Match: "1000 ml", "500 ml", "750 ml"
  let mlMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]);

  // Match: "1 L", "1.5 liter", "19 L" -> convert to ml
  let lMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|liter|litre)\b/i);
  if (lMatch) return parseFloat(lMatch[1]) * 1000.0;

  // Match: "24 pcs", "6 pcs", "12 pcs"
  let pcsMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*pcs\b/i);
  if (pcsMatch) return parseFloat(pcsMatch[1]);

  // Match: "1 kg", "2.5 kg" -> convert to gram
  let kgMatch = fullPack.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
  if (kgMatch) return parseFloat(kgMatch[1]) * 1000.0;

  return 0;
}

function calculateIngredientCost(material, qtyInUse, recipeUnit) {
  const price = parseFloat(material.new_price ?? material.price ?? 0);
  const packUnit = (material.unit || '').toLowerCase().trim();
  recipeUnit = (recipeUnit || '').toLowerCase().trim();

  if (recipeUnit === packUnit) {
    return qtyInUse * price;
  }

  const packSize = parsePackSize(material.full_pack);
  return packSize > 0 ? qtyInUse * (price / packSize) : qtyInUse * price;
}

// Main API object mapping 1-to-1 with Laravel API endpoints
export const api = {
  // --- AUTHENTICATION ---
  login: async (tenantName, email, password) => {
    // 1. Verify tenant name
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .select('*')
      .eq('name', tenantName.toLowerCase())
      .single();

    if (tenantErr || !tenant) {
      throw new Error('Tenant / ID Resto tidak terdaftar.');
    }

    if (tenant.status !== 'active') {
      throw new Error('Tenant Resto sedang dinonaktifkan.');
    }

    // 2. Perform Supabase authentication
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authErr || !authData.user) {
      throw new Error('Email atau password salah.');
    }

    // 3. Fetch user profile and verify tenant matching
    const { data: userProfile, error: profileErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileErr || !userProfile) {
      throw new Error('Profil user tidak ditemukan di database.');
    }

    if (userProfile.tenant_id !== tenant.id) {
      await supabase.auth.signOut();
      throw new Error('User ini tidak terdaftar di ID Resto ' + tenantName.toUpperCase() + '.');
    }

    // 4. Session is managed by Supabase Auth (no localStorage write needed)
    // Audit log is handled after onAuthStateChange fires in App.jsx
    try { await logAudit('LOGIN', `User ${userProfile.name} berhasil login ke resto.`); } catch (_) {}

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
    try { await logAudit('REGISTER', `Pendaftaran akun resto baru ${companyName} berhasil oleh ${adminName}.`); } catch (_) {}

    return {
      token: authData.session?.access_token,
      tenant: { name: newTenant.name, company_name: newTenant.company_name },
      user: { id: authData.user.id, name: adminName, email: email, role: 'Admin / Owner', tenant_id: newTenant.id, tenant_name: newTenant.name }
    };
  },

  logout: async () => {
    try { await logAudit('LOGOUT', 'User melakukan logout dari sistem.'); } catch (_) {}
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

    const { data: userProfile, error } = await supabase
      .from('users')
      .select('id, tenant_id, name, email, role')
      .eq('id', session.user.id)
      .single();

    if (error || !userProfile) throw new Error('Profil tidak ditemukan.');

    // Also fetch tenant name
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, company_name')
      .eq('id', userProfile.tenant_id)
      .maybeSingle();

    return {
      ...userProfile,
      tenant_name: tenant?.name ?? '',
      company_name: tenant?.company_name ?? ''
    };
  },

  // --- LEDGER TRANSACTIONS ---
  getTransactions: async () => {
    const tenantId = await getActiveTenantId();
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

    let finalQty = parsedQty;
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

    const fixCost = subtotal * 0.05; // 5% Standard F&B Fixed Cost
    const basicCost = subtotal + fixCost;
    const sellingPrice = parseFloat(recipeData.selling_price || 0);
    const foodCostPct = sellingPrice > 0 ? (basicCost / sellingPrice) : 0.00;

    // 2. Insert Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .insert({
        tenant_id: tenantId,
        menu_name: recipeData.menu_name,
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

    const fixCost = subtotal * 0.05;
    const basicCost = subtotal + fixCost;
    const sellingPrice = parseFloat(recipeData.selling_price || 0);
    const foodCostPct = sellingPrice > 0 ? (basicCost / sellingPrice) : 0.00;

    // 2. Update Recipe
    const { data: recipe, error: recipeErr } = await supabase
      .from('recipes')
      .update({
        menu_name: recipeData.menu_name,
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
    const userStr = localStorage.getItem('umatis_user');
    const userId = userStr ? JSON.parse(userStr).id : null;

    // Fetch invoice with items
    const { data: invoice, error: fetchErr } = await supabase
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('id', id)
      .single();

    if (fetchErr || !invoice) throw new Error("Invoice PO tidak ditemukan.");
    if (invoice.status === 'RECEIVED') throw new Error("Invoice PO sudah pernah diterima.");
    if (invoice.status === 'CANCELLED') throw new Error("Tidak bisa memproses invoice PO yang dibatalkan.");

    const nowStr = new Date().toISOString().split('T')[0];
    const location = invoice.location || 'CENTRAL';

    // 1. Process Auto Stock-In and update prices
    const matIds = invoice.invoice_items.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    const transactionRows = [];

    for (const item of invoice.invoice_items) {
      const material = materialsMap.get(item.material_id);
      if (material) {
        let newQtyResto = parseFloat(material.qty_resto);
        let newQtyCentral = parseFloat(material.qty_central);
        const qtyToAdd = parseFloat(item.qty);

        if (location === 'RESTO') {
          newQtyResto += qtyToAdd;
        } else {
          newQtyCentral += qtyToAdd;
        }

        // Update price to new purchase rate
        const { error: matUpdateErr } = await supabase
          .from('materials')
          .update({
            qty_resto: newQtyResto,
            qty_central: newQtyCentral,
            new_price: parseFloat(item.unit_price)
          })
          .eq('id', material.id);

        if (matUpdateErr) throw new Error(`Gagal memperbarui stok bahan ${material.name}: ${matUpdateErr.message}`);

        // Prepare ledger transaction log
        transactionRows.push({
          tenant_id: tenantId,
          date: nowStr,
          material_id: material.id,
          type: 'PURCHASE_IN',
          location,
          qty: qtyToAdd,
          amount: qtyToAdd * parseFloat(item.unit_price),
          notes: `Auto stock-in from invoice: ${invoice.invoice_no}`,
          created_by: userId
        });
      }
    }

    // 2. Bulk Insert Transactions
    if (transactionRows.length > 0) {
      await supabase.from('transactions').insert(transactionRows);
    }

    // 3. Update Invoice Status
    const { data: updatedInvoice, error: updateInvoiceErr } = await supabase
      .from('invoices')
      .update({
        status: 'RECEIVED',
        received_date: nowStr
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateInvoiceErr) throw new Error("Gagal update status RECEIVED: " + updateInvoiceErr.message);

    const formattedTotal = new Intl.NumberFormat('id-ID').format(invoice.total);
    await logAudit('RECEIVE_PO', `Menerima barang untuk Purchase Order (PO): ${invoice.invoice_no} dari Supplier "${invoice.supplier}" senilai Rp${formattedTotal}. Stok gudang ${location} bertambah.`);

    return updatedInvoice;
  },

  // --- POS SYNCHRONIZATION ---
  syncPos: async (filename, salesData) => {
    const tenantId = await getActiveTenantId();
    const userStr = localStorage.getItem('umatis_user');
    const userId = userStr ? JSON.parse(userStr).id : null;
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
      throw new Error(`File POS "${filename}" ini sudah pernah diproses pada ${new Date(existingLog.created_at).toLocaleString('id-ID')}. Upload dibatalkan untuk mencegah double deduction.`);
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

    const transactionRows = [];

    // Loop through each POS sale row
    for (const sale of salesData) {
      const menuName = sale.menuName.toLowerCase().trim();
      const menuCode = sale.menuCode ? sale.menuCode.toLowerCase().trim() : null;
      const saleQty = parseInt(sale.qty || 1);
      const salesDate = sale.salesDate || nowStr;
      const totalRevenue = parseFloat(sale.total || 0);

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

      processedRecords++;

      // Register Gross Revenue
      transactionRows.push({
        tenant_id: tenantId,
        date: salesDate,
        material_id: null,
        type: 'POS_SALE',
        location: 'RESTO',
        qty: saleQty,
        amount: totalRevenue,
        notes: `POS revenue: "${sale.menuName}" (Qty: ${saleQty}) via file ${filename}`,
        created_by: userId
      });

      // Deduct stock for each ingredient
      for (const ing of recipe.recipe_ingredients) {
        const material = ing.materials;
        if (material) {
          const unitLower = ing.unit.toLowerCase();
          const isGramMl = (unitLower === 'gr' || unitLower === 'ml' || unitLower === 'grm');
          const factor = isGramMl ? 1000.00 : 1.00;

          const deductQty = (parseFloat(ing.qty_in_use) * saleQty) / factor;
          const currentResto = parseFloat(material.qty_resto);
          const newQty = currentResto - deductQty;

          if (newQty < 0) {
            negativeWarnings.push(`Stok ${material.name} tidak cukup. Butuh ${deductQty.toFixed(2)}, tersedia ${currentResto.toFixed(2)}. Selisih: ${Math.abs(newQty).toFixed(2)}`);
          }

          // Atomic deduction in Supabase
          const finalRestoQty = Math.max(0, newQty);
          await supabase
            .from('materials')
            .update({ qty_resto: finalRestoQty })
            .eq('id', material.id);

          const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);
          const isFreeItem = totalRevenue <= 0;
          const txNotes = isFreeItem 
            ? `GRATIS (Deduct stock tanpa revenue): "${sale.menuName}" (Qty: ${saleQty}) via file ${filename}`
            : `POS deduction: "${sale.menuName}" (Qty: ${saleQty}) via file ${filename}`;

          transactionRows.push({
            tenant_id: tenantId,
            date: salesDate,
            material_id: material.id,
            type: 'POS_DEDUCTION',
            location: 'RESTO',
            qty: -deductQty,
            amount: -deductQty * unitPrice,
            notes: txNotes,
            created_by: userId
          });

          deductionLogsCount++;
        }
      }
    }

    // Insert all transactions in batch
    if (transactionRows.length > 0) {
      const { error: txsErr } = await supabase.from('transactions').insert(transactionRows);
      if (txsErr) console.warn("Failed to save POS synced transactions:", txsErr);
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
    await logAudit('POS_SYNC', `Sinkronisasi POS berhasil dari file "${filename}". Memproses ${processedRecords} penjualan, ${skippedRecords} dilewati. Mencatat ${deductionLogsCount} mutasi stok RESTO${warningMsg}.`);

    return {
      message: 'POS synchronization completed successfully.',
      summary: {
        filename,
        processed_sales_rows: processedRecords,
        unmapped_recipes_skipped: skippedRecords,
        stock_deduction_ledger_entries: deductionLogsCount,
        negative_stock_warnings: negativeWarnings,
        status: 'COMPLETED'
      }
    };
  },

  // --- STOCK OPNAME ---
  completeOpname: async (opnameData) => {
    const tenantId = await getActiveTenantId();
    const userStr = localStorage.getItem('umatis_user');
    const userId = userStr ? JSON.parse(userStr).id : null;
    
    const location = opnameData.location;
    const items = opnameData.items;
    const nowStr = new Date().toISOString().split('T')[0];
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

    // 2. Create Persistent Stock Opname record
    const { data: opname, error: opnameErr } = await supabase
      .from('stock_opnames')
      .insert({
        tenant_id: tenantId,
        period_month: currentMonth,
        period_year: currentYear,
        location,
        status: 'APPROVED',
        signature_svg: opnameData.signature_svg || '',
        created_by: userId,
        approved_by: userId,
        submitted_at: new Date().toISOString(),
        approved_at: new Date().toISOString()
      })
      .select('*')
      .single();

    if (opnameErr) throw new Error("Gagal membuat data audit opname: " + opnameErr.message);

    let adjustmentCount = 0;
    let totalVariance = 0.00;

    const opnameItems = [];
    const transactionRows = [];

    // Pre-fetch materials
    const matIds = items.map(i => i.material_id);
    const { data: materials } = await supabase.from('materials').select('*').in('id', matIds);
    const materialsMap = new Map(materials.map(m => [m.id, m]));

    for (const item of items) {
      const material = materialsMap.get(item.material_id);
      if (!material) continue;

      const physicalQty = parseFloat(item.physical_qty || 0);
      const systemQty = location === 'RESTO' ? parseFloat(material.qty_resto) : parseFloat(material.qty_central);
      const variance = physicalQty - systemQty;

      opnameItems.push({
        opname_id: opname.id,
        material_id: material.id,
        book_qty: systemQty,
        physical_qty: physicalQty,
        notes: item.notes || null
      });

      // Adjust if variance exists
      if (Math.abs(variance) > 0.001) {
        const updateField = location === 'RESTO' ? { qty_resto: physicalQty } : { qty_central: physicalQty };
        
        await supabase
          .from('materials')
          .update(updateField)
          .eq('id', material.id);

        const unitPrice = parseFloat(material.new_price ?? material.price ?? 0);

        transactionRows.push({
          tenant_id: tenantId,
          date: nowStr,
          material_id: material.id,
          type: 'OPNAME_ADJ',
          location,
          qty: variance,
          amount: variance * unitPrice,
          notes: item.notes || `Stock Opname adjustment (Physical: ${physicalQty}, System: ${systemQty})`,
          created_by: userId
        });

        adjustmentCount++;
        totalVariance += Math.abs(variance);
      }
    }

    // Insert stock opname items
    if (opnameItems.length > 0) {
      await supabase.from('stock_opname_items').insert(opnameItems);
    }

    // Insert transactions
    if (transactionRows.length > 0) {
      await supabase.from('transactions').insert(transactionRows);
    }

    await logAudit('COMPLETE_OPNAME', `Menyelesaikan Stock Opname di gudang ${location}. Menyesuaikan ${adjustmentCount} item dengan total varians ${totalVariance.toFixed(2)} unit.`);

    return {
      message: `Stock opname berhasil diselesaikan untuk gudang ${location}.`,
      summary: {
        opname_id: opname.id,
        location,
        items_audited: items.length,
        adjustments_made: adjustmentCount,
        total_variance_units: parseFloat(totalVariance.toFixed(2))
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

    // 1. Fetch Materials and closing valuation
    const { data: materials } = await supabase.from('materials').select('*').eq('tenant_id', tenantId).eq('is_active', true);
    
    let closingValuation = 0.00;
    const categoryGroup = {};

    for (const mat of (materials || [])) {
      const price = parseFloat(mat.new_price ?? mat.price ?? 0);
      const val = (parseFloat(mat.qty_resto) + parseFloat(mat.qty_central)) * price;
      closingValuation += val;

      const cat = mat.category || 'Lain-lain';
      categoryGroup[cat] = (categoryGroup[cat] || 0) + val;
    }

    const categoryValuation = Object.entries(categoryGroup).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2))
    }));

    // 2. Query Transactions for calculations
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('date', startDate)
      .lte('date', endDate);

    let purchasesValuation = 0.00;
    let cogsIngredientsCost = 0.00;
    let salesRevenue = 0.00;

    for (const tx of (transactions || [])) {
      const amt = parseFloat(tx.amount || 0);
      if (tx.type === 'PURCHASE_IN') {
        purchasesValuation += amt;
      } else if (tx.type === 'POS_DEDUCTION') {
        cogsIngredientsCost += Math.abs(amt);
      } else if (tx.type === 'POS_SALE') {
        salesRevenue += amt;
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
      .eq('period_year', prevYear)
      .limit(1);

    let openingValuation = 0;
    if (prevOpnames && prevOpnames.length > 0) {
      // Use previous month closing stock valuation (recalc from materials value at that time)
      // Since we don't store historical prices, use current price as approximation
      // For exact calculation, opening = what closing was last month
      // Best approximation: sum physical_qty * current price from prev opname items
      const { data: prevOpnameItems } = await supabase
        .from('stock_opname_items')
        .select('physical_qty, material_id, materials(new_price, price)')
        .eq('opname_id', prevOpnames[0].id);
      
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
    const overheadAdjustment = cogsIngredientsCost * 0.05;
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
    let backupPayload = null;

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

    // 2. Perform Tenant Data Wipe
    // Cascade-able tables wipe (materials cascade deletes recipe_ingredients, invoice_items, transactions, stock_opname_items)
    await supabase.from('materials').delete().eq('tenant_id', tenantId);
    await supabase.from('recipes').delete().eq('tenant_id', tenantId);
    await supabase.from('invoices').delete().eq('tenant_id', tenantId);
    await supabase.from('audit_logs').delete().eq('tenant_id', tenantId);
    await supabase.from('pos_upload_logs').delete().eq('tenant_id', tenantId);
    await supabase.from('stock_opnames').delete().eq('tenant_id', tenantId);

    // 3. Restore all records sequentially using Supabase Bulk Insert
    if (backupPayload.materials.length > 0) {
      await supabase.from('materials').insert(backupPayload.materials.map(m => ({ ...m, tenant_id: tenantId })));
    }
    if (backupPayload.recipes.length > 0) {
      await supabase.from('recipes').insert(backupPayload.recipes.map(r => ({ ...r, tenant_id: tenantId })));
    }
    if (backupPayload.recipe_ingredients.length > 0) {
      // Ingredients don't have tenant_id directly, they reference recipe_id. Ensure recipe references are verified.
      await supabase.from('recipe_ingredients').insert(backupPayload.recipe_ingredients.map(ing => ({
        id: ing.id,
        recipe_id: ing.recipe_id,
        material_id: ing.material_id,
        qty_in_use: ing.qty_in_use,
        unit: ing.unit,
        unit_price: ing.unit_price,
        amount: ing.amount
      })));
    }
    if (backupPayload.transactions.length > 0) {
      await supabase.from('transactions').insert(backupPayload.transactions.map(t => ({ ...t, tenant_id: tenantId })));
    }
    if (backupPayload.invoices.length > 0) {
      await supabase.from('invoices').insert(backupPayload.invoices.map(i => ({ ...i, tenant_id: tenantId })));
    }
    if (backupPayload.invoice_items.length > 0) {
      await supabase.from('invoice_items').insert(backupPayload.invoice_items.map(item => ({
        id: item.id,
        invoice_id: item.invoice_id,
        material_id: item.material_id,
        qty: item.qty,
        unit_price: item.unit_price
      })));
    }
    if (backupPayload.audit_logs.length > 0) {
      await supabase.from('audit_logs').insert(backupPayload.audit_logs.map(log => ({ ...log, tenant_id: tenantId })));
    }
    if (backupPayload.pos_upload_logs.length > 0) {
      await supabase.from('pos_upload_logs').insert(backupPayload.pos_upload_logs.map(log => ({ ...log, tenant_id: tenantId })));
    }
    if (backupPayload.stock_opnames.length > 0) {
      await supabase.from('stock_opnames').insert(backupPayload.stock_opnames.map(so => ({ ...so, tenant_id: tenantId })));
    }
    if (backupPayload.stock_opname_items.length > 0) {
      await supabase.from('stock_opname_items').insert(backupPayload.stock_opname_items.map(item => ({
        id: item.id,
        opname_id: item.opname_id,
        material_id: item.material_id,
        book_qty: item.book_qty,
        physical_qty: item.physical_qty,
        notes: item.notes
      })));
    }

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
  }
};
