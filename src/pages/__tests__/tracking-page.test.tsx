import { useEffect, useState } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import i18n from "@/i18n";
import { TrackingPage } from "../tracking-page";

// Same fake router as search-page.test.tsx/history-page.test.tsx: `mockNavigate`
// mutates a shared "current URL search string" and `useSearch` polls it, so
// TrackingPage's own URL-sync behavior (SavedFiltersBar apply, chip removal)
// is exercised faithfully instead of against a stubbed-out no-op.
const { getRouterSearch, setRouterSearch, mockNavigate } = vi.hoisted(() => {
  let search = "";
  const getRouterSearch = () => search;
  const setRouterSearch = (next: string) => {
    search = next;
  };
  const mockNavigate = vi.fn(
    (opts: { search: (prev: Record<string, string | undefined>) => Record<string, string | undefined> }) => {
      const prevParams = new URLSearchParams(search);
      const prevObj: Record<string, string | undefined> = {};
      prevParams.forEach((value, key) => {
        prevObj[key] = value;
      });
      const nextObj = opts.search(prevObj);
      const nextParams = new URLSearchParams();
      Object.entries(nextObj).forEach(([key, value]) => {
        if (value !== undefined && value !== "") nextParams.set(key, value);
      });
      const nextSearch = nextParams.toString();
      setRouterSearch(nextSearch ? `?${nextSearch}` : "");
    }
  );
  return { getRouterSearch, setRouterSearch, mockNavigate };
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => {
    const [, forceRender] = useState(0);
    useEffect(() => {
      let search = getRouterSearch();
      const interval = window.setInterval(() => {
        const current = getRouterSearch();
        if (current !== search) {
          search = current;
          forceRender((tick) => tick + 1);
        }
      }, 10);
      return () => window.clearInterval(interval);
    }, []);
    const params = new URLSearchParams(getRouterSearch());
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  },
}));

// Rendered for real (its own save/apply/delete behavior is covered by
// saved-filters-bar.test.tsx) but stubbed to a fixed, empty list here so this
// suite's own filter/URL assertions don't also need a real invoke() round-trip.
const savedFiltersState = {
  data: [] as Array<{ id: string; name: string }>,
  isLoading: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  isSaving: false,
};
vi.mock("@/features/saved-filters/use-saved-filters", () => ({
  useSavedFilters: () => savedFiltersState,
}));

// TrackingList has its own coverage via tracking-list.test.tsx and
// MoviesPage/SeriesPage composition elsewhere — shallow-mock it so this test
// only asserts TrackingPage's own header/URL-sync/chips wiring, not
// TrackingList's internals. Renders the received filter props as data
// attributes, and a button per setter, so tests can assert wiring without
// needing FilterBar's real markup.
vi.mock("@/components/media/tracking/tracking-list", () => ({
  TrackingList: ({
    scopeFilter,
    onScopeFilterChange,
    typeFilter,
    onTypeFilterChange,
    sort,
    onSortChange,
  }: {
    scopeFilter: string;
    onScopeFilterChange: (value: string) => void;
    typeFilter: string;
    onTypeFilterChange: (value: string) => void;
    sort: string;
    onSortChange: (value: string) => void;
  }) => (
    <div data-testid="tracking-list" data-scope={scopeFilter} data-type={typeFilter} data-sort={sort}>
      <button type="button" onClick={() => onScopeFilterChange("all")}>
        set-scope-all
      </button>
      <button type="button" onClick={() => onTypeFilterChange("release")}>
        set-type-release
      </button>
      <button type="button" onClick={() => onSortChange("title")}>
        set-sort-title
      </button>
    </div>
  ),
}));

describe("TrackingPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setRouterSearch("");
  });

  it("renders its header and mounts TrackingList", () => {
    render(<TrackingPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Tracking" })).toBeInTheDocument();
    expect(
      screen.getByText("Release dates, upcoming episodes, and availability alerts for what you're following.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("tracking-list")).toBeInTheDocument();
  });

  it("defaults scope/type/sort and reads them back from the URL on a deep link", () => {
    setRouterSearch("?scope=all&type=release&sort=title");
    render(<TrackingPage />);

    const list = screen.getByTestId("tracking-list");
    expect(list).toHaveAttribute("data-scope", "all");
    expect(list).toHaveAttribute("data-type", "release");
    expect(list).toHaveAttribute("data-sort", "title");
  });

  it("pushes TrackingList's own filter/sort changes into the URL", async () => {
    render(<TrackingPage />);

    fireEvent.click(screen.getByRole("button", { name: "set-type-release" }));
    await waitFor(() => expect(getRouterSearch()).toContain("type=release"));

    fireEvent.click(screen.getByRole("button", { name: "set-sort-title" }));
    await waitFor(() => expect(getRouterSearch()).toContain("sort=title"));
  });

  it("shows a removable chip for a non-default filter and clears it via the chip", async () => {
    setRouterSearch("?type=release");
    render(<TrackingPage />);

    const chipLabel = i18n.t("filters.chips.type", { value: i18n.t("tracking.typeRelease") });
    const chip = screen.getByRole("button", { name: i18n.t("filters.removeFilter", { filter: chipLabel }) });
    fireEvent.click(chip);

    await waitFor(() => expect(getRouterSearch()).not.toContain("type"));
  });

  it("clears every active filter at once from the chips row's own clear-all action", async () => {
    setRouterSearch("?scope=all&type=release&sort=title");
    render(<TrackingPage />);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("filters.clearAll") }));

    await waitFor(() => {
      const search = getRouterSearch();
      expect(search).not.toContain("scope");
      expect(search).not.toContain("type");
      expect(search).not.toContain("sort");
    });
  });
});
