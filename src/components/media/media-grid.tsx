import type { MediaSummary } from '@/types/media';
import { MediaCard } from './media-card';

export function MediaGrid({ items }: { items: MediaSummary[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((item) => (
        <MediaCard key={`${item.mediaType}-${item.id}`} media={item} />
      ))}
    </div>
  );
}
