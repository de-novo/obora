import createIntlMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "./src/lib/i18n";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
});

export default function middleware(request: Request) {
  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
