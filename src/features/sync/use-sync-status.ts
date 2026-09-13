import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { isTauriApp } from "@/shared/lib/platform";

import { syncRepository } from "./sync-repository";
import { syncService, PERIODIC_SYNC_MS } from "./sync-service";

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

  // `now` (not a bare Date.now() read during render, which React's purity
  // rule forbids) ticks independently of the query above, so the estimate
  // stays roughly live even between its own 30s refetches. A rough estimate,
  // not a real countdown — the interval itself is a fixed constant, not a
  // user-configurable preference (an audit finding flagged the lack of any
  // visual feedback at all here, and the fix is scoped to this —
  // SyncStatusCard already showing lastSyncedAt/pending/failed/conflicts
  // covers the rest of that finding).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const lastSyncedAt = query.data?.lastSyncedAt;
  const nextCheckInMinutes = lastSyncedAt
    ? Math.max(0, Math.ceil((new Date(lastSyncedAt).getTime() + PERIODIC_SYNC_MS - now) / 60_000))
    : null;

  return {
    ...query,
    nextCheckInMinutes,
    async syncNow() {
      await syncService.run(queryClient);
      await query.refetch();
    },
  };
}
