import { useTranslation } from "react-i18next";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import type { MediaSummary } from "@/types/media";

function tmdbUrl(media: MediaSummary): string {
  return `https://www.themoviedb.org/${media.mediaType === "movie" ? "movie" : "tv"}/${media.id}`;
}

/**
 * Shares a title's public TMDB page — this app has no hosted page of its
 * own to link to, so that's the one URL anyone (with or without CineTrack)
 * can actually open. Uses the Web Share API where the webview exposes it
 * (a native share sheet), falling back to copying the link to the
 * clipboard — same clipboard+toast pattern as AboutSettings' "copy
 * version" action.
 */
export function ShareButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();

  const share = () => {
    const url = tmdbUrl(media);
    if (navigator.share) {
      navigator.share({ title: media.title, url }).catch((error: unknown) => {
        // AbortError just means the user closed the native share sheet
        // without picking anything — not a real failure worth surfacing.
        if (error instanceof Error && error.name === "AbortError") return;
        logger.warn(`Failed to share ${media.title}: ${errorMessage(error)}`);
        toast({ description: t("media.shareFailed"), variant: "error" });
      });
      return;
    }
    void navigator.clipboard
      .writeText(url)
      .then(() => toast({ description: t("media.shareLinkCopied"), variant: "success" }))
      .catch((error: unknown) => {
        logger.warn(`Failed to copy the share link for ${media.title}: ${errorMessage(error)}`);
        toast({ description: t("media.shareFailed"), variant: "error" });
      });
  };

  return (
    <Button type="button" variant="outline" onClick={share}>
      <Share2 className="mr-2 size-4" />
      {t("media.share")}
    </Button>
  );
}
