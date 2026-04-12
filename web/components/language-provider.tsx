"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLanguage,
  languageStorageKey,
  languageStorageVersion,
  languageStorageVersionKey,
  supportedLanguages,
  translate,
  type SupportedLanguage,
  type TranslationKey,
} from "@/lib/i18n";

type LanguageContextValue = {
  language: SupportedLanguage;
  switchLanguage: (nextLanguage: SupportedLanguage) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<SupportedLanguage>(defaultLanguage);

  useEffect(() => {
    const savedVersion = window.localStorage.getItem(languageStorageVersionKey);

    if (savedVersion !== languageStorageVersion) {
      window.localStorage.removeItem(languageStorageKey);
      window.localStorage.setItem(languageStorageVersionKey, languageStorageVersion);
      document.documentElement.lang = defaultLanguage;
      return;
    }

    const savedLanguage = window.localStorage.getItem(
      languageStorageKey,
    ) as SupportedLanguage | null;

    if (savedLanguage && supportedLanguages.includes(savedLanguage)) {
      setLanguage(savedLanguage);
      document.documentElement.lang = savedLanguage;
      return;
    }

    document.documentElement.lang = defaultLanguage;
  }, []);

  function switchLanguage(nextLanguage: SupportedLanguage) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(languageStorageKey, nextLanguage);
    window.localStorage.setItem(languageStorageVersionKey, languageStorageVersion);
    document.documentElement.lang = nextLanguage;
  }

  const value = useMemo(
    () => ({
      language,
      switchLanguage,
      t: (key: TranslationKey) => translate(language, key),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }

  return context;
}
