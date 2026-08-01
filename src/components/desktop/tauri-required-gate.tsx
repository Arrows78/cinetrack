import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MonitorX } from "lucide-react";
import { isTauriApp } from "@/shared/lib/platform";

/**
 * CineTrack's only persistence layer is SQLite, reachable exclusively from
 * inside the Tauri webview — a plain browser tab has no access to Tauri's
 * IPC bridge, even when it's pointed at the same dev server `pnpm tauri dev`
 * uses. Rather than let every repository call fail one by one, block
 * rendering here with one clear explanation.
 */
export function TauriRequiredGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  if (isTauriApp()) return children;

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-lg rounded-shell border border-border bg-card p-7 text-center shadow-2xl">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <MonitorX className="size-6" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold">{t("tauriRequired.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("tauriRequired.description")}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("tauriRequired.instructions")}</p>
      </div>
    </main>
  );
}
