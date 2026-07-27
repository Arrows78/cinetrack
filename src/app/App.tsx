import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient, queryPersister } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { CommandPalette } from "@/components/desktop/command-palette";
import { TokenGate } from "@/components/desktop/token-gate";
import { OfflineIndicator } from "@/components/layout/offline-indicator";
import { ThemeController } from "@/components/layout/theme-controller";
import { availabilityMonitor } from "@/features/availability/availability-monitor";
import { calendarService } from "@/features/calendar/calendar-service";
import { desktopService } from "@/features/desktop/desktop-service";
import { maintenanceService } from "@/features/backup/maintenance-service";
import { initializeDatabase } from "@/db/client";
import { preferencesRepository } from "@/features/preferences/preferences-repository";
import { notificationService } from "@/features/desktop/notification-service";

export function App() {
  useEffect(() => {
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
        console.warn("Desktop initialization failed:", error);
      });

    const checkBackgroundNotifications = async () => {
      await availabilityMonitor.checkAll();
      const preferences = await preferencesRepository.getPreferences();
      if (!preferences.notificationsEnabled) return;
      const entries = await calendarService.build();
      await notificationService.notifyDue(entries, preferences);
    };

    void initializeDatabase()
      .then(async () => {
        const check = await maintenanceService.quickCheck();

        if (!check.healthy) {
          window.localStorage.setItem("cinetrack.maintenance-error", check.detail);
        } else {
          await maintenanceService.createAutomaticBackup();
        }

        await checkBackgroundNotifications();
      })
      .catch((error: unknown) => {
        console.warn("Database initialization fallback engaged:", error);
      });

    const interval = window.setInterval(
      () => {
        void checkBackgroundNotifications().catch((error: unknown) => {
          console.warn("Background notification check failed:", error);
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        buster: "cinetrack-v2",
      }}
    >
      <ThemeController />

      <TokenGate>
        <AppRouter />
        <CommandPalette />
        <OfflineIndicator />
      </TokenGate>

      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" /> : null}
    </PersistQueryClientProvider>
  );
}
