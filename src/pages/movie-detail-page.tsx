import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { AvailabilityAlertButton } from "@/components/media/availability-alert-button";
import { ProviderAvailability } from "@/components/media/provider-availability";
import { RecommendationsPanel } from "@/components/media/recommendations-panel";
import { TrailerPanel } from "@/components/media/trailer-panel";
import { AddToListButton } from "@/components/library/add-to-list-button";
import { LibraryEditor } from "@/components/library/library-editor";
import { CastList } from "@/components/media/cast-list";
import { MediaDetailsHero } from "@/components/media/media-details-hero";
import { SectionHeader } from "@/components/media/section-header";
import { SeenToggle } from "@/components/media/seen-toggle";
import { Panel } from "@/components/ui/panel";
import { AddToLibraryButton } from "@/components/media/add-to-library-button";
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
  useImageCache([movieQuery.data?.posterPath, movieQuery.data?.backdropPath]);
  if (movieQuery.isLoading) return <HeroSkeleton />;
  if (movieQuery.isError) {
    return <RemoteErrorState error={movieQuery.error} onRetry={() => void movieQuery.refetch()} />;
  }
  if (!movieQuery.data) return null;
  const movie = movieQuery.data;

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={movie}
        actions={
          <>
            <AddToLibraryButton media={movie} />
            <AvailabilityAlertButton media={movie} />
          </>
        }
        extra={
          <div className="flex flex-col gap-2">
            <SeenToggle
              seen={Boolean(seenQuery.data)}
              disabled={seenQuery.isSaving || seenQuery.isError}
              onToggle={() => void seenQuery.toggleMovieSeen({ movie, watched: !seenQuery.data })}
              celebrateOnSeen
            />
            {seenQuery.isError ? <PartialErrorState message={t("media.seenStatusUnavailable")} /> : null}
          </div>
        }
      />
      <LibraryEditor media={movie} />
      <AddToListButton media={movie} />
      <ProviderAvailability media={movie} />
      <TrailerPanel mediaType="movie" mediaId={movie.id} />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("media.overview")} />
          <p className="font-serif text-base leading-7 text-muted-foreground md:text-lg">{movie.overview}</p>
        </Panel>
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("movies.technicalSheet")} />
          <div className="grid gap-2 text-sm">
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
        </Panel>
      </section>
      <RecommendationsPanel media={movie} />
      <section>
        <SectionHeader title={t("media.cast")} subtitle={t("movies.castSubtitle")} />
        <CastList cast={movie.cast} />
      </section>
    </div>
  );
}
