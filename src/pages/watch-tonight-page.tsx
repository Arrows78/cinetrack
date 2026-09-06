import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch as useRouteSearch } from "@tanstack/react-router";
import { Dices, Popcorn } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/media/library/active-filter-chips";
import { AddToLibraryButton } from "@/components/media/tracking/add-to-library-button";
import { HideWatchedToggle } from "@/components/media/library/hide-watched-toggle";
import { MediaDetailsHero } from "@/components/media/detail/media-details-hero";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { ORIGIN_COUNTRIES, PLATFORMS } from "@/shared/constants/discover";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMergedGenres } from "@/features/media/use-merged-genres";
import { useWatchTonightPicks } from "@/features/watch-tonight/use-watch-tonight";
import { DEBOUNCE_MS } from "@/shared/constants/query";
import { formatRuntime } from "@/shared/utils/format";
import type { Movie, Series } from "@/types/media";

const DEFAULT_RUNTIME = "120";

const MY_SERVICES_VALUE = "mine";

// Two separate <Link> branches (rather than one with a conditional `to`) so
// each Link's `to`/`params` pair stays a matched literal — same pattern
// MediaCard uses for its own movie/series routing.
function ViewDetailsButton({ media }: { media: Movie | Series }) {
  const { t } = useTranslation();
  return media.mediaType === "movie" ? (
    <Button asChild variant="outline">
      <Link to="/movies/$movieId" params={{ movieId: String(media.id) }}>
        {t("watchTonight.viewDetails")}
      </Link>
    </Button>
  ) : (
    <Button asChild variant="outline">
      <Link to="/series/$seriesId" params={{ seriesId: String(media.id) }}>
        {t("watchTonight.viewDetails")}
      </Link>
    </Button>
  );
}

// Featuring one large pick (instead of an equal-weight grid) is the point of
// a "decide for me" feature — MediaDetailsHero renders everything else a
// hero pick needs (backdrop, title, genres) via its `actions` slot. Overview
// isn't one of them (MediaDetailsHero dropped it — see movie/series detail
// pages, which have their own separate Overview panel instead): this is the
// one surface with no such panel to fall back on, so it renders its own
// copy directly, in the same style detail pages use for theirs.
function WatchTonightHeroPick({ media }: { media: Movie | Series }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <MediaDetailsHero
        media={media}
        actions={
          <>
            <AddToLibraryButton media={media} />
            <ViewDetailsButton media={media} />
          </>
        }
      />
      <Panel tone="subtle" className="p-6">
        <p className="text-body-lg text-muted-foreground">{media.overview || t("media.noOverview")}</p>
      </Panel>
    </div>
  );
}

