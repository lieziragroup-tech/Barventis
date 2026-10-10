import localforage from 'localforage';

/**
 * Offline Inventory Cache Service using localforage (IndexedDB with fallback).
 * Enables seamless offline access to stock lists, materials, and daily inventory data
 * when internet connection is interrupted or server is unreachable.
 */

// Configure dedicated localforage instance for Barventis inventory storage
const inventoryStore = localforage.createInstance({
  name: 'BarventisOfflineDB',
  storeName: 'inventory_cache',
  description: 'Barventis Offline Inventory & Stock Cache'
});

export const offlineInventoryCache = {
  /**
   * Save materials / stock list to offline storage
   * @param {string} tenantId 
   * @param {Array} materials 
   */
  async saveStockList(tenantId, materials) {
    if (!tenantId || !Array.isArray(materials)) return;
    try {
      const now = new Date().toISOString();
      await inventoryStore.setItem(`materials_${tenantId}`, materials);
      await inventoryStore.setItem(`materials_meta_${tenantId}`, {
        lastSynced: now,
        count: materials.length,
        version: 1
      });
    } catch (err) {
      console.warn('[OfflineCache] Failed to save stock list:', err);
    }
  },

  /**
   * Retrieve cached materials / stock list
   * @param {string} tenantId 
   * @returns {Promise<Array|null>}
   */
  async getStockList(tenantId) {
    if (!tenantId) return null;
    try {
      const cached = await inventoryStore.getItem(`materials_${tenantId}`);
      return Array.isArray(cached) ? cached : null;
    } catch (err) {
      console.warn('[OfflineCache] Failed to read stock list:', err);
      return null;
    }
  },

  /**
   * Get metadata for cached stock list (timestamp, item count)
   * @param {string} tenantId 
   * @returns {Promise<{lastSynced: string, count: number}|null>}
   */
  async getStockListMeta(tenantId) {
    if (!tenantId) return null;
    try {
      return await inventoryStore.getItem(`materials_meta_${tenantId}`);
    } catch (err) {
      return null;
    }
  },

  /**
   * Cache daily inventory records for a specific date and category
   * @param {string} tenantId 
   * @param {string} date 
   * @param {string} category 
   * @param {Object} data 
   */
  async saveDailyInventory(tenantId, date, category, data) {
    if (!tenantId || !date) return;
    try {
      const key = `daily_inv_${tenantId}_${date}_${category || 'ALL'}`;
      await inventoryStore.setItem(key, {
        data,
        cachedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[OfflineCache] Failed to save daily inventory snapshot:', err);
    }
  },

  /**
   * Retrieve cached daily inventory snapshot
   * @param {string} tenantId 
   * @param {string} date 
   * @param {string} category 
   * @returns {Promise<Object|null>}
   */
  async getDailyInventory(tenantId, date, category) {
    if (!tenantId || !date) return null;
    try {
      const key = `daily_inv_${tenantId}_${date}_${category || 'ALL'}`;
      const entry = await inventoryStore.getItem(key);
      return entry ? entry.data : null;
    } catch (err) {
      console.warn('[OfflineCache] Failed to read daily inventory snapshot:', err);
      return null;
    }
  },

  /**
   * Cache unit conversions
   * @param {string} tenantId 
   * @param {Array} conversions 
   */
  async saveUnitConversions(tenantId, conversions) {
    if (!tenantId || !Array.isArray(conversions)) return;
    try {
      await inventoryStore.setItem(`conversions_${tenantId}`, conversions);
    } catch (err) {
      console.warn('[OfflineCache] Failed to save unit conversions:', err);
    }
  },

  /**
   * Retrieve cached unit conversions
   * @param {string} tenantId 
   */
  async getUnitConversions(tenantId) {
    if (!tenantId) return null;
    try {
      const cached = await inventoryStore.getItem(`conversions_${tenantId}`);
      return Array.isArray(cached) ? cached : null;
    } catch (err) {
      return null;
    }
  },

  /**
   * Clear all cached data
   */
  async clearAll() {
    try {
      await inventoryStore.clear();
    } catch (err) {
      console.warn('[OfflineCache] Clear failed:', err);
    }
  }
};
