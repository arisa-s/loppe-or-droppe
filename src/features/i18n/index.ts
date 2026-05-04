import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import en from "./en.json";
import ja from "./ja.json";

export const supportedLanguages = ["en", "ja"] as const;
export type AppLanguage = (typeof supportedLanguages)[number];

function resolveDeviceLanguage(): AppLanguage {
  const tag = Localization.getLocales()[0]?.languageTag ?? "en";
  return tag.toLowerCase().startsWith("ja") ? "ja" : "en";
}

const resources = {
  en: { translation: en },
  ja: { translation: ja },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveDeviceLanguage(),
  fallbackLng: "en",
  supportedLngs: [...supportedLanguages],
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
  react: {
    useSuspense: false,
  },
});

export function setAppLanguage(lang: AppLanguage): Promise<void> {
  return i18n.changeLanguage(lang).then(() => undefined);
}

export { i18n };
