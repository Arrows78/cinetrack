import { useQuery } from "@tanstack/react-query";
import { trackingService } from "@/features/tracking/tracking-service";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";

export function useTracking() {
  const profileId = useActiveProfileId();
  return useQuery({
    queryKey: queryKeys.local.tracking(profileId),
    queryFn: () => trackingService.build(),
    staleTime: 1000 * 60 * 30,
  });
}
