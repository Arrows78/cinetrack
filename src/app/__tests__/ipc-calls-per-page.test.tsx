import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import type { router as RouterInstanceValue } from "@/app/router-config";
import { AuthContext, type AuthContextValue } from "@/features/auth/use-auth";
import { defaultPreferences } from "@/features/preferences/preferences-repository";
import { makeEpisodeProgress, makeLibraryItem, makeTrackedSeries, makeViewingEvent } from "@/shared/test-utils";
import type { LibraryItem, Series, TrackedSeriesItem } from "@/types/media";

// How many `invoke()` calls — local SQLite reads and TMDB requests alike —
// a page load costs, and whether that number grows with the size of the
// library. Every hook and component is the real one, run against a real
// QueryClient and the real route tree, with the Tauri `invoke()` boundary
// faked by a counter. Two datasets of different sizes are loaded in turn: a
// page whose call count grows with its dataset has a per-row call (an N+1),
// which is the property asserted here — never an absolute number, so adding
// a legitimate one-off query does not break the suite.

const PROFILE = "default";
const SMALL = 12;
const LARGE = 60;

interface Dataset {
  library: LibraryItem[];
  tracked: TrackedSeriesItem[];
  listCount: number;
  seasonCount: number;
}

let dataset: Dataset;
const calls: string[] = [];

function buildDataset(size: number): Dataset {
  const library = Array.from({ length: size }, (_, index) => {
    const mediaType = index % 3 === 0 ? "series" : "movie";
    return makeLibraryItem({
      id: `item-${index}`,
      mediaId: index + 1,
      mediaType,
      title: `Title ${index + 1}`,
      status: index % 4 === 0 ? "completed" : index % 4 === 1 ? "watching" : "planned",
      genres: ["Drama"],
      updatedAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    });
  });
  const tracked = library
    .filter((item) => item.mediaType === "series")
    .map((item, index) =>
      makeTrackedSeries({
        id: `tracked-${item.mediaId}`,
        seriesId: item.mediaId,
        title: item.title,
        totalEpisodes: 20,
        watchedEpisodes: index % 2 === 0 ? 8 : 0,
        status: "Returning Series",
      })
    );
  return {
    library,
    tracked,
    listCount: Math.max(2, Math.floor(size / 6)),
    seasonCount: Math.max(3, Math.floor(size / 3)),
  };
}

const homeFeed = {
  trendingSeries: [],
  topRatedSeries: [],
  onTheAirSeries: [],
  trendingMovies: [],
  topRatedMovies: [],
  nowPlayingMovies: [],
  upcomingMovies: [],
};
const emptyPage = { page: 1, totalPages: 1, totalResults: 0, results: [] };

function series(id: number): Series {
  return {
    id,
    mediaType: "series",
    title: `Series ${id}`,
    overview: "",
    posterPath: null,
    backdropPath: null,
    year: 2020,
    rating: 7,
    genres: ["Drama"],
    cast: [],
    status: "Returning Series",
    numberOfSeasons: dataset.seasonCount,
    numberOfEpisodes: dataset.seasonCount * 8,
    seasons: Array.from({ length: dataset.seasonCount }, (_, index) => ({
      id: id * 1000 + index,
      seasonNumber: index + 1,
      name: `Season ${index + 1}`,
      overview: "",
      airDate: "2020-01-01",
      episodeCount: 8,
      episodes: [],
    })),
    nextEpisodeToAir: null,
  };
}

function season(seriesId: number, seasonNumber: number) {
  return {
    id: seriesId * 1000 + seasonNumber,
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: "",
    airDate: "2020-01-01",
    episodeCount: 8,
    episodes: Array.from({ length: 8 }, (_, index) => ({
      id: seriesId * 100000 + seasonNumber * 100 + index + 1,
      seasonNumber,
      episodeNumber: index + 1,
      title: `Episode ${index + 1}`,
      overview: "",
      airDate: "2020-01-01",
      runtime: 45,
    })),
  };
}

function episodeProgressOf(seriesId: number) {
  const watched = dataset.tracked.find((series) => series.seriesId === seriesId)?.watchedEpisodes ?? 0;
  return Array.from({ length: watched }, (_, index) =>
    makeEpisodeProgress({
      seriesId,
      episodeId: seriesId * 100000 + 100 + index + 1,
      seasonNumber: 1,
      episodeNumber: index + 1,
    })
  );
}

