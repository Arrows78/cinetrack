import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, NotebookPen, Play } from "lucide-react";
import { AddWatchNoteDialog } from "@/components/media/tracking/add-watch-note-dialog";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { IconTooltip } from "@/components/ui/tooltip";
import { formatEpisodeCode } from "@/shared/utils/format";
import type { Episode } from "@/types/media";

export function NextEpisodeCard({
  episode,
  isSaving,
  onWatched,
}: {
  episode: Episode | null;
  isSaving: boolean;
  onWatched: (episode: Episode, note?: string) => void;
}) {
  const { t } = useTranslation();
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  if (!episode)
    return (
      <Panel>
        <p className="font-semibold">{t("media.upToDate")}</p>
        <p className="text-sm text-muted-foreground">{t("media.noAiredEpisode")}</p>
      </Panel>
    );
  return (
    <Panel tone="highlight">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("media.nextEpisode")}</p>
          <h3 className="mt-1 font-display text-2xl font-bold">
            {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber, { padded: true })} · {episode.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{episode.overview}</p>
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
