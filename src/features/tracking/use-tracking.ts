import { useQuery } from "@tanstack/react-query";
import { trackingService } from "@/features/tracking/tracking-service";
import { useActiveProfileId, usePreferences } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import { STALE_30_MIN } from "@/shared/constants/query";

export function useTracking() {
  const profileId = useActiveProfileId();
  const preferredProviderIds = usePreferences().data?.preferredProviderIds ?? [];
  return useQuery({
    queryKey: queryKeys.local.tracking(profileId),
    queryFn: () => trackingService.build(60, preferredProviderIds),
    staleTime: STALE_30_MIN,
  });
}
