import type { LucideIcon } from "lucide-react";
import { LoadMoreButton } from "@/components/media/load-more-button";
import { MediaGrid } from "@/components/media/media-grid";
import { SectionHeader } from "@/components/media/section-header";
import { EmptyState } from "@/components/states/empty-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import type { MediaSummary } from "@/types/media";

// Structural subset of the useMovies()/useSeries() return value, so the page
// stays decoupled from react-query's full result type.
interface MediaListQuery {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  items: MediaSummary[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}

interface MediaListPageProps {
  query: MediaListQuery;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
}

export function MediaListPage({ query, icon, title, subtitle, emptyTitle, emptyDescription }: MediaListPageProps) {
  if (query.isLoading) return <GridSkeleton />;
  if (query.isError) return <RemoteErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.items.length) {
    return <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <section>
      <SectionHeader title={title} subtitle={subtitle} index={1} />
      <MediaGrid items={query.items} />
      <LoadMoreButton
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      />
    </section>
  );
}
