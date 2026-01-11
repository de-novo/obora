/**
 * @repo/database - Shared database package
 *
 * This package provides shared database configuration, schema definitions,
 * and query utilities for all apps in the monorepo.
 *
 * Usage:
 *   import { db } from "@repo/database";
 *   import { users } from "@repo/database/schema";
 *
 * Note: Add a database preset (drizzle or prisma) to enable full functionality.
 */

// Re-export schema
export * from "./schema";

// Database client will be added by the database preset
// export { db } from "./client";
