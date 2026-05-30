import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import koCommon from "./locales/ko/common.json";

export const SUPPORTED_LANGS = ["en", "ko"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    defaultNS: "common",
    ns: ["common"],
    resources: {
      en: { common: enCommon },
      ko: { common: koCommon },
    },
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "sorack-lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
