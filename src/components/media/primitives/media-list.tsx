import { Virtuoso } from "react-virtuoso";
import type { MediaGridItem } from "./media-grid";
import { MediaListRow } from "./media-list-row";

// The compact-row sibling of MediaGrid — same virtualization approach
// (windowScroll, bootstrap initialItemCount) since a large library pays the
// same per-row hook cost (SeenToggle/progress) either way.
export function MediaList({ items, onEndReached }: { items: MediaGridItem[]; onEndReached?: () => void }) {
  return (
    <Virtuoso
      useWindowScroll
      data={items}
      initialItemCount={Math.min(items.length, 20)}
      computeItemKey={(_index, media) => `${media.mediaType}-${media.id}`}
      endReached={onEndReached}
      itemContent={(_index, media) => (
        <MediaListRow media={media} progress={media.progress} alreadySeen={media.alreadySeen} />
      )}
    />
  );
}
