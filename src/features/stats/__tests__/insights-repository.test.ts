import { format } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeCommandMock = vi.fn();
vi.mock("@/shared/lib/invoke", () => ({ invokeCommand: (...args: unknown[]) => invokeCommandMock(...args) }));

import { statsRepository, trailing12MonthsWindow } from "../stats-repository";

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

    expect(invokeCommandMock).toHaveBeenCalledWith("get_monthly_recap", {
      month: "2026-03",
      rangeStart: "2026-03-01T00:00:00.000Z",
      rangeEnd: "2026-04-01T00:00:00.000Z",
    });
  });

  it("rolls over into the next year at December", async () => {
    invokeCommandMock.mockResolvedValue({ month: "2026-12" });

    await statsRepository.getMonthlyRecap("2026-12");

    expect(invokeCommandMock).toHaveBeenCalledWith("get_monthly_recap", {
      month: "2026-12",
      rangeStart: "2026-12-01T00:00:00.000Z",
      rangeEnd: "2027-01-01T00:00:00.000Z",
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
