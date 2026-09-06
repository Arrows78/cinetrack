import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Query } from "@tanstack/react-query";
import { handleMutationError, shouldDehydrateQuery } from "@/app/query-client";
import { queryKeys } from "@/shared/constants/query-keys";

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

const loggerErrorMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({ logger: { error: (...args: unknown[]) => loggerErrorMock(...args) } }));

// shouldDehydrateQuery (and the defaultShouldDehydrateQuery it composes
// with) only ever reads query.queryKey and query.state.status, so a plain
// object shaped like those two fields is enough — no need to spin up a
// real QueryClient/QueryCache just to get a Query instance.
function makeQuery(queryKey: readonly unknown[], status: "success" | "error" | "pending"): Query {
  return { queryKey, state: { status } } as unknown as Query;
}

describe("shouldDehydrateQuery", () => {
  it("persists successful remote.* queries", () => {
    const remoteKeys: (readonly unknown[])[] = [
      queryKeys.remote.movies,
      queryKeys.remote.movieDetails(42),
      queryKeys.remote.series,
      queryKeys.remote.seriesDetails(7),
      queryKeys.remote.seasonDetails(7, 1),
      queryKeys.remote.search("dune", "movie"),
      queryKeys.remote.discover("28", "18", "netflix", "movie", "FR"),
      queryKeys.remote.providers("movie", "FR"),
      queryKeys.remote.home,
      queryKeys.remote.recommendations("movie", 42),
      queryKeys.remote.videos("movie", 42),
      queryKeys.remote.person(1),
      queryKeys.remote.people("denis"),
      queryKeys.remote.popularPeople,
      queryKeys.remote.availability("movie", 42, "FR"),
    ];

    for (const key of remoteKeys) {
      expect(shouldDehydrateQuery(makeQuery(key, "success"))).toBe(true);
    }
  });

  it("never persists any local.* query, regardless of status", () => {
    const localKeys: (readonly unknown[])[] = [
      queryKeys.local.history("profile-1"),
      queryKeys.local.preferences,
      queryKeys.local.movieSeen("profile-1", 42),
      queryKeys.local.episodeProgress("profile-1", 7),
      queryKeys.local.trackedSeries("profile-1"),
      queryKeys.local.stats("profile-1"),
      queryKeys.local.library("profile-1"),
      queryKeys.local.libraryItem("profile-1", "movie", 42),
      queryKeys.local.profiles,
      queryKeys.local.customLists("profile-1"),
      queryKeys.local.customList("profile-1", "list-1"),
      queryKeys.local.calendar("profile-1"),
      queryKeys.local.availabilityAlerts("profile-1"),
      queryKeys.local.tracking("profile-1"),
      queryKeys.local.watchTonight("profile-1"),
      queryKeys.local.watchNextEpisode("profile-1", 7),
    ];

    for (const key of localKeys) {
      expect(shouldDehydrateQuery(makeQuery(key, "success"))).toBe(false);
      expect(shouldDehydrateQuery(makeQuery(key, "error"))).toBe(false);
      expect(shouldDehydrateQuery(makeQuery(key, "pending"))).toBe(false);
    }
  });

  it("does not persist a remote.* query that failed or hasn't settled", () => {
    expect(shouldDehydrateQuery(makeQuery(queryKeys.remote.movies, "error"))).toBe(false);
    expect(shouldDehydrateQuery(makeQuery(queryKeys.remote.movies, "pending"))).toBe(false);
  });
});

// Every useMutation()/useInvalidatingMutation() in the app is wired through
// queryClient's MutationCache.onError to this function (see query-client.ts)
// so a failed user-triggered action is never silent — this is the one place
// that guarantee is actually implemented, so it's the one place to test it.
describe("handleMutationError", () => {
  beforeEach(() => {
    toastMock.mockReset();
    loggerErrorMock.mockReset();
  });

  function makeMutation(suppressErrorToast?: boolean) {
    return { options: { meta: suppressErrorToast === undefined ? undefined : { suppressErrorToast } } };
  }

  it("logs the error and shows a translated error toast by default", () => {
    handleMutationError(new Error("sql.execute not allowed"), makeMutation());

    expect(loggerErrorMock).toHaveBeenCalledWith(expect.stringContaining("sql.execute not allowed"));
    expect(toastMock).toHaveBeenCalledWith({ description: "That didn't work. Please try again.", variant: "error" });
  });

  it("never leaks a raw error message into the toast", () => {
    handleMutationError(new Error("PGRST301: JWT expired"), makeMutation());

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.not.stringContaining("PGRST301") })
    );
  });

  it("still logs, but skips the toast, when the mutation opts out via meta.suppressErrorToast", () => {
    handleMutationError(new Error("boom"), makeMutation(true));

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    expect(toastMock).not.toHaveBeenCalled();
  });
});
