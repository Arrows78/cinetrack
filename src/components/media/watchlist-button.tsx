import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsInWatchlist, useWatchlist } from '@/hooks/use-local-media';
import { historyRepository } from '@/services/local/history-repository';
import { queryKeys } from '@/shared/constants/query-keys';
import type { MediaSummary, WatchlistItem } from '@/types/media';

export function WatchlistButton({ media }: { media: MediaSummary }) {
  const queryClient = useQueryClient();
  const { data: isInWatchlist } = useIsInWatchlist(media.id, media.mediaType);
  const { addToWatchlist, removeFromWatchlist, isMutating } = useWatchlist();

  const payload: WatchlistItem = {
    mediaId: media.id,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.posterPath,
    backdropPath: media.backdropPath,
    year: media.year,
    rating: media.rating,
    createdAt: new Date().toISOString(),
  };

  const toggle = async () => {
    const timestamp = new Date().toISOString();

    if (isInWatchlist) {
      await removeFromWatchlist({ mediaId: media.id, mediaType: media.mediaType });
      await historyRepository.add({
        id: `${Date.now()}-watchlist-remove`,
        mediaId: media.id,
        mediaType: media.mediaType,
        title: media.title,
        action: 'watchlist:remove',
        timestamp,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.local.history });
      return;
    }

    await addToWatchlist(payload);
    await historyRepository.add({
      id: `${Date.now()}-watchlist-add`,
      mediaId: media.id,
      mediaType: media.mediaType,
      title: media.title,
      action: 'watchlist:add',
      timestamp,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.local.history });
  };

  return (
    <Button variant={isInWatchlist ? 'secondary' : 'default'} onClick={toggle} disabled={isMutating}>
      {isInWatchlist ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
      {isInWatchlist ? 'Dans la watchlist' : 'Ajouter à la watchlist'}
    </Button>
  );
}
