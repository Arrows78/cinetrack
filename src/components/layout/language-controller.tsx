import { useEffect, useRef } from "react";
import i18n from "@/i18n";
import { usePreferences } from "@/features/preferences/use-preferences";
import { defaultPreferences } from "@/shared/constants/preferences-schema";
import { errorMessage } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

const isSupportedLanguage = (value: string): value is "en" | "fr" => value === "en" || value === "fr";

/**
 * Keeps the interface language and the `language` preference — which also
 * decides the catalogue (TMDB) language — from drifting apart. The interface
 * language is detected before any preference is readable (see i18n/index.ts),
 * so on its own it never learns about a language restored from a backup or
 * pulled from another device.
 *
 * - Mid-session, the preference always wins: Settings, a sync pull and a
 *   restore all end up here.
 * - On the first read of a session, an explicit non-default preference wins
 *   too. The default ("en") is ambiguous — it is what nobody ever chose — so
 *   there the detected interface language is kept and recorded as the
 *   preference, instead of flipping a French system to English.
 */
export function LanguageController() {
  const { data: preferences, updatePreference } = usePreferences();
  const language = preferences?.language;
  const firstRead = useRef(true);

  useEffect(() => {
    if (!language) return;
    const isFirstRead = firstRead.current;
    firstRead.current = false;
    if (i18n.language === language) return;

    if (isFirstRead && language === defaultPreferences.language && isSupportedLanguage(i18n.language)) {
      updatePreference({ key: "language", value: i18n.language }).catch((error: unknown) =>
        logger.warn(`Couldn't record the interface language as a preference: ${errorMessage(error)}`)
      );
      return;
    }

    i18n
      .changeLanguage(language)
      .catch((error: unknown) => logger.warn(`Couldn't switch the interface language: ${errorMessage(error)}`));
  }, [language, updatePreference]);

  return null;
}
