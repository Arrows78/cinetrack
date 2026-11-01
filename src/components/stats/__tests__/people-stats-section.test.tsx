import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PeopleStatsSection } from "../people-stats-section";

const peopleMock = vi.fn();
vi.mock("@/features/media/use-people-you-watch", () => ({ usePeopleStats: () => peopleMock() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { personId: string } }) => (
    <a href={`/people/${params.personId}`}>{children}</a>
  ),
}));
vi.mock("@/shared/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const base = { directors: [], actors: [], titleCount: 0, isLoading: false, isError: false, refetch: vi.fn() };

describe("PeopleStatsSection", () => {
  beforeEach(() => peopleMock.mockReset());

  it("lists the directors and actors who recur, linked to their pages", () => {
    peopleMock.mockReturnValue({
      ...base,
      titleCount: 12,
      directors: [{ id: 1, name: "Denis Villeneuve", count: 3 }],
      actors: [{ id: 2, name: "Rebecca Ferguson", count: 2 }],
    });

    render(<PeopleStatsSection />);

    expect(screen.getByText("Across your 12 most recently completed titles")).toBeInTheDocument();
    expect(screen.getByText("Denis Villeneuve").closest("a")).toHaveAttribute("href", "/people/1");
    expect(screen.getByText("3 titles")).toBeInTheDocument();
    expect(screen.getByText("Rebecca Ferguson")).toBeInTheDocument();
  });

  it("says when one list is empty but the other isn't", () => {
    peopleMock.mockReturnValue({ ...base, titleCount: 4, directors: [{ id: 1, name: "Agnès Varda", count: 2 }] });

    render(<PeopleStatsSection />);

    expect(screen.getByText("No one comes back across your titles yet.")).toBeInTheDocument();
  });

  it("renders nothing without a pattern, a skeleton while loading, and a retry on failure", () => {
    peopleMock.mockReturnValue(base);
    const { container, unmount } = render(<PeopleStatsSection />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    peopleMock.mockReturnValue({ ...base, isLoading: true });
    const loading = render(<PeopleStatsSection />);
    expect(screen.getByRole("status", { name: "Loading the people you watch most" })).toBeInTheDocument();
    loading.unmount();

    const refetch = vi.fn();
    peopleMock.mockReturnValue({ ...base, isError: true, refetch });
    render(<PeopleStatsSection />);
    screen.getByRole("button", { name: "Try again" }).click();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
