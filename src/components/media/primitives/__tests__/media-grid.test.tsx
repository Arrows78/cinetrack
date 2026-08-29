import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import { makeMedia } from "@/shared/test-utils";
import { MediaGrid } from "../media-grid";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

const isMovieSeenMock = vi.fn();
vi.mock("@/features/progress/progress-repository", () => ({
  progressRepository: {
    isMovieSeen: (...args: unknown[]) => isMovieSeenMock(...args),
    toggleMovieSeen: vi.fn(),
  },
}));

function renderGrid(count: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const items = Array.from({ length: count }, (_, index) => makeMedia({ id: index + 1, title: `Title ${index + 1}` }));
  return render(<MediaGrid items={items} />, {
    wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}

describe("MediaGrid", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    isMovieSeenMock.mockReset().mockResolvedValue(false);
  });

  it("renders items through the virtualized grid, not an empty shell", async () => {
    renderGrid(12);

    // jsdom reports zero-size elements, which is exactly the case Virtuoso's
    // own fallback (initialItemCount heuristics) exists for — assert real
    // cards actually land in the DOM rather than trusting that silently.
    expect(await screen.findByText("Title 1")).toBeInTheDocument();
  });

  it("renders nothing for an empty list without erroring", () => {
    const { container } = renderGrid(0);
    expect(container).toBeInTheDocument();
  });
});
