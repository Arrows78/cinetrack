import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { HiddenTitlesCard } from "../hidden-titles-card";
import type { DismissedRecommendation } from "@/types/media";

const useDismissedRecommendationsMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/features/recommendations/use-recommendations", () => ({
  useDismissedRecommendations: () => useDismissedRecommendationsMock(),
}));

vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

function makeDismissed(overrides: Partial<DismissedRecommendation> = {}): DismissedRecommendation {
  return {
    id: "dr-1",
    profileId: "default",
    mediaId: 7,
    mediaType: "movie",
    title: "Dune",
    posterPath: null,
    dismissedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const undismissMock = vi.fn();
const refetchMock = vi.fn();

function baseState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: [] as DismissedRecommendation[],
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
    undismiss: undismissMock,
    isUndismissing: false,
    ...overrides,
  };
}

describe("HiddenTitlesCard", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    undismissMock.mockReset().mockResolvedValue(undefined);
    refetchMock.mockReset();
    toastMock.mockReset();
    useDismissedRecommendationsMock.mockReset().mockReturnValue(baseState());
  });

  it("shows an empty state when nothing is hidden", () => {
    render(<HiddenTitlesCard />);
    expect(screen.getByText("No hidden titles")).toBeInTheDocument();
  });

  it("lists every hidden title with a restore button", () => {
    useDismissedRecommendationsMock.mockReturnValue(baseState({ data: [makeDismissed({ title: "Dune" })] }));
    render(<HiddenTitlesCard />);

    expect(screen.getByText("Dune")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show again" })).toBeInTheDocument();
  });

  it("restores a title and shows a success toast", async () => {
    useDismissedRecommendationsMock.mockReturnValue(
      baseState({ data: [makeDismissed({ mediaId: 7, mediaType: "movie", title: "Dune" })] })
    );
    render(<HiddenTitlesCard />);

    fireEvent.click(screen.getByRole("button", { name: "Show again" }));

    await waitFor(() => expect(undismissMock).toHaveBeenCalledWith({ mediaId: 7, mediaType: "movie" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" })));
  });

  it("shows an error toast when restoring fails", async () => {
    undismissMock.mockRejectedValue(new Error("boom"));
    useDismissedRecommendationsMock.mockReturnValue(baseState({ data: [makeDismissed()] }));
    render(<HiddenTitlesCard />);

    fireEvent.click(screen.getByRole("button", { name: "Show again" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
  });

  it("shows a remote error state and retries via refetch", () => {
    useDismissedRecommendationsMock.mockReturnValue(baseState({ isError: true, error: new Error("boom") }));
    render(<HiddenTitlesCard />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });
});
