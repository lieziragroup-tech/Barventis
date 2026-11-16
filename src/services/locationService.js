/**
 * Location & Role-UUID Service for Barventis v2
 * Manages operational locations (Resto, Central, Kitchen, Service, and Custom Admin Locations),
 * deterministic/persisted UUIDs per location/area, and Role-to-Material-Category filtering
 * configurable in System Settings (FT-05.1 & FT-05.2).
 */

export const DEFAULT_LOCATIONS = [
  { 
    id: 'loc-all', 
    uuid: '00000000-0000-4000-a000-000000000000',
    code: 'ALL', 
    name: 'Semua Lokasi', 
    shortName: 'All',
    roleClassification: 'ALL',
    allowedCategories: [],
    isDefault: true, 
    isSystem: true,
    description: 'Semua gudang dan area operasional' 
  },
  { 
    id: 'loc-central', 
    uuid: '00000000-0000-4000-a000-000000000001',
    code: 'CENTRAL', 
    name: 'Central Warehouse', 
    shortName: 'Central',
    roleClassification: 'Central',
    allowedCategories: [], // empty = all categories allowed
    isDefault: true, 
    isSystem: true,
    description: 'Gudang pusat penyimpanan bahan baku dan logistik' 
  },
  { 
    id: 'loc-resto', 
    uuid: '00000000-0000-4000-a000-000000000002',
    code: 'RESTO', 
    name: 'Resto / Bar', 
    shortName: 'Resto',
    roleClassification: 'Bar',
    allowedCategories: ['Coffee', 'Coffee & Tea', 'Dairy', 'Milk & Dairy', 'Sweetener', 'Syrup', 'Syrup & Sauce', 'Beverage Base', 'Ready to Drink', 'Powder & Topping', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep'],
    isDefault: true, 
    isSystem: true,
    description: 'Area bar, display, dan operasional minuman resto depan' 
  },
  { 
    id: 'loc-kitchen', 
    uuid: '00000000-0000-4000-a000-000000000003',
    code: 'KITCHEN', 
    name: 'Kitchen (Dapur)', 
    shortName: 'Kitchen',
    roleClassification: 'Kitchen',
    allowedCategories: ['Kitchen & Cooking', 'Meat & Poultry', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep', 'Bahan Baku Dasar', 'Dairy & Cooking', 'Spices & Seasoning'],
    isDefault: true, 
    isSystem: true,
    description: 'Area dapur utama dan pengolahan bahan mentah/makanan' 
  },
  { 
    id: 'loc-service', 
    uuid: '00000000-0000-4000-a000-000000000004',
    code: 'SERVICE', 
    name: 'Service / Floor', 
    shortName: 'Service',
    roleClassification: 'Service',
    allowedCategories: ['Packaging', 'Amenities', 'Consumables', 'Tissue & Cleaning', 'Ready to Drink'],
    isDefault: true, 
    isSystem: true,
    description: 'Area pelayanan tamu, dining floor, dan packaging' 
  },
];

const STORAGE_PREFIX = 'barventis_locations_';
const ROLE_MAP_PREFIX = 'barventis_role_category_map_';

function getStorageKey(tenantId) {
  return `${STORAGE_PREFIX}${tenantId || 'default'}`;
}

function getRoleMapKey(tenantId) {
  return `${ROLE_MAP_PREFIX}${tenantId || 'default'}`;
}

function generateDeterministicOrRandomUuid(seedIndex = 9) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = String(Date.now() + seedIndex).slice(-12).padStart(12, '0');
  return `00000000-0000-4000-a000-${hex}`;
}

export const DEFAULT_ROLE_CATEGORY_MAP = {
  Central: [], // Semua kategori
  Bar: ['Coffee', 'Coffee & Tea', 'Dairy', 'Milk & Dairy', 'Sweetener', 'Syrup', 'Syrup & Sauce', 'Beverage Base', 'Ready to Drink', 'Powder & Topping', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep'],
  Kitchen: ['Kitchen & Cooking', 'Meat & Poultry', 'Fruit & Produce', 'Fresh & Fruit', 'Prep / Bahan Olahan', 'Bahan Olahan / Prep', 'Bahan Baku Dasar', 'Dairy & Cooking', 'Spices & Seasoning'],
  Service: ['Packaging', 'Amenities', 'Consumables', 'Tissue & Cleaning', 'Ready to Drink']
};

export const locationService = {
  /**
   * Get all active locations for a given tenant (guaranteed with UUID and roleClassification)
   */
  getLocations: (tenantId) => {
    if (typeof window === 'undefined') return DEFAULT_LOCATIONS;
    try {
      const key = getStorageKey(tenantId);
      const raw = localStorage.getItem(key);
      const roleMap = locationService.getRoleCategoryMap(tenantId);
      if (!raw) {
        return DEFAULT_LOCATIONS.map(loc => ({
          ...loc,
          allowedCategories: roleMap[loc.roleClassification] ?? loc.allowedCategories ?? []
        }));
      }

      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_LOCATIONS;

      const savedCodes = new Set(saved.map(l => String(l.code || '').toUpperCase()));
      const missingSystem = DEFAULT_LOCATIONS.filter(def => !savedCodes.has(def.code.toUpperCase()));

      return [...missingSystem, ...saved].map((loc, idx) => {
        const sysMatch = DEFAULT_LOCATIONS.find(d => d.code.toUpperCase() === String(loc.code || '').toUpperCase());
        const roleClass = loc.roleClassification || sysMatch?.roleClassification || 'Bar';
        return {
          ...sysMatch,
          ...loc,
          uuid: loc.uuid || sysMatch?.uuid || generateDeterministicOrRandomUuid(idx + 10),
          roleClassification: roleClass,
          allowedCategories: Array.isArray(loc.allowedCategories) && loc.allowedCategories.length > 0
            ? loc.allowedCategories
            : (roleMap[roleClass] ?? sysMatch?.allowedCategories ?? [])
        };
      });
    } catch (err) {
      console.warn('Failed to parse saved locations, using defaults:', err);
      return DEFAULT_LOCATIONS;
    }
  },

  /**
   * Get Role -> Material Category mapping for System Settings
   */
  getRoleConfigForUser: (tenantId, rawRole) => {
    const r = String(rawRole || '').trim();
    const roleMap = locationService.getRoleCategoryMap(tenantId);
    const locs = locationService.getLocations(tenantId);
    if (r === 'Kitchen') {
      const kLoc = locs.find(l => l.code === 'KITCHEN') || DEFAULT_LOCATIONS[3];
      return { role: 'Kitchen', defaultLocationCode: 'KITCHEN', uuid: kLoc.uuid, allowedCategories: roleMap.Kitchen || kLoc.allowedCategories || [] };
    }
    if (r === 'Service') {
      const sLoc = locs.find(l => l.code === 'SERVICE') || DEFAULT_LOCATIONS[4];
      return { role: 'Service', defaultLocationCode: 'SERVICE', uuid: sLoc.uuid, allowedCategories: roleMap.Service || sLoc.allowedCategories || [] };
    }
    if (r === 'Central' || r === 'Purchasing') {
      const cLoc = locs.find(l => l.code === 'CENTRAL') || DEFAULT_LOCATIONS[1];
      return { role: r, defaultLocationCode: 'CENTRAL', uuid: cLoc.uuid, allowedCategories: [] };
    }
    if (r === 'Bar' || r === 'Barista') {
      const bLoc = locs.find(l => l.code === 'RESTO') || DEFAULT_LOCATIONS[2];
      return { role: 'Bar', defaultLocationCode: 'RESTO', uuid: bLoc.uuid, allowedCategories: roleMap.Bar || bLoc.allowedCategories || [] };
    }
    return { role: r || 'Owner', defaultLocationCode: 'RESTO', uuid: DEFAULT_LOCATIONS[0].uuid, allowedCategories: [] };
  },

  getRoleCategoryMap: (tenantId) => {
    if (typeof window === 'undefined') return DEFAULT_ROLE_CATEGORY_MAP;
    try {
      const raw = localStorage.getItem(getRoleMapKey(tenantId));
      if (!raw) return DEFAULT_ROLE_CATEGORY_MAP;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_ROLE_CATEGORY_MAP, ...(parsed || {}) };
    } catch {
      return DEFAULT_ROLE_CATEGORY_MAP;
    }
  },

  /**
   * Save Role -> Material Category mapping from System Settings
   */
  saveRoleCategoryMap: (tenantId, roleCategoryMap) => {
    if (typeof window === 'undefined') return DEFAULT_ROLE_CATEGORY_MAP;
    const merged = { ...DEFAULT_ROLE_CATEGORY_MAP, ...(roleCategoryMap || {}) };
    try {
      localStorage.setItem(getRoleMapKey(tenantId), JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('barventis:locations_updated', { detail: { tenantId, roleCategoryMap: merged } }));
    } catch (e) {
      console.error('Failed to save role category map:', e);
    }
    return merged;
  },

  /**
   * Build unified transfer endpoints combining Central Warehouse, Internal Areas (Bar, Kitchen, Service),
   * and Operational Branches (Cabang BSD, Cabang Kasuna) with their respective UUIDs (FT-05.1 & FT-05.2).
   */
  getUnifiedTransferEndpoints: (tenantId, branches = [], activeBranchId = null) => {
    const locs = locationService.getLocations(tenantId).filter(l => l.code !== 'ALL');
    const activeBranchObj = (branches || []).find(b => b.id === activeBranchId) || branches?.[0] || null;
    const endpoints = [];

    // 1. Gudang Pusat (Central Warehouse) — selalu tersedia untuk dipilih dari cabang mana pun
    const centralLoc = locs.find(l => l.code === 'CENTRAL') || DEFAULT_LOCATIONS[1];
    endpoints.push({
      key: 'LOC:CENTRAL',
      uuid: centralLoc.uuid,
      code: 'CENTRAL',
      name: 'Central Warehouse',
      displayLabel: `🏢 Central Warehouse (Gudang Pusat)`,
      group: 'Gudang Pusat (Central)',
      endpointType: 'CENTRAL',
      branchId: activeBranchObj?.id || null,
      roleClassification: 'Central',
      allowedCategories: []
    });

    // 2. Area Operasional Internal (Resto Bar, Kitchen, Service, dan lokasi kustom)
    locs.filter(l => l.code !== 'CENTRAL').forEach(loc => {
      endpoints.push({
        key: `LOC:${loc.code}`,
        uuid: loc.uuid,
        code: loc.code,
        name: loc.name,
        displayLabel: `🏪 ${loc.name} (${activeBranchObj?.name || 'Cabang Aktif'} • Role: ${loc.roleClassification || 'Bar'})`,
        group: `Area Internal (${activeBranchObj?.name || 'Cabang Aktif'})`,
        endpointType: 'INTERNAL_AREA',
        branchId: activeBranchObj?.id || null,
        roleClassification: loc.roleClassification || 'Bar',
        allowedCategories: loc.allowedCategories || []
      });
    });

    // 3. Lintas Cabang (Cabang BSD, Cabang Kasuna, dll.)
    (branches || []).filter(b => b.is_active !== false).forEach(b => {
      endpoints.push({
        key: `BRANCH:${b.id}`,
        uuid: b.id,
        code: b.code || b.name.toUpperCase(),
        name: `Cabang ${b.name}`,
        branchName: b.name,
        displayLabel: `🌐 Cabang ${b.name}${b.id === activeBranchId ? ' (Cabang Saat Ini)' : ''}`,
        group: 'Antar Cabang (Resto Umatis)',
        endpointType: 'BRANCH',
        branchId: b.id,
        isCurrentBranch: b.id === activeBranchId,
        roleClassification: 'All',
        allowedCategories: []
      });
    });

    return endpoints;
  },

  /**
   * Add a new custom location with UUID and Role Classification
   */
  addLocation: (tenantId, { name, code, description = '', roleClassification = 'Bar', allowedCategories = [] }) => {
    if (!name || !name.trim()) throw new Error('Nama lokasi wajib diisi.');
    
    const formattedCode = (code || name.replace(/[^a-zA-Z0-9]/g, '_'))
      .trim()
      .toUpperCase();

    if (!formattedCode) throw new Error('Kode lokasi tidak valid.');

    const current = locationService.getLocations(tenantId);
    if (current.some(l => l.code.toUpperCase() === formattedCode)) {
      throw new Error(`Kode lokasi "${formattedCode}" sudah ada.`);
    }

    const newLocation = {
      id: `loc-custom-${Date.now()}`,
      uuid: generateDeterministicOrRandomUuid(current.length + 1),
      code: formattedCode,
      name: name.trim(),
      shortName: name.trim().slice(0, 12),
      description: description.trim(),
      roleClassification: roleClassification || 'Bar',
      allowedCategories: Array.isArray(allowedCategories) ? allowedCategories : [],
      isDefault: false,
      isSystem: false,
      created_at: new Date().toISOString()
    };

    const updated = [...current, newLocation];
    try {
      localStorage.setItem(getStorageKey(tenantId), JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('barventis:locations_updated', { detail: { tenantId, locations: updated } }));
    } catch (e) {
      console.error('Failed to save location:', e);
    }

    return newLocation;
  },

  /**
   * Update an existing location's role classification or allowed categories
   */
  updateLocationConfig: (tenantId, locationCodeOrId, updates = {}) => {
    const current = locationService.getLocations(tenantId);
    const updated = current.map(loc => {
      if (loc.id === locationCodeOrId || loc.code.toUpperCase() === String(locationCodeOrId).toUpperCase()) {
        return { ...loc, ...updates };
      }
      return loc;
    });
    try {
      localStorage.setItem(getStorageKey(tenantId), JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('barventis:locations_updated', { detail: { tenantId, locations: updated } }));
    } catch (e) {
      console.error('Failed to update location config:', e);
    }
    return updated;
  },

  /**
   * Delete a custom location
   */
  deleteLocation: (tenantId, locationIdOrCode) => {
    const current = locationService.getLocations(tenantId);
    const target = current.find(l => l.id === locationIdOrCode || l.code.toUpperCase() === String(locationIdOrCode).toUpperCase());

    if (!target) throw new Error('Lokasi tidak ditemukan.');
    if (target.isSystem) throw new Error('Lokasi bawaan sistem tidak dapat dihapus.');

    const updated = current.filter(l => l.id !== target.id);
    try {
      localStorage.setItem(getStorageKey(tenantId), JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('barventis:locations_updated', { detail: { tenantId, locations: updated } }));
    } catch (e) {
      console.error('Failed to update locations:', e);
    }

    return true;
  },

  /**
   * Reset locations to default list
   */
  resetToDefault: (tenantId) => {
    try {
      localStorage.removeItem(getStorageKey(tenantId));
      localStorage.removeItem(getRoleMapKey(tenantId));
      window.dispatchEvent(new CustomEvent('barventis:locations_updated', { detail: { tenantId, locations: DEFAULT_LOCATIONS } }));
    } catch (e) {
      console.error('Failed to reset locations:', e);
    }
    return DEFAULT_LOCATIONS;
  },

  /**
   * Subscribe to location updates
   */
  subscribe: (callback) => {
    if (typeof window === 'undefined') return () => {};
    const handler = (e) => {
      callback(e.detail);
    };
    window.addEventListener('barventis:locations_updated', handler);
    return () => window.removeEventListener('barventis:locations_updated', handler);
  }
};
