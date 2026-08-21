import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import i18n from "@/i18n";
import { SeriesPage } from "../series-page";

// LibraryExplorer/TrackingList/MediaListView already have their own coverage
// (via LibraryPage/TrackingPage/etc.) — shallow-stub them so assertions here
// target only what SeriesPage itself decides: which tab renders which
// component, with which props, and the tab switching.
vi.mock("@/components/media/library-explorer", () => ({
  LibraryExplorer: ({
    lockedMediaType,
    onBrowseAll,
    browseAllLabel,
  }: {
    lockedMediaType?: "movie" | "series";
    onBrowseAll?: () => void;
    browseAllLabel?: string;
  }) => (
    <div data-testid="library-explorer" data-locked-media-type={lockedMediaType}>
      <span>{browseAllLabel}</span>
      <button type="button" onClick={onBrowseAll}>
        library-explorer-browse-all
      </button>
    </div>
  ),
}));

vi.mock("@/components/media/tracking-list", () => ({
  TrackingList: ({
    lockedMediaType,
    onBrowseAll,
    browseAllLabel,
  }: {
    lockedMediaType?: "movie" | "series";
    onBrowseAll?: () => void;
    browseAllLabel?: string;
  }) => (
    <div data-testid="tracking-list" data-locked-media-type={lockedMediaType}>
      <span>{browseAllLabel}</span>
      <button type="button" onClick={onBrowseAll}>
        tracking-list-browse-all
      </button>
    </div>
  ),
}));

vi.mock("@/components/media/media-list-view", () => ({
  MediaListView: ({ title, icon: Icon }: { title: string; icon: LucideIcon }) => (
    <div data-testid="media-list-view">
      <Icon aria-hidden="true" />
      <span>{title}</span>
    </div>
  ),
}));

const useSeriesMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useSeries: () => useSeriesMock(),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<SeriesPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("SeriesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useSeriesMock.mockReset().mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      items: [],
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
  });

  it("defaults to the list tab, rendering LibraryExplorer locked to series", () => {
    renderPage();

    const explorer = screen.getByTestId("library-explorer");
    expect(explorer).toHaveAttribute("data-locked-media-type", "series");
    expect(screen.queryByTestId("tracking-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("media-list-view")).not.toBeInTheDocument();
  });

  it("switches to TrackingList locked to series when the Upcoming filter is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));

    const tracking = screen.getByTestId("tracking-list");
    expect(tracking).toHaveAttribute("data-locked-media-type", "series");
    expect(screen.queryByTestId("library-explorer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("media-list-view")).not.toBeInTheDocument();
  });

  it("switches to MediaListView with the discover title when the Discover filter is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Discover" }));

    const mediaListView = screen.getByTestId("media-list-view");
    expect(mediaListView).toBeInTheDocument();
    expect(within(mediaListView).getByText("Discover")).toBeInTheDocument();
    expect(screen.queryByTestId("library-explorer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tracking-list")).not.toBeInTheDocument();
  });

  it("jumps to the Discover tab when LibraryExplorer's onBrowseAll is invoked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "library-explorer-browse-all" }));

    expect(screen.getByTestId("media-list-view")).toBeInTheDocument();
    expect(screen.queryByTestId("library-explorer")).not.toBeInTheDocument();
  });

  it("jumps to the Discover tab when TrackingList's onBrowseAll is invoked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    fireEvent.click(screen.getByRole("button", { name: "tracking-list-browse-all" }));

    expect(screen.getByTestId("media-list-view")).toBeInTheDocument();
    expect(screen.queryByTestId("tracking-list")).not.toBeInTheDocument();
  });
});
