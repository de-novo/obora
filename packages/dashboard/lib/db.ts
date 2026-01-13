/**
 * Dashboard Database Connection
 * Manages connection to ~/.obora/dashboard.db
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

// ============================================================================
// Constants
// ============================================================================

const OBORA_DIR = ".obora";
const DASHBOARD_DB = "dashboard.db";

// ============================================================================
// Singleton State
// ============================================================================

let dbInstance: DatabaseType | null = null;
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
 * Get database connection (singleton)
 *
 * Opens the dashboard.db file with the specified mode.
 * If a connection already exists with a different mode, it will be closed and reopened.
 *
 * @param options - Connection options
 * @param options.readonly - Open in read-only mode (default: false)
 * @returns Database instance or null if file doesn't exist
 *
 * @example
 * ```typescript
 * // Read-write connection (default)
 * const db = getDb();
 *
 * // Read-only connection
 * const readOnlyDb = getDb({ readonly: true });
 * ```
 */
export function getDb(options: { readonly?: boolean } = {}): DatabaseType | null {
  const readonly = options.readonly ?? false;
  const targetMode = readonly ? "readonly" : "readwrite";
  const dbPath = getDashboardDbPath();

  // Check if database file exists
  if (!existsSync(dbPath)) {
    return null;
  }

  // If we have an existing connection but need to change mode
  if (dbInstance && currentMode !== targetMode) {
    dbInstance.close();
    dbInstance = null;
  }

  // Return existing connection if compatible
  if (dbInstance) {
    return dbInstance;
  }

  // Create new connection
  try {
    dbInstance = new Database(dbPath, {
      readonly,
      fileMustExist: true,
    });

    // Enable WAL mode for better-sqlite3 performance (only for read-write mode)
    if (!readonly) {
      dbInstance.pragma("journal_mode = WAL");
    }

    currentMode = targetMode;
    return dbInstance;
  } catch (error) {
    console.error("Failed to open dashboard database:", error);
    return null;
  }
}

/**
 * Close the database connection
 * Safely closes the singleton connection if it exists
 */
export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (error) {
      console.error("Failed to close dashboard database:", error);
    } finally {
      dbInstance = null;
    }
  }
}

// ============================================================================
// Type Exports
// ============================================================================

export type { DatabaseType };
