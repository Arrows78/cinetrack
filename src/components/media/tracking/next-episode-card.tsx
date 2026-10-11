import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, NotebookPen, Play } from "lucide-react";
import { AddWatchNoteDialog } from "@/components/media/tracking/add-watch-note-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { IconTooltip } from "@/components/ui/tooltip";
import { useSpoilerProtection } from "@/components/media/tracking/use-spoiler-protection";
import { formatEpisodeCode, formatEpisodeTitle, formatRelativeCountdown } from "@/shared/utils/format";
import type { Episode } from "@/types/media";

export function NextEpisodeCard({
  episode,
  emptyReason = "caughtUp",
  isSaving,
  onWatched,
}: {
  episode: Episode | null;
  // Why there is no episode to offer: the viewer has watched everything that
  // aired ("caughtUp"), or nothing has aired at all yet ("nothingAired") —
  // "all up to date" would be wrong for a series nobody could have started.
  emptyReason?: "caughtUp" | "nothingAired";
  isSaving: boolean;
  onWatched: (episode: Episode, note?: string) => void;
}) {
  const { t } = useTranslation();
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const spoilerProtection = useSpoilerProtection();
  // Reveal is per episode: moving on to the next one hides it again.
  const [revealedEpisodeId, setRevealedEpisodeId] = useState<number | null>(null);
  if (!episode)
    return (
      <Panel>
        <p className="font-semibold">
          {emptyReason === "nothingAired" ? t("media.nothingAiredTitle") : t("media.upToDate")}
        </p>
        <p className="text-body-sm text-muted-foreground">
          {emptyReason === "nothingAired" ? t("media.nothingAiredDescription") : t("media.noAiredEpisode")}
        </p>
      </Panel>
    );
  // This is by definition an episode not watched yet: with the protection on,
  // its title and synopsis are what would spoil it.
  const hidden = spoilerProtection && revealedEpisodeId !== episode.id;
  return (
    <Panel tone="highlight">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-caption font-semibold uppercase tracking-wider text-primary">{t("media.nextEpisode")}</p>
            {episode.airDate ? <Badge variant="secondary">{formatRelativeCountdown(episode.airDate)}</Badge> : null}
          </div>
          <h3 className="mt-1 line-clamp-2 font-display text-heading-lg font-bold">
            {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber, { padded: true })} ·{" "}
            {hidden ? t("media.hiddenTitle") : formatEpisodeTitle(episode.title, episode.episodeNumber)}
          </h3>
          {hidden ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-body-sm text-muted-foreground">{t("media.hiddenOverview")}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRevealedEpisodeId(episode.id)}>
                {t("media.revealSpoilers")}
              </Button>
            </div>
          ) : (
            <p className="mt-2 line-clamp-2 text-body-sm text-muted-foreground">{episode.overview}</p>
          )}
        </div>
        <Play className="size-6 text-primary" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" isLoading={isSaving} disabled={isSaving} onClick={() => onWatched(episode)}>
          <CheckCircle2 className="mr-2 size-4" />
          {t("media.markAsSeen")}
        </Button>
        <IconTooltip label={t("media.addWatchNoteAction")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("media.addWatchNoteAction")}
            disabled={isSaving}
            onClick={() => setNoteDialogOpen(true)}
          >
            <NotebookPen className="size-4" />
          </Button>
        </IconTooltip>
      </div>
      <AddWatchNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        onConfirm={(note) => {
          setNoteDialogOpen(false);
          onWatched(episode, note || undefined);
        }}
      />
    </Panel>
  );
}
