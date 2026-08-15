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
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import { queryKeys } from "@/shared/constants/query-keys";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { watchTonightService } from "@/features/watch-tonight/watch-tonight-service";
import { staggerDelayMs } from "@/shared/utils/animation";
export function WatchTonightPage() {
  const { t } = useTranslation();
  const profileId = useActiveProfileId();
  const [genre, setGenre] = useState("");
  const [provider, setProvider] = useState("");
  const [runtime, setRuntime] = useState("120");
  const [seed, setSeed] = useState(0);
  const query = useQuery({
    queryKey: [...queryKeys.local.watchTonight(profileId), genre, provider, runtime, seed],
    queryFn: () =>
      watchTonightService.pick({
        genre: genre ? Number(genre) : undefined,
        provider: provider ? Number(provider) : undefined,
        maxRuntime: runtime ? Number(runtime) : undefined,
      }),
  });
  return (
    <div className="space-y-6">
      <header className="animate-in" style={{ animationDelay: `${staggerDelayMs(0)}ms` }}>
        <h1 className="font-display text-3xl font-bold">{t("watchTonight.title")}</h1>
        <p className="text-muted-foreground">{t("watchTonight.description")}</p>
      </header>
      <Panel className="grid gap-3 md:grid-cols-4 animate-in" style={{ animationDelay: `${staggerDelayMs(1)}ms` }}>
        <Select aria-label={t("watchTonight.genre")} value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">{t("watchTonight.allGenres")}</option>
          {GENRES.movies.map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.labelKey)}
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
      {query.isLoading ? <GridSkeleton count={3} /> : null}
      {query.isError ? <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} /> : null}
      {!query.isLoading && !query.isError ? (
        query.data?.length ? (
          <MediaGrid items={query.data} />
        ) : (
          <EmptyState icon={Popcorn} title={t("watchTonight.emptyTitle")} description={t("watchTonight.emptyDesc")} />
        )
      ) : null}
    </div>
  );
}
