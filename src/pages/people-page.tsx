import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch as useRouteSearch } from "@tanstack/react-router";
import { Users, UserX } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { FilterBar } from "@/components/media/library/filter-bar";
import { SearchBar } from "@/components/media/primitives/search-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { MEDIA_GRID_CLASS_NAME } from "@/components/media/primitives/media-grid";
import { PersonCard } from "@/components/media/primitives/person-card";
import { usePeopleSearch, usePopularPeople, useTrendingPeople } from "@/features/media/use-discovery";
import { DEBOUNCE_MS, MIN_SEARCH_QUERY_LENGTH } from "@/shared/constants/query";
import { staggerDelayMs } from "@/shared/utils/animation";

type BrowseMode = "popular" | "trending";
type DepartmentFilter = "all" | "Acting" | "Directing" | "Writing";

export function PeoplePage() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/people" });
  // Typed against peopleRoute's own validateSearch (router-config.tsx). Same
  // "don't clobber what the user is typing with our own round-trip" guards
  // as SearchPage's urlQuery/urlScope handling — see search-page.tsx.
  const routeSearch = useRouteSearch({ from: "/people" });
  const urlQuery = routeSearch.q ?? "";
  const urlMode = routeSearch.mode ?? "popular";
  const lastPushedQueryRef = useRef<string | undefined>(urlQuery || undefined);

  const [query, setQuery] = useState(urlQuery);
  const [prevUrlQuery, setPrevUrlQuery] = useState(urlQuery);
  if (urlQuery !== prevUrlQuery) {
    setPrevUrlQuery(urlQuery);
    if ((urlQuery || undefined) !== lastPushedQueryRef.current) setQuery(urlQuery);
  }

  const mode = urlMode;
  const setMode = (value: BrowseMode) =>
    void navigate({ search: (prev) => ({ ...prev, mode: value === "popular" ? undefined : value }), replace: true });

  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  useEffect(() => {
    const nextQuery = debounced || undefined;
    if (nextQuery === lastPushedQueryRef.current) return;
    lastPushedQueryRef.current = nextQuery;
    void navigate({ search: (prev) => ({ ...prev, q: nextQuery }), replace: true });
  }, [debounced, navigate]);
  const isSearching = debounced.trim().length >= MIN_SEARCH_QUERY_LENGTH;
  const search = usePeopleSearch(debounced);
  const popular = usePopularPeople();
  const trending = useTrendingPeople();
  const browsing = mode === "trending" ? trending : popular;
  const active = isSearching ? search : browsing;
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>("all");
  const allResults = active.data?.results ?? [];
  const results =
    departmentFilter === "all"
      ? allResults
      : allResults.filter((person) => person.knownForDepartment === departmentFilter);
  const isSettled = !active.isPending && !active.isError;
  // Two distinct "nothing to show" reasons: the search itself came back
  // empty (unrelated to the department filter), or the department filter
  // narrowed otherwise-real results down to none.
  const showEmpty =
    isSettled && ((isSearching && allResults.length === 0) || (allResults.length > 0 && results.length === 0));

  return (
    <div className="space-y-8">
      <SectionHeader title={t("people.title")} subtitle={t("people.description")} icon={Users} isPageTitle />
      <div
        className="flex flex-col gap-3 animate-in sm:flex-row sm:flex-wrap sm:items-center"
        style={{ animationDelay: `${staggerDelayMs(1)}ms` }}
      >
        <div className="w-full sm:w-64">
          <SearchBar value={query} onChange={setQuery} placeholder={t("people.searchPlaceholder")} />
        </div>
        <FilterBar
          value={departmentFilter}
          onChange={setDepartmentFilter}
          groupLabel={t("people.filterDepartment")}
          options={[
            { value: "all", label: t("filters.all") },
            { value: "Acting", label: t("people.departmentActing") },
            { value: "Directing", label: t("people.departmentDirecting") },
            { value: "Writing", label: t("people.departmentWriting") },
          ]}
        />
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
