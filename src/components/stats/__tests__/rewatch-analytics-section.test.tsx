import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { RewatchAnalyticsSection } from "../rewatch-analytics-section";
import type { RewatchStats } from "@/types/media";

const useRewatchStatsMock = vi.fn();
vi.mock("@/features/stats/use-stats", () => ({
  useRewatchStats: () => useRewatchStatsMock(),
}));

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/media/activity/activity-bar-chart", () => ({
  ActivityBarChart: ({ data }: { data: Array<{ label: string; value: number }> }) => (
    <div data-testid="activity-bar-chart">{data.map((d) => `${d.label}:${d.value}`).join(",")}</div>
  ),
}));

function makeRewatchStats(overrides: Partial<RewatchStats> = {}): RewatchStats {
  return {
    totalRewatches: 4,
    rewatchSharePercent: 67,
    favouriteComfortTitles: [
      { title: "Title A", count: 3 },
      { title: "Title B", count: 1 },
    ],
    rewatchActivity: [{ month: "2026-01", count: 4, minutes: 0 }],
    ...overrides,
  };
}

describe("RewatchAnalyticsSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useRewatchStatsMock.mockReset();
    loggerWarnMock.mockClear();
  });

  it("renders nothing while loading", () => {
    useRewatchStatsMock.mockReturnValue({ data: undefined, isError: false, error: null });
    const { container } = render(<RewatchAnalyticsSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces the failure with a retry instead of vanishing, and logs a warning", () => {
    const refetch = vi.fn();
    useRewatchStatsMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom"), refetch });
    render(<RewatchAnalyticsSection />);

    // A hidden panel would read as "you have no data", not "this failed".
    expect(
      screen.getByText(i18n.t("stats.sectionUnavailable", { section: i18n.t("stats.rewatch.title") }))
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("errors.retry") }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("renders the total, share, ranked comfort titles and activity chart", () => {
    useRewatchStatsMock.mockReturnValue({ data: makeRewatchStats(), isError: false, error: null });
    render(<RewatchAnalyticsSection />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("Title A")).toBeInTheDocument();
    expect(screen.getByText("Title B")).toBeInTheDocument();
    expect(screen.getByTestId("activity-bar-chart")).toHaveTextContent("01:4");
  });

  it("omits the comfort-titles list when there are none yet", () => {
    useRewatchStatsMock.mockReturnValue({
      data: makeRewatchStats({ favouriteComfortTitles: [] }),
      isError: false,
      error: null,
    });
    render(<RewatchAnalyticsSection />);

    expect(screen.queryByText("Favourite comfort titles")).not.toBeInTheDocument();
  });
});
