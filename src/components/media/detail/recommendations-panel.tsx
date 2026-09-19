import { useTranslation } from "react-i18next";
import { useRecommendations } from "@/features/media/use-discovery";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { SectionHeader } from "@/components/media/primitives/section-header";
import type { MediaSummary } from "@/types/media";
export function RecommendationsPanel({ media, id }: { media: MediaSummary; id?: string }) {
  const { t } = useTranslation();
  const query = useRecommendations(media.mediaType, media.id);
  if (!query.data?.results.length) return null;
  return (
    <section id={id} className={id ? "scroll-mt-28" : undefined}>
      <SectionHeader
        title={t("media.similarSuggestions")}
        subtitle={t("media.becauseWatching", { title: media.title })}
      />
      <MediaGrid items={query.data.results.slice(0, 10)} />
    </section>
  );
}
