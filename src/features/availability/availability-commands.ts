import { defineCommand } from "@/shared/lib/invoke";
import type { AvailabilityAlert, AvailabilitySnapshot, MediaSummary } from "@/types/media";

type AvailabilityIdentityArgs = {
  mediaId: number;
  mediaType: MediaSummary["mediaType"];
};

// `enabled` is the state the alert must be in afterwards, not a flip: a repeated
// call changes nothing (see set_availability_alert in src-tauri/src/availability).
type SetAvailabilityAlertArgs = {
  media: MediaSummary;
  region: string;
  providerIds: number[];
  enabled: boolean;
};

type RemoveAvailabilityAlertArgs = {
  id: string;
};

type GetAvailabilitySnapshotArgs = AvailabilityIdentityArgs & {
  region: string;
};

type SaveAvailabilitySnapshotArgs = {
  snapshot: AvailabilitySnapshot;
};

export const availabilityCommands = {
  listAlerts: defineCommand<undefined, AvailabilityAlert[]>("list_availability_alerts"),
  getAlert: defineCommand<AvailabilityIdentityArgs, AvailabilityAlert | null>("get_availability_alert"),
  setAlert: defineCommand<SetAvailabilityAlertArgs, AvailabilityAlert | null>("set_availability_alert"),
  removeAlert: defineCommand<RemoveAvailabilityAlertArgs, void>("remove_availability_alert"),
  getSnapshot: defineCommand<GetAvailabilitySnapshotArgs, AvailabilitySnapshot | null>("get_availability_snapshot"),
  saveSnapshot: defineCommand<SaveAvailabilitySnapshotArgs, void>("save_availability_snapshot"),
  listSnapshots: defineCommand<undefined, AvailabilitySnapshot[]>("list_availability_snapshots"),
} as const;
