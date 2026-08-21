import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "@/i18n";
import { CONFETTI_DELAY_MS } from "@/shared/constants/query";
import { SeenToggle } from "../seen-toggle";
import { SeenToggleButton } from "../seen-toggle-button";

const celebrateMock = vi.fn();
const burstFromRefMock = vi.fn();

vi.mock("@/hooks/use-confetti", () => ({
  useConfetti: () => ({
    celebrate: (...args: unknown[]) => celebrateMock(...args),
    burstFromRef: (...args: unknown[]) => burstFromRefMock(...args),
    burst: vi.fn(),
  }),
}));

describe("SeenToggle", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    celebrateMock.mockReset();
    burstFromRefMock.mockReset();
  });

  it("bursts confetti, then celebrates after the confetti delay, then toggles when marking as seen", () => {
    vi.useFakeTimers();
    try {
      const onToggle = vi.fn();
      render(<SeenToggle seen={false} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

      expect(burstFromRefMock).toHaveBeenCalledTimes(1);
      expect(celebrateMock).not.toHaveBeenCalled();
      expect(onToggle).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(CONFETTI_DELAY_MS);
      expect(celebrateMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not trigger confetti when toggling from seen back to unseen, but still toggles", () => {
    vi.useFakeTimers();
    try {
      const onToggle = vi.fn();
      render(<SeenToggle seen onToggle={onToggle} />);

      fireEvent.click(screen.getByRole("button", { name: "Watched" }));

      vi.advanceTimersByTime(CONFETTI_DELAY_MS);
      expect(burstFromRefMock).not.toHaveBeenCalled();
      expect(celebrateMock).not.toHaveBeenCalled();
      expect(onToggle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("suppresses confetti when celebrateOnSeen is false, even when marking as seen", () => {
    vi.useFakeTimers();
    try {
      const onToggle = vi.fn();
      render(<SeenToggle seen={false} onToggle={onToggle} celebrateOnSeen={false} />);

      fireEvent.click(screen.getByRole("button", { name: "Mark as watched" }));

      vi.advanceTimersByTime(CONFETTI_DELAY_MS);
      expect(burstFromRefMock).not.toHaveBeenCalled();
      expect(celebrateMock).not.toHaveBeenCalled();
      expect(onToggle).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing at all when disabled", () => {
    const onToggle = vi.fn();
    render(<SeenToggle seen={false} onToggle={onToggle} disabled />);

    const button = screen.getByRole("button", { name: "Mark as watched" });
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(onToggle).not.toHaveBeenCalled();
    expect(burstFromRefMock).not.toHaveBeenCalled();
    expect(celebrateMock).not.toHaveBeenCalled();
  });

  it("falls back to the translated defaults when no label overrides are given", () => {
    const { rerender } = render(<SeenToggle seen={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Mark as watched")).toBeInTheDocument();

    rerender(<SeenToggle seen onToggle={vi.fn()} />);
    expect(screen.getByText("Watched")).toBeInTheDocument();
  });

  it("uses labelSeen/labelUnseen overrides instead of the translated defaults", () => {
    const { rerender } = render(
      <SeenToggle seen={false} onToggle={vi.fn()} labelUnseen="Not watched yet" labelSeen="All done" />
    );
    expect(screen.getByText("Not watched yet")).toBeInTheDocument();
    expect(screen.queryByText("Mark as watched")).not.toBeInTheDocument();

    rerender(<SeenToggle seen onToggle={vi.fn()} labelUnseen="Not watched yet" labelSeen="All done" />);
    expect(screen.getByText("All done")).toBeInTheDocument();
    expect(screen.queryByText("Watched")).not.toBeInTheDocument();
  });
});

describe("SeenToggleButton", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the spinner and disables the button while isSaving", () => {
    const { container } = render(<SeenToggleButton isSaving onToggle={vi.fn()} seen={false} />);

    const button = screen.getByRole("button", { name: "Mark as watched" });
    expect(button).toBeDisabled();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows the check icon with seen styling when not saving and seen", () => {
    const { container } = render(<SeenToggleButton isSaving={false} onToggle={vi.fn()} seen />);

    const button = screen.getByRole("button", { name: "Mark as watched" });
    expect(button).not.toBeDisabled();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(button.className).toContain("border-success");
    expect(button.className).toContain("bg-success");
  });

  it("does not use seen styling when not saving and unseen", () => {
    render(<SeenToggleButton isSaving={false} onToggle={vi.fn()} seen={false} />);

    const button = screen.getByRole("button", { name: "Mark as watched" });
    expect(button.className).not.toContain("border-success");
  });

  it("calls and awaits onToggle on click, briefly showing seen styling via justChecked", async () => {
    let resolveToggle: () => void = () => {};
    const onToggle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        })
    );

    render(<SeenToggleButton isSaving={false} onToggle={onToggle} seen={false} />);
    const button = screen.getByRole("button", { name: "Mark as watched" });

    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button.className).toContain("border-success"));

    resolveToggle();
    await waitFor(() => expect(button.className).not.toContain("border-success"));
  });
});
