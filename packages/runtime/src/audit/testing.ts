/**
 * Testing helpers for @obora/database
 *
 * @internal This module is intended for tests only and is not part of the public API surface.
 */

import { OboraDatabase } from "./duckdb-client.js";

let dbInstance: OboraDatabase | null = null;

/**
 * Get or create singleton database instance (test helper)
 */
export function getDatabase(dbPath?: string): OboraDatabase {
  if (!dbInstance) {
    dbInstance = new OboraDatabase(dbPath);
  }
  return dbInstance;
}

/**
 * Reset singleton database instance (test helper)
 */
export function resetDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (error) {
      // Log error but still reset instance
      console.error("Warning: Error closing database connection:", error);
    } finally {
      dbInstance = null;
    }
  }
}
