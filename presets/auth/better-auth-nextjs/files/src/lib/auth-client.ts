import { createAuthClient } from "better-auth/react";

// Create the auth client
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

// Export commonly used hooks and functions
export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
} = authClient;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Session = {
  user: AuthUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
};

/**
 * Get the current session on the server side
 * Use in Server Components and Server Actions
 */
export async function getServerSession(): Promise<Session | null> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("better-auth.session_token");

  if (!sessionToken?.value) {
    return null;
  }

  try {
    const authUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
    const response = await fetch(`${authUrl}/api/auth/session`, {
      headers: {
        cookie: `better-auth.session_token=${sessionToken.value}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

/**
 * Require authentication - throws if not authenticated
 * Use in Server Components and Server Actions
 */
export async function requireAuth(): Promise<AuthUser> {
  const session = await getServerSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session.user;
}
