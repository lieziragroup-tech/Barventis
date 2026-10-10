/**
 * Location Service for Barventis
 * Manages operational locations (Resto, Central, Kitchen, Service, and Custom Admin Locations)
 */

export const DEFAULT_LOCATIONS = [
  { 
    id: 'loc-all', 
    code: 'ALL', 
    name: 'Semua Lokasi', 
    shortName: 'All',
    isDefault: true, 
    isSystem: true,
    description: 'Semua gudang dan area operasional' 
  },
  { 
    id: 'loc-resto', 
    code: 'RESTO', 
    name: 'Resto / Bar', 
    shortName: 'Resto',
    isDefault: true, 
    isSystem: true,
    description: 'Area bar, display, dan operasional resto depan' 
  },
  { 
    id: 'loc-central', 
    code: 'CENTRAL', 
    name: 'Central Warehouse', 
    shortName: 'Central',
    isDefault: true, 
    isSystem: true,
    description: 'Gudang pusat penyimpanan bahan baku dan logistik' 
  },
  { 
    id: 'loc-kitchen', 
    code: 'KITCHEN', 
    name: 'Kitchen (Dapur)', 
    shortName: 'Kitchen',
    isDefault: true, 
    isSystem: true,
    description: 'Area dapur utama dan pengolahan makanan' 
  },
  { 
    id: 'loc-service', 
    code: 'SERVICE', 
    name: 'Service / Floor', 
    shortName: 'Service',
    isDefault: true, 
    isSystem: true,
    description: 'Area pelayanan tamu, dining floor, dan packaging' 
  },
];

const STORAGE_PREFIX = 'barventis_locations_';

function getStorageKey(tenantId) {
  return `${STORAGE_PREFIX}${tenantId || 'default'}`;
}

export const locationService = {
  /**
   * Get all active locations for a given tenant
   */
  getLocations: (tenantId) => {
    if (typeof window === 'undefined') return DEFAULT_LOCATIONS;
    try {
      const key = getStorageKey(tenantId);
      const raw = localStorage.getItem(key);
      if (!raw) return DEFAULT_LOCATIONS;

      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_LOCATIONS;

      // Ensure system locations are always preserved
      const savedCodes = new Set(saved.map(l => l.code.toUpperCase()));
      const missingSystem = DEFAULT_LOCATIONS.filter(def => !savedCodes.has(def.code.toUpperCase()));
      
      return [...missingSystem, ...saved];
    } catch (err) {
      console.warn('Failed to parse saved locations, using defaults:', err);
      return DEFAULT_LOCATIONS;
    }
  },

  /**
   * Add a new custom location
   */
  addLocation: (tenantId, { name, code, description = '' }) => {
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
      code: formattedCode,
      name: name.trim(),
      shortName: name.trim().slice(0, 12),
      description: description.trim(),
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
