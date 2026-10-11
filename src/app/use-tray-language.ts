import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { desktopService } from "@/features/desktop/desktop-service";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

/** Keeps the native tray menu in the interface language (it cannot read the webview's translations). */
export function useTrayLanguage(): void {
  const { i18n } = useTranslation();
  const language = i18n.language;

  useEffect(() => {
    if (language !== "en" && language !== "fr") return;
    desktopService
      .updateTrayLanguage(language)
      .catch((error: unknown) => logger.warn(`Couldn't update the tray menu language: ${errorMessage(error)}`));
  }, [language]);
}
