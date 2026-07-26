import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient, queryPersister } from "@/app/query-client";
import { AppRouter } from "@/app/router";
import { CommandPalette } from "@/components/desktop/command-palette";
import { TokenGate } from "@/components/desktop/token-gate";
import { OfflineIndicator } from "@/components/layout/offline-indicator";
import { ThemeController } from "@/components/layout/theme-controller";
import { availabilityMonitor } from "@/services/availability-monitor";
import { desktopService } from "@/services/desktop-service";
import { maintenanceService } from "@/services/maintenance-service";
import { initializeDatabase } from "@/services/local/db";

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

    void initializeDatabase()
      .then(async () => {
        const check = await maintenanceService.quickCheck();

        if (!check.healthy) {
          window.localStorage.setItem(
            "cinetrack.maintenance-error",
            check.detail,
          );
        } else {
          await maintenanceService.createAutomaticBackup();
        }

        await availabilityMonitor.checkAll();
      })
      .catch((error: unknown) => {
        console.warn(
          "Database initialization fallback engaged:",
          error,
        );
      });

    const interval = window.setInterval(() => {
      void availabilityMonitor.checkAll();
    }, 1000 * 60 * 60 * 6);

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

      {import.meta.env.DEV ? (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      ) : null}
    </PersistQueryClientProvider>
  );
}
