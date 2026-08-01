import { useTranslation } from "react-i18next";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsInWatchlist, useWatchlist } from "@/features/watchlist/use-watchlist";
import { newUuid } from "@/shared/lib/id";
import type { MediaSummary, WatchlistItem } from "@/types/media";

export function WatchlistButton({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const { data: isInWatchlist } = useIsInWatchlist(media.id, media.mediaType);
  const { addToWatchlist, removeFromWatchlist, isMutating } = useWatchlist();

  const now = new Date().toISOString();
  const payload: WatchlistItem = {
    id: newUuid(),
    mediaId: media.id,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    year: media.year,
    rating: media.rating,
    createdAt: now,
    updatedAt: now,
  };

  const toggle = async () => {
    if (isInWatchlist) {
      await removeFromWatchlist({ mediaId: media.id, mediaType: media.mediaType });
      return;
    }

    await addToWatchlist(payload);
  };

  return (
    <Button variant={isInWatchlist ? "secondary" : "default"} onClick={() => void toggle()} disabled={isMutating}>
      {isInWatchlist ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {isInWatchlist ? t("media.inWatchlist") : t("media.addToWatchlist")}
    </Button>
  );
}
