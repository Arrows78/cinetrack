import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import type { WatchMilestone } from "@/types/media";

const celebrateMock = vi.fn();
const toastMock = vi.fn();
const useWatchMilestonesMock = vi.fn();

vi.mock("@/features/stats/use-stats", () => ({
  useWatchMilestones: () => useWatchMilestonesMock(),
}));
vi.mock("@/hooks/use-confetti", () => ({
  useConfetti: () => ({ celebrate: celebrateMock, burst: vi.fn(), burstFromRef: vi.fn() }),
}));
vi.mock("@/components/ui/use-toast", () => ({
  toast: (input: unknown) => toastMock(input),
}));

import { MilestoneCelebrationController } from "@/components/layout/milestone-celebration-controller";

function milestone(overrides: Partial<WatchMilestone>): WatchMilestone {
  return {
    id: "episodes-100",
    category: "episodes",
    threshold: 100,
    currentValue: 100,
    achieved: true,
    achievedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  celebrateMock.mockClear();
  toastMock.mockClear();
  useWatchMilestonesMock.mockReset();
});

describe("MilestoneCelebrationController", () => {
  it("celebrates a milestone achieved moments ago", async () => {
    useWatchMilestonesMock.mockReturnValue({ data: [milestone({})] });
    render(<MilestoneCelebrationController />);

    await waitFor(() => expect(celebrateMock).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("does not celebrate a milestone achieved long ago", () => {
    useWatchMilestonesMock.mockReturnValue({
      data: [milestone({ achievedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() })],
    });
    render(<MilestoneCelebrationController />);

    expect(celebrateMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("does not celebrate an unachieved milestone", () => {
    useWatchMilestonesMock.mockReturnValue({
      data: [milestone({ achieved: false, achievedAt: null })],
    });
    render(<MilestoneCelebrationController />);

    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it("does not celebrate the same milestone twice across refetches", async () => {
    useWatchMilestonesMock.mockReturnValue({ data: [milestone({})] });
    const { rerender } = render(<MilestoneCelebrationController />);
    await waitFor(() => expect(celebrateMock).toHaveBeenCalledTimes(1));

    rerender(<MilestoneCelebrationController />);
    expect(celebrateMock).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while milestones are still loading", () => {
    useWatchMilestonesMock.mockReturnValue({ data: undefined });
    const { container } = render(<MilestoneCelebrationController />);
    expect(container).toBeEmptyDOMElement();
    expect(celebrateMock).not.toHaveBeenCalled();
  });
});
