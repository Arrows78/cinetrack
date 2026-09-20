import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { partialExport } from "@/features/backup";
import type { EpisodeProgress, MediaSummary } from "@/types/media";

/**
 * Exports just this series' tracking data (episode progress) as its own
 * small JSON file — distinct from the full-library export in Settings,
 * see partial-export.ts's own note on why it's a separate, narrower shape.
 */
export function ExportSeriesButton({
  media,
  episodeProgress,
}: {
  media: MediaSummary;
  episodeProgress: EpisodeProgress[];
}) {
  const { t } = useTranslation();

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() =>
        partialExport.exportSeries(
          { id: media.id, title: media.title, posterPath: media.posterPath ?? null },
          episodeProgress
        )
      }
    >
      <Download className="mr-2 size-4" />
      {t("series.exportSeries")}
    </Button>
  );
}
