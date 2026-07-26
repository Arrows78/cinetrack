import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 1000*60*5, gcTime: 1000*60*60*24*7, retry: 1, refetchOnWindowFocus: false, networkMode: "offlineFirst" }, mutations: { networkMode: "offlineFirst" } } });
export const queryPersister = createSyncStoragePersister({ storage: typeof window === "undefined" ? undefined : window.localStorage, key: "cinetrack.query-cache.v1", throttleTime: 1000 });
