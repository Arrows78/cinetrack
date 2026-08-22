import { type } from "@tauri-apps/plugin-os";

export const isTauriApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MOBILE_OS_TYPES = new Set(["ios", "android"]);

/**
 * True on iOS/Android, false everywhere else (including outside Tauri
 * entirely) — the counterpart to isDesktopApp() below, for call sites that
 * need to branch the other way (e.g. routing a file through the native
 * share sheet instead of a browser `<a download>`).
 */
export const isMobileApp = () => isTauriApp() && MOBILE_OS_TYPES.has(type());

/**
 * True on macOS/Windows/Linux, false on iOS/Android — unlike isTauriApp(),
 * which only tells you "inside a Tauri webview" and is true on every
 * platform. Desktop-only plugins (autostart, global-shortcut, updater —
 * see Cargo.toml's target_os gate) aren't linked into the mobile binary at
 * all, so a command call through one of them fails at the IPC layer on
 * iOS/Android; UI that triggers those calls must gate on this, not
 * isTauriApp().
 */
export const isDesktopApp = () => isTauriApp() && !MOBILE_OS_TYPES.has(type());