function localFixture(command: string, args: Record<string, unknown> | undefined): unknown {
  switch (command) {
    case "get_preferences":
    case "refresh_preferences":
      return { ...defaultPreferences, activeProfileId: PROFILE };
    case "list_profiles":
      return [{ id: PROFILE, name: "Default", avatar: null, createdAt: "", updatedAt: "", hasPin: false }];
    case "get_boot_recovery":
      return { recovered: false, blocked: false };
    case "list_library": {
      const mediaType = args?.mediaType as string | null | undefined;
      return dataset.library.filter((item) => !mediaType || item.mediaType === mediaType);
    }
    case "list_library_page":
      return { items: dataset.library.slice(0, 60), nextCursor: null };
    case "list_library_media_keys":
      return dataset.library.map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType }));
    case "list_library_ids_matching_filters":
      return [];
    case "get_library_status_counts":
      return { planned: 3, watching: 2, paused: 0, completed: 4, dropped: 0 };
    case "list_tracked_series":
      return dataset.tracked;
    case "get_episode_progress":
      return episodeProgressOf(args?.seriesId as number);
    case "get_episode_progress_batch":
      return (args?.seriesIds as number[]).flatMap((seriesId) => episodeProgressOf(seriesId));
    case "list_seen_movie_ids":
      return [];
    case "list_library_keys_among":
      return (args?.keys as Array<{ mediaId: number; mediaType: string }>).filter((key) =>
        dataset.library.some((item) => item.mediaId === key.mediaId && item.mediaType === key.mediaType)
      );
    case "list_all_custom_list_items":
      return Array.from({ length: dataset.listCount }, (_, listIndex) =>
        dataset.library.slice(0, 3).map((item, index) => ({
          id: `list-${listIndex}-item-${index}`,
          listId: `list-${listIndex}`,
          mediaId: item.mediaId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: null,
          position: index,
          addedAt: "",
          updatedAt: "",
        }))
      ).flat();
    case "is_movie_seen":
    case "has_library_item":
      return false;
    case "get_library_item":
      return null;
    case "list_history":
      return dataset.library.slice(0, 12).map((item, index) => ({
        id: `history-${index}`,
        mediaId: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        action: item.mediaType === "movie" ? "movie:watched" : "season:watched",
        timestamp: "2026-01-01T00:00:00.000Z",
        seasonNumber: item.mediaType === "series" ? 1 : null,
      }));
    case "list_custom_lists":
      return Array.from({ length: dataset.listCount }, (_, index) => ({
        id: `list-${index}`,
        profileId: PROFILE,
        name: `List ${index}`,
        description: null,
        createdAt: "",
        updatedAt: "",
      }));
    case "list_custom_list_items":
      return dataset.library.slice(0, 3).map((item, index) => ({
        id: `list-item-${index}`,
        listId: args?.listId,
        mediaId: item.mediaId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: null,
        position: index,
        addedAt: "",
        updatedAt: "",
      }));
    case "list_smart_lists":
    case "list_saved_filters":
    case "list_dismissed_recommendations":
    case "list_availability_alerts":
    case "list_availability_snapshots":
    case "list_library_distinct_tags":
    case "list_viewing_events_for_media":
    case "list_recent_viewing_events":
    case "list_viewing_events_for_year":
    case "list_yearly_activity":
    case "list_on_this_day_events":
    case "list_planned_library_candidates":
    case "list_completed_library_candidates":
    case "list_stale_planned_library_items":
    case "list_sync_outbox":
    case "list_sync_conflicts":
      return [];
    case "get_best_recommendation_seed":
      return null;
    case "tmdb_request":
      return {};
    default:
      return null;
  }
}

const invokeMock = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  calls.push(command);
  return localFixture(command, args);
});
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: Record<string, unknown>) => invokeMock(command, args),
}));

// TMDB is network, not SQLite, but it is the same budget from the user's
// point of view: every request goes through one provider, counted here by
// method (`tmdb:getSeriesDetails`) in the same list as the local commands.
vi.mock("@/features/media/media-repository", () => {
  const answer = (name: string, args: unknown[]) => {
    calls.push(`tmdb:${name}`);
    switch (name) {
      case "getHomeFeed":
        return homeFeed;
      case "getSeriesDetails":
        return series(args[0] as number);
      case "getSeasonDetails":
        return season(args[0] as number, args[1] as number);
      case "getMovieDetails":
        return { ...series(args[0] as number), mediaType: "movie" };
      case "getWatchProviders":
      case "getVideos":
        return [];
      case "getWatchAvailability":
        return { region: "FR", flatrate: [], rent: [], buy: [] };
      default:
        return emptyPage;
    }
  };
  return {
    TmdbRequestError: class extends Error {},
    mediaRepository: new Proxy(
      {},
      {
        get:
          (_target, name) =>
          async (...args: unknown[]) =>
            answer(String(name), args),
      }
    ),
  };
});

