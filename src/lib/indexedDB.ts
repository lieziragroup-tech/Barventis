/**
 * Local-First IndexedDB Storage Engine
 * Provides persistent, fast offline storage for all app data:
 * - quotations
 * - work orders (spk)
 * - order tracking & payments
 * - customers
 * - offline mutation queue
 * - keyval store (TanStack Query cache & app state)
 */

const DEFAULT_MOCK_QUOTATIONS: any[] = [];
const DEFAULT_MOCK_SPKS: any[] = [];
const DEFAULT_TRACKING_MOCKS: any[] = [];

const DB_NAME = "fieldwork_offline_db";
const DB_VERSION = 1;

export type StoreName =
    | "quotations"
    | "spk"
    | "tracking"
    | "customers"
    | "offline_queue"
    | "keyval";

let dbPromise: Promise<IDBDatabase> | null = null;

export function getIDB(): Promise<IDBDatabase> {
    if (typeof window === "undefined" || !window.indexedDB) {
        return Promise.reject(new Error("IndexedDB is not supported in this environment"));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains("quotations")) {
                db.createObjectStore("quotations", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("spk")) {
                db.createObjectStore("spk", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("tracking")) {
                db.createObjectStore("tracking", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("customers")) {
                db.createObjectStore("customers", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("offline_queue")) {
                db.createObjectStore("offline_queue", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("keyval")) {
                db.createObjectStore("keyval");
            }
        };

        request.onsuccess = async () => {
            const db = request.result;
            // Seed initial data if empty so the app works immediately offline
            await seedInitialData(db);
            resolve(db);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });

    return dbPromise;
}

async function seedInitialData(db: IDBDatabase) {
    try {
        const tx = db.transaction(["quotations", "spk", "tracking"], "readwrite");
        const quoStore = tx.objectStore("quotations");
        const spkStore = tx.objectStore("spk");
        const trkStore = tx.objectStore("tracking");

        const countQuoReq = quoStore.count();
        countQuoReq.onsuccess = () => {
            if (countQuoReq.result === 0) {
                // Populate default quotations
                for (const q of DEFAULT_MOCK_QUOTATIONS) {
                    quoStore.put(q);
                }
            }
        };

        const countSpkReq = spkStore.count();
        countSpkReq.onsuccess = () => {
            if (countSpkReq.result === 0) {
                for (const s of DEFAULT_MOCK_SPKS) {
                    spkStore.put(s);
                }
            }
        };

        const countTrkReq = trkStore.count();
        countTrkReq.onsuccess = () => {
            if (countTrkReq.result === 0) {
                for (const t of DEFAULT_TRACKING_MOCKS) {
                    trkStore.put(t);
                }
            }
        };
    } catch {
        // ignore seed errors
    }
}

/**
 * Get a single item by key from a store
 */
export async function idbGet<T = any>(storeName: StoreName, key: IDBValidKey): Promise<T | null> {
    try {
        const db = await getIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

/**
 * Put or update an item in a store
 */
export async function idbSet(storeName: StoreName, value: any, key?: IDBValidKey): Promise<void> {
    try {
        const db = await getIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req = key !== undefined ? store.put(value, key) : store.put(value);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        // fallback
    }
}

/**
 * Get all items from a store
 */
export async function idbGetAll<T = any>(storeName: StoreName): Promise<T[]> {
    try {
        const db = await getIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result ?? []);
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

/**
 * Delete an item from a store
 */
export async function idbDelete(storeName: StoreName, key: IDBValidKey): Promise<void> {
    try {
        const db = await getIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        });
    } catch {
        // ignore
    }
}

/**
 * Clear all items in a store
 */
export async function idbClear(storeName: StoreName): Promise<void> {
    try {
        const db = await getIDB();
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
        });
    } catch {
        // ignore
    }
}

/**
 * Batch insert or update items
 */
export async function idbBulkSet(storeName: StoreName, items: any[]): Promise<void> {
    if (!items || items.length === 0) return;
    try {
        const db = await getIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            for (const item of items) {
                store.put(item);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch {
        // ignore
    }
}

/**
 * Key-Value helper for TanStack Query and state persistence
 */
export const idbKeyVal = {
    get: async <T = any>(key: string): Promise<T | null> => {
        return idbGet<T>("keyval", key);
    },
    set: async (key: string, value: any): Promise<void> => {
        return idbSet("keyval", value, key);
    },
    del: async (key: string): Promise<void> => {
        return idbDelete("keyval", key);
    },
};
