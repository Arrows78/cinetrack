import { describe, expect, it } from "vitest";
import {
  captureShortcutFromEvent,
  formatShortcutForDisplay,
  shortcutMatchesEvent,
  toTauriGlobalShortcut,
} from "../keyboard-shortcut";

function keyEvent(init: Partial<KeyboardEvent> & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
  });
}

describe("captureShortcutFromEvent", () => {
  it("captures a modifier+key combo, normalized and lowercase", () => {
    expect(captureShortcutFromEvent(keyEvent({ key: "K", metaKey: true }))).toBe("mod+k");
    expect(captureShortcutFromEvent(keyEvent({ key: "j", ctrlKey: true, shiftKey: true }))).toBe("mod+shift+j");
  });

  it("returns null for a bare modifier keypress (nothing captured yet)", () => {
    expect(captureShortcutFromEvent(keyEvent({ key: "Meta", metaKey: true }))).toBeNull();
    expect(captureShortcutFromEvent(keyEvent({ key: "Shift", shiftKey: true }))).toBeNull();
  });

  it("returns null for a key pressed with no modifier at all", () => {
    expect(captureShortcutFromEvent(keyEvent({ key: "k" }))).toBeNull();
  });
});

describe("shortcutMatchesEvent", () => {
  it("matches when modifiers and key line up exactly", () => {
    expect(shortcutMatchesEvent("mod+k", keyEvent({ key: "k", ctrlKey: true }))).toBe(true);
    expect(shortcutMatchesEvent("mod+k", keyEvent({ key: "k", metaKey: true }))).toBe(true);
  });

  it("does not match when an extra modifier is held", () => {
    expect(shortcutMatchesEvent("mod+k", keyEvent({ key: "k", metaKey: true, shiftKey: true }))).toBe(false);
  });

  it("does not match a different key", () => {
    expect(shortcutMatchesEvent("mod+k", keyEvent({ key: "j", metaKey: true }))).toBe(false);
  });
});

describe("formatShortcutForDisplay", () => {
  it("renders glyphs with no separators on macOS", () => {
    expect(formatShortcutForDisplay("mod+shift+k", true)).toBe("⌘⇧K");
  });

  it("renders words joined by + off macOS", () => {
    expect(formatShortcutForDisplay("mod+shift+k", false)).toBe("Ctrl+Shift+K");
  });
});

describe("toTauriGlobalShortcut", () => {
  it("converts the normalized form to tauri-plugin-global-shortcut's own format", () => {
    expect(toTauriGlobalShortcut("mod+shift+k")).toBe("CommandOrControl+Shift+K");
    expect(toTauriGlobalShortcut("mod+k")).toBe("CommandOrControl+K");
  });
});
