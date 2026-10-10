import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { queryKeys } from "@/shared/constants/query-keys";
import { makeLibraryItem, makeMedia } from "@/shared/test-utils";
import { defaultPreferences } from "@/features/preferences/preferences-repository";
import type { UserPreferences } from "@/types/media";

// Cross-view cache coherence: a mutation must leave no mounted reader of the
// same data on a stale cache. Every reader below is the real hook, run
// against a real QueryClient, with the Tauri `invoke()` boundary faked — a
// reader counts as refreshed when its command is called again.

const PROFILE = "profile-a";
let preferences: UserPreferences;
const calls = new Map<string, number>();
const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  calls.set(command, (calls.get(command) ?? 0) + 1);
  switch (command) {
    case "get_preferences":
      return preferences;
    case "update_preference":
      preferences = { ...preferences, [args!.key as string]: args!.value } as UserPreferences;
      return preferences;
    case "save_library_item":
      return makeLibraryItem();
    case "list_history":
    case "list_library_distinct_tags":
    case "list_dismissed_recommendations":
    case "list_library":
      return [];
    case "get_library_item":
      return null;
    case "is_movie_seen":
      return false;
    case "get_episode_progress":
    case "list_viewing_events_for_media":
      return [];
    default:
      return undefined;
  }
});
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

const pickMock = vi.fn(async () => ({ movies: [], series: [] }));
vi.mock("@/features/watch-tonight/watch-tonight-service", () => ({
  watchTonightService: { pick: (...args: unknown[]) => (pickMock as (...a: unknown[]) => unknown)(...args) },
}));

const buildMock = vi.fn(async (limit: number, providerIds: number[]) => {
  void limit;
  void providerIds;
  return [];
});
vi.mock("@/features/tracking/tracking-service", () => ({
  trackingService: { build: (limit: number, providerIds: number[]) => buildMock(limit, providerIds) },
}));

const count = (command: string) => calls.get(command) ?? 0;

// `warm` pre-loads the preferences so every reader mounts under the real
// profile id from its first render (otherwise the key switches from the
// provisional "default" profile once preferences resolve, mid-test).
function createClient(options: { warm?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } });
  if (options.warm ?? true) client.setQueryData(queryKeys.local.preferences, preferences);
  return client;
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  calls.clear();
  invokeMock.mockClear();
  pickMock.mockClear();
  buildMock.mockClear();
  preferences = { ...defaultPreferences, activeProfileId: PROFILE };
});

