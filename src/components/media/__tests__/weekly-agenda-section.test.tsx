import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import i18n from "@/i18n";
import { WeeklyAgendaSection } from "../weekly-agenda-section";
import type { TrackingEntry } from "@/types/media";

const { useWeeklyAgendaMock, loggerWarnMock } = vi.hoisted(() => ({
  useWeeklyAgendaMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/features/calendar/use-weekly-agenda", () => ({
  useWeeklyAgenda: () => useWeeklyAgendaMock(),
}));

vi.mock("@/features/diagnostics/logger", () => ({
  logger: { warn: loggerWarnMock, error: vi.fn(), info: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params }: PropsWithChildren<{ to: string; params?: Record<string, string> }>) => (
    <a href={to} data-params={params ? JSON.stringify(params) : undefined}>
      {children}
    </a>
  ),
}));

function entry(overrides: Partial<TrackingEntry> = {}): TrackingEntry {
  return {
    id: "entry-1",
    mediaId: 1,
    mediaType: "movie",
    title: "Dune Part Three",
    type: "release",
    scope: "mine",
    date: "2099-01-01",
    ...overrides,
  };
}

describe("WeeklyAgendaSection", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    useWeeklyAgendaMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it("renders nothing while loading", () => {
    useWeeklyAgendaMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null });
    const { container } = render(<WeeklyAgendaSection index={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing, but logs, when the query errors", () => {
    const error = new Error("boom");
    useWeeklyAgendaMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error });
    const { container } = render(<WeeklyAgendaSection index={0} />);

    expect(container).toBeEmptyDOMElement();
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });

  it("renders nothing when there are no agenda entries", () => {
    useWeeklyAgendaMock.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
    const { container } = render(<WeeklyAgendaSection index={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a movie release row with its countdown chip", () => {
    useWeeklyAgendaMock.mockReturnValue({
      data: [entry({ title: "Dune Part Three", date: "2099-01-01" })],
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<WeeklyAgendaSection index={1} />);

    expect(screen.getByRole("heading", { name: "This week" })).toBeInTheDocument();
    expect(screen.getByText("Dune Part Three")).toBeInTheDocument();
    expect(screen.getByText("Theatrical release")).toBeInTheDocument();
  });

  it("renders an episode row with its formatted episode code", () => {
    useWeeklyAgendaMock.mockReturnValue({
      data: [
        entry({
          id: "ep-1",
          type: "episode",
          mediaType: "series",
          title: "The Wire",
          seasonNumber: 2,
          episodeNumber: 5,
          date: "2099-01-02",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<WeeklyAgendaSection index={1} />);

    expect(screen.getByText("The Wire")).toBeInTheDocument();
    expect(screen.getByText("S2E5")).toBeInTheDocument();
  });

  it("renders an availability entry with the 'available now' badge instead of a countdown", () => {
    useWeeklyAgendaMock.mockReturnValue({
      data: [entry({ id: "avail-1", type: "availability", date: null, available: true, title: "Arrival" })],
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<WeeklyAgendaSection index={1} />);

    expect(screen.getByText("Arrival")).toBeInTheDocument();
    expect(screen.getByText("Available now")).toBeInTheDocument();
  });
});
