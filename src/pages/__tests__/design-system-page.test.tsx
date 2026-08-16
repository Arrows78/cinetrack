import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { DesignSystemPage } from "../design-system-page";
import type * as LibraryRepositoryModule from "@/features/library/library-repository";
import type * as ProgressRepositoryModule from "@/features/progress/progress-repository";

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({
    data: { theme: "dark", accentColor: "violet" },
  }),
  useActiveProfileId: () => "default",
}));

// The catalog's Media card pattern renders a real MediaCard, whose grid-card
// quick actions (add-to-library/seen toggle) are wired to real data hooks —
// stub just the two invoke()-backed methods those actions call, keeping
// every other real export (calculateSeriesProgress, getNextEpisode, ...)
// intact for whatever else in this 60+ component catalog might use them.
vi.mock("@/features/library/library-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof LibraryRepositoryModule>();
  return {
    ...actual,
    libraryRepository: { ...actual.libraryRepository, has: () => Promise.resolve(false) },
  };
});
vi.mock("@/features/progress/progress-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof ProgressRepositoryModule>();
  return {
    ...actual,
    progressRepository: { ...actual.progressRepository, isMovieSeen: () => Promise.resolve(false) },
  };
});

// The catalog's Media card & grid / Genre pill patterns render real
// MediaCard/Pill components, which route through <Link>. No RouterProvider
// exists in this render, same as media-card.test.tsx's own mock.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: PropsWithChildren<{ to: string }>) => <a href={to}>{children}</a>,
}));

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("DesignSystemPage", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // This page renders ~50 live components at once (multiple Sheets, Accordions,
  // motion elements, plus live-contrast ColorSwatch/AccentPresetCard instances) —
  // consistently under 1s locally, but the default 5000ms budget has been
  // observed to trip under CI's more limited parallelism/CPU headroom.
  it("renders the complete catalog and supports its interactive filters", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DesignSystemPage />
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Design system" })).toBeInTheDocument();
    expect(screen.getByText("72 components shown")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Component group"), { target: { value: "UI primitives" } });
    expect(screen.getByText("19 components shown")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search the catalog"), { target: { value: "missing-component" } });
    expect(screen.getByText("No component found")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText("72 components shown")).toBeInTheDocument();

    const patternSearch = screen.getByPlaceholderText("Search titles, people or genres");
    fireEvent.change(patternSearch, { target: { value: "Arrival" } });
    fireEvent.click(screen.getByRole("button", { name: "Series" }));

    const currentQuery = screen.getByText("Arrival");
    expect(currentQuery.parentElement).toHaveTextContent("Current example: Arrival · series");
  }, 20000);
});
