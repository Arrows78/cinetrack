import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { NotebookPen, TriangleAlert } from "lucide-react";
import { AddWatchNoteDialog } from "@/components/media/tracking/add-watch-note-dialog";
import { AvailabilityAlertButton } from "@/components/media/detail/availability-alert-button";
import { CollectionProgressPanel } from "@/components/media/detail/collection-progress-panel";
import { ProviderAvailability } from "@/components/media/detail/provider-availability";
import { RecommendationsPanel } from "@/components/media/detail/recommendations-panel";
import { TrailerPanel } from "@/components/media/detail/trailer-panel";
import { LibraryEditor } from "@/components/library/library-editor";
import { CastList } from "@/components/media/detail/cast-list";
import { CatalogMetadataSync } from "@/components/media/detail/catalog-metadata-sync";
import { ImdbLink } from "@/components/media/detail/imdb-link";
import { KeywordChips } from "@/components/media/detail/keyword-chips";
import { MediaGallery } from "@/components/media/detail/media-gallery";
import { ReviewsPanel } from "@/components/media/detail/reviews-panel";
import { MediaDetailsHero } from "@/components/media/detail/media-details-hero";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { SeenToggle } from "@/components/media/tracking/seen-toggle";
import { WatchHistoryPanel } from "@/components/media/activity/watch-history-panel";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { IconTooltip } from "@/components/ui/tooltip";
import { AddToLibraryButton } from "@/components/media/tracking/add-to-library-button";
import { FavouriteButton } from "@/components/media/tracking/favourite-button";
import { EmptyState } from "@/components/states/empty-state";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { RemoteErrorState } from "@/components/states/remote-error-state";
import { useImageCache } from "@/features/media/use-image-cache";
import { useMovieSeen } from "@/features/progress/use-progress";
import { useMovieDetails } from "@/features/media/use-media";

export function MovieDetailPage() {
  const { t } = useTranslation();
  const { movieId } = useParams({ from: "/movies/$movieId" });
  const id = Number(movieId);
  const movieQuery = useMovieDetails(id);
  const seenQuery = useMovieSeen(id);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  useImageCache([movieQuery.data?.posterPath, movieQuery.data?.backdropPath], ["w500", "original"]);
  // See series-detail-page.tsx's equivalent guard for why: a non-numeric id
  // and isPending-vs-isLoading both used to fall through to a bare `return
  // null` — a permanently blank page instead of a skeleton or an error.
  if (!Number.isFinite(id)) {
    return <EmptyState icon={TriangleAlert} title={t("pages.notFound")} description={t("pages.notFoundDesc")} />;
  }
  if (movieQuery.isPending) return <HeroSkeleton />;
  if (movieQuery.isError) {
    return <RemoteErrorState error={movieQuery.error} onRetry={() => void movieQuery.refetch()} />;
  }
  const movie = movieQuery.data;

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={movie}
        actions={
          <>
            <AddToLibraryButton media={movie} />
            <FavouriteButton media={movie} />
            <AvailabilityAlertButton media={movie} />
          </>
        }
        extra={
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <SeenToggle
                seen={Boolean(seenQuery.data)}
                disabled={seenQuery.isSaving || seenQuery.isError}
                onToggle={() => void seenQuery.toggleMovieSeen({ movie, watched: !seenQuery.data })}
                celebrateOnSeen
              />
              {!seenQuery.data ? (
                <IconTooltip label={t("media.addWatchNoteAction")}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("media.addWatchNoteAction")}
                    disabled={seenQuery.isSaving || seenQuery.isError}
                    onClick={() => setNoteDialogOpen(true)}
                  >
                    <NotebookPen className="size-4" />
                  </Button>
                </IconTooltip>
              ) : null}
            </div>
            {seenQuery.isError ? <PartialErrorState message={t("media.seenStatusUnavailable")} /> : null}
          </div>
        }
      />
      <AddWatchNoteDialog
        open={noteDialogOpen}
        onOpenChange={setNoteDialogOpen}
        onConfirm={(note) => {
          setNoteDialogOpen(false);
          // Failure toast is handled by the app-wide MutationCache error
          // handler (see query-client.ts).
          void seenQuery.toggleMovieSeen({ movie, watched: true, note: note || undefined }).catch(() => {});
        }}
      />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("media.overview")} />
          <p className="text-body-lg text-muted-foreground">{movie.overview || t("media.noOverview")}</p>
          <KeywordChips keywords={movie.keywords} />
        </Panel>
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("movies.technicalSheet")} />
          <div className="grid gap-2 text-body-sm">
            {[
              { label: t("movies.country"), value: movie.country?.join(", ") || "—" },
              { label: t("movies.language"), value: movie.language || "—" },
              { label: t("media.genres"), value: movie.genres.join(", ") || "—" },
              { label: t("media.status"), value: movie.status || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <ImdbLink imdbId={movie.imdbId} />
          </div>
        </Panel>
      </section>
      <section>
        <SectionHeader title={t("media.cast")} subtitle={t("movies.castSubtitle")} />
        <CastList cast={movie.cast} />
      </section>
      <MediaGallery backdropPaths={movie.backdropPaths} />
      <TrailerPanel mediaType="movie" mediaId={movie.id} />
      <ProviderAvailability media={movie} />
      <LibraryEditor media={movie} />
      <CatalogMetadataSync media={movie} />
      <CollectionProgressPanel movie={movie} />
      <WatchHistoryPanel mediaId={movie.id} mediaType="movie" />
      <ReviewsPanel reviews={movie.reviews} />
      <RecommendationsPanel media={movie} />
    </div>
  );
}
