import { invokeCommand } from "@/shared/lib/invoke";
import type { AvailabilityAlert, AvailabilitySnapshot, MediaSummary } from "@/types/media";

// The toggle/remove/snapshot writes and active-profile resolution now live
// in Rust (see src-tauri/src/commands/availability.rs) — this repository is
// a thin invoke() wrapper.
export const availabilityRepository = {
  async listAlerts(): Promise<AvailabilityAlert[]> {
    return invokeCommand<AvailabilityAlert[]>("list_availability_alerts");
  },

  async getAlert(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<AvailabilityAlert | null> {
    return invokeCommand<AvailabilityAlert | null>("get_availability_alert", { mediaId, mediaType });
  },

  async toggle(media: MediaSummary, region: string, providerIds: number[]): Promise<AvailabilityAlert | null> {
    return invokeCommand<AvailabilityAlert | null>("toggle_availability_alert", { media, region, providerIds });
  },

  async remove(id: string): Promise<void> {
    await invokeCommand<void>("remove_availability_alert", { id });
  },

  async getSnapshot(
    mediaId: number,
    mediaType: MediaSummary["mediaType"],
    region: string
  ): Promise<AvailabilitySnapshot | null> {
    return invokeCommand<AvailabilitySnapshot | null>("get_availability_snapshot", { mediaId, mediaType, region });
  },

  async saveSnapshot(snapshot: AvailabilitySnapshot): Promise<void> {
    await invokeCommand<void>("save_availability_snapshot", { snapshot });
  },
};
