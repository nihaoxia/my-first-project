export type SupportedTargetLanguage = "中文" | "英文" | "日文" | "韩文" | "俄语" | "德语" | "西班牙语" | "法语";

export type TranslationStyle = "natural-novel";

export const DEFAULT_WEB_LOOKUP_ENABLED = true;
export const DEFAULT_TRANSLATION_STYLE: TranslationStyle = "natural-novel";

const supportedTargetLanguages: SupportedTargetLanguage[] = [
  "中文",
  "英文",
  "日文",
  "韩文",
  "俄语",
  "德语",
  "西班牙语",
  "法语",
];

export function getSupportedTargetLanguages() {
  return [...supportedTargetLanguages];
}

export function isSupportedTargetLanguage(language: string): language is SupportedTargetLanguage {
  return supportedTargetLanguages.includes(language as SupportedTargetLanguage);
}

export function getDefaultTargetLanguage(sourceLanguage: string): SupportedTargetLanguage {
  return sourceLanguage === "英文" ? "中文" : "英文";
}
