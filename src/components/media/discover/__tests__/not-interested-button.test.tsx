import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { NotInterestedButton } from "../not-interested-button";
import { makeMedia } from "@/shared/test-utils";

const dismissMock = vi.fn();
const isDismissingMock = vi.fn(() => false);
const toastMock = vi.fn();

vi.mock("@/features/recommendations/use-recommendations", () => ({
  useDismissedRecommendations: () => ({ dismiss: dismissMock, isDismissing: isDismissingMock() }),
}));

vi.mock("@/components/ui/use-toast", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));

describe("NotInterestedButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    dismissMock.mockReset().mockResolvedValue(undefined);
    isDismissingMock.mockReset().mockReturnValue(false);
    toastMock.mockReset();
  });

  it("dismisses the media, shows a success toast, and calls onDismissed", async () => {
    const onDismissed = vi.fn();
    const media = makeMedia({ id: 7, mediaType: "movie", title: "Dune", posterPath: "/p.jpg" });
    render(<NotInterestedButton media={media} onDismissed={onDismissed} />);

    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));

    await waitFor(() =>
      expect(dismissMock).toHaveBeenCalledWith({ id: 7, mediaType: "movie", title: "Dune", posterPath: "/p.jpg" })
    );
    await waitFor(() => expect(onDismissed).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("shows an error toast and does not call onDismissed when dismissing fails", async () => {
    dismissMock.mockRejectedValue(new Error("boom"));
    const onDismissed = vi.fn();
    render(<NotInterestedButton media={makeMedia({ id: 7 })} onDismissed={onDismissed} />);

    fireEvent.click(screen.getByRole("button", { name: "Not interested" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
    expect(onDismissed).not.toHaveBeenCalled();
  });

  it("disables the button while a dismiss is in flight", () => {
    isDismissingMock.mockReturnValue(true);
    render(<NotInterestedButton media={makeMedia({ id: 7 })} />);

    expect(screen.getByRole("button", { name: "Not interested" })).toBeDisabled();
  });
});
