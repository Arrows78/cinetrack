import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import type { Movie } from "@/types/media";
import { MovieDetailPage } from "../movie-detail-page";

// Route param holder — mutable so a single test can override it to a
// non-numeric value to exercise the not-found guard.
const params = { movieId: "42" as string };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  useParams: () => params,
}));

const movieQueryMock = vi.fn();
vi.mock("@/features/media/use-media", () => ({
  useMovieDetails: () => movieQueryMock(),
}));

const seenQueryMock = vi.fn();
const toggleMovieSeenMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useMovieSeen: () => seenQueryMock(),
}));

vi.mock("@/features/media/use-image-cache", () => ({
  useImageCache: () => undefined,
}));

// Shallow-mock every heavy child so the test targets MovieDetailPage's own
// composition/wiring, not the children's internals.
vi.mock("@/components/media/media-details-hero", () => ({
  MediaDetailsHero: ({
    media,
    actions,
    extra,
  }: {
    media: Movie;
    actions?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <div data-testid="hero">
      <div data-testid="hero-title">{media.title}</div>
      <div data-testid="hero-actions">{actions}</div>
      <div data-testid="hero-extra">{extra}</div>
    </div>
  ),
}));

vi.mock("@/components/library/library-editor", () => ({
  LibraryEditor: () => <div data-testid="library-editor" />,
}));

vi.mock("@/components/media/provider-availability", () => ({
  ProviderAvailability: () => <div data-testid="provider-availability" />,
}));

vi.mock("@/components/media/trailer-panel", () => ({
  TrailerPanel: () => <div data-testid="trailer-panel" />,
}));

vi.mock("@/components/media/recommendations-panel", () => ({
  RecommendationsPanel: () => <div data-testid="recommendations-panel" />,
}));

vi.mock("@/components/media/cast-list", () => ({
  CastList: () => <div data-testid="cast-list" />,
}));

vi.mock("@/components/media/add-to-library-button", () => ({
  AddToLibraryButton: () => <div data-testid="add-to-library-button" />,
}));

vi.mock("@/components/media/availability-alert-button", () => ({
  AvailabilityAlertButton: () => <div data-testid="availability-alert-button" />,
}));

vi.mock("@/components/media/seen-toggle", () => ({
  SeenToggle: ({ seen, disabled, onToggle }: { seen: boolean; disabled?: boolean; onToggle: () => void }) => (
    <button type="button" data-testid="seen-toggle" data-seen={seen} disabled={disabled} onClick={onToggle}>
      seen-toggle
    </button>
  ),
}));

function buildMovie(overrides: Partial<Movie> = {}): Movie {
  return {
    id: 42,
    mediaType: "movie",
    title: "Dune",
    overview: "A boy rises to fulfil a great destiny.",
    genres: ["Science Fiction", "Adventure"],
    country: ["US"],
    language: "English",
    status: "Released",
    cast: [],
    posterPath: null,
    backdropPath: null,
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MovieDetailPage />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("MovieDetailPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    params.movieId = "42";
    movieQueryMock.mockReset().mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildMovie(),
    });
    toggleMovieSeenMock.mockReset().mockResolvedValue(undefined);
    seenQueryMock.mockReset().mockReturnValue({
      data: false,
      isSaving: false,
      isError: false,
      toggleMovieSeen: toggleMovieSeenMock,
    });
  });

  it("renders the not-found empty state for a non-numeric movieId, and nothing else", () => {
    params.movieId = "abc";
    renderPage();

    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("This page doesn't exist.")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("renders a hero skeleton while the movie query is pending", () => {
    movieQueryMock.mockReturnValue({
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    const { container } = renderPage();

    expect(container.querySelector(".rounded-hero")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
  });

  it("renders a remote error state on query failure, and retry triggers refetch", () => {
    const refetch = vi.fn();
    movieQueryMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("network down"),
      refetch,
      data: undefined,
    });

    renderPage();

    expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();

    screen.getByRole("button", { name: /Try again/i }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders overview and technical sheet from movie data, with a fallback for missing fields", () => {
    movieQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: buildMovie({ language: undefined }),
    });

    renderPage();

    expect(screen.getByTestId("hero-title")).toHaveTextContent("Dune");
    expect(screen.getByText("A boy rises to fulfil a great destiny.")).toBeInTheDocument();

    expect(screen.getByText("Country")).toBeInTheDocument();
    expect(screen.getByText("US")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByText("Science Fiction, Adventure")).toBeInTheDocument();
    expect(screen.getByText("Released")).toBeInTheDocument();

    // language is missing on this movie -> falls back to the em dash.
    expect(screen.getByText("—")).toBeInTheDocument();

    expect(screen.getByTestId("hero-actions").querySelector('[data-testid="add-to-library-button"]')).toBeTruthy();
    expect(screen.getByTestId("hero-actions").querySelector('[data-testid="availability-alert-button"]')).toBeTruthy();
  });

  it("toggles seen status with the movie and the flipped watched flag", () => {
    seenQueryMock.mockReturnValue({
      data: false,
      isSaving: false,
      isError: false,
      toggleMovieSeen: toggleMovieSeenMock,
    });
    const movie = buildMovie();
    movieQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: movie,
    });

    renderPage();

    screen.getByTestId("seen-toggle").click();

    expect(toggleMovieSeenMock).toHaveBeenCalledWith({ movie, watched: true });
  });

  it("shows a partial error state alongside the seen toggle when the seen query fails", () => {
    seenQueryMock.mockReturnValue({
      data: undefined,
      isSaving: false,
      isError: true,
      toggleMovieSeen: toggleMovieSeenMock,
    });

    renderPage();

    expect(screen.getByTestId("seen-toggle")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load the watched status — try again in a moment.")).toBeInTheDocument();
    expect(screen.getByTestId("seen-toggle")).toBeDisabled();
  });
});
