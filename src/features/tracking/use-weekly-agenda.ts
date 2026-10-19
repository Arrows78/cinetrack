import { useQuery } from "@tanstack/react-query";
import { weeklyAgendaService } from "@/features/tracking/weekly-agenda-service";
import { useActiveProfileId, usePreferences } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_30_MIN } from "@/shared/constants/query";

// Derived from queryKeys.local.tracking rather than a new top-level entry in
// query-keys.ts: this agenda is a scoped-down view of the exact same
// underlying data (library, tracked series, availability alerts), so every
// place that already invalidates queryKeys.local.tracking(profileId) — see
// use-library.ts, use-progress.ts, use-availability-alerts.ts,
// use-preferences.ts — invalidates this key too, since invalidateQueries
// matches by prefix by default.
export function useWeeklyAgenda() {
  const profileId = useActiveProfileId();
  const preferences = usePreferences();
  const preferredProviderIds = preferences.data?.preferredProviderIds ?? [];
  return useQuery({
    // Same key shape as useTracking: the selection is part of the key as an
    // order-independent string, so reordering the same services is not a
    // different query.
    queryKey: [
      ...queryKeys.local.tracking(profileId),
      "week",
      [...preferredProviderIds].sort((a, b) => a - b).join(","),
    ] as const,
    queryFn: () => weeklyAgendaService.build(preferredProviderIds),
    staleTime: STALE_30_MIN,
    // Wait for the preferences read to settle (success or failure) so the
    // first fetch never runs with a provisional empty provider selection.
    enabled: !preferences.isPending,
  });
}
