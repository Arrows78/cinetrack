import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Search, UserX } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { MEDIA_GRID_CLASS_NAME } from "@/components/media/primitives/media-grid";
import { usePeopleSearch, usePopularPeople } from "@/features/media/use-discovery";
import { DEBOUNCE_MS, MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import { buildTmdbImageUrl, placeholderUrl } from "@/shared/utils/format";
import { staggerDelayMs } from "@/shared/utils/animation";
import type { PersonSummary } from "@/types/media";

// Matches MediaGrid's entrance cascade (see media-grid.tsx) so cards feel
// consistent across the app, even though person cards have a different shape.
const MAX_STAGGER_DELAY_S = 0.44;

function PersonCard({ person, index }: { person: PersonSummary; index: number }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 26,
        delay: Math.min(index * 0.05, MAX_STAGGER_DELAY_S),
      }}
    >
      <Panel asChild tone="card" className="overflow-hidden p-0 transition hover:border-primary/50">
        <Link to="/people/$personId" params={{ personId: String(person.id) }} className="block">
          {/* No rounding of its own — the parent Panel's own rounded corners
              clip it via overflow-hidden, same as MediaCard's poster, so the
              image spans the full card edge-to-edge instead of sitting
              inset within extra padding (which made person cards' posters
              render smaller than movie/series posters at the same card width). */}
          <img
            className="aspect-[2/3] w-full object-cover"
            src={buildTmdbImageUrl(person.profilePath, "w500") ?? placeholderUrl(500, 750, "Portrait")}
            alt=""
          />
          <div className="p-4">
            <h2 className="font-semibold">{person.name}</h2>
            <p className="text-sm text-muted-foreground">
              {person.knownForDepartment ?? t("people.fallbackDepartment")}
            </p>
          </div>
        </Link>
      </Panel>
    </motion.div>
  );
}

export function PeoplePage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const isSearching = debounced.trim().length >= MIN_SEARCH_QUERY_LENGTH;
  const search = usePeopleSearch(debounced);
  const popular = usePopularPeople();
  const active = isSearching ? search : popular;
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
      {!isSearching ? <h2 className="font-display text-heading-md">{t("people.popularTitle")}</h2> : null}
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
