import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import i18n from "@/i18n";
import type { Episode } from "@/types/media";
import { EpisodeCard } from "../episode-card";

vi.mock("@/features/preferences/use-preferences", () => ({
  usePreferences: () => ({ data: {} }),
}));

const useIsTouchDeviceMock = vi.fn();
vi.mock("@/hooks/use-is-touch-device", () => ({
  useIsTouchDevice: () => useIsTouchDeviceMock(),
}));

// jsdom can't drive a real drag: the swipe's release handler is wired to a
// pointer-up and the dragged distance comes from a settable value.
const drag = vi.hoisted(() => ({ distance: 0 }));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, onDragEnd, className }: PropsWithChildren<{ onDragEnd?: () => void; className?: string }>) => (
      <div data-testid={onDragEnd ? "swipe-row" : undefined} className={className} onPointerUp={onDragEnd}>
        {children}
      </div>
    ),
  },
  useMotionValue: () => ({ get: () => drag.distance }),
  useTransform: () => ({}),
}));

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 1,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Pilot",
    overview: "",
    airDate: "2020-01-01",
    watched: true,
    ...overrides,
  };
}

describe("EpisodeCard unmark confirmation", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });
  beforeEach(() => {
    drag.distance = 0;
    useIsTouchDeviceMock.mockReturnValue(false);
  });

  it("unmarks a plain watched episode straight away", () => {
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode()} onToggleSeen={onToggleSeen} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark unwatched" }));
    expect(onToggleSeen).toHaveBeenCalledTimes(1);
  });

  it("asks first when the episode carries a rating or a custom watch date, and only unmarks on confirm", async () => {
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode()} hasUserData onToggleSeen={onToggleSeen} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark unwatched" }));
    expect(onToggleSeen).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: i18n.t("series.unmarkConfirm") }));
    expect(onToggleSeen).toHaveBeenCalledTimes(1);
  });

  it("keeps the episode watched when the confirmation is cancelled", async () => {
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode()} hasUserData onToggleSeen={onToggleSeen} />);

    fireEvent.click(screen.getByRole("button", { name: "Mark unwatched" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: i18n.t("common.cancel") }));
    expect(onToggleSeen).not.toHaveBeenCalled();
  });

  it("always confirms a swipe that would unmark, even for a plain episode", async () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode()} onToggleSeen={onToggleSeen} />);

    drag.distance = -120;
    fireEvent.pointerUp(screen.getByTestId("swipe-row"));
    expect(onToggleSeen).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: i18n.t("series.unmarkConfirm") }));
    expect(onToggleSeen).toHaveBeenCalledTimes(1);
  });

  it("marks an unwatched episode on a long swipe without asking, and ignores a short nudge", () => {
    useIsTouchDeviceMock.mockReturnValue(true);
    const onToggleSeen = vi.fn();
    render(<EpisodeCard episode={makeEpisode({ watched: false })} onToggleSeen={onToggleSeen} />);

    drag.distance = 20;
    fireEvent.pointerUp(screen.getByTestId("swipe-row"));
    expect(onToggleSeen).not.toHaveBeenCalled();

    drag.distance = 100;
    fireEvent.pointerUp(screen.getByTestId("swipe-row"));
    expect(onToggleSeen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
