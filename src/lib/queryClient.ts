/**
 * TanStack Query Configuration — Free-Tier Supabase Egress & Offline-First Optimized
 */
import { QueryClient, dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { idbKeyVal } from "./indexedDB";

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 10, // 10 menit: mencegah refetch berulang ke Supabase
            gcTime: 1000 * 60 * 60 * 24 * 7, // 7 hari tersimpan di cache lokal
            networkMode: "offlineFirst",
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
        },
        mutations: {
            networkMode: "offlineFirst",
            retry: 0,
        },
    },
});

const PERSISTENCE_KEY = "tanstack_query_cache_v1";
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export async function initQueryClientPersistence(client: QueryClient): Promise<void> {
    try {
        const savedCache = await idbKeyVal.get<DehydratedState>(PERSISTENCE_KEY);
        if (savedCache) {
            hydrate(client, savedCache);
        }
    } catch {
        // Abaikan error restorasi cache
    }

    client.getQueryCache().subscribe((event) => {
        if (!event) return;
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            try {
                const dehydrated = dehydrate(client, {
                    shouldDehydrateQuery: (query) => query.state.status === "success",
                });
                await idbKeyVal.set(PERSISTENCE_KEY, dehydrated);
            } catch {
                // Abaikan jika ada data non-serializable
            }
        }, 1500);
    });
}
