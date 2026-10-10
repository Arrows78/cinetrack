import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { recommendationsRepository } from "@/features/recommendations/recommendations-repository";
import type { DismissMediaInput } from "@/features/recommendations/recommendations-commands";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import { queryKeys } from "@/shared/constants/query-keys";
import type { MediaType } from "@/types/media";

export function useDismissedRecommendations() {
  const profileId = useActiveProfileId();
  const query = useQuery({
    queryKey: queryKeys.local.dismissedRecommendations(profileId),
    queryFn: () => recommendationsRepository.listDismissed(),
  });
  // Watch Tonight's picks are filtered against this list and cached for
  // minutes, so a dismissal or a restore must refresh them too — otherwise a
  // title the viewer just rejected keeps showing up there until the cache
  // expires.
  const invalidatedKeys = [
    queryKeys.local.dismissedRecommendations(profileId),
    queryKeys.local.watchTonight(profileId),
  ];

  const dismissMutation = useInvalidatingMutation(
    (media: DismissMediaInput) => recommendationsRepository.dismiss(media),
    invalidatedKeys
  );
  const undismissMutation = useInvalidatingMutation(
    ({ mediaId, mediaType }: { mediaId: number; mediaType: MediaType }) =>
      recommendationsRepository.undismiss(mediaId, mediaType),
    invalidatedKeys
  );

  return {
    ...query,
    dismiss: dismissMutation.mutateAsync,
    isDismissing: dismissMutation.isPending,
    undismiss: undismissMutation.mutateAsync,
    isUndismissing: undismissMutation.isPending,
  };
}

/**
 * The exclusion set Watch Tonight/Home's recommendation sources filter
 * candidates against — same `"type:id"` key shape as
 * shared/utils/library-set.ts's own `isInLibrary`/`buildLibraryKeySet`, so
 * callers can reuse `isInLibrary(item, keySet)` directly against this set
 * too instead of a second bespoke key format.
 */
export function useDismissedRecommendationKeys(): Set<string> {
  const { data } = useDismissedRecommendations();
  return useMemo(() => new Set((data ?? []).map((item) => `${item.mediaType}:${item.mediaId}`)), [data]);
}
