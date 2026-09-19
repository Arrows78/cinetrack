import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEpisodeSeenBacklogPrompt } from "../use-episode-seen-backlog-prompt";
import type { Episode } from "@/types/media";

function episode(id: number, seasonNumber: number, episodeNumber: number): Episode {
  return { id, seasonNumber, episodeNumber, title: `S${seasonNumber}E${episodeNumber}`, overview: "" };
}

describe("useEpisodeSeenBacklogPrompt", () => {
  it("marks directly with no prompt when there is no earlier unwatched episode", () => {
    const onMarkOne = vi.fn();
    const onMarkMany = vi.fn();
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne, onMarkMany }));

    const target = episode(2, 1, 2);
    act(() =>
      result.current.requestToggle(target, true, [episode(1, 1, 1), target], new Set([1]), undefined, undefined)
    );

    expect(onMarkOne).toHaveBeenCalledWith(target, true, undefined, undefined);
    expect(onMarkMany).not.toHaveBeenCalled();
    expect(result.current.prompt).toBeNull();
  });

  it("never prompts when un-marking an episode, even with earlier unwatched siblings", () => {
    const onMarkOne = vi.fn();
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne, onMarkMany: vi.fn() }));

    const target = episode(2, 1, 2);
    act(() => result.current.requestToggle(target, false, [episode(1, 1, 1), target], new Set(), undefined, undefined));

    expect(onMarkOne).toHaveBeenCalledWith(target, false, undefined, undefined);
    expect(result.current.prompt).toBeNull();
  });

  it("prompts for an unwatched earlier episode of the same season", () => {
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne: vi.fn(), onMarkMany: vi.fn() }));

    const earlier = episode(1, 1, 1);
    const target = episode(2, 1, 2);
    act(() => result.current.requestToggle(target, true, [earlier, target], new Set(), undefined, undefined));

    expect(result.current.prompt?.previousUnwatched).toEqual([earlier]);
  });

  it("prompts for an unwatched episode of an earlier season, ordering by season before episode number", () => {
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne: vi.fn(), onMarkMany: vi.fn() }));

    // Season 1's episode 3 has a *higher* episode number than season 2's
    // episode 1, but season 1 is still chronologically earlier.
    const seasonOneFinale = episode(103, 1, 3);
    const seasonTwoOpener = episode(201, 2, 1);
    const allEpisodes = [episode(101, 1, 1), episode(102, 1, 2), seasonOneFinale, seasonTwoOpener];

    act(() =>
      result.current.requestToggle(seasonTwoOpener, true, allEpisodes, new Set([101, 102]), undefined, undefined)
    );

    expect(result.current.prompt?.previousUnwatched).toEqual([seasonOneFinale]);
  });

  it("does not treat a later season's episode as earlier just because its episode number is lower", () => {
    const onMarkOne = vi.fn();
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne, onMarkMany: vi.fn() }));

    const target = episode(301, 3, 1);
    // Season 4's episode 1 is unwatched but season 4 comes after season 3 —
    // it must never count as "before" season 3's own opener.
    const laterSeasonEpisode = episode(401, 4, 1);
    act(() =>
      result.current.requestToggle(target, true, [target, laterSeasonEpisode], new Set(), undefined, undefined)
    );

    expect(onMarkOne).toHaveBeenCalledWith(target, true, undefined, undefined);
    expect(result.current.prompt).toBeNull();
  });

  it("confirmIncludePrevious marks every previous-unwatched episode plus the target", () => {
    const onMarkMany = vi.fn();
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne: vi.fn(), onMarkMany }));

    const earlier = episode(1, 1, 1);
    const target = episode(2, 1, 2);
    act(() => result.current.requestToggle(target, true, [earlier, target], new Set(), undefined, "ctx"));
    act(() => result.current.confirmIncludePrevious());

    expect(onMarkMany).toHaveBeenCalledWith([earlier, target], target, "ctx");
    expect(result.current.prompt).toBeNull();
  });

  it("confirmOnlyThis marks just the target and dismisses the prompt", () => {
    const onMarkOne = vi.fn();
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne, onMarkMany: vi.fn() }));

    const earlier = episode(1, 1, 1);
    const target = episode(2, 1, 2);
    act(() => result.current.requestToggle(target, true, [earlier, target], new Set(), "a note", "ctx"));
    act(() => result.current.confirmOnlyThis());

    expect(onMarkOne).toHaveBeenCalledWith(target, true, "a note", "ctx");
    expect(result.current.prompt).toBeNull();
  });

  it("dismiss clears the prompt without marking anything", () => {
    const onMarkOne = vi.fn();
    const onMarkMany = vi.fn();
    const { result } = renderHook(() => useEpisodeSeenBacklogPrompt({ onMarkOne, onMarkMany }));

    const earlier = episode(1, 1, 1);
    const target = episode(2, 1, 2);
    act(() => result.current.requestToggle(target, true, [earlier, target], new Set(), undefined, undefined));
    act(() => result.current.dismiss());

    expect(result.current.prompt).toBeNull();
    expect(onMarkOne).not.toHaveBeenCalled();
    expect(onMarkMany).not.toHaveBeenCalled();
  });
});
