import { availabilityCommands } from "@/features/availability/availability-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { AvailabilityAlert, AvailabilitySnapshot, MediaSummary } from "@/types/media";

// The toggle/remove/snapshot writes and active-profile resolution now live
// in Rust (see src-tauri/src/availability/) — this repository is
// a thin invoke() wrapper.
export const availabilityRepository = {
  async listAlerts(): Promise<AvailabilityAlert[]> {
    return invokeTypedCommand(availabilityCommands.listAlerts);
  },

  async getAlert(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<AvailabilityAlert | null> {
    return invokeTypedCommand(availabilityCommands.getAlert, { mediaId, mediaType });
  },

  async toggle(media: MediaSummary, region: string, providerIds: number[]): Promise<AvailabilityAlert | null> {
    return invokeTypedCommand(availabilityCommands.toggleAlert, { media, region, providerIds });
  },

  async remove(id: string): Promise<void> {
    await invokeTypedCommand(availabilityCommands.removeAlert, { id });
  },

  async getSnapshot(
    mediaId: number,
    mediaType: MediaSummary["mediaType"],
    region: string
  ): Promise<AvailabilitySnapshot | null> {
    return invokeTypedCommand(availabilityCommands.getSnapshot, { mediaId, mediaType, region });
  },

  async saveSnapshot(snapshot: AvailabilitySnapshot): Promise<void> {
    await invokeTypedCommand(availabilityCommands.saveSnapshot, { snapshot });
  },

  // Every cached snapshot across every title (not profile-scoped — see
  // save_availability_snapshot's own comment on the underlying table).
  // Backs the smart-lists provider rule (see smart-list-evaluation.ts),
  // which matches a library item against whatever's already been checked
  // during normal app usage rather than issuing a fresh TMDB call per item.
  async listSnapshots(): Promise<AvailabilitySnapshot[]> {
    return invokeTypedCommand(availabilityCommands.listSnapshots);
  },
};
