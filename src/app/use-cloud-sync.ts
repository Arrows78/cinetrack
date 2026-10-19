import { useContext, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AuthContext } from "@/features/auth/use-auth";
import { syncService } from "@/features/sync/sync-service";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { isTauriApp } from "@/shared/lib/platform";

/**
 * Runs cloud sync (periodic timer, wake-ups, realtime channel) for as long as
 * a user is signed in. Keyed by the signed-in user id rather than started once
 * at mount: signing in after launch (auth is optional by default) starts it
 * right away, and signing out — or switching account — tears the previous
 * run's listeners and realtime channel down.
 */
export function useCloudSync(): void {
  const queryClient = useQueryClient();
  // Read through the context directly (not useAuth) so a tree without an
  // AuthProvider simply has no signed-in user instead of throwing.
  const userId = useContext(AuthContext)?.user?.id ?? null;

  useEffect(() => {
    if (!isTauriApp() || !userId) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;

    void syncService
      .initialize(queryClient)
      .then((value) => {
        if (disposed) value?.();
        else cleanup = value;
      })
      .catch((error: unknown) => {
        logger.warn(`Cloud sync initialization failed: ${errorMessage(error)}`);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [queryClient, userId]);
}
