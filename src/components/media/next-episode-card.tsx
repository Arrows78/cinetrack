import { useTranslation } from "react-i18next";
import { CheckCircle2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Episode } from "@/types/media";

export function NextEpisodeCard({ episode, isSaving, onWatched }: { episode: Episode | null; isSaving: boolean; onWatched: (episode: Episode) => void }) {
  const { t } = useTranslation();
  if (!episode) return <div className="rounded-3xl border border-border bg-card/60 p-5"><p className="font-semibold">{t("media.upToDate")}</p><p className="text-sm text-muted-foreground">{t("media.noAiredEpisode")}</p></div>;
  return (
    <div className="rounded-3xl border border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("media.nextEpisode")}</p><h3 className="mt-1 font-display text-2xl font-bold">S{episode.seasonNumber.toString().padStart(2,"0")}E{episode.episodeNumber.toString().padStart(2,"0")} · {episode.title}</h3><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{episode.overview}</p></div>
        <Play className="size-6 text-primary" />
      </div>
      <Button className="mt-4" type="button" disabled={isSaving} onClick={() => onWatched(episode)}><CheckCircle2 className="mr-2 size-4" />{t("media.markAsSeen")}</Button>
    </div>
  );
}
