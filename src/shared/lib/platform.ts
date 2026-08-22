import { type } from "@tauri-apps/plugin-os";

export const isTauriApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * True on macOS/Windows/Linux, false on iOS/Android — unlike isTauriApp(),
 * which only tells you "inside a Tauri webview" and is true on every
 * platform. Desktop-only plugins (autostart, global-shortcut, updater —
 * see Cargo.toml's target_os gate) aren't linked into the mobile binary at
 * all, so a command call through one of them fails at the IPC layer on
 * iOS/Android; UI that triggers those calls must gate on this, not
 * isTauriApp().
 */
export const isDesktopApp = () => isTauriApp() && type() !== "ios" && type() !== "android";
