import { useTranslation } from "react-i18next";
import { NotebookText } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { useViewingEventsForMedia } from "@/features/progress/use-progress";
import { formatFullDate } from "@/shared/utils/format";
import type { MediaType } from "@/types/media";

// A title's watch diary: every past watch that got a note attached at the
// moment it was marked watched, most recent first (list_viewing_events_for_media
// already orders it that way — see stats.rs). Entries with no note are
// skipped rather than shown blank; an "unwatched" rollback event never
// carries a note (see toggle_movie_seen_with_note_impl/
// apply_episodes_and_log_impl), so filtering to `eventType === "watched"`
// is enough to exclude those too. Renders nothing at all when there's
// nothing to show, rather than an empty-state panel — this is a secondary,
// below-the-fold section, not a page a user navigates to specifically to
// see their notes.
export function WatchHistoryPanel({ mediaId, mediaType }: { mediaId: number; mediaType: MediaType }) {
  const { t } = useTranslation();
  const eventsQuery = useViewingEventsForMedia(mediaId, mediaType);

  if (eventsQuery.isError) {
    return (
      <PartialErrorState message={t("media.watchHistoryUnavailable")} onRetry={() => void eventsQuery.refetch()} />
    );
  }

  const notedEvents = (eventsQuery.data ?? []).filter((event) => event.eventType === "watched" && event.note);
  if (!notedEvents.length) return null;

  return (
    <Panel tone="subtle" className="p-6">
      <div className="flex items-center gap-2">
        <NotebookText className="size-4 text-primary" />
        <h2 className="font-semibold">{t("media.watchHistoryTitle")}</h2>
      </div>
      <ul className="mt-4 space-y-4">
        {notedEvents.map((event) => (
          <li key={event.id} className="border-l-2 border-border pl-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {formatFullDate(event.watchedAt)}
            </p>
            <p className="mt-1 font-serif text-base leading-6 text-foreground">{event.note}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
