import { motion } from "framer-motion";
import type { MediaSummary } from "@/types/media";
import { MediaCard, type MediaCardProgress } from "./media-card";

export type MediaGridItem = MediaSummary & { progress?: MediaCardProgress };

// Cap the entrance cascade: with an uncapped stagger a 100-item grid kept
// its last cards invisible for over five seconds. Items past the first two
// rows all share the max delay.
const MAX_STAGGER_DELAY_S = 0.44;

export function MediaGrid({ items }: { items: MediaGridItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
      {items.map((media, index) => (
        <motion.div
          key={`${media.mediaType}-${media.id}`}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 26,
            delay: Math.min(index * 0.05, MAX_STAGGER_DELAY_S),
          }}
          // Skip layout/paint for offscreen cards on long infinite-scroll
          // grids; the intrinsic size approximates a poster cell so the
          // scrollbar stays stable.
          className="[contain-intrinsic-size:auto_380px] [content-visibility:auto]"
        >
          <MediaCard media={media} progress={media.progress} />
        </motion.div>
      ))}
    </div>
  );
}
