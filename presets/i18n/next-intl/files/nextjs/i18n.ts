import { getRequestConfig } from "next-intl/server";
import { defaultLocale, locales } from "./src/lib/i18n";

const supportedLocales = new Set(locales);

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = supportedLocales.has(
    locale as (typeof locales)[number],
  )
    ? locale
    : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default,
  };
});
