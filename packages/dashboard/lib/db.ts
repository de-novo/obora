/**
 * Dashboard Database Connection
 * Manages connection to ~/.obora/dashboard.db using Drizzle ORM
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import * as schema from "./schema";

// ============================================================================
// Constants
// ============================================================================

const OBORA_DIR = ".obora";
const DASHBOARD_DB = "dashboard.db";

// ============================================================================
// Singleton State
// ============================================================================

let sqliteInstance: DatabaseType | null = null;
let drizzleInstance: BetterSQLite3Database<typeof schema> | null = null;
let currentMode: "readonly" | "readwrite" = "readwrite";

// ============================================================================
// Path Helper
// ============================================================================

/**
 * Get the path to the dashboard database file
 * @returns Absolute path to ~/.obora/dashboard.db
 */
export function getDashboardDbPath(): string {
  return join(homedir(), OBORA_DIR, DASHBOARD_DB);
}

// ============================================================================
// Database Connection
// ============================================================================

/**
 * Get Drizzle database instance (singleton)
 *
 * Opens the dashboard.db file with the specified mode.
 * If a connection already exists with a different mode, it will be closed and reopened.
 *
 * @param options - Connection options
 * @param options.readonly - Open in read-only mode (default: false)
 * @returns Drizzle database instance or null if file doesn't exist
 *
 * @example
 * ```typescript
 * // Read-write connection (default)
 * const db = getDb();
 * if (db) {
 *   const projects = await db.select().from(schema.projects);
 * }
 *
 * // Read-only connection
 * const readOnlyDb = getDb({ readonly: true });
 * ```
 */
export function getDb(options: { readonly?: boolean } = {}): BetterSQLite3Database<typeof schema> | null {
  const readonly = options.readonly ?? false;
  const targetMode = readonly ? "readonly" : "readwrite";
  const dbPath = getDashboardDbPath();

  // Check if database file exists
  if (!existsSync(dbPath)) {
    return null;
  }

  // If we have an existing connection but need to change mode
  if (sqliteInstance && currentMode !== targetMode) {
    sqliteInstance.close();
    sqliteInstance = null;
    drizzleInstance = null;
  }

  // Return existing connection if compatible
  if (drizzleInstance) {
    return drizzleInstance;
  }

  // Create new connection
  try {
    sqliteInstance = new Database(dbPath, {
      readonly,
      fileMustExist: true,
    });

    // Enable WAL mode for better performance (only for read-write mode)
    if (!readonly) {
      sqliteInstance.pragma("journal_mode = WAL");
    }

    drizzleInstance = drizzle(sqliteInstance, { schema });
    currentMode = targetMode;
    return drizzleInstance;
  } catch (error) {
    console.error("Failed to open dashboard database:", error);
    return null;
  }
}

/**
 * Get raw SQLite connection (for advanced use cases)
 */
export function getRawDb(): DatabaseType | null {
  return sqliteInstance;
}

/**
 * Close the database connection
 * Safely closes the singleton connection if it exists
 */
export function closeDb(): void {
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch (error) {
      console.error("Failed to close dashboard database:", error);
    } finally {
      sqliteInstance = null;
      drizzleInstance = null;
    }
  }
}

// ============================================================================
// Type Exports
// ============================================================================

export type { DatabaseType };
export type DrizzleDb = BetterSQLite3Database<typeof schema>;
