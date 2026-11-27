import { create } from "zustand";

export interface PendingQueueItem {
    id: string;
    type: "spk_checkin" | "spk_complete" | "survey_quotation" | "signature_upload";
    title: string;
    timestamp: string;
    data: any;
}

interface OfflineState {
    isOnline: boolean;
    isSyncing: boolean;
    pendingQueue: PendingQueueItem[];
    lastSyncedAt: string | null;
    initNetworkListeners: () => () => void;
    addPendingItem: (item: Omit<PendingQueueItem, "id" | "timestamp">) => void;
    removePendingItem: (id: string) => void;
    syncAll: () => Promise<void>;
    clearQueue: () => void;
}

const STORAGE_KEY = "fieldwork_offline_queue";
const LAST_SYNC_KEY = "fieldwork_last_sync";

function loadQueueFromStorage(): PendingQueueItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveQueueToStorage(queue: PendingQueueItem[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.error("Failed to save offline queue to localStorage", e);
    }
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    isSyncing: false,
    pendingQueue: loadQueueFromStorage(),
    lastSyncedAt: typeof localStorage !== "undefined" ? localStorage.getItem(LAST_SYNC_KEY) : null,

    initNetworkListeners: () => {
        const handleOnline = () => {
            set({ isOnline: true });
            // Auto sync if queue has items
            if (get().pendingQueue.length > 0) {
                get().syncAll();
            }
        };

        const handleOffline = () => {
            set({ isOnline: false });
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    },

    addPendingItem: (item) => {
        const newItem: PendingQueueItem = {
            ...item,
            id: `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
        };

        const updated = [newItem, ...get().pendingQueue];
        set({ pendingQueue: updated });
        saveQueueToStorage(updated);
    },

    removePendingItem: (id: string) => {
        const updated = get().pendingQueue.filter(item => item.id !== id);
        set({ pendingQueue: updated });
        saveQueueToStorage(updated);
    },

    clearQueue: () => {
        set({ pendingQueue: [] });
        saveQueueToStorage([]);
    },

    syncAll: async () => {
        const { pendingQueue, isSyncing, isOnline } = get();
        if (isSyncing || pendingQueue.length === 0 || !isOnline) return;

        set({ isSyncing: true });

        // Simulate syncing delay and background flush
        try {
            await new Promise(resolve => setTimeout(resolve, 1800));
            const now = new Date().toISOString();
            set({ pendingQueue: [], isSyncing: false, lastSyncedAt: now });
            localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
            localStorage.setItem(LAST_SYNC_KEY, now);
        } catch (err) {
            console.error("Error during offline sync:", err);
            set({ isSyncing: false });
        }
    },
}));
