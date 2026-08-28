import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { MonthlyRecapSection } from "../monthly-recap-section";
import { ShareCancelledError, downloadMonthlyRecapCard, renderMonthlyRecapCard } from "@/features/stats/wrapped-export";
import { toast } from "@/components/ui/use-toast";
import type { MonthlyRecap } from "@/types/media";

const useMonthlyRecapMock = vi.fn();
vi.mock("@/features/stats/use-stats", () => ({
  useMonthlyRecap: (month: string) => useMonthlyRecapMock(month),
}));

const loggerWarnMock = vi.fn();
vi.mock("@/features/diagnostics/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnMock(...args), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/features/stats/wrapped-export", () => ({
  ShareCancelledError: class ShareCancelledError extends Error {},
  downloadMonthlyRecapCard: vi.fn(),
  renderMonthlyRecapCard: vi.fn(),
}));

vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }));

const downloadMonthlyRecapCardMock = vi.mocked(downloadMonthlyRecapCard);
const renderMonthlyRecapCardMock = vi.mocked(renderMonthlyRecapCard);
const toastMock = vi.mocked(toast);

function makeRecap(overrides: Partial<MonthlyRecap> = {}): MonthlyRecap {
  return {
    month: "2026-03",
    moviesWatched: 3,
    episodesWatched: 12,
    minutesWatched: 620,
    topRatedTitle: { title: "Best Movie", rating: 9 },
    favouriteGenre: "Drama",
    biggestBingeDay: { day: "2026-03-06", count: 4 },
    ...overrides,
  };
}

describe("MonthlyRecapSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useMonthlyRecapMock.mockReset();
    loggerWarnMock.mockClear();
    downloadMonthlyRecapCardMock.mockReset();
    renderMonthlyRecapCardMock.mockReset();
    toastMock.mockReset();
  });

  it("renders nothing while loading", () => {
    useMonthlyRecapMock.mockReturnValue({ data: undefined, isError: false, error: null });
    const { container } = render(<MonthlyRecapSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and logs a warning on error", () => {
    useMonthlyRecapMock.mockReturnValue({ data: undefined, isError: true, error: new Error("boom") });
    const { container } = render(<MonthlyRecapSection />);
    expect(container).toBeEmptyDOMElement();
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("renders the recap's figures, top-rated title, favourite genre and biggest binge day", () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    render(<MonthlyRecapSection />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Best Movie · 9.0")).toBeInTheDocument();
    expect(screen.getByText("Drama")).toBeInTheDocument();
  });

  it("shows a dash fallback when a recap field has no value", () => {
    useMonthlyRecapMock.mockReturnValue({
      data: makeRecap({ topRatedTitle: null, favouriteGenre: null, biggestBingeDay: null }),
      isError: false,
      error: null,
    });
    render(<MonthlyRecapSection />);

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("moves to the previous month when the previous-month control is clicked", () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    render(<MonthlyRecapSection />);
    const initialMonth = useMonthlyRecapMock.mock.calls[0]?.[0] as string;

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));

    const monthsCalled = useMonthlyRecapMock.mock.calls.map((call) => call[0] as string);
    expect(monthsCalled).toContain(initialMonth);
    const year = Number(initialMonth.slice(0, 4));
    const monthNumber = Number(initialMonth.slice(5, 7));
    const expectedPrevious =
      monthNumber === 1 ? `${year - 1}-12` : `${year}-${String(monthNumber - 1).padStart(2, "0")}`;
    expect(monthsCalled).toContain(expectedPrevious);
  });

  it("disables the next-month control while viewing the current month", () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    render(<MonthlyRecapSection />);

    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("moves forward again after browsing to the previous month", () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    render(<MonthlyRecapSection />);
    const initialMonth = useMonthlyRecapMock.mock.calls[0]?.[0] as string;

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    const nextButton = screen.getByRole("button", { name: "Next month" });
    expect(nextButton).not.toBeDisabled();
    fireEvent.click(nextButton);

    expect(useMonthlyRecapMock.mock.calls.at(-1)?.[0]).toBe(initialMonth);
  });

  it("exports the selected recap and reports success", async () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    const blob = new Blob(["recap"], { type: "image/png" });
    renderMonthlyRecapCardMock.mockResolvedValue(blob);
    downloadMonthlyRecapCardMock.mockResolvedValue(undefined);
    render(<MonthlyRecapSection />);
    const month = useMonthlyRecapMock.mock.calls[0]?.[0] as string;

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() => expect(downloadMonthlyRecapCardMock).toHaveBeenCalledWith(blob, month));
    expect(renderMonthlyRecapCardMock).toHaveBeenCalledOnce();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("treats a cancelled recap share as a non-error", async () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    renderMonthlyRecapCardMock.mockRejectedValue(new ShareCancelledError());
    render(<MonthlyRecapSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() => expect(renderMonthlyRecapCardMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: /export/i })).not.toBeDisabled());
    expect(loggerWarnMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("logs and surfaces an unexpected recap export failure", async () => {
    useMonthlyRecapMock.mockReturnValue({ data: makeRecap(), isError: false, error: null });
    renderMonthlyRecapCardMock.mockRejectedValue("export failed");
    render(<MonthlyRecapSection />);

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    await waitFor(() => expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("export failed")));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});
