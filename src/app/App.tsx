import { useEffect } from "react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { AppRouter } from "@/app/router";
import { BrowserPreviewBanner } from "@/components/desktop/browser-preview-banner";
import { TokenGate } from "@/components/desktop/token-gate";
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
import { isTauriApp } from "@/shared/lib/platform";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function App() {
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
        } else {
          await maintenanceService.createAutomaticBackup();
        }

        await checkBackgroundNotifications();
      } catch (error: unknown) {
        logger.warn(`Startup maintenance checks failed: ${errorMessage(error)}`);
      }
    })();

    const interval = window.setInterval(
      () => {
        void checkBackgroundNotifications().catch((error: unknown) => {
          logger.warn(`Background notification check failed: ${errorMessage(error)}`);
        });
      },
      1000 * 60 * 60 * 6
    );

    return () => {
      disposed = true;
      cleanup?.();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <ThemeController />

      <MotionPreferenceGate>
        <TokenGate>
          <AppRouter />
          <OfflineIndicator />
        </TokenGate>
      </MotionPreferenceGate>

      <BrowserPreviewBanner />
      <Toaster />

      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" /> : null}
    </TooltipProvider>
  );
}
