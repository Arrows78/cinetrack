import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

const storedLanguage = typeof window === "undefined" ? null : window.localStorage.getItem("cinetrack.language");
const browserLanguage =
  typeof navigator === "undefined" ? "fr" : navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
const initialLanguage = storedLanguage === "en" || storedLanguage === "fr" ? storedLanguage : browserLanguage;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
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
