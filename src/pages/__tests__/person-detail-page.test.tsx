import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import i18n from "@/i18n";
import { PersonDetailPage } from "../person-detail-page";
import type { MediaSummary } from "@/types/media";

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ personId: "5" }),
}));

// PersonDetailPage's own logic is about deriving the header/filmography from
// usePerson's result — MediaGrid's rendering of `knownFor` items is covered
// elsewhere, so stub it down to the titles it received, same pattern as
// library-page.test.tsx's MediaGrid mock.
vi.mock("@/components/media/media-grid", () => ({
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

describe("PersonDetailPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    personQueryMock.mockReset();
  });

  it("shows a remote error state with a working retry when the query fails", () => {
    const refetch = vi.fn();
    personQueryMock.mockReturnValue({
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

  it("shows the loading text while there is no data yet", () => {
    personQueryMock.mockReturnValue({
      isError: false,
      error: null,
      data: undefined,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the person's name, department, and filmography grid", () => {
    personQueryMock.mockReturnValue({
      isError: false,
      error: null,
      data: {
        id: 5,
        name: "Denis Villeneuve",
        profilePath: null,
        knownForDepartment: "Directing",
        knownFor: [
          { id: 1, mediaType: "movie", title: "Dune", overview: "", genres: [], cast: [] },
          { id: 2, mediaType: "movie", title: "Arrival", overview: "", genres: [], cast: [] },
        ] as MediaSummary[],
      },
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
});