describe("library edits and the other views of the same title", () => {
  async function mountReaders() {
    const { useLibraryItem, useLibraryDistinctTags } = await import("@/features/library/use-library");
    const { useHistory } = await import("@/features/history/use-history");
    const client = createClient();
    const view = renderHook(
      () => ({
        item: useLibraryItem(makeMedia({ id: 7 })),
        history: useHistory(),
        tags: useLibraryDistinctTags(),
      }),
      { wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(view.result.current.history.isSuccess).toBe(true));
    await waitFor(() => expect(view.result.current.tags.isSuccess).toBe(true));
    return view;
  }

  it("saving a library entry refreshes the history it just appended to", async () => {
    const view = await mountReaders();
    const before = count("list_history");

    await act(async () => {
      await view.result.current.item.save({ status: "watching" });
    });

    await waitFor(() => expect(count("list_history")).toBeGreaterThan(before));
  });

  it("removing a library entry refreshes the history and the tag autocomplete", async () => {
    const view = await mountReaders();
    const historyBefore = count("list_history");
    const tagsBefore = count("list_library_distinct_tags");

    await act(async () => {
      await view.result.current.item.remove();
    });

    await waitFor(() => expect(count("list_history")).toBeGreaterThan(historyBefore));
    await waitFor(() => expect(count("list_library_distinct_tags")).toBeGreaterThan(tagsBefore));
  });

  it("the quick add/remove toggle's forced removal refreshes the tag autocomplete", async () => {
    const { useLibraryQuickToggle, useLibraryDistinctTags } = await import("@/features/library/use-library");
    const client = createClient();
    const view = renderHook(() => ({ toggle: useLibraryQuickToggle(), tags: useLibraryDistinctTags() }), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(view.result.current.tags.isSuccess).toBe(true));
    const before = count("list_library_distinct_tags");

    await act(async () => {
      await view.result.current.toggle.forceRemove({ mediaId: 7, mediaType: "movie" });
    });

    await waitFor(() => expect(count("list_library_distinct_tags")).toBeGreaterThan(before));
  });
});

describe("hiding a recommendation and Watch Tonight", () => {
  it("dismissing and restoring a title re-runs the Watch Tonight picks that filter on it", async () => {
    const { useDismissedRecommendations } = await import("@/features/recommendations/use-recommendations");
    const { useWatchTonightPicks } = await import("@/features/watch-tonight/use-watch-tonight");
    const client = createClient();
    const view = renderHook(
      () => ({ dismissed: useDismissedRecommendations(), picks: useWatchTonightPicks({ hideWatched: false }) }),
      { wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(view.result.current.picks.isSuccess).toBe(true));
    await waitFor(() => expect(view.result.current.dismissed.isSuccess).toBe(true));

    const afterLoad = pickMock.mock.calls.length;
    await act(async () => {
      await view.result.current.dismissed.dismiss({ id: 5, mediaType: "movie", title: "Seven" });
    });
    await waitFor(() => expect(pickMock.mock.calls.length).toBeGreaterThan(afterLoad));

    const afterDismiss = pickMock.mock.calls.length;
    await act(async () => {
      await view.result.current.dismissed.undismiss({ mediaId: 5, mediaType: "movie" });
    });
    await waitFor(() => expect(pickMock.mock.calls.length).toBeGreaterThan(afterDismiss));
  });
});

describe("the tracking feed and the streaming services preference", () => {
  it("never builds the feed with a provisional empty provider list while preferences load", async () => {
    preferences = { ...preferences, preferredProviderIds: [8, 337] };
    const { useTracking } = await import("@/features/tracking/use-tracking");
    const client = createClient({ warm: false });
    const view = renderHook(() => useTracking(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));

    expect(buildMock.mock.calls.map((call) => call[1])).toEqual([[8, 337]]);
  });

  it("rebuilds the feed when the streaming services change", async () => {
    const { useTracking } = await import("@/features/tracking/use-tracking");
    const { usePreferences } = await import("@/features/preferences/use-preferences");
    const client = createClient();
    const view = renderHook(() => ({ tracking: useTracking(), prefs: usePreferences() }), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(view.result.current.tracking.isSuccess).toBe(true));

    await act(async () => {
      await view.result.current.prefs.updatePreference({ key: "preferredProviderIds", value: [119] });
    });

    await waitFor(() => expect(buildMock.mock.calls[buildMock.mock.calls.length - 1]?.[1]).toEqual([119]));
  });
});

describe("TV Time import and every profile-scoped reader", () => {
  it("refreshes episode progress, the watch diary and seen flags that were already cached", async () => {
    const { useEpisodeProgress, useMovieSeen, useViewingEventsForMedia } =
      await import("@/features/progress/use-progress");
    const { invalidateTvTimeImportQueries } = await import("@/features/tvtime/tvtime-import-service");
    const client = createClient();
    const view = renderHook(
      () => ({
        progress: useEpisodeProgress(9),
        seen: useMovieSeen(55),
        events: useViewingEventsForMedia(9, "series"),
      }),
      { wrapper: wrapperFor(client) }
    );
    await waitFor(() => expect(view.result.current.progress.isSuccess).toBe(true));
    await waitFor(() => expect(view.result.current.seen.isSuccess).toBe(true));
    await waitFor(() => expect(view.result.current.events.isSuccess).toBe(true));
    const before = {
      progress: count("get_episode_progress"),
      seen: count("is_movie_seen"),
      events: count("list_viewing_events_for_media"),
    };

    await act(async () => {
      await invalidateTvTimeImportQueries(client, PROFILE);
    });

    await waitFor(() => expect(count("get_episode_progress")).toBeGreaterThan(before.progress));
    await waitFor(() => expect(count("is_movie_seen")).toBeGreaterThan(before.seen));
    await waitFor(() => expect(count("list_viewing_events_for_media")).toBeGreaterThan(before.events));
  });
});

describe("language changes and TMDB-derived views cached under a profile key", () => {
  it("re-runs the Watch Tonight picks, whose titles come from TMDB in the previous language", async () => {
    const { useWatchTonightPicks } = await import("@/features/watch-tonight/use-watch-tonight");
    const { usePreferences } = await import("@/features/preferences/use-preferences");
    const client = createClient();
    const view = renderHook(() => ({ picks: useWatchTonightPicks({ hideWatched: false }), prefs: usePreferences() }), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(view.result.current.picks.isSuccess).toBe(true));
    const afterLoad = pickMock.mock.calls.length;

    await act(async () => {
      await view.result.current.prefs.updatePreference({ key: "language", value: "fr" });
    });

    await waitFor(() => expect(pickMock.mock.calls.length).toBeGreaterThan(afterLoad));
  });
});
