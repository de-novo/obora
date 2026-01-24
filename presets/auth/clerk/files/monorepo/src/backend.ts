import { createClerkClient, verifyToken } from "@clerk/backend";
import type { AuthUser, AuthSession } from "./types";

export const clerk = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * Verify a Clerk session token
 */
export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });

    return {
      userId: payload.sub,
      sessionId: payload.sid ?? null,
      orgId: payload.org_id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Get user by ID from Clerk
 */
export async function getUserById(userId: string): Promise<AuthUser | null> {
  try {
    const user = await clerk.users.getUser(userId);

    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Get user by email from Clerk
 */
export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  try {
    const users = await clerk.users.getUserList({
      emailAddress: [email],
    });

    const user = users.data[0];
    if (!user) return null;

    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
    };
  } catch {
    return null;
  }
}
