import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { isTauriApp } from "@/shared/lib/platform";

import { syncRepository } from "./sync-repository";
import { syncService } from "./sync-service";

// No push channel drives this card (Supabase Realtime only wakes the actual
// sync loop, see sync-service.ts's own comment on that) — a short poll
// keeps "N changes pending" from looking stale for long after a background
// sync quietly clears it.
const REFRESH_INTERVAL_MS = 30_000;

/** Settings-page status surface for the background sync loop already started in App.tsx — read-only plus a manual "sync now", never a second sync engine. */
export function useSyncStatus() {
  const profileId = useActiveProfileId();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.local.sync(profileId),
    queryFn: () => syncRepository.getStatus(),
    enabled: isTauriApp(),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  return {
    ...query,
    async syncNow() {
      await syncService.run(queryClient);
      await query.refetch();
    },
  };
}
