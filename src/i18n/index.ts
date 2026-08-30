import i18n, { type BackendModule, type ReadCallback } from "i18next";
import { initReactI18next } from "react-i18next";

const storedLanguage = typeof window === "undefined" ? null : window.localStorage.getItem("cinetrack.language");
const browserLanguage =
  typeof navigator === "undefined" ? "fr" : navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
const initialLanguage = storedLanguage === "en" || storedLanguage === "fr" ? storedLanguage : browserLanguage;

// Hand-rolled backend (rather than a static `resources: {en: {...}, fr:
// {...}}` object) — each locale is its own dynamically-imported chunk, so
// only the active language (and, if different, the "en" fallbackLng) is
// ever fetched, instead of always bundling and loading both up front.
// There's a single namespace ("translation", i18next's own default), so the
// namespace argument is unused — every locale file is that one namespace's
// whole resource bundle.
const dynamicImportBackend: BackendModule = {
  type: "backend",
  init: () => {},
  read: (language: string, _namespace: string, callback: ReadCallback) => {
    import(`./locales/${language}.json`)
      .then((localeModule: { default: object }) => callback(null, localeModule.default))
      .catch((error: unknown) => callback(error instanceof Error ? error : String(error), null));
  },
};

export const i18nReady = i18n
  .use(dynamicImportBackend)
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });

// Screen readers and other assistive tech rely on <html lang> to pick the
// right pronunciation/voice — it must track the app's actual language, not
// stay hardcoded to whatever index.html shipped with.
if (typeof document !== "undefined") {
  document.documentElement.lang = initialLanguage;
}

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined" && (language === "fr" || language === "en")) {
    window.localStorage.setItem("cinetrack.language", language);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
});

export default i18n;
