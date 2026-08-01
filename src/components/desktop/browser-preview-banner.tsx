import { useTranslation } from "react-i18next";
import { MonitorX } from "lucide-react";
import { isTauriApp } from "@/shared/lib/platform";

/**
 * CineTrack's only persistence layer is SQLite, reachable exclusively from
 * inside the Tauri webview — a plain browser tab has no access to Tauri's
 * IPC bridge, even when it's pointed at the same dev server `pnpm tauri dev`
 * uses. Rather than block the whole UI, this just flags the limitation: every
 * local-data hook already tolerates a failed/undefined query (none of them
 * use React Query's suspense mode), so the app still renders its full visual
 * shell for layout/styling work — reads and writes to SQLite just silently
 * fail instead of doing anything.
 */
export function BrowserPreviewBanner() {
  const { t } = useTranslation();

  if (isTauriApp()) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/30 bg-background px-4 py-2 text-sm shadow-xl">
      <MonitorX className="size-4 text-amber-500" />
      {t("browserPreview.message")}
    </div>
  );
}
