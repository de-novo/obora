/**
 * Centralized database package for monorepo
 *
 * Usage in other packages:
 * ```typescript
 * import { db, schema } from "@yourorg/database";
 *
 * const users = await db.select().from(schema.users);
 * ```
 */

export { db } from "./client.js";
export * as schema from "./schema.js";
export type { Database } from "./client.js";
