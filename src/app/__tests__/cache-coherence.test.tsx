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
