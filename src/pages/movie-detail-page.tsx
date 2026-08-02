import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { AvailabilityAlertButton } from "@/components/media/availability-alert-button";
import { ProviderAvailability } from "@/components/media/provider-availability";
import { RecommendationsPanel } from "@/components/media/recommendations-panel";
import { TrailerPanel } from "@/components/media/trailer-panel";
import { AddToListButton } from "@/components/collections/add-to-list-button";
import { LibraryEditor } from "@/components/library/library-editor";
import { CastList } from "@/components/media/cast-list";
import { MediaDetailsHero } from "@/components/media/media-details-hero";
import { SectionHeader } from "@/components/media/section-header";
import { SeenToggle } from "@/components/media/seen-toggle";
import { Panel } from "@/components/ui/panel";
import { WatchlistButton } from "@/components/media/watchlist-button";
import { HeroSkeleton } from "@/components/states/loading-skeletons";
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
  if (!movieQuery.data) return null;
  const movie = movieQuery.data;

  return (
    <div className="space-y-8">
      <MediaDetailsHero
        media={movie}
        actions={
          <>
            <WatchlistButton media={movie} />
            <AvailabilityAlertButton media={movie} />
          </>
        }
        extra={
          <SeenToggle
            seen={Boolean(seenQuery.data)}
            disabled={seenQuery.isSaving}
            onToggle={() => void seenQuery.toggleMovieSeen({ movie, watched: !seenQuery.data })}
            celebrateOnSeen
          />
        }
      />
      <LibraryEditor media={movie} />
      <AddToListButton media={movie} />
      <ProviderAvailability media={movie} />
      <TrailerPanel mediaType="movie" mediaId={movie.id} />
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel tone="subtle" className="p-6">
          <SectionHeader title={t("media.overview")} />
          <p className="text-sm leading-7 text-muted-foreground md:text-base">{movie.overview}</p>
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
