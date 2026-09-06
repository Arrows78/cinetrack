import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { PeoplePage } from "../people-page";
import type { PersonSummary } from "@/types/media";

const usePeopleSearchMock = vi.fn();
const usePopularPeopleMock = vi.fn();
const useTrendingPeopleMock = vi.fn();

vi.mock("@/features/media/use-discovery", () => ({
  usePeopleSearch: (query: string) => usePeopleSearchMock(query),
  usePopularPeople: () => usePopularPeopleMock(),
  useTrendingPeople: () => useTrendingPeopleMock(),
}));

// Person cards route through <Link>. No RouterProvider exists in this render,
// same as design-system-page.test.tsx's own mock.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={params ? to.replace(/\$([a-zA-Z]+)/g, (_, key: string) => params[key] ?? "") : to}>{children}</a>
  ),
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PeoplePage />
    </QueryClientProvider>
  );
}

function makePerson(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 1,
    name: "Jane Doe",
    profilePath: "/jane.jpg",
    knownForDepartment: "Acting",
    knownFor: [],
    ...overrides,
  };
}

const idleResult = () => ({
  isLoading: false,
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  data: { results: [] },
});

async function typeSearch(value: string) {
  const input = screen.getByPlaceholderText("Search for a person");
  fireEvent.change(input, { target: { value } });
  // Settle the debounce (DEBOUNCE_MS) so the page switches into the
  // search-active branch before assertions run.
  await waitFor(() => {
    const calls = usePeopleSearchMock.mock.calls;
    const lastCall = calls[calls.length - 1] as [string] | undefined;
    expect(lastCall?.[0]).toBe(value);
  });
}

describe("PeoplePage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    usePeopleSearchMock.mockReset();
    usePeopleSearchMock.mockReturnValue(idleResult());
    usePopularPeopleMock.mockReset();
    usePopularPeopleMock.mockReturnValue(idleResult());
    useTrendingPeopleMock.mockReset();
    useTrendingPeopleMock.mockReturnValue(idleResult());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debounces the search input before calling usePeopleSearch with the typed value", async () => {
    renderPage();

    const input = screen.getByPlaceholderText("Search for a person");
    fireEvent.change(input, { target: { value: "T" } });
    fireEvent.change(input, { target: { value: "To" } });
    fireEvent.change(input, { target: { value: "Tom" } });

    // The debounced value updates only after DEBOUNCE_MS settles; intermediate
    // keystrokes must not each trigger their own call.
    await waitFor(() => {
      const calls = usePeopleSearchMock.mock.calls;
      const lastCall = calls[calls.length - 1] as [string] | undefined;
      expect(lastCall?.[0]).toBe("Tom");
    });

    expect(usePeopleSearchMock.mock.calls.some(([arg]) => arg === "T" || arg === "To")).toBe(false);
  });

  it("shows a default 'Popular people' list before any search is typed", () => {
    const people = [makePerson({ id: 1, name: "Jane Doe" }), makePerson({ id: 2, name: "John Smith" })];
    usePopularPeopleMock.mockReturnValue({ ...idleResult(), data: { results: people } });

    renderPage();

    expect(screen.getByRole("heading", { name: "Popular people" })).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    // The default view is driven by the popular-people query, not a search.
    expect(usePeopleSearchMock).toHaveBeenCalledWith("");
  });

  it("switches to the trending-people list when that mode is selected", () => {
    usePopularPeopleMock.mockReturnValue({
      ...idleResult(),
      data: { results: [makePerson({ id: 1, name: "Popular Person" })] },
    });
    useTrendingPeopleMock.mockReturnValue({
      ...idleResult(),
      data: { results: [makePerson({ id: 2, name: "Trending Person" })] },
    });

    renderPage();

    expect(screen.getByText("Popular Person")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Trending this week" }));

    expect(screen.getByRole("heading", { name: "Trending this week" })).toBeInTheDocument();
    expect(screen.getByText("Trending Person")).toBeInTheDocument();
    expect(screen.queryByText("Popular Person")).not.toBeInTheDocument();
  });

  it("shows the grid skeleton and no person cards while the popular list is loading", () => {
    usePopularPeopleMock.mockReturnValue({
      isLoading: true,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });

    renderPage();

    expect(document.querySelectorAll(".animate-shimmer").length).toBeGreaterThan(0);
    // The "Popular people" section heading is expected here (it's not part of
    // the loading state); no person-card heading should be, though.
    expect(screen.getByRole("heading", { name: "Popular people" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the remote error state with a working retry action when the popular list fails", () => {
    const refetch = vi.fn();
    usePopularPeopleMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: true,
      error: new Error("boom"),
      refetch,
      data: undefined,
    });

    renderPage();

    expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not show the no-results empty state before a search is typed, even if the popular list is empty", () => {
    renderPage();

    expect(screen.queryByText("No people found")).not.toBeInTheDocument();
  });

  it("shows the grid skeleton and no result cards while a search is loading", async () => {
    usePeopleSearchMock.mockReturnValue({
      isLoading: true,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    });
    renderPage();

    await typeSearch("de");

    expect(document.querySelectorAll(".animate-shimmer").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the remote error state with a working retry action for a failed search", async () => {
    const refetch = vi.fn();
    usePeopleSearchMock.mockReturnValue({
      isLoading: false,
      isPending: false,
      isError: true,
      error: new Error("boom"),
      refetch,
      data: undefined,
    });
    renderPage();

    await typeSearch("de");

    expect(screen.getByText("Unable to load the catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct no-results empty state when a typed search returns zero people", async () => {
    usePeopleSearchMock.mockReturnValue(idleResult());
    renderPage();

    await typeSearch("zz");

    expect(screen.getByText("No people found")).toBeInTheDocument();
    expect(screen.getByText("Try another name — or check the spelling.")).toBeInTheDocument();
    // The "Popular people" heading belongs to the default state only.
    expect(screen.queryByRole("heading", { name: "Popular people" })).not.toBeInTheDocument();
  });

  it("renders a card per person with name, image, department and a link to the detail page", async () => {
    const people = [
      makePerson({ id: 1, name: "Jane Doe", profilePath: "/jane.jpg", knownForDepartment: "Acting" }),
      makePerson({ id: 2, name: "John Smith", profilePath: null, knownForDepartment: undefined }),
    ];
    usePeopleSearchMock.mockReturnValue({ ...idleResult(), data: { results: people } });

    renderPage();
    await typeSearch("jo");

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Acting")).toBeInTheDocument();
    const janeLink = screen.getByRole("link", { name: /Jane Doe/ });
    const janeImage = janeLink.querySelector("img") as HTMLImageElement;
    expect(janeImage.src).toBe("https://image.tmdb.org/t/p/w500/jane.jpg");
    expect(janeLink).toHaveAttribute("href", "/people/1");

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    // No profilePath: falls back to the bundled placeholder illustration,
    // not a TMDB URL.
    const johnLink = screen.getByRole("link", { name: /John Smith/ });
    const johnImage = johnLink.querySelector("img") as HTMLImageElement;
    expect(johnImage.src).not.toContain("image.tmdb.org");
    // No knownForDepartment: falls back to the i18n fallback string.
    expect(screen.getByText("Film & television")).toBeInTheDocument();
    expect(johnLink).toHaveAttribute("href", "/people/2");
  });
});
