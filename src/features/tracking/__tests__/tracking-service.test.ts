import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROFILE_ID } from "@/shared/constants/profile";
import type { AvailabilityAlert, AvailabilitySnapshot, CalendarEntry, LibraryItem } from "@/types/media";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  list: vi.fn(),
  listAlerts: vi.fn(),
  getSnapshot: vi.fn(),
}));

vi.mock("@/features/calendar/calendar-service", () => ({
  calendarService: { build: mocks.build },
}));

vi.mock("@/features/library/library-repository", () => ({
  libraryRepository: { list: mocks.list },
}));

vi.mock("@/features/availability/availability-repository", () => ({
  availabilityRepository: { listAlerts: mocks.listAlerts, getSnapshot: mocks.getSnapshot },
}));

import { trackingService } from "../tracking-service";

const calendarEntry = (overrides: Partial<CalendarEntry> = {}): CalendarEntry => ({
  id: "movie-1-2026-09-01",
  mediaId: 1,
  mediaType: "movie",
  title: "Dune 3",
  date: "2026-09-01",
  kind: "movie-release",
  ...overrides,
});

const libraryItem = (mediaId: number): LibraryItem => ({
  id: `item-${mediaId}`,
  profileId: DEFAULT_PROFILE_ID,
  mediaId,
  mediaType: "movie",
  title: "In library",
  posterPath: null,
  backdropPath: null,
  year: null,
  rating: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  genres: [],
  status: "planned",
  favourite: false,
  userRating: null,
  notes: null,
  tags: [],
  startedAt: null,
  completedAt: null,
  rewatchCount: 0,
});

const alert = (overrides: Partial<AvailabilityAlert> = {}): AvailabilityAlert => ({
  id: "alert-1",
  profileId: DEFAULT_PROFILE_ID,
  mediaId: 42,
  mediaType: "movie",
  title: "Arrival",
  region: "FR",
  providerIds: [],
  enabled: true,
  createdAt: "2026-01-01",
  ...overrides,
});

const snapshot = (providerIds: number[]): AvailabilitySnapshot => ({
  mediaId: 42,
  mediaType: "movie",
  region: "FR",
  providerIds,
  checkedAt: "2026-01-01",
});

describe("trackingService.build", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.build.mockResolvedValue([]);
    mocks.list.mockResolvedValue([]);
    mocks.listAlerts.mockResolvedValue([]);
    mocks.getSnapshot.mockResolvedValue(null);
  });

  it("tags a movie release as mine when the movie is already in the library", async () => {
    mocks.build.mockResolvedValue([calendarEntry({ mediaId: 1 })]);
    mocks.list.mockResolvedValue([libraryItem(1)]);

    const entries = await trackingService.build();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "release", scope: "mine" });
  });

  it("tags a movie release as discovery when it isn't in the library", async () => {
    mocks.build.mockResolvedValue([calendarEntry({ mediaId: 1 })]);
    mocks.list.mockResolvedValue([]);

    const entries = await trackingService.build();

    expect(entries[0]).toMatchObject({ scope: "discovery" });
  });

  it("always tags episodes as mine, library or not", async () => {
    mocks.build.mockResolvedValue([
      calendarEntry({ kind: "episode", mediaId: 10, mediaType: "series", id: "episode-1" }),
    ]);
    mocks.list.mockResolvedValue([]);

    const entries = await trackingService.build();

    expect(entries[0]).toMatchObject({ type: "episode", scope: "mine" });
  });

  it("excludes disabled alerts", async () => {
    mocks.listAlerts.mockResolvedValue([alert({ enabled: false })]);

    const entries = await trackingService.build();

    expect(entries).toHaveLength(0);
  });

  it("marks an alert available when the snapshot's providers overlap the alert's filter", async () => {
    mocks.listAlerts.mockResolvedValue([alert({ providerIds: [8] })]);
    mocks.getSnapshot.mockResolvedValue(snapshot([8, 119]));

    const entries = await trackingService.build();

    expect(entries[0]).toMatchObject({ type: "availability", available: true, providerIds: [8] });
  });

  it("marks an alert pending when the current snapshot doesn't match the alert's filter", async () => {
    mocks.listAlerts.mockResolvedValue([alert({ providerIds: [8] })]);
    mocks.getSnapshot.mockResolvedValue(snapshot([119]));

    const entries = await trackingService.build();

    expect(entries[0]).toMatchObject({ available: false });
  });

  it("marks an alert pending when there is no snapshot yet", async () => {
    mocks.listAlerts.mockResolvedValue([alert()]);
    mocks.getSnapshot.mockResolvedValue(null);

    const entries = await trackingService.build();

    expect(entries[0]).toMatchObject({ available: false, providerIds: [] });
  });

  it("treats an alert with no provider filter as available on any current provider", async () => {
    mocks.listAlerts.mockResolvedValue([alert({ providerIds: [] })]);
    mocks.getSnapshot.mockResolvedValue(snapshot([337]));

    const entries = await trackingService.build();

    expect(entries[0]).toMatchObject({ available: true, providerIds: [337] });
  });
});

describe("trackingService.buildNotifiableCalendarEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps only calendar entries the user actually tracks", async () => {
    mocks.build.mockResolvedValue([
      calendarEntry({ mediaId: 1 }),
      calendarEntry({ mediaId: 2, id: "movie-2-2026-09-01" }),
      calendarEntry({ kind: "episode", mediaId: 10, mediaType: "series", id: "episode-1" }),
    ]);
    mocks.list.mockResolvedValue([libraryItem(1)]);

    const entries = await trackingService.buildNotifiableCalendarEntries();

    expect(entries.map((entry) => entry.mediaId)).toEqual([1, 10]);
  });
});
