import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { AppRouter } from "@/app/router";
import { BrowserPreviewBanner } from "@/components/desktop/browser-preview-banner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineIndicator } from "@/components/layout/offline-indicator";
import { ThemeController } from "@/components/layout/theme-controller";
import { MotionPreferenceGate } from "@/components/layout/motion-preference-gate";
import { availabilityMonitor } from "@/features/availability/availability-monitor";
import { desktopService } from "@/features/desktop/desktop-service";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { logger } from "@/features/diagnostics/logger";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { trackingService } from "@/features/tracking/tracking-service";
import { notificationService } from "@/features/desktop/notification-service";
import type { BootRecovery } from "@/features/desktop/boot-recovery-repository";
import { errorMessage } from "@/shared/lib/errors";
import { isTauriApp } from "@/shared/lib/platform";
import { STALE_6_HOURS, TOOLTIP_DELAY_MS } from "@/shared/constants/query";

export function App() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Nothing below reaches SQLite (or any native Tauri capability) without
    // the Tauri webview. The rest of the UI still renders in a plain browser
    // tab (see BrowserPreviewBanner) for layout/styling work, but there's no
    // point racing this background init into failures that would just be
    // caught and logged.
    if (!isTauriApp()) return;

    let cleanup: (() => void) | undefined;
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

    const checkBackgroundNotifications = async () => {
      const preferences = await preferencesRepository.getPreferences();
      await availabilityMonitor.checkAll({ notificationsEnabled: preferences.notificationsEnabled });
      if (!preferences.notificationsEnabled) return;
      // Only entries the user actually tracks (library movies, tracked-series
      // episodes) can reach a notification — see buildNotifiableCalendarEntries.
      const entries = await trackingService.buildNotifiableCalendarEntries();
      await notificationService.notifyDue(entries, preferences);
    };

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

    const interval = window.setInterval(() => {
      void checkBackgroundNotifications().catch((error: unknown) => {
        logger.warn(`Background notification check failed: ${errorMessage(error)}`);
      });
    }, STALE_6_HOURS);

    return () => {
      disposed = true;
      cleanup?.();
      window.clearInterval(interval);
    };
  }, [queryClient]);

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>
      <ThemeController />

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
