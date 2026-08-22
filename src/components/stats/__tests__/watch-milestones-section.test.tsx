import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { WatchMilestonesSection } from "../watch-milestones-section";
import type { WatchMilestone } from "@/types/media";

const useWatchMilestonesMock = vi.fn();
vi.mock("@/features/stats/use-stats", () => ({
  useWatchMilestones: () => useWatchMilestonesMock(),
}));

const loggerWarnMock = vi.fn();
vi.mock("@/features/diagnostics/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn(), info: vi.fn() },
}));

function makeMilestone(overrides: Partial<WatchMilestone> = {}): WatchMilestone {
  return {
    id: "episodes-100",
    category: "episodes",
    threshold: 100,
    currentValue: 40,
    achieved: false,
    achievedAt: null,
    ...overrides,
  };
}

describe("WatchMilestonesSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useWatchMilestonesMock.mockReset();
    loggerWarnMock.mockClear();
  });

  it("renders nothing while loading", () => {
    useWatchMilestonesMock.mockReturnValue({ data: undefined, isError: false, error: null });
    const { container } = render(<WatchMilestonesSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and logs a warning on error", () => {
    useWatchMilestonesMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom") });
    const { container } = render(<WatchMilestonesSection />);
    expect(container).toBeEmptyDOMElement();
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("shows progress-toward-threshold text for an unachieved milestone", () => {
    useWatchMilestonesMock.mockReturnValue({
      data: [makeMilestone({ currentValue: 40, threshold: 100, achieved: false })],
      isError: false,
      error: null,
    });
    render(<WatchMilestonesSection />);

    expect(screen.getByText("100 episodes watched")).toBeInTheDocument();
    expect(screen.getByText("40 / 100")).toBeInTheDocument();
  });

  it("shows the crossing date for an achieved milestone that has one", () => {
    useWatchMilestonesMock.mockReturnValue({
      data: [
        makeMilestone({
          category: "hours",
          threshold: 10,
          currentValue: 10,
          achieved: true,
          achievedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
      isError: false,
      error: null,
    });
    render(<WatchMilestonesSection />);

    expect(screen.getByText("10 hours tracked")).toBeInTheDocument();
    expect(screen.queryByText("40 / 100")).not.toBeInTheDocument();
    // Achieved badge shows a formatted date, not the raw ISO string.
    expect(screen.queryByText("2026-01-02T00:00:00.000Z")).not.toBeInTheDocument();
  });

  it("falls back to a generic 'Achieved' badge when no crossing date is known", () => {
    useWatchMilestonesMock.mockReturnValue({
      data: [makeMilestone({ category: "series", threshold: 10, currentValue: 10, achieved: true, achievedAt: null })],
      isError: false,
      error: null,
    });
    render(<WatchMilestonesSection />);

    expect(screen.getByText("Achieved")).toBeInTheDocument();
  });
});
