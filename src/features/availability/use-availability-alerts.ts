import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { availabilityRepository } from "@/features/availability/availability-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaSummary } from "@/types/media";

export function useAvailabilityAlerts() {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.availabilityAlerts(profileId),
    queryFn: () => availabilityRepository.listAlerts(),
  });
  const removeMutation = useInvalidatingMutation(
    (id: string) => availabilityRepository.remove(id),
    [queryKeys.local.availabilityAlerts(profileId), queryKeys.local.tracking(profileId)]
  );
  return { ...query, remove: removeMutation.mutateAsync };
}

// Not profile-scoped (see queryKeys.local.availabilitySnapshots's own
// comment) — every profile shares the same cache. Backs the smart-lists
// provider rule (see smart-list-evaluation.ts).
export function useAvailabilitySnapshots() {
  return useQuery({
    queryKey: queryKeys.local.availabilitySnapshots,
    queryFn: () => availabilityRepository.listSnapshots(),
  });
}

export function useAvailabilityAlert(
  media: MediaSummary,
  region: string,
  providerIds: number[],
  options?: { enabled?: boolean }
) {
  const profileId = useActiveProfileId();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...queryKeys.local.availabilityAlerts(profileId), media.mediaType, media.id],
    queryFn: () => availabilityRepository.getAlert(media.id, media.mediaType),
    enabled: options?.enabled ?? true,
  });
  const mutation = useMutation({
    mutationFn: () => availabilityRepository.toggle(media, region, providerIds),
    onSuccess: (data) => {
      client.setQueryData([...queryKeys.local.availabilityAlerts(profileId), media.mediaType, media.id], data);
      void client.invalidateQueries({ queryKey: queryKeys.local.availabilityAlerts(profileId) });
      void client.invalidateQueries({ queryKey: queryKeys.local.tracking(profileId) });
    },
  });
  return { ...query, toggle: mutation.mutateAsync, isSaving: mutation.isPending };
}
