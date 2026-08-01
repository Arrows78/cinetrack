import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaGrid } from "@/components/media/media-grid";
import { GENRES, PLATFORMS } from "@/shared/constants/discover";
import { queryKeys } from "@/shared/constants/query-keys";
import { watchTonightService } from "@/features/watch-tonight/watch-tonight-service";
import { staggerDelayMs } from "@/shared/utils/animation";
export function WatchTonightPage() {
  const { t } = useTranslation();
  const [genre, setGenre] = useState("");
  const [provider, setProvider] = useState("");
  const [runtime, setRuntime] = useState("120");
  const [seed, setSeed] = useState(0);
  const query = useQuery({
    queryKey: [...queryKeys.local.watchTonight, genre, provider, runtime, seed],
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
      <section
        className="grid gap-3 rounded-3xl border border-border bg-card/60 p-5 md:grid-cols-4 animate-in"
        style={{ animationDelay: `${staggerDelayMs(1)}ms` }}
      >
        <select
          className="h-10 rounded-xl border border-border bg-background px-3"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          <option value="">{t("watchTonight.allGenres")}</option>
          {GENRES.movies.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-xl border border-border bg-background px-3"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="">{t("watchTonight.allPlatforms")}</option>
          {PLATFORMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          className="h-10 rounded-xl border border-border bg-background px-3"
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
      </section>
      {query.isLoading ? <p>{t("watchTonight.searching")}</p> : <MediaGrid items={query.data ?? []} />}
    </div>
  );
}
