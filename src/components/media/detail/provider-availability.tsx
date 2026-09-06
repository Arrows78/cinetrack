import { useTranslation } from "react-i18next";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { useAvailability } from "@/features/media/use-discovery";
import { usePreferences } from "@/features/preferences/use-preferences";
import { DEFAULT_TMDB_REGION } from "@/shared/constants/discover";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import type { MediaSummary, WatchProvider } from "@/types/media";

function ProviderGroup({ label, providers }: { label: string; providers: WatchProvider[] }) {
  if (!providers.length) return null;
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {providers.map((provider) => (
          <Tile key={provider.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            {provider.logoPath ? (
              <img
                className="size-7 rounded-lg"
                src={buildTmdbImageUrl(provider.logoPath, "w92") ?? undefined}
                alt=""
              />
            ) : null}
            <span>{provider.name}</span>
          </Tile>
        ))}
      </div>
    </div>
  );
}

export function ProviderAvailability({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const region = preferences.data?.region ?? DEFAULT_TMDB_REGION;
  const query = useAvailability(media.mediaType, media.id, region);
  const data = query.data;
  // Below-the-fold on a page that otherwise loaded fine (movie/series
  // detail) — a full-page RemoteErrorState here would take the rest of an
  // already-successful page down with it just to report this one section
  // failed. PartialErrorState degrades in place instead, same as this
  // page's other secondary panels (collection progress, watch history).
  if (query.isError) {
    return <PartialErrorState message={t("media.whereToWatchUnavailable")} onRetry={() => void query.refetch()} />;
  }
  const hasAny = Boolean(data && (data.flatrate.length || data.free.length || data.rent.length || data.buy.length));
  if (!data || !hasAny) return null;
  return (
    <Panel>
      <SectionHeader title={`${t("media.whereToWatch")} · ${region}`} />
      <div className="space-y-4">
        <ProviderGroup label={t("media.streamingFlatrate")} providers={data.flatrate} />
        <ProviderGroup label={t("media.streamingFree")} providers={data.free} />
        <ProviderGroup label={t("media.streamingRent")} providers={data.rent} />
        <ProviderGroup label={t("media.streamingBuy")} providers={data.buy} />
      </div>
    </Panel>
  );
}
