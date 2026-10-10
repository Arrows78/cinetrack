import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { STALE_PLANNED_DAYS, staleCutoff, toStaleItems, useStalePlannedItems } from "../use-stale-planned-items";
import type { LibraryItem } from "@/types/media";

const stalePlannedMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: { stalePlanned: stalePlannedMock },
}));
vi.mock("@/features/preferences/use-preferences", () => ({
  useActiveProfileId: () => "default",
}));

function makeLibraryItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: "l1",
    profileId: "default",
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: "/dune.jpg",
    backdropPath: null,
    year: 2021,
    rating: 8,
    genres: ["Science Fiction"],
    status: "planned",
    favourite: false,
    userRating: null,
    notes: null,
    tags: [],
    startedAt: null,
    completedAt: null,
    rewatchCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("stale planned cutoff and items", () => {
  const now = new Date("2026-06-15T00:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("puts the cutoff exactly STALE_PLANNED_DAYS before now", () => {
    expect(staleCutoff(now).toISOString()).toBe(daysAgo(STALE_PLANNED_DAYS));
  });

  it("attaches the whole-days age to the items Rust selected", () => {
    const stale = makeLibraryItem({ mediaId: 2, updatedAt: daysAgo(STALE_PLANNED_DAYS) });
    const older = makeLibraryItem({ mediaId: 3, updatedAt: new Date(now.getTime() - 45.9 * 86_400_000).toISOString() });

    expect(toStaleItems([stale, older], now)).toEqual([
      { item: stale, daysSinceUpdate: STALE_PLANNED_DAYS },
      { item: older, daysSinceUpdate: 45 },
    ]);
  });
});

describe("useStalePlannedItems", () => {
  beforeEach(() => {
    stalePlannedMock.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-15T00:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("asks Rust for the planned items last touched before the cutoff, capped at the limit, and stamps their age", async () => {
    const item = makeLibraryItem({ mediaId: 9, updatedAt: "2026-04-01T00:00:00.000Z" });
    stalePlannedMock.mockResolvedValue([item]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useStalePlannedItems(4), { wrapper });
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(stalePlannedMock).toHaveBeenCalledWith("2026-05-16T00:00:00.000Z", 4);
    expect(result.current.data).toEqual([{ item, daysSinceUpdate: 75 }]);
  });
});
