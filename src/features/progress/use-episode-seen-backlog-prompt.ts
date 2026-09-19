import { useState } from "react";
import type { Episode } from "@/types/media";

export interface EpisodeSeenBacklogPrompt<TContext> {
  episode: Episode;
  note?: string;
  previousUnwatched: Episode[];
  context: TContext;
}

/**
 * Wraps a single-episode "mark watched" action: when marking an episode
 * watched would leave still-unwatched earlier episodes behind — of the same
 * season, or of an earlier season entirely, whichever candidate pool the
 * caller passes in — this asks the caller (via the returned `prompt`)
 * whether to catch those up too instead of silently skipping over them.
 * Un-marking an episode, or marking one with no earlier unwatched sibling,
 * never prompts. `TContext` carries whatever the caller needs at
 * resolution time (e.g. the `Season` the episode belongs to, for a
 * season-complete celebration) — threaded through untouched rather than
 * captured in a stale closure.
 */
export function useEpisodeSeenBacklogPrompt<TContext = undefined>(options: {
  onMarkOne: (episode: Episode, watched: boolean, note: string | undefined, context: TContext) => void;
  onMarkMany: (episodes: Episode[], target: Episode, context: TContext) => void;
}) {
  const [prompt, setPrompt] = useState<EpisodeSeenBacklogPrompt<TContext> | null>(null);

  // "Before" compares (seasonNumber, episodeNumber) as a pair, not just the
  // raw episode number — S02E05 is before S03E01 even though 5 > 1, since
  // episode numbers restart every season. `candidateEpisodes` can span the
  // whole series (see season-accordion.tsx) or stay scoped to one season
  // (episode-detail-page.tsx, season-page.tsx); either way this is what
  // makes "before" mean the right thing for whatever pool was passed in.
  const isBefore = (candidate: Episode, target: Episode): boolean =>
    candidate.seasonNumber < target.seasonNumber ||
    (candidate.seasonNumber === target.seasonNumber && candidate.episodeNumber < target.episodeNumber);

  const requestToggle = (
    episode: Episode,
    watched: boolean,
    candidateEpisodes: Episode[],
    watchedIds: Set<number>,
    note: string | undefined,
    context: TContext
  ) => {
    if (!watched) {
      options.onMarkOne(episode, false, note, context);
      return;
    }
    const previousUnwatched = candidateEpisodes.filter(
      (candidate) => candidate.id !== episode.id && isBefore(candidate, episode) && !watchedIds.has(candidate.id)
    );
    if (previousUnwatched.length === 0) {
      options.onMarkOne(episode, true, note, context);
      return;
    }
    setPrompt({ episode, note, previousUnwatched, context });
  };

  const confirmOnlyThis = () => {
    if (!prompt) return;
    options.onMarkOne(prompt.episode, true, prompt.note, prompt.context);
    setPrompt(null);
  };

  const confirmIncludePrevious = () => {
    if (!prompt) return;
    options.onMarkMany([...prompt.previousUnwatched, prompt.episode], prompt.episode, prompt.context);
    setPrompt(null);
  };

  const dismiss = () => setPrompt(null);

  return { prompt, requestToggle, confirmOnlyThis, confirmIncludePrevious, dismiss };
}
