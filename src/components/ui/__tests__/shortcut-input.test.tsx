import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShortcutInput } from "../shortcut-input";

vi.mock("@/shared/lib/platform", () => ({
  isMacOs: () => false,
}));

function ControlledShortcutInput({ initial = "mod+k" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <ShortcutInput label="Command palette" recordingLabel="Recording" value={value} onChange={setValue} />;
}

describe("ShortcutInput", () => {
  it("renders the current shortcut formatted for display", () => {
    render(<ShortcutInput label="Command palette" recordingLabel="Recording" value="mod+shift+k" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Command palette" })).toHaveTextContent("Ctrl+Shift+K");
  });

  it("enters recording mode on click, showing the recording label", () => {
    render(<ShortcutInput label="Command palette" recordingLabel="Recording" value="mod+k" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
    expect(screen.getByRole("button", { name: "Recording" })).toHaveTextContent("Recording");
  });

  it("captures a modifier+key combo while recording and calls onChange", () => {
    render(<ControlledShortcutInput />);
    fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Recording" }), { key: "j", ctrlKey: true });
    expect(screen.getByRole("button", { name: "Command palette" })).toHaveTextContent("Ctrl+J");
  });

  it("ignores a keypress with no modifier and stays in recording mode", () => {
    render(<ControlledShortcutInput />);
    fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Recording" }), { key: "j" });
    expect(screen.getByRole("button", { name: "Recording" })).toBeInTheDocument();
  });

  it("cancels recording on Escape without calling onChange", () => {
    const onChange = vi.fn();
    render(<ShortcutInput label="Command palette" recordingLabel="Recording" value="mod+k" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Command palette" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Recording" }), { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Command palette" })).toHaveTextContent("Ctrl+K");
  });

  it("cancels recording on blur", () => {
    render(<ShortcutInput label="Command palette" recordingLabel="Recording" value="mod+k" onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Command palette" });
    fireEvent.click(button);
    fireEvent.blur(screen.getByRole("button", { name: "Recording" }));
    expect(screen.getByRole("button", { name: "Command palette" })).toBeInTheDocument();
  });
});
