import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { logger } from "@/shared/lib/logger";
import { useLibrary } from "@/features/library/use-library";
import { EMPTY_LIBRARY, filterAvailableItems } from "@/shared/utils/library-set";
import { mediaRepository } from "@/features/media/media-repository";
import { useActiveProfileId } from "@/features/preferences/use-preferences";
import { queryKeys } from "@/shared/constants/query-keys";
import type { CastMember, CrewMember, LibraryItem, MediaSummary, Movie, Series } from "@/types/media";

export interface PersonTally {
  id: number;
  name: string;
  profilePath?: string | null;
  /** How many of the user's watched titles (within the capped candidate pool) credit this person. */
  count: number;
}

// Bounds how many completed titles get a details+credits fetch just to
// build this rail — mirrors PLANNED_CANDIDATE_CAP in
// watch-tonight-service.ts, same reasoning: this is a "for you" signal, not
// something that needs to scan an entire multi-hundred-title library, and
// each candidate costs one extra TMDB round trip.
export const COMPLETED_CANDIDATE_CAP = 20;

// Below this many watched-with-credits titles, any "most watched" person is
// really just "the one person in the one movie you finished" — not a real
// pattern. Chosen (rather than e.g. 1) so the rail only appears once there's
// an actual library to draw a signal from.
const MIN_TITLES_FOR_SIGNAL = 3;

// The top person must recur across at least this many watched titles before
// being surfaced as "you watch most" — otherwise every library's top
// "actor" would just be whoever topped the cast list of its single
// most-recently-completed title, which isn't a real preference signal.
const MIN_PERSON_APPEARANCES = 2;

// Only the top-billed slice of each title's cast counts toward "actor you
// watch most" — mapCast already caps a title's cast at 12, but a person
// buried at #11 isn't who a viewer associates the film with. 5 mirrors how
// many names a poster or a "starring" line would typically carry.
const TOP_BILLED_CAST_SLICE = 5;

function tally(items: MediaSummary[], pick: (item: MediaSummary) => Array<CastMember | CrewMember>): PersonTally[] {
  const byId = new Map<number, PersonTally>();
  for (const item of items) {
    for (const person of pick(item)) {
      const existing = byId.get(person.id);
      if (existing) existing.count += 1;
      else byId.set(person.id, { id: person.id, name: person.name, profilePath: person.profilePath, count: 1 });
    }
  }
  // Ties broken by name so the pick is deterministic rather than depending
  // on Map insertion order (itself dependent on the library's own sort).
  return [...byId.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function pickTop(tallies: PersonTally[]): PersonTally | null {
  const top = tallies[0];
  return top && top.count >= MIN_PERSON_APPEARANCES ? top : null;
}

/** Exported for isolated unit testing — the actual aggregation logic behind the home page's "More with actors you like" rail. */
export function pickTopActor(watchedItems: MediaSummary[]): PersonTally | null {
  if (watchedItems.length < MIN_TITLES_FOR_SIGNAL) return null;
  return pickTop(tally(watchedItems, (item) => item.cast.slice(0, TOP_BILLED_CAST_SLICE)));
}

/** Exported for isolated unit testing — the actual aggregation logic behind the home page's "Movies from directors you watch most" rail. */
export function pickTopDirector(watchedItems: MediaSummary[]): PersonTally | null {
  if (watchedItems.length < MIN_TITLES_FOR_SIGNAL) return null;
  return pickTop(tally(watchedItems, (item) => item.directors ?? []));
}

/** Exported for isolated unit testing. Most-recently-completed first, capped at COMPLETED_CANDIDATE_CAP. */
export function pickCompletedCandidates(library: LibraryItem[]): LibraryItem[] {
  return library
    .filter((item) => item.status === "completed")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
    .slice(0, COMPLETED_CANDIDATE_CAP);
}

// Fetches full details (cast + directors) for a capped set of the user's
// completed library items — cast/directors aren't part of LibraryItem
// itself, only of the full Movie/Series detail response, so this is the
// "already-fetched data" boundary: same one-detail-fetch-per-candidate
// approach watch-tonight-service.ts already uses for its planned-item
// candidates, reused here instead of adding a parallel fetching path.
function useWatchedCredits(candidates: LibraryItem[]) {
  const profileId = useActiveProfileId();
  const signature = candidates.map((item) => `${item.mediaType}:${item.mediaId}`).join(",");

  return useQuery({
    queryKey: queryKeys.local.peopleYouWatchCredits(profileId, signature),
    queryFn: async (): Promise<MediaSummary[]> => {
      const results = await Promise.all(
        candidates.map((item) =>
          (item.mediaType === "movie"
            ? mediaRepository.getMovieDetails(item.mediaId)
            : mediaRepository.getSeriesDetails(item.mediaId)
          ).catch((error: unknown) => {
            logger.warn(`Failed to fetch ${item.mediaType} credits for people-you-watch (${item.mediaId}): ${error}`);
            return null;
          })
        )
      );
      return results.filter((item): item is Movie | Series => Boolean(item));
    },
    enabled: candidates.length > 0,
  });
}

function usePersonDiscoverRail(person: PersonTally | null, role: "cast" | "crew", library: LibraryItem[]) {
  const query = useQuery({
    queryKey: queryKeys.remote.discoverByPerson(role, person?.id ?? Number.NaN),
    queryFn: () =>
      mediaRepository.discoverMovies(role === "cast" ? { withCast: person?.id } : { withCrew: person?.id }),
    enabled: Boolean(person),
  });

  const items = useMemo<MediaSummary[]>(() => {
    if (!person) return [];
    return filterAvailableItems(query.data?.results ?? [], library);
  }, [person, query.data, library]);

  return { items, isLoading: Boolean(person) && query.isLoading };
}

/**
 * "Movies from directors you watch most" / "More with actors you like" —
 * README's DISCOVERY roadmap item. Aggregates cast/crew credits across a
 * capped, most-recent slice of the user's completed library (movies and
 * series alike feed the tally, but the resulting rails are movie-only:
 * TMDB's /discover/tv has no with_cast/with_crew equivalent — see
 * DiscoverArgs' doc comment in media-provider.ts), then queries TMDB
 * discover for more from whoever tops each tally.
 */
export function usePeopleYouWatch() {
  const libraryQuery = useLibrary();
  const library = libraryQuery.data ?? EMPTY_LIBRARY;
  const completedCandidates = useMemo(() => pickCompletedCandidates(library), [library]);
  const creditsQuery = useWatchedCredits(completedCandidates);
  const watchedItems = useMemo(() => creditsQuery.data ?? [], [creditsQuery.data]);

  const topActor = useMemo(() => pickTopActor(watchedItems), [watchedItems]);
  const topDirector = useMemo(() => pickTopDirector(watchedItems), [watchedItems]);

  const actorRail = usePersonDiscoverRail(topActor, "cast", library);
  const directorRail = usePersonDiscoverRail(topDirector, "crew", library);

  const isCreditsLoading = completedCandidates.length > 0 && creditsQuery.isLoading;

  return {
    topActor,
    actorItems: actorRail.items,
    isActorLoading: isCreditsLoading || actorRail.isLoading,
    topDirector,
    directorItems: directorRail.items,
    isDirectorLoading: isCreditsLoading || directorRail.isLoading,
  };
}
