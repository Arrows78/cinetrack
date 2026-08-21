import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { Toast, ToastAction, ToastClose, ToastProvider, ToastViewport } from "../toast";
import { IconTooltip } from "../tooltip";

describe("Toast variants", () => {
  it("assigns the default variant's border/bg/text classes", () => {
    render(
      <ToastProvider>
        <Toast open>Default toast</Toast>
        <ToastViewport />
      </ToastProvider>
    );

    expect(screen.getByText("Default toast")).toHaveClass("border-border", "bg-card", "text-card-foreground");
  });

  it("assigns the success variant's border/bg/text classes", () => {
    render(
      <ToastProvider>
        <Toast open variant="success">
          Success toast
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );

    expect(screen.getByText("Success toast")).toHaveClass("border-success/30", "bg-success/10", "text-success");
  });

  it("assigns the warning variant's border/bg/text classes", () => {
    render(
      <ToastProvider>
        <Toast open variant="warning">
          Warning toast
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );

    expect(screen.getByText("Warning toast")).toHaveClass("border-warning/30", "bg-warning/10", "text-warning");
  });

  it("assigns the error variant's border/bg/text classes", () => {
    render(
      <ToastProvider>
        <Toast open variant="error">
          Error toast
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );

    expect(screen.getByText("Error toast")).toHaveClass(
      "border-destructive/30",
      "bg-destructive/10",
      "text-destructive"
    );
  });
});

describe("ToastAction", () => {
  it("renders inside a Toast with its own button styling and responds to clicks", () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Toast open>
          <ToastAction altText="Retry the action" onClick={onClick}>
            Retry
          </ToastAction>
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );

    const action = screen.getByRole("button", { name: "Retry" });
    expect(action).toHaveClass("rounded-xl", "border", "border-border");

    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("ToastClose", () => {
  it("exposes closeLabel as accessible, visually-hidden text", () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastClose closeLabel="Dismiss notification" />
        </Toast>
        <ToastViewport />
      </ToastProvider>
    );

    expect(screen.getByRole("button", { name: "Dismiss notification" })).toBeInTheDocument();
    expect(screen.getByText("Dismiss notification")).toHaveClass("sr-only");
  });
});

describe("IconTooltip", () => {
  it("renders its trigger via asChild without wrapping it in an extra element", () => {
    render(
      <IconTooltip label="Add to library">
        <button type="button">Star</button>
      </IconTooltip>
    );

    const trigger = screen.getByRole("button", { name: "Star" });
    expect(trigger).toBeInTheDocument();
    expect(trigger.tagName).toBe("BUTTON");
  });

  it("shows the label content when the trigger is focused", async () => {
    render(
      <IconTooltip label="Add to library">
        <button type="button">Star</button>
      </IconTooltip>
    );

    fireEvent.focus(screen.getByRole("button", { name: "Star" }));

    await waitFor(() => {
      expect(screen.getAllByText("Add to library").length).toBeGreaterThan(0);
    });
  });
});
