import { format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeCommandMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/lib/invoke", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    invokeTypedCommand: (command: { name: string }, args?: Record<string, unknown>) =>
      args === undefined ? invokeCommandMock(command.name) : invokeCommandMock(command.name, args),
  };
});

import { getViewerTimeZone } from "@/shared/lib/time-zone";
import { statsRepository, trailing12MonthsWindow } from "../stats-repository";

// Every zone-aware stats command also carries the viewer's IANA zone, which
// the Rust side buckets with per event; the offset stays as the fallback for
// a runtime that cannot name its zone.
const zone = getViewerTimeZone();

beforeEach(() => {
  invokeCommandMock.mockClear();
});

describe("trailing12MonthsWindow", () => {
  it("returns 12 zero-padded month labels ending on the reference month", () => {
    const { windowStart, monthLabels } = trailing12MonthsWindow(new Date("2026-08-15T00:00:00.000Z"));

    expect(monthLabels).toHaveLength(12);
    expect(monthLabels[0]).toBe("2025-09");
    expect(monthLabels[monthLabels.length - 1]).toBe("2026-08");
    // Compares the Date's own local calendar fields, not its UTC ISO string
    // — this test must pass no matter which timezone it runs under.
    expect(format(windowStart, "yyyy-MM-dd")).toBe("2025-09-01");
  });
});

describe("statsRepository.getMonthlyRecap", () => {
  it("derives an end-exclusive range from the given month and forwards it", async () => {
    invokeCommandMock.mockResolvedValue({ month: "2026-03" });

    await statsRepository.getMonthlyRecap("2026-03");

    // Local month bounds — in UTC these equal the old "...-01T00:00:00Z".
    expect(invokeCommandMock).toHaveBeenCalledWith("get_monthly_recap", {
      month: "2026-03",
      rangeStart: new Date(2026, 2, 1).toISOString(),
      rangeEnd: new Date(2026, 3, 1).toISOString(),
      tzOffsetMinutes: new Date(2026, 2, 1).getTimezoneOffset(),
      timeZone: zone,
    });
  });

  it("rolls over into the next year at December", async () => {
    invokeCommandMock.mockResolvedValue({ month: "2026-12" });

    await statsRepository.getMonthlyRecap("2026-12");

    expect(invokeCommandMock).toHaveBeenCalledWith("get_monthly_recap", {
      month: "2026-12",
      rangeStart: new Date(2026, 11, 1).toISOString(),
      rangeEnd: new Date(2027, 0, 1).toISOString(),
      tzOffsetMinutes: new Date(2026, 11, 1).getTimezoneOffset(),
      timeZone: zone,
    });
  });

  it("returns whatever the command resolves with", async () => {
    const recap = { month: "2026-03", moviesWatched: 2 };
    invokeCommandMock.mockResolvedValue(recap);

    const result = await statsRepository.getMonthlyRecap("2026-03");

    expect(result).toBe(recap);
  });
});

describe("statsRepository.getRewatchStats", () => {
  it("invokes get_rewatch_stats with a trailing-12-months window", async () => {
    invokeCommandMock.mockResolvedValue({ totalRewatches: 3 });

    await statsRepository.getRewatchStats();

    expect(invokeCommandMock).toHaveBeenCalledWith(
      "get_rewatch_stats",
      expect.objectContaining({ monthLabels: expect.arrayContaining([expect.any(String)]) })
    );
    const [, args] = invokeCommandMock.mock.calls[0] as [string, { monthLabels: string[] }];
    expect(args.monthLabels).toHaveLength(12);
  });
});

describe("statsRepository.getRatingDistribution", () => {
  it("invokes get_rating_distribution with only a window start", async () => {
    invokeCommandMock.mockResolvedValue({ distribution: [] });

    await statsRepository.getRatingDistribution();

    expect(invokeCommandMock).toHaveBeenCalledWith("get_rating_distribution", {
      windowStart: expect.any(String),
      tzOffsetMinutes: new Date().getTimezoneOffset(),
      timeZone: zone,
    });
  });
});

describe("statsRepository.getWatchMilestones", () => {
  it("invokes get_watch_milestones with no arguments", async () => {
    const milestones = [{ id: "episodes-100" }];
    invokeCommandMock.mockResolvedValue(milestones);

    const result = await statsRepository.getWatchMilestones();

    expect(invokeCommandMock).toHaveBeenCalledWith("get_watch_milestones");
    expect(result).toBe(milestones);
  });
});

describe("the viewer's IANA time zone", () => {
  it("is sent on every zone-aware stats command, next to the legacy offset", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: "Europe/Paris" }) }) as Intl.DateTimeFormat
    );
    invokeCommandMock.mockResolvedValue({ totals: {}, monthlyActivity: [], heatmap: [], favouriteGenres: [] });

    await statsRepository.getStats();
    await statsRepository.getYearlyActivity();
    await statsRepository.getOnThisDayEvents("2026-08-22T12:00:00.000Z");
    await statsRepository.getMonthlyRecap("2026-03");
    await statsRepository.getRewatchStats();
    await statsRepository.getRatingDistribution();

    const zoneAware = [
      "get_stats_overview",
      "get_activity_stats",
      "list_yearly_activity",
      "list_on_this_day_events",
      "get_monthly_recap",
      "get_rewatch_stats",
      "get_rating_distribution",
    ];
    for (const command of zoneAware) {
      const call = invokeCommandMock.mock.calls.find(([name]) => name === command);
      expect(call, command).toBeDefined();
      expect(call![1], command).toMatchObject({ timeZone: "Europe/Paris", tzOffsetMinutes: expect.any(Number) });
    }
    vi.restoreAllMocks();
  });

  it("is null when the runtime cannot name its zone, leaving the fixed offset to the Rust side", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: undefined }) }) as unknown as Intl.DateTimeFormat
    );
    invokeCommandMock.mockResolvedValue([]);

    await statsRepository.getYearlyActivity();

    expect(invokeCommandMock).toHaveBeenCalledWith("list_yearly_activity", {
      tzOffsetMinutes: expect.any(Number),
      timeZone: null,
    });
    vi.restoreAllMocks();
  });
});
