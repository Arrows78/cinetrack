import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";
import { logger } from "@/shared/lib/logger";
import { errorMessage } from "@/shared/lib/errors";

interface RemoteErrorStateProps {
  error: unknown;
  onRetry: () => void;
}

export function RemoteErrorState({ error, onRetry }: RemoteErrorStateProps) {
  const { t } = useTranslation();
  const message = errorMessage(error);
  const authenticationError = /TMDB\s+(401|403)|token/i.test(message);
  const localDatabaseError = /sql\.(execute|select|load|close) not allowed|plugin:sql|sqlite|database/i.test(message);

  useEffect(() => {
    if (message) logger.error(`Remote error state: ${message}`);
  }, [message]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title={localDatabaseError ? t("errors.localDataUnavailable") : t("errors.catalogUnavailable")}
      description={
        localDatabaseError
          ? t("errors.localDatabase")
          : authenticationError
            ? t("errors.tmdbAuthentication")
            : t("errors.tmdbConnection")
      }
      action={
        <div className="space-y-3 text-center">
          <Button type="button" variant="outline" onClick={onRetry}>
            <RotateCcw className="mr-2 size-4" />
            {t("errors.retry")}
          </Button>
          {message ? (
            <details className="max-w-xl text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer text-center">{t("errors.technicalDetails")}</summary>
              <p className="mt-2 break-words rounded-xl border border-border bg-card p-3 font-mono">
                {t("errors.technicalDetailsLogged")}
              </p>
            </details>
          ) : null}
        </div>
      }
    />
  );
}
