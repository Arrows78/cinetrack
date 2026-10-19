import { availabilityCommands } from "@/features/availability/availability-commands";
import { invokeTypedCommand } from "@/shared/lib/invoke";
import type { AvailabilityAlert, AvailabilitySnapshot, MediaSummary } from "@/types/media";

// The set/remove/snapshot writes and active-profile resolution now live
// in Rust (see src-tauri/src/availability/) — this repository is
// a thin invoke() wrapper.
export const availabilityRepository = {
  async listAlerts(): Promise<AvailabilityAlert[]> {
    return invokeTypedCommand(availabilityCommands.listAlerts);
  },

  async getAlert(mediaId: number, mediaType: MediaSummary["mediaType"]): Promise<AvailabilityAlert | null> {
    return invokeTypedCommand(availabilityCommands.getAlert, { mediaId, mediaType });
  },

  /**
   * Declares whether the title has an alert: `enabled: true` creates it (or updates its
   * region/providers), `false` removes it. Idempotent — resolves to the alert, or null once removed.
   */
  async setAlert(
    media: MediaSummary,
    region: string,
    providerIds: number[],
    enabled: boolean
  ): Promise<AvailabilityAlert | null> {
    return invokeTypedCommand(availabilityCommands.setAlert, { media, region, providerIds, enabled });
  },

  async remove(id: string): Promise<void> {
    await invokeTypedCommand(availabilityCommands.removeAlert, { id });
  },

  // No batch command exists on the Rust side — a purge is always a handful
  // of alerts (whatever's currently "available now"), so parallel individual
  // removals stay well within normal command-latency territory.
  async removeMany(ids: string[]): Promise<void> {
    await Promise.all(ids.map((id) => this.remove(id)));
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
