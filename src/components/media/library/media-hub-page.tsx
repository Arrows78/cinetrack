import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Shuffle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LibraryExplorer } from "@/components/media/library/library-explorer";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { useRandomLibraryItem } from "@/features/library/use-library";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import type { MediaType } from "@/types/media";

/**
 * Series and Movies pages were near-identical (title/icon/i18n keys aside) —
 * this is the one component both now render, so the two views can't drift
 * apart from each other over time the way two hand-maintained copies would.
 *
 * Used to also offer an "Upcoming" tab (TrackingList, filtered to this
 * media type) alongside "My list", but that was the same information the
 * standalone Tracking page already shows — two navigation paths to one
 * answer. Dropped in favor of Tracking being the one place for "what's
 * coming up"; this page is only ever the library view now, so there's
 * nothing left to switch between.
 */
export function MediaHubPage({
  mediaType,
  icon,
  title,
  subtitle,
  browseAllLabel,
}: {
  mediaType: MediaType;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  browseAllLabel: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const browseAll = () => void navigate({ to: "/search", search: { scope: mediaType } });
  const randomPick = useRandomLibraryItem();

  const pickRandom = () => {
    randomPick.mutate(mediaType, {
      onSuccess: (key) => {
        if (!key) {
          toast({ description: t("mediaHub.randomEmpty"), variant: "error" });
          return;
        }
        void navigate(
          key.mediaType === "movie"
            ? { to: "/movies/$movieId", params: { movieId: String(key.mediaId) } }
            : { to: "/series/$seriesId", params: { seriesId: String(key.mediaId) } }
        );
      },
      onError: (error: unknown) => {
        logger.warn(`Failed to pick a random title: ${errorMessage(error)}`);
        toast({ description: t("mediaHub.randomFailed"), variant: "error" });
      },
    });
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        isPageTitle
        action={
          <Button type="button" variant="outline" onClick={pickRandom} isLoading={randomPick.isPending}>
            <Shuffle className="mr-2 size-4" />
            {t("mediaHub.randomPick")}
          </Button>
        }
      />
      <LibraryExplorer lockedMediaType={mediaType} onBrowseAll={browseAll} browseAllLabel={browseAllLabel} />
    </div>
  );
}
