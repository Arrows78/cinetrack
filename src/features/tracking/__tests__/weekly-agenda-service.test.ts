import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackingEntry } from "@/types/media";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
}));

vi.mock("@/features/tracking/tracking-service", () => ({
  trackingService: { build: mocks.build },
}));

import { selectWeeklyAgendaEntries, weeklyAgendaService } from "../weekly-agenda-service";

const entry = (overrides: Partial<TrackingEntry>): TrackingEntry => ({
  id: "id",
  mediaId: 1,
  mediaType: "movie",
  title: "Title",
  type: "release",
  scope: "mine",
  date: "2026-08-25",
  ...overrides,
});

describe("selectWeeklyAgendaEntries", () => {
  it("keeps a tracked (mine) movie release and drops a discovery one", () => {
    const mine = entry({ id: "mine", scope: "mine" });
    const discovery = entry({ id: "discovery", scope: "discovery" });

    expect(selectWeeklyAgendaEntries([mine, discovery])).toEqual([mine]);
  });

  it("keeps every episode entry, which is always scoped 'mine'", () => {
    const episode = entry({ id: "episode", type: "episode", mediaType: "series", scope: "mine" });

    expect(selectWeeklyAgendaEntries([episode])).toEqual([episode]);
  });

  it("keeps an availability entry only once it's actually available", () => {
    const available = entry({ id: "available", type: "availability", date: null, available: true });
    const pending = entry({ id: "pending", type: "availability", date: null, available: false });

    expect(selectWeeklyAgendaEntries([available, pending])).toEqual([available]);
  });

  it("returns an empty list when nothing qualifies", () => {
    const discovery = entry({ id: "discovery", scope: "discovery" });
    const pending = entry({ id: "pending", type: "availability", date: null, available: false });

    expect(selectWeeklyAgendaEntries([discovery, pending])).toEqual([]);
  });
});

describe("weeklyAgendaService.build", () => {
  beforeEach(() => {
    mocks.build.mockReset();
  });

  it("asks trackingService for a 7-day window, not the full 60-day default", async () => {
    mocks.build.mockResolvedValue([]);

    await weeklyAgendaService.build();

    expect(mocks.build).toHaveBeenCalledWith(7);
  });

  it("applies the same mine/available filtering to whatever trackingService returns", async () => {
    const mine = entry({ id: "mine", scope: "mine" });
    const discovery = entry({ id: "discovery", scope: "discovery" });
    mocks.build.mockResolvedValue([mine, discovery]);

    expect(await weeklyAgendaService.build()).toEqual([mine]);
  });
});
