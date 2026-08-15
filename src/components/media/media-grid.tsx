import { VirtuosoGrid } from "react-virtuoso";
import type { MediaSummary } from "@/types/media";
import { MediaCard, type MediaCardProgress } from "./media-card";

export type MediaGridItem = MediaSummary & { progress?: MediaCardProgress; alreadySeen?: boolean };

// Virtualized: only the rows near the viewport are ever mounted, so a large
// library/watchlist/search-results grid doesn't pay the DOM/render cost of
// every card at once (each MediaCard's grid quick actions run their own
// data hooks, which made this cost scale with the profile-scoped data too,
// not just poster count). useWindowScroll — the page itself scrolls (see
// AppShell; there's no separate inner scroll container) — lets Virtuoso
// track the window's scroll position instead of wrapping its own.
export function MediaGrid({ items }: { items: MediaGridItem[] }) {
  return (
    <VirtuosoGrid
      useWindowScroll
      data={items}
      // Bootstrap-only: used exclusively before Virtuoso's own
      // ResizeObserver-based measurement produces a real item count (which
      // happens almost immediately in an actual browser) — without it,
      // environments that never report real layout sizes (jsdom in tests;
      // conceivably a first paint before layout settles) render an empty
      // grid instead of a reasonable first screenful.
      initialItemCount={Math.min(items.length, 20)}
      computeItemKey={(_index, media) => `${media.mediaType}-${media.id}`}
      listClassName="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5"
      itemContent={(_index, media) => (
        <MediaCard media={media} progress={media.progress} alreadySeen={media.alreadySeen} />
      )}
    />
  );
}
