import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { WatchMilestonesSection } from "../watch-milestones-section";
import { ShareCancelledError, downloadMilestoneCard, renderMilestoneCard } from "@/features/stats/wrapped-export";
import { toast } from "@/components/ui/use-toast";
import type { WatchMilestone } from "@/types/media";

const useWatchMilestonesMock = vi.fn();
vi.mock("@/features/stats/use-stats", () => ({
  useWatchMilestones: () => useWatchMilestonesMock(),
}));

const loggerWarnMock = vi.fn();
vi.mock("@/shared/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/stats/wrapped-export", () => ({
  ShareCancelledError: class ShareCancelledError extends Error {},
  downloadMilestoneCard: vi.fn(),
  renderMilestoneCard: vi.fn(),
}));

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

const downloadMilestoneCardMock = vi.mocked(downloadMilestoneCard);
const renderMilestoneCardMock = vi.mocked(renderMilestoneCard);
const toastMock = vi.mocked(toast);

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
    downloadMilestoneCardMock.mockReset();
    renderMilestoneCardMock.mockReset();
    toastMock.mockReset();
    URL.createObjectURL = vi.fn(() => "blob:mock-milestone-url");
    URL.revokeObjectURL = vi.fn();
  });

  it("renders nothing while loading", () => {
    useWatchMilestonesMock.mockReturnValue({ data: undefined, isError: false, error: null });
    const { container } = render(<WatchMilestonesSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces the failure with a retry instead of vanishing, and logs a warning", () => {
    const refetch = vi.fn();
    useWatchMilestonesMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom"), refetch });
    render(<WatchMilestonesSection />);

    // A hidden panel would read as "you have no data", not "this failed".
    expect(
      screen.getByText(i18n.t("stats.sectionUnavailable", { section: i18n.t("stats.milestones.title") }))
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("errors.retry") }));
    expect(refetch).toHaveBeenCalledTimes(1);
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

  it("gives each milestone category its own icon, not one generic trophy/lock for every category", () => {
    useWatchMilestonesMock.mockReturnValue({
      data: [
        makeMilestone({ id: "movies-10", category: "movies", threshold: 10, achieved: false }),
        makeMilestone({ id: "series-5", category: "series", threshold: 5, achieved: true, achievedAt: null }),
      ],
      isError: false,
      error: null,
    });
    const { container } = render(<WatchMilestonesSection />);

    expect(container.querySelector(".lucide-clapperboard")).toBeInTheDocument();
    expect(container.querySelector(".lucide-tv")).toBeInTheDocument();
    // The achieved/locked distinction still shows, as a corner badge rather
    // than replacing the whole icon.
    expect(container.querySelector(".lucide-trophy")).toBeInTheDocument();
    expect(container.querySelector(".lucide-lock")).toBeInTheDocument();
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

  it("renders the card and opens a preview dialog before saving anything", async () => {
    const milestone = makeMilestone({ achieved: true, achievedAt: "2026-01-02T00:00:00.000Z" });
    useWatchMilestonesMock.mockReturnValue({ data: [milestone], isError: false, error: null });
    const blob = new Blob(["milestone"], { type: "image/png" });
    renderMilestoneCardMock.mockResolvedValue(blob);
    render(<WatchMilestonesSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() => expect(renderMilestoneCardMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(downloadMilestoneCardMock).not.toHaveBeenCalled();
  });

  it("saves the previewed card and reports success once the dialog is confirmed", async () => {
    const milestone = makeMilestone({ achieved: true, achievedAt: "2026-01-02T00:00:00.000Z" });
    useWatchMilestonesMock.mockReturnValue({ data: [milestone], isError: false, error: null });
    const blob = new Blob(["milestone"], { type: "image/png" });
    renderMilestoneCardMock.mockResolvedValue(blob);
    downloadMilestoneCardMock.mockResolvedValue(undefined);
    render(<WatchMilestonesSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloadMilestoneCardMock).toHaveBeenCalledWith(blob, milestone.id));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("treats a cancelled milestone share as a non-error", async () => {
    const milestone = makeMilestone({ achieved: true });
    useWatchMilestonesMock.mockReturnValue({ data: [milestone], isError: false, error: null });
    renderMilestoneCardMock.mockResolvedValue(new Blob(["milestone"], { type: "image/png" }));
    downloadMilestoneCardMock.mockRejectedValue(new ShareCancelledError());
    render(<WatchMilestonesSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(downloadMilestoneCardMock).toHaveBeenCalledOnce());
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
    // A cancelled share leaves the preview open, so the user can retry.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("logs and surfaces an unexpected milestone render failure", async () => {
    const milestone = makeMilestone({ achieved: true });
    useWatchMilestonesMock.mockReturnValue({ data: [milestone], isError: false, error: null });
    renderMilestoneCardMock.mockRejectedValue("export failed");
    render(<WatchMilestonesSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("export failed")));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("logs and surfaces an unexpected milestone save failure", async () => {
    const milestone = makeMilestone({ achieved: true });
    useWatchMilestonesMock.mockReturnValue({ data: [milestone], isError: false, error: null });
    renderMilestoneCardMock.mockResolvedValue(new Blob(["milestone"], { type: "image/png" }));
    downloadMilestoneCardMock.mockRejectedValue("save failed");
    render(<WatchMilestonesSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("save failed")));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});
