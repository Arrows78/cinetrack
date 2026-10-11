import { defineCommand } from "@/shared/lib/invoke";

export const trayCommands = {
  // The tray menu is native, so it cannot read the webview's translations:
  // Rust keeps its own labels and is told which language to show.
  setLanguage: defineCommand<{ language: "en" | "fr" }, void>("set_tray_language"),
} as const;
