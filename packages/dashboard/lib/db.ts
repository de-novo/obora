/**
 * Dashboard Database Connection
 * Re-exports from @obora/database for local use
 */

export {
  getDb,
  closeDb,
  getSqlite,
  getDefaultDbPath,
  type DrizzleDb,
  type DatabaseConfig,
  type DatabaseType,
} from "@obora/database/client";

// Backwards compatibility alias
export { getDefaultDbPath as getDashboardDbPath } from "@obora/database/client";

// Re-export raw connection getter
export { getSqlite as getRawDb } from "@obora/database/client";
