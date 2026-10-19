import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type PropsWithChildren } from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/shared/constants/query-keys";
import { useSearchHistory } from "../use-search-history";

const setPreferenceMock = vi.fn();
let recentSearches: string[] = [];
// Simulates the preferences read not having succeeded (still loading, or failed).
let preferencesUnavailable = false;

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: preferencesUnavailable ? undefined : { recentSearches },
    setPreference: setPreferenceMock,
  }),
}));

let client: QueryClient;
function renderHistory() {
  // The hook reads the latest list from the cache when it writes, as the real
  // preferences query keeps it there.
  if (!preferencesUnavailable) client.setQueryData(queryKeys.local.preferences, { recentSearches });
  return renderHook(() => useSearchHistory(), {
    wrapper: ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children),
  });
}

describe("useSearchHistory", () => {
  beforeEach(() => {
    preferencesUnavailable = false;
    client = new QueryClient();
  });

  it("builds a write from the list as it is now, not from the one captured by an earlier render", () => {
    recentSearches = ["alien"];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    // A first write lands (cache updated) after this render captured ["alien"].
    client.setQueryData(queryKeys.local.preferences, { recentSearches: ["dune", "alien"] });
    result.current.addSearch("batman");

    expect(setPreferenceMock).toHaveBeenCalledWith({
      key: "recentSearches",
      value: ["batman", "dune", "alien"],
    });
  });

  it("removes from the latest list too", () => {
    recentSearches = ["alien"];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    client.setQueryData(queryKeys.local.preferences, { recentSearches: ["dune", "alien"] });
    result.current.removeSearch("alien");

    expect(setPreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: ["dune"] });
  });

  it("starts from an empty list when the cache has none but the read succeeded", () => {
    recentSearches = [];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    client.setQueryData(queryKeys.local.preferences, {});
    result.current.addSearch("dune");

    expect(setPreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: ["dune"] });
  });

  it("never overwrites the stored history with a lone entry when the preferences could not be read", () => {
    preferencesUnavailable = true;
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.addSearch("dune");
    result.current.removeSearch("batman");

    // An unread history looks empty: writing "dune" over it would erase the
    // seven real entries behind the failed read.
    expect(setPreferenceMock).not.toHaveBeenCalled();
  });

  it("adds a new query to the front of an empty history", () => {
    recentSearches = [];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.addSearch("dune");

    expect(setPreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: ["dune"] });
  });

  it("ignores a blank or whitespace-only query", () => {
    recentSearches = ["dune"];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.addSearch("   ");

    expect(setPreferenceMock).not.toHaveBeenCalled();
  });

  it("moves a re-searched query to the front instead of duplicating it, case-insensitively", () => {
    recentSearches = ["batman", "dune", "alien"];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.addSearch("DUNE");

    expect(setPreferenceMock).toHaveBeenCalledWith({
      key: "recentSearches",
      value: ["DUNE", "batman", "alien"],
    });
  });

  it("caps the history at 8 entries, dropping the oldest", () => {
    recentSearches = Array.from({ length: 8 }, (_, i) => `query ${i}`);
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.addSearch("newest");

    const [{ value }] = setPreferenceMock.mock.calls[0] as [{ value: string[] }];
    expect(value).toHaveLength(8);
    expect(value[0]).toBe("newest");
    expect(value).not.toContain("query 7");
  });

  it("removes a single entry", () => {
    recentSearches = ["dune", "batman"];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.removeSearch("dune");

    expect(setPreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: ["batman"] });
  });

  it("clears the whole history", () => {
    recentSearches = ["dune", "batman"];
    setPreferenceMock.mockReset();
    const { result } = renderHistory();

    result.current.clearHistory();

    expect(setPreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: [] });
  });
});
