import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

const storedLanguage = typeof window === "undefined" ? null : window.localStorage.getItem("cinetrack.language");
const browserLanguage = typeof navigator === "undefined" ? "fr" : navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: storedLanguage === "en" || storedLanguage === "fr" ? storedLanguage : browserLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  if (typeof window !== "undefined" && (language === "fr" || language === "en")) {
    window.localStorage.setItem("cinetrack.language", language);
  }
});

export default i18n;
