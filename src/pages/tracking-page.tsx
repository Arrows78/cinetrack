import { useTranslation } from "react-i18next";
import { useNavigate, useSearch as useRouteSearch } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/media/library/active-filter-chips";
import { SavedFiltersBar } from "@/components/media/library/saved-filters-bar";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { TrackingList } from "@/components/media/tracking/tracking-list";
import type { TrackingFilterState, TrackingScope } from "@/types/media";

export function TrackingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/tracking" });
  // Typed against trackingRoute's own validateSearch (router-config.tsx) —
  // the /movies and /series "Upcoming" tab embeds TrackingList too, but
  // those don't own this route and keep their own local state instead (see
  // TrackingList's own scopeFilter/typeFilter/sort prop comments).
  const routeSearch = useRouteSearch({ from: "/tracking" });
  const scopeFilter = routeSearch.scope ?? "mine";
  const typeFilter = routeSearch.type ?? "all";
  const sort = routeSearch.sort ?? "date";

  // Widened to TrackingScope | "all" (not just "mine" | "all") to match
  // TrackingList's own onScopeFilterChange signature — the UI here only ever
  // offers "mine"/"all" (see trackingRoute's validateSearch), but the shared
  // component's type accommodates "discovery" too.
  const setScopeFilter = (value: TrackingScope | "all") =>
    void navigate({
      search: (prev) => ({ ...prev, scope: value === "mine" ? undefined : ("all" as const) }),
      replace: true,
    });
  const setTypeFilter = (value: typeof typeFilter) =>
    void navigate({ search: (prev) => ({ ...prev, type: value === "all" ? undefined : value }), replace: true });
  const setSort = (value: typeof sort) =>
    void navigate({ search: (prev) => ({ ...prev, sort: value === "date" ? undefined : value }), replace: true });

  const currentFilters: TrackingFilterState = { scopeFilter, typeFilter, sort };
  const applySavedFilters = (filters: TrackingFilterState) => {
    setScopeFilter(filters.scopeFilter);
    setTypeFilter(filters.typeFilter);
    setSort(filters.sort);
  };

  const chips: ActiveFilterChip[] = [
    ...(scopeFilter !== "mine"
      ? [
          {
            key: "scope",
            label: t("filters.chips.scope", { value: t("filters.all") }),
            onRemove: () => setScopeFilter("mine"),
          },
        ]
      : []),
    ...(typeFilter !== "all"
      ? [
          {
            key: "type",
            label: t("filters.chips.type", {
              value:
                typeFilter === "release"
                  ? t("tracking.typeRelease")
                  : typeFilter === "episode"
                    ? t("tracking.typeEpisode")
                    : t("tracking.typeAvailability"),
            }),
            onRemove: () => setTypeFilter("all"),
          },
        ]
      : []),
    ...(sort !== "date"
      ? [
          {
            key: "sort",
            label: t("filters.chips.sort", { value: t("tracking.sortTitle") }),
            onRemove: () => setSort("date"),
          },
        ]
      : []),
  ];
  const clearAllFilters = () => {
    setScopeFilter("mine");
    setTypeFilter("all");
    setSort("date");
  };

  return (
    <div className="space-y-8">
      <SectionHeader title={t("tracking.title")} subtitle={t("tracking.description")} icon={CalendarDays} isPageTitle />
      <div className="space-y-3">
        <SavedFiltersBar page="tracking" currentFilters={currentFilters} onApply={applySavedFilters} />
        <ActiveFilterChips chips={chips} onClearAll={clearAllFilters} />
      </div>
      <TrackingList
        scopeFilter={scopeFilter}
        onScopeFilterChange={setScopeFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        sort={sort}
        onSortChange={setSort}
      />
    </div>
  );
}
