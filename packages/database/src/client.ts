/**
 * Drizzle Database Client
 * Shared database connection for the monorepo
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DatabaseConfig {
  /** Database file path (default: DATABASE_URL env or ./data/db.sqlite) */
  url?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

// ============================================================================
// Singleton
// ============================================================================

let sqliteInstance: DatabaseType | null = null;
let drizzleInstance: DrizzleDb | null = null;

// ============================================================================
// Database Client
// ============================================================================

/**
 * Get database connection
 *
 * @example
 * ```typescript
 * import { getDb } from "@obora/database/client";
 * import { users } from "@obora/database/schema";
 *
 * const db = getDb();
 * const allUsers = db.select().from(users).all();
 * ```
 */
export function getDb(config?: DatabaseConfig): DrizzleDb {
  if (drizzleInstance) return drizzleInstance;

  const dbUrl =
    config?.url || process.env.DATABASE_URL || "file:./data/db.sqlite";
  const dbPath = dbUrl.startsWith("file:") ? dbUrl.slice(5) : dbUrl;

  sqliteInstance = new Database(dbPath, {
    verbose: config?.verbose ? console.log : undefined,
  });

  // Enable WAL mode for better concurrency
  sqliteInstance.pragma("journal_mode = WAL");

  drizzleInstance = drizzle(sqliteInstance, { schema });

  return drizzleInstance;
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    drizzleInstance = null;
  }
}

/**
 * Get raw SQLite instance (for advanced usage)
 */
export function getSqlite(): DatabaseType | null {
  return sqliteInstance;
}

// ============================================================================
// Default Export
// ============================================================================

/** Default database instance */
export const db = getDb();
