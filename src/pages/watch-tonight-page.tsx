import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Dices, Popcorn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { MediaGrid } from "@/components/media/media-grid";
import { EmptyState } from "@/components/states/empty-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { PLATFORMS } from "@/shared/constants/discover";
import { queryKeys } from "@/shared/constants/query-keys";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { useMergedGenres } from "@/features/media/use-merged-genres";
import { watchTonightService } from "@/features/watch-tonight/watch-tonight-service";
import { staggerDelayMs } from "@/shared/utils/animation";

export function WatchTonightPage() {
  const { t } = useTranslation();
  const profileId = useActiveProfileId();
  const genres = useMergedGenres();
  const [genreId, setGenreId] = useState("");
  const [provider, setProvider] = useState("");
  const [runtime, setRuntime] = useState("120");
  const [seed, setSeed] = useState(0);
  const selectedGenre = genres.find((genre) => String(genre.id) === genreId);
  const query = useQuery({
    queryKey: [...queryKeys.local.watchTonight(profileId), genreId, provider, runtime, seed],
    queryFn: () =>
      watchTonightService.pick({
        genreMovie: selectedGenre?.movieId || undefined,
        genreSeries: selectedGenre?.seriesId || undefined,
        provider: provider ? Number(provider) : undefined,
        maxRuntime: runtime ? Number(runtime) : undefined,
      }),
  });
  const isEmpty = !query.data?.movies.length && !query.data?.series.length;

  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-3xl font-bold">{t("watchTonight.title")}</h1>
        <p className="text-muted-foreground">{t("watchTonight.description")}</p>
      </header>
      <Panel className="grid gap-3 md:grid-cols-4 animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
        <Select aria-label={t("watchTonight.genre")} value={genreId} onChange={(e) => setGenreId(e.target.value)}>
          <option value="">{t("watchTonight.allGenres")}</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {t(genre.labelKey)}
            </option>
          ))}
        </Select>
        <Select aria-label={t("watchTonight.platform")} value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">{t("watchTonight.allPlatforms")}</option>
          {PLATFORMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </Select>
        <Input
          size="sm"
          type="number"
          min="30"
          step="15"
          value={runtime}
          onChange={(e) => setRuntime(e.target.value)}
          aria-label={t("watchTonight.maxDuration")}
        />
        <Button type="button" onClick={() => setSeed((value) => value + 1)}>
          <Dices className="mr-2 size-4" />
          {t("watchTonight.retry")}
        </Button>
      </Panel>
      {query.isLoading ? <GridSkeleton count={8} /> : null}
      {query.isError ? <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError ? (
        isEmpty ? (
          <EmptyState icon={Popcorn} title={t("watchTonight.emptyTitle")} description={t("watchTonight.emptyDesc")} />
        ) : (
          <div className="space-y-6">
            {query.data?.movies.length ? (
              <section>
                <h2 className="mb-3 font-semibold">{t("nav.movies")}</h2>
                <MediaGrid items={query.data.movies} listClassName="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" />
              </section>
            ) : null}
            {query.data?.series.length ? (
              <section>
                <h2 className="mb-3 font-semibold">{t("nav.series")}</h2>
                <MediaGrid items={query.data.series} listClassName="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" />
              </section>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
