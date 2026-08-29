import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SeriesPage } from "../series-page";
import type * as TanstackRouterModule from "@tanstack/react-router";

// LibraryExplorer/TrackingList already have their own coverage (via
// LibraryPage/TrackingPage/etc.) — shallow-stub them so assertions here
// target only what SeriesPage itself decides: which tab renders which
// component, with which props, and the tab switching.
vi.mock("@/components/media/library/library-explorer", () => ({
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

vi.mock("@/components/media/tracking/tracking-list", () => ({
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

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof TanstackRouterModule>("@tanstack/react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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
    navigateMock.mockReset();
  });

  it("defaults to the list tab, rendering LibraryExplorer locked to series", () => {
    renderPage();

    const explorer = screen.getByTestId("library-explorer");
    expect(explorer).toHaveAttribute("data-locked-media-type", "series");
    expect(screen.queryByTestId("tracking-list")).not.toBeInTheDocument();
  });

  it("switches to TrackingList locked to series when the Upcoming filter is clicked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));

    const tracking = screen.getByTestId("tracking-list");
    expect(tracking).toHaveAttribute("data-locked-media-type", "series");
    expect(screen.queryByTestId("library-explorer")).not.toBeInTheDocument();
  });

  it("does not render a Discover filter option", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: "Discover" })).not.toBeInTheDocument();
  });

  it("navigates to /search scoped to series when LibraryExplorer's onBrowseAll is invoked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "library-explorer-browse-all" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/search", search: { scope: "series" } });
  });

  it("navigates to /search scoped to series when TrackingList's onBrowseAll is invoked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Upcoming" }));
    fireEvent.click(screen.getByRole("button", { name: "tracking-list-browse-all" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/search", search: { scope: "series" } });
  });
});
