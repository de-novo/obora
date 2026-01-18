import { NextResponse, type NextRequest } from "next/server";

const publicRoutes = ["/", "/sign-in", "/sign-up", "/api/webhooks"];

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get("better-auth.session_token");

  if (!sessionCookie?.value) {
    // Redirect to sign-in if no session
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Validate session with the API (fail-secure principle)
  const authUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;

  if (!authUrl) {
    // In development without auth URL configured, allow request with warning
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[middleware] NEXT_PUBLIC_BETTER_AUTH_URL not set. " +
          "Session validation skipped in development mode."
      );
      return NextResponse.next();
    }
    // In production, require proper configuration - fail secure
    console.error(
      "[middleware] NEXT_PUBLIC_BETTER_AUTH_URL is required in production."
    );
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("error", "configuration");
    return NextResponse.redirect(signInUrl);
  }

  try {
    const response = await fetch(`${authUrl}/api/auth/session`, {
      headers: {
        cookie: `better-auth.session_token=${sessionCookie.value}`,
      },
    });

    if (!response.ok) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }
  } catch (error) {
    // Fail-secure: on auth service error, deny access and log
    console.error(
      "[middleware] Session validation failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    signInUrl.searchParams.set("error", "auth_service");
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
