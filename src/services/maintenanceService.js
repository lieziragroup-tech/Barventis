
import { supabase } from '../lib/supabase';
import { api, calculateIngredientCost } from './api';

const ROUNDING_TOLERANCE = 0.5; // Rupiah; below this an HPP delta is just rounding noise

// Resolve the current session's tenant + user (for audit logging).
const getSessionContext = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { tenantId: null, userId: null };
  const { data: profile } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', session.user.id)
    .maybeSingle();
  return { tenantId: profile?.tenant_id ?? null, userId: session.user.id };
};

// Best-effort audit log (never blocks the calling action).
const logMaintenance = async (action, description) => {
  try {
    const { tenantId, userId } = await getSessionContext();
    if (!tenantId || !userId) return;
    await supabase.from('audit_logs').insert({ tenant_id: tenantId, user_id: userId, action, description });
  } catch (e) {
    console.warn('[maintenance] audit log failed:', e);
  }
};

export const maintenanceService = {
  // ---- READ-ONLY HEALTH (all roles) ------------------------------
  getSystemHealth: async () => {
    const [materials, recipes, transactions, invoices, backups, opnames] = await Promise.all([
      api.getMaterials().catch(() => []),
      api.getRecipes().catch(() => []),
      api.getTransactions().catch(() => []),
      api.getInvoices().catch(() => []),
      api.getBackups().catch(() => []),
      supabase.from('stock_opnames').select('created_at').order('created_at', { ascending: false }).limit(1)
        .then(r => r.data || []).catch(() => [])
    ]);

    const lowStock = materials.filter(m => {
      const total = parseFloat(m.qty_resto || 0) + parseFloat(m.qty_central || 0);
      return total < parseFloat(m.min_stock || 15);
    }).length;

    const pendingInvoices = invoices.filter(i => i.status === 'DRAFT' || i.status === 'SENT').length;

    return {
      materials: materials.length,
      lowStock,
      recipes: recipes.length,
      transactions: transactions.length,
      pendingInvoices,
      lastBackup: backups[0]?.created_at || null,
      lastOpname: opnames[0]?.created_at || null
    };
  },

  // ---- INTEGRITY CHECK (Owner+) ----------------------------------
  // Returns an array of issues: { key, severity, title, detail, count }
  runIntegrityCheck: async () => {
    const issues = [];

    const [materials, recipes] = await Promise.all([
      api.getMaterials().catch(() => []),
      api.getRecipes().catch(() => [])
    ]);
    const materialMap = new Map(materials.map(m => [m.id, m]));

    // 1. Orphaned ingredients — reference a missing/inactive material
    let orphanCount = 0;
    const recipesMissingIngredients = [];
    let driftCount = 0;
    const usedMaterialIds = new Set();

    for (const r of recipes) {
      const ings = r.ingredients || [];
      if (ings.length === 0) {
        recipesMissingIngredients.push(r.menu_name);
        continue;
      }

      let subtotal = 0;
      for (const ing of ings) {
        usedMaterialIds.add(ing.material_id);
        const mat = materialMap.get(ing.material_id);
        if (!mat) {
          orphanCount++;
          continue;
        }
        subtotal += calculateIngredientCost(mat, parseFloat(ing.qty_in_use), ing.unit);
      }

      // 2. HPP drift — stored basic_cost differs from freshly recomputed value
      const recomputed = subtotal + subtotal * (api.getOverheadPct ? api.getOverheadPct() : 0.05);
      if (Math.abs(recomputed - parseFloat(r.basic_cost || 0)) > ROUNDING_TOLERANCE) {
        driftCount++;
      }
    }

    if (orphanCount > 0) {
      issues.push({
        key: 'orphan_ingredients', severity: 'danger',
        title: 'Bahan resep tidak valid',
        detail: 'Ada baris bahan di resep yang menunjuk ke material nonaktif/terhapus. Perbarui resep terkait.',
        count: orphanCount
      });
    }
    if (recipesMissingIngredients.length > 0) {
      issues.push({
        key: 'empty_recipes', severity: 'warning',
        title: 'Resep tanpa bahan',
        detail: `Resep berikut belum punya bahan: ${recipesMissingIngredients.slice(0, 8).join(', ')}${recipesMissingIngredients.length > 8 ? '…' : ''}`,
        count: recipesMissingIngredients.length
      });
    }
    if (driftCount > 0) {
      issues.push({
        key: 'hpp_drift', severity: 'warning',
        title: 'HPP tidak sinkron',
        detail: 'Nilai HPP tersimpan berbeda dari hasil hitung ulang (mis. harga bahan berubah). Jalankan "Recalc HPP".',
        count: driftCount
      });
    }

    // 3. Negative stock (defensive — DB CHECK should prevent it)
    const negStock = materials.filter(m => parseFloat(m.qty_resto) < 0 || parseFloat(m.qty_central) < 0);
    if (negStock.length > 0) {
      issues.push({
        key: 'negative_stock', severity: 'danger',
        title: 'Stok negatif',
        detail: `Material dengan stok < 0: ${negStock.slice(0, 8).map(m => m.name).join(', ')}.`,
        count: negStock.length
      });
    }

    // 4. Materials never used in any recipe (informational)
    const unused = materials.filter(m => !usedMaterialIds.has(m.id));
    if (unused.length > 0) {
      issues.push({
        key: 'unused_materials', severity: 'info',
        title: 'Bahan tidak terpakai di resep',
        detail: `${unused.length} bahan baku belum dipakai di resep mana pun (informasi saja).`,
        count: unused.length
      });
    }

    await logMaintenance('INTEGRITY_CHECK', `Menjalankan pemeriksaan integritas data. Ditemukan ${issues.length} kategori isu.`);
    return issues;
  },

  // ---- RECALC HPP (Owner+) ---------------------------------------
  // Recomputes and persists HPP for every recipe via the canonical api path.
  recalcAllRecipeCosts: async () => {
    const recipes = await api.getRecipes();
    let updated = 0;
    const errors = [];

    for (const r of recipes) {
      try {
        const ingredients = (r.ingredients || [])
          .filter(i => i.material_id)
          .map(i => ({ material_id: i.material_id, qty_in_use: i.qty_in_use, unit: i.unit }));
        await api.updateRecipe(r.id, {
          menu_name: r.menu_name,
          selling_price: r.selling_price,
          ingredients
        });
        updated++;
      } catch (e) {
        errors.push({ recipe: r.menu_name, error: e.message });
      }
    }

    await logMaintenance('RECALC_HPP', `Menghitung ulang HPP untuk ${updated} resep (${errors.length} gagal).`);
    return { updated, failed: errors.length, errors };
  },

  // ---- STAFF / ROLE MANAGEMENT (Owner) ---------------------------
  // RLS isolates rows to the current tenant automatically, but we add an
  // explicit tenant_id filter as defense-in-depth (BUG-MS-01).
  listStaff: async () => {
    const { tenantId } = await getSessionContext();
    if (!tenantId) throw new Error('Sesi tidak valid atau tenant tidak ditemukan.');

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    if (error) throw new Error('Gagal memuat daftar staff: ' + error.message);
    return data || [];
  },

  updateUserRole: async (userId, newRole) => {
    const allowed = ['Admin / Owner', 'Staff'];
    if (!allowed.includes(newRole)) {
      throw new Error('Role tidak valid. Hanya boleh "Admin / Owner" atau "Staff".');
    }

    // Guard: never allow demoting the last remaining Owner — BUG-MS-02 fix:
    // listStaff() now filters by tenant so this check only counts same-tenant owners.
    if (newRole === 'Staff') {
      const staff = await maintenanceService.listStaff();
      const owners = staff.filter(u => u.role === 'Admin / Owner');
      if (owners.length <= 1 && owners.some(o => o.id === userId)) {
        throw new Error('Tidak bisa menurunkan Owner terakhir. Tenant harus punya minimal satu Owner.');
      }
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('id', userId)
      .select('id, name, email, role')
      .single();
    if (error) throw new Error('Gagal memperbarui role: ' + error.message);

    await logMaintenance('UPDATE_USER_ROLE', `Mengubah role "${data.name}" (${data.email}) menjadi "${newRole}".`);
    return data;
  }
};