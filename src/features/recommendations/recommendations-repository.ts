import { invokeTypedCommand } from "@/shared/lib/invoke";
import { recommendationsCommands, type DismissMediaInput } from "@/features/recommendations/recommendations-commands";
import type { DismissedRecommendation, MediaType } from "@/types/media";

// "Pas intéressé" — a title dismissed here is excluded from Watch Tonight's
// candidate pool and the Home page's recommendation rails (see
// watch-tonight-service.ts's filterHiddenIfWatchedByKeySet for the existing
// pattern this reuses). Local table, but synced across devices (see
// docs/database-schema.md's dismissed_recommendations entry) — unlike
// episode ratings, a "never show me this again" choice is something a user
// expects to follow them to their other devices. Planning the title in the
// library afterwards lifts the dismissal (see upsert_impl in
// src-tauri/src/library/repository.rs): the latest intent wins.
export const recommendationsRepository = {
  async listDismissed(): Promise<DismissedRecommendation[]> {
    return invokeTypedCommand(recommendationsCommands.list);
  },

  async dismiss(media: DismissMediaInput): Promise<void> {
    await invokeTypedCommand(recommendationsCommands.dismiss, { media });
  },

  async undismiss(mediaId: number, mediaType: MediaType): Promise<void> {
    await invokeTypedCommand(recommendationsCommands.undismiss, { mediaId, mediaType });
  },
};
