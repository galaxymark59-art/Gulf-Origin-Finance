import { createContext, useContext } from "react";
import type { Language } from "./domain";
export const LanguageContext = createContext<Language>("en");
export const useText = () => {
  const language = useContext(LanguageContext);
  return (en: string, ar: string) => (language === "ar" ? ar : en);
};
