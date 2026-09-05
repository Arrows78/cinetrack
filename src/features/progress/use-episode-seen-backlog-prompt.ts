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
 * watched would leave still-unwatched earlier episodes of the same season
 * behind, this asks the caller (via the returned `prompt`) whether to catch
 * those up too instead of silently skipping over them. Un-marking an
 * episode, or marking one with no earlier unwatched sibling, never prompts.
 * `TContext` carries whatever the caller needs at resolution time (e.g. the
 * `Season` the episode belongs to, for a season-complete celebration) —
 * threaded through untouched rather than captured in a stale closure.
 */
export function useEpisodeSeenBacklogPrompt<TContext = undefined>(options: {
  onMarkOne: (episode: Episode, watched: boolean, note: string | undefined, context: TContext) => void;
  onMarkMany: (episodes: Episode[], target: Episode, context: TContext) => void;
}) {
  const [prompt, setPrompt] = useState<EpisodeSeenBacklogPrompt<TContext> | null>(null);

  const requestToggle = (
    episode: Episode,
    watched: boolean,
    seasonEpisodes: Episode[],
    watchedIds: Set<number>,
    note: string | undefined,
    context: TContext
  ) => {
    if (!watched) {
      options.onMarkOne(episode, false, note, context);
      return;
    }
    const previousUnwatched = seasonEpisodes.filter(
      (candidate) =>
        candidate.id !== episode.id && candidate.episodeNumber < episode.episodeNumber && !watchedIds.has(candidate.id)
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