vi.mock("@/features/desktop", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    tokenVault: { initialize: async () => undefined, getToken: async () => "token", configured: true },
  };
});
vi.mock("@/features/desktop/use-token-vault", () => ({ useTokenVault: () => ({ configured: true }) }));

type RouterInstance = typeof RouterInstanceValue;
// The app's own router, rebuilt on a fresh in-memory history for each page
// load so the location and every route's loader state start clean.
let currentRouter: RouterInstance;
vi.mock("@/app/router", () => ({
  AppRouter: () => <RouterProvider router={currentRouter} />,
}));

const signedOutAuth: AuthContextValue = {
  configured: false,
  required: false,
  status: "ready",
  session: null,
  user: null,
  error: null,
  errorDetail: null,
  clearError: () => undefined,
  signInWithProvider: async () => undefined,
  requestEmailOtp: async () => undefined,
  verifyEmailOtp: async () => undefined,
  signOut: async () => undefined,
};

/** Resolves once no call has been made for `quietMs`, so lazy children and cascades have all run. Gives up after `capMs`: a page that never goes quiet is itself a finding. */
async function settle(quietMs = 700, capMs = 12_000) {
  const startedAt = Date.now();
  let last = -1;
  let stableSince = Date.now();
  while (Date.now() - startedAt < capMs) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    if (calls.length !== last) {
      last = calls.length;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) return true;
  }
  return false;
}

async function load(path: string, size: number): Promise<Map<string, number>> {
  dataset = buildDataset(size);
  calls.length = 0;
  const { router } = await import("@/app/router-config");
  const { App } = await import("@/app/App");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false } },
  });
  currentRouter = createRouter({
    ...router.options,
    history: createMemoryHistory({ initialEntries: [path] }),
  }) as unknown as typeof router;
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={signedOutAuth}>
        <App />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  console.info("[ipc] rendered", path, size);
  const quiet = await settle();
  console.info("[ipc] settled", quiet, calls.length);
  if (!quiet) calls.push("UNSETTLED");
  const counts = new Map<string, number>();
  for (const call of calls) counts.set(call, (counts.get(call) ?? 0) + 1);
  cleanup();
  client.clear();
  return counts;
}

/** Commands whose call count differs between the two dataset sizes, with both counts. */
function growth(small: Map<string, number>, large: Map<string, number>) {
  const commands = new Set([...small.keys(), ...large.keys()]);
  return [...commands]
    .map((command) => ({ command, small: small.get(command) ?? 0, large: large.get(command) ?? 0 }))
    .filter((row) => row.large > row.small);
}

// TMDB requests are counted and printed, but not asserted flat: resolving each
// followed series' next episode is one request per series by design (cached
// 30 min to 24 h). Local calls are the property.
function localGrowth(rows: ReturnType<typeof growth>) {
  return rows.filter((row) => !row.command.startsWith("tmdb:"));
}

const total = (counts: Map<string, number>) => [...counts.values()].reduce((sum, count) => sum + count, 0);

beforeEach(() => {
  invokeMock.mockClear();
  void makeViewingEvent;
});
afterEach(() => cleanup());

describe("calls per page load", () => {
  const pages: Array<{ name: string; path: string }> = [
    { name: "home", path: "/" },
    { name: "library", path: "/library" },
    { name: "movies hub", path: "/movies" },
    { name: "series hub", path: "/series" },
    { name: "series with many seasons", path: "/series/1" },
    { name: "statistics", path: "/stats" },
  ];

  for (const page of pages) {
    it(`${page.name}: the number of calls does not grow with the library`, async () => {
      const small = await load(page.path, SMALL);
      const large = await load(page.path, LARGE);
      const grown = growth(small, large);
      console.info(
        `[ipc] ${page.name}: ${total(small)} calls at ${SMALL} titles, ${total(large)} at ${LARGE}` +
          (grown.length
            ? `\n  grows: ${grown.map((row) => `${row.command} ${row.small}->${row.large}`).join(", ")}`
            : "") +
          `\n  at ${LARGE}: ${[...large.entries()].map(([command, count]) => `${command}x${count}`).join(" ")}`
      );
      expect(localGrowth(grown)).toEqual([]);
    }, 120_000);
  }
});
