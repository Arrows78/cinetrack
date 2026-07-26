import { useRecommendations } from "@/hooks/use-discovery";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import type { MediaSummary } from "@/types/media";
export function RecommendationsPanel({ media }: { media: MediaSummary }) {
  const query = useRecommendations(media.mediaType, media.id);
  if (!query.data?.results.length) return null;
  return <section><SectionHeader title="Suggestions similaires" subtitle={`Parce que vous consultez ${media.title}`} /><MediaGrid items={query.data.results.slice(0, 10)} /></section>;
}
