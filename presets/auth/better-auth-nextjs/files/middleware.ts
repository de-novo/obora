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

  // Optionally validate session with the API
  // For performance, you might want to skip this for most requests
  // and only validate on sensitive routes
  try {
    const authUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    if (authUrl) {
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
    }
  } catch {
    // If validation fails, allow request but session might be invalid
    // The page will handle auth state appropriately
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
