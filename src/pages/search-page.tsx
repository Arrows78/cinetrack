import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouterState } from "@tanstack/react-router";
import { Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { FilterBar } from "@/components/media/filter-bar";
import { MediaGrid } from "@/components/media/media-grid";
import { SearchBar } from "@/components/media/search-bar";
import { SectionHeader } from "@/components/media/section-header";
import { usePreferences } from "@/hooks/use-local-media";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSearch as useSearchHook } from "@/hooks/use-search";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import type { MediaSummary } from "@/types/media";

const ALL_GENRES = [...GENRES.movies, ...GENRES.series];

const getGenreName = (id: string | undefined) => {
  if (!id) return null;
  return ALL_GENRES.find((genre) => String(genre.id) === id)?.label ?? id;
};

const getPlatformName = (id: string) => {
  return PLATFORMS.find((platform) => String(platform.id) === id)?.label ?? id;
};

export function SearchPage() {
  const { t } = useTranslation();
  const { data: preferences } = usePreferences();

  // Get params from URL
  const location = useRouterState({ select: (state) => state.location });
  const searchParams = new URLSearchParams(location.search);
  const genreMovie = searchParams.get("genreMovie") || undefined;
  const genreSeries = searchParams.get("genreSeries") || undefined;
  const provider = searchParams.get("provider") || undefined;
  const urlQuery = searchParams.get("q") || "";
  const urlScope = searchParams.get("scope") as "all" | "movie" | "series" | null;

  const [localQuery, setLocalQuery] = useState(urlQuery);
  const [selectedScope, setSelectedScope] = useState<"all" | "movie" | "series" | null>(urlScope);
  const scope = selectedScope ?? preferences?.defaultSearchType ?? "all";

  // Use localQuery if typed in, else URL query, else empty
  const query = localQuery || "";
  const debouncedQuery = useDebouncedValue(query, 350);

  // Use discover for genre/provider, or regular search
  const searchQuery = useSearchHook(debouncedQuery, scope, { genreMovie, genreSeries, provider });

  const hasFilters = genreMovie || genreSeries || provider;
  const showResults = hasFilters || debouncedQuery.trim().length >= 2;

  const grouped = useMemo(() => {
    const items = searchQuery.data ?? [];
    return {
      movies: items.filter((item) => item.mediaType === "movie"),
      series: items.filter((item) => item.mediaType === "series"),
    };
  }, [searchQuery.data]);

  // Build title based on filters
  const filterTitle = hasFilters
    ? [
        genreMovie ? getGenreName(genreMovie) : null,
        genreSeries ? getGenreName(genreSeries) : null,
        provider ? getPlatformName(provider) : null,
      ]
        .filter(Boolean)
        .join(" • ")
    : debouncedQuery;

  return (
    <div className="space-y-10">
      {/* Search controls */}
      <div className="space-y-5">
        <SectionHeader
          title={t("search.globalSearch")}
          subtitle={hasFilters ? t("search.showingResults", { filters: filterTitle }) : t("search.subtitle")}
          index={1}
        />
        <div className="space-y-3">
          <SearchBar value={query} onChange={setLocalQuery} />
          <FilterBar
            value={scope}
            onChange={setSelectedScope}
            options={[
              { value: "all", label: t("settings.all") },
              { value: "series", label: t("nav.series") },
              { value: "movie", label: t("nav.movies") },
            ]}
          />
        </div>
      </div>

      {searchQuery.isLoading ? <GridSkeleton count={8} /> : null}

      {!showResults && !hasFilters ? (
        <EmptyState icon={Search} title={t("search.startTyping")} description={t("search.startTypingDesc")} />
      ) : null}

      {showResults && !searchQuery.isLoading && !searchQuery.data?.length ? (
        <EmptyState icon={SearchX} title={t("pages.noResults")} description={t("search.noResultsDesc")} />
      ) : null}

      {scope === "all" && grouped.series.length > 0 ? (
        <section>
          <SectionHeader
            title={t("nav.series")}
            subtitle={t("search.resultsCount", { count: grouped.series.length })}
            index={2}
          />
          <MediaGrid items={grouped.series as MediaSummary[]} />
        </section>
      ) : null}

      {scope === "all" && grouped.movies.length > 0 ? (
        <section>
          <SectionHeader
            title={t("nav.movies")}
            subtitle={t("search.resultsCount", { count: grouped.movies.length })}
            index={scope === "all" && grouped.series.length > 0 ? 3 : 2}
          />
          <MediaGrid items={grouped.movies as MediaSummary[]} />
        </section>
      ) : null}

      {scope !== "all" && searchQuery.data?.length ? <MediaGrid items={searchQuery.data} /> : null}
    </div>
  );
}
