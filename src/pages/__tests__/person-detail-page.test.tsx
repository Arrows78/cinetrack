import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { PersonDetailPage } from "../person-detail-page";
import type { MediaSummary, PersonDetail } from "@/types/media";

let personIdParam = "5";
vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ personId: personIdParam }),
  Link: ({
    children,
    to,
    params,
    className,
  }: PropsWithChildren<{ to: string; params?: Record<string, string>; className?: string }>) => (
    <a href={params ? `${to}::${JSON.stringify(params)}` : to} className={className}>
      {children}
    </a>
  ),
}));

// PersonDetailPage's own logic is about deriving the header/filmography from
// usePerson's result — MediaGrid's rendering of `knownFor` items is covered
// elsewhere, so stub it down to the titles it received, same pattern as
// library-page.test.tsx's MediaGrid mock.
vi.mock("@/components/media/primitives/media-grid", () => ({
  MediaGrid: ({ items }: { items: MediaSummary[] }) => (
    <div data-testid="grid">
      {items.map((item) => (
        <div key={`${item.mediaType}-${item.id}`}>{item.title}</div>
      ))}
    </div>
  ),
}));

const personQueryMock = vi.fn();
vi.mock("@/features/media/use-discovery", () => ({
  usePerson: (personId: number) => personQueryMock(personId),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PersonDetailPage />
    </QueryClientProvider>
  );
}

function personDetail(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 5,
    name: "Denis Villeneuve",
    profilePath: null,
    knownForDepartment: "Directing",
    knownFor: [],
    biography: "",
    birthday: null,
    deathday: null,
    placeOfBirth: null,
    alsoKnownAs: [],
    imdbId: null,
    filmography: [],
    ...overrides,
  };
}

describe("PersonDetailPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    personIdParam = "5";
    personQueryMock.mockReset();
  });

  it("shows the not-found state for a malformed person id", () => {
    personIdParam = "not-a-number";
    personQueryMock.mockReturnValue({ isPending: false, isError: false, data: undefined, refetch: vi.fn() });

    renderPage();

    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("shows a remote error state with a working retry when the query fails", () => {
    const refetch = vi.fn();
    personQueryMock.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("boom"),
      data: undefined,
      refetch,
    });

    renderPage();

    const retryButton = screen.getByRole("button", { name: "Try again" });
    retryButton.click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton while the query is pending", () => {
    personQueryMock.mockReturnValue({ isPending: true, isError: false, data: undefined, refetch: vi.fn() });

    const { container } = renderPage();

    expect(container.querySelector(".animate-shimmer")).toBeInTheDocument();
  });

  it("renders the person's name, department, and known-for grid", () => {
    personQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: personDetail({
        knownFor: [
          { id: 1, mediaType: "movie", title: "Dune", overview: "", genres: [], cast: [] },
          { id: 2, mediaType: "movie", title: "Arrival", overview: "", genres: [], cast: [] },
        ] as MediaSummary[],
      }),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Denis Villeneuve" })).toBeInTheDocument();
    expect(screen.getByText("Directing")).toBeInTheDocument();
    expect(screen.getByText("Known filmography")).toBeInTheDocument();

    const grid = screen.getByTestId("grid");
    expect(grid).toHaveTextContent("Dune");
    expect(grid).toHaveTextContent("Arrival");
  });

  it("renders biography, birth/death info, place of birth, and the IMDb link", () => {
    personQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: personDetail({
        biography: "A celebrated filmmaker.",
        birthday: "1967-10-03",
        deathday: null,
        placeOfBirth: "Trois-Rivières, Canada",
        alsoKnownAs: ["D. Villeneuve"],
        imdbId: "nm0898288",
      }),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("A celebrated filmmaker.")).toBeInTheDocument();
    expect(screen.getByText(/Born 03 Oct 1967/)).toBeInTheDocument();
    expect(screen.getByText("Born in Trois-Rivières, Canada")).toBeInTheDocument();
    expect(screen.getByText(/D\. Villeneuve/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View on IMDb/ })).toHaveAttribute(
      "href",
      "https://www.imdb.com/name/nm0898288/"
    );
  });

  it("falls back to the no-biography message when there is none", () => {
    personQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: personDetail({ biography: "" }),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("No biography available.")).toBeInTheDocument();
  });

  it("renders the full filmography, most recent credit first, with role and episode count", () => {
    personQueryMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: personDetail({
        filmography: [
          {
            id: 10,
            mediaType: "series",
            title: "A Show",
            overview: "",
            genres: [],
            cast: [],
            year: 2022,
            role: "Director",
            department: "crew",
            episodeCount: 5,
          },
          {
            id: 11,
            mediaType: "movie",
            title: "A Movie",
            overview: "",
            genres: [],
            cast: [],
            year: 2010,
            role: "Hero",
            department: "cast",
          },
        ],
      }),
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("Full filmography")).toBeInTheDocument();
    expect(screen.getByText("A Show")).toBeInTheDocument();
    expect(screen.getByText("Director")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "2022 · 5 episodes")).toBeInTheDocument();
    expect(screen.getByText("A Movie")).toBeInTheDocument();
    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /A Movie/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/movies/$movieId")
    );
    expect(screen.getByRole("link", { name: /A Show/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/series/$seriesId")
    );
  });
});
