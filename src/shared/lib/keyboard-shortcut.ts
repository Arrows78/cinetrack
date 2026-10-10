// A shortcut is normalized as modifier-parts joined by "+", lowercase,
// ending in the plain key — e.g. "mod+k", "mod+shift+k". "mod" stands for
// Cmd on macOS / Ctrl everywhere else, matching how command-palette.tsx's
// own listener already treats `metaKey || ctrlKey` as equivalent. This is
// the one canonical form stored in preferences and produced/consumed by
// ShortcutInput — conversion to tauri-plugin-global-shortcut's own string
// format only happens at the point of registering it (toTauriGlobalShortcut
// below), so nothing else in the app needs to know that format exists.
const MODIFIER_KEYS = new Set(["Control", "Meta", "Shift", "Alt", "AltGraph", "OS"]);

// "+" is the separator and " " is invisible, so neither can be stored as the
// key itself ("mod++" splits into an empty key, "mod+ " can't be read back or
// registered with the OS) — they're stored, matched, shown and registered
// under a name instead.
const KEY_NAMES: Record<string, string> = { "+": "plus", " ": "space" };
const KEY_LABELS: Record<string, string> = { plus: "Plus", space: "Space" };

function normalizeKey(key: string): string {
  return KEY_NAMES[key] ?? key.toLowerCase();
}

function keyLabel(key: string): string {
  return KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

function modifierPrefix(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): string[] {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  return parts;
}

/**
 * Builds a normalized shortcut string from a live keydown event, or `null`
 * when the event is just a bare modifier key (nothing to capture yet) or
 * carries no modifier at all — a modifier-less single key would fire while
 * typing in any text field, so it's never accepted as a shortcut.
 */
export function captureShortcutFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const modifiers = modifierPrefix(event);
  if (modifiers.length === 0) return null;
  return [...modifiers, normalizeKey(event.key)].join("+");
}

export function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  if (modifiers.includes("mod") !== (event.metaKey || event.ctrlKey)) return false;
  if (modifiers.includes("shift") !== event.shiftKey) return false;
  if (modifiers.includes("alt") !== event.altKey) return false;
  return normalizeKey(event.key) === key;
}

function displayModifier(part: string, isMac: boolean): string {
  if (part === "mod") return isMac ? "⌘" : "Ctrl";
  if (part === "shift") return isMac ? "⇧" : "Shift";
  if (part === "alt") return isMac ? "⌥" : "Alt";
  return part;
}

export function formatShortcutForDisplay(shortcut: string, isMac: boolean): string {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);
  const labels = [...modifiers.map((part) => displayModifier(part, isMac)), keyLabel(key)];
  return isMac ? labels.join("") : labels.join("+");
}

/** Converts a normalized shortcut to tauri-plugin-global-shortcut's own string format (e.g. "CommandOrControl+Shift+K"). */
export function toTauriGlobalShortcut(shortcut: string): string {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = parts.slice(0, -1);
  const mapped = modifiers.map((part) => {
    if (part === "mod") return "CommandOrControl";
    if (part === "shift") return "Shift";
    if (part === "alt") return "Alt";
    return part;
  });
  return [...mapped, keyLabel(key)].join("+");
}
