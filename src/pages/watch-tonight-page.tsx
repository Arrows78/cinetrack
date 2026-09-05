import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Dices, Popcorn } from "lucide-react";
import { AddToLibraryButton } from "@/components/media/tracking/add-to-library-button";
import { HideWatchedToggle } from "@/components/media/library/hide-watched-toggle";
import { MediaDetailsHero } from "@/components/media/detail/media-details-hero";
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
import { useMergedGenres } from "@/features/media/use-merged-genres";
import { useWatchTonightPicks } from "@/features/watch-tonight/use-watch-tonight";
import { staggerDelayMs } from "@/shared/utils/animation";
import type { Movie, Series } from "@/types/media";

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
        <p className="font-serif text-base leading-7 text-muted-foreground">
          {media.overview || t("media.noOverview")}
        </p>
      </Panel>
    </div>
  );
}

export function WatchTonightPage() {
  const { t } = useTranslation();
  const genres = useMergedGenres();
  const preferences = usePreferences();
  const [genreId, setGenreId] = useState("");
  const [provider, setProvider] = useState("");
  const [runtime, setRuntime] = useState("120");
  const [originCountry, setOriginCountry] = useState("");
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
      maxRuntime: runtime ? Number(runtime) : undefined,
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

  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-page-title">{t("watchTonight.title")}</h1>
        <p className="text-muted-foreground">{t("watchTonight.description")}</p>
      </header>
      <Panel className="grid gap-3 md:grid-cols-5 animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
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
        <Button type="button" className="self-end" onClick={() => setSeed((value) => value + 1)}>
          <Dices className="mr-2 size-4" />
          {t("watchTonight.retry")}
        </Button>
      </Panel>
      <div className="flex justify-end">
        <HideWatchedToggle />
      </div>
      {query.isLoading ? <GridSkeleton count={8} /> : null}
      {query.isError ? <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError ? (
        isEmpty ? (
          <EmptyState icon={Popcorn} title={t("watchTonight.emptyTitle")} description={t("watchTonight.emptyDesc")} />
        ) : (
          <div className="space-y-6">
            {hero ? <WatchTonightHeroPick media={hero} /> : null}
            {alternates.length ? (
              <section>
                <h2 className="mb-3 font-semibold">{t("watchTonight.alternatesTitle")}</h2>
                <MediaGrid items={alternates} listClassName="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" />
              </section>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
