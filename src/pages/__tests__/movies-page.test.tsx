import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { MoviesPage } from "../movies-page";
import type * as TanstackRouterModule from "@tanstack/react-router";

// LibraryExplorer already has its own coverage (via LibraryPage etc.) —
// shallow-stub it so assertions here target only what MoviesPage itself
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

const mutateRandomMock = vi.fn();
vi.mock("@/features/library/use-library", () => ({
  useRandomLibraryItem: () => ({ mutate: mutateRandomMock, isPending: false }),
}));

const toastMock = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MoviesPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("MoviesPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    navigateMock.mockReset();
    mutateRandomMock.mockReset();
    toastMock.mockReset();
  });

  it("renders LibraryExplorer locked to movies, with no view-switching tabs", () => {
    renderPage();

    const explorer = screen.getByTestId("library-explorer");
    expect(explorer).toHaveAttribute("data-locked-media-type", "movie");
    // Upcoming duplicated the standalone Tracking page filtered to movies —
    // dropped in favor of Tracking being the one place for that, so there's
    // nothing left here to switch between.
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("does not render a Discover filter option", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: "Discover" })).not.toBeInTheDocument();
  });

  it("navigates to /search scoped to movies when LibraryExplorer's onBrowseAll is invoked", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "library-explorer-browse-all" }));

    expect(navigateMock).toHaveBeenCalledWith({ to: "/search", search: { scope: "movie" } });
  });

  it("navigates to the picked movie when 'Surprise me' resolves with a key", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    const [, options] = mutateRandomMock.mock.calls[0] as [
      unknown,
      { onSuccess: (key: { mediaId: number; mediaType: string } | null) => void },
    ];
    options.onSuccess({ mediaId: 42, mediaType: "movie" });

    expect(mutateRandomMock).toHaveBeenCalledWith("movie", expect.anything());
    expect(navigateMock).toHaveBeenCalledWith({ to: "/movies/$movieId", params: { movieId: "42" } });
  });

  it("toasts instead of navigating when 'Surprise me' finds nothing to pick", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    const [, options] = mutateRandomMock.mock.calls[0] as [unknown, { onSuccess: (key: null) => void }];
    options.onSuccess(null);

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
    expect(navigateMock).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/movies/$movieId" }));
  });
});