export function WatchTonightPage() {
  const { t } = useTranslation();
  const genres = useMergedGenres();
  const preferences = usePreferences();
  const navigate = useNavigate({ from: "/watch-tonight" });
  // Typed against watchTonightRoute's own validateSearch (router-config.tsx).
  // `seed` (the reroll driver) deliberately stays out of the URL — see that
  // schema's own comment — since a shared/reopened link should re-roll, not
  // pin the exact same pick forever.
  const routeSearch = useRouteSearch({ from: "/watch-tonight" });
  const genreId = routeSearch.genreId ?? "";
  const provider = routeSearch.provider ?? "";
  const originCountry = routeSearch.originCountry ?? "";
  // runtime=0 in the URL is the explicit "no cap" the duration chip's
  // remove action writes; an absent param is the untouched 120 default.
  // Compared numerically rather than against the literal 0 so a raw "0"
  // (anything that hands this through without zod's coercion) can't slip
  // past as a real 0-minute cap, which would filter every result away.
  const runtimeParam = routeSearch.runtime === undefined ? undefined : Number(routeSearch.runtime);
  const urlRuntime =
    runtimeParam === undefined || Number.isNaN(runtimeParam)
      ? DEFAULT_RUNTIME
      : runtimeParam <= 0
        ? ""
        : String(runtimeParam);

  const setGenreId = (value: string) =>
    void navigate({ search: (prev) => ({ ...prev, genreId: value || undefined }), replace: true });
  const setProvider = (value: string) =>
    void navigate({ search: (prev) => ({ ...prev, provider: value || undefined }), replace: true });
  const setOriginCountry = (value: string) =>
    void navigate({ search: (prev) => ({ ...prev, originCountry: value || undefined }), replace: true });

  // Runtime is a free-text number input, not an atomic select change, so it
  // needs the same "buffer locally, debounce to the URL, don't let our own
  // round-trip clobber in-progress typing" guard as SearchPage's query field
  // (search-page.tsx). The local state is the raw field text ("" = no cap);
  // toUrlRuntime maps it to the schema's three states.
  const toUrlRuntime = (value: string) => (value === DEFAULT_RUNTIME ? undefined : value === "" ? 0 : Number(value));
  const lastPushedRuntimeRef = useRef<number | undefined>(toUrlRuntime(urlRuntime));
  const [runtime, setRuntime] = useState(urlRuntime);
  const [prevUrlRuntime, setPrevUrlRuntime] = useState(urlRuntime);
  if (urlRuntime !== prevUrlRuntime) {
    setPrevUrlRuntime(urlRuntime);
    if (toUrlRuntime(urlRuntime) !== lastPushedRuntimeRef.current) setRuntime(urlRuntime);
  }
  const debouncedRuntime = useDebouncedValue(runtime, DEBOUNCE_MS);
  useEffect(() => {
    const nextRuntime = toUrlRuntime(debouncedRuntime);
    if (nextRuntime === lastPushedRuntimeRef.current) return;
    lastPushedRuntimeRef.current = nextRuntime;
    void navigate({ search: (prev) => ({ ...prev, runtime: nextRuntime }), replace: true });
  }, [debouncedRuntime, navigate]);

  const [seed, setSeed] = useState(0);
  const selectedGenre = genres.find((genre) => String(genre.id) === genreId);
  const preferredProviderIds = preferences.data?.preferredProviderIds ?? [];
  const resolvedProvider: number | number[] | undefined =
    provider === MY_SERVICES_VALUE ? preferredProviderIds : provider ? Number(provider) : undefined;
  const hideWatched = preferences.data?.hideWatchedInDiscovery ?? false;

  const query = useWatchTonightPicks(
    {
      genreMovie: selectedGenre?.movieId || undefined,
      genreSeries: selectedGenre?.seriesId || undefined,
      provider: resolvedProvider,
      // A non-positive value means "no cap", never a real 0-minute filter.
      maxRuntime: Number(runtime) > 0 ? Number(runtime) : undefined,
      hideWatched,
      originCountry: originCountry || undefined,
    },
    seed
  );

  const combined: Array<Movie | Series> = [...(query.data?.movies ?? []), ...(query.data?.series ?? [])];
  const isEmpty = combined.length === 0;
  // Deterministic on the current batch + seed (rather than a fresh random
  // draw on every render) so the featured pick doesn't jump around on
  // unrelated re-renders — it only changes when the batch itself changes or
  // the dice button bumps the seed.
  const heroIndex = combined.length ? seed % combined.length : 0;
  const hero = combined[heroIndex];
  const alternates = combined.filter((_item, index) => index !== heroIndex);

  const selectedCountry = ORIGIN_COUNTRIES.find((country) => country.code === originCountry);
  const selectedProviderLabel =
    provider === MY_SERVICES_VALUE
      ? t("watchTonight.myServices")
      : PLATFORMS.find((item) => String(item.id) === provider)?.label;

  // Only the two filters with an actual "no-op" value get a chip: genre and
  // provider are both already unselected by an empty string, but duration
  // defaults to 120 (a real, active filter) and country to "all countries" —
  // both need their own default check instead.
  const chips: ActiveFilterChip[] = [
    selectedGenre
      ? {
          key: "genre",
          label: t("filters.chips.genre", { value: t(selectedGenre.labelKey) }),
          onRemove: () => setGenreId(""),
        }
      : null,
    selectedProviderLabel
      ? {
          key: "provider",
          label: t("filters.chips.provider", { value: selectedProviderLabel }),
          onRemove: () => setProvider(""),
        }
      : null,
    // Shown for the 120-minute default too, not just an edited value: the
    // default is a real, results-shrinking cap (it quietly excludes every
    // long film), so leaving it off the chips row told the user they had no
    // filters applied when they did. Removing it clears the cap outright
    // rather than snapping back to 120 — otherwise the chip would be
    // un-removable.
    runtime
      ? {
          key: "duration",
          label: t("filters.chips.duration", { value: formatRuntime(Number(runtime)) }),
          onRemove: () => setRuntime(""),
        }
      : null,
    selectedCountry
      ? {
          key: "origin",
          label: t("filters.chips.origin", { value: t(selectedCountry.labelKey) }),
          onRemove: () => setOriginCountry(""),
        }
      : null,
  ].filter((chip): chip is ActiveFilterChip => chip !== null);
  const clearAllFilters = () => {
    setGenreId("");
    setProvider("");
    // Clears the cap rather than restoring 120 — "clear all" has to agree
    // with what removing the duration chip on its own does.
    setRuntime("");
    setOriginCountry("");
  };

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t("watchTonight.title")}
        subtitle={t("watchTonight.description")}
        icon={Dices}
        isPageTitle
      />
      <div className="flex flex-col gap-3 animate-in sm:flex-row sm:flex-wrap sm:items-end">
        <FormField label={t("watchTonight.genre")}>
          {() => (
            <Select value={genreId} onChange={(e) => setGenreId(e.target.value)}>
              <option value="">{t("watchTonight.allGenres")}</option>
              {genres.map((genre) => (
                <option key={genre.id} value={genre.id}>
                  {t(genre.labelKey)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={t("watchTonight.platform")}>
          {() => (
            <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">{t("watchTonight.allPlatforms")}</option>
              {preferredProviderIds.length > 0 ? (
                <option value={MY_SERVICES_VALUE}>{t("watchTonight.myServices")}</option>
              ) : null}
              {PLATFORMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={t("watchTonight.maxDuration")}>
          {() => (
            <Input
              size="sm"
              type="number"
              min="30"
              step="15"
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t("watchTonight.originCountry")}>
          {() => (
            <Select value={originCountry} onChange={(e) => setOriginCountry(e.target.value)}>
              <option value="">{t("watchTonight.allOriginCountries")}</option>
              {ORIGIN_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {t(country.labelKey)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button type="button" onClick={() => setSeed((value) => value + 1)}>
          <Dices className="mr-2 size-4" />
          {t("watchTonight.retry")}
        </Button>
      </div>
      <ActiveFilterChips chips={chips} onClearAll={clearAllFilters} />
      <div className="flex justify-end">
        <HideWatchedToggle />
      </div>
      {query.isPending ? <GridSkeleton count={8} /> : null}
      {query.isError ? <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {!query.isPending && !query.isError ? (
        isEmpty ? (
          <EmptyState icon={Popcorn} title={t("watchTonight.emptyTitle")} description={t("watchTonight.emptyDesc")} />
        ) : (
          <div className="space-y-6">
            {hero ? <WatchTonightHeroPick media={hero} /> : null}
            {alternates.length ? (
              <section>
                <SectionHeader title={t("watchTonight.alternatesTitle")} size="sub" headingLevel={2} />
                <MediaGrid items={alternates} listClassName="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" />
              </section>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
