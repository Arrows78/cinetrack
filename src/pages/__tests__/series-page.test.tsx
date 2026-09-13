import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { SeriesPage } from "../series-page";
import type * as TanstackRouterModule from "@tanstack/react-router";

// LibraryExplorer already has its own coverage (via LibraryPage etc.) —
// shallow-stub it so assertions here target only what SeriesPage itself
// decides: which props LibraryExplorer gets, and the page's own browse-all
// wiring.
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

  it("renders LibraryExplorer locked to series, with no view-switching tabs", () => {
    renderPage();

    const explorer = screen.getByTestId("library-explorer");
    expect(explorer).toHaveAttribute("data-locked-media-type", "series");
    // Upcoming duplicated the standalone Tracking page filtered to series —
    // dropped in favor of Tracking being the one place for that, so there's
    // nothing left here to switch between.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
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
});
