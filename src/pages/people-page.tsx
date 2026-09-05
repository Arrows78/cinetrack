import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, UserX } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Panel } from "@/components/ui/panel";
import { FilterBar } from "@/components/media/library/filter-bar";
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
            <p className="font-display line-clamp-2 text-base font-bold leading-tight text-card-foreground md:text-lg transition-all duration-base group-hover:text-primary/90">
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
  const showEmpty = isSearching && !active.isLoading && !active.isError && results.length === 0;

  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-page-title">{t("people.title")}</h1>
        <p className="text-muted-foreground">{t("people.description")}</p>
      </header>
      <Panel asChild tone="card" className="flex items-center gap-2 px-4 py-0 animate-in">
        <label style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
          <Search className="size-4 text-muted-foreground" />
          <input
            className="h-12 flex-1 rounded-lg bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("people.searchPlaceholder")}
            aria-label={t("people.searchPlaceholder")}
          />
        </label>
      </Panel>
      {!isSearching ? (
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-heading-md">
            {mode === "trending" ? t("people.trendingTitle") : t("people.popularTitle")}
          </h2>
          <FilterBar
            value={mode}
            onChange={setMode}
            groupLabel={t("people.browseModeLabel")}
            options={[
              { value: "popular", label: t("people.popularTitle") },
              { value: "trending", label: t("people.trendingTitle") },
            ]}
          />
        </div>
      ) : null}
      {active.isLoading ? <GridSkeleton count={8} /> : null}
      {active.isError ? <RemoteErrorState error={active.error} onRetry={() => void active.refetch()} /> : null}
      {showEmpty ? (
        <EmptyState icon={UserX} title={t("people.noResultsTitle")} description={t("people.noResultsDescription")} />
      ) : null}
      <div className={MEDIA_GRID_CLASS_NAME}>
        {!active.isLoading && !active.isError
          ? results.map((person, index) => <PersonCard key={person.id} person={person} index={index} />)
          : null}
      </div>
    </div>
  );
}
