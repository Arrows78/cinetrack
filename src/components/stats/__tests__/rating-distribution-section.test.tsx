import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { RatingDistributionSection } from "../rating-distribution-section";
import type { RatingDistribution } from "@/types/media";

const useRatingDistributionMock = vi.fn();
vi.mock("@/features/stats/use-stats", () => ({
  useRatingDistribution: () => useRatingDistributionMock(),
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

function makeDistribution(overrides: Partial<RatingDistribution> = {}): RatingDistribution {
  return {
    distribution: [
      { rating: 7.5, count: 2 },
      { rating: 9, count: 1 },
    ],
    averageByMonth: [{ period: "2026-03", average: 8.0, count: 2 }],
    averageByYear: [{ period: "2026", average: 8.0, count: 2 }],
    ...overrides,
  };
}

describe("RatingDistributionSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useRatingDistributionMock.mockReset();
    loggerWarnMock.mockClear();
  });

  it("renders nothing while loading", () => {
    useRatingDistributionMock.mockReturnValue({ data: undefined, isError: false, error: null });
    const { container } = render(<RatingDistributionSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and logs a warning on error", () => {
    useRatingDistributionMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom") });
    const { container } = render(<RatingDistributionSection />);
    expect(container).toBeEmptyDOMElement();
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("renders nothing when there is no rated title yet", () => {
    useRatingDistributionMock.mockReturnValue({
      data: makeDistribution({ distribution: [] }),
      isError: false,
      error: null,
    });
    const { container } = render(<RatingDistributionSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the rating histogram plus the monthly and yearly averages", () => {
    useRatingDistributionMock.mockReturnValue({ data: makeDistribution(), isError: false, error: null });
    render(<RatingDistributionSection />);

    const charts = screen.getAllByTestId("activity-bar-chart");
    expect(charts).toHaveLength(3);
    expect(charts[0]).toHaveTextContent("7.5:2,9:1");
    expect(charts[1]).toHaveTextContent("03:8");
    expect(charts[2]).toHaveTextContent("2026:8");
  });

  it("omits the by-month/by-year charts when there is no history yet", () => {
    useRatingDistributionMock.mockReturnValue({
      data: makeDistribution({ averageByMonth: [], averageByYear: [] }),
      isError: false,
      error: null,
    });
    render(<RatingDistributionSection />);

    expect(screen.getAllByTestId("activity-bar-chart")).toHaveLength(1);
  });
});
