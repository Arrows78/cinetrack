import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Bell, BellRing, CalendarDays, Film, Trash2, Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { FilterBar } from "@/components/media/filter-bar";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { IconTooltip } from "@/components/ui/tooltip";
import { useAvailabilityAlerts } from "@/features/availability/use-availability-alerts";
import { useTracking } from "@/features/tracking/use-tracking";
import { PLATFORMS } from "@/shared/constants/discover";
import { staggerDelayMs } from "@/shared/utils/animation";
import { formatEpisodeCode, formatFullDate } from "@/shared/utils/format";
import type { TrackingEntry, TrackingEntryType, TrackingScope } from "@/types/media";

type ScopeFilter = TrackingScope | "all";
type TypeFilter = TrackingEntryType | "all";

function providerNames(providerIds: number[] = []): string[] {
  return providerIds.map((id) => PLATFORMS.find((platform) => platform.id === id)?.label ?? String(id));
}

function ReleaseTile({ entry, showScopeBadge }: { entry: TrackingEntry; showScopeBadge: boolean }) {
  const { t } = useTranslation();
  return (
    <Tile asChild className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-foreground/[0.04]">
      <Link
        to={entry.type === "episode" ? "/series/$seriesId/season/$seasonNumber" : "/movies/$movieId"}
        params={
          entry.type === "episode"
            ? { seriesId: String(entry.mediaId), seasonNumber: String(entry.seasonNumber ?? 1) }
            : { movieId: String(entry.mediaId) }
        }
      >
        {entry.type === "episode" ? (
          <Tv className="size-4 shrink-0 text-primary" />
        ) : (
          <Film className="size-4 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{entry.title}</p>
            {showScopeBadge ? (
              entry.scope === "mine" ? (
                <Badge variant="default">{t("tracking.scopeMine")}</Badge>
              ) : (
                <Badge variant="outline">{t("tracking.discoveryBadge")}</Badge>
              )
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {entry.type === "episode"
              ? `${formatEpisodeCode(entry.seasonNumber ?? 0, entry.episodeNumber ?? 0)} · ${
                  entry.episodeTitle ?? t("tracking.newEpisodeFallback")
                }`
              : t("tracking.theatricalRelease")}
          </p>
        </div>
      </Link>
    </Tile>
  );
}

function AvailabilityTile({ entry, onRemove }: { entry: TrackingEntry; onRemove: () => void }) {
  const { t } = useTranslation();
  const names = providerNames(entry.providerIds);
  return (
    <Tile className="flex items-center justify-between gap-3 p-3">
      <Link
        to={entry.mediaType === "movie" ? "/movies/$movieId" : "/series/$seriesId"}
        params={entry.mediaType === "movie" ? { movieId: String(entry.mediaId) } : { seriesId: String(entry.mediaId) }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        {entry.available ? (
          <BellRing className="size-4 shrink-0 text-primary" />
        ) : (
          <Bell className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{entry.title}</p>
            {entry.available ? <Badge variant="success">{t("tracking.availableNow")}</Badge> : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {t("tracking.region", { region: entry.region })}
            {names.length ? ` · ${names.join(", ")}` : ""}
          </p>
        </div>
      </Link>
      <IconTooltip label={t("tracking.remove", { title: entry.title })}>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("tracking.remove", { title: entry.title })}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </IconTooltip>
    </Tile>
  );
}

// Reusable across /tracking (every type) and the /movies and /series
// "Upcoming" tab (lockedMediaType pre-constrains it, same releases/episodes/
// availability filters otherwise). onBrowseAll/browseAllLabel are only set
// by the /movies and /series tab hosts, which can jump their own tab state
// to Discover — the standalone /tracking page has no such tab to jump to.
export function TrackingList({
  lockedMediaType,
  onBrowseAll,
  browseAllLabel,
}: {
  lockedMediaType?: "movie" | "series";
  onBrowseAll?: () => void;
  browseAllLabel?: string;
}) {
  const { t } = useTranslation();
  const tracking = useTracking();
  const alerts = useAvailabilityAlerts();
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("mine");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [pendingRemoval, setPendingRemoval] = useState<TrackingEntry | null>(null);

  const filtered = useMemo(
    () =>
      (tracking.data ?? []).filter(
        (entry) =>
          (scopeFilter === "all" || entry.scope === scopeFilter) &&
          (typeFilter === "all" || entry.type === typeFilter) &&
          (!lockedMediaType || entry.mediaType === lockedMediaType)
      ),
    [tracking.data, scopeFilter, typeFilter, lockedMediaType]
  );

  const availableNow = filtered.filter((entry) => entry.type === "availability" && entry.available);
  const pending = filtered.filter((entry) => entry.type === "availability" && !entry.available);
  const dated = filtered.filter((entry) => entry.type !== "availability");
  const groups = dated.reduce<Record<string, TrackingEntry[]>>((acc, entry) => {
    (acc[entry.date ?? ""] ??= []).push(entry);
    return acc;
  }, {});
  const showScopeBadge = scopeFilter === "all";
  // A movie entry is never tagged "episode" and a series entry is never
  // tagged "release" (see calendar-service.ts) — offering the other type's
  // filter here would just be a button that always empties the list.
  const typeFilterOptions: { value: TypeFilter; label: string }[] = [
    { value: "all", label: t("settings.all") },
    ...(lockedMediaType === "series" ? [] : [{ value: "release" as const, label: t("tracking.typeRelease") }]),
    ...(lockedMediaType === "movie" ? [] : [{ value: "episode" as const, label: t("tracking.typeEpisode") }]),
    { value: "availability", label: t("tracking.typeAvailability") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterBar
          value={scopeFilter}
          onChange={setScopeFilter}
          groupLabel={t("tracking.filterScope")}
          options={[
            { value: "mine", label: t("tracking.scopeMine") },
            { value: "all", label: t("settings.all") },
          ]}
        />
        <FilterBar
          value={typeFilter}
          onChange={setTypeFilter}
          groupLabel={t("tracking.filterType")}
          options={typeFilterOptions}
        />
      </div>

      {tracking.isLoading ? <LoadingState label={t("tracking.loading")} /> : null}
      {tracking.isError ? <RemoteErrorState error={tracking.error} onRetry={() => void tracking.refetch()} /> : null}

      {availableNow.length ? (
        <Panel className="animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
          <h2 className="font-semibold">{t("tracking.availableNow")}</h2>
          <div className="mt-3 grid gap-2">
            {availableNow.map((entry) => (
              <AvailabilityTile key={entry.id} entry={entry} onRemove={() => setPendingRemoval(entry)} />
            ))}
          </div>
        </Panel>
      ) : null}

      {Object.entries(groups).map(([date, entries], index) => (
        <Panel key={date} className="animate-in" style={{ animationDelay: `${staggerDelayMs(index + 2)}ms` }}>
          <h2 className="font-semibold capitalize">{formatFullDate(date)}</h2>
          <div className="mt-3 grid gap-2">
            {entries.map((entry) => (
              <ReleaseTile key={entry.id} entry={entry} showScopeBadge={showScopeBadge} />
            ))}
          </div>
        </Panel>
      ))}

      {pending.length ? (
        <Panel className="animate-in">
          <h2 className="font-semibold text-muted-foreground">{t("tracking.awaitingAvailability")}</h2>
          <div className="mt-3 grid gap-2">
            {pending.map((entry) => (
              <AvailabilityTile key={entry.id} entry={entry} onRemove={() => setPendingRemoval(entry)} />
            ))}
          </div>
        </Panel>
      ) : null}

      {!tracking.isLoading && !tracking.isError && !filtered.length ? (
        <EmptyState icon={CalendarDays} title={t("tracking.noResultsTitle")} description={t("tracking.noResults")} />
      ) : null}

      {onBrowseAll && !tracking.isLoading && !tracking.isError && filtered.length ? (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" onClick={onBrowseAll}>
            {browseAllLabel}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title={t("tracking.removeConfirmTitle", { title: pendingRemoval?.title })}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (!pendingRemoval?.alertId) return;
          void alerts.remove(pendingRemoval.alertId);
          setPendingRemoval(null);
        }}
      />
    </div>
  );
}
