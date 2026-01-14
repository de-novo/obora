/**
 * Drizzle Database Client
 * Shared database connection for obora dashboard
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import * as schema from "./schema.js";

// ============================================================================
// Types
// ============================================================================

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DatabaseConfig {
  /** Database file path (default: ~/.obora/dashboard.db) */
  url?: string;
  /** Open in read-only mode */
  readonly?: boolean;
  /** Enable verbose logging */
  verbose?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const OBORA_DIR = ".obora";
const DASHBOARD_DB = "dashboard.db";

// ============================================================================
// Singleton
// ============================================================================

let sqliteInstance: DatabaseType | null = null;
let drizzleInstance: DrizzleDb | null = null;
let currentMode: "readonly" | "readwrite" = "readwrite";

// ============================================================================
// Path Helper
// ============================================================================

/**
 * Get the default path to the dashboard database file
 * @returns Absolute path to ~/.obora/dashboard.db
 */
export function getDefaultDbPath(): string {
  return join(homedir(), OBORA_DIR, DASHBOARD_DB);
}

// ============================================================================
// Database Client
// ============================================================================

/**
 * Get database connection
 *
 * @example
 * ```typescript
 * import { getDb, projects } from "@obora/database";
 *
 * const db = getDb();
 * if (db) {
 *   const allProjects = db.select().from(projects).all();
 * }
 * ```
 */
export function getDb(config?: DatabaseConfig): DrizzleDb | null {
  const readonly = config?.readonly ?? false;
  const targetMode = readonly ? "readonly" : "readwrite";
  const dbPath = config?.url || process.env.DATABASE_URL || getDefaultDbPath();
  const resolvedPath = dbPath.startsWith("file:") ? dbPath.slice(5) : dbPath;

  // Check if database file exists
  if (!existsSync(resolvedPath)) {
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
    sqliteInstance = new Database(resolvedPath, {
      readonly,
      fileMustExist: true,
      verbose: config?.verbose ? console.log : undefined,
    });

    // Enable WAL mode for better concurrency (only for read-write mode)
    if (!readonly) {
      sqliteInstance.pragma("journal_mode = WAL");
    }

    drizzleInstance = drizzle(sqliteInstance, { schema });
    currentMode = targetMode;
    return drizzleInstance;
  } catch (error) {
    console.error("Failed to open database:", error);
    return null;
  }
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch (error) {
      console.error("Failed to close database:", error);
    } finally {
      sqliteInstance = null;
      drizzleInstance = null;
    }
  }
}

/**
 * Get raw SQLite instance (for advanced usage)
 */
export function getSqlite(): DatabaseType | null {
  return sqliteInstance;
}

// ============================================================================
// Type Exports
// ============================================================================

export type { DatabaseType };
