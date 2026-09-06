import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Users, UserX } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { FilterBar } from "@/components/media/library/filter-bar";
import { SearchBar } from "@/components/media/primitives/search-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { MEDIA_GRID_CLASS_NAME } from "@/components/media/primitives/media-grid";
import { usePeopleSearch, usePopularPeople, useTrendingPeople } from "@/features/media/use-discovery";
import { DEBOUNCE_MS, MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import { MEDIA_POSTER_OVERLAY_CLASSNAME, MEDIA_POSTER_SCRIM } from "@/shared/constants/decorative-gradients";
import { cn } from "@/shared/lib/cn";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";
import type { PersonSummary } from "@/types/media";
import fallbackPortrait from "@/assets/person-placeholder.svg";

// Matches MediaGrid's entrance cascade (see media-grid.tsx) so cards feel
// consistent across the app, even though person cards have a different shape.
const MAX_STAGGER_DELAY_S = 0.44;

// Same poster-fills-the-card, name-overlaid-at-the-bottom treatment as
// MediaCard (media-card.tsx) — a separate caption block below the poster
// used to make person cards taller than movie/series cards at the same grid
// column width, for no product reason.
function PersonCard({ person, index }: { person: PersonSummary; index: number }) {
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

type BrowseMode = "popular" | "trending";

export function PeoplePage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<BrowseMode>("popular");
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const isSearching = debounced.trim().length >= MIN_SEARCH_QUERY_LENGTH;
  const search = usePeopleSearch(debounced);
  const popular = usePopularPeople();
  const trending = useTrendingPeople();
  const browsing = mode === "trending" ? trending : popular;
  const active = isSearching ? search : browsing;
  const results = active.data?.results ?? [];
  const showEmpty = isSearching && !active.isPending && !active.isError && results.length === 0;

  return (
    <div className="space-y-8">
      <SectionHeader title={t("people.title")} subtitle={t("people.description")} icon={Users} isPageTitle />
      <div className="animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
        <div className="w-full sm:w-64">
          <SearchBar value={query} onChange={setQuery} placeholder={t("people.searchPlaceholder")} />
        </div>
      </div>
      {!isSearching ? (
        <SectionHeader
          title={mode === "trending" ? t("people.trendingTitle") : t("people.popularTitle")}
          action={
            <FilterBar
              value={mode}
              onChange={setMode}
              groupLabel={t("people.browseModeLabel")}
              options={[
                { value: "popular", label: t("people.popularTitle") },
                { value: "trending", label: t("people.trendingTitle") },
              ]}
            />
          }
        />
      ) : null}
      {active.isPending ? <GridSkeleton count={8} /> : null}
      {active.isError ? <RemoteErrorState error={active.error} onRetry={() => void active.refetch()} /> : null}
      {showEmpty ? (
        <EmptyState icon={UserX} title={t("people.noResultsTitle")} description={t("people.noResultsDescription")} />
      ) : null}
      <div className={MEDIA_GRID_CLASS_NAME}>
        {!active.isPending && !active.isError
          ? results.map((person, index) => <PersonCard key={person.id} person={person} index={index} />)
          : null}
      </div>
    </div>
  );
}
