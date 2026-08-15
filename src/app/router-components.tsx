import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { logger } from "@/features/diagnostics/logger";

export function RootLayout() {
  return <AppShell />;
}

export function PendingComponent() {
  const { t } = useTranslation();
  return <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>;
}

export function ErrorComponent({ error }: ErrorComponentProps) {
  const { t } = useTranslation();

  useEffect(() => {
    logger.error(`Route error: ${error.message}`);
  }, [error]);

  return (
    <div className="surface rounded-shell p-6">
      <h2 className="text-xl font-semibold">{t("common.somethingWentWrong")}</h2>

      <p className="mt-3 text-sm text-muted-foreground">{t("errors.unexpectedDescription")}</p>
    </div>
  );
}
