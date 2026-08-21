import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { AsyncActionFeedback } from "../async-action-feedback";
import { FormField } from "../form-field";
import { SettingToggle } from "../setting-toggle";

describe("form primitives", () => {
  it("renders AsyncActionFeedback tones with the correct role and aria-live", () => {
    const { rerender } = render(<AsyncActionFeedback>Neutral message</AsyncActionFeedback>);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Neutral message");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("rounded-2xl", "border", "bg-muted/40");

    rerender(<AsyncActionFeedback tone="error">Error message</AsyncActionFeedback>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Error message");
    expect(alert).not.toHaveAttribute("aria-live");
    expect(alert).toHaveClass("border-destructive/25", "bg-destructive/10");

    rerender(<AsyncActionFeedback tone="plain">Plain message</AsyncActionFeedback>);
    expect(screen.getByRole("status")).toHaveClass("text-sm", "text-muted-foreground");

    rerender(<AsyncActionFeedback tone="success">Success message</AsyncActionFeedback>);
    expect(screen.getByRole("status")).toHaveClass("border-success/30", "bg-success/5");
  });

  it("wires FormField's describedById to help text, with error taking precedence", () => {
    const { rerender } = render(
      <FormField label="Name">
        {(describedById) => <input aria-label="Name input" data-describedby={describedById ?? ""} />}
      </FormField>
    );
    expect(screen.getByLabelText("Name input")).toHaveAttribute("data-describedby", "");

    rerender(
      <FormField label="Name" help="Enter your full name">
        {(describedById) => <input aria-label="Name input" data-describedby={describedById ?? ""} />}
      </FormField>
    );
    const helpInput = screen.getByLabelText("Name input");
    const helpId = helpInput.getAttribute("data-describedby");
    expect(helpId).toBeTruthy();
    expect(screen.getByText("Enter your full name")).toHaveAttribute("id", helpId!);

    rerender(
      <FormField label="Name" help="Enter your full name" error="Name is required">
        {(describedById) => <input aria-label="Name input" data-describedby={describedById ?? ""} />}
      </FormField>
    );
    const errorInput = screen.getByLabelText("Name input");
    const errorId = errorInput.getAttribute("data-describedby");
    expect(errorId).toBeTruthy();
    expect(errorId).not.toBe(helpId);
    expect(screen.getByText("Name is required")).toHaveAttribute("id", errorId!);
    expect(screen.queryByText("Enter your full name")).not.toBeInTheDocument();
  });

  it("renders SettingToggle pressed states and handles click/disabled behavior", () => {
    const onPressedChange = vi.fn();
    const { rerender } = render(<SettingToggle label="Dark mode" pressed onPressedChange={onPressedChange} />);
    const pressedButton = screen.getByRole("button", { name: "Dark mode" });
    expect(pressedButton).toHaveAttribute("aria-pressed", "true");
    expect(pressedButton).toHaveClass("bg-secondary");

    fireEvent.click(pressedButton);
    expect(onPressedChange).toHaveBeenCalledTimes(1);

    rerender(<SettingToggle label="Dark mode" pressed={false} onPressedChange={onPressedChange} />);
    const unpressedButton = screen.getByRole("button", { name: "Dark mode" });
    expect(unpressedButton).toHaveAttribute("aria-pressed", "false");
    expect(unpressedButton).toHaveClass("border-border", "bg-card/60");

    rerender(<SettingToggle label="Dark mode" pressed={false} onPressedChange={onPressedChange} disabled />);
    const disabledButton = screen.getByRole("button", { name: "Dark mode" });
    expect(disabledButton).toBeDisabled();
    fireEvent.click(disabledButton);
    expect(onPressedChange).toHaveBeenCalledTimes(1);
  });
});
