import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MEDIA_POSTER_OVERLAY_CLASSNAME, MEDIA_POSTER_SCRIM } from "@/shared/constants/decorative-gradients";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import type { PersonSummary } from "@/types/media";
import fallbackPortrait from "@/assets/person-placeholder.svg";

// Matches MediaGrid's entrance cascade (see media-grid.tsx) so cards feel
// consistent across the app, even though person cards have a different shape.
const MAX_STAGGER_DELAY_S = 0.44;

// Same poster-fills-the-card, name-overlaid-at-the-bottom treatment as
// MediaCard (media-card.tsx) — a separate caption block below the poster
// used to make person cards taller than movie/series cards at the same grid
// column width, for no product reason. Shared between the People page and
// the global search page's "person" scope, rather than each keeping its own
// copy.
export function PersonCard({ person, index }: { person: PersonSummary; index: number }) {
  const { t } = useTranslation();
  return (
    <motion.div
      className="group"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 26,
        delay: Math.min(index * 0.05, MAX_STAGGER_DELAY_S),
      }}
    >
      <Link
        to="/people/$personId"
        params={{ personId: String(person.id) }}
        className="block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[2/3] overflow-hidden rounded-card">
          <img
            src={buildTmdbImageUrl(person.profilePath, "w500") ?? fallbackPortrait}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-slower ease-out group-hover:scale-[1.07]"
          />
          <div className="absolute inset-0" style={{ background: MEDIA_POSTER_SCRIM }} />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <p
              className={cn(
                "font-display line-clamp-2 text-heading-xs font-bold leading-tight md:text-heading-sm",
                MEDIA_POSTER_OVERLAY_CLASSNAME.titleText
              )}
            >
              {person.name}
            </p>
            <p className={cn("mt-1.5 truncate text-caption font-medium", MEDIA_POSTER_OVERLAY_CLASSNAME.captionText)}>
              {person.knownForDepartment ?? t("people.fallbackDepartment")}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
