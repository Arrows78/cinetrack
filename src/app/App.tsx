import { defaultPreferences } from "@/shared/constants/preferences-schema";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { AppRouter } from "@/app/router";
import { checkBackgroundNotifications, runPeriodicChecks } from "@/app/periodic-checks";
import { BrowserPreviewBanner } from "@/components/desktop/browser-preview-banner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineIndicator } from "@/components/layout/offline-indicator";
import { LanguageController } from "@/components/layout/language-controller";
import { ThemeController } from "@/components/layout/theme-controller";
import { AmbientMotionController } from "@/components/layout/ambient-motion-controller";
import { MilestoneCelebrationController } from "@/components/layout/milestone-celebration-controller";
import { MotionPreferenceGate } from "@/components/layout/motion-preference-gate";
import { desktopService } from "@/features/desktop/desktop-service";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { logger } from "@/shared/lib/logger";
import { syncService } from "@/features/sync/sync-service";
import type { BootRecovery } from "@/features/desktop/boot-recovery-repository";
import { errorMessage } from "@/shared/lib/errors";
import { isTauriApp } from "@/shared/lib/platform";
import { appBootStartedAt } from "@/shared/lib/startup-timing";
import { TOOLTIP_DELAY_MS } from "@/shared/constants/query";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTrayLanguage } from "@/app/use-tray-language";

// Module-level, not component state: React StrictMode intentionally mounts
// this component's effect twice in dev (mount -> cleanup -> mount again) —
// without this guard, "startup.total" would be logged twice, the second
// time as a near-instant remount rather than the app's real boot time.
let startupLogged = false;

export function App() {
  const queryClient = useQueryClient();
  useTrayLanguage();

  useEffect(() => {
    if (!startupLogged) {
      startupLogged = true;
      // App only ever mounts once BootRecoveryGate and AuthRoot (both above
      // it in main.tsx) have let real content through — this is "the app
      // is up," not just "React committed something," which is the whole
      // point of this measurement. Covers JS boot only: startup.database
      // (Rust-side pool init/migrations) isn't part of this number.
      logger.info(`startup.total duration=${Math.round(performance.now() - appBootStartedAt)}ms`);
    }

    // Nothing below reaches SQLite (or any native Tauri capability) without
    // the Tauri webview. The rest of the UI still renders in a plain browser
    // tab (see BrowserPreviewBanner) for layout/styling work, but there's no
    // point racing this background init into failures that would just be
    // caught and logged.
    if (!isTauriApp()) return;

    let cleanup: (() => void) | undefined;
    let cleanupSync: (() => void) | undefined;
    let disposed = false;

    void desktopService
      .initialize()
      .then((value) => {
        if (disposed) {
          value?.();
          return;
        }

        cleanup = value;
      })
      .catch((error: unknown) => {
        logger.warn(`Desktop initialization failed: ${errorMessage(error)}`);
      });

    void syncService
      .initialize(queryClient)
      .then((value) => {
        if (disposed) value?.();
        else cleanupSync = value;
      })
      .catch((error: unknown) => {
        logger.warn(`Cloud sync initialization failed: ${errorMessage(error)}`);
      });

    void (async () => {
      try {
        const check = await maintenanceService.checkDataIntegrity();

        if (!check.healthy) {
          logger.error(`Database integrity check failed: ${check.detail}`);
          // No "continue anyway" for this, same as a failed migration (see
          // BootRecovery.blocked's doc comment) — writing straight into the
          // boot-recovery query cache (rather than a separate store) means
          // BootRecoveryGate, still mounted above this component, picks it
          // up and swaps back to its blocking screen instead of silently
          // leaving a known-unhealthy database open for writes.
          queryClient.setQueryData<BootRecovery>(["boot-recovery"], (previous) =>
            previous
              ? { ...previous, blocked: true, originalError: `Database failed its integrity check: ${check.detail}` }
              : previous
          );
        } else {
          await maintenanceService.createAutomaticBackup();
        }

        await checkBackgroundNotifications();
      } catch (error: unknown) {
        logger.warn(`Startup maintenance checks failed: ${errorMessage(error)}`);
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
      cleanupSync?.();
    };
  }, [queryClient]);

  // Its own effect (rather than folded into the boot effect above) so
  // changing availabilityCheckIntervalHours in Settings just re-schedules
  // this interval, instead of re-running desktop/sync init and the
  // integrity-check/backup sequence too.
  const availabilityCheckIntervalHours =
    usePreferences().data?.availabilityCheckIntervalHours ?? defaultPreferences.availabilityCheckIntervalHours;
  useEffect(() => {
    if (!isTauriApp()) return;

    const interval = window.setInterval(
      () => {
        void runPeriodicChecks().catch((error: unknown) => {
          logger.warn(`Background notification check failed: ${errorMessage(error)}`);
        });
      },
      availabilityCheckIntervalHours * 60 * 60 * 1000
    );

    return () => window.clearInterval(interval);
  }, [availabilityCheckIntervalHours]);

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <ThemeController />
      <LanguageController />
      <AmbientMotionController />
      <MilestoneCelebrationController />

      <MotionPreferenceGate>
        <AppRouter />
        <OfflineIndicator />
      </MotionPreferenceGate>

      <BrowserPreviewBanner />
      <Toaster />

      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" /> : null}
    </TooltipProvider>
  );
}
