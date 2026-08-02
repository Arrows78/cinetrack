import { useTranslation } from "react-i18next";
import { Panel } from "@/components/ui/panel";
import { Tile } from "@/components/ui/tile";
import { useAvailability } from "@/features/media/use-discovery";
import { usePreferences } from "@/features/preferences/use-preferences";
import { buildTmdbImageUrl } from "@/shared/utils/format";
import type { MediaSummary } from "@/types/media";
export function ProviderAvailability({ media }: { media: MediaSummary }) {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const region = preferences.data?.region ?? "FR";
  const query = useAvailability(media.mediaType, media.id, region);
  const providers = query.data?.flatrate ?? [];
  if (!providers.length) return null;
  return (
    <Panel>
      <h2 className="font-semibold">
        {t("media.availableStreaming")} · {region}
      </h2>
      <div className="mt-4 flex flex-wrap gap-3">
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
    </Panel>
  );
}
