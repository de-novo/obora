export const locales = ["en", "ko", "ja", "zh"] as const;

export const defaultLocale = "en";

export type Locale = (typeof locales)[number];
