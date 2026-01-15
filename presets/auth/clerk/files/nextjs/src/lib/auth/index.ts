import { auth, currentUser } from "@clerk/nextjs/server";

export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
};

/**
 * Get the current authenticated user from Clerk
 * Use in Server Components and Server Actions
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const user = await currentUser();

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
  };
}

/**
 * Get the current auth session
 * Use in Server Components and Server Actions
 */
export async function getAuth() {
  return auth();
}

/**
 * Require authentication - throws redirect if not authenticated
 * Use in Server Components and Server Actions
 */
export async function requireAuth() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return userId;
}
