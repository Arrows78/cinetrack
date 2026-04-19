import { motion } from "framer-motion";
import type { MediaSummary } from "@/types/media";
import { MediaCard } from "./media-card";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 200, damping: 26 },
  },
};

export function MediaGrid({ items }: { items: MediaSummary[] }) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {items.map((media) => (
        <motion.div key={`${media.mediaType}-${media.id}`} variants={item}>
          <MediaCard media={media} />
        </motion.div>
      ))}
    </motion.div>
  );
}
