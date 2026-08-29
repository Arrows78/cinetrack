import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { PartialErrorState } from "@/components/states/partial-error-state";
import { GridSkeleton } from "@/components/states/loading-skeletons";
import { MediaGrid } from "@/components/media/primitives/media-grid";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { computeCollectionProgress } from "@/features/media/collection-progress";
import { useMovieCollection } from "@/features/media/use-collection";
import { EMPTY_LIBRARY } from "@/shared/utils/library-set";
import { useLibrary, useLibraryQuickToggle } from "@/features/library/use-library";
import { logger } from "@/shared/lib/logger";
import type { CollectionEntryStatus } from "@/features/media/collection-progress";
import type { Movie } from "@/types/media";

const BUCKET_GRID_CLASS = "grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6";

// Small, single-purpose so it's trivial to keep the three groups' markup
// identical — only the (already-translated) title and the bucket differ.
// Takes `title` rather than a translation key + count: passing a key as a
// literal-string JSX prop trips eslint-plugin-i18next's no-literal-string
// rule (it can't tell a translation key apart from real copy), so the
// t(key, { count }) call happens at each call site below instead.
function CollectionBucket({ title, movies, alreadySeen }: { title: string; movies: Movie[]; alreadySeen: boolean }) {
  if (movies.length === 0) return null;
  return (
    <div>
      <SectionHeader title={title} size="sub" />
      <MediaGrid items={movies.map((movie) => ({ ...movie, alreadySeen }))} listClassName={BUCKET_GRID_CLASS} />
    </div>
  );
}

/**
 * Franchise/collection progress for a movie belonging to a TMDB collection
 * (e.g. "3 / 8 watched") — README's DISCOVERY roadmap item. Renders nothing
 * when the movie isn't part of a collection, or the "collection" is really
 * just this one movie on its own (TMDB creates a collection entry even for
 * some standalone films).
 */
export function CollectionProgressPanel({ movie }: { movie: Movie }) {
  const { t } = useTranslation();
  const collectionId = movie.collection?.id;
  const collectionQuery = useMovieCollection(collectionId);
  const libraryQuery = useLibrary();
  const { addPlanned, isSaving } = useLibraryQuickToggle();
  const [isAddingMissing, setIsAddingMissing] = useState(false);

  if (!collectionId) return null;

  if (collectionQuery.isLoading) {
    return (
      <section>
        <SectionHeader title={movie.collection?.name ?? t("collection.title")} />
        <GridSkeleton count={4} />
      </section>
    );
  }

  if (collectionQuery.isError) {
    return <PartialErrorState message={t("collection.unavailable")} onRetry={() => void collectionQuery.refetch()} />;
  }

  const collection = collectionQuery.data;
  if (!collection || collection.parts.length <= 1) return null;

  const library = libraryQuery.data ?? EMPTY_LIBRARY;
  const progress = computeCollectionProgress(collection.parts, library);
  const byStatus = (status: CollectionEntryStatus) =>
    progress.entries.filter((entry) => entry.status === status).map((entry) => entry.movie);
  const watched = byStatus("watched");
  const planned = byStatus("planned");
  const missing = byStatus("missing");

  const handleAddMissing = async () => {
    setIsAddingMissing(true);
    try {
      await Promise.all(missing.map((missingMovie) => addPlanned(missingMovie)));
      toast({ description: t("collection.addMissingSuccess", { count: missing.length }) });
    } catch (error) {
      // Never surface error.message — see CLAUDE.md's rule on raw IPC/TMDB
      // error text reaching the user.
      logger.error(`Failed to add missing collection entries for collection ${collection.id}: ${error}`);
      toast({ description: t("collection.addMissingFailed"), variant: "error" });
    } finally {
      setIsAddingMissing(false);
    }
  };

  return (
    <section>
      <SectionHeader
        title={collection.name}
        subtitle={t("collection.progressLabel", { watched: progress.watchedCount, total: progress.totalCount })}
        action={
          missing.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleAddMissing()}
              disabled={isAddingMissing || isSaving}
            >
              <Layers className="mr-2 size-4" />
              {t("collection.addMissingCta", { count: missing.length })}
            </Button>
          ) : null
        }
      />
      <div className="space-y-6">
        <CollectionBucket
          title={t("collection.watchedGroupTitle", { count: watched.length })}
          movies={watched}
          alreadySeen
        />
        <CollectionBucket
          title={t("collection.plannedGroupTitle", { count: planned.length })}
          movies={planned}
          alreadySeen={false}
        />
        <CollectionBucket
          title={t("collection.missingGroupTitle", { count: missing.length })}
          movies={missing}
          alreadySeen={false}
        />
      </div>
    </section>
  );
}
