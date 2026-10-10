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
  const preferredProviderIds = usePreferences().data?.preferredProviderIds ?? [];
  return useQuery({
    queryKey: [...queryKeys.local.tracking(profileId), "week", preferredProviderIds] as const,
    queryFn: () => weeklyAgendaService.build(preferredProviderIds),
    staleTime: STALE_30_MIN,
  });
}
