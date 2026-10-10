import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import i18n from "@/i18n";
import { GuidedTour } from "../guided-tour";

const TOUR_TARGETS = ["tour-library", "tour-watch-tonight", "tour-settings", "tour-profile-switcher"];

function renderTargets(targets: string[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  for (const target of targets) {
    const el = document.createElement("button");
    el.setAttribute("data-tour", target);
    container.appendChild(el);
  }
  return container;
}

describe("GuidedTour", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  beforeEach(() => {
    // jsdom never lays anything out — every target needs a non-zero rect so
    // GuidedTour's own visibility filter (findVisibleTarget) keeps it.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      left: 100,
      bottom: 140,
      right: 200,
      width: 100,
      height: 40,
      x: 100,
      y: 100,
      toJSON: () => "",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("renders nothing and never calls onFinish when no tour target exists in the DOM", () => {
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it("shows the first step pointing at the first visible target", () => {
    renderTargets(TOUR_TARGETS);
    render(<GuidedTour onFinish={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: i18n.t("onboarding.tour.library.title") })).toBeInTheDocument();
    expect(screen.getByText(i18n.t("onboarding.tour.library.body"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("onboarding.tour.stepCounter", { current: 1, total: 4 }))).toBeInTheDocument();
  });

  it("skips a step whose target isn't in the DOM and adjusts the step count", () => {
    renderTargets(["tour-library", "tour-settings"]);
    render(<GuidedTour onFinish={vi.fn()} />);

    expect(screen.getByText(i18n.t("onboarding.tour.stepCounter", { current: 1, total: 2 }))).toBeInTheDocument();
  });

  it("advances to the next step and back again", () => {
    renderTargets(TOUR_TARGETS);
    render(<GuidedTour onFinish={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.tour.next") }));
    expect(screen.getByRole("dialog", { name: i18n.t("onboarding.tour.watchTonight.title") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.tour.back") }));
    expect(screen.getByRole("dialog", { name: i18n.t("onboarding.tour.library.title") })).toBeInTheDocument();
  });

  it("calls onFinish when Skip is clicked", () => {
    renderTargets(TOUR_TARGETS);
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.tour.skip") }));

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("shows Done instead of Next on the last step, and calls onFinish when clicked", () => {
    renderTargets(TOUR_TARGETS);
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);

    for (let i = 0; i < TOUR_TARGETS.length - 1; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.tour.next") }));
    }

    expect(screen.queryByRole("button", { name: i18n.t("onboarding.tour.next") })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.tour.done") }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("calls onFinish when Escape is pressed", () => {
    renderTargets(TOUR_TARGETS);
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("points at the element that replaced a target after the sidebar remounted", () => {
    const container = renderTargets(TOUR_TARGETS);
    render(<GuidedTour onFinish={vi.fn()} />);

    // The sidebar remounts: the old second target is detached and a new node
    // with the same data-tour attribute sits somewhere else.
    container.querySelector('[data-tour="tour-watch-tonight"]')?.remove();
    const replacement = document.createElement("button");
    replacement.setAttribute("data-tour", "tour-watch-tonight");
    replacement.setAttribute("data-moved", "true");
    container.appendChild(replacement);
    vi.mocked(Element.prototype.getBoundingClientRect).mockImplementation(function (this: Element) {
      const moved = this.getAttribute("data-moved") === "true";
      const top = moved ? 400 : 100;
      return {
        top,
        left: 100,
        bottom: top + 40,
        right: 200,
        width: 100,
        height: 40,
        x: 100,
        y: top,
        toJSON: () => "",
      };
    });

    fireEvent.click(screen.getByRole("button", { name: i18n.t("onboarding.tour.next") }));

    const dialog = screen.getByRole("dialog", { name: i18n.t("onboarding.tour.watchTonight.title") });
    // Tooltip sits GAP (12px) under the target: 400 + 40 + 12.
    expect(dialog.style.top).toBe("452px");
  });

  it("moves keyboard focus into the tour card and keeps it there on every step", () => {
    renderTargets(TOUR_TARGETS);
    render(<GuidedTour onFinish={vi.fn()} />);

    const next = screen.getByRole("button", { name: i18n.t("onboarding.tour.next") });
    expect(next).toHaveFocus();

    fireEvent.click(next);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("wraps Tab and Shift+Tab inside the card instead of leaving it", () => {
    renderTargets(TOUR_TARGETS);
    render(<GuidedTour onFinish={vi.fn()} />);
    const skip = screen.getByRole("button", { name: i18n.t("onboarding.tour.skip") });
    const next = screen.getByRole("button", { name: i18n.t("onboarding.tour.next") });

    fireEvent.keyDown(window, { key: "Tab" });
    expect(skip).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();
  });

  it("has no detectable accessibility violations", async () => {
    renderTargets(TOUR_TARGETS);
    render(<GuidedTour onFinish={vi.fn()} />);

    // The card only: the stand-in targets above are empty buttons.
    expect(await axe(screen.getByRole("dialog"))).toHaveNoViolations();
  });
});
