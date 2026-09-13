import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tile } from "@/components/ui/tile";
import { toast } from "@/components/ui/use-toast";
import { LoadingState } from "@/components/states/loading-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { mediaRepository } from "@/features/media/media-repository";
import { useSearch } from "@/features/media/use-search";
import {
  invalidateTvTimeImportQueries,
  resolveRetryableMovie,
  resolveRetryableSeries,
  resolveRetryableWatchlist,
  type RetryableUnmatched,
  type TvTimeImportUndo,
} from "@/features/tvtime";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import type { MediaSummary, SearchScope } from "@/types/media";

const scopeFor = (item: RetryableUnmatched): SearchScope => {
  if (item.kind === "series") return "series";
  if (item.kind === "movie") return "movie";
  return item.entry.mediaType === "movie" ? "movie" : "series";
};

const NO_UNDO: TvTimeImportUndo = { movies: [], series: [], planned: [] };

function UnmatchedItemRow({
  item,
  onResolved,
}: {
  item: RetryableUnmatched;
  onResolved: (item: RetryableUnmatched, undo: TvTimeImportUndo) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const profileId = useActiveProfileId();
  const [query, setQuery] = useState(item.searchTitle);
  const debouncedQuery = useDebouncedValue(query);
  // Search only runs once this row is expanded (Accordion doesn't mount
  // collapsed content) — with a dozen+ retryable items, firing every
  // search up front would be a burst of TMDB calls nobody asked for yet.
  const search = useSearch(debouncedQuery, scopeFor(item));
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Movies/watchlist entries already carry whatever TMDB returned for this
  // exact title during the automatic pass (see RetryableMovie/
  // RetryableWatchlistEntry.initialCandidates) — showing those immediately
  // means a user who opens this row sees candidates right away instead of
  // waiting on a fresh debounced search for the same query the app already
  // ran once. Falls back to the live search the moment the user edits the
  // query away from that original title.
  const initialCandidates = item.kind !== "series" ? item.initialCandidates : [];
  const showingInitialCandidates = initialCandidates.length > 0 && query === item.searchTitle;
  const results = showingInitialCandidates ? initialCandidates : search.items;
  const isSearching = !showingInitialCandidates && search.isLoading;

  const choose = async (match: MediaSummary) => {
    setResolvingId(match.id);
    setError(null);
    try {
      // Each branch's own undo contribution — same shape resolveRetryableSeries/
      // the main import loop already build, so TvTimeImportCard can merge this
      // into its running "undo last import" state the same way either way,
      // regardless of whether a title was resolved automatically or by hand
      // here.
      let undo = NO_UNDO;
      if (item.kind === "series") {
        const series = await mediaRepository.getSeriesDetails(match.id);
        const result = await resolveRetryableSeries(item, series);
        if (result.undo) undo = { movies: [], series: [result.undo], planned: [] };
      } else if (item.kind === "movie") {
        const inserted = await resolveRetryableMovie(item, match);
        if (inserted) undo = { movies: [match], series: [], planned: [] };
      } else {
        const wasNewlyPlanned = await resolveRetryableWatchlist(item, match);
        if (wasNewlyPlanned)
          undo = { movies: [], series: [], planned: [{ mediaId: match.id, mediaType: match.mediaType }] };
      }
      await invalidateTvTimeImportQueries(queryClient, profileId);
      toast({ description: t("tvtimeImport.retry.resolved", { title: match.title }), variant: "success" });
      onResolved(item, undo);
    } catch {
      setError(t("tvtimeImport.retry.resolveFailed"));
      setResolvingId(null);
    }
  };

  return (
    <AccordionItem value={`${item.kind}-${item.label}`}>
      <AccordionTrigger>
        <span className="flex flex-col items-start text-left">
          <span>{item.label}</span>
          {item.kind === "series" ? (
            <span className="text-caption font-normal text-muted-foreground">
              {t("tvtimeImport.retry.episodeCount", { count: item.episodes.length })}
            </span>
          ) : null}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <Input
          size="sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("tvtimeImport.retry.searchLabel")}
          placeholder={t("tvtimeImport.retry.searchLabel")}
        />
        <div className="mt-2 grid gap-1.5">
          {isSearching ? (
            <LoadingState className="py-2" />
          ) : results.length ? (
            results.slice(0, 6).map((result) => (
              <Tile key={result.id} className="flex items-center justify-between px-3 py-2 text-body-sm">
                <span className="min-w-0 truncate">
                  {result.title}
                  {result.year ? <span className="text-muted-foreground"> · {result.year}</span> : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={resolvingId !== null}
                  isLoading={resolvingId === result.id}
                  onClick={() => void choose(result)}
                >
                  {t("tvtimeImport.retry.choose")}
                </Button>
              </Tile>
            ))
          ) : (
            <p className="text-body-sm text-muted-foreground">{t("tvtimeImport.retry.noResults")}</p>
          )}
        </div>
        {error ? <p className="mt-2 text-body-sm text-destructive">{error}</p> : null}
      </AccordionContent>
    </AccordionItem>
  );
}

/**
 * Persistent (not a 5-second toast) panel letting the user search TMDB
 * themselves and finish the import for whatever the automatic pass
 * couldn't match — see RetryableUnmatched for what each item carries.
 */
export function TvTimeUnmatchedResolver({
  items,
  onResolved,
}: {
  items: RetryableUnmatched[];
  onResolved: (item: RetryableUnmatched, undo: TvTimeImportUndo) => void;
}) {
  const { t } = useTranslation();
  if (!items.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="size-5 text-primary" aria-hidden="true" />
          {t("tvtimeImport.retry.title", { count: items.length })}
        </CardTitle>
        <CardDescription>{t("tvtimeImport.retry.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="space-y-2">
          {items.map((item) => (
            <UnmatchedItemRow key={`${item.kind}-${item.label}`} item={item} onResolved={onResolved} />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
