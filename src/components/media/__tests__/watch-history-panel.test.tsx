import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import type { ViewingEventNote } from "@/types/media";
import { WatchHistoryPanel } from "../watch-history-panel";

const eventsQueryMock = vi.fn();
vi.mock("@/features/progress/use-progress", () => ({
  useViewingEventsForMedia: (mediaId: number, mediaType: string) => eventsQueryMock(mediaId, mediaType),
}));

function makeEvent(overrides: Partial<ViewingEventNote> = {}): ViewingEventNote {
  return {
    id: "evt-1",
    eventType: "watched",
    watchedAt: "2026-01-01T00:00:00.000Z",
    episodeId: null,
    seasonNumber: null,
    episodeNumber: null,
    ...overrides,
  };
}

describe("WatchHistoryPanel", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    eventsQueryMock.mockReset();
  });

  it("renders nothing while loading", () => {
    eventsQueryMock.mockReturnValue({ isError: false, data: undefined, refetch: vi.fn() });
    const { container } = render(<WatchHistoryPanel mediaId={7} mediaType="movie" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no notes at all", () => {
    eventsQueryMock.mockReturnValue({ isError: false, data: [makeEvent({ note: undefined })], refetch: vi.fn() });
    const { container } = render(<WatchHistoryPanel mediaId={7} mediaType="movie" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("skips unwatched rollback events even if they somehow carry a note", () => {
    eventsQueryMock.mockReturnValue({
      isError: false,
      data: [makeEvent({ id: "evt-unwatched", eventType: "unwatched", note: "should never show" })],
      refetch: vi.fn(),
    });
    render(<WatchHistoryPanel mediaId={7} mediaType="movie" />);
    expect(screen.queryByText("should never show")).not.toBeInTheDocument();
  });

  it("lists noted watch events, most-recent-first order preserved from the query", () => {
    eventsQueryMock.mockReturnValue({
      isError: false,
      data: [
        makeEvent({ id: "evt-2", watchedAt: "2026-02-01T00:00:00.000Z", note: "Second watch, even better" }),
        makeEvent({ id: "evt-1", watchedAt: "2025-01-01T00:00:00.000Z", note: "First watch" }),
      ],
      refetch: vi.fn(),
    });
    render(<WatchHistoryPanel mediaId={7} mediaType="movie" />);

    expect(screen.getByText("Watch diary")).toBeInTheDocument();
    const notes = screen.getAllByText(/watch/i, { selector: "p.font-serif" });
    expect(notes.map((node) => node.textContent)).toEqual(["Second watch, even better", "First watch"]);
  });

  it("shows a retryable error state when the query fails", () => {
    const refetch = vi.fn();
    eventsQueryMock.mockReturnValue({ isError: true, data: undefined, refetch });
    render(<WatchHistoryPanel mediaId={7} mediaType="series" />);

    expect(screen.getByText("Couldn't load your watch diary — try again in a moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
