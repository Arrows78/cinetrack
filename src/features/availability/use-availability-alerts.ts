import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { availabilityRepository } from "@/features/availability/availability-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { useInvalidatingMutation } from "@/shared/lib/query-mutation";
import { queryKeys } from "@/shared/constants/query-keys";
import type { AvailabilityAlert, AvailabilitySnapshot, MediaSummary } from "@/types/media";

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

export interface AlertStatus {
  alert: AvailabilityAlert;
  matchedProviderIds: number[];
  available: boolean;
}

export interface AvailabilityStatusGroups {
  /** Enabled alerts whose title is currently on at least one of the alert's own selected providers — the Today Hub's "Désormais disponible" card. */
  availableNow: AlertStatus[];
  /** Enabled alerts still waiting for a match — the Today Hub's "Alertes" card. */
  pending: AlertStatus[];
}

/**
 * Joins enabled alerts against their cached snapshot to decide whether each
 * is currently available on the alert's own provider selection — the same
 * join tracking-service.ts's availabilityEntries mapping performs privately
 * for the Tracking page's unified feed. Exported for isolated unit testing.
 */
export function computeAlertStatuses(
  alerts: AvailabilityAlert[],
  snapshots: AvailabilitySnapshot[]
): AvailabilityStatusGroups {
  const snapshotByKey = new Map(snapshots.map((snapshot) => [`${snapshot.mediaType}-${snapshot.mediaId}`, snapshot]));
  const groups: AvailabilityStatusGroups = { availableNow: [], pending: [] };

  for (const alert of alerts.filter((item) => item.enabled)) {
    const snapshot = snapshotByKey.get(`${alert.mediaType}-${alert.mediaId}`);
    const currentProviderIds = snapshot?.providerIds ?? [];
    const matchedProviderIds = alert.providerIds.length
      ? currentProviderIds.filter((id) => alert.providerIds.includes(id))
      : currentProviderIds;
    const status: AlertStatus = { alert, matchedProviderIds, available: matchedProviderIds.length > 0 };
    (status.available ? groups.availableNow : groups.pending).push(status);
  }

  return groups;
}

/** The Today Hub's "Désormais disponible" / "Alertes" cards, from one shared alert+snapshot join. */
export function useAvailabilityStatus(): AvailabilityStatusGroups & { isLoading: boolean; isError: boolean } {
  const alertsQuery = useAvailabilityAlerts();
  const snapshotsQuery = useAvailabilitySnapshots();
  const groups = useMemo(
    () => computeAlertStatuses(alertsQuery.data ?? [], snapshotsQuery.data ?? []),
    [alertsQuery.data, snapshotsQuery.data]
  );
  return {
    ...groups,
    isLoading: alertsQuery.isLoading || snapshotsQuery.isLoading,
    isError: alertsQuery.isError || snapshotsQuery.isError,
  };
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
