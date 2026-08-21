/**
 * Cross-file event names dispatched via `window.dispatchEvent(new
 * CustomEvent(...))`. Centralized here so the producer and consumer(s)
 * always reference the same string and a rename is a single-edit.
 */

export const EVENTS = {
  /** Opens the command palette from the desktop menu or global shortcut. */
  COMMAND_PALETTE: "cinetrack:command-palette",

  /** Programmatic navigation triggered from the Rust side (deep-link / menu). */
  NAVIGATE: "cinetrack:navigate",

  /** Deep-link URL received from the OS. */
  DEEP_LINK: "cinetrack:deep-link",
} as const;
