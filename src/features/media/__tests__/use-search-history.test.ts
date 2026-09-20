import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchHistory } from "../use-search-history";

const updatePreferenceMock = vi.fn();
let recentSearches: string[] = [];

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: { recentSearches }, updatePreference: updatePreferenceMock }),
}));

describe("useSearchHistory", () => {
  it("adds a new query to the front of an empty history", () => {
    recentSearches = [];
    updatePreferenceMock.mockReset();
    const { result } = renderHook(() => useSearchHistory());

    result.current.addSearch("dune");

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: ["dune"] });
  });

  it("ignores a blank or whitespace-only query", () => {
    recentSearches = ["dune"];
    updatePreferenceMock.mockReset();
    const { result } = renderHook(() => useSearchHistory());

    result.current.addSearch("   ");

    expect(updatePreferenceMock).not.toHaveBeenCalled();
  });

  it("moves a re-searched query to the front instead of duplicating it, case-insensitively", () => {
    recentSearches = ["batman", "dune", "alien"];
    updatePreferenceMock.mockReset();
    const { result } = renderHook(() => useSearchHistory());

    result.current.addSearch("DUNE");

    expect(updatePreferenceMock).toHaveBeenCalledWith({
      key: "recentSearches",
      value: ["DUNE", "batman", "alien"],
    });
  });

  it("caps the history at 8 entries, dropping the oldest", () => {
    recentSearches = Array.from({ length: 8 }, (_, i) => `query ${i}`);
    updatePreferenceMock.mockReset();
    const { result } = renderHook(() => useSearchHistory());

    result.current.addSearch("newest");

    const [{ value }] = updatePreferenceMock.mock.calls[0] as [{ value: string[] }];
    expect(value).toHaveLength(8);
    expect(value[0]).toBe("newest");
    expect(value).not.toContain("query 7");
  });

  it("removes a single entry", () => {
    recentSearches = ["dune", "batman"];
    updatePreferenceMock.mockReset();
    const { result } = renderHook(() => useSearchHistory());

    result.current.removeSearch("dune");

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: ["batman"] });
  });

  it("clears the whole history", () => {
    recentSearches = ["dune", "batman"];
    updatePreferenceMock.mockReset();
    const { result } = renderHook(() => useSearchHistory());

    result.current.clearHistory();

    expect(updatePreferenceMock).toHaveBeenCalledWith({ key: "recentSearches", value: [] });
  });
});
