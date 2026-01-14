/**
 * @obora/database
 * Shared Drizzle ORM database package
 *
 * @example
 * ```typescript
 * // Import everything
 * import { db, users, type User } from "@obora/database";
 *
 * // Or import specific modules
 * import { getDb, closeDb } from "@obora/database/client";
 * import { users, sessions } from "@obora/database/schema";
 * ```
 */

// Re-export schema
export * from "./schema.js";

// Re-export client
export * from "./client.js";

// Re-export drizzle utilities for convenience
export { eq, and, or, not, like, desc, asc, sql, inArray, isNull, isNotNull, between, gt, gte, lt, lte, count, sum, avg, min, max } from "drizzle-orm";
